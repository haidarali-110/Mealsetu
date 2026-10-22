import React, { useState } from 'react';
import './Offers.css';
import { redeemOffer, createOfferPaymentOrder, checkCanAddPlan } from '../../../utils/api';
import { loadRazorpayScript } from '../../common/RazorpayCheckout';

const PLAN_PRICES = { 'One Day': 80, 'Weekly': 560, 'Monthly': 2000 };
const FALLBACK_IMAGE = 'https://via.placeholder.com/400x200?text=No+Image+Available';

const getDiscountedPrice = (planName, pct) =>
  Math.round((PLAN_PRICES[planName] || 80) * (1 - pct / 100));

const Offers = ({
  activeOffers,
  offersLoading,
  offersError,
  onRedeemOffer,
  claimedOfferIds = [],
  user = {}
}) => {
  const [selectedOffer, setSelectedOffer]     = useState(null);
  const [selectedPlanName, setSelectedPlanName] = useState('');
  const [paymentMethod, setPaymentMethod]     = useState(null);
  const [redeeming, setRedeeming]             = useState(false);
  const [redeemError, setRedeemError]         = useState(null);
  const [successMsg, setSuccessMsg]           = useState(null);

  const handleImageError = (e) => { e.target.src = FALLBACK_IMAGE; };

  const formatDate = (d) => {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleOpenRedeemModal = async (offer) => {
    const available = offer.planDiscounts.filter(p => p.discountPercentage > 0);
    setSelectedOffer(offer);
    setSelectedPlanName(available.length > 0 ? available[0].planName : '');
    setPaymentMethod(null);
    setRedeemError(null);

    try {
      const check = await checkCanAddPlan();
      if (!check.canPurchase) {
        setRedeemError(
          check.earliestExpiry
            ? `Your plan queue is full. Your earliest plan ends on ${
                new Date(check.earliestExpiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })
              }. Wait for a slot to open then redeem this offer.`
            : check.message || 'You have reached the maximum limit of 3 upcoming plans.'
        );
      }
    } catch (e) {
      // silent — backend check in redeemOffer handles this as fallback
    }
  };

  const closeModal = () => {
    if (redeeming) return;
    setSelectedOffer(null);
    setRedeemError(null);
  };

  const handleRedeemWithPayment = async () => {
    if (redeemError) return;
    if (!selectedPlanName)  { setRedeemError('Please select a plan'); return; }
    if (!paymentMethod)     { setRedeemError('Please select a payment method'); return; }

    setRedeeming(true);
    setRedeemError(null);

    try {
      if (paymentMethod === 'Online') {
        const loaded = await loadRazorpayScript();
        if (!loaded) throw new Error('Could not load payment gateway. Check your internet connection.');

        const orderData = await createOfferPaymentOrder({
          offerId: selectedOffer._id,
          planType: selectedPlanName
        });

        await new Promise((resolve, reject) => {
          const options = {
            key:         orderData.keyId,
            amount:      orderData.amount,
            currency:    orderData.currency,
            name:        'MealSetu',
            description: `${selectedPlanName} Offer Plan`,
            order_id:    orderData.orderId,
            prefill: {
              name:    user?.name  || '',
              email:   user?.email || '',
              contact: (user?.phone || '').replace(/\D/g, '').slice(-10) || '9999999999'
            },
            theme: { color: '#f26522' },
            modal: { ondismiss: () => reject(new Error('cancelled')) },
            handler: async (response) => {
              try {
                await redeemOffer({
                  offerId:      selectedOffer._id,
                  planType:     selectedPlanName,
                  paymentMethod: 'Online',
                  razorpayData: {
                    razorpay_order_id:   response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature:  response.razorpay_signature
                  }
                });
                resolve();
              } catch (err) { reject(err); }
            }
          };
          const rzp = new window.Razorpay(options);
          rzp.on('payment.failed', (resp) =>
            reject(new Error(`Payment failed: ${resp.error.description}`))
          );
          rzp.open();
        });

      } else {
        await redeemOffer({
          offerId:      selectedOffer._id,
          planType:     selectedPlanName,
          paymentMethod: 'Cash'
        });
      }

      // Success
      const offerId = selectedOffer._id;
      setSelectedOffer(null);
      setRedeeming(false);
      setSuccessMsg('Offer redeemed successfully!');
      setTimeout(() => setSuccessMsg(null), 5000);
      if (onRedeemOffer) onRedeemOffer(offerId);

    } catch (err) {
      setRedeeming(false);
      if (err.message === 'cancelled') return;
      setRedeemError(err.message || 'Failed to redeem. Please try again.');
    }
  };

  // Modal computed values
  const availablePlans = selectedOffer?.planDiscounts.filter(p => p.discountPercentage > 0) || [];
  const selectedPlanDiscount = availablePlans.find(p => p.planName === selectedPlanName);
  const originalPrice   = PLAN_PRICES[selectedPlanName] || 0;
  const discountedPrice = selectedPlanDiscount
    ? getDiscountedPrice(selectedPlanName, selectedPlanDiscount.discountPercentage)
    : originalPrice;

  // ── Loading / error / empty states ──────────────────────────
  if (offersLoading) {
    return (
      <div className="offers-container">
        <h2 style={{ color: '#2b3674', marginBottom: '20px' }}>Available Offers</h2>
        <div className="offers-loading"><div className="spinner"></div><p>Loading offers...</p></div>
      </div>
    );
  }

  if (offersError) {
    return (
      <div className="offers-container">
        <h2 style={{ color: '#2b3674', marginBottom: '20px' }}>Available Offers</h2>
        <div className="offers-error">
          <p>⚠️ {offersError}</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: '10px', padding: '8px 20px', background: '#f26522', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!activeOffers || activeOffers.length === 0) {
    return (
      <div className="offers-container">
        <h2 style={{ color: '#2b3674', marginBottom: '20px' }}>Available Offers</h2>
        <div className="offers-empty">
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>🎉</div>
          <h3 style={{ color: '#2b3674', marginBottom: '10px' }}>No active offers right now</h3>
          <p style={{ color: '#64748b' }}>Check back soon for exciting deals from your favorite kitchens!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="offers-container">
      <h2 style={{ color: '#2b3674', marginBottom: '20px' }}>Available Offers</h2>

      {successMsg && (
        <div style={{
          background: '#dcfce7', color: '#15803d', border: '1px solid #86efac',
          borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontWeight: '600'
        }}>
          ✓ {successMsg}
        </div>
      )}

      <div className="offers-grid">
        {activeOffers.map((offer, index) => {
          const isComingSoon = offer.offerStatus === 'coming-soon';
          const isClaimed    = offer.isClaimedByUser === true || claimedOfferIds.includes(offer._id);

          return (
            <div
              key={offer._id || index}
              className={`offer-card-dynamic ${isComingSoon ? 'coming-soon' : ''} ${isClaimed ? 'claimed' : ''}`}
            >
              <div className="offer-image-container">
                <img
                  src={offer.posterImage || FALLBACK_IMAGE}
                  alt={`Offer from ${offer.kitchenName}`}
                  onError={handleImageError}
                  className={`offer-poster-image ${isComingSoon ? 'coming-soon' : ''} ${isClaimed ? 'claimed' : ''}`}
                />
                <div className="offer-vendor-badge">{offer.kitchenName || 'Partner Kitchen'}</div>
                {isClaimed && (
                  <div className="claimed-badge-overlay">
                    <span className="claimed-badge-text">CLAIMED</span>
                  </div>
                )}
              </div>

              <div className="offer-details">
                <div className="offer-validity">
                  <span className="validity-label">📅 Valid:</span>
                  <span className="validity-dates">{formatDate(offer.startDate)} - {formatDate(offer.endDate)}</span>
                </div>

                <div className="offer-discounts">
                  <h4 style={{ margin: '0 0 10px 0', color: '#2b3674', fontSize: '14px' }}>Discounted Plans:</h4>
                  <div className="discount-plans">
                    {offer.planDiscounts && offer.planDiscounts.map((plan, idx) =>
                      plan.discountPercentage > 0 ? (
                        <div key={idx} className="discount-plan-item">
                          <span className="plan-name">{plan.planName}</span>
                          <span className="plan-discount">{plan.discountPercentage}% OFF</span>
                          <div className="plan-prices">
                            <span className="original-price">₹{PLAN_PRICES[plan.planName] || 80}</span>
                            <span className="discounted-price">₹{getDiscountedPrice(plan.planName, plan.discountPercentage)}</span>
                          </div>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>

                {isComingSoon ? (
                  <div className="coming-soon-badge">
                    <span className="coming-soon-label">Coming Soon</span>
                    <span className="coming-soon-date">Starts: {formatDate(offer.startDate)}</span>
                  </div>
                ) : isClaimed ? (
                  <div className="claimed-badge-new">
                    <div className="claimed-badge-content">
                      <span className="claimed-checkmark">✓</span>
                      <div className="claimed-text-group">
                        <span className="claimed-text-main">Claimed</span>
                        <span className="claimed-text-sub">You have redeemed this offer</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button className="redeem-btn" onClick={() => handleOpenRedeemModal(offer)}>
                    Redeem Offer
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Payment Modal ─────────────────────────────────────── */}
      {selectedOffer && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '28px',
            maxWidth: '460px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h3 style={{ margin: 0, color: '#2b3674', fontSize: '18px', fontWeight: '800' }}>Redeem Offer</h3>
              {!redeeming && (
                <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
              )}
            </div>
            <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '13px' }}>
              {selectedOffer.kitchenName}
            </p>

            {/* Plan Selector — only when multiple plans */}
            {availablePlans.length > 1 && (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ margin: '0 0 10px 0', fontWeight: '700', color: '#2b3674', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Select Plan</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {availablePlans.map((p) => (
                    <button
                      key={p.planName}
                      onClick={() => setSelectedPlanName(p.planName)}
                      style={{
                        padding: '8px 18px', borderRadius: '50px',
                        border: `2px solid ${selectedPlanName === p.planName ? '#f26522' : '#e2e8f0'}`,
                        background: selectedPlanName === p.planName ? '#fff5f0' : 'white',
                        color: selectedPlanName === p.planName ? '#f26522' : '#64748b',
                        cursor: 'pointer', fontWeight: '700', fontSize: '13px', transition: 'all 0.15s'
                      }}
                    >
                      {p.planName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Discount Breakdown */}
            {selectedPlanDiscount && (
              <div style={{
                background: '#f8fafc', borderRadius: '12px', padding: '16px',
                marginBottom: '20px', border: '1px solid #e2e8f0'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#64748b', fontSize: '14px' }}>Original Price</span>
                  <span style={{ color: '#94a3b8', textDecoration: 'line-through', fontSize: '14px' }}>₹{originalPrice}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ color: '#16a34a', fontSize: '14px', fontWeight: '700' }}>Discount ({selectedPlanDiscount.discountPercentage}% OFF)</span>
                  <span style={{ color: '#16a34a', fontSize: '14px', fontWeight: '700' }}>
                    − ₹{originalPrice - discountedPrice}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                  <span style={{ color: '#2b3674', fontWeight: '800', fontSize: '15px' }}>You Pay</span>
                  <span style={{ color: '#f26522', fontWeight: '900', fontSize: '22px' }}>₹{discountedPrice}</span>
                </div>
              </div>
            )}

            {/* Payment Method */}
            <div style={{ marginBottom: '20px' }}>
              <p style={{ margin: '0 0 10px 0', fontWeight: '700', color: '#2b3674', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payment Method</p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setPaymentMethod('Cash')}
                  style={{
                    flex: 1, padding: '13px 10px', borderRadius: '10px',
                    border: `2px solid ${paymentMethod === 'Cash' ? '#f26522' : '#e2e8f0'}`,
                    background: paymentMethod === 'Cash' ? '#fff5f0' : 'white',
                    color: paymentMethod === 'Cash' ? '#f26522' : '#64748b',
                    cursor: 'pointer', fontWeight: '700', fontSize: '14px', transition: 'all 0.15s'
                  }}
                >
                  💵 Cash
                </button>
                <button
                  onClick={() => setPaymentMethod('Online')}
                  style={{
                    flex: 1, padding: '13px 10px', borderRadius: '10px',
                    border: `2px solid ${paymentMethod === 'Online' ? '#16a34a' : '#e2e8f0'}`,
                    background: paymentMethod === 'Online' ? '#f0fdf4' : 'white',
                    color: paymentMethod === 'Online' ? '#16a34a' : '#64748b',
                    cursor: 'pointer', fontWeight: '700', fontSize: '14px', transition: 'all 0.15s'
                  }}
                >
                  💳 Online
                </button>
              </div>
            </div>

            {/* Error Box */}
            {redeemError && (
              <div style={{
                background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5',
                borderRadius: '8px', padding: '12px 16px', marginBottom: '16px',
                fontSize: '14px', fontWeight: '500', lineHeight: '1.5'
              }}>
                {redeemError}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={closeModal}
                disabled={redeeming}
                style={{
                  flex: 1, padding: '13px', borderRadius: '10px',
                  border: '1px solid #e2e8f0', background: 'white',
                  color: '#64748b', cursor: redeeming ? 'not-allowed' : 'pointer',
                  fontWeight: '700', fontSize: '14px', opacity: redeeming ? 0.5 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRedeemWithPayment}
                disabled={redeeming || !!redeemError}
                style={{
                  flex: 2, padding: '13px', borderRadius: '10px', border: 'none',
                  background: redeeming || redeemError ? '#94a3b8' : '#f26522',
                  color: 'white', cursor: redeeming || redeemError ? 'not-allowed' : 'pointer',
                  fontWeight: '700', fontSize: '14px', transition: 'background 0.2s'
                }}
              >
                {redeeming
                  ? 'Processing...'
                  : paymentMethod === 'Online'
                    ? 'Pay with Razorpay'
                    : 'Confirm Redemption'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Offers;
