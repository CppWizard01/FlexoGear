import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import ProgressTracker from "../components/ProgressTracker";
import PrescriptionForm from "../components/PrescriptionForm"; 
import "./DoctorDashboard.css";

function DoctorDashboard({ onLogout }) {
  const [doctorName, setDoctorName] = useState("Doctor");
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);

  const [prescriptions, setPrescriptions] = useState([]);
  const [isLoadingPrescriptions, setIsLoadingPrescriptions] = useState(false);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [editingPrescription, setEditingPrescription] = useState(null);

  // Effect 1: Fetch doctor's name and patient list
  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingPatients(true);
      setSelectedPatientId(null);
      const user = auth.currentUser;
      if (user) {
        try {
          const docRef = doc(db, "users01", user.uid);
          const docSnap = await getDoc(docRef);

          if (
            docSnap.exists() &&
            docSnap.data().role?.toLowerCase() === "doctor"
          ) {
            setDoctorName(docSnap.data().name);

            // Fetch patients
            const patientsRef = collection(db, "users01");
            const q = query(
              patientsRef,
              where("role", "==", "patient"),
              where("doctorID", "==", user.uid) // Match case from Firestore 'doctorID'
            );
            const querySnapshot = await getDocs(q);
            const patientList = [];
            querySnapshot.forEach((doc) => {
              patientList.push({ id: doc.id, ...doc.data() });
            });
            setPatients(patientList);
          } else {
            console.error("User is not authorized or data missing."); // Keep error log
            // Consider logging out the user if they are not a doctor
            // onLogout();
          }
        } catch (error) {
          console.error("Error fetching doctor/patient data:", error); // Keep error log
        } finally {
          setIsLoadingPatients(false);
        }
      } else {
        setIsLoadingPatients(false); // No user, stop loading
      }
    };
    fetchData();
  }, [onLogout]); // Keep dependency for potential re-fetch on user state change

  // Effect 2: Fetch PRESCRIPTIONS for the selected patient
  useEffect(() => {
    let unsubscribe = () => {};
    if (selectedPatientId) {
      setIsLoadingPrescriptions(true);
      const prescriptionsRef = collection(
        db,
        "users01",
        selectedPatientId,
        "prescriptions"
      );
      const q = query(prescriptionsRef, orderBy("dateAssigned", "desc"));

      unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const fetchedPrescriptions = [];
          querySnapshot.forEach((doc) => {
            fetchedPrescriptions.push({ id: doc.id, ...doc.data() });
          });
          setPrescriptions(fetchedPrescriptions);
          setIsLoadingPrescriptions(false);
        },
        (error) => {
          console.error("Error fetching prescriptions: ", error); // Keep error log
          setIsLoadingPrescriptions(false);
        }
      );
    } else {
      setPrescriptions([]);
    }
    // Cleanup listener
    return () => unsubscribe();
  }, [selectedPatientId]);

  const handleSelectPatient = (patientId) => {
    setSelectedPatientId(patientId);
  };

  const openNewPrescriptionModal = () => {
    setEditingPrescription(null);
    setShowPrescriptionModal(true);
  };

  const openEditPrescriptionModal = (prescription) => {
    setEditingPrescription(prescription);
    setShowPrescriptionModal(true);
  };

  const closePrescriptionModal = () => {
    setShowPrescriptionModal(false);
    setEditingPrescription(null);
  };

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  if (isLoadingPatients) {
    return <div>Loading Doctor Dashboard...</div>;
  }

  return (
    <div className="doctor-dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Welcome, {doctorName}</h1>
          <span className="header-watermark">FlexoGear</span>
        </div>
        <button onClick={onLogout} className="logout-button">
          Logout
        </button>
      </header>

      {/* --- RENDER PRESCRIPTION MODAL --- */}
      {showPrescriptionModal && selectedPatientId && (
        <PrescriptionForm
          patientId={selectedPatientId}
          existingPrescription={editingPrescription}
          onClose={closePrescriptionModal}
        />
      )}

      <main className="doctor-dashboard-main">
        {/* Column 1: Patient List */}
        <aside className="patient-list-panel">
          <h2>Your Patients</h2>
          {patients.length > 0 ? (
            <ul>
              {patients.map((patient) => (
                <li
                  key={patient.id}
                  onClick={() => handleSelectPatient(patient.id)}
                  className={selectedPatientId === patient.id ? "selected" : ""}
                >
                  {patient.name}
                </li>
              ))}
            </ul>
          ) : (
            <p>No patients assigned yet.</p>
          )}
        </aside>

        {/* Column 2: Selected Patient's Details */}
        <section className="patient-details-panel">
          {selectedPatientId && selectedPatient ? (
            <>
              <h2>Patient Progress: {selectedPatient.name}</h2>
              <ProgressTracker patientId={selectedPatientId} />

              {/* --- PRESCRIPTION SECTION --- */}
              <div className="prescriptions-section">
                <h3>Assigned Prescriptions</h3>
                <button
                  onClick={openNewPrescriptionModal}
                  className="add-prescription-btn"
                >
                  + Assign New Exercise
                </button>
                {isLoadingPrescriptions ? (
                  <p>Loading prescriptions...</p>
                ) : prescriptions.length > 0 ? (
                  <ul className="prescription-list">
                    {prescriptions.map((p) => (
                      <li key={p.id}>
                        <span>
                          {p.exerciseName} ({p.targetSets} sets x {p.targetReps}{" "}
                          reps)
                        </span>
                        <button
                          onClick={() => openEditPrescriptionModal(p)}
                          className="edit-btn"
                        >
                          Edit
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No prescriptions assigned yet.</p>
                )}
              </div>
            </>
          ) : (
            <h2>Select a patient to view their details.</h2>
          )}
        </section>
      </main>
    </div>
  );
}

export default DoctorDashboard;
