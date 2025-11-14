import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

import LiveSession from "../components/LiveSession"; 
import ProgressTracker from "../components/ProgressTracker";
import "./PatientDashboard.css"; 

function PatientDashboard({ onLogout }) {
  const [patientName, setPatientName] = useState("Patient");

  useEffect(() => {
    const fetchUserData = async () => {
      const user = auth.currentUser;
      if (user) {
        const userDocRef = doc(db, "users01", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setPatientName(userDocSnap.data().name);
        } else {

        }
      }
    };
    fetchUserData();
  }, []);

  return (
    <div className="patient-dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Welcome Back, {patientName}</h1>
        </div>
        <button onClick={onLogout} className="logout-button">
          Logout
        </button>
      </header>

      <main className="dashboard-main">
        <LiveSession />
        <ProgressTracker />
      </main>
    </div>
  );
}

export default PatientDashboard;
