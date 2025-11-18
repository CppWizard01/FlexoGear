// src/components/PrescriptionForm.js
// (UPDATED - Added Exercise Type selection)

import React, { useState } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// Define automation sequences. These must match the keys in LiveSession.js
const WRIST_WAVES_SEQ = ["TOP", "CENTER", "BOTTOM", "CENTER"];
const SIDE_WAVES_SEQ = ["LEFT", "CENTER", "RIGHT", "CENTER"];

// A map to make it easy to add more automated exercises later
const AUTOMATION_MAP = {
  "Automated: Wrist Waves (Up/Down)": WRIST_WAVES_SEQ,
  "Automated: Wrist Waves (Side/Side)": SIDE_WAVES_SEQ,
};

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

  // --- 1. ADDED NEW STATE ---
  // Check if an automation sequence exists to set the default state
  const getInitialExerciseType = () => {
    if (existingPrescription?.automationSequence) {
      // Find which key matches the existing sequence
      const foundKey = Object.keys(AUTOMATION_MAP).find(
        (key) =>
          JSON.stringify(AUTOMATION_MAP[key]) ===
          JSON.stringify(existingPrescription.automationSequence)
      );
      return foundKey || "manual"; // Default to manual if sequence is unknown
    }
    return "manual";
  };
  const [exerciseType, setExerciseType] = useState(getInitialExerciseType);
  // --- END OF NEW STATE ---

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

      // --- 2. UPDATED DATA PAYLOAD ---
      // Conditionally add the automation sequence
      automationSequence:
        exerciseType === "manual" ? [] : AUTOMATION_MAP[exerciseType],
      // --- END OF UPDATE ---
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
        // Note: We update the whole object, including new automation data
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
          {/* --- 3. ADDED NEW FORM GROUP --- */}
          <div className="form-group">
            <label htmlFor="exerciseType">Exercise Type:</label>
            <select
              id="exerciseType"
              value={exerciseType}
              onChange={(e) => setExerciseType(e.target.value)}
            >
              <option value="manual">Manual (IMU-based)</option>
              {/* Map over the automation options */}
              {Object.keys(AUTOMATION_MAP).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>
          {/* --- END OF NEW FORM GROUP --- */}

          <div className="form-group">
            <label htmlFor="exerciseName">Exercise Name:</label>
            <input
              type="text"
              id="exerciseName"
              value={exerciseName}
              onChange={(e) => setExerciseName(e.target.value)}
              placeholder={
                exerciseType === "manual"
                  ? "e.g., Manual Wrist Flex"
                  : "e.g., Assisted Wrist Waves"
              }
              required
            />
          </div>

          {/* Use a grid to put Reps and Sets side-by-side */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
            <div className="form-group">
              <label htmlFor="targetReps">
                {exerciseType === "manual" ? "Target Reps" : "Total Reps"}
              </label>
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
              <label htmlFor="targetSets">
                {exerciseType === "manual" ? "Target Sets" : "Total Sets"}
              </label>
              <input
                type="number"
                id="targetSets"
                value={targetSets}
                onChange={(e) => setTargetSets(e.target.value)}
                min="1"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="instructions">Instructions (one per line):</label>
            <textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows="3" // Shortened a bit
              placeholder="e.g., Flex your wrist upwards..."
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
