const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getPlatformSettings,
  updateCommissionRate,
  updatePlatformSettings,
  getPendingVendors,
  getAllUsers,
  approveVendor,
  rejectVendor,
  getAllVendorsForAdmin,
  getVendorSubscribers,
  getAdminProfile,
  updateAdminProfile,
  getPublicAdminContact,
  getAllCommissions,
  getCommissionSummary,
  markCommissionPaid,
  getCommissionTiers,
  updateCommissionTiers,
  getCommissionVendors,
  getCommissionReportCSV,
  seedDefaultTiers,
  getVendorCommissionDetail,
  downloadVendorCommissionReport,
  getAdminVendorWeekOrders,
  getVendorPaymentHistory,
  getCommissionDisputes,
  resolveCommissionDispute,
  getAdminReviews,
  hideReview,
  unhideReview,
  deleteReview,
  unflagReview,
  migrateRatings,
  getPlatformDashboard,
  getDashboardLeaderboard, // <-- ADDED THIS IMPORT
  getSystemAlerts,
  getAdminOrders,
  cancelOrder,
  getUsersEnhanced,
  suspendUser,
  activateUser,
  getAdminReviewsEnhanced,
  getVendorDetail,
  suspendVendor,
  getVendorOrders,
  cancelVendorOrder,
  getVendorReviews,
  getVendorRiders,
  toggleVendorRider,
  getVendorStuckBatches,
  forceCloseBatch,
  exportOrdersCSV,
  exportUsersCSV,
  exportDeliveryReportCSV,
  exportPlatformSummaryCSV,
} = require('../controllers/adminController');

const {
  createDeliveryPartner,
  getDeliveryPartners,
  togglePartnerStatus
} = require('../controllers/deliveryController');
const router = express.Router();

// All routes require Admin role
router.get('/public-contact', getPublicAdminContact);

router.use(protect);
router.use(authorize('admin'));

router.get('/settings', getPlatformSettings);
router.put('/settings', updatePlatformSettings);
router.put('/settings/commission', updateCommissionRate);
router.get('/vendor-requests', getPendingVendors);
router.post('/vendor-requests/approve', approveVendor);
router.post('/vendor-requests/reject', rejectVendor);
router.get('/users', getAllUsers);
router.get('/vendors-stats', getAllVendorsForAdmin);
router.get('/vendor-subscribers/:vendorId', getVendorSubscribers);

// One-time cleanup route for vendor statuses
router.get('/fix-vendors', async (req, res) => {
  try {
    const Vendor = require('../models/Vendor');
    await Vendor.updateMany(
      { status: { $in: [null, undefined, ''] } },
      { $set: { status: 'pending', isApproved: false, approvalStatus: 'Pending' } }
    );
    await Vendor.updateMany(
      { isApproved: { $exists: false } },
      { $set: { isApproved: false, status: 'pending' } }
    );
    const allVendors = await Vendor.find({}).select('kitchenName status isApproved');
    res.json({ message: 'Fixed', vendors: allVendors });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/fix-vendor-statuses', async (req, res) => {
  try {
    const Vendor = require('../models/Vendor');
    const result = await Vendor.updateMany(
      { isApproved: { $exists: false } },
      { $set: { isApproved: false, status: 'pending', approvalStatus: 'Pending' } }
    );
    const result2 = await Vendor.updateMany(
      { isApproved: null },
      { $set: { isApproved: false, status: 'pending', approvalStatus: 'Pending' } }
    );
    const result3 = await Vendor.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'pending', approvalStatus: 'Pending' } }
    );
    console.log('Fixed vendor statuses:', result, result2, result3);
    res.json({ message: 'Vendor statuses fixed', result, result2, result3 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Re-geocode all approved vendors from their stored address text.
// Call GET /api/admin/regeocode-vendors to fix stale lat/lon after manual DB edits.
router.get('/regeocode-vendors', async (req, res) => {
  try {
    const Vendor = require('../models/Vendor');
    const vendors = await Vendor.find({ isApproved: true })
      .select('kitchenName address pincode latitude longitude');

    let updated = 0, failed = 0, skipped = 0;
    for (const vendor of vendors) {
      if (!vendor.address || !vendor.pincode) { skipped++; continue; }
      try {
        const fullAddress = `${vendor.address}, ${vendor.pincode}, India`;
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fullAddress)}&format=json&limit=1`,
          { headers: { 'User-Agent': 'MealSetu/1.0' } }
        );
        const geoData = await geoRes.json();
        if (geoData && geoData[0]) {
          vendor.latitude = parseFloat(geoData[0].lat);
          vendor.longitude = parseFloat(geoData[0].lon);
          await vendor.save();
          updated++;
        } else {
          failed++;
        }
        // Nominatim rate limit: max 1 request per second
        await new Promise(r => setTimeout(r, 1200));
      } catch (e) {
        console.error(`Geocode failed for ${vendor.kitchenName}:`, e.message);
        failed++;
      }
    }
    res.json({ message: 'Re-geocoding complete', updated, failed, skipped, total: vendors.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/profile', getAdminProfile);
router.put('/profile', updateAdminProfile);

// Commission routes
router.get('/commissions', getAllCommissions);
router.get('/commissions/summary', getCommissionSummary);
router.put('/commissions/:id/mark-paid', markCommissionPaid);

// Commission tiers
router.get('/commission/tiers', getCommissionTiers);
router.put('/commission/tiers', updateCommissionTiers);

// Commission vendors overview
router.get('/commission/vendors', getCommissionVendors);

// Commission reports
router.get('/commission/report/csv', getCommissionReportCSV);


// Commission seed (one-time)
router.post('/commission/seed-tiers', seedDefaultTiers);

// Vendor commission drill-down
router.get('/commission/vendor/:vendorId', getVendorCommissionDetail);
router.get('/commission/vendor/:vendorId/report', downloadVendorCommissionReport);
router.get('/commission/vendor/:vendorId/week-orders', getAdminVendorWeekOrders);
router.get('/commission/vendor/:vendorId/payments', getVendorPaymentHistory);

// Commission disputes
router.get('/commission/disputes', getCommissionDisputes);
router.put('/commission/:id/resolve-dispute', resolveCommissionDispute);

// ── Platform dashboard & alerts ────────────────────────────────────────────
router.get('/dashboard', getPlatformDashboard);
router.get('/dashboard/leaderboard', getDashboardLeaderboard); // <-- ADDED THIS ROUTE
router.get('/alerts', getSystemAlerts);

// ── Order management ───────────────────────────────────────────────────────
router.get('/orders', getAdminOrders);
router.patch('/orders/:id/cancel', cancelOrder);

// ── Enhanced user management ───────────────────────────────────────────────
router.get('/users/enhanced', getUsersEnhanced);
router.patch('/users/:id/suspend', suspendUser);
router.patch('/users/:id/activate', activateUser);

// ── Review moderation ──────────────────────────────────────────────────────
router.get('/reviews/all', getAdminReviewsEnhanced);
router.get('/reviews', getAdminReviews);
router.patch('/reviews/:id/hide', hideReview);
router.patch('/reviews/:id/unhide', unhideReview);
router.delete('/reviews/:id', deleteReview);
router.patch('/reviews/:id/unflag', unflagReview);

// ── One-time migration: sync vendor ratings + backfill isVerifiedPurchase ──
router.post('/migrate-ratings', migrateRatings);

// ── Vendor drill-down ──────────────────────────────────────────────────────
router.get('/vendors/:vendorId/detail', getVendorDetail);
router.patch('/vendors/:vendorId/suspend', suspendVendor);
router.get('/vendors/:vendorId/orders', getVendorOrders);
router.patch('/vendors/:vendorId/orders/:orderId/cancel', cancelVendorOrder);
router.get('/vendors/:vendorId/reviews', getVendorReviews);
router.get('/vendors/:vendorId/riders', getVendorRiders);
router.patch('/vendors/:vendorId/riders/:riderId/toggle', toggleVendorRider);
router.get('/vendors/:vendorId/stuck-batches', getVendorStuckBatches);
router.patch('/batches/:batchId/force-close', forceCloseBatch);

// ── Delivery partner management ────────────────────────────────────────────
router.post('/delivery-partners', createDeliveryPartner);
router.get('/delivery-partners', getDeliveryPartners);
router.patch('/delivery-partners/:id/toggle', togglePartnerStatus);

// ── CSV Exports ────────────────────────────────────────────────────────────
router.get('/export/orders', exportOrdersCSV);
router.get('/export/users', exportUsersCSV);
router.get('/export/delivery', exportDeliveryReportCSV);
router.get('/export/summary', exportPlatformSummaryCSV);

module.exports = router;