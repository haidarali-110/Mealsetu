import React, { useState, useEffect, useRef } from 'react';
import './Subscription.css';
import './SubscriptionModal.css';
import {
  apiCall,
  getMySubscription,
  getUpcomingOrders,
  extendSubscriptionOrder,
  checkSubscriptionPaymentStatus,
  getVendorPricingForUser,
  checkCanAddPlan
} from '../../../utils/api';
import { onEvent, offEvent } from '../../../utils/socket';
import { initiateRazorpayPayment } from '../../common/RazorpayCheckout';

const Subscription = ({
  user,
  subscription,
  leaveStart,
  leaveEnd,
  mealType,
  onLeaveStartChange,
  onLeaveEndChange,
  onMealTypeChange,
  onApplyLeave,
  onExtendSubscription,
  onSubscriptionActivated,
  vendorId,
  onNavigateToOrderMeals
}) => {
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [upcomingPlans, setUpcomingPlans] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mealSlotToast, setMealSlotToast] = useState(null);

  const isToastDismissed = (orderId) => {
    if (!orderId) {
      console.log('=== isToastDismissed: orderId is null/undefined — returning false ===');
      return false;
    }
    const key    = `mealslot_dismissed_${orderId}`;
    const result = localStorage.getItem(key) === 'true';
    console.log(`=== isToastDismissed: key=${key} result=${result} ===`);
    return result;
  };

  const dismissToast = (orderId) => {
    if (orderId) localStorage.setItem(`mealslot_dismissed_${orderId}`, 'true');
    setMealSlotToast(null);
  };

  const [leaveOverlapError, setLeaveOverlapError] = useState('');
  const isSubmittingRef = useRef(false);

  // ── Checks if [start, end] overlaps any already-taken leave ─────────────────
  const hasLeaveOverlap = (start, end) => {
    const leaves = currentSubscription?.leaveDates;
    if (!leaves || leaves.length === 0) return false;
    const s = new Date(start);
    const e = new Date(end || start);
    return leaves.some(l => {
      const ls = new Date(l.startDate);
      const le = new Date(l.endDate);
      return s <= le && e >= ls;
    });
  };

  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState('MONTHLY');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('Cash');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [vendorDetails, setVendorDetails] = useState(null);
  const [currentOrderId, setCurrentOrderId] = useState(null);

  // Active vendor name resolved from current subscription
  const [activeVendorName, setActiveVendorName] = useState('');

  const selectedPlanDetails = plans.find((p) => p.id === selectedPlan);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const closeAllModals = () => {
    setShowPaymentModal(false);
    setShowQRCode(false);
    setShowSuccessModal(false);
    setErrorMessage('');
  };

  const isConfirmDisabled = isProcessing || !selectedPlan || !selectedPaymentMethod;

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE FIX: Always resolve vendor ID from the active subscription returned by
  // getMySubscription(), never fall back to the first tiffin on screen.
  // ─────────────────────────────────────────────────────────────────────────────
  const fetchSubscriptionData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch current active order / subscription
      const subData = await getMySubscription();
      console.log('=== SUBSCRIPTION.JSX subData ===', JSON.stringify(subData));
      console.log('=== subData.startsTomorrow ===', subData?.startsTomorrow);
      console.log('=== subData.startDate ===', subData?.startDate);
      console.log('=== subData.status ===', subData?.status);
      setCurrentSubscription(subData);

      // Show meal slot banner when plan needs user assurance (not dismissed)
      if (subData?.startDate && !isToastDismissed(subData.orderId)) {
        console.log('=== BANNER CHECK ENTERED ===');
        console.log('isToastDismissed:', isToastDismissed(subData.orderId));
        console.log('subData.orderId:', subData?.orderId);

        const todayUTC = new Date();
        todayUTC.setUTCHours(0, 0, 0, 0);
        const tomorrowUTC = new Date(todayUTC);
        tomorrowUTC.setUTCDate(tomorrowUTC.getUTCDate() + 1);
        const planStart = new Date(subData.startDate);
        planStart.setUTCHours(0, 0, 0, 0);
        const isToday    = planStart.getTime() === todayUTC.getTime();
        const isTomorrow = subData?.startsTomorrow === true;

        console.log('=== BANNER CONDITIONS ===', {
          planStart:      planStart.toISOString(),
          todayUTC:       todayUTC.toISOString(),
          tomorrowUTC:    tomorrowUTC.toISOString(),
          isToday,
          isTomorrow,
          startsTomorrow: subData?.startsTomorrow,
          rawStartDate:   subData?.startDate
        });

        if (isToday) {
          console.log('=== ENTERED isToday block ===');
          const purchase = new Date(subData.orderDate || subData.startDate);
          const utcHour  = purchase.getUTCHours() + purchase.getUTCMinutes() / 60;

          if (utcHour >= 4.5 && utcHour < 11.5) {
            setMealSlotToast({
              emoji:   '🌙',
              title:   'Dinner Only Today',
              message: 'Lunch time has passed. You will receive Dinner today. From tomorrow both Lunch and Dinner will be served. One extra day has been added to your plan.',
              color:   '#d97706',
              bg:      '#fef3c7'
            });
          }
          // utcHour < 4.5 → both meals active, no banner needed
        } else if (isTomorrow) {
          console.log('=== ENTERED isTomorrow block ===');
          const deliveryDate = planStart.toLocaleDateString('en-IN', {
            weekday: 'long', day: 'numeric', month: 'long'
          });
          setMealSlotToast({
            emoji:   '🌄',
            title:   'Plan Starts Tomorrow',
            message: `Dinner time has passed for today. Your plan will be active from ${deliveryDate} with both Lunch and Dinner.`,
            color:   '#7c3aed',
            bg:      '#ede9fe'
          });
        } else {
          console.log('=== NEITHER isToday NOR isTomorrow — banner skipped ===');
        }
      }

      // 2. Determine which vendor's pricing to load.
      //    subData.vendorId is the ObjectId string for the active vendor.
      //    Only fall back to the prop `vendorId` if there is truly no active plan.
      const activeVendorId = subData?.vendorId
        ? String(subData.vendorId)
        : vendorId
        ? String(vendorId)
        : null;

      // 3. Stash the vendor name so the modal header is correct
      if (subData?.vendorName) {
        setActiveVendorName(subData.vendorName);
      }

      // 4. Fetch pricing only for that vendor
      if (activeVendorId) {
        try {
          const pricingData = await getVendorPricingForUser(activeVendorId);
          const pricing = pricingData?.pricing || [];

          const weekly = pricing.find((p) => p.type === 'weekly');
          const monthly = pricing.find((p) => p.type === 'monthly');

          const dynamicPlans = [];
          if (weekly) {
            dynamicPlans.push({ id: 'WEEKLY', name: 'Weekly', price: weekly.price, days: 7 });
          }
          if (monthly) {
            dynamicPlans.push({ id: 'MONTHLY', name: 'Monthly', price: monthly.price, days: 30 });
          }

          if (dynamicPlans.length > 0) {
            setPlans(dynamicPlans);
            const defaultPlan =
              dynamicPlans.find((p) => p.id === 'MONTHLY') || dynamicPlans[0];
            setSelectedPlan(defaultPlan.id);
          } else {
            // Vendor has no pricing configured — show sensible fallback
            setPlans([
              { id: 'WEEKLY', name: 'Weekly', price: 560, days: 7 },
              { id: 'MONTHLY', name: 'Monthly', price: 2000, days: 30 }
            ]);
            setSelectedPlan('MONTHLY');
          }
        } catch (pricingErr) {
          console.warn('Could not fetch vendor pricing:', pricingErr.message);
          setPlans([
            { id: 'WEEKLY', name: 'Weekly', price: 560, days: 7 },
            { id: 'MONTHLY', name: 'Monthly', price: 2000, days: 30 }
          ]);
          setSelectedPlan('MONTHLY');
        }
      }

      // 5. Fetch upcoming (pending) orders
      const upcomingData = await getUpcomingOrders();
      setUpcomingPlans(upcomingData || []);
      setPendingCount(upcomingData?.length || 0);
    } catch (err) {
      console.error('Error fetching subscription data:', err);
      setCurrentSubscription(null);
      setUpcomingPlans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line
    fetchSubscriptionData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleSubscriptionUpdate = () => fetchSubscriptionData();
    const handlePaymentConfirmed  = () => fetchSubscriptionData();
    onEvent('subscription_updated', handleSubscriptionUpdate);
    onEvent('payment_confirmed',    handlePaymentConfirmed);
    return () => {
      offEvent('subscription_updated', handleSubscriptionUpdate);
      offEvent('payment_confirmed',    handlePaymentConfirmed);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling fallback — re-fetches every 30 s while the page is open.
  // Catches cases where the socket event was emitted before the client joined
  // its room (race condition), ensuring the UI is never permanently stale.
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetchSubscriptionData();
    }, 30000); // 30 seconds
    return () => clearInterval(pollInterval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePaymentMethodSelect = (method) => {
    setSelectedPaymentMethod(method);
  };

  const handleOnlinePayment = async () => {
    const selectedVendorId = currentSubscription?.vendorId
      ? String(currentSubscription.vendorId)
      : vendorId ? String(vendorId) : null;

    if (!selectedVendorId) {
      alert('No vendor available. Please browse and select a vendor first.');
      return;
    }

    setPaymentLoading(true);
    setErrorMessage('');

    try {
      const preCheck = await checkCanAddPlan();
      if (!preCheck.canPurchase) {
        setPaymentLoading(false);
        setErrorMessage(preCheck.message || 'Cannot add more plans at this time.');
        return;
      }
    } catch (err) {
      setPaymentLoading(false);
      setErrorMessage('Could not verify plan eligibility. Please try again.');
      return;
    }

    const amount = selectedPlanDetails?.price || (selectedPlan === 'WEEKLY' ? 560 : 2000);

    await initiateRazorpayPayment({
      amount,
      vendorId:       selectedVendorId,
      plan:           selectedPlan,
      mealPreference: 'Regular',
      deliverySlot:   'Lunch',
      userName:       user?.name,
      userEmail:      user?.email,
      userPhone:      user?.phone,
      onSuccess: async (result) => {
        setPaymentLoading(false);
        setPaymentSuccess(result);
        setShowPaymentModal(false);
        setShowSuccessModal(true);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);
        await fetchSubscriptionData();
        if (onSubscriptionActivated) onSubscriptionActivated(result);
      },
      onFailure: (error) => {
        setPaymentLoading(false);
        setErrorMessage(error || 'Payment failed. Please try again.');
      }
    });
  };

  const handleConfirmSubscribe = async () => {
    if (upcomingPlans.length >= 3) {
      alert('You have reached the maximum limit of 3 upcoming plan extensions.');
      return;
    }
    setIsProcessing(true);
    await createOrder(selectedPaymentMethod);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE FIX: Use the active subscription's vendorId, not the prop fallback.
  // ─────────────────────────────────────────────────────────────────────────────
  const createOrder = async (paymentMethod) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsProcessing(true);
    setIsExtending(true);

    try {
      // Always use the vendor from the ACTIVE subscription, not the first tiffin
      const selectedVendorId = currentSubscription?.vendorId
        ? String(currentSubscription.vendorId)
        : vendorId
        ? String(vendorId)
        : null;

      if (!selectedVendorId) {
        throw new Error('No vendor available. Please browse and select a vendor first.');
      }

      // ── Path A: No active plan — create a brand-new active subscription ──
      if (!currentSubscription) {
        const today = new Date().toISOString().split('T')[0];
        const response = await apiCall('/users/order', {
          method: 'POST',
          body: JSON.stringify({
            vendorId: selectedVendorId,
            amount: selectedPlanDetails?.price || (selectedPlan === 'WEEKLY' ? 560 : 2000),
            plan: selectedPlan,
            paymentMethod: paymentMethod,
            startDate: today,
            deliverySlot: 'Lunch',
            mealPreference: 'Regular'
          })
        });

        setCurrentOrderId(response.order?._id);
        setShowPaymentModal(false);
        setShowSuccessModal(true);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);
        await fetchSubscriptionData();
        closeAllModals();
        if (onSubscriptionActivated) onSubscriptionActivated(response);
        return;
      }

      // ── Path B: Active plan + UPI payment ──
      if (paymentMethod === 'UPI') {
        const vendorRes = await apiCall(`/users/vendors`);
        const vendorsList = Array.isArray(vendorRes) ? vendorRes : vendorRes.vendors || [];
        const matchedVendor = vendorsList.find(
          (v) =>
            String(v._id) === selectedVendorId ||
            String(v.vendorId) === selectedVendorId
        );

        if (!matchedVendor) {
          alert('Vendor not found. Please try again.');
          return;
        }

        if (!matchedVendor.upiId || matchedVendor.upiId.trim() === '') {
          alert(
            'This vendor has not configured UPI payments yet. Please select Cash or try another vendor.'
          );
          return;
        }

        const response = await extendSubscriptionOrder(selectedPlan, selectedVendorId, paymentMethod);
        const orderId = response.order?._id;
        setCurrentOrderId(orderId);
        setVendorDetails({
          upiId: matchedVendor.upiId?.trim(),
          kitchenName: matchedVendor.name || matchedVendor.kitchenName
        });
        setShowPaymentModal(false);
        setShowQRCode(true);
        return;
      }

      // ── Path C: Active plan + Cash payment ──
      const response = await extendSubscriptionOrder(selectedPlan, selectedVendorId, paymentMethod);
      setCurrentOrderId(response.order?._id);
      setShowPaymentModal(false);
      setShowSuccessModal(true);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
      await fetchSubscriptionData();
      closeAllModals();
      if (onSubscriptionActivated) onSubscriptionActivated(response);
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Failed to create subscription: ' + error.message);
    } finally {
      setIsProcessing(false);
      setIsExtending(false);
      isSubmittingRef.current = false;
    }
  };

  // Poll for UPI payment confirmation
  useEffect(() => {
    if (!showQRCode || !currentOrderId) return;

    const interval = setInterval(async () => {
      try {
        const response = await checkSubscriptionPaymentStatus(currentOrderId);
        if (response.paid) {
          clearInterval(interval);
          setShowQRCode(false);
          setCurrentOrderId(null);
          setVendorDetails(null);
          setShowSuccessModal(true);
          await fetchSubscriptionData();
        } else if (response.timeout) {
          clearInterval(interval);
          setShowQRCode(false);
          alert(response.message || 'Payment not received. Please try again.');
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 5000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQRCode, currentOrderId]);

  const handleCancelQR = () => {
    setShowQRCode(false);
    setCurrentOrderId(null);
    setVendorDetails(null);
    setIsProcessing(false);
    setIsExtending(false);
  };

  if (loading) {
    return (
      <div className="subscription-container">
        <div className="subscription-card">
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p>Loading subscription data...</p>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Compute display values for the modal header
  // ─────────────────────────────────────────────────────────────────────────────
  const modalVendorName = activeVendorName || currentSubscription?.vendorName || '';
  const modalExpiryDate = currentSubscription?.endDate
    ? formatDate(currentSubscription.endDate)
    : 'N/A';
  const modalPlanType = currentSubscription?.planType || '';

  return (
    <div className="subscription-container">
      {showSuccessToast && (
        <div className="success-toast">✓ Subscription extended successfully!</div>
      )}

{/* meal slot banner rendered inline — see inside Meal Plan Status card */}

      {/* ── Current Plan Card ── */}
      <div className="subscription-card">
        <h3>Meal Plan Status</h3>

        {mealSlotToast && (
          <div
            style={{
              background:   mealSlotToast.bg,
              border:       `1.5px solid ${mealSlotToast.color}`,
              borderRadius: 10,
              padding:      '14px 18px',
              marginBottom: 16,
              display:      'flex',
              alignItems:   'flex-start',
              gap:          12
            }}
          >
            <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{mealSlotToast.emoji}</span>
            <div style={{ flex: 1 }}>
              <strong style={{ color: mealSlotToast.color, fontSize: 15 }}>
                {mealSlotToast.title}
              </strong>
              <p style={{ margin: '4px 0 0', color: '#4b5563', fontSize: 13, lineHeight: 1.5 }}>
                {mealSlotToast.message}
              </p>
            </div>
            <button
              onClick={() => dismissToast(currentSubscription?.orderId)}
              style={{
                background: 'none',
                border:     'none',
                cursor:     'pointer',
                color:      '#9ca3af',
                fontSize:   18,
                padding:    0,
                lineHeight: 1,
                flexShrink: 0
              }}
            >
              ✕
            </button>
          </div>
        )}

        {currentSubscription ? (
          <div className="status-display">
            <p className="status-label">Current Plan</p>
            <h2 className="status-date" style={{ color: '#16a34a' }}>
              {currentSubscription.planType}
            </h2>
            {modalVendorName && (
              <>
                <p className="status-label" style={{ marginTop: '6px' }}>
                  Kitchen
                </p>
                <p style={{ fontWeight: '600', color: '#f97316', fontSize: '15px' }}>
                  {modalVendorName}
                </p>
              </>
            )}
            <p className="status-label" style={{ marginTop: '10px' }}>
              Valid Until
            </p>
            <h2 className="status-date">{formatDate(currentSubscription.endDate)}</h2>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', fontStyle: 'italic' }}>
              {currentSubscription.lastDayMealSlot === 'lunch'
                ? 'last meal: lunch only'
                : 'last meal day'}
            </p>
            {currentSubscription.status === 'active' ? (
              <p style={{ color: '#16a34a', marginTop: '5px' }}>✓ Active</p>
            ) : (
              <p style={{ color: '#dc2626', marginTop: '5px' }}>⚠ Expired</p>
            )}

            {/* Start date */}
            {currentSubscription.startDate && (
              <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0' }}>
                <strong>Started:</strong>{' '}
                {new Date(currentSubscription.startDate).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })}
              </p>
            )}

            {currentSubscription.paymentMethod === 'Cash' && currentSubscription.paymentStatus === 'Pending' && (
              <div style={{
                background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px',
                padding: '14px 18px', marginTop: '12px', display: 'flex',
                alignItems: 'flex-start', gap: '10px', textAlign: 'left'
              }}>
                <span style={{ fontSize: '20px' }}>💵</span>
                <div>
                  <p style={{ fontWeight: '700', color: '#c2410c', margin: '0 0 4px 0', fontSize: '14px' }}>
                    Cash Payment Pending
                  </p>
                  <p style={{ color: '#9a3412', margin: 0, fontSize: '13px', lineHeight: '1.5' }}>
                    Please pay ₹{currentSubscription.amount} in cash directly to the vendor
                    while collecting your tiffin. Your subscription is already active.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="status-display">
            <p className="status-label">Current Plan</p>
            <h2 className="status-date" style={{ color: '#6b7280' }}>
              No Active Plan
            </h2>
          </div>
        )}

        {currentSubscription && currentSubscription.status === 'active' ? (
          // Has active plan → open the Extend Plan modal
          <button
            className={`btn-primary extend-btn ${upcomingPlans.length >= 3 ? 'disabled' : ''}`}
            onClick={() => {
              setIsExtending(true);
              setShowPaymentModal(true);
            }}
            disabled={isExtending || upcomingPlans.length >= 3}
            title={
              upcomingPlans.length >= 3
                ? 'You have reached the maximum limit of 3 upcoming plan extensions.'
                : ''
            }
          >
            {isExtending ? 'Processing...' : 'Extend Subscription'}
          </button>
        ) : (
          // No active plan → redirect to OrderMeals so user picks a vendor first
          <button
            className="btn-primary extend-btn"
            onClick={() => {
              if (onNavigateToOrderMeals) {
                onNavigateToOrderMeals();
              }
            }}
          >
            Browse &amp; Subscribe
          </button>
        )}
      </div>

      {/* ── Upcoming Plans Card ── */}
      <div className="subscription-card">
        <h3>Upcoming Plan</h3>
        {upcomingPlans && upcomingPlans.length > 0 ? (
          <div className="upcoming-plans-list">
            {upcomingPlans.map((plan, index) => (
              <div key={plan._id || index} className="upcoming-plan-item">
                <div className="upcoming-plan-header">
                  <span className="upcoming-plan-type">{plan.planType}</span>
                  <span className="upcoming-plan-status" style={{ color: '#f59e0b' }}>
                    Pending
                  </span>
                </div>
                <div className="upcoming-plan-details">
                  <p>
                    <strong>Kitchen:</strong> {plan.vendorName}
                  </p>
                  <p>
                    <strong>Starts:</strong> {formatDate(plan.scheduledStartDate)}
                  </p>
                  <p>
                    <strong>Ends:</strong> {formatDate(plan.scheduledEndDate)}
                  </p>
                  <p>
                    <strong>Amount:</strong> ₹{plan.amount}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="status-display">
            <p style={{ color: '#6b7280', textAlign: 'center' }}>No upcoming plans yet</p>
          </div>
        )}
      </div>

      {/* ── Leave / Pause Card ── */}
      <div className="subscription-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h3 style={{ margin: 0 }}>Schedule Leave / Pause</h3>
          {currentSubscription && (
            <span style={{
              background: (currentSubscription.leavesUsed || 0) >= 2 ? '#fee2e2' : '#fef3c7',
              color:      (currentSubscription.leavesUsed || 0) >= 2 ? '#dc2626' : '#92400e',
              padding: '4px 10px',
              borderRadius: '99px',
              fontSize: '12px',
              fontWeight: '600'
            }}>
              Leaves used: {currentSubscription.leavesUsed || 0} / 2
            </span>
          )}
        </div>

        {currentSubscription && (currentSubscription.leavesUsed || 0) >= 2 ? (
          <div style={{
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: '10px',
            padding: '16px',
            color: '#dc2626',
            fontSize: '14px',
            lineHeight: '1.6'
          }}>
            You have used all <strong>2 leaves</strong> for this subscription. Leave allowance resets when you start a new subscription plan.
          </div>
        ) : !currentSubscription ? (
          <div style={{
            background: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: '10px',
            padding: '16px',
            color: '#92400e',
            fontSize: '14px'
          }}>
            You do not have an active or upcoming subscription. Please subscribe first to apply a leave.
          </div>
        ) : (
          <>
            <div className="leave-form">
              <div>
                <label className="input-label">Start Date</label>
                <input
                  type="date"
                  className="input-field date-input"
                  value={leaveStart}
                  onChange={(e) => {
                    const val = e.target.value;
                    onLeaveStartChange(val);
                    setLeaveOverlapError(
                      hasLeaveOverlap(val, leaveEnd || val)
                        ? 'These dates overlap with a leave you already took. Please choose different dates.'
                        : ''
                    );
                  }}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <label className="input-label">End Date</label>
                <input
                  type="date"
                  className="input-field date-input"
                  value={leaveEnd}
                  onChange={(e) => {
                    const val = e.target.value;
                    onLeaveEndChange(val);
                    setLeaveOverlapError(
                      hasLeaveOverlap(leaveStart || val, val)
                        ? 'These dates overlap with a leave you already took. Please choose different dates.'
                        : ''
                    );
                  }}
                  min={leaveStart || new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>

            {/* ── Already-taken leave tags ───────────────────────── */}
            {currentSubscription?.leaveDates?.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: '600' }}>
                  Already on leave:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {currentSubscription.leaveDates.map((l, i) => (
                    <span key={i} style={{
                      background: '#fee2e2',
                      color: '#b91c1c',
                      border: '1px solid #fca5a5',
                      borderRadius: '99px',
                      padding: '3px 10px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}>
                      🚫 {new Date(l.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      {' — '}
                      {new Date(l.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Overlap error ─────────────────────────────────── */}
            {leaveOverlapError && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#b91c1c',
                fontSize: '13px',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                ⚠️ {leaveOverlapError}
              </div>
            )}

            <label className="input-label">Which Meal to Skip?</label>
            <select
              className="input-field"
              value={mealType}
              onChange={(e) => onMealTypeChange(e.target.value)}
            >
              <option value="both">Both (Lunch &amp; Dinner)</option>
              <option value="lunch">Lunch Only</option>
              <option value="dinner">Dinner Only</option>
            </select>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '8px 0 12px' }}>
              Leaves remaining: {2 - (currentSubscription.leavesUsed || 0)}. Your plan will be extended by the number of leave days.
            </p>
            <button
              className="btn-primary apply-leave-btn"
              disabled={!!leaveOverlapError || !leaveStart || !leaveEnd}
              style={{ opacity: (leaveOverlapError || !leaveStart || !leaveEnd) ? 0.5 : 1, cursor: (leaveOverlapError || !leaveStart || !leaveEnd) ? 'not-allowed' : 'pointer' }}
              onClick={async () => {
                if (leaveOverlapError) return;
                await onApplyLeave();
                setLeaveOverlapError('');
                await fetchSubscriptionData();
              }}
            >
              Pause &amp; Extend Plan
            </button>
          </>
        )}
      </div>

      {/* ── Extend Plan Modal ── */}
      {showPaymentModal && (
        <div
          className="subscribe-modal-overlay"
          onClick={() => {
            setShowPaymentModal(false);
            setIsExtending(false);
          }}
        >
          <div className="subscribe-modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              className="subscribe-modal-close"
              onClick={() => {
                setShowPaymentModal(false);
                setIsExtending(false);
              }}
            >
              ×
            </button>
            <div className="subscribe-modal-header">
              <h2 className="subscribe-modal-title">Extend Plan</h2>

              {/* ── Dynamic vendor name + plan summary ── */}
              {modalVendorName && (
                <p style={{ color: '#f97316', fontWeight: '600', fontSize: '14px', marginTop: '4px' }}>
                  Kitchen: {modalVendorName}
                </p>
              )}
              {modalPlanType && (
                <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '2px' }}>
                  Current: {modalPlanType} · Last meal: {modalExpiryDate}
                </p>
              )}
              <p className="subscribe-modal-subtitle">
                Choose a plan to extend after your current plan ends
              </p>
            </div>

            <div className="plan-selection-grid">
              {plans.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#6b7280', gridColumn: '1/-1' }}>
                  Loading plans...
                </p>
              ) : (
                plans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`plan-card-option ${selectedPlan === plan.id ? 'selected' : ''} ${
                      plan.id === 'MONTHLY' ? 'monthly-plan' : ''
                    }`}
                    onClick={() => setSelectedPlan(plan.id)}
                  >
                    {plan.id === 'MONTHLY' && (
                      <span className="most-popular-badge">Most Popular</span>
                    )}
                    <h3 className="plan-name">{plan.name}</h3>
                    <p className="plan-price">₹{plan.price}</p>
                    <p className="plan-duration">{plan.days} Days</p>
                    <ul className="plan-benefits">
                      <li>Fresh meals delivered</li>
                      <li>Flexible pause option</li>
                      <li>Best value guarantee</li>
                    </ul>
                  </div>
                ))
              )}
            </div>

            <div className="payment-method-section">
              <h4 className="payment-method-heading">Payment Method</h4>
              <div className="payment-method-buttons">
                <button
                  className={`payment-method-btn ${selectedPaymentMethod === 'Razorpay' ? 'selected' : ''}`}
                  onClick={() => handlePaymentMethodSelect('Razorpay')}
                >
                  💳 Online
                </button>
                <button
                  className={`payment-method-btn ${
                    selectedPaymentMethod === 'Cash' ? 'selected' : ''
                  }`}
                  onClick={() => handlePaymentMethodSelect('Cash')}
                >
                  💵 Cash
                </button>
              </div>
            </div>

            <div className="order-summary-box">
              {selectedPlan && selectedPlanDetails ? (
                <div className="order-summary-content">
                  <strong>{selectedPlanDetails.name}</strong> Plan — ₹{selectedPlanDetails.price}{' '}
                  · {selectedPlanDetails.days} days
                  {modalVendorName && (
                    <span style={{ display: 'block', color: '#6b7280', fontSize: '12px', marginTop: '4px' }}>
                      Vendor: {modalVendorName}
                    </span>
                  )}
                </div>
              ) : (
                <div className="order-summary-placeholder">Select a plan to see summary</div>
              )}
            </div>

            {errorMessage && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
              }}>
                <span style={{ fontSize: '18px' }}>⚠️</span>
                <div>
                  <p style={{ margin: 0, fontWeight: '600', color: '#dc2626', fontSize: '14px' }}>
                    Cannot Add Plan
                  </p>
                  <p style={{ margin: '4px 0 0', color: '#991b1b', fontSize: '13px' }}>
                    {errorMessage}
                  </p>
                </div>
              </div>
            )}
            <div className="subscribe-modal-button-row">
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowPaymentModal(false);
                  setIsExtending(false);
                }}
              >
                Cancel
              </button>
              {selectedPaymentMethod === 'Razorpay' ? (
                <button
                  className="btn-confirm-subscribe"
                  onClick={handleOnlinePayment}
                  disabled={!selectedPlan || paymentLoading}
                  style={{
                    background: paymentLoading ? '#94a3b8' : '#1a237e',
                    cursor: paymentLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {paymentLoading ? 'Processing...' : '💳 Pay Online (UPI / Card)'}
                </button>
              ) : (
                <button
                  className={`btn-confirm-subscribe ${isConfirmDisabled ? 'disabled' : ''}`}
                  onClick={handleConfirmSubscribe}
                  disabled={isConfirmDisabled}
                >
                  {isProcessing ? 'Processing...' : 'Confirm and Subscribe'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── UPI QR Code Modal ── */}
      {showQRCode && (
        <div className="subscribe-modal-overlay" onClick={handleCancelQR}>
          <div className="subscribe-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="subscribe-modal-close" onClick={handleCancelQR}>
              ×
            </button>
            <div className="subscribe-modal-header">
              <h2 className="subscribe-modal-title">Scan to Pay</h2>
              <p className="subscribe-modal-subtitle">Amount: ₹{selectedPlanDetails?.price}</p>
            </div>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              {vendorDetails?.upiId ? (
                <>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                      `upi://pay?pa=${vendorDetails.upiId}&pn=${encodeURIComponent(
                        vendorDetails.kitchenName || 'MealSetu'
                      )}&am=${selectedPlanDetails?.price}&cu=INR&tn=${encodeURIComponent(
                        'MealSetu Subscription'
                      )}`
                    )}`}
                    alt="UPI QR Code"
                    style={{ width: '200px', height: '200px', borderRadius: '8px' }}
                  />
                  <p style={{ marginTop: '12px', color: '#374151', fontWeight: '500' }}>
                    Paying to: {vendorDetails.kitchenName} ({vendorDetails.upiId})
                  </p>
                </>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <p style={{ color: '#dc2626' }}>⚠ Payment not available. Please contact support.</p>
                </div>
              )}
            </div>
            <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '8px' }}>
              Scan the QR code using any UPI app to pay ₹{selectedPlanDetails?.price}
            </p>
            <p
              style={{
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '13px',
                marginBottom: '20px'
              }}
            >
              ⏳ Waiting for payment confirmation automatically...
            </p>
            <div className="subscribe-modal-button-row">
              <button className="btn-cancel" onClick={handleCancelQR}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Modal ── */}
      {showSuccessModal && (
        <div className="subscribe-modal-overlay" onClick={closeAllModals}>
          <div className="subscribe-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: '#22c55e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px'
                }}
              >
                <span style={{ fontSize: '40px', color: 'white' }}>✓</span>
              </div>
              <h2 className="subscribe-modal-title" style={{ marginBottom: '10px' }}>
                {selectedPaymentMethod === 'Cash'
                  ? 'Order Placed! 🎉'
                  : 'Payment Successful! 🎉'}
              </h2>
              <p className="subscribe-modal-subtitle" style={{ marginBottom: '20px' }}>
                Your subscription has been{' '}
                {currentSubscription ? 'extended' : 'activated'} successfully.
              </p>
              <div className="order-summary-box" style={{ textAlign: 'left' }}>
                <p style={{ margin: '8px 0' }}>
                  <strong>Plan:</strong> {paymentSuccess?.planType || selectedPlanDetails?.name}
                </p>
                <p style={{ margin: '8px 0' }}>
                  <strong>Amount:</strong> ₹{paymentSuccess?.order?.amount || selectedPlanDetails?.price}
                </p>
                {modalVendorName && (
                  <p style={{ margin: '8px 0' }}>
                    <strong>Kitchen:</strong> {modalVendorName}
                  </p>
                )}
                <p style={{ margin: '8px 0' }}>
                  <strong>Payment Method:</strong> {selectedPaymentMethod}
                </p>
                <p style={{ margin: '8px 0' }}>
                  <strong>Valid For:</strong> {{ Trial: 2, Weekly: 7, Monthly: 30 }[paymentSuccess?.planType] || selectedPlanDetails?.days || 30} days
                </p>
                {paymentSuccess?.order?.startDate && (
                  <p style={{ margin: '8px 0' }}>
                    <strong>Starts:</strong>{' '}
                    {new Date(paymentSuccess.order.startDate).toLocaleDateString('en-IN', {
                      weekday: 'short', day: 'numeric', month: 'short'
                    })}
                  </p>
                )}
                {(() => {
                  const orderStartDate = paymentSuccess?.order?.startDate;
                  if (!orderStartDate) return null;

                  const planStart = new Date(orderStartDate);
                  planStart.setUTCHours(0, 0, 0, 0);

                  const todayUTC = new Date();
                  todayUTC.setUTCHours(0, 0, 0, 0);

                  const tomorrowUTC = new Date(todayUTC);
                  tomorrowUTC.setUTCDate(tomorrowUTC.getUTCDate() + 1);

                  const startsToday    = planStart.getTime() === todayUTC.getTime();
                  const startsTomorrow = planStart.getTime() === tomorrowUTC.getTime();

                  if (!startsToday && !startsTomorrow) return null;

                  const purchaseTime = paymentSuccess?.order?.orderDate
                    ? new Date(paymentSuccess.order.orderDate)
                    : new Date();
                  const utcHour = purchaseTime.getUTCHours() + purchaseTime.getUTCMinutes() / 60;

                  if (utcHour < 4.5) return (
                    <p style={{ margin: '6px 0', color: '#16a34a', fontWeight: '600', fontSize: '13px' }}>
                      🌅 Both Lunch &amp; Dinner active today
                    </p>
                  );
                  if (utcHour < 11.5) return (
                    <p style={{ margin: '6px 0', color: '#d97706', fontWeight: '600', fontSize: '13px' }}>
                      🌙 Dinner only today — both meals from tomorrow
                    </p>
                  );
                  return (
                    <p style={{ margin: '6px 0', color: '#7c3aed', fontWeight: '600', fontSize: '13px' }}>
                      🌄 First meal tomorrow morning (Lunch)
                    </p>
                  );
                })()}
              </div>
              <button
                className="btn-confirm-subscribe"
                onClick={() => {
                  setShowSuccessModal(false);
                  setIsExtending(false);
                  setIsProcessing(false);
                }}
                style={{ marginTop: '20px', width: '100%' }}
              >
                Great!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Subscription;
