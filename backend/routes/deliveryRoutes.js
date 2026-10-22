const express = require('express');
const { protectDelivery, protect } = require('../middleware/authMiddleware');
const { deliveryProofUpload } = require('../middleware/uploadMiddleware');
const {
  deliveryLogin,
  getDeliveryProfile,
  updateAvailability,
  getMyDeliveries,
  getMyBatches,
  acceptBatch,
  updateOrderStatus,
  updateRiderLocation,
  getMyStats,
  clockIn,
  clockOut,
  getMyAttendance,
  uploadDeliveryPhoto,
  collectTiffins,
  rateRider,
} = require('../controllers/deliveryController');

const router = express.Router();

// ── Public ─────────────────────────────────────────────────────────────────
router.post('/login', deliveryLogin);

// ── Protected (Delivery Partner JWT) ───────────────────────────────────────
router.get('/profile',                         protectDelivery, getDeliveryProfile);
router.patch('/availability',                  protectDelivery, updateAvailability);
router.get('/my-deliveries',                   protectDelivery, getMyDeliveries);   // Flutter backward compat
router.get('/batches',                         protectDelivery, getMyBatches);
router.patch('/batches/:batchId/accept',       protectDelivery, acceptBatch);
router.patch('/orders/:orderId/status',        protectDelivery, updateOrderStatus);
router.post('/location',                       protectDelivery, updateRiderLocation);
router.get('/stats',                           protectDelivery, getMyStats);
router.get('/attendance',                           protectDelivery, getMyAttendance);
router.post('/attendance/clock-in',                 protectDelivery, clockIn);
router.post('/attendance/clock-out',                protectDelivery, clockOut);
router.post('/delivery-photo',                      protectDelivery, deliveryProofUpload.single('photo'), uploadDeliveryPhoto);
router.post('/batches/:batchId/tiffin-collect',     protectDelivery, collectTiffins);

// ── User-facing (customer rates the rider after delivery) ───────────────────
router.post('/rate-rider', protect, rateRider);

module.exports = router;
