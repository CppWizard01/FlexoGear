// src/components/MotorControls.js

import React from "react";
import { FaRegHandPaper } from "react-icons/fa";

function MotorControls({ onSendPreset, positions, isConnected }) {
  return (
    <div className="motor-controls-wrapper">
      <h3>Motor Assistance</h3>

      <div className="dial-controls-container">
        {/* --- PIE DIAL --- */}
        <div className="circular-dial-container">
          <div className="pie-dial">
            {/* 8 Segments */}
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

        <button
          className="relax-btn"
          onClick={() => onSendPreset(positions.RELAX)}
          disabled={!isConnected}
        >
          <FaRegHandPaper /> Relax
        </button>
      </div>
    </div>
  );
}

export default MotorControls;
