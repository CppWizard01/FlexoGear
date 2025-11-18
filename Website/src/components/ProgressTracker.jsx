// Updated ProgressTracker.js

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

  // Effect 1: Determine targetUserId
  useEffect(() => {
    if (patientId) {
      setTargetUserId(patientId);
    } else {
      const user = auth.currentUser;
      setTargetUserId(user ? user.uid : null);
    }
  }, [patientId]);

  // Effect 2: Set up listener based on targetUserId
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
      ); // Keep error log
    } catch (error) {
      console.error("Error setting up listener:", error);
      setIsLoading(false);
    } // Keep error log
    return () => unsubscribe();
  }, [targetUserId]);

  // Data formatting for chart
  const formatChartData = (history) => {
    if (!history) return [];
    return history.map((session) => ({
      date: session.timestamp?.seconds
        ? new Date(session.timestamp.seconds * 1000).toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric" }
          )
        : "N/A",
      Flexion: session.maxFlex,
      Extension: session.maxExt,
      Radial: session.maxRad,
      Ulnar: session.maxUln,
    }));
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
          /* Inside ProgressTracker.js */

          <ResponsiveContainer width="100%" height={350}>
            <LineChart
              data={formatChartData(sessionHistory)}
              // FIX 1: Add 'left: 10' or '20' to give the SVG container some internal padding
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
                tick={{ fontSize: 12 }}
                tickMargin={10}
              />
              <YAxis
                stroke="var(--text-secondary)"
                // FIX 2: Increased width from 45 to 60 to fit "-180" AND the label
                width={60}
                tick={{ fontSize: 12 }}
                domain={[-180, 180]}
                label={{
                  value: "Degrees (°)",
                  angle: -90,
                  position: "insideLeft", // Puts it inside the reserved width
                  fill: "var(--text-secondary)",
                  style: { textAnchor: "middle" },
                  // FIX 3: No negative offset needed if width is sufficient,
                  // but we can add a small 'dy' to center it vertically if needed.
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
                // activeDot={{ r: 6 }}
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
                stroke="#f59e0b"
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
              [...sessionHistory].reverse().map((session) => (
                // --- THIS IS THE UPDATED BLOCK ---
                <li key={session.id}>
                  <div className="session-info">
                    <span className="session-date">
                      {session.timestamp?.seconds
                        ? new Date(
                            session.timestamp.seconds * 1000
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "N/A"}
                    </span>
                    <span className="session-exercise">
                      {session.exerciseName}
                    </span>
                  </div>
                  <span className="session-reps">{session.reps} Reps</span>
                </li>
                // --- END OF UPDATED BLOCK ---
              ))
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
