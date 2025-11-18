// src/pages/LoginPage.js
// (UPDATED - Logic simplified)

import React, { useState } from "react";
import { useNavigate } from "react-router-dom"; // Keep navigate for helper links
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import "./LoginPage.css";

const mascotPath = "/assets/mascot.svg";

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate(); // Still useful for forgot/signup links

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Step 1: Just sign the user in.
      await signInWithEmailAndPassword(auth, email, password);

      // Step 2: That's it!
      // Your main App.js component will now detect the
      // 'currentUser' change, fetch their role, and
      // automatically navigate them to the correct dashboard.
    } catch (firebaseError) {
      console.error("Firebase login error:", firebaseError);
      setError("Failed to log in. Please check your email and password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <img
          src={mascotPath}
          alt="FlexoGear Mascot"
          className="login-mascot"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />

        <h1 className="login-title">FlexoGear</h1>
        <p className="login-subtitle">Wearable Wrist Rehabilitation</p>

        {/* NOTE: This role selector is now purely visual and
          doesn't do anything, as the role is fetched from 
          Firestore. You can remove it, or keep it for show.
          I've removed the state logic from it.
        */}
        <div className="role-selector">
          <button type="button" className="active">
            Patient
          </button>
          <button type="button">Doctor</button>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-label="Email Address"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-label="Password"
          />
          {error && <p className="error-message">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div className="login-helpers">
          {/* Use navigate() for client-side routing */}
          <a
            href
            onClick={(e) => {
              e.preventDefault();
              navigate("/forgot-password");
            }}
          >
            Forgot Password?
          </a>
          <a
            href
            onClick={(e) => {
              e.preventDefault();
              navigate("/signup");
            }}
          >
            New Doctor? <strong>Request Access</strong>
          </a>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
