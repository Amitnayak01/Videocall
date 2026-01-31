import { useState } from "react";
import api from "../api";
import { useNavigate, Link } from "react-router-dom";
import React from "react";
import { 
  Eye, 
  EyeOff, 
  User, 
  Lock, 
  CheckCircle, 
  XCircle,
  Loader,
  UserPlus
} from "lucide-react";

export default function Signup() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  
  // Validation states
  const [touched, setTouched] = useState({
    username: false,
    password: false,
    confirmPassword: false
  });

  const nav = useNavigate();

  // Password strength calculation
  const getPasswordStrength = (pass) => {
    let strength = 0;
    if (pass.length >= 8) strength++;
    if (pass.length >= 12) strength++;
    if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) strength++;
    if (/\d/.test(pass)) strength++;
    if (/[^a-zA-Z0-9]/.test(pass)) strength++;
    return strength;
  };

  const passwordStrength = getPasswordStrength(password);
  const strengthLabels = ["Very Weak", "Weak", "Fair", "Good", "Strong"];
  const strengthColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];

  // Validation functions
  const validateUsername = (value) => {
    if (!value) return "Username is required";
    if (value.length < 3) return "Username must be at least 3 characters";
    if (value.length > 20) return "Username must be less than 20 characters";
    if (!/^[a-zA-Z0-9_]+$/.test(value)) return "Username can only contain letters, numbers, and underscores";
    return "";
  };

  const validatePassword = (value) => {
    if (!value) return "Password is required";
    if (value.length < 6) return "Password must be at least 6 characters";
    return "";
  };

  const validateConfirmPassword = (value) => {
    if (!value) return "Please confirm your password";
    if (value !== password) return "Passwords do not match";
    return "";
  };

  const usernameError = touched.username ? validateUsername(username) : "";
  const passwordError = touched.password ? validatePassword(password) : "";
  const confirmPasswordError = touched.confirmPassword ? validateConfirmPassword(confirmPassword) : "";

  const isFormValid = 
    username && 
    password && 
    confirmPassword && 
    !usernameError && 
    !passwordError && 
    !confirmPasswordError;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Mark all fields as touched
    setTouched({
      username: true,
      password: true,
      confirmPassword: true
    });

    // Validate
    if (!isFormValid) {
      setError("Please fix all errors before submitting");
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/auth/signup", { 
        username, 
        password 
      });

      setSuccess(true);
      
      // Redirect after short delay
      setTimeout(() => {
        nav("/");
      }, 1500);

    } catch (err) {
      setError(
        err.response?.data?.message || 
        "Signup failed. Username might already exist."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .signup-card {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 24px;
          padding: 48px 40px;
          width: 100%;
          max-width: 480px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: slideUp 0.5s ease;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .input-group {
          position: relative;
          margin-bottom: 24px;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 16px;
          pointer-events: none;
          z-index: 1;
        }

        input {
          width: 100%;
          padding: 14px 16px 14px 48px;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          font-size: 15px;
          font-family: inherit;
          transition: all 0.3s ease;
          background: #fff;
        }

        input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        input.error {
          border-color: #ef4444;
        }

        input.error:focus {
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
        }

        .eye-toggle {
          position: absolute;
          right: 16px;
          cursor: pointer;
          color: #6b7280;
          transition: color 0.2s;
          z-index: 2;
        }

        .eye-toggle:hover {
          color: #374151;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #ef4444;
          font-size: 13px;
          margin-top: 6px;
          animation: shake 0.3s ease;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }

        .password-strength {
          margin-top: 8px;
        }

        .strength-bar {
          height: 4px;
          background: #e5e7eb;
          border-radius: 2px;
          overflow: hidden;
          margin-bottom: 6px;
        }

        .strength-fill {
          height: 100%;
          transition: all 0.3s ease;
          border-radius: 2px;
        }

        .strength-label {
          font-size: 12px;
          font-weight: 500;
        }

        .submit-btn {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 8px;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
        }

        .submit-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .success-message {
          background: #d1fae5;
          border: 2px solid #10b981;
          color: #065f46;
          padding: 16px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
          animation: slideDown 0.3s ease;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .error-banner {
          background: #fee2e2;
          border: 2px solid #ef4444;
          color: #991b1b;
          padding: 16px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
          animation: slideDown 0.3s ease;
        }

        .spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .link-text {
          color: #667eea;
          text-decoration: none;
          font-weight: 600;
          transition: color 0.2s;
        }

        .link-text:hover {
          color: #764ba2;
          text-decoration: underline;
        }

        @media (max-width: 480px) {
          .signup-card {
            padding: 32px 24px;
          }
        }
      `}</style>

      <div className="signup-card">
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <UserPlus size={32} color="#fff" />
          </div>
          <h2 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#1f2937',
            marginBottom: '8px'
          }}>
            Create Account
          </h2>
          <p style={{
            color: '#6b7280',
            fontSize: '15px'
          }}>
            Join us and start connecting
          </p>
        </div>

        {/* Success Message */}
        {success && (
          <div className="success-message">
            <CheckCircle size={20} />
            <span style={{ fontWeight: '500' }}>
              Account created successfully! Redirecting...
            </span>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="error-banner">
            <XCircle size={20} />
            <span style={{ fontWeight: '500' }}>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Username Field */}
          <div className="input-group">
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151'
            }}>
              Username
            </label>
            <div className="input-wrapper">
              <div className="input-icon">
                <User size={18} color="#9ca3af" />
              </div>
              <input
                type="text"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onBlur={() => setTouched({ ...touched, username: true })}
                className={usernameError ? 'error' : ''}
                disabled={loading || success}
              />
            </div>
            {usernameError && (
              <div className="error-message">
                <XCircle size={14} />
                {usernameError}
              </div>
            )}
          </div>

          {/* Password Field */}
          <div className="input-group">
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151'
            }}>
              Password
            </label>
            <div className="input-wrapper">
              <div className="input-icon">
                <Lock size={18} color="#9ca3af" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched({ ...touched, password: true })}
                className={passwordError ? 'error' : ''}
                disabled={loading || success}
              />
              <div 
                className="eye-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </div>
            </div>
            {passwordError && (
              <div className="error-message">
                <XCircle size={14} />
                {passwordError}
              </div>
            )}
            
            {/* Password Strength Indicator */}
            {password && !passwordError && (
              <div className="password-strength">
                <div className="strength-bar">
                  <div 
                    className="strength-fill"
                    style={{
                      width: `${(passwordStrength / 5) * 100}%`,
                      background: strengthColors[passwordStrength - 1] || '#e5e7eb'
                    }}
                  />
                </div>
                <div 
                  className="strength-label"
                  style={{ 
                    color: strengthColors[passwordStrength - 1] || '#6b7280'
                  }}
                >
                  {passwordStrength > 0 ? strengthLabels[passwordStrength - 1] : ''}
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password Field */}
          <div className="input-group">
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#374151'
            }}>
              Confirm Password
            </label>
            <div className="input-wrapper">
              <div className="input-icon">
                <Lock size={18} color="#9ca3af" />
              </div>
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setTouched({ ...touched, confirmPassword: true })}
                className={confirmPasswordError ? 'error' : ''}
                disabled={loading || success}
              />
              <div 
                className="eye-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </div>
            </div>
            {confirmPasswordError && (
              <div className="error-message">
                <XCircle size={14} />
                {confirmPasswordError}
              </div>
            )}
            {!confirmPasswordError && confirmPassword && password === confirmPassword && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#10b981',
                fontSize: '13px',
                marginTop: '6px'
              }}>
                <CheckCircle size={14} />
                Passwords match
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="submit-btn"
            disabled={!isFormValid || loading || success}
          >
            {loading ? (
              <>
                <Loader size={20} className="spinner" />
                Creating Account...
              </>
            ) : success ? (
              <>
                <CheckCircle size={20} />
                Success!
              </>
            ) : (
              <>
                <UserPlus size={20} />
                Create Account
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div style={{
          marginTop: '24px',
          textAlign: 'center',
          fontSize: '14px',
          color: '#6b7280'
        }}>
          Already have an account?{' '}
          <Link to="/" className="link-text">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}