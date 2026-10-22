import React from 'react';
import './WelcomeCard.css';

const WelcomeCard = ({ user, onDetectLocation, onSecuritySettings }) => {
  // Handle missing or empty profile picture
  const profilePic = user.profilePic || user.profilePicUrl || '';
  const defaultPic = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgdmlld0JveD0iMCAwIDE1MCAxNTAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjE1MCIgaGVpZ2h0PSIxNTAiIGZpbGw9IiNlMmU4ZjAiLz48Y2lyY2xlIGN4PSI3NSIgY3k9IjU1IiByPSI0MCIgZmlsbD0iI2YzZjVmMiIvPjxwYXRoIGQ9Ik0zNSAxMzBDMzUgMTAyLjM4NCA1Mi4zODQgODAgODAgODBINzBDOTcuNjE2IDgwIDExNSAxMDIuMzg0IDExNSAxMzBWMTUwSDMzek0xMjUgMTUwaC05MG0xMjUgMGgtOTBtLTEyNSAwaC05MCIgZmlsbD0iI2U0ZThmMCIvPjwvc3ZnPg==';
  
  return (
    <div className="welcome-card">
      <div className="welcome-content flex flex-col sm:flex-row items-center gap-4 sm:gap-6">

        <img 
          src={profilePic || defaultPic} 
          className="welcome-avatar" 
          alt="Profile" 
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = defaultPic;
          }}
        />
        <div className="welcome-text">
          <h1>Welcome, {user.name}!</h1>
          <p>{user.email} | {typeof user.address === 'object' 
  ? [
      user.address.flatHouseNo,
      user.address.street,
      user.address.area,
      user.address.city,
      user.address.pincode
    ].filter(Boolean).join(', ')
  : user.address || ''}</p>
        </div>
      </div>
      <div className="welcome-actions">
        {/* <button className="btn-primary detect-btn" onClick={onDetectLocation}>Detect Location</button> */}
        {/* <button className="security-btn" onClick={onSecuritySettings}>Security Settings</button> */}
      </div>
    </div>
  );
};

export default WelcomeCard;
