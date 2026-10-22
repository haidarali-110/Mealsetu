import React, { useState, useEffect, useCallback } from 'react';
import { createOffer, getVendorOffers, deleteOffer } from '../../../utils/api';
import { onEvent, offEvent } from '../../../utils/socket';

const VendorOffers = () => {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [redemptionAlert, setRedemptionAlert] = useState(null);

  // Form state
  const [posterImage, setPosterImage] = useState(null);
  const [posterPreview, setPosterPreview] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Plan discounts state
  const [planDiscounts, setPlanDiscounts] = useState([
    { planName: 'One Day', discountPercentage: 0, selected: false },
    { planName: 'Weekly', discountPercentage: 0, selected: false },
    { planName: 'Monthly', discountPercentage: 0, selected: false }
  ]);

  const fetchOffers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getVendorOffers();
      setOffers(data || []);
    } catch (error) {
      console.error('Failed to load offers:', error);
      setMessage({ type: 'error', text: 'Failed to load offers' });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch offers on mount
  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // Real-time socket listeners
  useEffect(() => {
    const handleRedemption = (data) => {
      setRedemptionAlert(data.message || 'A customer redeemed your offer!');
      setTimeout(() => setRedemptionAlert(null), 5000);
      fetchOffers();
    };
    const handleOffersUpdated = () => fetchOffers();

    onEvent('offer_redeemed', handleRedemption);
    onEvent('offers_updated', handleOffersUpdated);
    return () => {
      offEvent('offer_redeemed', handleRedemption);
      offEvent('offers_updated', handleOffersUpdated);
    };
  }, [fetchOffers]);

  const handlePosterChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPosterImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPosterPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePlanDiscountChange = (index, field, value) => {
    const updated = [...planDiscounts];
    updated[index] = { ...updated[index], [field]: value };
    setPlanDiscounts(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!posterImage) {
      setMessage({ type: 'error', text: 'Please upload a poster image' });
      return;
    }
    if (!startDate || !endDate) {
      setMessage({ type: 'error', text: 'Please select start and end dates' });
      return;
    }
    
    const selectedPlans = planDiscounts.filter(p => p.selected);
    if (selectedPlans.length === 0) {
      setMessage({ type: 'error', text: 'Please select at least one plan to apply discount' });
      return;
    }

    // Filter out unselected plans and validate discount percentages
    const validDiscounts = selectedPlans.map(p => ({
      planName: p.planName,
      discountPercentage: parseInt(p.discountPercentage) || 0
    })).filter(p => p.discountPercentage > 0);

    if (validDiscounts.length === 0) {
      setMessage({ type: 'error', text: 'Please enter a valid discount percentage for selected plans' });
      return;
    }

    try {
      setSaving(true);
      setMessage({ type: '', text: '' });

      const formData = new FormData();
      formData.append('posterImage', posterImage);
      formData.append('startDate', startDate);
      formData.append('endDate', endDate);
      formData.append('planDiscounts', JSON.stringify(validDiscounts));

      await createOffer(formData);
      
      setMessage({ type: 'success', text: 'Offer created successfully! Promotional emails are being sent to all users.' });
      
      // Reset form
      setPosterImage(null);
      setPosterPreview(null);
      setStartDate('');
      setEndDate('');
      setPlanDiscounts([
        { planName: 'One Day', discountPercentage: 0, selected: false },
        { planName: 'Weekly', discountPercentage: 0, selected: false },
        { planName: 'Monthly', discountPercentage: 0, selected: false }
      ]);

      // Refresh offers list
      fetchOffers();
    } catch (error) {
      console.error('Failed to create offer:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to create offer' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOffer = async (offerId) => {
    if (!window.confirm('Are you sure you want to delete this offer?')) {
      return;
    }

    try {
      await deleteOffer(offerId);
      setMessage({ type: 'success', text: 'Offer deleted successfully' });
      fetchOffers();
    } catch (error) {
      console.error('Failed to delete offer:', error);
      setMessage({ type: 'error', text: 'Failed to delete offer' });
    }
  };

  // Get today's date for min date
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="v-card">
      <h3 style={{ color: '#2b3674', marginBottom: '20px' }}> Offers & Discounts</h3>

      {/* Redemption Alert */}
      {redemptionAlert && (
        <div style={{
          background: '#dcfce7', color: '#15803d', border: '1px solid #86efac',
          borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontWeight: '600'
        }}>
          🎉 {redemptionAlert}
        </div>
      )}

      {/* Success/Error Message */}
      {message.text && (
        <div style={{ 
          padding: '12px 20px', 
          borderRadius: '8px', 
          marginBottom: '20px',
          background: message.type === 'success' ? '#dcfce7' : message.type === 'error' ? '#fee2e2' : '#fef3c7',
          color: message.type === 'success' ? '#16a34a' : message.type === 'error' ? '#dc2626' : '#d97706',
          fontWeight: '500'
        }}>
          {message.text}
        </div>
      )}

      {/* Create Offer Form */}
      <div style={{ 
        background: '#f8fafc', 
        padding: '25px', 
        borderRadius: '12px', 
        marginBottom: '30px',
        border: '1px solid #e2e8f0'
      }}>
        <h4 style={{ margin: '0 0 20px 0', color: '#2b3674' }}>Create New Offer</h4>
        
        <form onSubmit={handleSubmit}>
          {/* Poster Image Upload */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
              Offer Poster Image *
            </label>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              <div style={{ 
                width: '200px', 
                height: '150px', 
                borderRadius: '12px', 
                border: '2px dashed #cbd5e1', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                overflow: 'hidden', 
                background: '#fff',
                flexShrink: 0
              }}>
                {posterPreview ? (
                  <img 
                    src={posterPreview} 
                    alt="Offer Poster Preview" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ color: '#94a3b8', fontSize: '12px' }}>No Image</span>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handlePosterChange}
                  style={{ marginBottom: '10px' }}
                />
                <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>
                  Upload a promotional poster image for your offer. Recommended size: 800x600 pixels.
                </p>
              </div>
            </div>
          </div>

          {/* Date Pickers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                Start Date *
              </label>
              <input 
                type="date" 
                className="v-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={today}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                End Date *
              </label>
              <input 
                type="date" 
                className="v-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || today}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Plan Discounts */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '12px' }}>
              Plan Discounts *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
              {planDiscounts.map((plan, index) => (
                <div 
                  key={plan.planName}
                  style={{ 
                    background: plan.selected ? '#fff' : '#f1f5f9',
                    padding: '15px', 
                    borderRadius: '10px',
                    border: plan.selected ? '2px solid #f26522' : '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <input 
                      type="checkbox"
                      checked={plan.selected}
                      onChange={(e) => handlePlanDiscountChange(index, 'selected', e.target.checked)}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <strong style={{ color: '#2b3674' }}>{plan.planName} Plan</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ color: '#64748b', fontSize: '14px' }}>Discount:</span>
                    <input 
                      type="number"
                      className="v-input"
                      placeholder="0"
                      value={plan.discountPercentage}
                      onChange={(e) => handlePlanDiscountChange(index, 'discountPercentage', e.target.value)}
                      min="0"
                      max="100"
                      disabled={!plan.selected}
                      style={{ width: '80px', padding: '8px' }}
                    />
                    <span style={{ color: '#64748b', fontSize: '14px' }}>%</span>
                  </div>
                  {plan.selected && plan.discountPercentage > 0 && (
                    <p style={{ color: '#16a34a', fontSize: '12px', margin: '8px 0 0 0' }}>
                      Price: ₹{Math.round((plan.planName === 'One Day' ? 80 : plan.planName === 'Weekly' ? 560 : 2000) * (1 - plan.discountPercentage / 100))}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button 
            type="submit"
            disabled={saving}
            style={{ 
              background: saving ? '#94a3b8' : '#f26522',
              color: 'white',
              border: 'none',
              padding: '12px 30px',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: saving ? 'not-allowed' : 'pointer'
            }}
          >
            {saving ? 'Creating...' : 'Create Offer'}
          </button>
        </form>
      </div>

      {/* Existing Offers List */}
      <div>
        <h4 style={{ margin: '0 0 20px 0', color: '#2b3674' }}>Your Offers</h4>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading offers...</div>
        ) : offers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <p>No offers created yet.</p>
            <p>Create your first offer using the form above!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {offers.map((offer) => (
              <div 
                key={offer._id}
                style={{ 
                  background: '#fff',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                }}
              >
                {/* Poster Image */}
                <div style={{ height: '150px', overflow: 'hidden' }}>
                  {offer.posterImage ? (
                    <img 
                      src={offer.posterImage} 
                      alt="Offer Poster" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#94a3b8' }}>No Image</span>
                    </div>
                  )}
                </div>
                
                {/* Offer Details */}
                <div style={{ padding: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: '600', color: '#2b3674' }}>
                        {offer.vendorId?.kitchenName || 'Your Kitchen'}
                      </p>
                      <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                        {new Date(offer.startDate).toLocaleDateString('en-IN')} - {new Date(offer.endDate).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteOffer(offer._id)}
                      style={{ 
                        background: '#fee2e2',
                        color: '#dc2626',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  
                  {/* Discounts */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {offer.planDiscounts?.map((pd, idx) => (
                      <span 
                        key={idx}
                        style={{ 
                          background: '#dcfce7',
                          color: '#16a34a',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}
                      >
                        {pd.planName}: {pd.discountPercentage}% OFF
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VendorOffers;

