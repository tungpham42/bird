// PrivacyPolicy.tsx
import React from "react";
import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <h1 style={styles.title}>Privacy Policy</h1>
        <p style={styles.text}>
          <strong>Last Updated:</strong> May 2026
        </p>

        <p style={styles.text}>
          Welcome to <strong>Softy Bird</strong>! We believe games should be fun
          and safe. Here is our incredibly simple privacy policy:
        </p>

        <ul style={styles.list}>
          <li style={styles.text}>
            <strong>Zero Data Collection:</strong> We do not collect, store, or
            share any personal information.
          </li>
          <li style={styles.text}>
            <strong>Local Gameplay:</strong> All game data, including your
            current score, is stored temporarily in your browser's memory and is
            erased the moment you close the tab.
          </li>
          <li style={styles.text}>
            <strong>No Trackers or Cookies:</strong> We do not use tracking
            cookies or third-party analytics.
          </li>
        </ul>

        <p style={styles.text}>
          Play freely, and try to beat your high score without worrying about
          your data!
        </p>

        <Link to="/" style={styles.button}>
          Return to Game
        </Link>
      </div>
    </div>
  );
}

// Simple inline styles to match your game's aesthetic
const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#70c5ce", // Sky blue background
    fontFamily: "sans-serif",
    padding: "20px",
  },
  panel: {
    backgroundColor: "#fff5eb",
    border: "6px solid #5c4033",
    borderRadius: "16px",
    padding: "30px",
    maxWidth: "600px",
    boxShadow: "0 10px 0 rgba(92, 64, 51, 0.2)",
  },
  title: {
    color: "#5c4033",
    marginTop: 0,
    fontSize: "2rem",
  },
  text: {
    color: "#5c4033",
    lineHeight: "1.6",
    fontSize: "1.1rem",
  },
  list: {
    paddingLeft: "20px",
    margin: "20px 0",
  },
  button: {
    display: "inline-block",
    marginTop: "20px",
    padding: "12px 24px",
    backgroundColor: "#ffd166",
    color: "#5c4033",
    textDecoration: "none",
    fontWeight: "bold",
    borderRadius: "8px",
    border: "4px solid #5c4033",
    boxShadow: "0 4px 0 #5c4033",
    cursor: "pointer",
  },
};
