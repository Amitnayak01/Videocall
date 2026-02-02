import React, { useState, useEffect } from "react";
import { X, Search, UserPlus, Loader, Phone } from "lucide-react";
import api from "../api";
import { socket } from "../socket";

export default function AddParticipantModal({ 
  isOpen, 
  onClose, 
  currentCallUserId, 
  currentCallUsername 
}) {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [invitingUser, setInvitingUser] = useState(null);
  const currentUserId = localStorage.getItem("userId");
  const token = localStorage.getItem("token");

  // Fetch all users
  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  // Listen for online users
  useEffect(() => {
    socket.on("online-users", (usersList) => {
      setOnlineUsers(usersList);
    });

    // Request current online users
    socket.emit("get-online-users");

    return () => {
      socket.off("online-users");
    };
  }, []);

  // Filter users based on search
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter(user =>
        user.username.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredUsers(filtered);
    }
  }, [searchQuery, users]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get("/auth/users", {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Filter out current user and user already in call
      const filtered = res.data.filter(
        user => user._id !== currentUserId && user._id !== currentCallUserId
      );
      
      setUsers(filtered);
      setFilteredUsers(filtered);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      alert("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const isUserOnline = (userId) => {
    return onlineUsers.includes(userId);
  };

  const inviteToCall = (user) => {
    if (!isUserOnline(user._id)) {
      alert(`${user.username} is offline`);
      return;
    }

    setInvitingUser(user._id);

    // Emit invite-to-call event
    socket.emit("invite-to-call", {
      toUserId: user._id,
      fromUserId: currentUserId,
      fromUsername: localStorage.getItem("username") || "Someone",
      existingCallUserId: currentCallUserId,
      existingCallUsername: currentCallUsername
    });

    // Show feedback
    setTimeout(() => {
      setInvitingUser(null);
      alert(`Invitation sent to ${user.username}`);
    }, 1000);
  };

  const getImageUrl = (profilePic) => {
    if (!profilePic) return null;
    if (profilePic.startsWith('http://') || profilePic.startsWith('https://')) {
      return profilePic;
    }
    const baseUrl = 'https://video-call-961n.onrender.com';
    const cleanPath = profilePic.startsWith('/') ? profilePic : `/${profilePic}`;
    return `${baseUrl}${cleanPath}`;
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(8px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.3s ease;
        }

        .modal-container {
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          border-radius: 20px;
          width: 100%;
          max-width: 500px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          animation: modalSlideIn 0.3s ease;
          overflow: hidden;
        }

        .modal-header {
          padding: 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .modal-title {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 20px;
          font-weight: 600;
          color: white;
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
          transition: all 0.2s;
          color: white;
        }

        .close-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: rotate(90deg);
        }

        .search-container {
          padding: 16px 24px;
          background: rgba(0, 0, 0, 0.2);
        }

        .search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 16px;
          color: rgba(255, 255, 255, 0.4);
        }

        .search-input {
          width: 100%;
          padding: 12px 16px 12px 48px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: white;
          font-size: 15px;
          outline: none;
          transition: all 0.2s;
        }

        .search-input:focus {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(59, 130, 246, 0.5);
        }

        .search-input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }

        .users-list {
          flex: 1;
          overflow-y: auto;
          padding: 16px 24px;
        }

        .users-list::-webkit-scrollbar {
          width: 8px;
        }

        .users-list::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }

        .users-list::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
        }

        .user-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          margin-bottom: 10px;
          transition: all 0.2s;
          border: 1px solid transparent;
        }

        .user-item:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(59, 130, 246, 0.3);
          transform: translateX(4px);
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
        }

        .user-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid rgba(59, 130, 246, 0.3);
        }

        .user-avatar-placeholder {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-weight: 600;
          color: white;
          border: 2px solid rgba(59, 130, 246, 0.3);
          text-transform: uppercase;
        }

        .user-details {
          flex: 1;
        }

        .user-name {
          font-size: 16px;
          font-weight: 500;
          color: white;
          margin-bottom: 4px;
        }

        .user-status {
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }

        .status-online {
          color: #4ade80;
        }

        .status-online .status-dot {
          background: #4ade80;
          box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
        }

        .status-offline {
          color: rgba(255, 255, 255, 0.4);
        }

        .status-offline .status-dot {
          background: rgba(255, 255, 255, 0.3);
        }

        .invite-btn {
          padding: 10px 20px;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          border: none;
          border-radius: 10px;
          color: white;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
          font-size: 14px;
        }

        .invite-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }

        .invite-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background: rgba(255, 255, 255, 0.1);
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          color: rgba(255, 255, 255, 0.6);
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(59, 130, 246, 0.2);
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .empty-state {
          text-align: center;
          padding: 40px;
          color: rgba(255, 255, 255, 0.5);
        }

        .empty-state-icon {
          font-size: 48px;
          margin-bottom: 12px;
          opacity: 0.4;
        }

        @media (max-width: 600px) {
          .modal-container {
            max-width: 100%;
            max-height: 90vh;
            border-radius: 20px 20px 0 0;
            margin-top: auto;
          }

          .modal-header {
            padding: 20px;
          }

          .modal-title {
            font-size: 18px;
          }

          .search-container {
            padding: 12px 20px;
          }

          .users-list {
            padding: 12px 20px;
          }

          .user-item {
            padding: 12px;
          }

          .user-avatar,
          .user-avatar-placeholder {
            width: 44px;
            height: 44px;
          }

          .user-name {
            font-size: 15px;
          }

          .invite-btn {
            padding: 8px 16px;
            font-size: 13px;
          }
        }
      `}</style>

      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-container" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="modal-header">
            <div className="modal-title">
              <UserPlus size={24} color="#3b82f6" />
              <span>Add to Call</span>
            </div>
            <button className="close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>

          {/* Search Bar */}
          <div className="search-container">
            <div className="search-input-wrapper">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* Users List */}
          <div className="users-list">
            {loading ? (
              <div className="loading-container">
                <div className="spinner"></div>
                <p>Loading users...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <p>
                  {searchQuery ? "No users found" : "No users available"}
                </p>
              </div>
            ) : (
              filteredUsers.map((user) => {
                const imageUrl = getImageUrl(user.profilePic);
                const isOnline = isUserOnline(user._id);
                const isInviting = invitingUser === user._id;

                return (
                  <div key={user._id} className="user-item">
                    <div className="user-info">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={user.username}
                          className="user-avatar"
                          onError={(e) => {
                            e.target.style.display = "none";
                            e.target.nextElementSibling.style.display = "flex";
                          }}
                        />
                      ) : null}
                      <div
                        className="user-avatar-placeholder"
                        style={{ display: imageUrl ? "none" : "flex" }}
                      >
                        {user.username.charAt(0)}
                      </div>

                      <div className="user-details">
                        <div className="user-name">{user.username}</div>
                        <div
                          className={`user-status ${
                            isOnline ? "status-online" : "status-offline"
                          }`}
                        >
                          <span className="status-dot"></span>
                          {isOnline ? "Online" : "Offline"}
                        </div>
                      </div>
                    </div>

                    <button
                      className="invite-btn"
                      onClick={() => inviteToCall(user)}
                      disabled={!isOnline || isInviting}
                    >
                      {isInviting ? (
                        <>
                          <Loader size={16} className="spinner" />
                          Inviting...
                        </>
                      ) : (
                        <>
                          <Phone size={16} />
                          Invite
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}