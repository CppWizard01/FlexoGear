// src/components/MotorControls.js
// (Or wherever your LiveSession component is)

import React from "react";
import {
  FaArrowUp,
  FaArrowDown,
  FaArrowLeft,
  FaArrowRight,
  FaDotCircle, // A better "center" icon
} from "react-icons/fa";

// Motor position constants (can be passed in or defined here)
const MOTOR_POS_TOP = { a1: "0", a2: "180", a3: "180" };
const MOTOR_POS_BOTTOM = { a1: "180", a2: "0", a3: "0" };
const MOTOR_POS_CENTER = { a1: "90", a2: "90", a3: "90" };
const MOTOR_POS_LEFT = { a1: "0", a2: "0", a3: "0" };
const MOTOR_POS_RIGHT = { a1: "180", a2: "180", a3: "0" };

function MotorControls({
  anglePreset1,
  setAnglePreset1,
  anglePreset2,
  setAnglePreset2,
  anglePreset3,
  setAnglePreset3,
  onSendManual,
  onSendPreset, // This will be our sendMotorCommand
  isConnected,
}) {
  return (
    <div className="motor-controls-wrapper">
      <h3>Motor Assistance</h3>

      {/* This grid creates the 2-column layout */}
      <div className="motor-controls-grid">
        {/* --- COLUMN 1: MANUAL --- */}
        <div className="manual-controls">
          <h4>Manual Angles</h4>
          <p>Set specific angles for each motor.</p>
          <div className="manual-inputs-grid">
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
            onClick={onSendManual}
            disabled={!isConnected}
          >
            Send Manual Commands
          </button>
        </div>

        {/* --- COLUMN 2: PRESETS (GAMEPAD) --- */}
        <div className="preset-controls">
          <h4>Quick Presets</h4>
          <p>Use the gamepad for common positions.</p>
          <div className="gamepad-controls-new">
            {/* Row 1 */}
            <div /> {/* Empty grid cell */}
            <button
              className="gamepad-btn-new"
              onClick={() => onSendPreset(MOTOR_POS_TOP)}
              disabled={!isConnected}
              aria-label="Move Top"
            >
              <FaArrowUp />
            </button>
            <div /> {/* Empty grid cell */}
            {/* Row 2 */}
            <button
              className="gamepad-btn-new"
              onClick={() => onSendPreset(MOTOR_POS_LEFT)}
              disabled={!isConnected}
              aria-label="Move Left"
            >
              <FaArrowLeft />
            </button>
            <button
              className="gamepad-btn-new gamepad-btn-center"
              onClick={() => onSendPreset(MOTOR_POS_CENTER)}
              disabled={!isConnected}
              aria-label="Move to Center"
            >
              <FaDotCircle />
            </button>
            <button
              className="gamepad-btn-new"
              onClick={() => onSendPreset(MOTOR_POS_RIGHT)}
              disabled={!isConnected}
              aria-label="Move Right"
            >
              <FaArrowRight />
            </button>
            {/* Row 3 */}
            <div /> {/* Empty grid cell */}
            <button
              className="gamepad-btn-new"
              onClick={() => onSendPreset(MOTOR_POS_BOTTOM)}
              disabled={!isConnected}
              aria-label="Move Bottom"
            >
              <FaArrowDown />
            </button>
            <div /> {/* Empty grid cell */}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MotorControls;
