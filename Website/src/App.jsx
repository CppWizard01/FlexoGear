// src/App.js

import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

import LoginPage from "./pages/LoginPage";
import PatientDashboard from "./pages/PatientDashboard";
import DoctorDashboard from "./pages/DoctorDashboard";
import LoadingScreen from "./components/LoadingScreen";

import "./index.css";

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingRole, setLoadingRole] = useState(false);

  // --- NEW STATE: Track if the 2 seconds have passed ---
  const [minLoadTimePassed, setMinLoadTimePassed] = useState(false);

  // --- NEW EFFECT: The 2-second Timer ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinLoadTimePassed(true);
    }, 2000); // 2000 milliseconds = 2 seconds

    return () => clearTimeout(timer); // Cleanup if app closes
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoadingAuth(false);
      if (!user) {
        setUserRole(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUser) {
      setLoadingRole(true);
      const fetchRole = async () => {
        try {
          const userDocRef = doc(db, "users01", currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            setUserRole(userData.role.toLowerCase());
          } else {
            console.error("User document missing:", currentUser.uid);
            setUserRole(null);
            signOut(auth);
          }
        } catch (error) {
          console.error("Error fetching role:", error);
          setUserRole(null);
          signOut(auth);
        } finally {
          setLoadingRole(false);
        }
      };
      fetchRole();
    } else {
      setUserRole(null);
    }
  }, [currentUser]);

  const handleLogout = () => {
    signOut(auth);
  };

  // --- UPDATED LOADING CONDITION ---
  // We check if Auth is loading, Role is loading, OR if the 2 seconds haven't passed yet
  if (loadingAuth || (currentUser && loadingRole) || !minLoadTimePassed) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          !currentUser ? (
            <LoginPage />
          ) : userRole === "doctor" ? (
            <Navigate to="/doctor" replace />
          ) : userRole === "patient" ? (
            <Navigate to="/patient" replace />
          ) : (
            <LoadingScreen />
          )
        }
      />
      <Route
        path="/patient"
        element={
          currentUser && userRole === "patient" ? (
            <PatientDashboard onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/doctor"
        element={
          currentUser && userRole === "doctor" ? (
            <DoctorDashboard onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="*"
        element={
          <Navigate
            to={
              !currentUser
                ? "/login"
                : userRole === "doctor"
                ? "/doctor"
                : userRole === "patient"
                ? "/patient"
                : "/login"
            }
            replace
          />
        }
      />
    </Routes>
  );
}

export default App;
