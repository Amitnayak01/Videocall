import React, { useState, useEffect } from "react";
import api from "../api";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    if (localStorage.getItem("token")) {
      nav("/call");
    }
  }, []);

  const login = async () => {
    const res = await api.post("/auth/login", { username: u, password: p });
    localStorage.setItem("token", res.data.token);
    nav("/");
  };

  return (
    <div className="center">
      <h2>Login</h2>
      <input placeholder="Username" onChange={e => setU(e.target.value)} />
      <input type="password" placeholder="Password" onChange={e => setP(e.target.value)} />
      <button onClick={login}>Login</button>

      <p style={{ marginTop: "10px" }}>
        Don't have an account? <Link to="/signup">Signup</Link>
      </p>
    </div>
  );
}
