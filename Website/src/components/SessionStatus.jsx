// src/components/SessionStatus.js
import React from "react";
import {
  FaBluetoothB,
  FaExclamationTriangle,
  FaInfoCircle,
} from "react-icons/fa";

function SessionStatus({
  connectionStatus,
  isCalibrating,
  currentStepText,
  handleConnect,
  handleDisconnect,
  handleCalibrate,
}) {
  const getStatusContent = () => {
    // 1. Disconnected State
    if (connectionStatus === "Disconnected") {
      return (
        <div className="status-box status-disconnected">
          <FaBluetoothB className="status-icon" />
          <div className="status-text">
            <h4>Device Disconnected</h4>
            <p>Press the button to connect your FlexoGear device.</p>
          </div>
          <button
            onClick={handleConnect}
            className="status-action-btn connect-btn"
          >
            Connect Device
          </button>
        </div>
      );
    }

    // 2. Connecting State
    if (connectionStatus === "Connecting...") {
      return (
        <div className="status-box status-connecting">
          <div className="status-icon loading-spinner"></div>
          <div className="status-text">
            <h4>Connecting...</h4>
            <p>Please approve the request in your browser.</p>
          </div>
        </div>
      );
    }

    // 3. Calibration Required State
    if (isCalibrating) {
      return (
        <div className="status-box status-calibrating">
          <FaExclamationTriangle className="status-icon" />
          <div className="status-text">
            <h4>Calibration Required</h4>
            <p>Hold your hand straight and press 'Calibrate'.</p>
          </div>
          <button
            onClick={handleCalibrate}
            className="status-action-btn calibrate-btn"
          >
            Set Zero Position
          </button>
        </div>
      );
    }

    // 4. Ready / In-Session State
    return (
      <div className="status-box status-ready">
        {/* We use a different icon once ready */}
        <FaInfoCircle className="status-icon" />
        <div className="status-text">
          {/* This text was in your old blue "guidance-panel" */}
          <h4>{isCalibrating ? "Calibrating" : "Current Instruction"}</h4>
          <p>{currentStepText}</p>
        </div>
        <button
          onClick={handleDisconnect}
          className="status-action-btn disconnect-btn"
        >
          Disconnect
        </button>
      </div>
    );
  };

  return <div className="session-status-wrapper">{getStatusContent()}</div>;
}

export default SessionStatus;
