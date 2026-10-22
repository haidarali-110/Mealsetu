import React, { useState } from 'react';
import './PasswordModal.css';

const PasswordModal = ({ user, onClose, onForgotPassword }) => {
  const [step, setStep] = useState('login');
  const [otp, setOtp] = useState('');
  const [newPass, setNewPass] = useState('');

  const sendEmailOtp = () => {
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
    alert(`OTP sent to ${user.email}: ${generatedOtp}`);
    setStep('otp');
  };

  const verifyOtp = () => {
    if (otp === '1234') { // Simulating OTP verification
      setStep('create');
    } else {
      alert("Invalid OTP! Please check again.");
    }
  };

  const finalizeNewPassword = () => {
    if (newPass.length < 6) {
      alert("Password too short!");
      return;
    }
    alert("Password updated successfully via Email OTP!");
    onForgotPassword();
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3 className="modal-title">Security Settings</h3>

        {step === 'login' && (
          <>
            <input type="password" className="input-field" placeholder="Current Password" />
            <input type="password" className="input-field" placeholder="New Password" />
            <button className="btn-primary" style={{ width: '100%' }} onClick={() => onClose()}>Update</button>
            <button className="forgot-link" onClick={sendEmailOtp}>
              Forgot Password? (Email OTP)
            </button>
          </>
        )}

        {step === 'otp' && (
          <>
            <p style={{ fontSize: '13px', textAlign: 'center' }}>Enter OTP sent to {user.email}</p>
            <input
              type="text"
              className="input-field otp-field"
              maxLength="4"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="0000"
            />
            <button className="btn-primary" style={{ width: '100%' }} onClick={verifyOtp}>Verify OTP</button>
          </>
        )}

        {step === 'create' && (
          <>
            <p style={{ fontSize: '13px', textAlign: 'center' }}>Create New Password</p>
            <input
              type="password"
              className="input-field"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="New Password"
            />
            <button className="btn-primary" style={{ width: '100%', background: '#16a34a' }} onClick={finalizeNewPassword}>Save New Password</button>
          </>
        )}

        <button className="cancel-btn" style={{ width: '100%', marginTop: '10px' }} onClick={() => { onClose(); setStep('login'); }}>Close</button>
      </div>
    </div>
  );
};

export default PasswordModal;
