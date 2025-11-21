// src/components/ProgressTracker.js

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

function ProgressTracker({ patientId }) {
  const [sessionHistory, setSessionHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [targetUserId, setTargetUserId] = useState(null);

  useEffect(() => {
    if (patientId) {
      setTargetUserId(patientId);
    } else {
      const user = auth.currentUser;
      setTargetUserId(user ? user.uid : null);
    }
  }, [patientId]);

  useEffect(() => {
    if (!targetUserId) {
      setIsLoading(false);
      setSessionHistory([]);
      return () => {};
    }
    setIsLoading(true);
    let unsubscribe = () => {};
    try {
      const sessionsRef = collection(db, "users01", targetUserId, "sessions");
      const q = query(sessionsRef, orderBy("timestamp", "asc"));
      unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const sessions = [];
          querySnapshot.forEach((doc) => {
            sessions.push({ id: doc.id, ...doc.data() });
          });
          setSessionHistory(sessions);
          setIsLoading(false);
        },
        (error) => {
          console.error(`Error fetching sessions: `, error);
          setIsLoading(false);
        }
      );
    } catch (error) {
      console.error("Error setting up listener:", error);
      setIsLoading(false);
    }
    return () => unsubscribe();
  }, [targetUserId]);

  // --- FIX 1: Graph Data Formatting ---
  // We now include the Time so points don't overlap on the same day
  const formatChartData = (history) => {
    if (!history) return [];
    return history.map((session) => {
      const dateObj = session.timestamp?.seconds
        ? new Date(session.timestamp.seconds * 1000)
        : null;

      return {
        // Create a unique label: "Nov 21, 10:30 AM"
        date: dateObj
          ? dateObj.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "N/A",
        Flexion: session.maxFlex,
        Extension: session.maxExt,
        Radial: session.maxRad,
        Ulnar: session.maxUln,
      };
    });
  };

  return (
    <section className="progress-tracking">
      <h2>Your Progress</h2>
      <div className="chart-container">
        <strong>Max Range of Motion</strong>
        {isLoading ? (
          <p>Loading chart data...</p>
        ) : sessionHistory.length === 0 ? (
          <p>No session data yet to display chart.</p>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <LineChart
              data={formatChartData(sessionHistory)}
              margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border-color)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                stroke="var(--text-secondary)"
                tick={{ fontSize: 11 }}
                tickMargin={10}
                // Only show every other label if it gets crowded, or remove interval to show all
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="var(--text-secondary)"
                width={60}
                tick={{ fontSize: 12 }}
                domain={[-180, 180]}
                label={{
                  value: "Degrees (°)",
                  angle: -90,
                  position: "insideLeft",
                  fill: "var(--text-secondary)",
                  style: { textAnchor: "middle" },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                }}
                itemStyle={{ fontSize: "0.9rem" }}
              />
              <Legend wrapperStyle={{ paddingTop: "20px" }} />
              <Line
                type="monotone"
                dataKey="Flexion"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Extension"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Radial"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Ulnar"
                stroke="#fbc531"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="session-summary">
        <h3>Recent Sessions</h3>
        {isLoading ? (
          <p>Loading session history...</p>
        ) : (
          <ul className="session-list">
            {sessionHistory.length > 0 ? (
              [...sessionHistory].reverse().map((session) => {
                // --- FIX 2: Determine Style based on Emergency Stop ---
                // Treat 'undefined' or 'false' as Safe. 'true' as Emergency.
                const isEmergency = session.wasEmergencyStop === true;
                const rowClass = isEmergency
                  ? "session-emergency"
                  : "session-safe";

                return (
                  <li key={session.id} className={rowClass}>
                    <div className="session-info">
                      <span className="session-date">
                        {session.timestamp?.seconds
                          ? new Date(
                              session.timestamp.seconds * 1000
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "N/A"}
                      </span>
                      <span className="session-exercise">
                        {session.exerciseName}
                      </span>
                      {/* Show Emergency Badge if true */}
                      {isEmergency && (
                        <span className="emergency-badge">
                          ⚠️ Emergency Stop Used
                        </span>
                      )}
                    </div>
                    <span className="session-reps">{session.reps} Reps</span>
                  </li>
                );
              })
            ) : (
              <p>No session data found.</p>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
export default ProgressTracker;
