import React, { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "./socket";
import { Phone, Users } from "lucide-react";

const CallContext = createContext();

export const useCall = () => useContext(CallContext);

export const CallProvider = ({ children }) => {
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState(null);
  const [incomingGroupCall, setIncomingGroupCall] = useState(null);
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

    return () => {
      socket.off("connect");
    };
  }, [currentUserId]);

  /* 🚨 ATTACH CALL LISTENERS */
  useEffect(() => {
    const handleIncomingCall = ({ fromUserId, fromUsername, offer }) => {
      console.log("📞 1-to-1 CALL RECEIVED:", fromUsername);
      setIncomingCall({ fromUserId, fromUsername, offer });
    };

    const handleIncomingGroupCall = ({ fromUserId, fromUsername, roomId }) => {
      console.log("👥 GROUP CALL INVITATION RECEIVED:", fromUsername, "Room:", roomId);
      setIncomingGroupCall({ fromUserId, fromUsername, roomId });
    };

    const handleCallEnded = () => {
      console.log("📴 Call ended → clearing incomingCall state");
      setIncomingCall(null);
      setIncomingGroupCall(null);
    };

    socket.on("incoming-call", handleIncomingCall);
    socket.on("incoming-group-call", handleIncomingGroupCall);
    socket.on("call-ended", handleCallEnded);

    return () => {
      socket.off("incoming-call", handleIncomingCall);
      socket.off("incoming-group-call", handleIncomingGroupCall);
      socket.off("call-ended", handleCallEnded);
    };
  }, []);

  // Accept 1-to-1 Call
  const acceptCall = () => {
    if (!incomingCall) return;
    
    console.log("✅ Accepting 1-to-1 call from:", incomingCall.fromUsername);
    
    navigate(`/call?userId=${incomingCall.fromUserId}&username=${incomingCall.fromUsername}&incoming=true`);
    setIncomingCall(null);
  };

  // Decline 1-to-1 Call
  const declineCall = () => {
    if (!incomingCall) return;
    
    console.log("❌ Declining 1-to-1 call from:", incomingCall.fromUsername);
    
    socket.emit("decline-call", { 
      toUserId: incomingCall.fromUserId,
      fromUserId: currentUserId 
    });
    
    setIncomingCall(null);
  };

  // Accept Group Call
  const acceptGroupCall = () => {
    if (!incomingGroupCall) return;
    
    console.log("✅ Accepting group call from:", incomingGroupCall.fromUsername);
    
    navigate(`/call?groupCall=true&roomId=${incomingGroupCall.roomId}&username=${incomingGroupCall.fromUsername}`);
    setIncomingGroupCall(null);
  };

  // Decline Group Call
  const declineGroupCall = () => {
    if (!incomingGroupCall) return;
    
    console.log("❌ Declining group call from:", incomingGroupCall.fromUsername);
    
    socket.emit("decline-group-call", { 
      toUserId: incomingGroupCall.fromUserId,
      fromUserId: currentUserId,
      roomId: incomingGroupCall.roomId
    });
    
    setIncomingGroupCall(null);
  };

  return (
    <CallContext.Provider value={{ socket, incomingCall, setIncomingCall }}>
      {children}

      {/* 1-to-1 Incoming Call UI */}
      {incomingCall && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={iconContainerStyle}>
              <Phone size={50} color="#22c55e" />
            </div>
            <h2 style={titleStyle}>Incoming Call</h2>
            <p style={textStyle}>{incomingCall.fromUsername} is calling...</p>
            <div style={buttonContainerStyle}>
              <button onClick={acceptCall} style={acceptButtonStyle}>
                Accept
              </button>
              <button onClick={declineCall} style={declineButtonStyle}>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Call Invitation UI */}
      {incomingGroupCall && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={iconContainerStyle}>
              <Users size={50} color="#3b82f6" />
            </div>
            <h2 style={titleStyle}>Group Call Invitation</h2>
            <p style={textStyle}>{incomingGroupCall.fromUsername} invited you to a group call</p>
            <div style={buttonContainerStyle}>
              <button onClick={acceptGroupCall} style={groupAcceptButtonStyle}>
                Join Call
              </button>
              <button onClick={declineGroupCall} style={declineButtonStyle}>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.9)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999,
  backdropFilter: "blur(10px)",
};

const modalStyle = {
  background: "linear-gradient(135deg, #1a1f3a 0%, #0a0e27 100%)",
  padding: "40px",
  borderRadius: "20px",
  color: "white",
  textAlign: "center",
  minWidth: "320px",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
  animation: "slideIn 0.3s ease-out",
};

const iconContainerStyle = {
  marginBottom: "20px",
  animation: "pulse 2s infinite",
};

const titleStyle = {
  fontSize: "24px",
  fontWeight: "600",
  marginBottom: "10px",
  color: "#fff",
};

const textStyle = {
  fontSize: "16px",
  color: "rgba(255, 255, 255, 0.7)",
  marginBottom: "30px",
};

const buttonContainerStyle = {
  display: "flex",
  gap: "12px",
  justifyContent: "center",
};

const acceptButtonStyle = {
  background: "#22c55e",
  color: "white",
  border: "none",
  borderRadius: "50px",
  padding: "12px 32px",
  fontSize: "16px",
  fontWeight: "600",
  cursor: "pointer",
  transition: "all 0.3s ease",
  boxShadow: "0 4px 12px rgba(34, 197, 94, 0.3)",
};

const groupAcceptButtonStyle = {
  background: "#3b82f6",
  color: "white",
  border: "none",
  borderRadius: "50px",
  padding: "12px 32px",
  fontSize: "16px",
  fontWeight: "600",
  cursor: "pointer",
  transition: "all 0.3s ease",
  boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
};

const declineButtonStyle = {
  background: "#ef4444",
  color: "white",
  border: "none",
  borderRadius: "50px",
  padding: "12px 32px",
  fontSize: "16px",
  fontWeight: "600",
  cursor: "pointer",
  transition: "all 0.3s ease",
  boxShadow: "0 4px 12px rgba(239, 68, 68, 0.3)",
};