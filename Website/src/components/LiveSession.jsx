import React, { useState, useEffect, useRef } from "react";
import {
  addDoc,
  collection,
  getDocs,
  query,
  onSnapshot,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase"; // Correct path

// BLE Constants (Matching your ESP32 definitions)
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"; // TX (ESP32 to App - NOTIFY)
const COMMAND_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a9"; // RX (App to ESP32 - WRITE)

// Helper: Convert Quaternion to Euler Angles (Pitch/Yaw)
const quaternionToEuler = (i, j, k, real) => {
  const sinr_cosp = 2.0 * (i * real + k * j);
  const cosr_cosp = 1.0 - 2.0 * (j * j + i * i);
  const pitch = Math.atan2(sinr_cosp, cosr_cosp);
  // const sinp = -2.0 * (i * k - j * real);
  // let pitch =
  //   Math.abs(sinp) >= 1 ? (Math.PI / 2) * Math.sign(sinp) : Math.asin(sinp);
  const siny_cosp = 2.0 * (i * j + k * real);
  const cosy_cosp = 1.0 - 2.0 * (j * j + k * k);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);
  return { pitch: -1*pitch * (180 / Math.PI), yaw: yaw * (180 / Math.PI) };
};

function LiveSession() {
  // --- Component State ---
  const [connectionStatus, setConnectionStatus] = useState("Disconnected");
  const [liveAngles, setLiveAngles] = useState({ pitch: 0, yaw: 0 });
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [prescriptions, setPrescriptions] = useState([]);
  const [selectedPrescription, setSelectedPrescription] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [currentStepText, setCurrentStepText] = useState("Ready to Start");
  const [repsInSet, setRepsInSet] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [exerciseProgress, setExerciseProgress] = useState(0);
  const [maxValues, setMaxValues] = useState({
    flex: 0,
    ext: 0,
    rad: 0,
    uln: 0,
  });
  const repPhaseRef = useRef("start");

  // --- Calibration state ---
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [calibrationOffsets, setCalibrationOffsets] = useState({
    pitch: 0,
    yaw: 0,
  });
  const isCalibratingRef = useRef(false);
  useEffect(() => {
    isCalibratingRef.current = isCalibrating;
  }, [isCalibrating]);
  // Ref to store the "write" characteristic
  const commandCharacteristicRef = useRef(null);

  // State to hold the values of the three text boxes
  const [anglePreset1, setAnglePreset1] = useState("0");
  const [anglePreset2, setAnglePreset2] = useState("0");
  const [anglePreset3, setAnglePreset3] = useState("0");

  // --- Fetch Prescriptions (Real-Time) ---
  useEffect(() => {
    let unsubscribe = () => {};
    const user = auth.currentUser;
    if (user) {
      const prescriptionsRef = collection(
        db,
        "users01",
        user.uid,
        "prescriptions"
      );
      const q = query(prescriptionsRef, orderBy("exerciseName", "asc"));
      unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const fetchedPrescriptions = [];
          querySnapshot.forEach((doc) =>
            fetchedPrescriptions.push({ id: doc.id, ...doc.data() })
          );
          setPrescriptions(fetchedPrescriptions);
        },
        (error) => {
          console.error("Error fetching prescriptions:", error);
        }
      );
    } else {
      setPrescriptions([]);
    }
    return () => unsubscribe(); // Cleanup listener
  }, []);

  // --- Web Bluetooth Connection ---
  const handleConnect = async () => {
    try {
      setConnectionStatus("Connecting...");
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: "FlexoGear" }],
        optionalServices: [SERVICE_UUID],
      });
      setConnectionStatus("Pairing...");
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);

      // 1. Get the NOTIFY characteristic (for receiving angle data)
      const characteristic = await service.getCharacteristic(
        CHARACTERISTIC_UUID
      );

      // 2. Get the WRITE characteristic (for sending angle commands)
      const commandCharacteristic = await service.getCharacteristic(
        COMMAND_CHARACTERISTIC_UUID
      );
      commandCharacteristicRef.current = commandCharacteristic; // Store it in the ref

      setConnectionStatus("Connected");
      await characteristic.startNotifications();
      characteristic.addEventListener("characteristicvaluechanged", (event) => {
        const value = event.target.value;
        const decoder = new TextDecoder("utf-8");
        const dataString = decoder.decode(value);
        if (dataString.split(",").length === 4) {
          const [i, j, k, real] = dataString.split(",").map(parseFloat);
          if (![i, j, k, real].some(isNaN)) {
            const angles = quaternionToEuler(i, j, k, real);
            // update live angles
            setLiveAngles(angles);
            // while in calibration mode, continuously update offsets so UI reads ~0 while user aligns
            if (isCalibratingRef.current) {
              setCalibrationOffsets({ pitch: angles.pitch, yaw: angles.yaw });
            }
          }
        }
      });

      // Immediately prompt user to calibrate after connecting
      setIsCalibrating(true);
      setIsCalibrated(false);
      setCurrentStepText("Keep your hand straight (see image) and press Calibrate");
    } catch (error) {
      console.error("Bluetooth connection failed:", error); // Keep error log
      setConnectionStatus("Disconnected");
      commandCharacteristicRef.current = null; // Clear ref on failure
      alert("Failed to connect. Make sure the device is on and in range.");
    }
  };

  // --- Guided Rep Counting ---
  useEffect(() => {
    if (!isSessionActive || !selectedPrescription) return;

    // Use angles relative to calibration offsets
    const adjustedAngles = {
      pitch: liveAngles.pitch - (calibrationOffsets.pitch || 0),
      yaw: liveAngles.yaw - (calibrationOffsets.yaw || 0),
    };

    // Progress calculation
    const totalRepsTarget =
      selectedPrescription.targetReps * selectedPrescription.targetSets;
    const completedRepsTotal =
      (currentSet - 1) * selectedPrescription.targetReps + repsInSet;
    setExerciseProgress(
      totalRepsTarget > 0
        ? Math.min((completedRepsTotal / totalRepsTarget) * 100, 100)
        : 0
    );

    // Track max angles (use adjusted angles)
    const { pitch, yaw } = adjustedAngles;
    setMaxValues((prev) => ({
      flex: Math.min(prev.flex, pitch),
      ext: Math.max(prev.ext, pitch),
      rad: Math.min(prev.rad, yaw),
      uln: Math.max(prev.uln, yaw),
    }));

    // State machine & instructions
    const instructions = selectedPrescription.instructions || [];
    const currentInstruction = instructions[currentStepIndex];
    let instructionTextToShow = isSessionActive
      ? instructions[currentStepIndex % instructions.length] || "..."
      : repsInSet > 0
      ? "Session Complete!"
      : "Ready to Start";
    setCurrentStepText(instructionTextToShow);

    // Rep Detection (Flexion Example) using adjusted pitch
    const FLEX_THRESHOLD = -35;
    const NEUTRAL_THRESHOLD = -10;
    if (
      currentInstruction === "Flex Down" &&
      pitch < FLEX_THRESHOLD &&
      repPhaseRef.current === "start"
    ) {
      repPhaseRef.current = "flexed";
      setCurrentStepIndex((prevIndex) => (prevIndex + 1) % instructions.length);
    } else if (
      currentInstruction === "Return to Center" &&
      pitch > NEUTRAL_THRESHOLD &&
      repPhaseRef.current === "flexed"
    ) {
      repPhaseRef.current = "start";
      const newRepCount = repsInSet + 1;
      setCurrentStepIndex(0);

      if (newRepCount >= selectedPrescription.targetReps) {
        const newSetCount = currentSet + 1;
        if (newSetCount > selectedPrescription.targetSets) {
          handleStopSession(true); // Auto-stop and save
        } else {
          setCurrentSet(newSetCount);
          setRepsInSet(0);
          setCurrentStepText(`Get Ready for Set ${newSetCount}`); // Intermediate message
        }
      } else {
        setRepsInSet(newRepCount);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveAngles, isSessionActive]); // Removed dependencies causing potential issues, handleStopSession called directly

  // --- Calibration handler ---
  const handleCalibrate = () => {
    // Confirm current calibrationOffsets as baseline
    setIsCalibrating(false);
    setIsCalibrated(true);
    setCurrentStepText("Calibrated — Ready to Start");
    alert("Calibration saved. You may now start the exercise.");
  };

  // --- Session Control ---
  const handleStartSession = () => {
    if (connectionStatus === "Connected" && selectedPrescription) {
      if (!isCalibrated) {
        alert("Please calibrate first (keep your hand straight and press Calibrate).");
        return;
      }
      setRepsInSet(0);
      setCurrentSet(1);
      setExerciseProgress(0);
      setCurrentStepIndex(0);
      setCurrentStepText(selectedPrescription.instructions[0] || "Begin");
      setMaxValues({ flex: 0, ext: 0, rad: 0, uln: 0 });
      repPhaseRef.current = "start";
      setIsSessionActive(true);
    } else {
      alert("Please connect and select an exercise prescription first!");
    }
  };

  const handleStopSession = async (autoCompleted = false) => {
    const wasActive = isSessionActive;
    if (!wasActive && !autoCompleted) return; // Don't run if already stopped manually

    setIsSessionActive(false); // Stop session state first
    const finalStepText = autoCompleted
      ? "Exercise Complete!"
      : "Session Stopped";
    setCurrentStepText(finalStepText);

    const totalCompletedReps =
      (currentSet - 1) * (selectedPrescription?.targetReps || 0) + repsInSet;

    if (totalCompletedReps > 0 && selectedPrescription) {
      const user = auth.currentUser;
      if (user) {
        const sessionsRef = collection(db, "users01", user.uid, "sessions");
        try {
          await addDoc(sessionsRef, {
            exerciseName: selectedPrescription.exerciseName,
            reps: totalCompletedReps,
            targetReps: selectedPrescription.targetReps,
            targetSets: selectedPrescription.targetSets,
            // save max values already relative to calibration
            maxFlex: Math.round(maxValues.flex),
            maxExt: Math.round(maxValues.ext),
            maxRad: Math.round(maxValues.rad),
            maxUln: Math.round(maxValues.uln),
            timestamp: serverTimestamp(),
          });
          if (wasActive && !autoCompleted)
            alert("Session stopped and saved!"); // Only alert on manual stop
          else if (autoCompleted) alert("Exercise complete and saved!");
        } catch (error) {
          console.error("Error saving session: ", error);
          alert("Failed to save session.");
        }
      }
    }
    // Reset state after saving/stopping attempt
    setSelectedPrescription(null);
    setRepsInSet(0);
    setCurrentSet(1);
    setExerciseProgress(0);
    setCurrentStepIndex(0);
  };

  // --- Handler for sending all three angle presets at once ---
  const handleSendAllAngles = async () => {
    if (!commandCharacteristicRef.current) {
      alert(
        "Device is not connected or command characteristic could not be found."
      );
      return;
    }

    try {
      const encoder = new TextEncoder();

      // 1. Create the object
      const commandObject = {
        a1: anglePreset1, // Value from the first text box
        a2: anglePreset2, // Value from the second text box
        a3: anglePreset3, // Value from the third text box
      };

      // 2. Convert the object to a JSON string
      // This will look like: {"a1":"45","a2":"0","a3":"-20"}
      const commandString = JSON.stringify(commandObject);

      // 3. Encode and send
      const data = encoder.encode(commandString);
      await commandCharacteristicRef.current.writeValue(data);

      console.log(`Sent command: ${commandString}`);
      alert(`Sent all angles: ${commandString}`);
    } catch (error) {
      console.error("Failed to send all angles command:", error);
      alert("Failed to send command.");
    }
  };

  // Gauge calculations (use adjusted angles relative to calibration)
  const adjustedAnglesForUI = {
    pitch: liveAngles.pitch - (calibrationOffsets.pitch || 0),
    yaw: liveAngles.yaw - (calibrationOffsets.yaw || 0),
  };
  const pitchGaugePercentage = ((adjustedAnglesForUI.pitch + 90) / 180) * 100;
  const yawGaugePercentage = ((adjustedAnglesForUI.yaw + 90) / 180) * 100;

  return (
    <section className="live-session">
      <h2>Live Session</h2>
      <button
        id="connectDeviceBtn"
        onClick={handleConnect}
        disabled={connectionStatus !== "Disconnected"}
      >
        {connectionStatus}
      </button>

      {/* Calibration prompt shown immediately after connection */}
      {isCalibrating && (
        <div className="calibration-panel">
          <h3>Calibration</h3>
          <p>Keep your hand straight as shown and press "Calibrate".</p>
          {/* Place an example image at public/images/hand_straight.png or change src */}
          <img
            src="/images/hand_straight.png"
            alt="Hand straight example"
            style={{ maxWidth: 220, display: "block", marginBottom: 8 }}
          />
          <button onClick={handleCalibrate}>Calibrate</button>
        </div>
      )}

      <div className="guidance-panel">
        <h3>Next Step:</h3>
        <p className="instruction-text">{currentStepText}</p>
      </div>
      <div className="progress-bar-container">
        <div
          className="progress-bar-fill"
          style={{ width: `${exerciseProgress}%` }}
        ></div>
        <div className="progress-bar-text">
          {Math.round(exerciseProgress)}% Complete
        </div>
      </div>

      <div className="gauge-grid">
        <div className="angle-gauge-container">
          <label>Flexion / Extension</label>
          <div className="angle-gauge">
            <div
              className="gauge-bar"
              style={{ width: `${pitchGaugePercentage}%` }}
            ></div>
            <div className="gauge-center-line"></div>
          </div>
          <div className="live-angle-display">
            {Math.round(adjustedAnglesForUI.pitch)}°
          </div>
        </div>
        <div className="angle-gauge-container">
          <label>Ulnar / Radial</label>
          <div className="angle-gauge">
            <div
              className="gauge-bar"
              style={{ width: `${yawGaugePercentage}%` }}
            ></div>
            <div className="gauge-center-line"></div>
          </div>
          <div className="live-angle-display">
            {Math.round(adjustedAnglesForUI.yaw)}°
          </div>
        </div>
      </div>

      <div className="session-stats">
        <div>
          <h4>Reps</h4>
          <p>
            {repsInSet} / {selectedPrescription?.targetReps || "N/A"}
          </p>
        </div>
        <div>
          <h4>Sets</h4>
          <p>
            {currentSet} / {selectedPrescription?.targetSets || "N/A"}
          </p>
        </div>
      </div>

      {/* --- Angle Set Controls (3 Inputs, 1 Button) --- */}
      <div className="angle-set-controls">
        <h3>Set Target Angles</h3>
        <p>Enter target angles (in degrees) and send all at once.</p>

        <div className="angle-preset-group">
          <label htmlFor="angle1">Angle 1:</label>
          <input
            type="number"
            id="angle1"
            className="angle-input"
            value={anglePreset1}
            onChange={(e) => setAnglePreset1(e.target.value)}
          />
        </div>

        <div className="angle-preset-group">
          <label htmlFor="angle2">Angle 2:</label>
          <input
            type="number"
            id="angle2"
            className="angle-input"
            value={anglePreset2}
            onChange={(e) => setAnglePreset2(e.target.value)}
          />
        </div>

        <div className="angle-preset-group">
          <label htmlFor="angle3">Angle 3:</label>
          <input
            type="number"
            id="angle3"
            className="angle-input"
            value={anglePreset3}
            onChange={(e) => setAnglePreset3(e.target.value)}
          />
        </div>

        {/* Single button to send all three */}
        <button
          className="send-all-angles-btn" // Added a class for styling
          onClick={handleSendAllAngles}
          disabled={connectionStatus !== "Connected"}
        >
          Send All Angles
        </button>
      </div>

      <div className="exercise-controls">
        <h3>Select Prescription:</h3>
        <select
          className="exercise-select"
          value={selectedPrescription ? selectedPrescription.id : ""}
          onChange={(e) => {
            const prescriptionId = e.target.value;
            const prescription = prescriptions.find(
              (p) => p.id === prescriptionId
            );
            setSelectedPrescription(prescription);
            if (isSessionActive) setIsSessionActive(false); // Stop active session if changing
            setCurrentStepText("Ready to Start"); // Reset text
            setRepsInSet(0);
            setCurrentSet(1);
            setExerciseProgress(0);
            setCurrentStepIndex(0);
            setMaxValues({ flex: 0, ext: 0, rad: 0, uln: 0 });
          }}
          disabled={isSessionActive}
        >
          <option value="" disabled>
            Choose an exercise
          </option>
          {prescriptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.exerciseName}
            </option>
          ))}
        </select>
        <div>
          <button
            id="startExerciseBtn"
            onClick={handleStartSession}
            disabled={isSessionActive || !selectedPrescription || !isCalibrated}
          >
            Start
          </button>
          <button
            id="stopExerciseBtn"
            onClick={() => handleStopSession(false)} // false = manual stop
            disabled={
              !isSessionActive && currentStepText !== "Exercise Complete!"
            }
          >
            Stop
          </button>
        </div>
      </div>
    </section>
  );
}

export default LiveSession;
