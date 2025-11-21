// src/pages/LoginPage.js

import React, { useState, useEffect } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Link } from "react-router-dom"; // <--- 1. IMPORT LINK
import { FaEye, FaEyeSlash } from "react-icons/fa";
import "./LoginPage.css";

const mascotPath = "/assets/mascot.svg";

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [selectedRole, setSelectedRole] = useState("patient");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedError = sessionStorage.getItem("loginError");
    if (storedError) {
      setError(storedError);
      sessionStorage.removeItem("loginError");
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      const userDocRef = doc(db, "users01", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const actualRole = userData.role ? userData.role.toLowerCase() : "";

        if (actualRole !== selectedRole) {
          sessionStorage.setItem(
            "loginError",
            "Invalid credentials, try again"
          );
          await signOut(auth);
          return;
        }
      } else {
        sessionStorage.setItem("loginError", "Invalid credentials, try again");
        await signOut(auth);
      }
    } catch (firebaseError) {
      console.error("Login error:", firebaseError);
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

          {error && <p className="error-message">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Verifying..." : "Login"}
          </button>
        </form>

        {/* --- 2. ADDED SIGN UP LINK HERE --- */}
        <div className="login-helpers">
          <Link to="/signup">
             <strong>Create Account</strong>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
