import React, { useState, useEffect } from 'react';
import './AllReviewsModal.css';
import { getUserVendorReviews, getUserVendorRating } from '../../../utils/api';

const AllReviewsModal = ({ vendor, onClose }) => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ratingInfo, setRatingInfo] = useState({
    rating: 0, reviewCount: 0, verifiedCount: 0, ratingLabel: '', breakdown: {},
  });

  useEffect(() => {
    fetchReviews();
    fetchRating();
  }, [vendor]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const vendorId = vendor?.vendorId || vendor?._id || vendor?.id;
      if (vendorId) {
        const data = await getUserVendorReviews(vendorId);
        // API now returns { analytics, reviews, pagination } — handle both shapes
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          setReviews(data.reviews || []);
          if (data.analytics) {
            setRatingInfo({
              rating:       data.analytics.avgRating    || 0,
              reviewCount:  data.analytics.totalReviews || 0,
              verifiedCount: data.analytics.verifiedCount || 0,
              ratingLabel:  data.analytics.ratingLabel  || '',
              breakdown:    data.analytics.breakdownPercent || {},
            });
          }
        } else {
          setReviews(data || []); // legacy flat-list fallback
        }
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchRating = async () => {
    try {
      const vendorId = vendor?.vendorId || vendor?._id || vendor?.id;
      if (vendorId) {
        const data = await getUserVendorRating(vendorId);
        setRatingInfo({
          rating: data?.rating || 0,
          reviewCount: data?.reviewCount || 0
        });
      }
    } catch (error) {
      console.error('Error fetching rating:', error);
    }
  };

  const renderStars = (rating) => {
    return '⭐'.repeat(rating);
  };

  const getRatingColor = (rating) => {
    if (rating >= 4) return '#16a34a';
    if (rating >= 3) return '#d97706';
    return '#dc2626';
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content reviews-modal">
        <h3 className="modal-title">
          Reviews for {vendor?.name || 'Partner Kitchen'}
        </h3>

        {/* Rating Summary */}
        {!loading && (
          <div style={{ marginBottom: 20, padding: 16, background: '#f8fafc',
            borderRadius: 12, border: '1px solid #e8ecf0' }}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              {/* Big number + stars */}
              <div style={{ textAlign: 'center', minWidth: 70 }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: '#f26522', lineHeight: 1 }}>
                  {(ratingInfo.rating || 0).toFixed(1)}
                </div>
                <div style={{ color: '#f59e0b', fontSize: 18, margin: '4px 0' }}>
                  {renderStars(Math.round(ratingInfo.rating || 0))}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {ratingInfo.reviewCount || 0} review{ratingInfo.reviewCount !== 1 ? 's' : ''}
                </div>
              </div>
              {/* Breakdown bars */}
              <div style={{ flex: 1 }}>
                {[5,4,3,2,1].map(s => {
                  const pct = ratingInfo.breakdown?.[s] ?? 0;
                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: '#64748b', width: 16, textAlign: 'right' }}>{s}⭐</span>
                      <div style={{ flex: 1, background: '#e8ecf0', borderRadius: 4, height: 7 }}>
                        <div style={{ width: `${pct}%`, background: '#f59e0b',
                          borderRadius: 4, height: '100%', transition: 'width 0.4s' }} />
                      </div>
                      <span style={{ fontSize: 11, color: '#94a3b8', width: 28 }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {ratingInfo.ratingLabel && (
              <div style={{ marginTop: 10, fontSize: 13, color: '#16a34a', fontWeight: 600 }}>
                ✓ {ratingInfo.ratingLabel} · {ratingInfo.verifiedCount || 0} verified purchase{ratingInfo.verifiedCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        <div className="reviews-list">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px' }}>
              Loading reviews...
            </div>
          ) : reviews.length > 0 ? (
            reviews.map((rev, idx) => (
              <div key={rev._id || idx} className="review-item">
                <div className="review-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="review-user">
                      {rev.user || 'Anonymous'}
                    </span>
                    {rev.isVerifiedPurchase && (
                      <span style={{ fontSize: 11, color: '#16a34a', background: '#f0fdf4',
                        border: '1px solid #bbf7d0', borderRadius: 10, padding: '1px 7px',
                        fontWeight: 600 }}>✓ Verified</span>
                    )}
                    {rev.planType && (
                      <span style={{ fontSize: 11, color: '#6d28d9', background: '#ede9fe',
                        borderRadius: 10, padding: '1px 7px' }}>{rev.planType}</span>
                    )}
                    <span className="review-date" style={{ fontSize: '12px', color: '#64748b' }}>
                      {rev.date}
                    </span>
                    {rev.isEdited && (
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>(edited)</span>
                    )}
                  </div>
                  <span
                    className="review-rating"
                    style={{
                      backgroundColor: rev.rating >= 4 ? '#dcfce7' : rev.rating <= 2 ? '#fee2e2' : '#fef3c7',
                      color: getRatingColor(rev.rating),
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontWeight: '600',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {renderStars(rev.rating)} {rev.rating}/5
                  </span>
                </div>
                {rev.comment && (
                  <p className="review-comment">{rev.comment}</p>
                )}
                {rev.helpfulCount > 0 && (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    👍 {rev.helpfulCount} found this helpful
                  </div>
                )}
              </div>
            ))
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px', 
              color: '#64748b' 
            }}>
              <p style={{ fontSize: '18px' }}>📝 No reviews yet</p>
              <p>Be the first to review this kitchen!</p>
            </div>
          )}
        </div>
        
        <button className="btn-primary close-btn" onClick={onClose}>
          Close Reviews
        </button>
      </div>
    </div>
  );
};

export default AllReviewsModal;

