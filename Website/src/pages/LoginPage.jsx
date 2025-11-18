// src/pages/LoginPage.js

import React, { useState, useEffect } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import "./LoginPage.css";

const mascotPath = "/assets/mascot.svg";

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Toggle State
  const [selectedRole, setSelectedRole] = useState("patient");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // --- NEW: Check for errors passed from a previous failed attempt ---
  useEffect(() => {
    const storedError = sessionStorage.getItem("loginError");
    if (storedError) {
      setError(storedError);
      sessionStorage.removeItem("loginError"); // Clear it so it doesn't stay forever
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 1. Attempt to Sign In
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // 2. Check Firestore for the Role
      const userDocRef = doc(db, "users01", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const actualRole = userData.role ? userData.role.toLowerCase() : "";

        // 3. STRICT CHECK: Role Mismatch
        if (actualRole !== selectedRole) {
          // Save the error so it survives the page reload
          sessionStorage.setItem(
            "loginError",
            "Invalid credentials, try again"
          );

          // Force Sign Out
          await signOut(auth);

          // We don't need to setLoading(false) here because the app will
          // reload the login page and pick up the error from sessionStorage.
          return;
        }

        // If role matches, do nothing. App.js handles the redirect.
      } else {
        // Edge Case: Auth exists but no DB record
        sessionStorage.setItem("loginError", "Invalid credentials, try again");
        await signOut(auth);
      }
    } catch (firebaseError) {
      console.error("Login error:", firebaseError);
      // Standard wrong password/email error
      setError("Invalid credentials, try again");
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

        {/* Role Selector */}
        <div className="role-selector">
          <button
            type="button"
            className={selectedRole === "patient" ? "active" : ""}
            onClick={() => setSelectedRole("patient")}
          >
            Patient
          </button>
          <button
            type="button"
            className={selectedRole === "doctor" ? "active" : ""}
            onClick={() => setSelectedRole("doctor")}
          >
            Doctor
          </button>
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

          {/* Password Input with Eye Icon */}
          <div className="password-input-wrapper">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-label="Password"
            />
            <span
              className="password-toggle-icon"
              onClick={() => setShowPassword(!showPassword)}
              role="button"
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </span>
          </div>

          {/* Error Message */}
          {error && <p className="error-message">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Verifying..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
