const express = require('express');
const router  = express.Router();

const { protect, authorize }          = require('../middleware/authMiddleware');
const { getLoyaltyPoints, redeemPoints, getLoyaltyLeaderboard } = require('../controllers/loyaltyController');

// All routes require a logged-in user
router.get('/points',      protect, authorize('user'), getLoyaltyPoints);
router.post('/redeem',     protect, authorize('user'), redeemPoints);
router.get('/leaderboard', protect, authorize('user'), getLoyaltyLeaderboard);

module.exports = router;
