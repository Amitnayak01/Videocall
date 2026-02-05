import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useCall } from "../CallContext";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, Monitor, Grid, Volume2, VolumeX, Maximize, Minimize, User, Wifi, WifiOff, UserPlus, Search, X } from "lucide-react";
import { RefreshCcw } from "lucide-react";
import api from "../api";

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ],
  iceCandidatePoolSize: 10
};

export default function VideoCall() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { socket, incomingCall, setIncomingCall } = useCall();
  
  const targetUserId = params.get("userId");
  const targetUsername = params.get("username");
  const isIncoming = params.get("incoming") === "true";
  const isGroupCall = params.get("groupCall") === "true";
  const roomIdFromParams = params.get("roomId");
  const currentUserId = localStorage.getItem("userId");

  // Refs
  const localVideo = useRef();
  const remoteVideos = useRef({}); // { peerId: videoElement }
  const peerConnections = useRef({}); // { peerId: RTCPeerConnection }
  const localStream = useRef();
  const pendingCandidates = useRef({});

  // States
  const [callState, setCallState] = useState("idle");
  const [callDuration, setCallDuration] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState("good");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layoutMode, setLayoutMode] = useState("focus");
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [cameraFacing, setCameraFacing] = useState("user");
  const [isLocalFullscreen, setIsLocalFullscreen] = useState(false);
  
  // Group call states
  const [participants, setParticipants] = useState([]); // [{ userId, username, profilePic }]
  const [roomId, setRoomId] = useState(roomIdFromParams || null);
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const pipRef = useRef(null);
  const [pipPosition, setPipPosition] = useState({ x: 0, y: 0 });
  const dragData = useRef({ dragging: false, offsetX: 0, offsetY: 0 });

  const startDrag = (e) => {
    if (layoutMode !== "focus" || isLocalFullscreen) return;

    const rect = pipRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    dragData.current = {
      dragging: true,
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top
    };
  };

  const onDrag = (e) => {
    if (!dragData.current.dragging) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const x = clientX - dragData.current.offsetX;
    const y = clientY - dragData.current.offsetY;

    setPipPosition({ x, y });
  };

  const endDrag = () => {
    if (!dragData.current.dragging) return;
    dragData.current.dragging = false;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const rect = pipRef.current.getBoundingClientRect();

    const snapX = rect.left < screenW / 2 ? 16 : screenW - rect.width - 16;
    const snapY = rect.top < screenH / 2 ? 16 : screenH - rect.height - 120;

    setPipPosition({ x: snapX, y: snapY });
  };

  useEffect(() => {
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchmove", onDrag);
    window.addEventListener("touchend", endDrag);
    return () => {
      window.removeEventListener("mousemove", onDrag);
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("touchmove", onDrag);
      window.removeEventListener("touchend", endDrag);
    };
  }, []);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-hide controls
  useEffect(() => {
    if (callState !== "connected") return;
    let timeout;
    const resetTimeout = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 3000);
    };
    resetTimeout();
    document.addEventListener('mousemove', resetTimeout);
    document.addEventListener('touchstart', resetTimeout);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousemove', resetTimeout);
      document.removeEventListener('touchstart', resetTimeout);
    };
  }, [callState]);

  // Cleanup
  const cleanup = useCallback(() => {
    Object.values(peerConnections.current).forEach(pc => pc?.close());
    localStream.current?.getTracks().forEach(t => t.stop());
    if (localVideo.current) localVideo.current.srcObject = null;
    Object.values(remoteVideos.current).forEach(video => {
      if (video) video.srcObject = null;
    });
    
    if (roomId) {
      socket.emit("leave-room", { roomId, userId: currentUserId });
    }
    
    navigate(-1);
  }, [navigate, roomId, socket, currentUserId]);

  const switchCamera = async () => {
    try {
      if (!localStream.current) return;

      const currentVideoTrack = localStream.current.getVideoTracks()[0];
      if (currentVideoTrack) currentVideoTrack.stop();

      const newFacing = cameraFacing === "user" ? "environment" : "user";

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: newFacing } },
        audio: false
      });

      const newVideoTrack = newStream.getVideoTracks()[0];

      // Replace track in all peer connections
      Object.values(peerConnections.current).forEach(pc => {
        const sender = pc?.getSenders().find(s => s.track?.kind === "video");
        if (sender) sender.replaceTrack(newVideoTrack);
      });

      localStream.current.removeTrack(currentVideoTrack);
      localStream.current.addTrack(newVideoTrack);

      localVideo.current.srcObject = localStream.current;

      setCameraFacing(newFacing);
    } catch (err) {
      console.error("Camera switch error:", err);
    }
  };

  // Fetch all users for Add Participant modal
  const fetchAllUsers = async () => {
    try {
      setLoadingUsers(true);
      const token = localStorage.getItem("token");
      const res = await api.get("/auth/users", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAllUsers(res.data.filter(u => u._id !== currentUserId));
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Socket Events
  useEffect(() => {
    const handlers = {
      "call-accepted": async ({ answer }) => {
        // For 1-to-1 calls
        if (!isGroupCall && peerConnections.current[targetUserId]) {
          await peerConnections.current[targetUserId].setRemoteDescription(new RTCSessionDescription(answer));
          const pending = pendingCandidates.current[targetUserId] || [];
          for (const c of pending) {
            await peerConnections.current[targetUserId].addIceCandidate(new RTCIceCandidate(c));
          }
          pendingCandidates.current[targetUserId] = [];
          setCallState("connected");
          setCallDuration(0);
        }
      },
      
      "call-declined": () => { 
        alert("Call declined"); 
        cleanup(); 
      },
      
      "call-ended": cleanup,
      
      "ice-candidate": async ({ candidate, fromUserId }) => {
        const peerId = fromUserId;
        if (peerConnections.current[peerId]?.remoteDescription) {
          await peerConnections.current[peerId].addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          if (!pendingCandidates.current[peerId]) pendingCandidates.current[peerId] = [];
          pendingCandidates.current[peerId].push(candidate);
        }
      },

      // Group call events
      "room-joined": ({ roomId: joinedRoomId, participants: roomParticipants }) => {
        console.log("✅ Joined room:", joinedRoomId, "Participants:", roomParticipants);
        setRoomId(joinedRoomId);
        setParticipants(roomParticipants.filter(p => p.userId !== currentUserId));
        setCallState("connected");
      },

      "new-participant": async ({ userId, username, profilePic, offer }) => {
        console.log("👤 New participant joined:", username);
        
        // Add to participants list
        setParticipants(prev => {
          if (prev.find(p => p.userId === userId)) return prev;
          return [...prev, { userId, username, profilePic }];
        });

        // Create peer connection for new participant
        const pc = createPeerConnection(userId);
        
        // Set remote description (offer from new participant)
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Create answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        // Send answer back
        socket.emit("webrtc-answer", {
          roomId,
          toUserId: userId,
          fromUserId: currentUserId,
          answer: pc.localDescription
        });

        setHasRemoteStream(true);
      },

      "webrtc-offer": async ({ fromUserId, offer }) => {
        console.log("📞 Received offer from:", fromUserId);
        
        const pc = createPeerConnection(fromUserId);
        
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit("webrtc-answer", {
          roomId,
          toUserId: fromUserId,
          fromUserId: currentUserId,
          answer: pc.localDescription
        });
      },

      "webrtc-answer": async ({ fromUserId, answer }) => {
        console.log("✅ Received answer from:", fromUserId);
        
        if (peerConnections.current[fromUserId]) {
          await peerConnections.current[fromUserId].setRemoteDescription(new RTCSessionDescription(answer));
          
          // Add pending candidates
          const pending = pendingCandidates.current[fromUserId] || [];
          for (const c of pending) {
            await peerConnections.current[fromUserId].addIceCandidate(new RTCIceCandidate(c));
          }
          pendingCandidates.current[fromUserId] = [];
        }
      },

      "participant-left": ({ userId, username }) => {
        console.log("👋 Participant left:", username);
        
        // Remove from participants
        setParticipants(prev => prev.filter(p => p.userId !== userId));
        
        // Close peer connection
        if (peerConnections.current[userId]) {
          peerConnections.current[userId].close();
          delete peerConnections.current[userId];
        }
        
        // Remove video element
        if (remoteVideos.current[userId]) {
          delete remoteVideos.current[userId];
        }
      },

      "online-users": (users) => {
        setOnlineUsers(users);
      }
    };

    Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));
    return () => Object.keys(handlers).forEach(e => socket.off(e));
  }, [socket, cleanup, isGroupCall, targetUserId, roomId, currentUserId]);

  // Call Timer
  useEffect(() => {
    if (callState !== "connected") return;
    const interval = setInterval(() => setCallDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, [callState]);

  // Setup Media
  const setupMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    localStream.current = stream;
    if (localVideo.current) localVideo.current.srcObject = stream;
    return stream;
  };

  // Create Peer Connection
  const createPeerConnection = (peerId) => {
    if (peerConnections.current[peerId]) {
      return peerConnections.current[peerId];
    }

    const pc = new RTCPeerConnection(ICE_CONFIG);
    
    // Add local stream tracks
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current);
      });
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log("🎥 Received track from:", peerId);
      
      if (event.streams[0]) {
        // Create or get video element for this peer
        if (!remoteVideos.current[peerId]) {
          const videoElement = document.createElement('video');
          videoElement.autoplay = true;
          videoElement.playsInline = true;
          videoElement.id = `remote-video-${peerId}`;
          remoteVideos.current[peerId] = videoElement;
        }
        
        remoteVideos.current[peerId].srcObject = event.streams[0];
        setHasRemoteStream(true);
        
        // Force re-render
        setParticipants(prev => [...prev]);
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        if (isGroupCall) {
          socket.emit("ice-candidate", { 
            roomId, 
            toUserId: peerId, 
            fromUserId: currentUserId,
            candidate: event.candidate 
          });
        } else {
          socket.emit("ice-candidate", { 
            toUserId: peerId, 
            candidate: event.candidate 
          });
        }
      }
    };

    // Handle connection state
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`ICE connection state for ${peerId}:`, state);
      setConnectionQuality(state === "connected" || state === "completed" ? "good" : 
                          state === "disconnected" ? "fair" : "poor");
    };

    peerConnections.current[peerId] = pc;
    return pc;
  };

  // Start Outgoing 1-to-1 Call
  const startCall = async () => {
    try {
      setCallState("calling");
      const stream = await setupMedia();
      createPeerConnection(targetUserId);
      const offer = await peerConnections.current[targetUserId].createOffer({ 
        offerToReceiveAudio: true, 
        offerToReceiveVideo: true 
      });
      await peerConnections.current[targetUserId].setLocalDescription(offer);
      socket.emit("call-user", {
        toUserId: targetUserId,
        fromUserId: currentUserId,
        fromUsername: localStorage.getItem("username") || "Anonymous",
        offer: peerConnections.current[targetUserId].localDescription
      });
    } catch (err) {
      alert("Failed to start call. Check permissions.");
      cleanup();
    }
  };

  // Accept Incoming 1-to-1 Call
  const acceptCall = async () => {
    if (!incomingCall) return;
    try {
      setCallState("connecting");
      const stream = await setupMedia();
      createPeerConnection(incomingCall.fromUserId);
      await peerConnections.current[incomingCall.fromUserId].setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const answer = await peerConnections.current[incomingCall.fromUserId].createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peerConnections.current[incomingCall.fromUserId].setLocalDescription(answer);
      socket.emit("accept-call", {
        toUserId: incomingCall.fromUserId,
        fromUserId: currentUserId,
        answer: peerConnections.current[incomingCall.fromUserId].localDescription
      });
      setCallState("connected");
      setIncomingCall(null);
      setCallDuration(0);
    } catch (err) {
      alert("Failed to accept call. Check permissions.");
      cleanup();
    }
  };

  // Start Group Call
  const startGroupCall = async () => {
    try {
      setCallState("connecting");
      const stream = await setupMedia();
      
      const newRoomId = `room-${currentUserId}-${Date.now()}`;
      setRoomId(newRoomId);
      
      socket.emit("create-room", {
        roomId: newRoomId,
        userId: currentUserId,
        username: localStorage.getItem("username") || "Anonymous",
        profilePic: localStorage.getItem("profilePic") || ""
      });
      
      setCallState("connected");
      setCallDuration(0);
    } catch (err) {
      console.error("Failed to start group call:", err);
      alert("Failed to start group call. Check permissions.");
      cleanup();
    }
  };

  // Join Group Call
  const joinGroupCall = async (joinRoomId) => {
    try {
      setCallState("connecting");
      const stream = await setupMedia();
      
      socket.emit("join-room", {
        roomId: joinRoomId,
        userId: currentUserId,
        username: localStorage.getItem("username") || "Anonymous",
        profilePic: localStorage.getItem("profilePic") || ""
      });
    } catch (err) {
      console.error("Failed to join group call:", err);
      alert("Failed to join group call. Check permissions.");
      cleanup();
    }
  };

  // Send offers to existing participants
  const sendOffersToParticipants = async (participantsList) => {
    for (const participant of participantsList) {
      if (participant.userId === currentUserId) continue;
      
      const pc = createPeerConnection(participant.userId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socket.emit("webrtc-offer", {
        roomId,
        toUserId: participant.userId,
        fromUserId: currentUserId,
        offer: pc.localDescription
      });
    }
  };

  // Initialize Call
  useEffect(() => {
    let initialized = false;
    if (!initialized) {
      if (isGroupCall && roomIdFromParams) {
        // Joining existing group call
        joinGroupCall(roomIdFromParams);
      } else if (isIncoming && incomingCall) {
        // Accepting 1-to-1 call
        acceptCall();
      } else if (targetUserId && targetUsername && !isIncoming) {
        // Starting 1-to-1 call
        startCall();
      }
      initialized = true;
    }
  }, []);

  // End Call
  const endCall = () => {
    if (isGroupCall && roomId) {
      socket.emit("leave-room", { roomId, userId: currentUserId });
    } else {
      socket.emit("end-call", { toUserId: targetUserId, fromUserId: currentUserId });
    }
    setCallState("ended");
    setTimeout(cleanup, 1000);
  };

  // Media Controls
  const toggleMute = () => {
    const track = localStream.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  };

  const toggleVideo = () => {
    const track = localStream.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsVideoOff(!track.enabled);
    }
  };

  const toggleSpeaker = () => {
    Object.values(remoteVideos.current).forEach(video => {
      if (video) video.muted = !video.muted;
    });
    setIsSpeakerOff(!isSpeakerOff);
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Replace video track in all peer connections
        Object.values(peerConnections.current).forEach(pc => {
          const sender = pc?.getSenders().find(s => s.track?.kind === "video");
          if (sender) sender.replaceTrack(screenTrack);
        });
        
        screenTrack.onended = () => toggleScreenShare();
        setIsScreenSharing(true);
      } else {
        const videoTrack = localStream.current.getVideoTracks()[0];
        
        // Restore camera track
        Object.values(peerConnections.current).forEach(pc => {
          const sender = pc?.getSenders().find(s => s.track?.kind === "video");
          if (sender) sender.replaceTrack(videoTrack);
        });
        
        setIsScreenSharing(false);
      }
    } catch (err) {
      console.error("Screen share error:", err);
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

  // Open Add Participant Modal
  const openAddParticipantModal = () => {
    fetchAllUsers();
    setShowAddParticipantModal(true);
  };

  // Invite users to group call
  const inviteUsersToCall = () => {
    if (selectedUsers.length === 0) {
      alert("Please select at least one user");
      return;
    }

    let callRoomId = roomId;
    
    // If not in a group call yet, create one
    if (!isGroupCall || !roomId) {
      callRoomId = `room-${currentUserId}-${Date.now()}`;
      setRoomId(callRoomId);
      
      socket.emit("create-room", {
        roomId: callRoomId,
        userId: currentUserId,
        username: localStorage.getItem("username") || "Anonymous",
        profilePic: localStorage.getItem("profilePic") || ""
      });
      
      setCallState("connected");
    }

    // Send invitations
    selectedUsers.forEach(userId => {
      socket.emit("invite-to-group-call", {
        toUserId: userId,
        fromUserId: currentUserId,
        fromUsername: localStorage.getItem("username") || "Anonymous",
        roomId: callRoomId
      });
    });

    setShowAddParticipantModal(false);
    setSelectedUsers([]);
    alert(`Invited ${selectedUsers.length} user(s) to the call`);
  };

  const formatDuration = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}` 
                 : `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Filter users for modal
  const filteredUsers = allUsers.filter(user => 
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) &&
    !participants.find(p => p.userId === user._id)
  );

  return (
    <div className="video-call-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .video-call-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          overflow: hidden;
          color: white;
        }

        /* Header */
        .call-header {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          padding: clamp(12px, 3vw, 24px);
          background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%);
          z-index: 100;
          transition: opacity 0.3s ease, transform 0.3s ease;
        }

        .call-header.hidden {
          opacity: 0;
          transform: translateY(-100%);
          pointer-events: none;
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 1400px;
          margin: 0 auto;
        }

        .header-info h2 {
          font-size: clamp(16px, 4vw, 24px);
          font-weight: 700;
          margin-bottom: 6px;
          letter-spacing: -0.02em;
        }

        .header-meta {
          display: flex;
          gap: clamp(8px, 2vw, 16px);
          align-items: center;
          flex-wrap: wrap;
        }

        .duration-badge, .quality-badge {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: clamp(11px, 2.5vw, 13px);
          font-weight: 600;
          backdrop-filter: blur(10px);
          white-space: nowrap;
        }

        .duration-badge {
          background: rgba(59, 130, 246, 0.2);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }

        .quality-badge {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .quality-badge.good { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
        .quality-badge.fair { background: rgba(251, 191, 36, 0.2); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); }
        .quality-badge.poor { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }

        .header-actions {
          display: flex;
          gap: clamp(8px, 2vw, 12px);
        }

        /* Video Layout */
        .video-layout {
          width: 100%;
          height: 100%;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Grid layout for multiple participants */
        .participants-grid {
          display: grid;
          gap: 8px;
          padding: 8px;
          width: 100%;
          height: 100%;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          grid-auto-rows: minmax(200px, 1fr);
        }

        .participants-grid.count-2 {
          grid-template-columns: 1fr 1fr;
        }

        .participants-grid.count-3 {
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
        }

        .participants-grid.count-4 {
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
        }

        .participants-grid.count-5,
        .participants-grid.count-6 {
          grid-template-columns: repeat(3, 1fr);
        }

        @media (max-width: 768px) {
          .participants-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }

        @media (max-width: 480px) {
          .participants-grid {
            grid-template-columns: 1fr !important;
          }
        }

        .participant-video-container {
          position: relative;
          background: #000;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid rgba(255, 255, 255, 0.1);
        }

        .participant-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .participant-name {
          position: absolute;
          bottom: 12px;
          left: 12px;
          background: rgba(0, 0, 0, 0.7);
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          backdrop-filter: blur(10px);
        }

        /* Remote Video (for 1-to-1) */
        .remote-video-container {
          width: 100%;
          height: 100%;
          position: relative;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .remote-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          background: #000;
        }

        /* Local Video (PiP) */
        .local-video-container {
          position: absolute;
          bottom: clamp(80px, 15vh, 140px);
          right: clamp(12px, 3vw, 30px);
          width: clamp(120px, 25vw, 280px);
          height: clamp(90px, 18vw, 200px);
          border-radius: clamp(12px, 2vw, 20px);
          overflow: hidden;
          border: 3px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
          background: #000;
          z-index: 50;
          transition: all 0.3s ease;
        }

        @media (max-width: 768px) {
          .local-video-container {
            width: clamp(100px, 30vw, 160px);
            height: clamp(75px, 22vw, 120px);
            bottom: clamp(100px, 18vh, 120px);
            right: clamp(12px, 3vw, 16px);
          }
        }

        .local-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transform: scaleX(-1);
        }

        .video-placeholder {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(10px);
          gap: 16px;
        }

        .video-placeholder-icon {
          width: clamp(60px, 10vw, 80px);
          height: clamp(60px, 10vw, 80px);
          border-radius: 50%;
          background: rgba(59, 130, 246, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid rgba(59, 130, 246, 0.3);
        }

        .video-placeholder p {
          font-size: clamp(13px, 3vw, 16px);
          color: rgba(255, 255, 255, 0.7);
          text-align: center;
          padding: 0 20px;
        }

        /* Controls */
        .controls-container {
          position: absolute;
          bottom: clamp(16px, 4vw, 30px);
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          transition: opacity 0.3s ease, transform 0.3s ease;
        }

        .controls-container.hidden {
          opacity: 0;
          transform: translateX(-50%) translateY(20px);
          pointer-events: none;
        }

        .controls {
          display: flex;
          gap: clamp(10px, 2.5vw, 18px);
          align-items: center;
          padding: clamp(14px, 3.5vw, 22px) clamp(20px, 5vw, 36px);
          background: rgba(15, 23, 42, 0.95);
          border-radius: 60px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        }

        @media (max-width: 768px) {
          .controls {
            padding: 10px 16px;
            gap: 8px;
          }
        }

        @media (max-width: 480px) {
          .controls {
            padding: 10px 14px;
            gap: 6px;
          }
        }

        @media (max-width: 380px) {
          .controls {
            padding: 8px 12px;
            gap: 5px;
          }
        }

        .control-btn {
          width: clamp(50px, 11vw, 60px);
          height: clamp(50px, 11vw, 60px);
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          backdrop-filter: blur(10px);
          flex-shrink: 0;
        }

        @media (max-width: 768px) {
          .control-btn {
            width: 50px;
            height: 50px;
          }
        }

        @media (max-width: 480px) {
          .control-btn {
            width: 46px;
            height: 46px;
          }
        }

        @media (max-width: 380px) {
          .control-btn {
            width: 42px;
            height: 42px;
          }
        }

        .control-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
        }

        .control-btn:active {
          transform: translateY(0);
        }

        .control-btn.active {
          background: rgba(239, 68, 68, 0.9);
          border-color: rgba(239, 68, 68, 1);
        }

        .control-btn.end-call {
          width: clamp(60px, 13vw, 72px);
          height: clamp(60px, 13vw, 72px);
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          border: none;
          box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4);
        }

        @media (max-width: 768px) {
          .control-btn.end-call {
            width: 58px;
            height: 58px;
          }
        }

        @media (max-width: 480px) {
          .control-btn.end-call {
            width: 54px;
            height: 54px;
          }
        }

        @media (max-width: 380px) {
          .control-btn.end-call {
            width: 50px;
            height: 50px;
          }
        }

        .control-btn.end-call:hover {
          background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
          transform: scale(1.05);
        }

        /* Add Participant Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
          backdrop-filter: blur(10px);
        }

        .modal-content {
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          border-radius: 20px;
          padding: 30px;
          width: 90%;
          max-width: 500px;
          max-height: 80vh;
          overflow-y: auto;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .modal-title {
          font-size: 24px;
          font-weight: 700;
        }

        .close-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .close-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .search-box {
          width: 100%;
          padding: 12px 16px;
          border-radius: 10px;
          border: 2px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.3);
          color: white;
          font-size: 16px;
          margin-bottom: 20px;
          outline: none;
          transition: all 0.2s ease;
        }

        .search-box:focus {
          border-color: rgba(59, 130, 246, 0.5);
        }

        .users-list {
          max-height: 400px;
          overflow-y: auto;
        }

        .user-item {
          display: flex;
          align-items: center;
          padding: 12px;
          border-radius: 10px;
          margin-bottom: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          background: rgba(255, 255, 255, 0.05);
        }

        .user-item:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .user-item.selected {
          background: rgba(59, 130, 246, 0.2);
          border: 2px solid rgba(59, 130, 246, 0.5);
        }

        .user-avatar {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          margin-right: 12px;
          object-fit: cover;
        }

        .user-avatar-placeholder {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          margin-right: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-weight: 700;
        }

        .user-info {
          flex: 1;
        }

        .user-name {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .user-status {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.6);
        }

        .online-indicator {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4ade80;
          margin-right: 6px;
        }

        .offline-indicator {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #666;
          margin-right: 6px;
        }

        .invite-btn {
          width: 100%;
          padding: 14px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 20px;
          transition: all 0.2s ease;
        }

        .invite-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(59, 130, 246, 0.4);
        }

        .invite-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Animations */
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .fade-in {
          animation: fadeIn 0.4s ease;
        }

        /* Call States */
        .call-state-overlay {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          z-index: 40;
        }

        .call-state-icon {
          width: clamp(100px, 20vw, 140px);
          height: clamp(100px, 20vw, 140px);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          position: relative;
        }

        .call-state-icon.calling {
          background: rgba(59, 130, 246, 0.15);
          border: 3px solid rgba(59, 130, 246, 0.4);
          animation: pulse 2s infinite;
        }

        .call-state-icon.ended {
          background: rgba(239, 68, 68, 0.15);
          border: 3px solid rgba(239, 68, 68, 0.4);
        }

        .call-state-text {
          font-size: clamp(16px, 4vw, 20px);
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); }
        ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 3px; }
      `}</style>

      {/* Header */}
      <div className={`call-header ${!showControls && callState === "connected" ? "hidden" : ""}`}>
        <div className="header-content">
          <div className="header-info">
            <h2>
              {callState === "calling" ? `Calling ${targetUsername}...` : 
               callState === "connecting" ? `Connecting...` :
               callState === "connected" ? (isGroupCall || participants.length > 0 ? `Group Call (${participants.length + 1} participants)` : targetUsername) : 
               callState === "ended" ? "Call Ended" : 'Video Call'}
            </h2>
            {callState === "connected" && (
              <div className="header-meta">
                <span className="duration-badge">{formatDuration(callDuration)}</span>
                <span className={`quality-badge ${connectionQuality}`}>
                  {connectionQuality === "good" ? <Wifi size={14} /> : <WifiOff size={14} />}
                  {connectionQuality === "good" ? "HD" : connectionQuality === "fair" ? "SD" : "Poor"}
                </span>
              </div>
            )}
          </div>
          <div className="header-actions">
            <button 
              onClick={() => setLayoutMode(m => m === "focus" ? "grid" : "focus")} 
              className="control-btn" 
              title="Split Screen"
            >
              <Grid size={isMobile ? 18 : 20} color="#fff" />
            </button>

            <button
              onClick={switchCamera}
              className="control-btn"
              title="Flip Camera"
            >
              <RefreshCcw size={isMobile ? 20 : 22} color="#fff" />
            </button>

            <button onClick={toggleFullscreen} className="control-btn" title="Fullscreen">
              {isFullscreen ? <Minimize size={20} color="#fff" /> : <Maximize size={20} color="#fff" />}
            </button>
          </div>
        </div>
      </div>

      {/* Video Layout */}
      <div className="video-layout">
        {/* Show grid for group calls */}
        {(isGroupCall || participants.length > 0) && callState === "connected" ? (
          <div className={`participants-grid count-${participants.length + 1}`}>
            {/* Local video in grid */}
            <div className="participant-video-container">
              <video ref={localVideo} autoPlay muted playsInline className="participant-video" style={{ transform: 'scaleX(-1)' }} />
              <div className="participant-name">You</div>
              {isVideoOff && (
                <div className="video-placeholder">
                  <div className="video-placeholder-icon">
                    <VideoOff size={isMobile ? 24 : 32} color="rgba(255, 255, 255, 0.6)" />
                  </div>
                </div>
              )}
            </div>

            {/* Remote participants */}
            {participants.map((participant) => {
              const videoElement = remoteVideos.current[participant.userId];
              return (
                <div key={participant.userId} className="participant-video-container">
                  {videoElement ? (
                    <>
                      <video 
                        ref={el => {
                          if (el && videoElement.srcObject && el.srcObject !== videoElement.srcObject) {
                            el.srcObject = videoElement.srcObject;
                            el.play().catch(err => console.error("Play error:", err));
                          }
                        }}
                        autoPlay 
                        playsInline 
                        className="participant-video"
                      />
                      <div className="participant-name">{participant.username}</div>
                    </>
                  ) : (
                    <div className="video-placeholder fade-in">
                      <div className="video-placeholder-icon">
                        <User size={isMobile ? 32 : 40} color="rgba(59, 130, 246, 0.6)" />
                      </div>
                      <p>{participant.username}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* 1-to-1 call layout */
          <>
            {/* Remote Video */}
            <div 
              className="remote-video-container"
              onClick={() => setIsLocalFullscreen(f => !f)}
            >
              <video 
                ref={el => {
                  if (el && remoteVideos.current[targetUserId]) {
                    const videoEl = remoteVideos.current[targetUserId];
                    if (videoEl.srcObject && el.srcObject !== videoEl.srcObject) {
                      el.srcObject = videoEl.srcObject;
                      el.play().catch(err => console.error("Play error:", err));
                    }
                  }
                }}
                autoPlay 
                playsInline 
                className="remote-video" 
              />
              
              {!hasRemoteStream && callState === "connected" && (
                <div className="video-placeholder fade-in">
                  <div className="video-placeholder-icon">
                    <User size={isMobile ? 32 : 40} color="rgba(59, 130, 246, 0.6)" />
                  </div>
                  <p>Waiting for {targetUsername}'s video...</p>
                </div>
              )}
            </div>

            {/* Local Video (PiP) */}
            <div
              ref={pipRef}
              className="local-video-container fade-in"
              onMouseDown={startDrag}
              onTouchStart={startDrag}
              style={
                layoutMode === "focus" && !isLocalFullscreen
                  ? {
                      position: "absolute",
                      left: pipPosition.x || undefined,
                      top: pipPosition.y || undefined
                    }
                  : {}
              }
            >
              <video ref={localVideo} autoPlay muted playsInline className="local-video" />
              {isVideoOff && (
                <div className="video-placeholder">
                  <div className="video-placeholder-icon">
                    <VideoOff size={isMobile ? 24 : 32} color="rgba(255, 255, 255, 0.6)" />
                  </div>
                  <p style={{ fontSize: isMobile ? '12px' : '14px' }}>Camera Off</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Call State Overlays */}
        {(callState === "calling" || callState === "connecting") && (
          <div className="call-state-overlay fade-in">
            <div className="call-state-icon calling">
              <Phone size={isMobile ? 40 : 56} color="#3b82f6" />
            </div>
            <p className="call-state-text">
              {callState === "calling" ? `Calling ${targetUsername}...` : `Connecting...`}
            </p>
          </div>
        )}

        {callState === "ended" && (
          <div className="call-state-overlay fade-in">
            <div className="call-state-icon ended">
              <PhoneOff size={isMobile ? 40 : 56} color="#ef4444" />
            </div>
            <p className="call-state-text">Call Ended</p>
          </div>
        )}
      </div>

      {/* Controls */}
      {callState !== "ended" && (
        <div className={`controls-container ${!showControls && callState === "connected" ? "hidden" : ""}`}>
          <div className="controls">
            <button 
              onClick={toggleMute} 
              className={`control-btn ${isMuted ? 'active' : ''}`}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOff size={isMobile ? 20 : 22} color="#fff" /> : <Mic size={isMobile ? 20 : 22} color="#fff" />}
            </button>

            <button 
              onClick={toggleVideo} 
              className={`control-btn ${isVideoOff ? 'active' : ''}`}
              title={isVideoOff ? "Turn on camera" : "Turn off camera"}
            >
              {isVideoOff ? <VideoOff size={isMobile ? 20 : 22} color="#fff" /> : <Video size={isMobile ? 20 : 22} color="#fff" />}
            </button>

            <button 
              onClick={endCall} 
              className="control-btn end-call"
              title="End call"
            >
              <PhoneOff size={isMobile ? 24 : 26} color="#fff" />
            </button>

            <button 
              onClick={toggleSpeaker} 
              className={`control-btn ${isSpeakerOff ? 'active' : ''}`}
              title={isSpeakerOff ? "Unmute speaker" : "Mute speaker"}
            >
              {isSpeakerOff ? <VolumeX size={isMobile ? 20 : 22} color="#fff" /> : <Volume2 size={isMobile ? 20 : 22} color="#fff" />}
            </button>

            <button 
              onClick={toggleScreenShare} 
              className={`control-btn ${isScreenSharing ? 'active' : ''}`}
              title={isScreenSharing ? "Stop sharing" : "Share screen"}
            >
              <Monitor size={isMobile ? 20 : 22} color="#fff" />
            </button>

            {/* Add to Call button */}
            {callState === "connected" && (
              <button 
                onClick={openAddParticipantModal} 
                className="control-btn"
                title="Add participants"
              >
                <UserPlus size={isMobile ? 20 : 22} color="#fff" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Add Participant Modal */}
      {showAddParticipantModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Add Participants</h3>
              <button className="close-btn" onClick={() => setShowAddParticipantModal(false)}>
                <X size={20} color="#fff" />
              </button>
            </div>

            <div style={{ position: 'relative' }}>
              <input 
                type="text"
                className="search-box"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search 
                size={20} 
                color="rgba(255,255,255,0.5)" 
                style={{ position: 'absolute', right: '16px', top: '16px', pointerEvents: 'none' }}
              />
            </div>

            <div className="users-list">
              {loadingUsers ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.6)' }}>
                  Loading users...
                </div>
              ) : filteredUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.6)' }}>
                  No users found
                </div>
              ) : (
                filteredUsers.map(user => {
                  const isOnline = onlineUsers.includes(user._id);
                  const isSelected = selectedUsers.includes(user._id);
                  
                  return (
                    <div 
                      key={user._id}
                      className={`user-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedUsers(prev => prev.filter(id => id !== user._id));
                        } else {
                          setSelectedUsers(prev => [...prev, user._id]);
                        }
                      }}
                    >
                      {user.profilePic ? (
                        <img src={user.profilePic} alt={user.username} className="user-avatar" />
                      ) : (
                        <div className="user-avatar-placeholder">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      
                      <div className="user-info">
                        <div className="user-name">{user.username}</div>
                        <div className="user-status">
                          {isOnline ? (
                            <>
                              <span className="online-indicator"></span>
                              Online
                            </>
                          ) : (
                            <>
                              <span className="offline-indicator"></span>
                              Offline
                            </>
                          )}
                        </div>
                      </div>

                      {isSelected && (
                        <div style={{ 
                          width: '24px', 
                          height: '24px', 
                          borderRadius: '50%', 
                          background: '#3b82f6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          ✓
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <button 
              className="invite-btn"
              onClick={inviteUsersToCall}
              disabled={selectedUsers.length === 0}
            >
              Invite {selectedUsers.length > 0 ? `(${selectedUsers.length})` : ''} to Call
            </button>
          </div>
        </div>
      )}
    </div>
  );
}