const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const { getUserSubscription, getActiveSubscriptionStatus, applyLeave, extendSubscription, getCurrentUser, updateUserProfile, updateUserProfilePic, changePassword, getUserOrders, getMenus, placeOrder, addReview, getVendorReviews, getVendorRating, markReviewHelpful, flagReview, getPendingRating, getVendorStatus, getApprovedVendors, getVendorsByPincode, getVendorContacts, checkReviewEligibility, getTrialEligibility, createTrialOrder, getMyCashPayments, getMySubscription, getUpcomingOrders, extendSubscriptionOrder, checkSubscriptionPaymentStatus, getVendorPricingForUser, createRazorpayOrder, verifyUserPayment, checkCanAddPlan, submitComplaint, getMyComplaints, getUserOrderInvoice, saveFCMToken, reportNotReceived } = require('../controllers/userController');


const { getActiveOffers, redeemOffer, getClaimedOffers, createOfferPaymentOrder } = require('../controllers/offerController');
const { getOrderTracking } = require('../controllers/deliveryController');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

// Public route (anyone can see menus)
router.get('/menus', getMenus);

// Public route to get all approved vendors (for user side)
router.get('/vendors', getApprovedVendors);
// Pincode routes (Public)
router.get('/vendors-by-pincode', getVendorsByPincode);
// Public route to get vendor contact details for nearby kitchens
router.get('/vendor-contacts', getVendorContacts);



// Public route to get vendor status (open/close)
router.get('/vendor-status/:vendorId', getVendorStatus);

// Public route to get vendor reviews (for user view)
router.get('/vendor-reviews/:vendorId', getVendorReviews);

// Public route to get vendor rating (dynamic average)
router.get('/vendor-rating/:vendorId', getVendorRating);

// Protected routes (User only)
router.get('/me', protect, getCurrentUser);
router.get('/subscription', protect, authorize('user'), getUserSubscription);
router.put('/:id', protect, updateUserProfile);
router.put('/:id/profile-pic', protect, upload.single('profilePic'), updateUserProfilePic);
router.post('/:id/change-password', protect, changePassword);
router.get('/orders', protect, authorize('user'), getUserOrders);
router.post('/order', protect, authorize('user'), placeOrder);
router.post('/review', protect, authorize('user'), addReview);
router.post('/review/:id/helpful', protect, authorize('user'), markReviewHelpful);
router.post('/review/:id/flag',    protect, authorize('user'), flagReview);
router.get('/pending-rating',      protect, authorize('user'), getPendingRating);
router.get('/review-eligibility/:vendorId', protect, authorize('user'), checkReviewEligibility);
router.post('/apply-leave', protect, authorize('user'), applyLeave);
router.post('/extend-subscription', protect, authorize('user'), extendSubscription);

// Offer routes for users
router.get('/active-offers', protect, authorize('user'), getActiveOffers);
router.get('/claimed-offers', protect, authorize('user'), getClaimedOffers);
router.post('/offers/create-payment-order', protect, authorize('user'), createOfferPaymentOrder);
router.post('/offers/redeem', protect, authorize('user'), redeemOffer);

// Pincode routes (Public - no auth required as per user instructions)
// TODO: implement these functions in userController.js
// router.get('/check-pincode', checkPincodeAvailability);
// router.get('/vendors-by-pincode', getVendorsByPincode);

    


// Trial routes
router.post('/trial', protect, authorize('user'), createTrialOrder);
router.get('/trial-eligibility/:vendorId', protect, authorize('user'), getTrialEligibility);
router.get('/subscription-status', protect, authorize('user'), getActiveSubscriptionStatus);

// Cash payment status for user
router.get('/my-cash-payments', protect, authorize('user'), getMyCashPayments);

// Order routes for subscription management
router.get('/orders/my-subscription', protect, authorize('user'), getMySubscription);
router.get('/orders/upcoming', protect, authorize('user'), getUpcomingOrders);
router.post('/orders/extend', protect, authorize('user'), extendSubscriptionOrder);

// Vendor pricing (dynamic plan pricing for subscription UI)
router.get('/vendor-pricing/:vendorId', protect, authorize('user'), getVendorPricingForUser);

// Razorpay payment routes
router.get('/check-can-add-plan',    protect, authorize('user'), checkCanAddPlan);
router.post('/payment/create-order', protect, authorize('user'), createRazorpayOrder);
router.post('/payment/verify',       protect, authorize('user'), verifyUserPayment);

// Complaint / safety routes
router.post('/complaint',       protect, authorize('user'), submitComplaint);
router.get('/my-complaints',    protect, authorize('user'), getMyComplaints);

// Invoice / bill download
router.get('/orders/:orderId/invoice', protect, authorize('user'), getUserOrderInvoice);

// ── FCM token (all authenticated roles) ──────────────────────────────────────
router.post('/fcm-token', protect, saveFCMToken);

// ── Delivery issue reporting (45-min window) ──────────────────────────────
router.post('/orders/:orderId/report-not-received', protect, authorize('user'), reportNotReceived);

// ── Live delivery tracking ─────────────────────────────────────────────────
router.get('/track-order/:orderId', protect, authorize('user'), getOrderTracking);

module.exports = router;


