// Updated LiveSession.js (Fully Refactored)

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

// Import all the new child components
import SessionStatus from "./SessionStatus";
import LiveDataDisplay from "./LiveDataDisplay";
import MotorControls from "./MotorControls";
import ExerciseControls from "./ExerciseControls"; // <-- 1. ADDED THIS IMPORT

// --- BLE CONSTANTS ---
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const COMMAND_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a9";

// --- AUTOMATION CONSTANTS ---
const MOTOR_POS_TOP = { a1: "0", a2: "180", a3: "180" };
const MOTOR_POS_BOTTOM = { a1: "180", a2: "0", a3: "0" };
const MOTOR_POS_CENTER = { a1: "90", a2: "90", a3: "90" };
const MOTOR_POS_LEFT = { a1: "0", a2: "0", a3: "0" };
const MOTOR_POS_RIGHT = { a1: "180", a2: "180", a3: "0" };

const MOTOR_COMMAND_MAP = {
  TOP: MOTOR_POS_TOP,
  BOTTOM: MOTOR_POS_BOTTOM,
  LEFT: MOTOR_POS_LEFT,
  RIGHT: MOTOR_POS_RIGHT,
  CENTER: MOTOR_POS_CENTER,
};

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

  // Flexion/Extension (Pitch – X axis)
  const sinp = 2 * (real * j - k * i);
  let pitch;

  if (Math.abs(sinp) >= 1) {
    pitch = (Math.sign(sinp) * Math.PI) / 2;
  } else {
    pitch = Math.asin(sinp);
  }

  // Ulnar/Radial Deviation (Yaw – Z axis)
  const siny_cosp = 2 * (real * k + i * j);
  const cosy_cosp = 1 - 2 * (j * j + k * k);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  return {
    pitch: (-pitch * 180) / Math.PI,
    yaw: (yaw * 180) / Math.PI,
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

  // Motor angle manual inputs
  const [anglePreset1, setAnglePreset1] = useState("90");
  const [anglePreset2, setAnglePreset2] = useState("90");
  const [anglePreset3, setAnglePreset3] = useState("90");

  const [isAutomating, setIsAutomating] = useState(false);
  const [automationStep, setAutomationStep] = useState(0);

  const repPhaseRef = useRef("start");
  const commandCharacteristicRef = useRef(null);
  const deviceRef = useRef(null);
  const rawQuaternionRef = useRef({ w: 1, x: 0, y: 0, z: 0 });
  const automationTimerRef = useRef(null);
  const calibrationQuaternionRef = useRef(null); // <-- FIX 1: Use ref instead of state

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
            if (calibrationQuaternionRef.current) {
              // <-- FIX 2: Read from ref
              const calInverse = conjugateQuaternion(
                calibrationQuaternionRef.current
              );
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
    calibrationQuaternionRef.current = null; // <-- FIX 3: Clear the ref
    commandCharacteristicRef.current = null;
    deviceRef.current = null;
    setIsSessionActive(false);
    setIsAutomating(false);
    clearTimeout(automationTimerRef.current);
  };

  const handleDisconnect = () => {
    if (deviceRef.current?.gatt?.connected) deviceRef.current.gatt.disconnect();
    else onDisconnected();
  };

  const handleCalibrate = () => {
    calibrationQuaternionRef.current = rawQuaternionRef.current; // <-- FIX 4: Set the ref
    setIsCalibrating(false);
    setIsCalibrated(true);
    setCurrentStepText("Calibrated. Select an exercise.");

    // Force angles to 0 for immediate feedback
    setLiveAngles({ pitch: 0, yaw: 0 });
  };

  // --- HELPER to send motor commands ---
  const sendMotorCommand = async (positions) => {
    if (!commandCharacteristicRef.current) return;
    try {
      const encoder = new TextEncoder();
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

  // --- EFFECT for IMU-based Rep Counting (Manual Mode ONLY) ---
  useEffect(() => {
    // This hook now ONLY runs in manual mode
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
        }
      } else {
        setRepsInSet(newRep);
      }
    }
  }, [
    liveAngles,
    isSessionActive,
    isAutomating,
    repsInSet,
    currentSet,
    selectedPrescription,
    currentStepIndex,
  ]);

  // --- NEW EFFECT for Max Value Recording (Runs in ALL modes) ---
  useEffect(() => {
    // Only run if the session is active and device is calibrated
    if (!isSessionActive || !isCalibrated) return;

    const { pitch, yaw } = liveAngles; // Update max range of motion

    setMaxValues((prev) => ({
      flex: Math.min(prev.flex, pitch),
      ext: Math.max(prev.ext, pitch),
      rad: Math.min(prev.rad, yaw),
      uln: Math.max(prev.uln, yaw),
    }));
  }, [liveAngles, isSessionActive, isCalibrated]);

  // --- NEW EFFECT for Automation Loop (Data-Driven AND Fixed) ---
  useEffect(() => {
    if (
      !isAutomating ||
      !selectedPrescription?.automationSequence ||
      selectedPrescription.automationSequence.length === 0
    ) {
      return; // Do nothing if not automating or no sequence found
    }

    const sequence = selectedPrescription.automationSequence; // 1. Get the command for the current step (index)

    const commandKey = sequence[automationStep];
    const command = MOTOR_COMMAND_MAP[commandKey];

    if (!command) {
      console.error(`Invalid command key in sequence: ${commandKey}`);
      setIsAutomating(false); // Stop on error
      return;
    } // 2. Send the command

    sendMotorCommand(command);
    setCurrentStepText(`Moving to: ${commandKey}`); // 3. Determine the next step index

    let nextStepIndex = automationStep + 1;
    let isRepComplete = false; // 4. Check if this step was the end of the sequence (one rep)

    if (nextStepIndex >= sequence.length) {
      nextStepIndex = 0; // Loop back to the start of the sequence
      isRepComplete = true; // This rep is finished
    } // 5. If rep is complete, update rep/set counts (FUNCTIONAL UPDATE)

    if (isRepComplete) {
      setCurrentSet((prevSet) => {
        const newRepetitionCount = prevSet + 1;

        if (newRepetitionCount > selectedPrescription.targetSets) {
          handleStopSession(true); // Session complete
          return prevSet; // Return old state, session will stop
        } else {
          // We are starting the next repetition
          setCurrentStepText(
            `Rest. Get Ready for Repetition ${newRepetitionCount}`
          ); // Update progress bar at the same time
          const totalRepsTarget = selectedPrescription.targetSets || 1;
          const completedRepsTotal = newRepetitionCount - 1; // e.g., 1 of 15
          setExerciseProgress(
            totalRepsTarget > 0
              ? Math.min((completedRepsTotal / totalRepsTarget) * 100, 100)
              : 0
          );
          return newRepetitionCount; // Return new state
        }
      });
    } // 6. Set the timer for the next step in the sequence

    automationTimerRef.current = setTimeout(() => {
      setAutomationStep(nextStepIndex);
    }, AUTOMATION_DELAY_MS);

    return () => clearTimeout(automationTimerRef.current);
  }, [
    isAutomating,
    automationStep, // This is the index
    selectedPrescription, // REMOVED repsInSet and currentSet to fix race condition
  ]);

  const handleStartSession = () => {
    if (!selectedPrescription) return alert("Select an exercise first.");
    if (!isCalibrated) return alert("Calibrate device first.");

    setRepsInSet(0);
    setCurrentSet(1);
    setExerciseProgress(0);
    setCurrentStepIndex(0);
    setMaxValues({ flex: 0, ext: 0, rad: 0, uln: 0 });
    repPhaseRef.current = "start";
    setIsSessionActive(true);

    // NEW LOGIC: Check for an automation sequence
    if (
      selectedPrescription.automationSequence &&
      selectedPrescription.automationSequence.length > 0
    ) {
      setAutomationStep(0); // Start at the beginning (index 0)
      setIsAutomating(true);
    } else {
      // This is a manual (IMU-based) exercise
      setIsAutomating(false);
    }
  };

  const handleStopSession = async (
    autoCompleted = false,
    isEmergency = false
  ) => {
    const wasActive = isSessionActive;

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
            reps: autoCompleted
              ? selectedPrescription.targetSets
              : totalCompletedReps,
            maxFlex: Math.round(maxValues.flex),
            maxExt: Math.round(maxValues.ext),
            maxRad: Math.round(maxValues.rad),
            maxUln: Math.round(maxValues.uln),
            timestamp: serverTimestamp(),
            wasAutomated: !!(
              selectedPrescription.automationSequence &&
              selectedPrescription.automationSequence.length > 0
            ),
          });
        } catch (err) {
          console.error("Save failed", err);
        }
      }
    }
    setRepsInSet(0);
  };

  const handleEmergencyStop = () => {
    handleStopSession(false, true);
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

      {/* --- SESSION STATUS (Refactored) --- */}
      <SessionStatus
        connectionStatus={connectionStatus}
        isCalibrating={isCalibrating}
        currentStepText={currentStepText}
        handleConnect={handleConnect}
        handleDisconnect={handleDisconnect}
        handleCalibrate={handleCalibrate}
      />

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

      {/* --- LIVE DATA (Refactored) --- */}
      <LiveDataDisplay
        liveAngles={liveAngles}
        pitchPct={pitchPct}
        yawPct={yawPct}
        currentSet={currentSet}
        targetSets={selectedPrescription?.targetSets}
      />

      {/* --- MOTOR CONTROLS (Refactored) --- */}
      <MotorControls
        anglePreset1={anglePreset1}
        setAnglePreset1={setAnglePreset1}
        anglePreset2={anglePreset2}
        setAnglePreset2={setAnglePreset2}
        anglePreset3={anglePreset3}
        setAnglePreset3={setAnglePreset3}
        onSendManual={handleSendAllAngles}
        onSendPreset={sendMotorCommand} // Pass the function directly
        isConnected={connectionStatus === "Connected"}
      />

      {/* --- 2. REPLACED THIS ENTIRE BLOCK --- */}
      <ExerciseControls
        prescriptions={prescriptions}
        selectedPrescription={selectedPrescription}
        onSelectChange={(e) => {
          const p = prescriptions.find((pre) => pre.id === e.target.value);
          setSelectedPrescription(p);
          setIsSessionActive(false);
          setIsAutomating(false);
          clearTimeout(automationTimerRef.current);
          setCurrentStepText("Ready to Start");
          setRepsInSet(0);
        }}
        isSessionActive={isSessionActive}
        isCalibrated={isCalibrated}
        onStart={handleStartSession}
        onStop={() => handleStopSession(false)}
        onEmergencyStop={handleEmergencyStop}
        isConnected={connectionStatus === "Connected"}
      />
      {/* --- END OF REPLACEMENT --- */}
    </section>
  );
}

export default LiveSession;
