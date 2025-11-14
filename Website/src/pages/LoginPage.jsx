import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import "./LoginPage.css";

function LoginPage() {
  
  const [email, setEmail] = useState(""); 
  const [password, setPassword] = useState(""); 
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate(); 
  
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
        {/* <LoginMascot /> */}
        <h1 className="login-title">FlexoGear</h1>
        <p className="login-subtitle">Wearable Wrist Rehabilitation</p>

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
      </div>
    </div>
  );
}

export default LoginPage;
