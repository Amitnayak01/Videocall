import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import VideoCall from "./pages/VideoCall";
import Profile from "./pages/Profile";
import Home from "./pages/Home";
import UserProfile from "./pages/UserProfile";

const PrivateRoute = ({ children }) =>
  localStorage.getItem("token") ? children : <Navigate to="/login" />;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
<Route path="/profile/:id" element={<PrivateRoute><UserProfile /></PrivateRoute>} />

        {/* Home page after login */}
        <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />

        {/* Auth pages */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* App pages */}
        <Route path="/call" element={<PrivateRoute><VideoCall /></PrivateRoute>} />
        <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />

      </Routes>
    </BrowserRouter>
  );
}
