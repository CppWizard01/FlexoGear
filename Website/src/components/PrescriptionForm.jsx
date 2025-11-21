// src/components/PrescriptionForm.js

import React, { useState } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  FaTimes,
  FaArrowUp,
  FaArrowDown,
  FaArrowLeft,
  FaArrowRight,
  FaDotCircle,
} from "react-icons/fa";

// --- UPDATED COMMAND LIST (With Diagonals) ---
const AVAILABLE_COMMANDS = [
  {
    label: "TOP_LEFT",
    icon: <FaArrowUp style={{ transform: "rotate(-45deg)" }} />,
  },
  { label: "TOP", icon: <FaArrowUp /> },
  {
    label: "TOP_RIGHT",
    icon: <FaArrowUp style={{ transform: "rotate(45deg)" }} />,
  },
  { label: "LEFT", icon: <FaArrowLeft /> },
  { label: "CENTER", icon: <FaDotCircle /> },
  { label: "RIGHT", icon: <FaArrowRight /> },
  {
    label: "BOTTOM_LEFT",
    icon: <FaArrowDown style={{ transform: "rotate(45deg)" }} />,
  },
  { label: "BOTTOM", icon: <FaArrowDown /> },
  {
    label: "BOTTOM_RIGHT",
    icon: <FaArrowDown style={{ transform: "rotate(-45deg)" }} />,
  },
];

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
    (
      existingPrescription?.instructions || ["Relax and let the device move."]
    ).join("\n")
  );

  const [isAutomated, setIsAutomated] = useState(
    existingPrescription?.automationSequence &&
      existingPrescription.automationSequence.length > 0
  );

  const [customSequence, setCustomSequence] = useState(
    existingPrescription?.automationSequence || []
  );

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const isEditing = Boolean(existingPrescription);

  const addToSequence = (command) => {
    setCustomSequence([...customSequence, command]);
  };

  const removeFromSequence = (indexToRemove) => {
    setCustomSequence(
      customSequence.filter((_, index) => index !== indexToRemove)
    );
  };

  const clearSequence = () => {
    setCustomSequence([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSaving(true);

    if (!patientId) {
      setError("No patient selected.");
      setIsSaving(false);
      return;
    }

    if (isAutomated && customSequence.length < 2) {
      setError(
        "Automated exercises must have at least 2 steps in the sequence."
      );
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
      automationSequence: isAutomated ? customSequence : [],
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
      console.error("Error saving prescription: ", err);
      setError("Failed to save prescription.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content prescription-form">
        <h2>{isEditing ? "Edit Prescription" : "Assign New Exercise"}</h2>

        <form onSubmit={handleSubmit}>
          {/* Exercise Type Toggle */}
          <div className="form-group">
            <label>Exercise Type:</label>
            <div className="type-toggle">
              <button
                type="button"
                className={!isAutomated ? "active" : ""}
                onClick={() => {
                  setIsAutomated(false);
                  setCustomSequence([]);
                }}
              >
                Manual (IMU)
              </button>
              <button
                type="button"
                className={isAutomated ? "active" : ""}
                onClick={() => setIsAutomated(true)}
              >
                Automated (Motor)
              </button>
            </div>
          </div>

          {/* Sequence Builder */}
          {isAutomated && (
            <div className="sequence-builder">
              <label>Build Sequence (Click to add step):</label>

              <div className="builder-controls">
                {AVAILABLE_COMMANDS.map((cmd) => (
                  <button
                    key={cmd.label}
                    type="button"
                    className="builder-btn"
                    onClick={() => addToSequence(cmd.label)}
                  >
                    {cmd.icon} {cmd.label.replace("_", " ")}
                  </button>
                ))}
              </div>

              <div className="sequence-display">
                {customSequence.length === 0 ? (
                  <span className="empty-msg">
                    No steps added yet. Click buttons above.
                  </span>
                ) : (
                  customSequence.map((step, index) => (
                    <div key={index} className="sequence-step">
                      <span className="step-index">{index + 1}</span>
                      <span className="step-name">{step}</span>
                      <FaTimes
                        className="remove-step-icon"
                        onClick={() => removeFromSequence(index)}
                      />
                      {index < customSequence.length - 1 && (
                        <div className="connector-line"></div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {customSequence.length > 0 && (
                <button
                  type="button"
                  className="clear-seq-btn"
                  onClick={clearSequence}
                >
                  Clear Sequence
                </button>
              )}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="exerciseName">Exercise Name:</label>
            <input
              type="text"
              id="exerciseName"
              value={exerciseName}
              onChange={(e) => setExerciseName(e.target.value)}
              placeholder="e.g., Custom Motor Wave"
              required
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
            <div className="form-group">
              <label htmlFor="targetReps">
                {isAutomated ? "Loops (Reps)" : "Target Reps"}
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
              <label htmlFor="targetSets">Total Sets</label>
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
            <label htmlFor="instructions">Instructions:</label>
            <textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows="3"
              required
            />
          </div>

          {error && <p className="error-message">{error}</p>}

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="cancel-btn"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button type="submit" className="save-btn" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Prescription"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PrescriptionForm;
