import React, { useState, useEffect } from 'react';
import './DashboardOverview.css';
import { apiCall, closeKitchenWithClosure, reopenKitchen } from '../../../utils/api';
import { onEvent, offEvent } from '../../../utils/socket';

const EMPTY_SLOT = { total: 0, regular: 0, jain: 0 };

const PLANNED_REASONS  = ['Holiday', 'Festival', 'Maintenance', 'Renovation', 'Staff Leave', 'Other'];
const EMERGENCY_REASONS = ['Personal Emergency', 'Health Issue', 'Family Emergency', 'Natural Disaster', 'Power/Gas Outage', 'Other'];

const DashboardOverview = ({
  profile = {},
  revenue = 0,
  ordersToday = 0,
  activeUsers = 0,
  kitchenStatus = { isOpen: false },
  onToggleKitchen = () => {},
  onTabChange = () => {}
}) => {
  const [prepList, setPrepList] = useState({ lunch: EMPTY_SLOT, dinner: EMPTY_SLOT, date: '' });
  const [pendingPayoutData, setPendingPayoutData] = useState({ pendingAmount: 0, overdueAmount: 0 });
  const [isDinnerTime, setIsDinnerTime] = useState(new Date().getHours() >= 15);
  const [selectedSlot, setSelectedSlot] = useState(new Date().getHours() >= 15 ? 'dinner' : 'lunch');
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [closureType, setClosureType] = useState('planned');
  const [closureStartDate, setClosureStartDate] = useState('');
  const [closureEndDate, setClosureEndDate] = useState('');
  const [closureReason, setClosureReason] = useState('Holiday');
  const [closureLoading, setClosureLoading] = useState(false);
  const [closureResult, setClosureResult] = useState(null);
  const [isSubmittingClosure, setIsSubmittingClosure] = useState(false);

  const fetchData = async () => {
    try {
      const [prep, stats] = await Promise.all([
        apiCall('/vendor/preparation-list', { method: 'GET' }),
        apiCall('/vendor/dashboard-stats', { method: 'GET' })
      ]);
      setPrepList({
        lunch: prep.lunch || EMPTY_SLOT,
        dinner: prep.dinner || EMPTY_SLOT,
        date: prep.date || ''
      });
      setPendingPayoutData({
        pendingAmount: stats.pendingPayout || 0,
        overdueAmount: stats.overdueAmount || 0
      });
    } catch (error) {
      console.error('Dashboard overview fetch error:', error);
    }
  };

  useEffect(() => {
    fetchData();
    const dataInterval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(dataInterval);
  }, []);

  useEffect(() => {
    const handleNewOrder = () => fetchData();
    onEvent('new_order', handleNewOrder);
    onEvent('newOrder', handleNewOrder);
    return () => {
      offEvent('new_order', handleNewOrder);
      offEvent('newOrder', handleNewOrder);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timeInterval = setInterval(() => {
      const hrs = new Date().getHours();
      setIsDinnerTime(hrs >= 15);
    }, 60 * 1000);
    return () => clearInterval(timeInterval);
  }, []);

  useEffect(() => {
    setSelectedSlot(isDinnerTime ? 'dinner' : 'lunch');
  }, [isDinnerTime]);

  const activeSlot = selectedSlot === 'dinner' ? prepList.dinner : prepList.lunch;

  const today = new Date().toISOString().split('T')[0];

  // Planned validation
  const isStartValid  = closureType !== 'planned' || (!!closureStartDate && closureStartDate >= today);
  const isEndValid    = closureType === 'planned'
    ? (!!closureEndDate && closureEndDate > closureStartDate)
    : !!closureEndDate;
  const daysCount = closureType === 'planned' && isStartValid && isEndValid
    ? Math.round((new Date(closureEndDate) - new Date(closureStartDate)) / (1000 * 60 * 60 * 24))
    : 0;
  const canConfirm = isStartValid && isEndValid && !!closureReason;

  // Closure context from prop
  const closure           = kitchenStatus.currentClosure;
  const now               = new Date();
  const closureExpiryDate = closure?.endDate ? new Date(closure.endDate) : null;
  const isClosureOverdue  = !kitchenStatus.isOpen && closure?.isActive && closureExpiryDate && closureExpiryDate < now;

  const isEmergencyClosed = !kitchenStatus.isOpen && closure?.isActive && closure?.closureType === 'emergency';
  const isPlannedClosed   = !kitchenStatus.isOpen && closure?.isActive && closure?.closureType === 'planned' && !isClosureOverdue;

  const daysSinceClosure  = isEmergencyClosed && closure?.startDate
    ? Math.floor((Date.now() - new Date(closure.startDate)) / (1000 * 60 * 60 * 24)) + 1
    : 0;
  const expectedDays = isEmergencyClosed && closure?.startDate && closure?.endDate
    ? Math.round((new Date(closure.endDate) - new Date(closure.startDate)) / (1000 * 60 * 60 * 24))
    : 0;

  const handleCloseKitchen = async () => {
    if (!canConfirm || isSubmittingClosure) return;
    setIsSubmittingClosure(true);
    setClosureLoading(true);
    try {
      const payload = closureType === 'emergency'
        ? { closureType, endDate: closureEndDate, reason: closureReason }
        : { closureType, startDate: closureStartDate, endDate: closureEndDate, reason: closureReason };
      const result = await closeKitchenWithClosure(payload);
      setClosureResult(result);
      onToggleKitchen();
    } catch (err) {
      setClosureResult({ error: err.message || 'Failed to close kitchen' });
    } finally {
      setClosureLoading(false);
      setIsSubmittingClosure(false);
    }
  };

  const handleReopenKitchen = async () => {
    try {
      await reopenKitchen();
      onToggleKitchen();
    } catch (err) {
      console.error('Reopen failed:', err);
    }
  };

  const handleManualReopen = async () => {
    if (!window.confirm('Reopen your kitchen now?')) return;
    try {
      await reopenKitchen();
      onToggleKitchen();
    } catch (err) {
      console.error('Manual reopen failed:', err);
      alert('Could not reopen. Please try again.');
    }
  };

  const handleClosureTypeChange = (type) => {
    setClosureType(type);
    setClosureStartDate('');
    setClosureEndDate('');
    setClosureReason('');
  };

  const resetClosureModal = () => {
    setShowClosureModal(false);
    setClosureType('planned');
    setClosureStartDate('');
    setClosureEndDate('');
    setClosureReason('');
    setClosureLoading(false);
    setClosureResult(null);
  };

  return (
    <div className="dashboard-overview">

      {/* Overdue Warning Banner */}
      {pendingPayoutData.overdueAmount > 0 && (
        <div className="overdue-banner">
          <span> <strong>WARNING:</strong> You have an overdue commission payment of ₹{pendingPayoutData.overdueAmount}. Please pay now to avoid account suspension.</span>
          <button className="overdue-pay-btn" onClick={() => onTabChange('commission')}>
            Pay Now
          </button>
        </div>
      )}

      {/* Profile Card */}
      <div className="profile-card">
        <div className="profile-image">
          {profile?.profileImage
            ? <img src={profile.profileImage} alt="Kitchen" />
            : ''}
        </div>
        <div>
          <h2>{profile?.kitchenName || 'Your Kitchen'}</h2>
          <p>{profile?.address || 'Address not set'}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <p>Total Revenue</p>
          <h2>₹{revenue}</h2>
        </div>
        <div className="stat-card">
          <p>Orders Today</p>
          <h2>{ordersToday}</h2>
        </div>
        <div className="stat-card">
          <p>Active Users</p>
          <h2>{activeUsers}</h2>
        </div>
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => onTabChange('commission')}
        >
          <p>Pending Payout</p>
          <h2 style={{ color: '#f26522' }}>
            ₹{pendingPayoutData.pendingAmount.toLocaleString()}
          </h2>
        </div>
      </div>

      {/* Main Grid - Preparation + Kitchen Status */}
      <div className="main-grid">
        <div className="preparation-card">
          <h3>Today's Preparation List</h3>
          {prepList.date && (
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 14px 0' }}>
              {prepList.date}
            </p>
          )}

          {/* Slot pills */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              onClick={() => setSelectedSlot('lunch')}
              style={{
                padding: '6px 18px',
                borderRadius: '50px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '13px',
                background: selectedSlot === 'lunch' ? '#f26522' : '#f4f7fe',
                color: selectedSlot === 'lunch' ? '#fff' : '#94a3b8',
                transition: 'all 0.2s'
              }}
            >
              ☀ Lunch
            </button>
            <button
              onClick={() => setSelectedSlot('dinner')}
              style={{
                padding: '6px 18px',
                borderRadius: '50px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '13px',
                background: selectedSlot === 'dinner' ? '#7c3aed' : '#f4f7fe',
                color: selectedSlot === 'dinner' ? '#fff' : '#94a3b8',
                transition: 'all 0.2s'
              }}
            >
               Dinner
            </button>
          </div>

          {/* Active slot breakdown */}
          {activeSlot.total === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
              No active subscriptions for today.
            </p>
          ) : (
            <>
              <p>Total {selectedSlot === 'dinner' ? 'dinner' : 'lunch'} boxes to pack: {activeSlot.total}</p>
              <hr />
              <div className="preparation-item">
                <span>Regular Thali</span>
                <span>{activeSlot.regular}</span>
              </div>
              <div className="preparation-item">
                <span>Jain Thali</span>
                <span>{activeSlot.jain}</span>
              </div>
            </>
          )}

          {/* Full day summary */}
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 12px 0' }}>
              Full Day Summary
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1, background: '#fff5f0', borderRadius: '12px', padding: '12px', border: '1px solid #fed7aa' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: '600', color: '#f26522' }}>☀ Lunch</p>
                <p style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: '#2b3674' }}>{prepList.lunch.total}</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>R: {prepList.lunch.regular} · J: {prepList.lunch.jain}</p>
              </div>
              <div style={{ flex: 1, background: '#f5f3ff', borderRadius: '12px', padding: '12px', border: '1px solid #ddd6fe' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: '600', color: '#7c3aed' }}> Dinner</p>
                <p style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: '#2b3674' }}>{prepList.dinner.total}</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>R: {prepList.dinner.regular} · J: {prepList.dinner.jain}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="kitchen-status-card">
          <h3>Kitchen Status</h3>

          {/* OVERDUE: planned closure endDate has passed but kitchen still closed */}
          {isClosureOverdue ? (
            <div style={{ marginTop: '12px', border: '1.5px solid #dc2626', borderRadius: '10px', padding: '16px' }}>
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '36px' }}></span>
                <p style={{ fontWeight: '700', color: '#dc2626', margin: '8px 0 4px' }}>Closure Overdue</p>
                <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>
                  Your kitchen was scheduled to reopen on{' '}
                  <strong>
                    {new Date(closure.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </strong>
                  {' '}but is still marked as closed.
                </p>
              </div>
              <button
                onClick={handleManualReopen}
                style={{ width: '100%', padding: '12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}
              >
                 Reopen Kitchen Now
              </button>
            </div>

          /* NORMAL: planned closure still within its window */
          ) : isPlannedClosed ? (
            <div style={{ marginTop: '12px' }}>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '40px' }}></span>
                <p style={{ fontWeight: '700', color: '#2b3674', margin: '8px 0 4px' }}>Planned Closure Active</p>
                <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 4px' }}>
                  Closed from <strong>{new Date(closure.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                  {' '}to <strong>{new Date(closure.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                </p>
              </div>
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '12px', fontSize: '13px', color: '#16a34a', textAlign: 'center' }}>
                 Kitchen will reopen automatically on <strong>{new Date(closure.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</strong>. No action needed.
              </div>
              <button
                onClick={handleManualReopen}
                style={{ marginTop: '10px', width: '100%', padding: '10px', background: 'transparent', color: '#7c3aed', border: '1.5px solid #7c3aed', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
              >
                Reopen Early
              </button>
            </div>

          /* Emergency closure: day counter + Reopen button */
          ) : isEmergencyClosed ? (
            <div style={{ marginTop: '12px' }}>
              <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '40px' }}></span>
                <p style={{ fontWeight: '700', color: '#dc2626', margin: '8px 0 4px' }}>Emergency Closure Active</p>
                <div style={{ display: 'inline-block', background: '#fee2e2', color: '#dc2626', borderRadius: '20px', padding: '4px 14px', fontSize: '13px', fontWeight: '700', margin: '4px 0 8px' }}>
                  Day {daysSinceClosure} of {expectedDays || '?'}
                </div>
                <p style={{ color: '#64748b', fontSize: '12px', margin: '0 0 2px' }}>
                  Closed since: <strong>{new Date(closure.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</strong>
                </p>
                {closure.endDate && (
                  <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>
                    Expected reopen: <strong>{new Date(closure.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</strong>
                  </p>
                )}
              </div>
              <button
                onClick={handleReopenKitchen}
                style={{ width: '100%', padding: '12px', background: '#dcfce7', color: '#16a34a', border: '1.5px solid #86efac', borderRadius: '10px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}
              >
                 Reopen Kitchen Now
              </button>
            </div>

          /* Kitchen is Open */
          ) : kitchenStatus.isOpen ? (
            <>
              <div className="status-display">
                <span className="status-emoji"></span>
                <p className="status-text">Kitchen is Live</p>
                <p className="status-subtext">Accepting new trial orders.</p>
              </div>
              <div style={{ marginTop: '20px' }}>
                <button
                  onClick={() => setShowClosureModal(true)}
                  style={{ width: '100%', padding: '12px', background: '#fee2e2', color: '#dc2626', border: '1.5px solid #fca5a5', borderRadius: '10px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}
                >
                   Close Kitchen
                </button>
              </div>
            </>
          ) : (
            /* Closed but no closure record — fallback reopen */
            <>
              <div className="status-display">
                <span className="status-emoji">💤</span>
                <p className="status-text">Kitchen is Resting</p>
                <p className="status-subtext">Not accepting new orders.</p>
              </div>
              <div style={{ marginTop: '20px' }}>
                <button
                  onClick={handleReopenKitchen}
                  style={{ width: '100%', padding: '12px', background: '#dcfce7', color: '#16a34a', border: '1.5px solid #86efac', borderRadius: '10px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}
                >
                   Reopen Kitchen
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Kitchen Closure Modal — BUGs 3, 4, 8 */}
      {showClosureModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '460px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            {closureResult ? (
              closureResult.error ? (
                <>
                  <p style={{ fontSize: '22px', fontWeight: '800', color: '#dc2626', margin: '0 0 8px' }}>Error</p>
                  <p style={{ color: '#64748b', margin: '0 0 20px' }}>{closureResult.error}</p>
                  <button onClick={resetClosureModal} style={{ width: '100%', padding: '12px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>Close</button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '22px', fontWeight: '800', color: '#16a34a', margin: '0 0 8px' }}>Kitchen Closed</p>
                  {closureType === 'emergency' ? (
                    <p style={{ color: '#64748b', margin: '0 0 20px', lineHeight: '1.6' }}>
                      Emergency closure recorded. Subscribers have been notified. Their plans will be extended once you reopen.
                    </p>
                  ) : (
                    <>
                      <p style={{ color: '#64748b', margin: '0 0 8px' }}>
                        Closed from <strong>{new Date(closureResult.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</strong> to <strong>{new Date(closureResult.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</strong> ({closureResult.closureDays} day{closureResult.closureDays !== 1 ? 's' : ''}).
                      </p>
                      <p style={{ color: '#64748b', margin: '0 0 20px' }}>
                        {closureResult.extendedCount} active plan{closureResult.extendedCount !== 1 ? 's' : ''} extended. All upcoming plans shifted.
                      </p>
                    </>
                  )}
                  <button onClick={resetClosureModal} style={{ width: '100%', padding: '12px', background: '#f0fdf4', color: '#16a34a', border: '1.5px solid #86efac', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>Done</button>
                </>
              )
            ) : (
              <>
                <p style={{ fontSize: '20px', fontWeight: '800', color: '#1e293b', margin: '0 0 4px' }}>Close Kitchen</p>
                <p style={{ color: '#94a3b8', fontSize: '13px', margin: '0 0 20px' }}>Subscribers will be notified automatically.</p>

                {/* BUG 8 — Tab toggle resets reason */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
                  {['planned', 'emergency'].map(t => (
                    <button
                      key={t}
                      onClick={() => handleClosureTypeChange(t)}
                      style={{
                        flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
                        fontWeight: '700', fontSize: '13px', cursor: 'pointer',
                        background: closureType === t ? (t === 'emergency' ? '#fee2e2' : '#eff6ff') : '#f4f7fe',
                        color: closureType === t ? (t === 'emergency' ? '#dc2626' : '#2563eb') : '#94a3b8'
                      }}
                    >
                      {t === 'planned' ? ' Planned' : ' Emergency'}
                    </button>
                  ))}
                </div>

                {/* Info box */}
                <div style={{ background: closureType === 'emergency' ? '#fff5f5' : '#f0f9ff', border: `1px solid ${closureType === 'emergency' ? '#fca5a5' : '#bae6fd'}`, borderRadius: '10px', padding: '12px', marginBottom: '18px', fontSize: '13px', color: closureType === 'emergency' ? '#dc2626' : '#0369a1' }}>
                  {closureType === 'emergency'
                    ? ' Emergency closure takes effect immediately. Subscribers will be notified right away. Plans extended on reopen based on actual days closed.'
                    : ' Planned closure extends all active plans immediately. Upcoming plan dates are shifted by the same number of days.'}
                </div>

                {/* BUG 3 — Planned: Start + End with validation + preview */}
                {/* BUG 4 — Emergency: only Expected Reopen Date */}
                {closureType === 'planned' ? (
                  <>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '6px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '6px' }}>Start Date</label>
                        <input
                          type="date"
                          value={closureStartDate}
                          min={today}
                          onChange={e => setClosureStartDate(e.target.value)}
                          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1.5px solid ${closureStartDate && !isStartValid ? '#ef4444' : '#e2e8f0'}`, fontSize: '14px', boxSizing: 'border-box' }}
                        />
                        {closureStartDate && !isStartValid && (
                          <p style={{ color: '#ef4444', fontSize: '11px', margin: '4px 0 0' }}>Start date cannot be in the past</p>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '6px' }}>End Date</label>
                        <input
                          type="date"
                          value={closureEndDate}
                          min={closureStartDate ? (() => { const d = new Date(closureStartDate); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })() : today}
                          onChange={e => setClosureEndDate(e.target.value)}
                          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1.5px solid ${closureEndDate && !isEndValid ? '#ef4444' : '#e2e8f0'}`, fontSize: '14px', boxSizing: 'border-box' }}
                        />
                        {closureEndDate && !isEndValid && (
                          <p style={{ color: '#ef4444', fontSize: '11px', margin: '4px 0 0' }}>End date must be after start date</p>
                        )}
                      </div>
                    </div>

                    {/* BUG 3 — Days preview */}
                    {daysCount > 0 && (
                      <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#92400e' }}>
                        Kitchen closed for <strong>{daysCount} days</strong>. All active plans extended by {daysCount} days. All upcoming plan dates shifted by {daysCount} days.
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '6px' }}>Expected Reopen Date</label>
                    <input
                      type="date"
                      value={closureEndDate}
                      min={today}
                      onChange={e => setClosureEndDate(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                    <p style={{ color: '#94a3b8', fontSize: '11px', margin: '4px 0 0' }}>Kitchen will reopen on or before this date</p>
                  </div>
                )}

                {/* BUG 8 — Context-specific reasons */}
                <div style={{ marginBottom: '22px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '6px' }}>Reason</label>
                  <select
                    value={closureReason}
                    onChange={e => setClosureReason(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1.5px solid ${!closureReason ? '#fcd34d' : '#e2e8f0'}`, fontSize: '14px', background: '#fff' }}
                  >
                    <option value="">Select a reason…</option>
                    {(closureType === 'planned' ? PLANNED_REASONS : EMERGENCY_REASONS).map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={resetClosureModal}
                    style={{ flex: 1, padding: '12px', background: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', color: '#64748b' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCloseKitchen}
                    disabled={!canConfirm || closureLoading || isSubmittingClosure}
                    style={{
                      flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                      fontWeight: '700', fontSize: '14px',
                      cursor: (!canConfirm || closureLoading || isSubmittingClosure) ? 'not-allowed' : 'pointer',
                      background: (!canConfirm || closureLoading || isSubmittingClosure) ? '#f1f5f9' : '#dc2626',
                      color: (!canConfirm || closureLoading || isSubmittingClosure) ? '#94a3b8' : '#fff'
                    }}
                  >
                    {closureLoading ? 'Closing…' : ' Confirm Close'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default DashboardOverview;
