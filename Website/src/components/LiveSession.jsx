// Updated LiveSession.js with Automation Logic

import React, { useState, useEffect, useRef } from "react";
import {
  addDoc,
  collection,
  query,
  onSnapshot,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase";

// --- BLE CONSTANTS ---
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const COMMAND_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a9";

// --- AUTOMATION CONSTANTS ---
const MOTOR_POS_TOP = { a1: "0", a2: "180", a3: "180" };
const MOTOR_POS_BOTTOM = { a1: "180", a2: "0", a3: "0" };
const MOTOR_POS_CENTER = { a1: "90", a2: "90", a3: "90" };
const AUTOMATION_DELAY_MS = 2000; // 2-second gap

// --- MATH HELPERS (QUATERNION LOGIC) ---
const multiplyQuaternions = (q1, q2) => {
  const { w: w1, x: x1, y: y1, z: z1 } = q1;
  const { w: w2, x: x2, y: y2, z: z2 } = q2;
  return {
    w: w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    x: w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    y: w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    z: w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
  };
};

const conjugateQuaternion = (q) => {
  return { w: q.w, x: -q.x, y: -q.y, z: -q.z };
};

const quaternionToEuler = (q) => {
  const { x: i, y: j, z: k, w: real } = q;

  const sinr_cosp = 2.0 * (real * i + j * k);
  const cosr_cosp = 1.0 - 2.0 * (i * i + j * j);
  const pitchAngle = Math.atan2(sinr_cosp, cosr_cosp);

  const siny_cosp = 2.0 * (real * k + i * j);
  const cosy_cosp = 1.0 - 2.0 * (j * j + k * k);
  const yawAngle = Math.atan2(siny_cosp, cosy_cosp);

  return {
    pitch: -1 * pitchAngle * (180 / Math.PI),
    yaw: yawAngle * (180 / Math.PI),
  };
};

function LiveSession() {
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

  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [calibrationQuaternion, setCalibrationQuaternion] = useState(null);

  // Motor angle manual inputs
  const [anglePreset1, setAnglePreset1] = useState("90");
  const [anglePreset2, setAnglePreset2] = useState("90");
  const [anglePreset3, setAnglePreset3] = useState("90");

  // --- NEW AUTOMATION STATE ---
  const [isAutomating, setIsAutomating] = useState(false);
  const [automationStep, setAutomationStep] = useState(0); // 0:Top, 1:Center, 2:Bottom, 3:Center

  const repPhaseRef = useRef("start");
  const commandCharacteristicRef = useRef(null);
  const deviceRef = useRef(null);
  const rawQuaternionRef = useRef({ w: 1, x: 0, y: 0, z: 0 });
  const automationTimerRef = useRef(null); // Timer for automation loop

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
      unsubscribe = onSnapshot(q, (qs) => {
        const fetched = [];
        qs.forEach((doc) => fetched.push({ id: doc.id, ...doc.data() }));
        setPrescriptions(fetched);
      });
    }
    return () => unsubscribe();
  }, []);

  const handleConnect = async () => {
    try {
      setConnectionStatus("Connecting...");
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: "FlexoGear" }],
        optionalServices: [SERVICE_UUID],
      });

      deviceRef.current = device;
      device.addEventListener("gattserverdisconnected", onDisconnected);

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);

      const char = await service.getCharacteristic(CHARACTERISTIC_UUID);
      const commandChar = await service.getCharacteristic(
        COMMAND_CHARACTERISTIC_UUID
      );
      commandCharacteristicRef.current = commandChar;

      setConnectionStatus("Connected");
      await char.startNotifications();

      char.addEventListener("characteristicvaluechanged", (event) => {
        const value = event.target.value;
        const decoder = new TextDecoder("utf-8");
        const dataString = decoder.decode(value);

        if (dataString.split(",").length === 4) {
          const [x, y, z, w] = dataString.split(",").map(parseFloat);

          if (![x, y, z, w].some(isNaN)) {
            const currentQ = { w, x, y, z };
            rawQuaternionRef.current = currentQ;

            let displayQ = currentQ;
            if (calibrationQuaternion) {
              const calInverse = conjugateQuaternion(calibrationQuaternion);
              displayQ = multiplyQuaternions(calInverse, currentQ);
            }

            setLiveAngles(quaternionToEuler(displayQ));
          }
        }
      });

      setIsCalibrating(true);
      setIsCalibrated(false);
      setCurrentStepText("Hold hand straight & Press Calibrate");
    } catch (error) {
      console.error("Connection failed:", error);
      setConnectionStatus("Disconnected");
    }
  };

  const onDisconnected = () => {
    setConnectionStatus("Disconnected");
    setIsCalibrated(false);
    setCalibrationQuaternion(null);
    commandCharacteristicRef.current = null;
    deviceRef.current = null;
    setIsSessionActive(false);
    setIsAutomating(false); // Stop automation on disconnect
    clearTimeout(automationTimerRef.current);
  };

  const handleDisconnect = () => {
    if (deviceRef.current?.gatt?.connected) deviceRef.current.gatt.disconnect();
    else onDisconnected();
  };

  const handleCalibrate = () => {
    setCalibrationQuaternion(rawQuaternionRef.current);
    setIsCalibrating(false);
    setIsCalibrated(true);
    setCurrentStepText("Calibrated. Select an exercise.");
  };

  // --- HELPER to send motor commands ---
  const sendMotorCommand = async (positions) => {
    if (!commandCharacteristicRef.current) return;
    try {
      const encoder = new TextEncoder();
      // Use the structure {a1, a2, a3} from the constants
      const payload = JSON.stringify(positions);
      const data = encoder.encode(payload);
      await commandCharacteristicRef.current.writeValue(data);
    } catch (error) {
      console.error("Send failed", error);
    }
  };

  // --- MANUAL Motor Control Button ---
  const handleSendAllAngles = () => {
    sendMotorCommand({
      a1: anglePreset1,
      a2: anglePreset2,
      a3: anglePreset3,
    });
  };

  // --- EFFECT for IMU-based Rep Counting (Manual Mode) ---
  useEffect(() => {
    // If automating, this whole effect is skipped.
    if (!isSessionActive || !selectedPrescription || isAutomating) return;

    const { pitch, yaw } = liveAngles;

    // Update progress bar
    const totalRepsTarget =
      selectedPrescription.targetReps * selectedPrescription.targetSets;
    const completedRepsTotal =
      (currentSet - 1) * selectedPrescription.targetReps + repsInSet;
    setExerciseProgress(
      totalRepsTarget > 0
        ? Math.min((completedRepsTotal / totalRepsTarget) * 100, 100)
        : 0
    );

    // Update max range of motion
    setMaxValues((prev) => ({
      flex: Math.min(prev.flex, pitch),
      ext: Math.max(prev.ext, pitch),
      rad: Math.min(prev.rad, yaw),
      uln: Math.max(prev.uln, yaw),
    }));

    // Get instruction text from prescription
    const instructions = selectedPrescription.instructions || [];
    const currentInstr =
      instructions[currentStepIndex % instructions.length] || "Exercise";
    setCurrentStepText(currentInstr);

    // Rep counting logic based on IMU thresholds
    const FLEX_THRESHOLD = -30;
    const NEUTRAL_THRESHOLD = -10;

    if (
      currentInstr.includes("Flex") &&
      pitch < FLEX_THRESHOLD &&
      repPhaseRef.current === "start"
    ) {
      repPhaseRef.current = "flexed";
      setCurrentStepIndex((prev) => (prev + 1) % instructions.length);
    } else if (
      currentInstr.includes("Return") &&
      pitch > NEUTRAL_THRESHOLD &&
      repPhaseRef.current === "flexed"
    ) {
      repPhaseRef.current = "start";
      const newRep = repsInSet + 1;
      setCurrentStepIndex(0);

      if (newRep >= selectedPrescription.targetReps) {
        const newSet = currentSet + 1;
        if (newSet > selectedPrescription.targetSets) {
          handleStopSession(true); // Session complete
        } else {
          setCurrentSet(newSet);
          setRepsInSet(0);
          setCurrentStepText(`Rest. Get Ready for Set ${newSet}`);
          // TODO: Add a pause/rest timer here if needed
        }
      } else {
        setRepsInSet(newRep);
      }
    }
  }, [
    liveAngles,
    isSessionActive,
    isAutomating, // Dependency added
    repsInSet,
    currentSet,
    selectedPrescription,
    currentStepIndex,
  ]);

  // --- NEW EFFECT for Automation Loop ---
  useEffect(() => {
    // Only run if automation is active
    if (!isAutomating || !selectedPrescription) {
      return;
    }

    let command = null;
    let nextStep = 0;
    let instructionText = "";

    switch (automationStep) {
      case 0: // Go to Top
        command = MOTOR_POS_TOP;
        instructionText = "Moving to Top Position";
        nextStep = 1;
        break;
      case 1: // Go to Center (from Top)
        command = MOTOR_POS_CENTER;
        instructionText = "Returning to Center";
        nextStep = 2;
        break;
      case 2: // Go to Bottom
        command = MOTOR_POS_BOTTOM;
        instructionText = "Moving to Bottom Position";
        nextStep = 3;
        break;
      case 3: // Go to Center (from Bottom) -> This completes 1 rep
        command = MOTOR_POS_CENTER;
        instructionText = "Returning to Center (Rep Complete)";
        nextStep = 0; // Loop back to Top

        // --- Rep and Set Logic ---
        const newRep = repsInSet + 1;
        if (newRep >= selectedPrescription.targetReps) {
          const newSet = currentSet + 1;
          if (newSet > selectedPrescription.targetSets) {
            // Session complete!
            handleStopSession(true);
            return; // Stop the loop
          } else {
            // Start next set
            setCurrentSet(newSet);
            setRepsInSet(0);
            instructionText = `Rest. Get Ready for Set ${newSet}`;
          }
        } else {
          // Increment rep
          setRepsInSet(newRep);
        }
        break;
      default:
        break;
    }

    // Send the motor command
    if (command) {
      sendMotorCommand(command);
      setCurrentStepText(instructionText);
    }

    // Set timer for the next step
    automationTimerRef.current = setTimeout(() => {
      setAutomationStep(nextStep);
    }, AUTOMATION_DELAY_MS);

    // Update progress bar
    const totalRepsTarget =
      selectedPrescription.targetReps * selectedPrescription.targetSets;
    const completedRepsTotal =
      (currentSet - 1) * selectedPrescription.targetReps + repsInSet;
    setExerciseProgress(
      totalRepsTarget > 0
        ? Math.min((completedRepsTotal / totalRepsTarget) * 100, 100)
        : 0
    );

    // Cleanup function to clear timeout if component unmounts or state changes
    return () => clearTimeout(automationTimerRef.current);
  }, [
    isAutomating,
    automationStep,
    selectedPrescription,
    repsInSet,
    currentSet,
  ]);

  const handleStartSession = () => {
    if (!selectedPrescription) return alert("Select an exercise first.");
    if (!isCalibrated) return alert("Calibrate device first.");

    // Reset stats
    setRepsInSet(0);
    setCurrentSet(1);
    setExerciseProgress(0);
    setCurrentStepIndex(0);
    setMaxValues({ flex: 0, ext: 0, rad: 0, uln: 0 });
    repPhaseRef.current = "start";
    setIsSessionActive(true);

    // *** Check if automation should start ***
    if (selectedPrescription.exerciseName === "Wrist Waves") {
      setAutomationStep(0); // Start from the first step
      setIsAutomating(true); // This will trigger the automation useEffect
    } else {
      // Not an automated exercise, just run manual IMU tracking
      setIsAutomating(false);
    }
  };

  const handleStopSession = async (
    autoCompleted = false,
    isEmergency = false
  ) => {
    const wasActive = isSessionActive;

    // Stop all activity
    setIsSessionActive(false);
    setIsAutomating(false);
    clearTimeout(automationTimerRef.current);

    if (!isEmergency) {
      setCurrentStepText(
        autoCompleted ? "Session Complete!" : "Session Stopped."
      );
    }

    const totalCompletedReps =
      (currentSet - 1) * (selectedPrescription?.targetReps || 0) + repsInSet;

    // Save session data, but NOT on emergency stop
    if (
      wasActive &&
      totalCompletedReps > 0 &&
      selectedPrescription &&
      !isEmergency
    ) {
      const user = auth.currentUser;
      if (user) {
        try {
          await addDoc(collection(db, "users01", user.uid, "sessions"), {
            exerciseName: selectedPrescription.exerciseName,
            reps: totalCompletedReps,
            maxFlex: Math.round(maxValues.flex),
            maxExt: Math.round(maxValues.ext),
            maxRad: Math.round(maxValues.rad),
            maxUln: Math.round(maxValues.uln),
            timestamp: serverTimestamp(),
            wasAutomated: selectedPrescription.exerciseName === "Wrist Waves", // Track if automated
          });
        } catch (err) {
          console.error("Save failed", err);
        }
      }
    }
    // Reset reps even if not saved
    setRepsInSet(0);
  };

  // --- NEW Emergency Stop Button Handler ---
  const handleEmergencyStop = () => {
    // Stop session without saving
    handleStopSession(false, true);

    // Send motors to safe center position
    sendMotorCommand(MOTOR_POS_CENTER);

    setCurrentStepText("EMERGENCY STOP. Motors at center.");
  };

  // Calculate gauge percentages
  const pitchPct = Math.max(
    0,
    Math.min(100, ((liveAngles.pitch + 90) / 180) * 100)
  );
  const yawPct = Math.max(
    0,
    Math.min(100, ((liveAngles.yaw + 90) / 180) * 100)
  );

  return (
    <section className="live-session">
      <h2>Live Session</h2>

      {/* CONNECTION PANEL */}
      <div className="connection-controls">
        {connectionStatus === "Disconnected" ? (
          <button onClick={handleConnect} className="connect-btn">
            Connect Device
          </button>
        ) : (
          <button onClick={handleDisconnect} className="disconnect-btn">
            Disconnect
          </button>
        )}

        <div className="connection-status-badge">
          Status:{" "}
          <span
            style={{
              color:
                connectionStatus === "Connected"
                  ? "var(--status-success)"
                  : "inherit",
            }}
          >
            {connectionStatus}
          </span>
        </div>
      </div>

      {/* CALIBRATION PANEL */}
      {isCalibrating && connectionStatus === "Connected" && (
        <div
          style={{
            padding: "1rem",
            background: "#fff7ed",
            border: "1px solid #fdba74",
            borderRadius: "8px",
            textAlign: "center",
          }}
        >
          <h4 style={{ color: "#c2410c", marginBottom: "0.5rem" }}>
            Calibration Required
          </h4>
          <p
            style={{
              fontSize: "0.9rem",
              marginBottom: "1rem",
              color: "#9a3412",
            }}
          >
            Hold your hand completely straight and still.
          </p>
          <button
            onClick={handleCalibrate}
            className="connect-btn"
            style={{ background: "#f97316", width: "100%" }}
          >
            Set Zero Position
          </button>
        </div>
      )}

      {/* INSTRUCTION PANEL */}
      <div className="guidance-panel">
        <h3>Current Instruction</h3>
        <p className="instruction-text">{currentStepText}</p>
      </div>

      {/* PROGRESS BAR */}
      <div className="progress-bar-container">
        <div
          className="progress-bar-fill"
          style={{ width: `${exerciseProgress}%` }}
        ></div>
        <div className="progress-bar-text">
          {Math.round(exerciseProgress)}% Complete
        </div>
      </div>

      {/* GAUGES */}
      <div className="gauge-grid">
        <div className="angle-gauge-container">
          <label>Flexion / Extension</label>
          <div className="angle-gauge">
            <div className="gauge-bar" style={{ width: `${pitchPct}%` }}></div>
            <div className="gauge-center-line"></div>
          </div>
          <div className="live-angle-display">
            {Math.round(liveAngles.pitch)}°
          </div>
        </div>

        <div className="angle-gauge-container">
          <label>Ulnar / Radial</label>
          <div className="angle-gauge">
            <div className="gauge-bar" style={{ width: `${yawPct}%` }}></div>
            <div className="gauge-center-line"></div>
          </div>
          <div className="live-angle-display">
            {Math.round(liveAngles.yaw)}°
          </div>
        </div>
      </div>

      {/* STATS */}
      <div className="session-stats">
        <div>
          <h4>Reps</h4>
          <p>
            {repsInSet} / {selectedPrescription?.targetReps || "-"}
          </p>
        </div>
        <div>
          <h4>Sets</h4>
          <p>
            {currentSet} / {selectedPrescription?.targetSets || "-"}
          </p>
        </div>
      </div>

      {/* MOTOR CONTROLS */}
      <div className="angle-set-controls">
        <h3>Motor Assistance (Manual)</h3>
        <p>Manually set angles for the exosuit motors.</p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "1rem",
          }}
        >
          <div className="angle-preset-group">
            <label>Motor 1</label>
            <input
              type="number"
              className="angle-input"
              value={anglePreset1}
              onChange={(e) => setAnglePreset1(e.target.value)}
            />
          </div>
          <div className="angle-preset-group">
            <label>Motor 2</label>
            <input
              type="number"
              className="angle-input"
              value={anglePreset2}
              onChange={(e) => setAnglePreset2(e.target.value)}
            />
          </div>
          <div className="angle-preset-group">
            <label>Motor 3</label>
            <input
              type="number"
              className="angle-input"
              value={anglePreset3}
              onChange={(e) => setAnglePreset3(e.target.value)}
            />
          </div>
        </div>

        <button
          className="send-all-angles-btn"
          onClick={handleSendAllAngles}
          disabled={connectionStatus !== "Connected"}
        >
          Send Motor Commands
        </button>
      </div>

      {/* EXERCISE CONTROLS */}
      <div className="exercise-controls">
        <select
          className="exercise-select"
          value={selectedPrescription ? selectedPrescription.id : ""}
          onChange={(e) => {
            const p = prescriptions.find((pre) => pre.id === e.target.value);
            setSelectedPrescription(p);
            setIsSessionActive(false); // Stop session on new selection
            setIsAutomating(false);
            clearTimeout(automationTimerRef.current);
            setCurrentStepText("Ready to Start");
            setRepsInSet(0);
          }}
          disabled={isSessionActive}
        >
          <option value="" disabled>
            Select Prescribed Exercise
          </option>
          {prescriptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.exerciseName}
            </option>
          ))}
        </select>

        <div className="control-buttons-row">
          <button
            id="startExerciseBtn"
            onClick={handleStartSession}
            disabled={isSessionActive || !selectedPrescription || !isCalibrated}
          >
            Start Session
          </button>
          <button
            id="stopExerciseBtn"
            onClick={() => handleStopSession(false)} // This is the normal "Stop"
            disabled={!isSessionActive}
          >
            Stop Session
          </button>
        </div>

        {/* --- NEW EMERGENCY STOP BUTTON --- */}
        <button
          id="emergencyStopBtn"
          onClick={handleEmergencyStop}
          disabled={connectionStatus !== "Connected"}
          style={{
            width: "100%",
            marginTop: "1rem",
            backgroundColor: "var(--status-danger)", // Assumes you have this CSS variable
            color: "white",
            borderColor: "var(--status-danger-dark)",
          }}
        >
          EMERGENCY STOP (Motors to Center)
        </button>
      </div>
    </section>
  );
}

export default LiveSession;
