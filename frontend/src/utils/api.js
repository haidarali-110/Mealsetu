import { clearAuthStorage, getAuthItem } from './authStorage';

const API_BASE_URL = '/api';

export const clearStoredSession = () => {
  clearAuthStorage();
};

const getStoredUser = () => {
  try {
    return JSON.parse(getAuthItem('user') || 'null');
  } catch {
    return null;
  }
};

export const apiCall = async (endpoint, options = {}) => {
  const token = getAuthItem('token');

  const headers = {
    ...options.headers,
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        const currentUser = getStoredUser();
        if (currentUser && ((endpoint.startsWith('/vendor/') && currentUser.role !== 'vendor') ||
            (endpoint.startsWith('/admin/') && currentUser.role !== 'admin') ||
            (endpoint.startsWith('/users/') && currentUser.role !== 'user'))) {
          clearStoredSession();
        }
      }

      const err = new Error(data.message || data.error || 'API request failed');
      err.code = data.code || null;
      err.data = data;
      throw err;
    }

    return data;
  } catch (error) {
    console.error(`API Error on ${endpoint}:`, error);
    throw error;
  }
};

// ============ AUTH ENDPOINTS ============
export const loginUser = (email, password, role) => {
  return apiCall('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, role }),
  });
};

export const registerUser = (formData) => {
  return apiCall('/auth/register', {
    method: 'POST',
    body: formData,
  });
};

export const sendOTP = (email) => {
  return apiCall('/auth/forgot-password/send-otp', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

export const verifyOTP = (email, otp) => {
  return apiCall('/auth/forgot-password/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  });
};

export const resetPasswordWithOTP = (email, password) => {
  return apiCall('/auth/forgot-password/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
};

export const forgotPassword = (email) => {
  return apiCall('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

export const resetPassword = (token, password) => {
  return apiCall(`/auth/reset-password/${token}`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
};

export const verifyRegisterOTP = (userId, otp) => {
  return apiCall('/auth/register-verify-otp', {
    method: 'POST',
    body: JSON.stringify({ userId, otp }),
  });
};

export const resendRegisterOTP = (userId) => {
  return apiCall('/auth/register-resend-otp', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
};

// ============ USER ENDPOINTS ============
export const getCurrentUser = () => {
  return apiCall('/users/me', { method: 'GET' });
};

export const updateUserProfile = (userId, data) => {
  return apiCall(`/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

export const updateUserProfilePic = (userId, formData) => {
  return apiCall(`/users/${userId}/profile-pic`, {
    method: 'PUT',
    body: formData,
  });
};

export const changePassword = (userId, currentPassword, newPassword) => {
  return apiCall(`/users/${userId}/change-password`, {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
};

export const getMenus = (date = null, pincode = null) => {
  const timestamp = Date.now();
  let url = `/users/menus?_t=${timestamp}`;
  if (date) url += `&date=${date}`;
  if (pincode) url += `&pincode=${pincode}`;
  return apiCall(url, { method: 'GET' });
};

export const getUserOrders = () => {
  return apiCall('/users/orders', { method: 'GET' });
};

export const downloadUserOrderInvoice = async (orderId) => {
  const token = getAuthItem('token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(`${API_BASE_URL}/users/orders/${orderId}/invoice`, { headers });

  if (!response.ok) {
    const body = await response.text();
    let message = body || 'Invoice download failed';
    try {
      const errorData = JSON.parse(body);
      message = errorData.message || errorData.error || message;
    } catch {
      // Keep the server response text when it is not JSON.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  if (!blob.size) throw new Error('The server returned an empty invoice.');
  return blob;
};

export const placeOrder = (vendorId, items, amount, deliverySlot, mealPreference, options = {}) => {
  return apiCall('/users/order', {
    method: 'POST',
    body: JSON.stringify({
      vendorId,
      items,
      amount,
      deliverySlot,
      mealPreference,
      plan: options.plan || 'ONEDAY',
      startDate: options.startDate || null,
      altMainSubji: options.altMainSubji || '',
      paymentMethod: options.payment || options.paymentMethod || 'Cash'
    }),
  });
};

export const addReview = (vendorId, rating, comment) => {
  return apiCall('/users/review', {
    method: 'POST',
    body: JSON.stringify({ vendorId, rating, comment }),
  });
};

export const applyLeave = (leaveDate, leaveEndDate, mealType) => {
  return apiCall('/users/apply-leave', {
    method: 'POST',
    body: JSON.stringify({ leaveDate, leaveEndDate, mealType }),
  });
};

export const getUserSubscription = () => {
  return apiCall('/users/subscription', { method: 'GET' });
};

export const getActiveSubscriptionStatus = () => {
  return apiCall('/users/subscription-status', { method: 'GET' });
};

export const extendSubscription = (plan, vendorId, paymentMethod = 'Cash') => {
  return apiCall('/users/extend-subscription', {
    method: 'POST',
    body: JSON.stringify({ plan, vendorId, paymentMethod }),
  });
};

export const getApprovedVendors = () => {
  return apiCall('/users/vendors', { method: 'GET' });
};

export const getUserVendorReviews = (vendorId) => {
  return apiCall(`/users/vendor-reviews/${vendorId}`, { method: 'GET' });
};

export const getUserVendorRating = (vendorId) => {
  return apiCall(`/users/vendor-rating/${vendorId}`, { method: 'GET' });
};

export const checkReviewEligibility = (vendorId) => {
  return apiCall(`/users/review-eligibility/${vendorId}`, { method: 'GET' });
};

export const getVendorStatus = (vendorId) => {
  return apiCall(`/users/vendor-status/${vendorId}`, { method: 'GET' });
};

// ============ SUBSCRIPTION ORDER ENDPOINTS ============
// export const getMySubscription = async () => {
//   const res = await apiCall('/users/orders/my-subscription', { method: 'GET' });
//   console.log('=== API.JS getMySubscription RAW RES ===', JSON.stringify(res));
//   console.log('=== res.currentPlan ===', JSON.stringify(res?.currentPlan));
//   console.log('=== res.startsTomorrow ===', res?.startsTomorrow);
//   if (!res) return null;
//   return { ...res, startsTomorrow: res.startsTomorrow ?? false };
// };

export const getMySubscription = async () => {
  try {
    const res = await apiCall('/users/orders/my-subscription', { method: 'GET' })

    console.log('=== RAW RES ===', JSON.stringify(res))

    // API returns null or empty
    if (!res) return null

    // New format: { currentPlan: {...}, startsTomorrow: true }
    if (res.currentPlan !== undefined) {
      if (!res.currentPlan) return null
      return {
        ...res.currentPlan,
        startsTomorrow: res.startsTomorrow ?? false
      }
    }

    // Old format: backend returns plan fields directly at top level
    // e.g. { planType: 'Weekly', startDate: '...', endDate: '...' }
    if (res.planType || res.startDate || res.orderId) {
      return {
        ...res,
        startsTomorrow: res.startsTomorrow ?? false
      }
    }

    return null

  } catch (err) {
    console.error('getMySubscription error:', err)
    return null
  }
}

export const getUpcomingOrders = () => {
  return apiCall('/users/orders/upcoming', { method: 'GET' });
};

export const extendSubscriptionOrder = (plan, vendorId, paymentMethod = 'Cash') => {
  return apiCall('/users/orders/extend', {
    method: 'POST',
    body: JSON.stringify({ plan, vendorId, paymentMethod }),
  });
};

// ✅ Dynamic vendor pricing for subscription UI
export const getVendorPricingForUser = (vendorId) => {
  return apiCall(`/users/vendor-pricing/${vendorId}`, {
    method: 'GET'
  });
};

// ✅ SINGLE checkSubscriptionPaymentStatus — duplicate removed
export const checkSubscriptionPaymentStatus = (orderId) => {
  return apiCall(`/users/orders/${orderId}/payment-status`);
};


// ============ TRIAL ENDPOINTS ============
export const createTrialOrder = (vendorId, paymentMethod = 'Cash', mealPreference = 'Regular') => {
  return apiCall('/users/trial', {
    method: 'POST',
    body: JSON.stringify({ vendorId, paymentMethod, mealPreference }),
  });
};

export const getTrialEligibility = (vendorId) => {
  return apiCall(`/users/trial-eligibility/${vendorId}`, { method: 'GET' });
};

// ============ VENDOR ENDPOINTS ============
export const getVendorProfile = () => {
  return apiCall('/vendor/me', { method: 'GET' });
};

export const getJainMenu = () => apiCall('/vendor/jain-menu');
export const saveJainMenu = (data) => apiCall('/vendor/jain-menu', {
  method: 'POST',
  body: JSON.stringify(data)
});

export const getPricing = () => apiCall('/vendor/pricing');
export const savePricing = (pricing) => apiCall('/vendor/pricing', {
  method: 'POST',
  body: JSON.stringify(pricing)
});

export const updateVendorProfile = (data) => {
  return apiCall('/vendor/me', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

export const updateVendorProfilePic = (formData) => {
  return apiCall('/vendor/me/profile-pic', {
    method: 'PUT',
    body: formData,
  });
};

export const updateKitchenPoster = (formData) => {
  return apiCall('/vendor/me/kitchen-poster', {
    method: 'PUT',
    body: formData,
  });
};

export const submitVendorCompliance = (formData) => {
  return apiCall('/vendor/compliance-submit', {
    method: 'POST',
    body: formData,
  });
};

export const getVendorMenus = () => {
  return apiCall('/vendor/menus', { method: 'GET' });
};

export const addMenu = (menuData) => {
  return apiCall('/vendor/menu', {
    method: 'POST',
    body: JSON.stringify(menuData),
  });
};

export const getVendorOrders = () => {
  return apiCall('/vendor/orders', { method: 'GET' });
};

export const getFilteredOrders = (filter) => {
  return apiCall(`/vendor/orders/filtered?filter=${filter}`, { method: 'GET' });
};

export const updateOrderStatus = (orderId, status) => {
  return apiCall(`/vendor/orders/${orderId}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
};

export const getVendorReviews = () => {
  return apiCall('/vendor/reviews', { method: 'GET' });
};

export const getVendorCustomers = () => {
  return apiCall('/vendor/customers', { method: 'GET' });
};

export const getCustomerPlans = (customerId) => {
  return apiCall(`/vendor/customer/${customerId}/plans`, { method: 'GET' });
};

export const getVendorComplaints = () => {
  return apiCall('/vendor/complaints', { method: 'GET' });
};

export const resolveVendorComplaint = (complaintId, status, response) => {
  return apiCall(`/vendor/complaints/${complaintId}`, {
    method: 'PUT',
    body: JSON.stringify({ status, response }),
  });
};

export const getVendorReports = () => {
  return apiCall('/vendor/reports', { method: 'GET' });
};

export const getDashboardStats = () => {
  return apiCall('/vendor/dashboard-stats', { method: 'GET' });
};

export const saveWeeklyPlan = (weeklyPlan) => {
  return apiCall('/vendor/weekly-plan', {
    method: 'PUT',
    body: JSON.stringify({ weeklyPlan }),
  });
};

export const getWeeklyPlan = () => {
  return apiCall('/vendor/weekly-plan', { method: 'GET' });
};

export const getVendorWeeklyPlan = (vendorId) => {
  return apiCall(`/vendor-profile/${vendorId}`, { method: 'GET' });
};

export const toggleShopStatus = (isOpen, closureEndDate = null) => {
  return apiCall('/vendor/shop-status', {
    method: 'PUT',
    body: JSON.stringify({ isOpen, closureEndDate }),
  });
};

export const getVendorShopStatus = () => {
  return apiCall('/vendor/shop-status', { method: 'GET' });
};

export const closeKitchenWithClosure = (data) =>
  apiCall('/vendor/kitchen/close', {
    method: 'POST',
    body: JSON.stringify(data)
  });

export const reopenKitchen = () =>
  apiCall('/vendor/kitchen/reopen', { method: 'POST' });

export const updateVendorTrialSettings = (trialEnabled, trialFee) => {
  return apiCall('/vendor/trial-settings', {
    method: 'PATCH',
    body: JSON.stringify({ trialEnabled, trialFee }),
  });
};

// ============ OFFER ENDPOINTS ============
export const createOffer = (formData) => {
  return apiCall('/vendor/offers', {
    method: 'POST',
    body: formData,
  });
};

export const getVendorOffers = () => {
  return apiCall('/vendor/offers', { method: 'GET' });
};

export const deleteOffer = (offerId) => {
  return apiCall(`/vendor/offers/${offerId}`, { method: 'DELETE' });
};

export const getActiveOffers = () => {
  return apiCall('/users/active-offers', { method: 'GET' });
};

export const getClaimedOffers = () => {
  return apiCall('/users/claimed-offers', { method: 'GET' });
};

export const createOfferPaymentOrder = (data) =>
  apiCall('/users/offers/create-payment-order', { method: 'POST', body: JSON.stringify(data) });

export const redeemOffer = (data) =>
  apiCall('/users/offers/redeem', { method: 'POST', body: JSON.stringify(data) });

// Subscription Analytics
export const getSubscriptionAnalytics = () =>
  apiCall('/vendor/subscription-analytics', { method: 'GET' });

// ============ ADMIN ENDPOINTS ============
export const getPlatformSettings = () => {
  return apiCall('/admin/settings', { method: 'GET' });
};

export const updatePlatformSettings = (data) =>
  apiCall('/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(data)
  });

export const getAdminUpiId = () =>
  apiCall('/vendor/admin-upi', { method: 'GET' });

export const updateCommissionRate = (commissionRate) => {
  return apiCall('/admin/settings/commission', {
    method: 'PUT',
    body: JSON.stringify({ commissionRate }),
  });
};

export const getPendingVendors = () => {
  return apiCall('/admin/vendors/pending', { method: 'GET' });
};

export const updateVendorStatus = (vendorId, status, rejectionReason = '') => {
  return apiCall(`/admin/vendors/${vendorId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, rejectionReason }),
  });
};

export const getAllUsers = () => {
  return apiCall('/admin/users', { method: 'GET' });
};

// ============ ADMIN COMMISSION ENDPOINTS ============
export const getAdminCommissionTiers = () => {
  return apiCall('/admin/commission/tiers');
};

export const updateAdminCommissionTiers = (tiers) => {
  return apiCall('/admin/commission/tiers', {
    method: 'PUT',
    body: JSON.stringify({ tiers }),
  });
};

export const getAdminCommissionVendors = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return apiCall(`/admin/commission/vendors?${query}`);
};

export const downloadCommissionCSV = (month = '') => {
  window.open(`/api/admin/commission/report/csv?month=${month}`, '_blank');
};

export const seedDefaultTiers = () => {
  return apiCall('/admin/commission/seed-tiers', { method: 'POST' });
};

export const getAdminMarkCommissionPaid = (commissionId) =>
  apiCall(`/admin/commissions/${commissionId}/mark-paid`, { method: 'PUT' });

export const getVendorCommissionDetail = (vendorId) =>
  apiCall(`/admin/commission/vendor/${vendorId}`);

// ============ VENDOR COMMISSION ENDPOINTS ============
export const getVendorCommissionSummary = () => {
  return apiCall('/vendor/commission/summary');
};

export const getVendorCommissionHistory = () => {
  return apiCall('/vendor/commission/history');
};

export const getVendorWeekOrderBreakdown = (weekStart, weekEnd) => {
  const qs = `weekStart=${encodeURIComponent(weekStart)}&weekEnd=${encodeURIComponent(weekEnd)}`;
  return apiCall(`/vendor/commission/week-orders?${qs}`);
};

// ============ PINCODE ENDPOINTS ============
export const getVendorsByPincode = (pincode, userLat = null, userLon = null) => {
  let url = `/users/vendors-by-pincode?pincode=${pincode}`;
  if (userLat !== null && userLon !== null) {
    url += `&userLat=${userLat}&userLon=${userLon}`;
  }
  return apiCall(url);
};

export const checkPincodeAvailability = (pincode) => {
  return apiCall(`/users/check-pincode?pincode=${pincode}`);
};

// ============ USER PINCODE UPDATE ============
export const updateUserPincode = (pincode) => apiCall('/users/pincode', {
  method: 'PATCH',
  body: JSON.stringify({ pincode })
});

// ============ LEGACY COMPATIBILITY ============
export const getVendorPendingPayout = () => {
  return getDashboardStats().then(data => ({
    pendingAmount: data.pendingPayout || 0,
  }));
};

// ============ CASH PAYMENT ENDPOINTS ============
export const getCashPayments = () =>
  apiCall('/vendor/cash-payments', { method: 'GET' });

export const markCashPaymentPaid = (orderId) =>
  apiCall(`/vendor/cash-payments/${orderId}/mark-paid`, { method: 'PATCH' });

export const getMyCashPayments = () =>
  apiCall('/users/my-cash-payments', { method: 'GET' });

// Manual Customer API functions
export const addManualCustomer = (data) => {
  return apiCall('/vendor/manual-customer', {
    method: 'POST',
    body: JSON.stringify(data)
  });
};

export const getManualCustomers = () => {
  return apiCall('/vendor/manual-customers');
};

export const calculateManualOrderAmount = (planType, startDate) => {
  return apiCall(
    `/vendor/manual-customer/calculate?planType=${planType}&startDate=${startDate}`
  );
};

// ============ RAZORPAY PAYMENT ENDPOINTS ============
export const createRazorpayOrder = (data) =>
  apiCall('/users/payment/create-order', {
    method: 'POST',
    body: JSON.stringify(data)
  });

export const verifyUserPayment = (data) =>
  apiCall('/users/payment/verify', {
    method: 'POST',
    body: JSON.stringify(data)
  });

export const createCommissionPaymentOrder = (data) =>
  apiCall('/vendor/commission/create-payment-order', {
    method: 'POST',
    body: JSON.stringify(data)
  });

export const verifyCommissionPaymentRazorpay = (data) =>
  apiCall('/vendor/commission/verify-payment', {
    method: 'POST',
    body: JSON.stringify(data)
  });

// ── ADMIN DISPUTE ENDPOINTS ──────────────────────────────────────────
export const getAdminCommissionDisputes = () =>
  apiCall('/admin/commission/disputes');

export const resolveAdminCommissionDispute = (commissionId, data) =>
  apiCall(`/admin/commission/${commissionId}/resolve-dispute`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });

export const checkCanAddPlan = () =>
  apiCall('/users/check-can-add-plan', { method: 'GET' });

// ── VENDOR LOYALTY SETTINGS ──────────────────────────────────────────
export const getVendorLoyaltySettings = () =>
  apiCall('/vendor/loyalty-settings');

export const updateVendorLoyaltySettings = (data) =>
  apiCall('/vendor/loyalty-settings', {
    method: 'PUT',
    body:   JSON.stringify(data)
  });

// Vendor: get today's active orders (used by delivery batch system)
export const getTodayOrders = () =>
  apiCall('/vendor/today-orders', { method: 'GET' });

// ============ VENDOR DELIVERY MANAGEMENT (salary-based batch system) ============

export const toggleVendorDelivery = (deliveryEnabled) =>
  apiCall('/vendor/delivery/toggle', {
    method: 'PATCH',
    body: JSON.stringify({ deliveryEnabled }),
  });

export const getVendorRiders = () =>
  apiCall('/vendor/delivery/riders', { method: 'GET' });

export const addRider = (data) =>
  apiCall('/vendor/delivery/riders', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateRider = (riderId, data) =>
  apiCall(`/vendor/delivery/riders/${riderId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const deleteRider = (riderId) =>
  apiCall(`/vendor/delivery/riders/${riderId}`, { method: 'DELETE' });

export const markRiderSalaryPaid = (riderId, data) =>
  apiCall(`/vendor/delivery/riders/${riderId}/salary`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const createSalaryRazorpayOrder = (riderId, data) =>
  apiCall(`/vendor/delivery/riders/${riderId}/salary/razorpay-order`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const verifySalaryRazorpayPayment = (riderId, data) =>
  apiCall(`/vendor/delivery/riders/${riderId}/salary/razorpay-verify`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const createDeliveryBatches = (data) =>
  apiCall('/vendor/delivery/batches/create', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getDeliveryBatches = (date, mealSlot) =>
  apiCall(`/vendor/delivery/batches?date=${date}&mealSlot=${mealSlot}`, { method: 'GET' });

export const assignBatchToRider = (batchId, riderId) =>
  apiCall(`/vendor/delivery/batches/${batchId}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ riderId }),
  });

export const getDeliveryFinancials = (month) =>
  apiCall(`/vendor/delivery/financials${month ? `?month=${month}` : ''}`, { method: 'GET' });

export const getDeliveryAnalytics = (month) =>
  apiCall(`/vendor/delivery/analytics${month ? `?month=${month}` : ''}`, { method: 'GET' });

export const getDeliveryAttendance = (month) =>
  apiCall(`/vendor/delivery/attendance${month ? `?month=${month}` : ''}`, { method: 'GET' });

export const reassignBatch = (batchId, riderId) =>
  apiCall(`/vendor/delivery/batches/${batchId}/reassign`, {
    method: 'PATCH',
    body: JSON.stringify({ riderId }),
  });

export const mergeBatches = (sourceBatchId, targetBatchId) =>
  apiCall('/vendor/delivery/batches/merge', {
    method: 'POST',
    body: JSON.stringify({ sourceBatchId, targetBatchId }),
  });

export const getLiveRiderLocations = () =>
  apiCall('/vendor/delivery/riders/live', { method: 'GET' });

export const getRetryOrders = () =>
  apiCall('/vendor/delivery/retry-queue', { method: 'GET' });

export const getFailedDeliveries = () =>
  apiCall('/vendor/delivery/failed-queue', { method: 'GET' });

export const resolveFailedDeliveryOrder = (orderId, action) =>
  apiCall(`/vendor/delivery/failed/${orderId}/resolve`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });

// ============ VENDOR EXPENSE TRACKER ============
export const addExpense = (data) =>
  apiCall('/vendor/expenses', { method: 'POST', body: JSON.stringify(data) });

export const getExpenses = (month) =>
  apiCall(`/vendor/expenses?month=${month}`, { method: 'GET' });

export const updateExpense = (id, data) =>
  apiCall(`/vendor/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteExpense = (id) =>
  apiCall(`/vendor/expenses/${id}`, { method: 'DELETE' });

export const getExpenseSummary = (month) =>
  apiCall(`/vendor/expenses/summary?month=${month}`, { method: 'GET' });

export const downloadExpenseCSV = async (month, type) => {
  const token = getAuthItem('token');
  const res = await fetch(`/api/vendor/expenses/export?month=${month}&type=${type}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || 'Export failed');
  }
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `expenses_${type}_${month}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const applyRecurringExpenses = (month) =>
  apiCall('/vendor/expenses/recurring/apply', { method: 'POST', body: JSON.stringify({ month }) });

export const getExpenseTrend = (months = 6) =>
  apiCall(`/vendor/expenses/trend?months=${months}`, { method: 'GET' });

export const getExpenseBudget = () =>
  apiCall('/vendor/expenses/budget', { method: 'GET' });

export const saveExpenseBudget = (budgets) =>
  apiCall('/vendor/expenses/budget', { method: 'PUT', body: JSON.stringify({ budgets }) });

// ============ ADMIN DELIVERY PARTNER ENDPOINTS ============
export const getDeliveryPartners = () =>
  apiCall('/admin/delivery-partners', { method: 'GET' });

export const createDeliveryPartner = (data) =>
  apiCall('/admin/delivery-partners', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const toggleDeliveryPartner = (partnerId) =>
  apiCall(`/admin/delivery-partners/${partnerId}/toggle`, { method: 'PATCH' });

export const getAllVendorsList = () =>
  apiCall('/admin/vendors-stats', { method: 'GET' });

// ============ ADMIN VENDOR PAYMENT HISTORY ============
export const getVendorPaymentHistory = (vendorId) =>
  apiCall(`/admin/commission/vendor/${vendorId}/payments`);

// ── CSV Download helper ──────────────────────────────────────────────────────
// Downloads a CSV file from an admin export endpoint.
// `endpoint` should start with /admin/export/... (no /api prefix).
export const downloadCSV = async (endpoint, filename) => {
  const token = getAuthItem('token');
  const res = await fetch(`/api${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = 'Export failed';
    try { const d = await res.json(); msg = d.message || msg; } catch (_) {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename || 'export.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
