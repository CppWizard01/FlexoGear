// src/components/LoadingScreen.js

import React from "react";
import "./LoadingScreen.css"; // We'll create this next

const LoadingScreen = () => {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        {/* Main logo/text for FlexoGear */}
        <h1 className="loading-title">FlexoGear</h1>
        {/* A tagline or descriptor */}
        <p className="loading-subtitle">Wearable Wrist Rehabilitation</p>

        {/* Animated dots or spinner */}
        <div className="loading-animation">
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
        </div>
        <p className="loading-text">Loading Application...</p>
      </div>
    </div>
  );
};

export default LoadingScreen;
