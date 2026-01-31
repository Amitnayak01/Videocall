import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import io from "socket.io-client";
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, Phone, 
  Monitor, Settings, MessageSquare, Users, Grid, 
  Volume2, VolumeX, Maximize, Minimize, MoreVertical 
} from "lucide-react";

const socket = io("http://localhost:5000");

const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

export default function VideoCall() {
  const [params] = useSearchParams();
  const targetUserId = params.get("userId");
  const targetUsername = params.get("username");
  const currentUserId = localStorage.getItem("userId");

  // Refs
  const localVideo = useRef();
  const remoteVideo = useRef();
  const peerConnection = useRef();
  const localStream = useRef();
  const dataChannel = useRef();

  // Call states
  const [callState, setCallState] = useState("idle"); // idle, calling, connected, ended
  const [callFrom, setCallFrom] = useState(null);
  const [incomingOffer, setIncomingOffer] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState("good");

  // Media controls
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // UI states
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layoutMode, setLayoutMode] = useState("focus"); // focus, grid, pip
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  // Statistics
  const [stats, setStats] = useState({
    bitrate: 0,
    packetLoss: 0,
    latency: 0
  });

  // REGISTER USER
  useEffect(() => {
    socket.emit("user-online", currentUserId);

    socket.on("incoming-call", ({ fromUserId, fromUsername, offer }) => {
      setCallFrom({ id: fromUserId, username: fromUsername });
      setIncomingOffer(offer);
      playRingtone();
    });

    socket.on("call-accepted", async ({ answer }) => {
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      setCallState("connected");
      stopRingtone();
      startCallTimer();
    });

    socket.on("call-declined", () => {
      alert("Call declined");
      endCall();
    });

    socket.on("call-ended", () => {
      endCall();
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      try {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    });

    socket.on("chat-message", ({ message, fromUserId }) => {
      setMessages(prev => [...prev, { 
        text: message, 
        sender: fromUserId === currentUserId ? "me" : "them",
        timestamp: new Date()
      }]);
    });

    return () => {
      socket.off("incoming-call");
      socket.off("call-accepted");
      socket.off("call-declined");
      socket.off("call-ended");
      socket.off("ice-candidate");
      socket.off("chat-message");
    };
  }, [currentUserId]);

  // Call timer
  useEffect(() => {
    let interval;
    if (callState === "connected") {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callState]);

  // Monitor connection quality
  useEffect(() => {
    let interval;
    if (callState === "connected" && peerConnection.current) {
      interval = setInterval(async () => {
        const stats = await peerConnection.current.getStats();
        let bitrate = 0;
        let packetLoss = 0;
        
        stats.forEach(report => {
          if (report.type === "inbound-rtp") {
            bitrate = report.bytesReceived * 8 / 1000;
            packetLoss = report.packetsLost || 0;
          }
        });

        setStats({ bitrate, packetLoss, latency: 0 });
        
        if (packetLoss > 100) setConnectionQuality("poor");
        else if (packetLoss > 50) setConnectionQuality("fair");
        else setConnectionQuality("good");
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const setupMedia = async (videoEnabled = true) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoEnabled ? { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        } : false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      localStream.current = stream;
      if (localVideo.current) {
        localVideo.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.error("Error accessing media devices:", err);
      throw err;
    }
  };

  const createPeer = (stream, toUserId, isInitiator = false) => {
    peerConnection.current = new RTCPeerConnection(configuration);

    // Add tracks
    stream.getTracks().forEach(track => {
      peerConnection.current.addTrack(track, stream);
    });

    // Create data channel for chat
    if (isInitiator) {
      dataChannel.current = peerConnection.current.createDataChannel("chat");
      setupDataChannel();
    } else {
      peerConnection.current.ondatachannel = (event) => {
        dataChannel.current = event.channel;
        setupDataChannel();
      };
    }

    // Handle remote stream
    peerConnection.current.ontrack = (event) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = event.streams[0];
      }
    };

    // Handle ICE candidates
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          toUserId,
          candidate: event.candidate
        });
      }
    };

    // Handle connection state
    peerConnection.current.onconnectionstatechange = () => {
      const state = peerConnection.current.connectionState;
      console.log("Connection state:", state);
      
      if (state === "disconnected" || state === "failed") {
        setConnectionQuality("poor");
      } else if (state === "connected") {
        setConnectionQuality("good");
      }
    };
  };

  const setupDataChannel = () => {
    if (dataChannel.current) {
      dataChannel.current.onmessage = (event) => {
        const message = JSON.parse(event.data);
        setMessages(prev => [...prev, {
          text: message.text,
          sender: "them",
          timestamp: new Date()
        }]);
      };
    }
  };

  // AUTO CALL WHEN PAGE OPENS
  useEffect(() => {
    if (targetUserId && targetUsername) {
      startCall();
    }
  }, [targetUserId, targetUsername]);

  const startCall = async () => {
    try {
      setCallState("calling");
      const stream = await setupMedia();
      createPeer(stream, targetUserId, true);

      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);

      socket.emit("call-user", {
        toUserId: targetUserId,
        fromUserId: currentUserId,
        fromUsername: localStorage.getItem("username") || "Anonymous",
        offer
      });
    } catch (err) {
      console.error("Error starting call:", err);
      alert("Failed to start call. Please check camera/microphone permissions.");
      setCallState("idle");
    }
  };

  const acceptCall = async () => {
    try {
      const stream = await setupMedia();
      createPeer(stream, callFrom.id, false);

      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);

      socket.emit("accept-call", {
        toUserId: callFrom.id,
        fromUserId: currentUserId,
        answer
      });

      setCallState("connected");
      setCallFrom(null);
      stopRingtone();
      startCallTimer();
    } catch (err) {
      console.error("Error accepting call:", err);
      alert("Failed to accept call.");
    }
  };

  const declineCall = () => {
    socket.emit("decline-call", {
      toUserId: callFrom.id,
      fromUserId: currentUserId
    });
    setCallFrom(null);
    setIncomingOffer(null);
    stopRingtone();
  };

  const endCall = useCallback(() => {
    if (peerConnection.current) {
      peerConnection.current.close();
    }
    
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
    }

    socket.emit("end-call", {
      toUserId: targetUserId,
      fromUserId: currentUserId
    });

    setCallState("ended");
    setTimeout(() => {
      window.close();
    }, 2000);
  }, [targetUserId, currentUserId]);

  const toggleMute = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream.current) {
      const videoTrack = localStream.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const toggleSpeaker = () => {
    if (remoteVideo.current) {
      remoteVideo.current.muted = !remoteVideo.current.muted;
      setIsSpeakerOff(remoteVideo.current.muted);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" },
          audio: false
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = peerConnection.current.getSenders().find(s => 
          s.track && s.track.kind === "video"
        );

        if (sender) {
          sender.replaceTrack(screenTrack);
        }

        screenTrack.onended = () => {
          toggleScreenShare();
        };

        setIsScreenSharing(true);
      } else {
        const videoTrack = localStream.current.getVideoTracks()[0];
        const sender = peerConnection.current.getSenders().find(s => 
          s.track && s.track.kind === "video"
        );

        if (sender) {
          sender.replaceTrack(videoTrack);
        }

        setIsScreenSharing(false);
      }
    } catch (err) {
      console.error("Error toggling screen share:", err);
    }
  };

  const sendMessage = () => {
    if (newMessage.trim() && dataChannel.current) {
      const message = {
        text: newMessage,
        timestamp: new Date()
      };
      
      dataChannel.current.send(JSON.stringify(message));
      setMessages(prev => [...prev, { ...message, sender: "me" }]);
      setNewMessage("");
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const formatDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const playRingtone = () => {
    // Implement ringtone audio
  };

  const stopRingtone = () => {
    // Stop ringtone audio
  };

  const startCallTimer = () => {
    setCallDuration(0);
  };

  return (
    <div style={{
      margin: 0,
      padding: 0,
      height: '100vh',
      width: '100vw',
      background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      overflow: 'hidden',
      position: 'relative'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
          box-sizing: border-box;
        }

        video {
          object-fit: cover;
          background: #000;
        }

        .control-btn {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
        }

        .control-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
        }

        .control-btn.active {
          background: rgba(239, 68, 68, 0.9);
          border-color: rgba(239, 68, 68, 1);
        }

        .control-btn.end-call {
          background: rgba(239, 68, 68, 0.9);
          border-color: rgba(239, 68, 68, 1);
          width: 64px;
          height: 64px;
        }

        .control-btn.end-call:hover {
          background: rgba(220, 38, 38, 1);
          transform: scale(1.05);
        }

        .chat-container {
          position: absolute;
          right: 20px;
          top: 80px;
          bottom: 120px;
          width: 350px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          backdrop-filter: blur(20px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        .message {
          margin-bottom: 12px;
          padding: 10px 14px;
          border-radius: 12px;
          max-width: 80%;
          word-wrap: break-word;
          animation: slideIn 0.3s ease;
        }

        .message.me {
          background: rgba(59, 130, 246, 0.9);
          margin-left: auto;
          text-align: right;
        }

        .message.them {
          background: rgba(255, 255, 255, 0.1);
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .stats-badge {
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stats-badge.good {
          background: rgba(34, 197, 94, 0.2);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .stats-badge.fair {
          background: rgba(251, 191, 36, 0.2);
          color: #fbbf24;
          border: 1px solid rgba(251, 191, 36, 0.3);
        }

        .stats-badge.poor {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .incoming-call-modal {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(15, 23, 42, 0.98);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 24px;
          padding: 40px;
          box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(20px);
          z-index: 1000;
          animation: modalIn 0.3s ease;
        }

        @keyframes modalIn {
          from {
            opacity: 0;
            transform: translate(-50%, -45%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }

        .pulse {
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>

      {/* Header */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: '20px 30px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 100%)',
        zIndex: 100
      }}>
        <div>
          <h2 style={{
            color: '#fff',
            fontSize: '24px',
            fontWeight: '600',
            margin: 0,
            marginBottom: '4px'
          }}>
            {callState === "calling" ? `Calling ${targetUsername}...` : 
             callState === "connected" ? targetUsername : 
             'Video Call'}
          </h2>
          {callState === "connected" && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '14px',
                fontWeight: '500'
              }}>
                {formatDuration(callDuration)}
              </span>
              <span className={`stats-badge ${connectionQuality}`}>
                {connectionQuality === "good" ? "HD" : 
                 connectionQuality === "fair" ? "SD" : "Poor"}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setLayoutMode(m => m === "focus" ? "grid" : "focus")}
            className="control-btn"
            title="Change Layout"
          >
            <Grid size={22} color="#fff" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="control-btn"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize size={22} color="#fff" /> : <Maximize size={22} color="#fff" />}
          </button>
        </div>
      </div>

      {/* Main Video Area */}
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}>
        {/* Remote Video */}
        <video
          ref={remoteVideo}
          autoPlay
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />

        {/* Local Video (PIP) */}
        <div style={{
          position: 'absolute',
          bottom: '120px',
          right: showChat ? '390px' : '20px',
          width: layoutMode === "grid" ? '45%' : '280px',
          height: layoutMode === "grid" ? '45%' : '200px',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '3px solid rgba(255, 255, 255, 0.3)',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
          transition: 'all 0.3s ease',
          background: '#000'
        }}>
          <video
            ref={localVideo}
            autoPlay
            muted
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scaleX(-1)'
            }}
          />
          {isVideoOff && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '14px'
            }}>
              Camera Off
            </div>
          )}
        </div>

        {/* Calling State */}
        {callState === "calling" && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center'
          }}>
            <div className="pulse" style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: 'rgba(59, 130, 246, 0.2)',
              border: '3px solid rgba(59, 130, 246, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <Phone size={48} color="#3b82f6" />
            </div>
            <p style={{ color: '#fff', fontSize: '18px', fontWeight: '500' }}>
              Calling {targetUsername}...
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{
        position: 'absolute',
        bottom: '30px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
        padding: '16px 24px',
        background: 'rgba(15, 23, 42, 0.8)',
        borderRadius: '60px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)'
      }}>
        <button
          onClick={toggleMute}
          className={`control-btn ${isMuted ? 'active' : ''}`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff size={22} color="#fff" /> : <Mic size={22} color="#fff" />}
        </button>

        <button
          onClick={toggleVideo}
          className={`control-btn ${isVideoOff ? 'active' : ''}`}
          title={isVideoOff ? "Turn On Camera" : "Turn Off Camera"}
        >
          {isVideoOff ? <VideoOff size={22} color="#fff" /> : <Video size={22} color="#fff" />}
        </button>

        <button
          onClick={toggleScreenShare}
          className={`control-btn ${isScreenSharing ? 'active' : ''}`}
          title="Share Screen"
        >
          <Monitor size={22} color="#fff" />
        </button>

        <button
          onClick={endCall}
          className="control-btn end-call"
          title="End Call"
        >
          <PhoneOff size={26} color="#fff" />
        </button>

        <button
          onClick={toggleSpeaker}
          className={`control-btn ${isSpeakerOff ? 'active' : ''}`}
          title={isSpeakerOff ? "Unmute Speaker" : "Mute Speaker"}
        >
          {isSpeakerOff ? <VolumeX size={22} color="#fff" /> : <Volume2 size={22} color="#fff" />}
        </button>

        <button
          onClick={() => setShowChat(!showChat)}
          className="control-btn"
          title="Chat"
        >
          <MessageSquare size={22} color="#fff" />
        </button>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="control-btn"
          title="Settings"
        >
          <Settings size={22} color="#fff" />
        </button>
      </div>

      {/* Chat Panel */}
      {showChat && (
        <div className="chat-container">
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h3 style={{ color: '#fff', margin: 0, fontSize: '16px', fontWeight: '600' }}>
              Chat
            </h3>
            <button
              onClick={() => setShowChat(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '20px',
                padding: '4px'
              }}
            >
              ×
            </button>
          </div>

          <div className="chat-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`message ${msg.sender}`}>
                <div style={{ color: '#fff', fontSize: '14px' }}>
                  {msg.text}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: 'rgba(255, 255, 255, 0.5)',
                  marginTop: '4px'
                }}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            padding: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            gap: '8px'
          }}>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message..."
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#fff',
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <button
              onClick={sendMessage}
              style={{
                background: 'rgba(59, 130, 246, 0.9)',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                color: '#fff',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Incoming Call Modal */}
      {callFrom && (
        <>
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            zIndex: 999
          }} />
          <div className="incoming-call-modal">
            <div style={{ textAlign: 'center' }}>
              <div className="pulse" style={{
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                background: 'rgba(34, 197, 94, 0.2)',
                border: '3px solid rgba(34, 197, 94, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px'
              }}>
                <Phone size={42} color="#22c55e" />
              </div>
              <h2 style={{
                color: '#fff',
                fontSize: '28px',
                fontWeight: '600',
                margin: '0 0 8px'
              }}>
                Incoming Call
              </h2>
              <p style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '18px',
                margin: '0 0 32px'
              }}>
                {callFrom.username} is calling...
              </p>
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                <button
                  onClick={declineCall}
                  style={{
                    background: 'rgba(239, 68, 68, 0.9)',
                    border: 'none',
                    borderRadius: '50px',
                    padding: '16px 32px',
                    color: '#fff',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <PhoneOff size={20} />
                  Decline
                </button>
                <button
                  onClick={acceptCall}
                  style={{
                    background: 'rgba(34, 197, 94, 0.9)',
                    border: 'none',
                    borderRadius: '50px',
                    padding: '16px 32px',
                    color: '#fff',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <Phone size={20} />
                  Accept
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}