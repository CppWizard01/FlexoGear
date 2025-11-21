// src/components/MotorControls.js

import React from "react";
import { FaRegHandPaper } from "react-icons/fa";

function MotorControls({
  anglePreset1,
  setAnglePreset1,
  anglePreset2,
  setAnglePreset2,
  anglePreset3,
  setAnglePreset3,
  onSendManual,
  onSendPreset,
  positions,
  isConnected,
}) {
  return (
    <div className="motor-controls-wrapper">
      <h3>Motor Assistance</h3>

      <div className="motor-controls-grid">

        {/* --- COLUMN 1: MANUAL --- */}
        {/* <div className="manual-controls">
          <h4>Manual Angles</h4>
          <p>Set specific angles for each motor.</p>
          <div className="manual-inputs-grid">
            <div className="angle-preset-group">
              <label>M1</label>
              <input
                type="number"
                className="angle-input"
                value={anglePreset1}
                onChange={(e) => setAnglePreset1(e.target.value)}
              />
            </div>
            <div className="angle-preset-group">
              <label>M2</label>
              <input
                type="number"
                className="angle-input"
                value={anglePreset2}
                onChange={(e) => setAnglePreset2(e.target.value)}
              />
            </div>
            <div className="angle-preset-group">
              <label>M3</label>
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
        </div> */}

        {/* --- COLUMN 2: PIE DIAL --- */}
        <div className="preset-controls">
          <h4>Quick Presets</h4>
          <p>8-Direction Control Dial</p>

          <div className="circular-dial-container">
            <div className="pie-dial">
              {/* 8 Segments - No Icons, Just Clickable Areas */}
              {/* Note: The order matches the rotation in CSS */}
              <button
                className="seg-btn seg-top"
                onClick={() => onSendPreset(positions.TOP)}
                disabled={!isConnected}
                title="Top"
              ></button>
              <button
                className="seg-btn seg-tr"
                onClick={() => onSendPreset(positions.TOP_RIGHT)}
                disabled={!isConnected}
                title="Top Right"
              ></button>
              <button
                className="seg-btn seg-right"
                onClick={() => onSendPreset(positions.RIGHT)}
                disabled={!isConnected}
                title="Right"
              ></button>
              <button
                className="seg-btn seg-br"
                onClick={() => onSendPreset(positions.BOTTOM_RIGHT)}
                disabled={!isConnected}
                title="Bottom Right"
              ></button>
              <button
                className="seg-btn seg-bottom"
                onClick={() => onSendPreset(positions.BOTTOM)}
                disabled={!isConnected}
                title="Bottom"
              ></button>
              <button
                className="seg-btn seg-bl"
                onClick={() => onSendPreset(positions.BOTTOM_LEFT)}
                disabled={!isConnected}
                title="Bottom Left"
              ></button>
              <button
                className="seg-btn seg-left"
                onClick={() => onSendPreset(positions.LEFT)}
                disabled={!isConnected}
                title="Left"
              ></button>
              <button
                className="seg-btn seg-tl"
                onClick={() => onSendPreset(positions.TOP_LEFT)}
                disabled={!isConnected}
                title="Top Left"
              ></button>

              {/* Center Button (Orange Target) */}
              <button
                className="dial-center"
                onClick={() => onSendPreset(positions.CENTER)}
                disabled={!isConnected}
                title="Center (90/90/90)"
              >
                <div className="center-dot"></div>
              </button>
            </div>
          </div>

          {/* RELAX BUTTON */}
          <button
            className="relax-btn"
            onClick={() => onSendPreset(positions.RELAX)}
            disabled={!isConnected}
          >
            <FaRegHandPaper /> Relax (No Load)
          </button>
        </div>
      </div>
    </div>
  );
}

export default MotorControls;
