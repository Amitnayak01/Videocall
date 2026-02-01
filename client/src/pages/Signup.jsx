import React, { useState } from "react";
import api from "../api";
import { useNavigate, Link } from "react-router-dom";
import "./Auth.css";

export default function Signup() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async () => {
    if (p !== c) {
      alert("Passwords mismatch");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/signup", { username: u, password: p });
      nav("/");
    } catch (error) {
      alert("Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      submit();
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Join Video Call App today</p>
        </div>

        <div className="auth-form">
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="Choose a username"
              value={u}
              onChange={(e) => setU(e.target.value)}
              onKeyPress={handleKeyPress}
              className="auth-input"
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Create a password"
              value={p}
              onChange={(e) => setP(e.target.value)}
              onKeyPress={handleKeyPress}
              className="auth-input"
            />
          </div>

          <div className="input-group">
            <label htmlFor="confirm">Confirm Password</label>
            <input
              id="confirm"
              type="password"
              placeholder="Confirm your password"
              value={c}
              onChange={(e) => setC(e.target.value)}
              onKeyPress={handleKeyPress}
              className="auth-input"
            />
          </div>

          <button
            onClick={submit}
            disabled={loading}
            className="auth-button primary"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>

          <div className="auth-footer">
            <p>
              Already have an account?{" "}
              <Link to="/" className="auth-link">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>

      <div className="auth-background">
        <div className="gradient-orb orb-1"></div>
        <div className="gradient-orb orb-2"></div>
        <div className="gradient-orb orb-3"></div>
      </div>
    </div>
  );
}