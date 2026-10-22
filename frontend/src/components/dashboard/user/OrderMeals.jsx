import React, { useState, useEffect, useRef } from 'react';
import './OrderMeals.css';
import './OrderMealsFlow.css';
import { getVendorWeeklyPlan, getVendorStatus, getUserVendorRating, createTrialOrder, getVendorsByPincode, updateUserPincode, checkCanAddPlan } from '../../../utils/api';
import { initiateRazorpayPayment } from '../../common/RazorpayCheckout';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const OrderMeals = ({
  tiffins,
  user,
  hasActivePlan,
  activeSubscription,
  onOrder,
  onViewReviews,
  onWriteReview
}) =>  {
  const userTrialHistory = user?.trialHistory || [];

  const hasUsedTrial = (vendorId) => {
    return userTrialHistory.some(trial =>
      trial.vendorId && trial.vendorId.toString() === vendorId.toString()
    );
  };

  const [selectedTiffin, setSelectedTiffin] = useState(null);
  const [orderStep, setOrderStep] = useState(0);
  const [orderData, setOrderData] = useState({
    plan: '',
    selectedPlan: '',
    menuType: 'regular',
    payment: 'Cash',
    startDate: '',
    altMainSubji: ''
  });

  const [weeklyPlan, setWeeklyPlan] = useState(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [vendorStatuses, setVendorStatuses] = useState({});
  const [loadingStatuses, setLoadingStatuses] = useState(true);
  const [vendorRatings, setVendorRatings] = useState({});
  const [showClosedPopup, setShowClosedPopup] = useState(false);
  const [closedVendorName, setClosedVendorName] = useState('');
  const [orderError, setOrderError] = useState('');

const autoDetectDone = useRef(false);
const menuDaySelectionInitialized = useRef(false);
const menuDayManuallySelected = useRef(false);

  const [userLat, setUserLat] = useState(null);
  const [userLon, setUserLon] = useState(null);
  const [userPincode, setUserPincode] = useState('');
  const [pincodeInput, setPincodeInput] = useState('');
  const [showPincodeInput, setShowPincodeInput] = useState(false);
  const [locationNote, setLocationNote] = useState('');
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [filteredTiffins, setFilteredTiffins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isPincodeSearch, setIsPincodeSearch] = useState(false);
  const [selectedMenuDay, setSelectedMenuDay] = useState('');

  const [showSubscriptionWarning, setShowSubscriptionWarning] = useState(false);
const [selectedNewVendor, setSelectedNewVendor] = useState(null);
  // ALL useEffect hooks moved to TOP before any early returns - FIXES React Hooks violation
  useEffect(() => {
    if (user?.pincode) {
      setUserPincode(user.pincode);
      handlePincodeSearch(user.pincode);
    } else {
      if (!autoDetectDone.current) {
        autoDetectDone.current = true;
        handleDetectLocation();
      }
    }
  }, [user]);

  useEffect(() => {
    const sortedTiffins = (tiffins || []).map(t => {
      const activePricing = (t.pricing || []).filter(p => (p.active === true || p.is_active === true) && p.price > 0);
      return {
        ...t,
        hasPricing: activePricing.length > 0,
        minPrice: activePricing.length > 0 ? Math.min(...activePricing.map(p => p.price)) : t.price || 80,
        activePricing
      };
    }).sort((a, b) => (a.minPrice || 80) - (b.minPrice || 80));

    setFilteredTiffins(sortedTiffins);
  }, [tiffins]);

  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([fetchVendorStatuses(filteredTiffins), fetchVendorRatings(filteredTiffins)]);
      } catch (error) {
        console.error('Failed to load vendor data:', error);
      } finally {
        setLoadingStatuses(false);
      }
    };
    if (filteredTiffins?.length > 0) {
      loadData();
    } else {
      setLoadingStatuses(false);
    }
  }, [filteredTiffins]);

  const WEEKDAYS_DISPLAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const hasDayPlanContent = (plan, day) => {
    if (!plan || !plan[day]) return false;
    const item = plan[day];
    return Boolean(
      (typeof item.mainCourse === 'string' && item.mainCourse.trim()) ||
      (typeof item.altSabji === 'string' && item.altSabji.trim()) ||
      (typeof item.sides === 'string' && item.sides.trim()) ||
      (typeof item.specialAddOns === 'string' && item.specialAddOns.trim())
    );
  };

  useEffect(() => {
    if (
      !weeklyPlan ||
      menuLoading ||
      menuDaySelectionInitialized.current ||
      menuDayManuallySelected.current
    ) return;

    const today = DAYS_OF_WEEK[new Date().getDay()];
    const daysWithContent = WEEKDAYS_DISPLAY_ORDER.filter(day => hasDayPlanContent(weeklyPlan, day));
    const allAvailableDays = WEEKDAYS_DISPLAY_ORDER.filter(day => weeklyPlan?.[day]);
    const validDays = daysWithContent.length > 0 ? daysWithContent : allAvailableDays;

    let defaultDay;
    if (hasDayPlanContent(weeklyPlan, today) || (weeklyPlan[today] && daysWithContent.length === 0)) {
      defaultDay = today;
    } else {
      defaultDay = validDays[0] || 'Monday';
    }

    setSelectedMenuDay(defaultDay);
    menuDaySelectionInitialized.current = true;
  }, [weeklyPlan, menuLoading]);

  const fetchVendorStatuses = async (tiffinsList) => {
    if (!tiffinsList || tiffinsList.length === 0) { setLoadingStatuses(false); return; }
    try {
      const statuses = {};
      await Promise.all(
        tiffinsList.map(async (tiffin) => {
          const vendorId = tiffin.vendorId || tiffin._id || tiffin.id;
          if (vendorId) {
            const status = await getVendorStatus(vendorId).catch(() => ({ isOpen: true }));
            statuses[vendorId] = status;
          }
        })
      );
      setVendorStatuses(statuses);
    } catch (error) {
      console.error('Failed to fetch vendor statuses:', error);
      setVendorStatuses({});
    } finally {
      setLoadingStatuses(false);
    }
  };

  const fetchVendorRatings = async (tiffinsList) => {
    if (!tiffinsList || tiffinsList.length === 0) { setLoadingStatuses(false); return; }
    try {
      const ratings = {};
      await Promise.all(
        tiffinsList.map(async (tiffin) => {
          const vendorId = tiffin.vendorId || tiffin._id || tiffin.id;
          if (vendorId) {
            const ratingData = await getUserVendorRating(vendorId).catch(() => ({ rating: tiffin.rating ?? 0, reviewCount: tiffin.reviewCount ?? 0 }));
            ratings[vendorId] = ratingData;
          }
        })
      );
      setVendorRatings(ratings);
    } catch (error) {
      console.error('Failed to fetch vendor ratings:', error);
      setVendorRatings({});
    } finally {
      setLoadingStatuses(false);
    }
  };

  const getVendorRating = (tiffin) => {
    const vendorId = tiffin.vendorId || tiffin._id || tiffin.id;
    const ratingData = vendorRatings[vendorId];
    if (ratingData && ratingData.rating) return ratingData.rating;
    return tiffin.rating ?? 0;
  };

  const getVendorReviewCount = (tiffin) => {
    const vendorId = tiffin.vendorId || tiffin._id || tiffin.id;
    const ratingData = vendorRatings[vendorId];
    if (ratingData && ratingData.reviewCount !== undefined) return ratingData.reviewCount;
    return 0;
  };

  const isVendorOpen = (tiffin) => {
    const vendorId = tiffin.vendorId || tiffin._id || tiffin.id;
    const status = vendorStatuses[vendorId];
    return status ? status.isOpen : true;
  };

  const handleClosedVendorClick = (tiffin, e) => {
    e.preventDefault();
    e.stopPropagation();
    setClosedVendorName(tiffin.name || 'This Kitchen');
    setShowClosedPopup(true);
  };

  const getDayFromDate = (dateString) => {
    if (!dateString) return DAYS_OF_WEEK[new Date().getDay()];
    const date = new Date(dateString);
    return DAYS_OF_WEEK[date.getDay()];
  };


const startOrder = async (tiffin) => {
  const selectedVendorId = tiffin.vendorId || tiffin._id || tiffin.id;

  // ACTIVE PLAN CHECK
  if (
    activeSubscription &&
    activeSubscription.status === 'active'
  ) {
    const activeVendorId =
      activeSubscription.vendorId?._id ||
      activeSubscription.vendorId;

    // DIFFERENT VENDOR CHECK
    if (String(activeVendorId) !== String(selectedVendorId)) {
      setSelectedNewVendor(tiffin);
      setShowSubscriptionWarning(true);
      return;
    }
  }

  console.log('selectedTiffin upiId:', tiffin.upiId);

  setSelectedTiffin(tiffin);
  setOrderStep(1);
  setWeeklyPlan(null);
  setSelectedMenuDay('');
  menuDaySelectionInitialized.current = false;
  menuDayManuallySelected.current = false;

  const today = new Date().toISOString().split('T')[0];

  setOrderData({
    plan: '',
    selectedPlan: '',
    menuType: 'regular',
    payment: 'Cash',
    startDate: today,
    altMainSubji: ''
  });

  await fetchWeeklyMenu(tiffin);

};

const continueWithUpcomingPlan = async () => {
  if (!selectedNewVendor) return;

  setShowSubscriptionWarning(false);

  setSelectedTiffin(selectedNewVendor);
  setOrderStep(1);
  setWeeklyPlan(null);
  setSelectedMenuDay('');
  menuDaySelectionInitialized.current = false;
  menuDayManuallySelected.current = false;

  const today = new Date().toISOString().split('T')[0];

  setOrderData({
    plan: '',
    selectedPlan: '',
    menuType: 'regular',
    payment: 'Cash',
    startDate: today,
    altMainSubji: ''
  });

  await fetchWeeklyMenu(selectedNewVendor);

};



  const fetchWeeklyMenu = async (tiffin) => {
    const vendorId = tiffin.vendorId || tiffin._id || tiffin.id;
    if (!vendorId) return;
    try {
      setMenuLoading(true);
      const data = await getVendorWeeklyPlan(vendorId);
      setWeeklyPlan(data.weeklyPlan || data);
    } catch (e) {
      setWeeklyPlan(null);
    } finally {
      setMenuLoading(false);
    }
  };

  const getMenuForSelectedDate = () => {
    if (!weeklyPlan || !orderData.startDate) return null;
    const day = getDayFromDate(orderData.startDate);
    return weeklyPlan[day] || null;
  };

  // ✅ SINGLE getPlanPrice — dynamic from vendor pricing, no duplicate
  const getPlanPrice = () => {
    if (!selectedTiffin) return 0;
    const activePricing = selectedTiffin.activePricing ||
      (selectedTiffin.pricing || []).filter(p => (p.active === true || p.is_active === true) && p.price > 0);
    const plan = activePricing.find(p => {
      if (orderData.plan === 'ONEDAY') return p.type === 'daily';
      if (orderData.plan === 'WEEKLY') return p.type === 'weekly';
      if (orderData.plan === 'MONTHLY') return p.type === 'monthly';
      return false;
    });
    return plan ? plan.price : 0;
  };

  const getPlanDays = () => {
    switch (orderData.plan) {
      case 'ONEDAY': return 1;
      case 'WEEKLY': return 7;
      case 'MONTHLY': return 30;
      default: return 1;
    }
  };

  const getPlanName = () => {
    switch (orderData.plan) {
      case 'ONEDAY': return '1 Day';
      case 'WEEKLY': return 'Weekly';
      case 'MONTHLY': return 'Monthly';
      default: return orderData.plan || 'N/A';
    }
  };

  const goBack = () => {
    setOrderError('');
    if (orderStep === 1) {
      setOrderStep(0);
      setSelectedTiffin(null);
      setWeeklyPlan(null);
    } else {
      setOrderStep(orderStep - 1);
    }
  };

  const handlePaymentChange = (payment) => setOrderData({ ...orderData, payment });

  const handleConfirmClick = async () => {
    if (orderData.payment === 'online') {
      const selectedVendorId = String(selectedTiffin.vendorId || selectedTiffin._id || selectedTiffin.id);
      const amount = getPlanPrice();

      setOrderError('');

      try {
        const check = await checkCanAddPlan();
        if (!check.canPurchase) {
          setOrderError(check.message || 'Cannot add more plans at this time.');
          return;
        }
      } catch (err) {
        setOrderError('Could not process payment. Please try again.');
        return;
      }

      await initiateRazorpayPayment({
        amount,
        vendorId:       selectedVendorId,
        plan:           orderData.plan,
        mealPreference: orderData.menuType === 'jain' ? 'Jain' : 'Regular',
        deliverySlot:   'Lunch',
        userName:       user?.name,
        userEmail:      user?.email,
        userPhone:      user?.phone,
        onSuccess: (result) => {
          alert(`Order Confirmed!\nPlan: ${result.planType}\nMeal: ${orderData.menuType === 'jain' ? 'Jain' : 'Regular'}\nTotal: ₹${amount}`);
          setOrderStep(0);
          setSelectedTiffin(null);
          setWeeklyPlan(null);
          setOrderData({ plan: '', selectedPlan: '', menuType: 'regular', payment: 'Cash', startDate: '', altMainSubji: '' });
        },
        onFailure: (error) => {
          setOrderError('Payment failed: ' + error);
        }
      });
    } else if (orderData.payment === 'UPI') {
      setShowQRCode(true);
    } else {
      confirmOrder();
    }
  };

  const confirmOrder = async () => {
    if (!orderData.selectedPlan || !orderData.menuType) {
      setOrderError('Please select a plan and meal type');
      return;
    }

    setOrderError('');

    try {
      const check = await checkCanAddPlan();
      if (!check.canPurchase) {
        setOrderError(check.message || 'You have reached the maximum limit of 3 upcoming plan extensions.');
        return;
      }
    } catch (err) {
      setOrderError('Could not verify plan eligibility. Please try again.');
      return;
    }

    try {
      const planTypeMap = { 'ONEDAY': 'daily', 'WEEKLY': 'weekly', 'MONTHLY': 'monthly' };
      const resolvedPlanType = planTypeMap[orderData.plan] || orderData.selectedPlan;
      const activePricing = selectedTiffin.activePricing ||
        (selectedTiffin.pricing || []).filter(p => (p.active || p.is_active) && p.price > 0);
      const resolvedPrice = activePricing.find(p => p.type === resolvedPlanType)?.price || getPlanPrice();

      const finalOrderData = {
        ...orderData,
        vendorId: selectedTiffin._id || selectedTiffin.vendorId,
        vendorName: selectedTiffin.name,
        price: resolvedPrice,
        menuType: orderData.menuType,
        selectedPlan: resolvedPlanType,
        totalAmount: resolvedPrice,
        plan: orderData.plan || 'ONEDAY',
        paymentMethod: orderData.payment
      };

      await onOrder(selectedTiffin, finalOrderData);
      alert(`Order Confirmed!\nPlan: ${resolvedPlanType.toUpperCase()}\nMeal: ${orderData.menuType === 'jain' ? 'Jain' : 'Regular'}\nTotal: ₹${resolvedPrice}`);
      setOrderStep(0);
      setSelectedTiffin(null);
      setWeeklyPlan(null);
      setOrderData({ plan: '', selectedPlan: '', menuType: 'regular', payment: 'Cash', startDate: '', altMainSubji: '' });
    } catch (error) {
      setOrderError(error.message || 'Failed to place order');
      return;
    }
  };

  const handleDetectLocation = async () => {
    setDetectingLocation(true);
    if (!navigator.geolocation) {
      handlePincodeSearch('');
      setDetectingLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          setUserLat(latitude);
          setUserLon(longitude);
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=AIzaSyCgJ0v4LEJaPxZUQR20A56GpBeFa8cf3LQ&language=en`
          );
          const data = await response.json();
          const components = data.results?.[0]?.address_components || [];
          const detectedPincode = components.find(c => c.types.includes('postal_code'))?.long_name;
          if (detectedPincode) {
            setPincodeInput(detectedPincode);
            try { await updateUserPincode(detectedPincode); } catch (err) { console.error('Failed to save pincode:', err); }
            handlePincodeSearch(detectedPincode, latitude, longitude);
          } else {
            handlePincodeSearch('');
          }
        } catch (err) {
          handlePincodeSearch('');
        } finally {
          setDetectingLocation(false);
        }
      },
      () => {
        setDetectingLocation(false);
        handlePincodeSearch('');
      }
    );
  };

  const handlePincodeSearch = async (pincode, lat = null, lon = null) => {
    if (lat === null || lon === null) { setUserLat(null); setUserLon(null); }
    setShowPincodeInput(false);
    if (!pincode) {
      setFilteredTiffins(tiffins || []);
      setLocationNote('');
      setUserPincode('');
      return;
    }
    setUserPincode(pincode);
    setIsPincodeSearch(pincode !== '');
    try {
      setLoading(true);
      const result = await getVendorsByPincode(pincode, lat, lon);
      let note = result.locationNote || '';
      const vendors = result.vendors || [];
      if (vendors.length === 0) {
        setFilteredTiffins(tiffins || []);
        note = `No vendors found near ${pincode} — showing all available vendors`;
      } else {
        setFilteredTiffins(vendors);
        if (!result.locationNote) note = `Found ${vendors.length} vendors near ${pincode}`;
      }
      setLocationNote(note);
    } catch (error) {
      console.error('Pincode search error:', error);
      setFilteredTiffins(tiffins || []);
      setLocationNote('');
      setIsPincodeSearch(false);
    } finally {
      setLoading(false);
    }
  };

  const handleTrialClick = async (tiffin, e) => {
    e.preventDefault();
    e.stopPropagation();
    const vendorId = tiffin.vendorId || tiffin._id || tiffin.id;
    if (!vendorId) { alert('Unable to start trial: missing vendor id'); return; }
    if (!tiffin.trialEnabled) { alert('This vendor does not offer trials'); return; }
    if (hasUsedTrial(vendorId)) { alert('You have already used a trial for this vendor'); return; }
    const confirmTrial = window.confirm(
      tiffin.trialFee > 0 ? `Start a 2-day trial for ₹${tiffin.trialFee}?` : 'Start a 2-day free trial?'
    );
    if (!confirmTrial) return;
    try {
      const result = await createTrialOrder(vendorId, 'Cash', 'Regular');
      alert(`Trial Activated!\n\nKitchen: ${result.trialDetails.vendorName}\nStart: ${new Date(result.trialDetails.startDate).toLocaleDateString('en-IN')}\nEnd: ${new Date(result.trialDetails.endDate).toLocaleDateString('en-IN')}\nFee: ${result.trialDetails.isFree ? 'FREE' : '₹' + result.trialDetails.trialFee}`);
    } catch (error) {
      alert('Failed to start trial: ' + error.message);
    }
  };

  // =================== STEP 0: VENDOR LIST ===================
  if (orderStep === 0) {
    return (
      <div className="order-meals-grid">
        {/* Location Bar */}
        <div style={{ width: '100%', background: 'white', padding: '14px 20px', borderRadius: '12px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '18px' }}>📍</span>
          <span style={{ fontWeight: '600', color: '#1a2240', fontSize: '14px', flex: 1 }}>
            {userPincode ? `Showing vendors near ${userPincode}` : 'Select your location to find nearby vendors'}
          </span>
          <button onClick={() => setShowPincodeInput(!showPincodeInput)} style={{ background: 'none', border: '1.5px solid #f97316', color: '#f97316', padding: '7px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Change</button>
          <button onClick={handleDetectLocation} disabled={detectingLocation} style={{ background: '#f97316', color: 'white', border: 'none', padding: '7px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', opacity: detectingLocation ? 0.6 : 1 }}>
            {detectingLocation ? 'Detecting...' : '📡 Detect Location'}
          </button>
        </div>

        {showPincodeInput && (
          <div style={{ width: '100%', display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Enter pincode (e.g. 396001)" value={pincodeInput} onChange={(e) => setPincodeInput(e.target.value)} maxLength={6} onKeyPress={(e) => { if (e.key === 'Enter') handlePincodeSearch(pincodeInput); }} style={{ padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', width: '200px', outline: 'none' }} />
            <button onClick={() => handlePincodeSearch(pincodeInput)} style={{ background: '#1a2240', color: 'white', border: 'none', padding: '10px 22px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}>Search</button>
            <button onClick={() => handlePincodeSearch('')} style={{ background: 'white', color: '#64748b', border: '1px solid #e2e8f0', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}>Show All</button>
          </div>
        )}

        {locationNote && (
          <div style={{ width: '100%', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', marginBottom: '16px', background: locationNote.includes('nearby') ? '#dcfce7' : '#eff6ff', color: locationNote.includes('nearby') ? '#16a34a' : '#2563eb' }}>
            {locationNote}
          </div>
        )}

        {loading && <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px', width: '100%' }}><div>🔍 Searching kitchens near you...</div></div>}
        {detectingLocation && filteredTiffins.length === 0 && <div style={{ textAlign: 'center', padding: '60px 20px', width: '100%' }}><p style={{ fontSize: '16px', color: '#64748b' }}>Finding kitchens near you...</p></div>}
        {loadingStatuses && !loading && !detectingLocation && <div style={{ textAlign: 'center', padding: '40px', width: '100%' }}><p>Loading kitchen status...</p></div>}

        {filteredTiffins.length === 0 && !loading && !loadingStatuses && !detectingLocation && (
          <div style={{ textAlign: 'center', padding: '60px 20px', width: '100%' }}>
            <p style={{ fontSize: '18px', color: '#64748b' }}>😔 No vendors found in your area</p>
            <p style={{ color: '#94a3b8', marginTop: '8px' }}>Try a different pincode or click Show All</p>
            <button onClick={() => handlePincodeSearch('')} style={{ marginTop: '16px', background: '#f97316', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Show All Vendors</button>
          </div>
        )}

        {filteredTiffins.length > 0 && !loading && !loadingStatuses && (
          filteredTiffins.map((t, i) => {
            const vendorId = t.vendorId || t._id || t.id;
            const isOpen = isVendorOpen(t);
            const dynamicRating = getVendorRating(t);
            const reviewCount = getVendorReviewCount(t);
            const activePricing = t.activePricing || (t.pricing || []).filter(p => (p.active === true || p.is_active === true) && p.price > 0);

            return (
              <div key={i} className={`tiffing-card ${!isOpen ? 'kitchen-closed' : ''}`}>
                <div className="kitchen-image-wrapper">
                  {t.kitchenPoster ? (
                    <img src={t.kitchenPoster} alt="Kitchen Banner" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block', ...(!isOpen ? { filter: 'grayscale(100%) opacity(0.6)' } : {}) }} onError={(e) => { e.target.onerror = null; e.target.src = "https://images.unsplash.com/photo-1547573854-74d2a71d0826?w=500"; }} />
                  ) : (
                    <img src="https://images.unsplash.com/photo-1547573854-74d2a71d0826?w=500" alt="Kitchen" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block', ...(!isOpen ? { filter: 'grayscale(100%) opacity(0.6)' } : {}) }} />
                  )}
                  {reviewCount === 0
                    ? <div className="rating-badge rating-badge-new">New</div>
                    : <div className="rating-badge">⭐ {dynamicRating.toFixed(1)}</div>
                  }
                  {!isOpen && <div className="kitchen-closed-overlay"><span className="closed-badge">Kitchen Closed</span></div>}
                </div>
                <div className="card-details">
                  <div className="vendor-header">
                    <div>
                      <h3 className="vendor-name">{t.name}</h3>
                      <p className="vendor-type">{t.type}</p>
                      <div style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 8px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                     📍 {
  typeof t.address === 'string'
    ? t.address.split(',').slice(-2).join(', ')
    : t.address && typeof t.address === 'object'
      ? (
          t.address.city ||
          t.address.area ||
          t.address.locality ||
          t.address.pincode ||
          t.pincode ||
          'Location not available'
        )
      : (t.pincode || 'Navsari')
}
                        {isPincodeSearch && userPincode && <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>Nearby ✓</span>}
                        {t.distanceKm !== null && t.distanceKm !== undefined && <span style={{ background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', marginLeft: '6px' }}>📍 {t.distanceKm} km away</span>}
                      </div>
                    </div>
                    <span className="fssai-pill">FSSAI: {t.fssai}</span>
                  </div>
                  <button className="view-reviews-link" onClick={() => onViewReviews(t)}>View {reviewCount} Reviews</button>
                  <div className="info-grid">
                    <div className="info-item"><span>Days</span><strong>{t.workingDays}</strong></div>
                    <div className="info-item"><span>Timings</span><strong>{t.timings}</strong></div>
                  </div>
                  <div className="price-section">
                    {activePricing.length === 0 ? (
                      <>
                        <div className="price-text" style={{ color: '#f97316' }}>⚠️ Pricing Not Set</div>
                        <button className="modern-order-btn" disabled style={{ opacity: 0.6 }}>Contact Vendor</button>
                      </>
                    ) : (
                      <>
                        <div className="price-text">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: '#2b3674' }}>from ₹{Math.min(...activePricing.map(p => p.price))}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '12px' }}>
                              {activePricing.map(plan => (
                                <div key={plan.type} style={{ background: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: '12px', fontWeight: '600' }}>
                                  {plan.type.toUpperCase()} ₹{plan.price}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        {t.offersJainMenu && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#dcfce7', color: '#16a34a', padding: '6px 12px', borderRadius: '16px', fontSize: '13px', fontWeight: 700, marginBottom: '12px', boxShadow: '0 2px 4px rgba(34,197,94,0.2)' }}>
                            ☘️ Jain Menu Available
                          </div>
                        )}
                        {isOpen ? (
                          <button className="modern-order-btn" onClick={() => startOrder(t)}>Order Now</button>
                        ) : (
                          <button className="modern-order-btn kitchen-closed-btn" onClick={(e) => handleClosedVendorClick(t, e)} disabled>Kitchen Closed</button>
                        )}
                      </>
                    )}
                  </div>

                  {t.trialEnabled === true && !hasActivePlan && (
                    <div style={{ marginTop: '10px' }}>
                      {hasUsedTrial(vendorId) ? (
                        <div style={{ width: '100%', padding: '10px 12px', background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '8px', textAlign: 'center', fontWeight: '600', fontSize: '13px' }}>✓ Trial Already Used</div>
                      ) : (
                        <button onClick={(e) => handleTrialClick(t, e)} style={{ width: '100%', padding: '10px 12px', background: !t.trialFee || t.trialFee === 0 ? '#16a34a' : '#f26522', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          {!t.trialFee || t.trialFee === 0 ? '2 Day Free Trial' : `2 Day Trial - Just ₹${t.trialFee}`}
                        </button>
                      )}
                    </div>
                  )}
                  <button className="write-review-btn-link" onClick={() => onWriteReview(t)}>Write Review</button>
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }


  // =================== ORDER FLOW STEPS ===================
  return (
    <div className="order-flow-container">
      <div className="order-header-nav">
        <button className="back-btn" onClick={goBack}>← Back</button>
        <h2>Order from {selectedTiffin?.name}</h2>
      </div>

      <div className="step-indicator">
        <div className={`step ${orderStep >= 1 ? 'active' : ''}`}>Plan</div>
        <div className={`step ${orderStep >= 2 ? 'active' : ''}`}>Menu</div>
        <div className={`step ${orderStep >= 3 ? 'active' : ''}`}>Payment</div>
      </div>

      {/* ===== STEP 1: SELECT PLAN ===== */}
      {orderStep === 1 && (
        <div className="step-content">
          <h3>Select Your Plan</h3>
          <div className="plan-grid">
            {(() => {
              const activePricing = selectedTiffin?.activePricing ||
                (selectedTiffin?.pricing || []).filter(p => (p.active || p.is_active) && p.price > 0);

              if (!activePricing || activePricing.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#f97316', gridColumn: '1/-1' }}>
                    ⚠️ This vendor has not set up pricing yet. Please contact them directly.
                  </div>
                );
              }

              return activePricing.sort((a, b) => a.price - b.price).map(plan => {
                const planKey = plan.type === 'daily' ? 'ONEDAY' : plan.type === 'weekly' ? 'WEEKLY' : 'MONTHLY';
                const planLabel = plan.type === 'daily' ? '1 Day' : plan.type === 'weekly' ? 'Weekly (7 days)' : 'Monthly (30 days)';
                return (
                  <div
                    key={plan.type}
                    className={`plan-card ${orderData.plan === planKey ? 'selected' : ''}`}
                    onClick={() => setOrderData({ ...orderData, plan: planKey, selectedPlan: plan.type })}
                    style={{ cursor: 'pointer' }}
                  >
                    <strong>{planLabel}</strong>
                    <span>₹{plan.price}</span>
                  </div>
                );
              });
            })()}
          </div>
<label className="input-label">START DATE</label>
          {/* FIX 6: Lock startDate to today when user has NO active plan */}
          <input 
            type="date"
            value={orderData.startDate}
            onChange={(e) => {
              // Only allow future dates if user has an active plan
              if (!hasActivePlan) {
                // Force today when no active plan
                const today = new Date().toISOString().split('T')[0];
                setOrderData({ ...orderData, startDate: today });
              } else {
                setOrderData({ ...orderData, startDate: e.target.value });
              }
            }} 
            min={new Date().toISOString().split('T')[0]}
            disabled={!hasActivePlan}
            className="date-input"
          />
          <button className="primary-order-btn" onClick={() => setOrderStep(2)} disabled={!orderData.startDate || !orderData.plan}>
            Next: View Menu
          </button>
        </div>
      )}

      {/* ===== STEP 2: MENU & MEAL TYPE ===== */}
      {/* {orderStep === 2 && (
  <div className="step-content">
    <h3>Select Menu Day</h3>

    <div style={{ display: 'flex', overflowX: 'auto', gap: '8px', marginBottom: '20px', paddingBottom: '8px', WebkitOverflowScrolling: 'touch' }}>
      {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day => (
        <button
          key={day}
          onClick={() => {
            menuDayManuallySelected.current = true;
            setSelectedMenuDay(day);
          }}
          style={{
            padding: '8px 14px',
            borderRadius: '20px',
            border: selectedMenuDay === day ? 'none' : '1.5px solid #e2e8f0',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '13px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            background: selectedMenuDay === day ? '#E8500A' : 'white',
            color: selectedMenuDay === day ? 'white' : '#64748b',
            transition: 'all 0.2s'
          }}
        >
          {day.slice(0,3)}
        </button>
      ))}
    </div>

    <div style={{ background: '#fff7ed', padding: '16px', borderRadius: '12px', border: '2px solid #E8500A', marginBottom: '20px' }}>
      <h4 style={{ margin: '0 0 12px 0', color: '#E8500A', fontSize: '15px' }}>
        📅 Menu for {selectedMenuDay}
      </h4>
      {menuLoading ? (
        <p style={{ color: '#94a3b8', margin: 0 }}>Loading menu...</p>
      ) : weeklyPlan?.[selectedMenuDay] ? (
        <div style={{ display: 'grid', gap: '6px', fontSize: '14px', color: '#2b3674' }}>
          <div><strong>Main Course:</strong> {weeklyPlan[selectedMenuDay]?.mainCourse || <span style={{color:'#94a3b8'}}>Not set</span>}</div>
          <div><strong>Alt Sabji:</strong> {weeklyPlan[selectedMenuDay]?.altSabji || <span style={{color:'#94a3b8'}}>Not set</span>}</div>
          <div><strong>2nd Alt Sabji:</strong> {weeklyPlan[selectedMenuDay]?.altSabji2 || <span style={{color:'#94a3b8'}}>Not set</span>}</div>
          <div><strong>Sides:</strong> {weeklyPlan[selectedMenuDay]?.sides || <span style={{color:'#94a3b8'}}>Not set</span>}</div>
          <div><strong>Special Add-ons:</strong> {weeklyPlan[selectedMenuDay]?.specialAddOns || <span style={{color:'#94a3b8'}}>Not set</span>}</div>
        </div>
      ) : (
        <p style={{ color: '#94a3b8', margin: 0 }}>No menu available for {selectedMenuDay}.</p>
      )}
    </div>

    <div style={{ marginBottom: '20px' }}>
      <label className="input-label">ALTER MAIN SUBJI</label>
      <select
        value={orderData.altMainSubji || ''}
        onChange={(e) => setOrderData({ ...orderData, altMainSubji: e.target.value })}
        style={{ width: '100%', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', marginTop: '6px', background: 'white', cursor: 'pointer', color: '#2b3674' }}
      >
        <option value="">Use Default Menu</option>
        {weeklyPlan?.[selectedMenuDay]?.altSabji?.trim() && (
          <option value={weeklyPlan[selectedMenuDay].altSabji}>
            Alt: {weeklyPlan[selectedMenuDay].altSabji}
          </option>
        )}
        {weeklyPlan?.[selectedMenuDay]?.altSabji2?.trim() && (
          <option value={weeklyPlan[selectedMenuDay].altSabji2}>
            2nd Alt: {weeklyPlan[selectedMenuDay].altSabji2}
          </option>
        )}
      </select>
    </div>

    <label className="input-label">Meal Preference</label>
    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', marginTop: '8px', flexWrap: 'wrap' }}>
      <button
        className={`meal-type-btn ${orderData.menuType === 'regular' ? 'active' : ''}`}
        onClick={() => setOrderData({ ...orderData, menuType: 'regular' })}
        style={{ cursor: 'pointer', padding: '10px 20px', borderRadius: '8px', border: orderData.menuType === 'regular' ? 'none' : '1.5px solid #e2e8f0', background: orderData.menuType === 'regular' ? '#E8500A' : 'white', color: orderData.menuType === 'regular' ? 'white' : '#64748b', fontWeight: '600' }}
      >
        🍛 Regular
      </button>
      {selectedTiffin?.offersJainMenu && (
        <button
          className={`meal-type-btn ${orderData.menuType === 'jain' ? 'active' : ''}`}
          onClick={() => setOrderData({ ...orderData, menuType: 'jain' })}
          style={{ cursor: 'pointer', padding: '10px 20px', borderRadius: '8px', border: orderData.menuType === 'jain' ? 'none' : '1.5px solid #16a34a', background: orderData.menuType === 'jain' ? '#16a34a' : 'white', color: orderData.menuType === 'jain' ? 'white' : '#16a34a', fontWeight: '600' }}
        >
          ☘️ Jain Menu
        </button>
      )}
    </div>

    {!selectedTiffin?.offersJainMenu && (
      <div style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '8px', padding: '12px', marginBottom: '20px', color: '#6b7280', fontSize: '14px' }}>
        ℹ️ Jain menu is not available for this kitchen.
      </div>
    )}

    {orderData.menuType === 'jain' && selectedTiffin?.offersJainMenu && (
      <div style={{ background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
        <h4 style={{ color: '#16a34a', margin: '0 0 12px 0' }}>☘️ Jain Menu for {selectedMenuDay}</h4>
        {selectedTiffin?.jainWeeklyPlan?.[selectedMenuDay]?.mainCourse ? (
          <div style={{ display: 'grid', gap: '6px', fontSize: '14px' }}>
            <div><strong>Main Course:</strong> {selectedTiffin.jainWeeklyPlan[selectedMenuDay].mainCourse}</div>
            <div><strong>Alt Sabji:</strong> {selectedTiffin.jainWeeklyPlan[selectedMenuDay].altSabji || 'Not set'}</div>
            <div><strong>2nd Alt Sabji:</strong> {selectedTiffin.jainWeeklyPlan[selectedMenuDay].altSabji2 || 'Not set'}</div>
            <div><strong>Sides:</strong> {selectedTiffin.jainWeeklyPlan[selectedMenuDay].sides || 'Not set'}</div>
            <div><strong>Special Add-ons:</strong> {selectedTiffin.jainWeeklyPlan[selectedMenuDay].specialAddOns || 'Not set'}</div>
          </div>
        ) : (
          <p style={{ color: '#16a34a', fontSize: '14px', margin: 0 }}>Jain menu details not available for {selectedMenuDay}.</p>
        )}
      </div>
    )}

    <button
      className="primary-order-btn"
      onClick={() => setOrderStep(3)}
      disabled={!orderData.menuType || !selectedMenuDay}
    >
      Next: Payment ({getPlanName()} - ₹{getPlanPrice()})
    </button>
  </div>
)} */}

{orderStep === 2 && (
  <div className="step-content">
    <h3>Select Menu Day</h3>

    <div style={{ display: 'flex', overflowX: 'auto', gap: '8px', marginBottom: '20px', paddingBottom: '8px' }}>
      {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day => (
        <button
          key={day}
          onClick={() => {
            menuDayManuallySelected.current = true;
            setSelectedMenuDay(day);
          }}
          style={{
            padding: '8px 14px',
            borderRadius: '20px',
            border: selectedMenuDay === day ? 'none' : '1.5px solid #e2e8f0',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '13px',
            background: selectedMenuDay === day ? '#E8500A' : 'white',
            color: selectedMenuDay === day ? 'white' : '#64748b'
          }}
        >
          {day.slice(0,3)}
        </button>
      ))}
    </div>

    {/* 🔥 MENU DISPLAY */}
    <div style={{ background: '#fff7ed', padding: '16px', borderRadius: '12px', border: '2px solid #E8500A', marginBottom: '20px' }}>
      <h4 style={{ margin: '0 0 12px 0', color: '#E8500A' }}>
        📅 Menu for {selectedMenuDay}
      </h4>

      {(() => {
        const currentMenu =
          orderData.menuType === 'jain'
            ? selectedTiffin?.jainWeeklyPlan?.[selectedMenuDay]
            : weeklyPlan?.[selectedMenuDay];

        if (menuLoading) {
          return <p>Loading menu...</p>;
        }

        if (!currentMenu) {
          return <p>No menu available</p>;
        }

        return (
          <div style={{ display: 'grid', gap: '6px' }}>
            <div><strong>Main:</strong> {currentMenu.mainCourse || 'Not set'}</div>
            <div><strong>Alt:</strong> {currentMenu.altSabji || 'Not set'}</div>
            <div><strong>2nd Alt:</strong> {currentMenu.altSabji2 || 'Not set'}</div>
            <div><strong>Sides:</strong> {currentMenu.sides || 'Not set'}</div>
          </div>
        );
      })()}
    </div>

    {/* 🔥 FIXED DROPDOWN */}
    {(() => {
      const currentMenu =
        orderData.menuType === 'jain'
          ? selectedTiffin?.jainWeeklyPlan?.[selectedMenuDay]
          : weeklyPlan?.[selectedMenuDay];

      return (
        <div style={{ marginBottom: '20px' }}>
          <label className="input-label">ALTER MAIN SUBJI</label>

          <select
            value={orderData.altMainSubji || ''}
            onChange={(e) =>
              setOrderData({ ...orderData, altMainSubji: e.target.value })
            }
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              marginTop: '6px'
            }}
          >
            <option value="">Use Default Menu</option>

            {currentMenu?.altSabji && (
              <option value={currentMenu.altSabji}>
                Alt: {currentMenu.altSabji}
              </option>
            )}

            {currentMenu?.altSabji2 && (
              <option value={currentMenu.altSabji2}>
                2nd Alt: {currentMenu.altSabji2}
              </option>
            )}
          </select>
        </div>
      );
    })()}

    {/* 🔥 MEAL TYPE BUTTONS */}
    <label className="input-label">Meal Preference</label>

    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
      <button
        onClick={() => setOrderData({ ...orderData, menuType: 'regular' })}
        style={{
          padding: '10px',
          background: orderData.menuType === 'regular' ? '#E8500A' : 'white',
          color: orderData.menuType === 'regular' ? 'white' : 'black'
        }}
      >
        Regular
      </button>

      {selectedTiffin?.offersJainMenu && (
        <button
          onClick={() => setOrderData({ ...orderData, menuType: 'jain' })}
          style={{
            padding: '10px',
            background: orderData.menuType === 'jain' ? '#16a34a' : 'white',
            color: orderData.menuType === 'jain' ? 'white' : '#16a34a'
          }}
        >
          Jain Menu
        </button>
      )}
    </div>

    <button
      className="primary-order-btn"
      onClick={() => setOrderStep(3)}
    >
      Next: Payment
    </button>
  </div>
)}

      {/* ===== STEP 3: PAYMENT ===== */}
      {orderStep === 3 && (
        <div className="step-content">
          <h3>Payment Method</h3>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <label className={`pay-option ${orderData.payment === 'Cash' ? 'active' : ''}`} style={{ flex: 1 }}>
              <input type="radio" name="pay" checked={orderData.payment === 'Cash'} onChange={() => handlePaymentChange('Cash')} />
              💵 Cash
            </label>
            <button
              onClick={() => handlePaymentChange('online')}
              style={{
                flex: 1,
                padding: '16px',
                border: orderData.payment === 'online'
                  ? '2px solid #f26522' : '1px solid #e2e8f0',
                borderRadius: '12px',
                background: orderData.payment === 'online' ? '#fff7ed' : 'white',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              💳 Online
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>
                UPI / Card
              </span>
            </button>
          </div>
          <div className="order-summary">
            <h4>Order Summary</h4>
            <p><strong>Plan:</strong> {getPlanName()}</p>
            <p><strong>Menu Day:</strong> {selectedMenuDay}</p>
            <p><strong>Start Date:</strong> {orderData.startDate}</p>
            <p><strong>Meal Type:</strong> {orderData.menuType === 'jain' ? 'Jain' : 'Regular'}</p>
            <p><strong>Payment:</strong> {orderData.payment === 'online' ? 'Online (UPI/Card)' : 'Cash'}</p>
          </div>
          {orderError && (
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
                  {orderError}
                </p>
              </div>
            </div>
          )}
          <div className="total-box">Total: ₹{getPlanPrice()}</div>
          <button className="primary-order-btn" onClick={handleConfirmClick}>
            {orderData.payment === 'online' ? '💳 Pay Online' : 'Place Order'}
          </button>
        </div>
      )}

      {/* QR Code Modal & Closed Kitchen Popup remain unchanged */}
      {showQRCode && (
        <div className="modal-overlay" onClick={() => setShowQRCode(false)}>
          <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Scan to Pay</h2>
            {(!selectedTiffin?.upiId || String(selectedTiffin.upiId || '').trim() === '') ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#dc2626' }}>
                ⚠️ UPI payment is not available for this vendor. Please choose Cash payment.
              </div>
            ) : (
              <>
                <div className="qr-code-container">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                      `upi://pay?pa=${String(selectedTiffin.upiId || '').trim()}&pn=${encodeURIComponent(selectedTiffin.name || 'MealSetu')}&am=${getPlanPrice()}&cu=INR&tn=${encodeURIComponent('MealSetu Order')}`
                    )}`}
                    alt="UPI QR Code"
                    className="qr-code"
                  />
                </div>
                <p className="qr-amount">Amount: ₹{getPlanPrice()}</p>
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px' }}>Paying to: {selectedTiffin.name}</p>
                <p className="qr-instruction">Scan using any UPI app</p>
              </>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowQRCode(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showClosedPopup && (
        <div className="modal-overlay" onClick={() => setShowClosedPopup(false)}>
          <div className="closed-kitchen-popup" onClick={(e) => e.stopPropagation()}>
            <div className="closed-icon">🏠</div>
            <h2>Kitchen Closed</h2>
            <p>{closedVendorName} is currently closed.</p>
            <p>You'll be notified when they reopen.</p>
            <button className="btn-primary" onClick={() => setShowClosedPopup(false)}>OK</button>
          </div>
        </div>

        
      )}
      {showSubscriptionWarning && (
  <div
    className="modal-overlay"
    onClick={() => setShowSubscriptionWarning(false)}
  >
    <div
      className="qr-modal"
      onClick={(e) => e.stopPropagation()}
      style={{
        maxWidth: '450px',
        padding: '24px'
      }}
    >
      <h2 style={{ color: '#f97316', marginBottom: '14px' }}>
        Active Subscription Found
      </h2>

      <p style={{ lineHeight: '1.7', color: '#374151' }}>
        You already have an active subscription with
        <strong>
          {' '}
          {activeSubscription?.vendorName || 'Current Vendor'}
        </strong>
        .
      </p>

      <div
        style={{
          background: '#fff7ed',
          padding: '14px',
          borderRadius: '10px',
          marginTop: '15px'
        }}
      >
        <p>
          • Current plan will end on:
          <strong>
            {' '}
            {new Date(activeSubscription?.endDate).toLocaleDateString('en-IN')}
          </strong>
        </p>

        <p style={{ marginTop: '8px' }}>
          • New vendor plan will start after current plan ends.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '10px',
          justifyContent: 'flex-end',
          marginTop: '20px'
        }}
      >
        <button
          onClick={() => setShowSubscriptionWarning(false)}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            background: 'white',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>

        <button
          onClick={continueWithUpcomingPlan}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            border: 'none',
            background: '#f97316',
            color: 'white',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Continue
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
};

export default OrderMeals;
