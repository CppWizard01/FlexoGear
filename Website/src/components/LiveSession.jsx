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

// BLE Constants (Public Identifiers)
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

// Helper: Convert Quaternion to Euler Angles (Pitch/Yaw)
const quaternionToEuler = (i, j, k, real) => {
  const sinp = -2.0 * (i * k - j * real);
  let pitch =
    Math.abs(sinp) >= 1 ? (Math.PI / 2) * Math.sign(sinp) : Math.asin(sinp);
  const siny_cosp = 2.0 * (i * j + k * real);
  const cosy_cosp = 1.0 - 2.0 * (j * j + k * k);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);
  return { pitch: pitch * (180 / Math.PI), yaw: yaw * (180 / Math.PI) };
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
      const characteristic = await service.getCharacteristic(
        CHARACTERISTIC_UUID
      );
      setConnectionStatus("Connected");
      await characteristic.startNotifications();
      characteristic.addEventListener("characteristicvaluechanged", (event) => {
        const value = event.target.value;
        const decoder = new TextDecoder("utf-8");
        const dataString = decoder.decode(value);
        if (dataString.split(",").length === 4) {
          const [i, j, k, real] = dataString.split(",").map(parseFloat);
          if (![i, j, k, real].some(isNaN)) {
            // Check if any value is NaN
            setLiveAngles(quaternionToEuler(i, j, k, real));
          }
        }
      });
    } catch (error) {
      console.error("Bluetooth connection failed:", error); // Keep error log
      setConnectionStatus("Disconnected");
      alert("Failed to connect.");
    }
  };

  // --- Guided Rep Counting ---
  useEffect(() => {
    if (!isSessionActive || !selectedPrescription) return;

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

    // Track max angles
    const { pitch, yaw } = liveAngles;
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

    // Rep Detection (Flexion Example)
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
          handleStopSession(); // Auto-stop and save
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

  // --- Session Control ---
  const handleStartSession = () => {
    if (connectionStatus === "Connected" && selectedPrescription) {
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

  const handleStopSession = async () => {
    const wasActive = isSessionActive; // Check if session was running before stopping
    const wasAutoCompleted = currentStepText === "Exercise Complete!";
    if (!wasActive && !wasAutoCompleted) return;

    setIsSessionActive(false); // Stop session state first
    const finalStepText = wasAutoCompleted
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
            maxFlex: Math.round(maxValues.flex),
            maxExt: Math.round(maxValues.ext),
            maxRad: Math.round(maxValues.rad),
            maxUln: Math.round(maxValues.uln),
            timestamp: serverTimestamp(),
          });
          if (wasActive && !wasAutoCompleted)
            alert("Session stopped and saved!"); // Only alert on manual stop
          else if (wasAutoCompleted) alert("Exercise complete and saved!");
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
    // Keep finalStepText briefly? Or reset immediately? Resetting:
    // setCurrentStepText("Ready to Start"); // Re-enable if immediate reset desired
  };

  // Gauge calculations
  const pitchGaugePercentage = ((liveAngles.pitch + 90) / 180) * 100;
  const yawGaugePercentage = ((liveAngles.yaw + 90) / 180) * 100;

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
            {Math.round(liveAngles.pitch)}°
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
            {Math.round(liveAngles.yaw)}°
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
            setCurrentStepText("Ready to Start");
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
            disabled={isSessionActive || !selectedPrescription}
          >
            Start
          </button>
          <button
            id="stopExerciseBtn"
            onClick={handleStopSession}
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
