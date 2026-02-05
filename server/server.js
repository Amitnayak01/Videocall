const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const { Server } = require("socket.io");

/* ================= DB ================= */
mongoose.connect("mongodb+srv://amitkumarnayak330_db_user:YMwkvBag3LpTT4rJ@cluster0.vppxlxb.mongodb.net/Chat?appName=Cluster0")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("DB Error:", err));

/* ================= APP ================= */
const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/auth", require("./routes/auth"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* ================= MAPS ================= */
const onlineUsers = new Map();  // userId -> socketId
const socketToUser = new Map(); // socketId -> userId
const activeCalls = new Map();  // userId -> otherUserId (for 1-to-1 calls)
const callTimers = new Map();   // userId -> startTime

// Group call data structures
const rooms = new Map();        // roomId -> { participants: [{ userId, username, profilePic, socketId }], createdAt }

process.on("uncaughtException", err => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

/* ================= SOCKET ================= */
io.on("connection", (socket) => {
  console.log("🔌 Socket connected:", socket.id);

  /* ===== USER ONLINE ===== */
  socket.on("user-online", (userId) => {
    if (!userId) {
      console.log("⚠️  No userId provided for user-online");
      return;
    }

    // Remove old socket if user reconnects
    const oldSocket = onlineUsers.get(userId);
    if (oldSocket && oldSocket !== socket.id) {
      console.log(`🔄 User ${userId} reconnecting - removing old socket ${oldSocket}`);
      socketToUser.delete(oldSocket);
    }

    onlineUsers.set(userId, socket.id);
    socketToUser.set(socket.id, userId);

    // Broadcast updated online users list to ALL clients
    const onlineUsersList = Array.from(onlineUsers.keys());
    io.emit("online-users", onlineUsersList);
    console.log(`🟢 User ${userId} is now ONLINE (${onlineUsersList.length} users online)`);
  });

  /* ===== USER OFFLINE (TAB CLOSED / MANUAL) ===== */
  socket.on("user-offline", (userId) => {
    if (!userId) return;

    onlineUsers.delete(userId);
    socketToUser.delete(socket.id);

    // End any active 1-to-1 call
    const otherUser = activeCalls.get(userId);
    if (otherUser) {
      const otherSocket = onlineUsers.get(otherUser);
      if (otherSocket) {
        io.to(otherSocket).emit("call-ended");
        console.log(`📵 Call ended - ${userId} went offline`);
      }

      activeCalls.delete(otherUser);
      activeCalls.delete(userId);
      callTimers.delete(otherUser);
      callTimers.delete(userId);
    }

    // Remove from any group call rooms
    rooms.forEach((room, roomId) => {
      const participantIndex = room.participants.findIndex(p => p.userId === userId);
      if (participantIndex !== -1) {
        room.participants.splice(participantIndex, 1);
        
        // Notify other participants
        room.participants.forEach(participant => {
          const participantSocket = onlineUsers.get(participant.userId);
          if (participantSocket) {
            io.to(participantSocket).emit("participant-left", {
              userId,
              username: "User"
            });
          }
        });

        // Delete room if empty
        if (room.participants.length === 0) {
          rooms.delete(roomId);
          console.log(`🗑️  Room ${roomId} deleted (empty)`);
        }
      }
    });

    // Broadcast updated online users
    io.emit("online-users", Array.from(onlineUsers.keys()));
    console.log(`🔴 User ${userId} went OFFLINE`);
  });

  /* ===== 1-TO-1 CALL USER ===== */
  socket.on("call-user", ({ toUserId, fromUserId, fromUsername, offer }) => {
    console.log(`📞 1-to-1 Call request: ${fromUsername || fromUserId} → ${toUserId}`);

    // Check if target user is busy
    if (activeCalls.has(toUserId)) {
      console.log(`⚠️  User ${toUserId} is busy`);
      socket.emit("user-busy");
      return;
    }

    // Check if target user is online
    const targetSocket = onlineUsers.get(toUserId);
    if (targetSocket) {
      console.log(`✅ Sending incoming-call to ${toUserId} via socket ${targetSocket}`);
      io.to(targetSocket).emit("incoming-call", {
        fromUserId,
        fromUsername,
        offer
      });
    } else {
      console.log(`❌ User ${toUserId} is not online`);
      socket.emit("user-not-available");
    }
  });

  /* ===== ACCEPT 1-TO-1 CALL ===== */
  socket.on("accept-call", ({ toUserId, fromUserId, answer }) => {
    console.log(`✅ 1-to-1 Call accepted: ${fromUserId} ↔️ ${toUserId}`);

    // Mark both users as in active call
    activeCalls.set(fromUserId, toUserId);
    activeCalls.set(toUserId, fromUserId);

    // Start call timer
    callTimers.set(fromUserId, Date.now());
    callTimers.set(toUserId, Date.now());

    // Send answer to caller
    const callerSocket = onlineUsers.get(toUserId);
    if (callerSocket) {
      io.to(callerSocket).emit("call-accepted", { answer });
      console.log(`📡 Sent call-accepted to ${toUserId}`);
    }
  });

  /* ===== DECLINE 1-TO-1 CALL ===== */
  socket.on("decline-call", ({ toUserId, fromUserId }) => {
    console.log(`📵 1-to-1 Call declined: ${fromUserId} declined call from ${toUserId}`);

    const callerSocket = onlineUsers.get(toUserId);
    if (callerSocket) {
      io.to(callerSocket).emit("call-declined", { fromUserId });
      console.log(`📡 Sent call-declined to ${toUserId}`);
    }
  });

  /* ===== ICE CANDIDATE (1-TO-1) ===== */
  socket.on("ice-candidate", ({ toUserId, fromUserId, candidate, roomId }) => {
    if (roomId) {
      // Group call ICE candidate
      const targetSocket = onlineUsers.get(toUserId);
      if (targetSocket) {
        io.to(targetSocket).emit("ice-candidate", { candidate, fromUserId });
      }
    } else {
      // 1-to-1 call ICE candidate
      const targetSocket = onlineUsers.get(toUserId);
      if (targetSocket) {
        io.to(targetSocket).emit("ice-candidate", { candidate, fromUserId });
      }
    }
  });

  /* ===== END 1-TO-1 CALL ===== */
  socket.on("end-call", ({ toUserId }) => {
    const currentUser = socketToUser.get(socket.id);
    const targetSocket = onlineUsers.get(toUserId);

    console.log(`📵 1-to-1 Call ended: ${currentUser} ended call with ${toUserId}`);

    // Notify other user
    if (targetSocket) {
      io.to(targetSocket).emit("call-ended");
    }

    // Calculate and log call duration
    const start = callTimers.get(currentUser);
    if (start) {
      const duration = Math.floor((Date.now() - start) / 1000);
      console.log(`⏱️  Call duration: ${duration}s`);
    }

    // Clean up call state
    activeCalls.delete(toUserId);
    activeCalls.delete(currentUser);
    callTimers.delete(toUserId);
    callTimers.delete(currentUser);
  });

  /* ==================== GROUP CALL EVENTS ==================== */

  /* ===== CREATE ROOM ===== */
  socket.on("create-room", ({ roomId, userId, username, profilePic }) => {
    console.log(`🏠 Creating room: ${roomId} by ${username}`);

    // Create room
    rooms.set(roomId, {
      participants: [{
        userId,
        username,
        profilePic,
        socketId: socket.id
      }],
      createdAt: Date.now()
    });

    // Join socket room
    socket.join(roomId);

    // Notify creator
    socket.emit("room-joined", {
      roomId,
      participants: rooms.get(roomId).participants
    });

    console.log(`✅ Room ${roomId} created with 1 participant`);
  });

  /* ===== JOIN ROOM ===== */
  socket.on("join-room", async ({ roomId, userId, username, profilePic }) => {
    console.log(`👤 ${username} joining room: ${roomId}`);

    const room = rooms.get(roomId);
    
    if (!room) {
      console.log(`❌ Room ${roomId} not found`);
      socket.emit("room-not-found");
      return;
    }

    // Check if user already in room
    if (room.participants.find(p => p.userId === userId)) {
      console.log(`⚠️  User ${userId} already in room ${roomId}`);
      socket.emit("already-in-room");
      return;
    }

    // Join socket room
    socket.join(roomId);

    // Add participant
    room.participants.push({
      userId,
      username,
      profilePic,
      socketId: socket.id
    });

    // Notify joining user with current participants
    socket.emit("room-joined", {
      roomId,
      participants: room.participants
    });

    // Notify existing participants about new user
    // They need to send offers to the new user
    room.participants.forEach(participant => {
      if (participant.userId !== userId) {
        const participantSocket = onlineUsers.get(participant.userId);
        if (participantSocket) {
          io.to(participantSocket).emit("new-participant-joining", {
            userId,
            username,
            profilePic
          });
        }
      }
    });

    console.log(`✅ ${username} joined room ${roomId}. Total participants: ${room.participants.length}`);
  });

  /* ===== INVITE TO GROUP CALL ===== */
  socket.on("invite-to-group-call", ({ toUserId, fromUserId, fromUsername, roomId }) => {
    console.log(`📨 Group call invitation: ${fromUsername} → ${toUserId} (Room: ${roomId})`);

    const targetSocket = onlineUsers.get(toUserId);
    if (targetSocket) {
      io.to(targetSocket).emit("incoming-group-call", {
        fromUserId,
        fromUsername,
        roomId
      });
      console.log(`✅ Sent group call invitation to ${toUserId}`);
    } else {
      console.log(`❌ User ${toUserId} is not online`);
    }
  });

  /* ===== DECLINE GROUP CALL ===== */
  socket.on("decline-group-call", ({ toUserId, fromUserId, roomId }) => {
    console.log(`📵 Group call declined: ${fromUserId} declined invitation to ${roomId}`);

    const inviterSocket = onlineUsers.get(toUserId);
    if (inviterSocket) {
      io.to(inviterSocket).emit("group-call-declined", { fromUserId, roomId });
    }
  });

  /* ===== WEBRTC OFFER (GROUP CALL) ===== */
  socket.on("webrtc-offer", ({ roomId, toUserId, fromUserId, offer }) => {
    console.log(`📡 WebRTC offer in room ${roomId}: ${fromUserId} → ${toUserId}`);

    const targetSocket = onlineUsers.get(toUserId);
    if (targetSocket) {
      io.to(targetSocket).emit("webrtc-offer", {
        fromUserId,
        offer
      });
    }
  });

  /* ===== WEBRTC ANSWER (GROUP CALL) ===== */
  socket.on("webrtc-answer", ({ roomId, toUserId, fromUserId, answer }) => {
    console.log(`📡 WebRTC answer in room ${roomId}: ${fromUserId} → ${toUserId}`);

    const targetSocket = onlineUsers.get(toUserId);
    if (targetSocket) {
      io.to(targetSocket).emit("webrtc-answer", {
        fromUserId,
        answer
      });
    }
  });

  /* ===== LEAVE ROOM ===== */
  socket.on("leave-room", ({ roomId, userId }) => {
    console.log(`👋 ${userId} leaving room: ${roomId}`);

    const room = rooms.get(roomId);
    if (!room) return;

    // Remove participant
    const participantIndex = room.participants.findIndex(p => p.userId === userId);
    if (participantIndex !== -1) {
      const participant = room.participants[participantIndex];
      room.participants.splice(participantIndex, 1);

      // Leave socket room
      socket.leave(roomId);

      // Notify other participants
      room.participants.forEach(p => {
        const participantSocket = onlineUsers.get(p.userId);
        if (participantSocket) {
          io.to(participantSocket).emit("participant-left", {
            userId,
            username: participant.username
          });
        }
      });

      console.log(`✅ ${participant.username} left room ${roomId}. Remaining: ${room.participants.length}`);

      // Delete room if empty
      if (room.participants.length === 0) {
        rooms.delete(roomId);
        console.log(`🗑️  Room ${roomId} deleted (empty)`);
      }
    }
  });

  /* ===== DISCONNECT ===== */
  socket.on("disconnect", () => {
    const userId = socketToUser.get(socket.id);
    if (!userId) {
      console.log(`❌ Socket ${socket.id} disconnected (no associated user)`);
      return;
    }

    console.log(`❌ User ${userId} disconnected (socket: ${socket.id})`);

    // Remove from online users
    onlineUsers.delete(userId);
    socketToUser.delete(socket.id);

    // End any active 1-to-1 call
    const otherUser = activeCalls.get(userId);
    if (otherUser) {
      const otherSocket = onlineUsers.get(otherUser);
      if (otherSocket) {
        io.to(otherSocket).emit("call-ended");
        console.log(`📵 Call ended - ${userId} disconnected`);
      }

      activeCalls.delete(otherUser);
      activeCalls.delete(userId);
      callTimers.delete(otherUser);
      callTimers.delete(userId);
    }

    // Remove from any group call rooms
    rooms.forEach((room, roomId) => {
      const participantIndex = room.participants.findIndex(p => p.userId === userId);
      if (participantIndex !== -1) {
        const participant = room.participants[participantIndex];
        room.participants.splice(participantIndex, 1);
        
        // Notify other participants
        room.participants.forEach(p => {
          const participantSocket = onlineUsers.get(p.userId);
          if (participantSocket) {
            io.to(participantSocket).emit("participant-left", {
              userId,
              username: participant.username
            });
          }
        });

        console.log(`👋 ${participant.username} removed from room ${roomId} (disconnect)`);

        // Delete room if empty
        if (room.participants.length === 0) {
          rooms.delete(roomId);
          console.log(`🗑️  Room ${roomId} deleted (empty)`);
        }
      }
    });

    // Broadcast updated online users
    const onlineUsersList = Array.from(onlineUsers.keys());
    io.emit("online-users", onlineUsersList);
    console.log(`🔴 Online users after disconnect: ${onlineUsersList.length}`);
  });

  /* ===== DEBUG: Get online users ===== */
  socket.on("get-online-users", () => {
    socket.emit("online-users", Array.from(onlineUsers.keys()));
  });

  /* ===== DEBUG: Get active rooms ===== */
  socket.on("get-active-rooms", () => {
    const roomsList = Array.from(rooms.entries()).map(([roomId, room]) => ({
      roomId,
      participantCount: room.participants.length,
      participants: room.participants.map(p => p.username)
    }));
    socket.emit("active-rooms", roomsList);
    console.log("📊 Active rooms:", roomsList);
  });
});

/* ================= SERVER ================= */
server.listen(5000, () => {
  console.log("🚀 Server running on port 5000");
  console.log("📡 Socket.IO ready for connections");
  console.log("👥 Group call support enabled");
});