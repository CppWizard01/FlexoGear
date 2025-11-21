// src/components/LiveSession.js

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

// Import child components
import SessionStatus from "./SessionStatus";
import LiveDataDisplay from "./LiveDataDisplay";
import MotorControls from "./MotorControls";
import ExerciseControls from "./ExerciseControls";

// --- BLE CONSTANTS ---
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const COMMAND_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a9";

// --- AUTOMATION CONSTANTS ---
const MOTOR_POS_TOP = { a1: "0", a2: "180", a3: "180" };
const MOTOR_POS_BOTTOM = { a1: "180", a2: "0", a3: "0" };
const MOTOR_POS_CENTER = { a1: "90", a2: "90", a3: "90" }; // Active/Ready State
const MOTOR_POS_LEFT = { a1: "0", a2: "0", a3: "0" };
const MOTOR_POS_RIGHT = { a1: "180", a2: "180", a3: "0" };

// --- RELAX STATE (No Load) ---
const MOTOR_POS_RELAX = { a1: "180", a2: "0", a3: "180" };

const MOTOR_COMMAND_MAP = {
  TOP: MOTOR_POS_TOP,
  BOTTOM: MOTOR_POS_BOTTOM,
  LEFT: MOTOR_POS_LEFT,
  RIGHT: MOTOR_POS_RIGHT,
  CENTER: MOTOR_POS_CENTER,
};

const AUTOMATION_DELAY_MS = 2000;

// --- MATH HELPERS ---
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
  const sinp = 2 * (real * j - k * i);
  let pitch;
  if (Math.abs(sinp) >= 1) pitch = (Math.sign(sinp) * Math.PI) / 2;
  else pitch = Math.asin(sinp);
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
  const calibrationQuaternionRef = useRef(null);

  // Save Lock to prevent duplicate entries
  const isSavingRef = useRef(false);

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
      const q = query(prescriptionsRef, orderBy("dateAssigned", "asc"));
      unsubscribe = onSnapshot(q, (qs) => {
        const fetched = [];
        qs.forEach((doc) => fetched.push({ id: doc.id, ...doc.data() }));
        setPrescriptions(fetched);
      });
    }
    return () => unsubscribe();
  }, []);

  // --- HELPER: Send Command ---
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
      commandCharacteristicRef.current = await service.getCharacteristic(
        COMMAND_CHARACTERISTIC_UUID
      );

      setConnectionStatus("Connected");

      // --- MOVE TO 90-90-90 ON CONNECT ---
      await sendMotorCommand(MOTOR_POS_CENTER);

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
    calibrationQuaternionRef.current = null;
    commandCharacteristicRef.current = null;
    deviceRef.current = null;
    setIsSessionActive(false);
    setIsAutomating(false);
    clearTimeout(automationTimerRef.current);
  };

  const handleDisconnect = async () => {
    if (deviceRef.current?.gatt?.connected) {
      // --- RELAX MOTORS (180,0,180) BEFORE DISCONNECT ---
      await sendMotorCommand(MOTOR_POS_RELAX);
      deviceRef.current.gatt.disconnect();
    } else {
      onDisconnected();
    }
  };

  const handleCalibrate = () => {
    calibrationQuaternionRef.current = rawQuaternionRef.current;
    setIsCalibrating(false);
    setIsCalibrated(true);
    setCurrentStepText("Calibrated. Select an exercise.");
    setLiveAngles({ pitch: 0, yaw: 0 });
  };

  const handleSendAllAngles = () => {
    sendMotorCommand({ a1: anglePreset1, a2: anglePreset2, a3: anglePreset3 });
  };

  // --- MANUAL EFFECT (IMU) ---
  useEffect(() => {
    if (!isSessionActive || !selectedPrescription || isAutomating) return;
    const { pitch } = liveAngles;

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

    const instructions = selectedPrescription.instructions || [];
    const currentInstr =
      instructions[currentStepIndex % instructions.length] || "Exercise";
    setCurrentStepText(currentInstr);

    const FLEX_THRESHOLD = -30;
    const NEUTRAL_THRESHOLD = -10;
    const isFlexingStep = currentStepIndex % 2 === 0;

    if (
      isFlexingStep &&
      pitch < FLEX_THRESHOLD &&
      repPhaseRef.current === "start"
    ) {
      repPhaseRef.current = "flexed";
      setCurrentStepIndex((prev) => (prev + 1) % instructions.length);
    } else if (
      !isFlexingStep &&
      pitch > NEUTRAL_THRESHOLD &&
      repPhaseRef.current === "flexed"
    ) {
      repPhaseRef.current = "start";
      const newRep = repsInSet + 1;
      setCurrentStepIndex(0);

      if (newRep >= selectedPrescription.targetReps) {
        const newSet = currentSet + 1;
        if (newSet > selectedPrescription.targetSets) {
          handleStopSession(true);
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

  // --- MAX VALUES EFFECT ---
  useEffect(() => {
    if (!isSessionActive || !isCalibrated) return;
    const { pitch, yaw } = liveAngles;
    setMaxValues((prev) => ({
      flex: Math.min(prev.flex, pitch),
      ext: Math.max(prev.ext, pitch),
      rad: Math.min(prev.rad, yaw),
      uln: Math.max(prev.uln, yaw),
    }));
  }, [liveAngles, isSessionActive, isCalibrated]);

  // --- AUTOMATION EFFECT ---
  useEffect(() => {
    if (
      !isAutomating ||
      !selectedPrescription?.automationSequence ||
      selectedPrescription.automationSequence.length === 0
    )
      return;

    const sequence = selectedPrescription.automationSequence;
    const commandKey = sequence[automationStep];
    const command = MOTOR_COMMAND_MAP[commandKey];

    if (!command) {
      setIsAutomating(false);
      return;
    }

    sendMotorCommand(command);
    setCurrentStepText(`Moving to: ${commandKey}`);

    let nextStepIndex = automationStep + 1;
    let isRepComplete = false;

    if (nextStepIndex >= sequence.length) {
      nextStepIndex = 0;
      isRepComplete = true;
    }

    if (isRepComplete) {
      setCurrentSet((prevSet) => {
        const newRepetitionCount = prevSet + 1;
        if (newRepetitionCount > selectedPrescription.targetSets) {
          handleStopSession(true);
          return prevSet;
        } else {
          setCurrentStepText(
            `Rest. Get Ready for Repetition ${newRepetitionCount}`
          );
          const total = selectedPrescription.targetSets || 1;
          const done = newRepetitionCount - 1;
          setExerciseProgress((done / total) * 100);
          return newRepetitionCount;
        }
      });
    }

    automationTimerRef.current = setTimeout(() => {
      setAutomationStep(nextStepIndex);
    }, AUTOMATION_DELAY_MS);

    return () => clearTimeout(automationTimerRef.current);
  }, [isAutomating, automationStep, selectedPrescription]);

  const handleStartSession = () => {
    if (!selectedPrescription) return alert("Select an exercise first.");
    if (!isCalibrated) return alert("Calibrate device first.");

    isSavingRef.current = false;

    setRepsInSet(0);
    setCurrentSet(1);
    setExerciseProgress(0);
    setCurrentStepIndex(0);
    setMaxValues({ flex: 0, ext: 0, rad: 0, uln: 0 });
    repPhaseRef.current = "start";
    setIsSessionActive(true);

    // --- FORCE 90-90-90 ON START ---
    sendMotorCommand(MOTOR_POS_CENTER);

    if (
      selectedPrescription.automationSequence &&
      selectedPrescription.automationSequence.length > 0
    ) {
      setAutomationStep(0);
      setIsAutomating(true);
    } else {
      setIsAutomating(false);
    }
  };

  const handleStopSession = async (
    autoCompleted = false,
    isEmergency = false
  ) => {
    if (isSavingRef.current) return;

    const wasActive = isSessionActive;

    setIsSessionActive(false);
    setIsAutomating(false);
    clearTimeout(automationTimerRef.current);

    // --- RELAX MOTORS ON STOP (180-0-180) ---
    sendMotorCommand(MOTOR_POS_RELAX);

    if (autoCompleted) {
      setExerciseProgress(100);
      setCurrentStepText("Session Complete!");
    } else if (isEmergency) {
      setCurrentStepText("EMERGENCY STOP. Motors released.");
    } else {
      setCurrentStepText("Session Stopped.");
    }

    const totalCompletedReps =
      (currentSet - 1) * (selectedPrescription?.targetReps || 0) + repsInSet;

    if (wasActive && selectedPrescription) {
      isSavingRef.current = true;

      const user = auth.currentUser;
      if (user) {
        try {
          await addDoc(collection(db, "users01", user.uid, "sessions"), {
            exerciseName: selectedPrescription.exerciseName,
            reps: autoCompleted
              ? selectedPrescription.automationSequence?.length > 0
                ? selectedPrescription.targetSets
                : totalCompletedReps
              : totalCompletedReps,
            maxFlex: Math.round(maxValues.flex),
            maxExt: Math.round(maxValues.ext),
            maxRad: Math.round(maxValues.rad),
            maxUln: Math.round(maxValues.uln),
            timestamp: serverTimestamp(),
            wasEmergencyStop: isEmergency,
            wasAutomated: !!(
              selectedPrescription.automationSequence &&
              selectedPrescription.automationSequence.length > 0
            ),
          });
          console.log("Session saved successfully (Single Write)");
        } catch (err) {
          console.error("Save failed", err);
          isSavingRef.current = false;
        }
      }
    }
    setRepsInSet(0);
  };

  const handleEmergencyStop = () => {
    handleStopSession(false, true);
  };

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

      <SessionStatus
        connectionStatus={connectionStatus}
        isCalibrating={isCalibrating}
        currentStepText={currentStepText}
        handleConnect={handleConnect}
        handleDisconnect={handleDisconnect}
        handleCalibrate={handleCalibrate}
      />

      <div className="progress-bar-container">
        <div
          className="progress-bar-fill"
          style={{ width: `${exerciseProgress}%` }}
        ></div>
        <div className="progress-bar-text">
          {Math.round(exerciseProgress)}% Complete
        </div>
      </div>

      <LiveDataDisplay
        liveAngles={liveAngles}
        pitchPct={pitchPct}
        yawPct={yawPct}
        currentSet={currentSet}
        targetSets={selectedPrescription?.targetSets}
      />

      <MotorControls
        anglePreset1={anglePreset1}
        setAnglePreset1={setAnglePreset1}
        anglePreset2={anglePreset2}
        setAnglePreset2={setAnglePreset2}
        anglePreset3={anglePreset3}
        setAnglePreset3={setAnglePreset3}
        onSendManual={handleSendAllAngles}
        onSendPreset={sendMotorCommand}
        isConnected={connectionStatus === "Connected"}
      />

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
          setExerciseProgress(0);
        }}
        isSessionActive={isSessionActive}
        isCalibrated={isCalibrated}
        onStart={handleStartSession}
        onStop={() => handleStopSession(false)}
        onEmergencyStop={handleEmergencyStop}
        isConnected={connectionStatus === "Connected"}
      />
    </section>
  );
}

export default LiveSession;
