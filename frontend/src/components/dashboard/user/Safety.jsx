import React from 'react';
import './Safety.css';

const Safety = () => {
  return (
    <div className="safety-card">
      <h3 className="safety-title">
        Safety & Hygiene Protocols
      </h3>
      <p className="safety-description">Your health is our priority. MealSetu ensures all vendors follow strict safety standards.</p>
      <div className="safety-protocols">
        <div className="protocol-item green-bg">
          <strong className="green-text">✓ FSSAI Verified Kitchens</strong>
          <p>Every tiffin provider on our platform is licensed by the Food Safety and Standards Authority of India.</p>
        </div>
        <div className="protocol-item">
          <strong>✓ Daily Sanitization</strong>
          <p>Kitchens are cleaned and sanitized twice daily to ensure a germ-free environment.</p>
        </div>
        <div className="protocol-item">
          <strong>✓ Temperature Checks</strong>
          <p>Delivery staff and kitchen members undergo regular temperature screenings.</p>
        </div>
      </div>
    </div>
  );
};

export default Safety;
