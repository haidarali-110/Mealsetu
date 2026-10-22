import React, { useState } from 'react';
import './ReviewModal.css';

const LABELS = { 1: 'Terrible', 2: 'Poor', 3: 'Average', 4: 'Good', 5: 'Excellent' };
const LABEL_COLORS = {
  1: '#dc2626', 2: '#ea580c', 3: '#ca8a04', 4: '#16a34a', 5: '#15803d',
};

const ReviewModal = ({ vendor, onSubmit, onClose }) => {
  const [rating,  setRating]  = useState(5);
  const [comment, setComment] = useState('');

  const handleSubmit = () => {
    onSubmit(vendor, Number(rating), comment);
  };

  const labelColor = LABEL_COLORS[rating] || '#f26522';

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3 className="modal-title">Review {vendor?.name}</h3>

        {/* ── Interactive star rating ──────────────────────────────── */}
        <div style={{ margin: '8px 0 20px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
            {[1, 2, 3, 4, 5].map(s => (
              <span
                key={s}
                onClick={() => setRating(s)}
                style={{
                  fontSize: 38,
                  cursor: 'pointer',
                  color: s <= rating ? '#f59e0b' : '#d1d5db',
                  transition: 'color 0.15s, transform 0.1s',
                  display: 'inline-block',
                  lineHeight: 1,
                  userSelect: 'none',
                }}
              >
                ★
              </span>
            ))}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: labelColor }}>
            {LABELS[rating]}
          </div>
        </div>

        {/* ── Comment ──────────────────────────────────────────────── */}
        <label className="input-label">COMMENT (OPTIONAL)</label>
        <textarea
          className="input-field comment-field"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your experience…"
        />

        <div className="modal-actions">
          <button className="btn-primary submit-btn" onClick={handleSubmit}>Submit</button>
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default ReviewModal;
