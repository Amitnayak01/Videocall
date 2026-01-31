const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const { Server } = require("socket.io");

// MongoDB Connection
mongoose.connect(
  "mongodb+srv://amitkumarnayak330_db_user:YMwkvBag3LpTT4rJ@cluster0.vppxlxb.mongodb.net/Chat?appName=Cluster0",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
)
.then(() => console.log("✅ MongoDB Connected"))
.catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Express Setup
const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/auth", require("./routes/auth"));

// HTTP & Socket.IO Server
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// ========== DATA STRUCTURES ==========
const onlineUsers = new Map();      // userId -> { socketId, username, status }
const socketToUser = new Map();     // socketId -> userId
const activeCalls = new Map();      // callId -> { caller, callee, startTime, status }
const callHistory = [];             // Store recent call history (last 100)

// ========== CALL SCHEMA (Optional: Save to DB) ==========
const CallSchema = new mongoose.Schema({
  callerId: String,
  callerUsername: String,
  calleeId: String,
  calleeUsername: String,
  startTime: Date,
  endTime: Date,
  duration: Number,
  status: { type: String, enum: ['completed', 'missed', 'declined', 'failed'] },
  quality: String
}, { timestamps: true });

const Call = mongoose.model('Call', CallSchema);

// ========== HELPER FUNCTIONS ==========
function getCallId(user1, user2) {
  return [user1, user2].sort().join('-');
}

function saveCallToHistory(callData) {
  callHistory.unshift(callData);
  if (callHistory.length > 100) {
    callHistory.pop();
  }
}

async function saveCallToDB(callData) {
  try {
    const call = new Call(callData);
    await call.save();
    console.log("📞 Call saved to database");
  } catch (error) {
    console.error("Error saving call:", error);
  }
}

// ========== SOCKET.IO EVENTS ==========
io.on("connection", (socket) => {
  console.log("🔌 Socket connected:", socket.id);

  // ===== USER ONLINE =====
  socket.on("user-online", (data) => {
    const { userId, username } = typeof data === 'string' 
      ? { userId: data, username: 'Anonymous' }
      : data;

    onlineUsers.set(userId, {
      socketId: socket.id,
      username: username || 'Anonymous',
      status: 'online',
      lastSeen: new Date()
    });
    
    socketToUser.set(socket.id, userId);
    
    // Broadcast updated online users list
    const usersList = Array.from(onlineUsers.entries()).map(([id, data]) => ({
      userId: id,
      username: data.username,
      status: data.status
    }));
    
    io.emit("online-users", usersList);
    console.log(`✅ User ${username} (${userId}) is now online`);
  });

  // ===== CALL USER =====
  socket.on("call-user", ({ toUserId, fromUserId, fromUsername, offer }) => {
    console.log(`📞 Call from ${fromUsername} (${fromUserId}) to ${toUserId}`);

    // Check if callee is in another call
    const callId = getCallId(fromUserId, toUserId);
    const existingCall = Array.from(activeCalls.values()).find(
      call => call.caller === toUserId || call.callee === toUserId
    );

    if (existingCall) {
      socket.emit("user-busy", { userId: toUserId });
      console.log(`⚠️ User ${toUserId} is busy`);
      return;
    }

    const targetUser = onlineUsers.get(toUserId);
    if (!targetUser) {
      socket.emit("user-not-available", { userId: toUserId });
      console.log(`⚠️ User ${toUserId} is not available`);
      return;
    }

    // Create active call record
    activeCalls.set(callId, {
      caller: fromUserId,
      callerUsername: fromUsername,
      callee: toUserId,
      calleeUsername: targetUser.username,
      startTime: new Date(),
      status: 'ringing'
    });

    // Send incoming call notification
    io.to(targetUser.socketId).emit("incoming-call", {
      fromUserId,
      fromUsername: fromUsername || 'Anonymous',
      offer
    });

    console.log(`🔔 Incoming call sent to ${toUserId}`);
  });

  // ===== ACCEPT CALL =====
  socket.on("accept-call", ({ toUserId, fromUserId, answer }) => {
    console.log(`✅ Call accepted by ${fromUserId}`);

    const callId = getCallId(fromUserId, toUserId);
    const call = activeCalls.get(callId);

    if (call) {
      call.status = 'connected';
      call.connectedTime = new Date();
      activeCalls.set(callId, call);
    }

    const callerUser = onlineUsers.get(toUserId);
    if (callerUser) {
      io.to(callerUser.socketId).emit("call-accepted", { answer });
    }
  });

  // ===== DECLINE CALL =====
  socket.on("decline-call", ({ toUserId, fromUserId }) => {
    console.log(`❌ Call declined by ${fromUserId}`);

    const callId = getCallId(fromUserId, toUserId);
    const call = activeCalls.get(callId);

    if (call) {
      // Save to history
      const callRecord = {
        ...call,
        endTime: new Date(),
        duration: 0,
        status: 'declined'
      };
      saveCallToHistory(callRecord);
      saveCallToDB(callRecord);
      
      activeCalls.delete(callId);
    }

    const callerUser = onlineUsers.get(toUserId);
    if (callerUser) {
      io.to(callerUser.socketId).emit("call-declined", { fromUserId });
    }
  });

  // ===== ICE CANDIDATE =====
  socket.on("ice-candidate", ({ toUserId, candidate }) => {
    const targetUser = onlineUsers.get(toUserId);
    if (targetUser) {
      io.to(targetUser.socketId).emit("ice-candidate", { candidate });
    }
  });

  // ===== END CALL =====
  socket.on("end-call", ({ toUserId, fromUserId }) => {
    console.log(`🔚 Call ended between ${fromUserId} and ${toUserId}`);

    const callId = getCallId(fromUserId, toUserId);
    const call = activeCalls.get(callId);

    if (call) {
      const endTime = new Date();
      const duration = Math.floor((endTime - call.connectedTime) / 1000);

      // Save to history
      const callRecord = {
        ...call,
        endTime,
        duration: duration > 0 ? duration : 0,
        status: call.status === 'connected' ? 'completed' : 'missed'
      };
      saveCallToHistory(callRecord);
      saveCallToDB(callRecord);
      
      activeCalls.delete(callId);
    }

    // Notify the other user
    const targetUser = onlineUsers.get(toUserId);
    if (targetUser) {
      io.to(targetUser.socketId).emit("call-ended", { fromUserId });
    }
  });

  // ===== CHAT MESSAGE (During Call) =====
  socket.on("chat-message", ({ toUserId, fromUserId, message }) => {
    const targetUser = onlineUsers.get(toUserId);
    if (targetUser) {
      io.to(targetUser.socketId).emit("chat-message", {
        fromUserId,
        message,
        timestamp: new Date()
      });
    }
  });

  // ===== CALL STATUS UPDATE =====
  socket.on("call-status", ({ toUserId, status }) => {
    // Status: muted, unmuted, video-off, video-on, screen-sharing
    const targetUser = onlineUsers.get(toUserId);
    if (targetUser) {
      io.to(targetUser.socketId).emit("call-status-update", {
        status,
        timestamp: new Date()
      });
    }
  });

  // ===== USER TYPING (Chat) =====
  socket.on("typing", ({ toUserId, fromUserId, isTyping }) => {
    const targetUser = onlineUsers.get(toUserId);
    if (targetUser) {
      io.to(targetUser.socketId).emit("user-typing", {
        fromUserId,
        isTyping
      });
    }
  });

  // ===== DISCONNECT =====
  socket.on("disconnect", () => {
    const userId = socketToUser.get(socket.id);

    if (userId) {
      console.log(`🔌 User ${userId} disconnected`);

      // End any active calls
      const activeCall = Array.from(activeCalls.entries()).find(
        ([, call]) => call.caller === userId || call.callee === userId
      );

      if (activeCall) {
        const [callId, call] = activeCall;
        const otherUserId = call.caller === userId ? call.callee : call.caller;
        
        // Save call as failed/ended
        const callRecord = {
          ...call,
          endTime: new Date(),
          duration: call.connectedTime 
            ? Math.floor((new Date() - call.connectedTime) / 1000)
            : 0,
          status: 'failed'
        };
        saveCallToHistory(callRecord);
        saveCallToDB(callRecord);

        // Notify other user
        const otherUser = onlineUsers.get(otherUserId);
        if (otherUser) {
          io.to(otherUser.socketId).emit("call-ended", { 
            fromUserId: userId,
            reason: 'disconnected'
          });
        }

        activeCalls.delete(callId);
      }

      // Remove user from online list
      onlineUsers.delete(userId);
      socketToUser.delete(socket.id);

      // Broadcast updated online users
      const usersList = Array.from(onlineUsers.entries()).map(([id, data]) => ({
        userId: id,
        username: data.username,
        status: data.status
      }));
      io.emit("online-users", usersList);
    }
  });
});

// ========== REST API ENDPOINTS ==========

// Get online users
app.get("/api/users/online", (req, res) => {
  const users = Array.from(onlineUsers.entries()).map(([userId, data]) => ({
    userId,
    username: data.username,
    status: data.status,
    lastSeen: data.lastSeen
  }));
  
  res.json({
    success: true,
    count: users.length,
    users
  });
});

// Get active calls
app.get("/api/calls/active", (req, res) => {
  const calls = Array.from(activeCalls.entries()).map(([callId, call]) => ({
    callId,
    caller: call.caller,
    callerUsername: call.callerUsername,
    callee: call.callee,
    calleeUsername: call.calleeUsername,
    status: call.status,
    duration: call.connectedTime 
      ? Math.floor((new Date() - call.connectedTime) / 1000)
      : 0
  }));
  
  res.json({
    success: true,
    count: calls.length,
    calls
  });
});

// Get call history
app.get("/api/calls/history", (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json({
    success: true,
    count: callHistory.length,
    calls: callHistory.slice(0, limit)
  });
});

// Get user's call history from DB
app.get("/api/calls/history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const calls = await Call.find({
      $or: [
        { callerId: userId },
        { calleeId: userId }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(limit);
    
    res.json({
      success: true,
      count: calls.length,
      calls
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
    stats: {
      onlineUsers: onlineUsers.size,
      activeCalls: activeCalls.size,
      totalSockets: io.engine.clientsCount,
      mongoConnected: mongoose.connection.readyState === 1
    }
  });
});

// Server statistics
app.get("/api/stats", (req, res) => {
  const totalCallsToday = callHistory.filter(call => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(call.startTime) >= today;
  }).length;

  res.json({
    success: true,
    stats: {
      onlineUsers: onlineUsers.size,
      activeCalls: activeCalls.size,
      totalCallsToday,
      recentCallHistory: callHistory.length,
      uptime: process.uptime()
    }
  });
});

// ========== ERROR HANDLING ==========
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   🚀 Video Call Server Started            ║
║   📡 Port: ${PORT}                         ║
║   🔌 WebSocket: Ready                     ║
║   💾 MongoDB: Connected                   ║
╚════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    mongoose.connection.close(false, () => {
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    });
  });
});

module.exports = { app, server, io };