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
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={formatChartData(sessionHistory)}
              margin={{ top: 20, right: 20, left: -10, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border-color)"
              />
              <XAxis dataKey="date" stroke="var(--text-secondary)" />
              <YAxis
                stroke="var(--text-secondary)"
                label={{
                  value: "Degrees",
                  angle: -90,
                  position: "insideLeft",
                  fill: "var(--text-secondary)",
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card-background)",
                  border: "1px solid var(--border-color)",
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="Flexion"
                stroke="#e94560"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Extension"
                stroke="#53a8b6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Radial"
                stroke="#82ca9d"
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
              [...sessionHistory].reverse().map((session) => (
                <li key={session.id}>
                  <span className="session-date">
                    {session.timestamp?.seconds
                      ? new Date(
                          session.timestamp.seconds * 1000
                        ).toLocaleDateString()
                      : "N/A"}
                  </span>
                  <span className="session-exercise">
                    {session.exerciseName}
                  </span>
                  <span className="session-reps">{session.reps} Reps</span>
                </li>
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
