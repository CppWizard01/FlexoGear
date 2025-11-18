// src/components/ExerciseControls.js
import React from "react";
import { FaPlay, FaStop, FaExclamationTriangle } from "react-icons/fa";

function ExerciseControls({
  prescriptions,
  selectedPrescription,
  onSelectChange,
  isSessionActive,
  isCalibrated,
  onStart,
  onStop,
  onEmergencyStop,
  isConnected,
}) {
  return (
    <div className="exercise-controls-wrapper">
      {/* --- STEP 1: SELECT EXERCISE --- */}
      <div className="exercise-select-group">
        <label htmlFor="exercise-select">Select Prescribed Exercise</label>
        <select
          id="exercise-select"
          className="exercise-select"
          value={selectedPrescription ? selectedPrescription.id : ""}
          onChange={onSelectChange}
          disabled={isSessionActive}
        >
          <option value="" disabled>
            -- Choose an exercise --
          </option>
          {prescriptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.exerciseName}
            </option>
          ))}
        </select>
      </div>

      {/* --- STEP 2: START / STOP BUTTONS --- */}
      <div className="control-buttons-grid">
        <button
          className="start-btn"
          onClick={onStart}
          disabled={isSessionActive || !selectedPrescription || !isCalibrated}
        >
          <FaPlay />
          Start Session
        </button>
        <button
          className="stop-btn"
          onClick={onStop}
          disabled={!isSessionActive}
        >
          <FaStop />
          Stop Session
        </button>
      </div>

      {/* --- STEP 3: EMERGENCY STOP --- */}
      <button
        className="emergency-stop-btn"
        onClick={onEmergencyStop}
        disabled={!isConnected}
      >
        <FaExclamationTriangle />
        EMERGENCY STOP
      </button>
    </div>
  );
}

export default ExerciseControls;
