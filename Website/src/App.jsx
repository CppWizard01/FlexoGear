import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

import LoginPage from "./pages/LoginPage";
import PatientDashboard from "./pages/PatientDashboard";
import DoctorDashboard from "./pages/DoctorDashboard";

import "./index.css";

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true); // Tracks initial auth check
  const [loadingRole, setLoadingRole] = useState(false); // Tracks role fetching

  // Effect 1: Listen for Authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoadingAuth(false);
      if (!user) {
        setUserRole(null); // Clear role if logged out
      }
    });
    // Cleanup listener on unmount
    return () => unsubscribe();
  }, []);

  // Effect 2: Fetch user role *after* currentUser is confirmed
  useEffect(() => {
    if (currentUser) {
      setLoadingRole(true);
      const fetchRole = async () => {
        try {
          const userDocRef = doc(db, "users01", currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            setUserRole(userData.role.toLowerCase()); // Store role in lowercase
          } else {
            console.error(
              "User document not found in Firestore for UID:",
              currentUser.uid
            );
            setUserRole(null);
            signOut(auth); // Log out inconsistent user
          }
        } catch (error) {
          console.error("Error fetching user role:", error); // Keep error log
          setUserRole(null);
          signOut(auth); // Log out user on error
        } finally {
          setLoadingRole(false);
        }
      };
      fetchRole();
    } else {
      setUserRole(null); // No user, no role
    }
  }, [currentUser]); // Re-run only when currentUser changes

  // Logout handler
  const handleLogout = () => {
    signOut(auth);
    // State (currentUser, userRole) will clear via the auth listener
  };

  // Display loading screen until initial auth check AND role fetch (if logged in) are complete
  if (loadingAuth || (currentUser && loadingRole)) {
    return <div>Loading...</div>;
  }

  // --- Main Routing Logic ---
  return (
    <Routes>
      <Route
        path="/login"
        element={
          !currentUser ? (
            <LoginPage />
          ) : // Redirect logged-in users based on their role
          userRole === "doctor" ? (
            <Navigate to="/doctor" replace />
          ) : userRole === "patient" ? (
            <Navigate to="/patient" replace />
          ) : (
            // Fallback during brief moment role might be loading after login
            <div>Loading user role...</div> // Or stay on login temporarily
            // <LoginPage />
          )
        }
      />
      <Route
        path="/patient"
        element={
          currentUser && userRole === "patient" ? (
            <PatientDashboard onLogout={handleLogout} />
          ) : (
            // Redirect if not logged in or role is incorrect
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
      {/* Default route handles unknown paths */}
      <Route
        path="*"
        element={
          <Navigate
            to={
              !currentUser
                ? "/login" // Not logged in -> Login
                : userRole === "doctor"
                ? "/doctor" // Logged in as Doctor -> Doctor Dashboard
                : userRole === "patient"
                ? "/patient" // Logged in as Patient -> Patient Dashboard
                : "/login" // Fallback if role is unexpectedly null after login
            }
            replace
          />
        }
      />
    </Routes>
  );
}

export default App;
