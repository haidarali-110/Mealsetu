import React from 'react';
import './Reviews.css';

const Reviews = ({ reviews }) => {
  return (
    <div className="reviews">
      <h3>Customer Reviews & Feedback</h3>
      <div className="reviews-list">
        {reviews.map(rev => (
          <div key={rev.id} className="review-item">
            <div className="review-header">
              <strong>{rev.user}</strong>
              <span className="rating">{'⭐'.repeat(rev.rating)}</span>
            </div>
            <p className="review-comment">{rev.comment}</p>
            <small className="review-date">{rev.date}</small>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Reviews;
