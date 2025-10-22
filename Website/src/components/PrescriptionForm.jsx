import React, { useState } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase"; 

function PrescriptionForm({ patientId, existingPrescription, onClose }) {
  const [exerciseName, setExerciseName] = useState(
    existingPrescription?.exerciseName || ""
  );
  const [targetReps, setTargetReps] = useState(
    existingPrescription?.targetReps || 10
  );
  const [targetSets, setTargetSets] = useState(
    existingPrescription?.targetSets || 3
  );
  const [instructions, setInstructions] = useState(
    (existingPrescription?.instructions || ["Step 1", "Step 2"]).join("\n")
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const isEditing = Boolean(existingPrescription);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSaving(true);

    if (!patientId) {
      setError("No patient selected.");
      setIsSaving(false);
      return;
    }

    const prescriptionData = {
      exerciseName,
      targetReps: parseInt(targetReps, 10),
      targetSets: parseInt(targetSets, 10),
      instructions: instructions
        .split("\n")
        .filter((line) => line.trim() !== ""),
      dateAssigned: serverTimestamp(),
    };

    try {
      const prescriptionsRef = collection(
        db,
        "users01",
        patientId,
        "prescriptions"
      );
      if (isEditing) {
        const prescriptionDocRef = doc(
          db,
          "users01",
          patientId,
          "prescriptions",
          existingPrescription.id
        );
        await updateDoc(prescriptionDocRef, prescriptionData);
      } else {
        await addDoc(prescriptionsRef, prescriptionData);
      }
      onClose();
    } catch (err) {
      console.error("Error saving prescription: ", err); // Keep error log
      setError("Failed to save prescription. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content prescription-form">
        <h2>{isEditing ? "Edit Prescription" : "Assign New Exercise"}</h2>
        <form onSubmit={handleSubmit}>
          {/* Form Groups for Exercise Name, Reps, Sets, Instructions */}
          <div className="form-group">
            <label htmlFor="exerciseName">Exercise Name:</label>
            <input
              type="text"
              id="exerciseName"
              value={exerciseName}
              onChange={(e) => setExerciseName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="targetReps">Target Reps per Set:</label>
            <input
              type="number"
              id="targetReps"
              value={targetReps}
              onChange={(e) => setTargetReps(e.target.value)}
              min="1"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="targetSets">Target Sets:</label>
            <input
              type="number"
              id="targetSets"
              value={targetSets}
              onChange={(e) => setTargetSets(e.target.value)}
              min="1"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="instructions">Instructions (one per line):</label>
            <textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows="4"
              required
            />
          </div>

          {error && <p className="error-message">{error}</p>}
          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="cancel-btn"
            >
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="save-btn">
              {isSaving ? "Saving..." : "Save Prescription"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
export default PrescriptionForm;
