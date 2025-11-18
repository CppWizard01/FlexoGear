// src/components/LiveDataDisplay.js
import React from "react";

function LiveDataDisplay({
  liveAngles,
  pitchPct,
  yawPct,
  currentSet,
  targetSets,
}) {
  // Helper to format the angle numbers
  const formatAngle = (angle) => {
    return Math.round(angle);
  };

  return (
    <div className="live-data-wrapper">
      {/* --- This grid creates the new 3-column layout --- */}
      <div className="live-data-grid">
        {/* --- METRIC 1: Flexion/Extension --- */}
        <div className="live-data-metric">
          <div className="metric-value">{formatAngle(liveAngles.pitch)}°</div>
          <div className="metric-label">Flexion / Extension</div>
          <div className="angle-gauge-container-new">
            <div className="angle-gauge-new">
              <div
                className="gauge-bar-new"
                style={{ width: `${pitchPct}%` }}
              ></div>
              <div className="gauge-center-line-new"></div>
            </div>
          </div>
        </div>

        {/* --- METRIC 2: Ulnar/Radial --- */}
        <div className="live-data-metric">
          <div className="metric-value">{formatAngle(liveAngles.yaw)}°</div>
          <div className="metric-label">Ulnar / Radial</div>
          <div className="angle-gauge-container-new">
            <div className="angle-gauge-new">
              <div
                className="gauge-bar-new"
                style={{ width: `${yawPct}%` }}
              ></div>
              <div className="gauge-center-line-new"></div>
            </div>
          </div>
        </div>

        {/* --- METRIC 3: Repetitions --- */}
        <div className="live-data-metric">
          <div className="metric-value">
            {currentSet}
            <span className="metric-value-suffix">/ {targetSets || "-"}</span>
          </div>
          <div className="metric-label">Repetitions</div>
          <div className="angle-gauge-container-new">
            {/* We can leave this gauge area empty or add a set-based progress bar later */}
            <div
              className="angle-gauge-new"
              style={{ backgroundColor: "transparent" }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveDataDisplay;
