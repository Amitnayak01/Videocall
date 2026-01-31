import React, { useEffect, useState } from "react";
import api from "../api";

export default function Profile() {
  const [user, setUser] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [showFullImage, setShowFullImage] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState("");
  const [savingBio, setSavingBio] = useState(false);
  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchUserProfile();
  }, []);

  useEffect(() => {
    const handleEscKey = (e) => {
      if (e.key === "Escape" && showFullImage) {
        setShowFullImage(false);
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [showFullImage]);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get("/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(res.data);
      setBioText(res.data.bio || "");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load profile");
      if (err.response?.status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (e) => {
    const file = e.target.files[0];
    
    if (!file) return;
    
    const validTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    const maxSize = 5 * 1024 * 1024;

    if (!validTypes.includes(file.type)) {
      setError("Please upload a valid image (JPEG, PNG, WebP)");
      return;
    }

    if (file.size > maxSize) {
      setError("Image size should not exceed 5MB");
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const form = new FormData();
      form.append("image", file);

      const res = await api.post("/auth/upload-profile", form, {
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        }
      });

      setUser({ ...user, profilePic: res.data.url });
      e.target.value = "";
    } catch (err) {
      setError(err.response?.data?.message || "Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location = "/login";
  };

  const deleteProfilePicture = async (e) => {
    e.stopPropagation();
    
    if (!window.confirm("Are you sure you want to remove your profile picture?")) {
      return;
    }

    try {
      setUploading(true);
      setError(null);

      await api.post("/auth/remove-profile", {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setUser({ ...user, profilePic: null });
    } catch (err) {
      console.error("Delete error:", err);
      setError(err.response?.data?.message || "Failed to delete profile picture.");
    } finally {
      setUploading(false);
    }
  };

  const handleImageClick = () => {
    if (user.profilePic && !uploading) {
      setShowFullImage(true);
    }
  };

  const closeFullImage = (e) => {
    if (e.target.id === "modal-overlay" || e.target.id === "close-button") {
      setShowFullImage(false);
    }
  };

  const handleUploadClick = (e) => {
    e.stopPropagation();
    document.getElementById("profile-upload").click();
  };

  const handleEditBio = () => {
    setEditingBio(true);
    setBioText(user.bio || "");
  };

  const handleCancelBio = () => {
    setEditingBio(false);
    setBioText(user.bio || "");
    setError(null);
  };

  const handleSaveBio = async () => {
    try {
      setSavingBio(true);
      setError(null);

      const res = await api.put("/auth/update-bio", 
        { bio: bioText },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setUser({ ...user, bio: bioText });
      setEditingBio(false);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update bio");
    } finally {
      setSavingBio(false);
    }
  };

  if (loading) {
    return (
      <div className="center">
        <div style={{ 
          fontSize: "18px", 
          color: "#888",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px"
        }}>
          <div style={{
            width: "20px",
            height: "20px",
            border: "3px solid #f3f3f3",
            borderTop: "3px solid #3498db",
            borderRadius: "50%",
            animation: "spin 1s linear infinite"
          }}></div>
          Loading profile...
        </div>
      </div>
    );
  }

  return (
    <div className="center">
      <h2>Profile</h2>

      {error && (
        <div style={{
          background: "#ff4444",
          color: "white",
          padding: "12px 15px",
          borderRadius: "5px",
          marginBottom: "15px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          maxWidth: "500px",
          margin: "0 auto 15px"
        }}>
          <span>{error}</span>
          <button 
            onClick={() => setError(null)}
            style={{ 
              background: "transparent",
              border: "none",
              color: "white",
              cursor: "pointer",
              fontSize: "20px",
              fontWeight: "bold",
              padding: "0 5px"
            }}
          >
            ×
          </button>
        </div>
      )}

      <div 
        className="profile-picture-container"
        style={{ 
          position: "relative", 
          display: "inline-block",
          marginBottom: "20px"
        }}
      >
        {user.profilePic ? (
          <img 
            src={user.profilePic} 
            alt="profile" 
            onClick={handleImageClick}
            style={{ 
              width: 120, 
              height: 120, 
              borderRadius: "50%",
              objectFit: "cover",
              cursor: "pointer",
              transition: "transform 0.2s, box-shadow 0.2s",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              display: "block"
            }}
          />
        ) : (
          <div 
            style={{
              width: 120,
              height: 120,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "48px",
              fontWeight: "bold",
              color: "white",
              textTransform: "uppercase",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
            }}
          >
            {user.username?.charAt(0) || "?"}
          </div>
        )}
        
        {uploading && (
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            color: "white",
            zIndex: 2
          }}>
            <div style={{
              width: "30px",
              height: "30px",
              border: "3px solid #f3f3f3",
              borderTop: "3px solid #3498db",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              marginBottom: "5px"
            }}></div>
            <span style={{ fontSize: "12px" }}>Processing...</span>
          </div>
        )}

        {/* Hover overlay with buttons - only visible in fullsize view */}
        <div 
          className="profile-hover-overlay"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            opacity: 0,
            transition: "opacity 0.3s ease",
            pointerEvents: "none"
          }}
        >
          <button
            onClick={handleUploadClick}
            style={{
              background: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "5px",
              padding: "8px 16px",
              fontSize: "12px",
              cursor: "pointer",
              fontWeight: "500",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              pointerEvents: "auto"
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "#45a049";
              e.target.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "#4CAF50";
              e.target.style.transform = "scale(1)";
            }}
          >
            📷 Upload
          </button>

          {user.profilePic && (
            <button
              onClick={deleteProfilePicture}
              style={{
                background: "#ff9800",
                color: "white",
                border: "none",
                borderRadius: "5px",
                padding: "8px 16px",
                fontSize: "12px",
                cursor: "pointer",
                fontWeight: "500",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                pointerEvents: "auto"
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#e68900";
                e.target.style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "#ff9800";
                e.target.style.transform = "scale(1)";
              }}
            >
              🗑️ Remove
            </button>
          )}
        </div>

        <input 
          id="profile-upload"
          type="file" 
          onChange={uploadImage}
          accept="image/jpeg,image/png,image/jpg,image/webp"
          style={{ display: "none" }}
          disabled={uploading}
        />
      </div>

      {user.profilePic && (
        <p style={{ 
          fontSize: "12px", 
          color: "#888", 
          marginTop: "-10px",
          marginBottom: "15px",
          fontStyle: "italic"
        }}>
          💡 Hover over image to edit • Click to view fullsize
        </p>
      )}

      <div style={{ 
        margin: "15px auto",
        maxWidth: "500px"
      }}>
        <p style={{ margin: "8px 0" }}>
          <strong>Username:</strong> {user.username}
        </p>

        {/* Bio Section */}
        <div style={{
          marginTop: "20px",
          background: "rgba(255,255,255,0.05)",
          borderRadius: "8px",
          padding: "15px"
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "10px"
          }}>
            <strong>Bio:</strong>
            {!editingBio && (
              <button
                onClick={handleEditBio}
                style={{
                  background: "transparent",
                  color: "#2196F3",
                  border: "1px solid #2196F3",
                  borderRadius: "5px",
                  padding: "5px 12px",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: "500",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = "#2196F3";
                  e.target.style.color = "white";
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = "transparent";
                  e.target.style.color = "#2196F3";
                }}
              >
                ✏️ Edit
              </button>
            )}
          </div>

          {editingBio ? (
            <div>
              <textarea
                value={bioText}
                onChange={(e) => setBioText(e.target.value)}
                placeholder="Tell us about yourself..."
                maxLength={200}
                style={{
                  width: "100%",
                  minHeight: "80px",
                  padding: "10px",
                  borderRadius: "5px",
                  border: "2px solid #555",
                  background: "#2b2b2b",
                  color: "white",
                  fontSize: "14px",
                  resize: "vertical",
                  outline: "none",
                  fontFamily: "inherit"
                }}
                onFocus={(e) => e.target.style.borderColor = "#2196F3"}
                onBlur={(e) => e.target.style.borderColor = "#555"}
              />
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "10px"
              }}>
                <span style={{ fontSize: "12px", color: "#888" }}>
                  {bioText.length}/200 characters
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={handleCancelBio}
                    disabled={savingBio}
                    style={{
                      background: "transparent",
                      color: "#888",
                      border: "1px solid #555",
                      borderRadius: "5px",
                      padding: "6px 16px",
                      fontSize: "13px",
                      cursor: savingBio ? "not-allowed" : "pointer",
                      fontWeight: "500",
                      transition: "all 0.2s",
                      opacity: savingBio ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!savingBio) {
                        e.target.style.borderColor = "#ff4444";
                        e.target.style.color = "#ff4444";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.borderColor = "#555";
                      e.target.style.color = "#888";
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveBio}
                    disabled={savingBio}
                    style={{
                      background: "#4CAF50",
                      color: "white",
                      border: "none",
                      borderRadius: "5px",
                      padding: "6px 16px",
                      fontSize: "13px",
                      cursor: savingBio ? "not-allowed" : "pointer",
                      fontWeight: "500",
                      transition: "all 0.2s",
                      opacity: savingBio ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!savingBio) {
                        e.target.style.background = "#45a049";
                        e.target.style.transform = "translateY(-2px)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = "#4CAF50";
                      e.target.style.transform = "translateY(0)";
                    }}
                  >
                    {savingBio ? "Saving..." : "💾 Save"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p style={{
              margin: "0",
              color: user.bio ? "white" : "#888",
              fontSize: "14px",
              lineHeight: "1.6",
              fontStyle: user.bio ? "normal" : "italic"
            }}>
              {user.bio || "No bio added yet. Click edit to add one!"}
            </p>
          )}
        </div>
      </div>

      <div style={{ 
        marginTop: "25px", 
        display: "flex", 
        gap: "10px", 
        flexWrap: "wrap",
        justifyContent: "center"
      }}>
        <button 
          onClick={handleLogout} 
          style={{ 
            background: "#f44336",
            color: "white",
            padding: "12px 24px",
            borderRadius: "5px",
            cursor: "pointer",
            border: "none",
            transition: "all 0.2s",
            fontWeight: "500"
          }}
          onMouseEnter={(e) => {
            e.target.style.background = "#da190b";
            e.target.style.transform = "translateY(-2px)";
            e.target.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = "#f44336";
            e.target.style.transform = "translateY(0)";
            e.target.style.boxShadow = "none";
          }}
        >
          🚪 Logout
        </button>
      </div>

      {/* Fullsize Image Modal */}
      {showFullImage && (
        <div
          id="modal-overlay"
          onClick={closeFullImage}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0, 0, 0, 0.95)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
            animation: "fadeIn 0.3s ease-in"
          }}
        >
          <button
            id="close-button"
            onClick={closeFullImage}
            style={{
              position: "absolute",
              top: "20px",
              right: "30px",
              background: "rgba(255, 255, 255, 0.2)",
              border: "2px solid white",
              borderRadius: "50%",
              color: "white",
              width: "50px",
              height: "50px",
              fontSize: "30px",
              cursor: "pointer",
              zIndex: 1001,
              fontWeight: "bold",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "rgba(255, 255, 255, 0.4)";
              e.target.style.transform = "rotate(90deg)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "rgba(255, 255, 255, 0.2)";
              e.target.style.transform = "rotate(0deg)";
            }}
          >
            ×
          </button>
          
          <div 
            className="fullsize-image-container"
            style={{
              textAlign: "center",
              maxWidth: "95%",
              maxHeight: "95%",
              position: "relative"
            }}
          >
            <img
              src={user.profilePic}
              alt="profile fullsize"
              style={{
                maxWidth: "90vw",
                maxHeight: "90vh",
                objectFit: "contain",
                borderRadius: "8px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
                animation: "zoomIn 0.3s ease-in",
                display: "block"
              }}
            />
            
            {/* Buttons overlay on fullsize image */}
            <div 
              className="fullsize-buttons-overlay"
              style={{
                position: "absolute",
                bottom: "30px",
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                gap: "15px",
                animation: "fadeIn 0.5s ease-in 0.3s backwards"
              }}
            >
              <button
                onClick={handleUploadClick}
                style={{
                  background: "#4CAF50",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px 24px",
                  fontSize: "14px",
                  cursor: "pointer",
                  fontWeight: "500",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = "#45a049";
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow = "0 6px 16px rgba(0,0,0,0.5)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = "#4CAF50";
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow = "0 4px 12px rgba(0,0,0,0.4)";
                }}
              >
                📷 Upload Photo
              </button>

              <button
                onClick={deleteProfilePicture}
                style={{
                  background: "#ff9800",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px 24px",
                  fontSize: "14px",
                  cursor: "pointer",
                  fontWeight: "500",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = "#e68900";
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow = "0 6px 16px rgba(0,0,0,0.5)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = "#ff9800";
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow = "0 4px 12px rgba(0,0,0,0.4)";
                }}
              >
                🗑️ Remove Photo
              </button>
            </div>

            <p style={{
              color: "white",
              marginTop: "80px",
              fontSize: "14px",
              opacity: "0.8"
            }}>
              Press ESC or click outside to close
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        @keyframes zoomIn {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .profile-picture-container:hover .profile-hover-overlay {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}