import React, { useState } from 'react';
import './Compliance.css';

const Compliance = ({ isApproved, onUploadDocuments }) => {
  const [documents, setDocuments] = useState({ fssai: null, gst: null });

  const handleFileChange = (type, file) => {
    setDocuments(prev => ({ ...prev, [type]: file }));
  };

  const handleSubmit = () => {
    onUploadDocuments(documents);
  };

  return (
    <div className="compliance">
      <div className="compliance-header">
        <h3>Kitchen Compliance & Licenses</h3>
        {isApproved ? (
          <div className="approved-badge">
            ✅ Verified Partner (Admin Approved)
          </div>
        ) : (
          <div className="pending-badge">
            ⏳ Pending Admin Approval
          </div>
        )}
      </div>
      <div className="documents-grid">
        <div className="document-upload">
          <p><strong>FSSAI License</strong></p>
          <input
            type="file"
            onChange={(e) => handleFileChange('fssai', e.target.files[0])}
          />
          {documents.fssai && <p className="file-selected">Selected: {documents.fssai.name}</p>}
        </div>
        <div className="document-upload">
          <p><strong>GST/Tax Document</strong></p>
          <input
            type="file"
            onChange={(e) => handleFileChange('gst', e.target.files[0])}
          />
          {documents.gst && <p className="file-selected">Selected: {documents.gst.name}</p>}
        </div>
      </div>
      <button className="submit-btn" onClick={handleSubmit}>
        Submit for Approval
      </button>
    </div>
  );
};

export default Compliance;
