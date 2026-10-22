import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resetPasswordWithOTP, sendOTP, verifyOTP } from '../utils/api';
import { clearAuthStorage, removeAuthItem, setAuthItem } from '../utils/authStorage';
import socket from '../utils/socket';
import './Login.css';

export default function Login() {
  const [role, setRole] = useState('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  
  // Forgot password states
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError, setForgotError] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const otpRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const body = { email, password, role };

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok && data.token) {
        clearAuthStorage();
        setAuthItem('token', data.token);

        const userData = {
          _id: data._id,
          name: data.name,
          email: data.email,
          role: data.role,
          profilePic: data.profilePic
        };
        setAuthItem('user', JSON.stringify(userData));

        // Connect to socket for real-time updates
        try {
          socket.connect();

          // Join appropriate room based on role
          if (role === 'admin') {
            socket.emit('joinAdmin');
          } else if (role === 'vendor') {
            socket.emit('joinVendor', data._id);
          } else {
            socket.emit('join', data._id);
          }
          console.log('Socket connected for role:', role);
        } catch (socketError) {
          console.error('Socket connection error:', socketError);
        }

        // Check for trial intent and navigate accordingly
        const trialIntent = localStorage.getItem('trialIntent');

        if (role === 'admin') {
          navigate('/admin-dashboard');
        } else if (role === 'vendor') {
          navigate('/vendor-dashboard');
        } else {
          if (trialIntent === 'true') {
            localStorage.removeItem('trialIntent');
            navigate('/user-dashboard', { state: { activeTab: 'subscription' } });
          } else {
            navigate('/user-dashboard');
          }
        }
      } else {
        removeAuthItem('token');
        removeAuthItem('user');
        setErrorMsg(data.message || "Login failed. Please check your credentials.");
      }
    } catch (error) {
      removeAuthItem('token');
      removeAuthItem('user');
      console.error("Login Error:", error);
      setErrorMsg("Unable to connect. Please check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (e, index) => {
    const value = e.target.value;
    
    if (value.length <= 1) {
      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);
      
      if (value && index < 5) {
        otpRefs[index + 1].current.focus();
      }
    }
  };

  const handleOtpKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs[index - 1].current.focus();
    }
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError('');
    setForgotMessage('');

    try {
      const data = await sendOTP(forgotEmail);
      setForgotMessage(data.message);
      setForgotStep(2);
    } catch (error) {
      setForgotError(error.message || 'Failed to send OTP');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError('');
    setForgotMessage('');

    const otpValue = otp.join('');
    
    if (otpValue.length !== 6) {
      setForgotError('Please enter a valid 6-digit OTP');
      setForgotLoading(false);
      return;
    }

    try {
      const data = await verifyOTP(forgotEmail, otpValue);
      setForgotMessage(data.message);
      setForgotStep(3);
    } catch (error) {
      setForgotError(error.message || 'Invalid or expired OTP');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError('');
    setForgotMessage('');

    if (newPassword !== confirmPassword) {
      setForgotError('Passwords do not match');
      setForgotLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setForgotError('Password must be at least 6 characters');
      setForgotLoading(false);
      return;
    }

    try {
      const data = await resetPasswordWithOTP(forgotEmail, newPassword);
      setForgotMessage(data.message);
      
      setTimeout(() => {
        setShowForgot(false);
        resetForgotFlow();
      }, 2000);
    } catch (error) {
      setForgotError(error.message || 'Failed to reset password');
    } finally {
      setForgotLoading(false);
    }
  };

  const resetForgotFlow = () => {
    setForgotStep(1);
    setForgotEmail('');
    setOtp(['', '', '', '', '', '']);
    setNewPassword('');
    setConfirmPassword('');
    setForgotMessage('');
    setForgotError('');
  };

  const closeForgotModal = () => {
    setShowForgot(false);
    resetForgotFlow();
  };

  return (
    <div className={`page-center ${role === 'admin' ? 'admin-mode' : ''}`}>
      <div className="auth-card">
        <h1 className="brand-name">MealSetu</h1>
        <p className="auth-subtitle">
          {role === 'admin' ? 'Admin Portal Access' : 'Welcome back! Please login.'}
        </p>

        <div className="role-container">
          <button className={`role-tab ${role === 'user' ? 'active' : ''}`} onClick={() => setRole('user')}>Customer</button>
          <button className={`role-tab ${role === 'vendor' ? 'active' : ''}`} onClick={() => setRole('vendor')}>Vendor</button>
          <button className={`role-tab ${role === 'admin' ? 'active' : ''}`} onClick={() => setRole('admin')}>Admin</button>
        </div>

        <form onSubmit={handleLogin}>
          {errorMsg && (
            <div style={{
              backgroundColor: '#fee',
              color: '#c33',
              padding: '10px',
              borderRadius: '4px',
              marginBottom: '15px',
              fontSize: '14px'
            }}>
              {errorMsg}
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Email Address</label>
            <input 
              type="email" 
              className="form-input" 
              placeholder="e.g. user@gmail.com" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div className="input-group">
            <label className="input-label">Password</label>
            <input 
              type="password" 
              className="form-input" 
              placeholder="••••••••" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            
            <div style={{ textAlign: 'right', marginTop: '8px' }}>
              <span
                onClick={() => setShowForgot(true)}
                className="forgot-link-text"
              >
                Forgot Password?
              </span>
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Logging in...' : (role === 'admin' ? 'Authorize Login' : 'Sign In')}
          </button>
        </form>

        <p className="footer-signup-text">
          New to MealSetu? <Link to="/register">Create Account</Link>
        </p>
      </div>

      {showForgot && (
        <div className="modal-overlay">
          <div className="forgot-modal">
            <button className="close-modal" onClick={closeForgotModal}>&times;</button>
            <h2 className="modal-title">Reset Password</h2>
            
            {forgotStep === 1 && (
              <>
                <p className="modal-desc">
                  Enter your email address to receive a verification code.
                </p>

                {forgotMessage && (
                  <div style={{
                    backgroundColor: '#d4edda',
                    color: '#155724',
                    padding: '10px',
                    borderRadius: '4px',
                    marginBottom: '15px',
                    fontSize: '14px'
                  }}>
                    {forgotMessage}
                  </div>
                )}

                {forgotError && (
                  <div style={{
                    backgroundColor: '#fee',
                    color: '#c33',
                    padding: '10px',
                    borderRadius: '4px',
                    marginBottom: '15px',
                    fontSize: '14px'
                  }}>
                    {forgotError}
                  </div>
                )}

                <form className="modal-form" onSubmit={handleSendOTP}>
                  <input 
                    type="email" 
                    className="form-input" 
                    placeholder="Enter registered email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    disabled={forgotLoading}
                  />
                  <button type="submit" className="btn-primary" disabled={forgotLoading}>
                    {forgotLoading ? 'Sending...' : 'Send OTP'}
                  </button>
                </form>
              </>
            )}

            {forgotStep === 2 && (
              <>
                <p className="modal-desc">
                  Enter the 6-digit OTP sent to <strong>{forgotEmail}</strong>
                </p>

                {forgotMessage && (
                  <div style={{
                    backgroundColor: '#d4edda',
                    color: '#155724',
                    padding: '10px',
                    borderRadius: '4px',
                    marginBottom: '15px',
                    fontSize: '14px'
                  }}>
                    {forgotMessage}
                  </div>
                )}

                {forgotError && (
                  <div style={{
                    backgroundColor: '#fee',
                    color: '#c33',
                    padding: '10px',
                    borderRadius: '4px',
                    marginBottom: '15px',
                    fontSize: '14px'
                  }}>
                    {forgotError}
                  </div>
                )}

                <form className="modal-form" onSubmit={handleVerifyOTP}>
                  <div className="otp-container" style={{ justifyContent: 'center' }}>
                    {otp.map((digit, index) => (
                      <input 
                        key={index}
                        ref={otpRefs[index]}
                        type="text"
                        maxLength="1"
                        className="otp-input"
                        value={digit}
                        onChange={(e) => handleOtpChange(e, index)}
                        onKeyDown={(e) => handleOtpKeyDown(e, index)}
                        disabled={forgotLoading}
                      />
                    ))}
                  </div>
                  <button type="submit" className="btn-primary" disabled={forgotLoading}>
                    {forgotLoading ? 'Verifying...' : 'Verify OTP'}
                  </button>
                  
                  <p className="resend-text">
                    Didn't receive code? 
                    <span 
                      onClick={() => {
                        setForgotStep(1);
                        setForgotMessage('');
                        setForgotError('');
                      }}
                      style={{ cursor: 'pointer', color: '#4CAF50' }}
                    > Resend</span>
                  </p>
                </form>
              </>
            )}

            {forgotStep === 3 && (
              <>
                <p className="modal-desc">
                  OTP verified! Create a new password for your account.
                </p>

                {forgotMessage && (
                  <div style={{
                    backgroundColor: '#d4edda',
                    color: '#155724',
                    padding: '10px',
                    borderRadius: '4px',
                    marginBottom: '15px',
                    fontSize: '14px'
                  }}>
                    {forgotMessage}
                  </div>
                )}

                {forgotError && (
                  <div style={{
                    backgroundColor: '#fee',
                    color: '#c33',
                    padding: '10px',
                    borderRadius: '4px',
                    marginBottom: '15px',
                    fontSize: '14px'
                  }}>
                    {forgotError}
                  </div>
                )}

                <form className="modal-form" onSubmit={handleResetPassword}>
                  <input 
                    type="password" 
                    className="form-input" 
                    placeholder="New Password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={forgotLoading}
                    style={{ marginBottom: '10px' }}
                  />
                  <input 
                    type="password" 
                    className="form-input" 
                    placeholder="Confirm New Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={forgotLoading}
                    style={{ marginBottom: '10px' }}
                  />
                  <button type="submit" className="btn-primary" disabled={forgotLoading}>
                    {forgotLoading ? 'Resetting...' : 'Update Password'}
                  </button>
                </form>
              </>
            )}

            <p className="footer-signup-text" style={{marginTop: '15px'}}>
              Remember your password? <Link to="/login" onClick={closeForgotModal}>Sign In</Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
