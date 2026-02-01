import React, { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "./socket";
import { Phone, PhoneOff } from "lucide-react";

const CallContext = createContext();

export const useCall = () => useContext(CallContext);

export const CallProvider = ({ children }) => {
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState(null);
  const currentUserId = localStorage.getItem("userId");

  /* 🔥 REGISTER USER ONLINE ASAP */
  useEffect(() => {
    if (!currentUserId) return;

    if (socket.connected) {
      socket.emit("user-online", currentUserId);
    }

    socket.on("connect", () => {
      console.log("🟢 Socket connected:", socket.id);
      socket.emit("user-online", currentUserId);
    });

  }, [currentUserId]);

  /* 🚨 ATTACH CALL LISTENER ONCE */
  useEffect(() => {
  const handleIncomingCall = ({ fromUserId, fromUsername, offer }) => {
    console.log("📞 CALL RECEIVED:", fromUsername);
    setIncomingCall({ fromUserId, fromUsername, offer });
  };

  socket.on("incoming-call", handleIncomingCall);

  // 🔥 ADD THIS
  const handleCallEnded = () => {
    console.log("📴 Call ended → clearing incomingCall state");
    setIncomingCall(null);
  };

  socket.on("call-ended", handleCallEnded);

  return () => {
    socket.off("incoming-call", handleIncomingCall);
    socket.off("call-ended", handleCallEnded); // 🔥 cleanup
  };
}, []);


  const acceptCall = () => {
    navigate(`/call?userId=${incomingCall.fromUserId}&username=${incomingCall.fromUsername}&incoming=true`);
    setIncomingCall(null);
  };

  const declineCall = () => {
  if (!incomingCall) return;
  socket.emit("decline-call", { toUserId: incomingCall.fromUserId });
  setIncomingCall(null);
};


  return (
    <CallContext.Provider value={{ socket }}>
      {children}

      {incomingCall && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <Phone size={50} color="#22c55e" />
            <h2>Incoming Call</h2>
            <p>{incomingCall.fromUsername} is calling...</p>
            <button onClick={acceptCall}>Accept</button>
            <button onClick={declineCall}>Decline</button>
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.8)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999,
};

const modalStyle = {
  background: "#111",
  padding: "30px",
  borderRadius: "10px",
  color: "white",
  textAlign: "center",
};
