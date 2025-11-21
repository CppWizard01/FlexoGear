// src/pages/SignupPage.js

import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import "./LoginPage.css"; // Reusing styles

const mascotPath = "/assets/mascot.svg";

function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // 1. NEW: Role Selection State
  const [selectedRole, setSelectedRole] = useState("patient");

  // Doctor ID is only needed if you are a patient
  const [doctorId, setDoctorId] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 2. Create Auth User
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // 3. Prepare User Data
      const userData = {
        name: name,
        email: email,
        role: selectedRole, // Use selected role
        createdAt: new Date(),
      };

      // Only add doctorID if the user is a patient
      if (selectedRole === "patient") {
        if (!doctorId.trim()) {
          throw new Error("Patients must provide a Doctor ID.");
        }
        userData.doctorID = doctorId;
      }

      // 4. Save to Firestore
      await setDoc(doc(db, "users01", user.uid), userData);

      alert("Account created successfully!");

      // Redirect based on role
      if (selectedRole === "patient") {
        navigate("/patient");
      } else {
        navigate("/doctor");
      }
    } catch (err) {
      console.error("Signup Error:", err);
      setError(err.message);
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

        <h1 className="login-title">Join FlexoGear</h1>
        <p className="login-subtitle">Create a new account</p>

        {/* 5. Role Selector Toggle */}
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

        <form onSubmit={handleSignup} className="login-form">
          <input
            type="text"
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {/* 6. Conditionally Show Doctor ID Input */}
          {selectedRole === "patient" && (
            <input
              type="text"
              placeholder="Link to Doctor ID (Required for Patients)"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              required
            />
          )}

          {error && <p className="error-message">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading
              ? "Creating Account..."
              : `Sign Up as ${
                  selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)
                }`}
          </button>
        </form>

        <div className="login-helpers">
          <Link to="/login">
            Already have an account? <strong>Login</strong>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default SignupPage;
