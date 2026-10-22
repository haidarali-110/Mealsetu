const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { getVendorProfile, updateVendorProfile, updateVendorProfilePic, updateKitchenPoster, getVendorMenus, addMenu, getVendorOrders, getFilteredOrders, updateOrderStatus, getVendorReviews, getVendorCustomers, getCustomerPlans, getVendorComplaints, resolveComplaint, getVendorReports, getDashboardStats, saveWeeklyPlan, getWeeklyPlan, toggleShopStatus, getShopStatus, updateTrialSettings, submitVendorCompliance, getPendingPayout, getMyCommissions, getCommissionSummary, getJainMenu, saveJainMenu, getPricing, savePricing, getVendorWeeklyPlan, addManualCustomer, getManualCustomers, calculateManualOrderAmount, getCashPayments, markCashPaymentPaid, getAdminUpiId, createCommissionPaymentOrder, verifyCommissionPaymentRazorpay, closeKitchenWithClosure, reopenKitchen, getWeekOrderBreakdown, downloadSettlementInvoice, raiseCommissionDispute, getVendorCustomerLoyalty, getLoyaltySettings, updateLoyaltySettings, getSubscriptionAnalytics } = require('../controllers/vendorController');
const { createOffer, getVendorOffers, deleteOffer } = require('../controllers/offerController');
const { addExpense, getExpenses, updateExpense, deleteExpense, getExpenseSummary, exportExpensesCSV, applyRecurringExpenses, getExpenseTrend, getExpenseBudget, saveExpenseBudget } = require('../controllers/expenseController');
const { getPreparationList } = require('../controllers/preparationController');
const {
  getVendorDeliveryPartners,
  assignDelivery,
  getTodayOrders,
  toggleVendorDelivery,
  updateDeliverySettings,
  addRider,
  getVendorRiders,
  updateRider,
  deleteRider,
  markSalaryPaid,
  createSalaryRazorpayOrder,
  verifySalaryRazorpayPayment,
  createDeliveryBatches,
  getBatches,
  assignBatchToRider,
  reassignBatch,
  mergeBatches,
  getLiveRiderLocations,
  getDeliveryFinancials,
  getDeliveryAnalytics,
  getAttendance,
  confirmTiffinReturn,
  getFlaggedOrders,
  getRetryOrders,
  getFailedDeliveries,
} = require('../controllers/deliveryController');
const { resolveFailedDelivery } = require('../controllers/vendorController');

const router = express.Router();

// All routes here require login AND 'vendor' role
router.use(protect);
router.use(authorize('vendor'));

router.get('/me', getVendorProfile);
router.put('/me', updateVendorProfile);
router.put('/me/profile-pic', upload.single('profilePic'), updateVendorProfilePic);
router.put('/me/kitchen-poster', upload.single('kitchenPoster'), updateKitchenPoster);
router.get('/menus', getVendorMenus);
router.post('/menu', addMenu);
router.get('/orders', getVendorOrders);
router.get('/orders/filtered', getFilteredOrders);
router.put('/orders/:id', updateOrderStatus);
router.get('/reviews', getVendorReviews);
// Additional vendor endpoints
router.get('/customers', getVendorCustomers);
router.get('/customer/:customerId/plans', getCustomerPlans);
router.get('/complaints', getVendorComplaints);
router.put('/complaints/:id', resolveComplaint);
router.get('/reports', getVendorReports);
// Dashboard stats endpoint
router.get('/dashboard-stats', getDashboardStats);

// Weekly plan endpoints (Batch Save) - require vendor authentication
router.get('/weekly-plan', getWeeklyPlan);
router.put('/weekly-plan', saveWeeklyPlan);

// Jain menu endpoints
router.get('/jain-menu', getJainMenu);
router.post('/jain-menu', saveJainMenu);

// Pricing endpoints
router.get('/pricing', getPricing);
router.post('/pricing', savePricing);

// Shop status endpoints (Open/Close shop)
router.get('/shop-status', getShopStatus);
router.put('/shop-status', toggleShopStatus);

// Kitchen closure endpoints
router.post('/kitchen/close',  closeKitchenWithClosure);
router.post('/kitchen/reopen', reopenKitchen);

// Offer endpoints
router.get('/offers', getVendorOffers);
router.post('/offers', upload.single('posterImage'), createOffer);
router.delete('/offers/:id', deleteOffer);

// Trial Settings endpoint
router.patch('/trial-settings', updateTrialSettings);

// Compliance submission endpoint
router.post('/compliance-submit', upload.fields([{ name: 'fssaiDoc', maxCount: 1 }, { name: 'gstDoc', maxCount: 1 }]), submitVendorCompliance);

// Commission endpoints
router.get('/admin-upi', getAdminUpiId);
router.get('/commission/summary', getCommissionSummary);
router.get('/commission/history', getMyCommissions);
router.get('/commission/week-orders', getWeekOrderBreakdown);
router.get('/commission/invoice/:commissionId', downloadSettlementInvoice);
router.post('/commission/:commissionId/dispute', raiseCommissionDispute);
router.post('/commission/create-payment-order', createCommissionPaymentOrder);
router.post('/commission/verify-payment',       verifyCommissionPaymentRazorpay);

router.get('/preparation-list', getPreparationList);

// Manual Customer routes
router.post('/manual-customer', addManualCustomer);
router.get('/manual-customers', getManualCustomers);
router.get('/manual-customer/calculate', calculateManualOrderAmount);

// Cash payment management routes
router.get('/cash-payments', getCashPayments);
router.patch('/cash-payments/:orderId/mark-paid', markCashPaymentPaid);

// Customer loyalty insights
router.get('/customer-loyalty', getVendorCustomerLoyalty);

// Loyalty discount settings (vendor opt-out + per-order wallet cap)
router.get('/loyalty-settings', getLoyaltySettings);
router.put('/loyalty-settings', updateLoyaltySettings);

// Subscription Analytics
router.get('/subscription-analytics', getSubscriptionAnalytics);

// ── Expense tracker ──────────────────────────────────────────────────────────
router.get('/expenses/summary',          getExpenseSummary);
router.get('/expenses/export',           exportExpensesCSV);
router.get('/expenses/trend',            getExpenseTrend);
router.get('/expenses/budget',           getExpenseBudget);
router.put('/expenses/budget',           saveExpenseBudget);
router.post('/expenses/recurring/apply', applyRecurringExpenses);
router.get('/expenses',                  getExpenses);
router.post('/expenses',                 addExpense);
router.put('/expenses/:id',              updateExpense);
router.delete('/expenses/:id',           deleteExpense);

// ── Delivery management — legacy ────────────────────────────────────────────
router.get('/delivery-partners', getVendorDeliveryPartners);
router.post('/assign-delivery',  assignDelivery);
router.get('/today-orders',      getTodayOrders);

// ── Delivery management — new vendor-owned model ────────────────────────────
router.patch('/delivery/toggle',                       toggleVendorDelivery);
router.put('/delivery/settings',                       updateDeliverySettings);
router.post('/delivery/riders',                        addRider);
router.get('/delivery/riders',                         getVendorRiders);
router.put('/delivery/riders/:riderId',                updateRider);
router.delete('/delivery/riders/:riderId',             deleteRider);
router.post('/delivery/riders/:riderId/salary',                markSalaryPaid);
router.post('/delivery/riders/:riderId/salary/razorpay-order',  createSalaryRazorpayOrder);
router.post('/delivery/riders/:riderId/salary/razorpay-verify', verifySalaryRazorpayPayment);
router.post('/delivery/batches/create',                createDeliveryBatches);
router.get('/delivery/batches',                        getBatches);
router.patch('/delivery/batches/:batchId/assign',      assignBatchToRider);
router.patch('/delivery/batches/:batchId/reassign',    reassignBatch);
router.post('/delivery/batches/merge',                 mergeBatches);
router.get('/delivery/riders/live',                         getLiveRiderLocations);
router.get('/delivery/analytics',                           getDeliveryAnalytics);
router.get('/delivery/attendance',                          getAttendance);
router.get('/delivery/financials',                          getDeliveryFinancials);
router.patch('/delivery/batches/:batchId/tiffin-return',    confirmTiffinReturn);
router.get('/delivery/flagged-orders',                      getFlaggedOrders);
router.get('/delivery/retry-queue',                         getRetryOrders);
router.get('/delivery/failed-queue',                        getFailedDeliveries);
router.patch('/delivery/failed/:orderId/resolve',           resolveFailedDelivery);

module.exports = router;
