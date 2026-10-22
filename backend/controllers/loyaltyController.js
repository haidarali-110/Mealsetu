const LoyaltyPoints = require('../models/LoyaltyPoints');
const User          = require('../models/User');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const POINTS_MAP = {
  Trial:   5,
  Weekly:  25,
  Monthly: 100
};

const MILESTONES = [
  { count: 3,  bonus: 30,  description: '🎯 Milestone: 3 subscriptions!'  },
  { count: 5,  bonus: 50,  description: '🎯 Milestone: 5 subscriptions!'  },
  { count: 10, bonus: 100, description: '🎯 Milestone: 10 subscriptions!' }
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper: determine loyalty level from points total
// ─────────────────────────────────────────────────────────────────────────────

const getUserLevel = (points) => {
  if (points >= 1000) return { name: 'Platinum', icon: '💎', color: '#E5E4E2' };
  if (points >= 600)  return { name: 'Gold',     icon: '🥇', color: '#FFD700' };
  if (points >= 300)  return { name: 'Silver',   icon: '🥈', color: '#C0C0C0' };
  if (points >= 100)  return { name: 'Bronze',   icon: '🥉', color: '#CD7F32' };
  return                     { name: 'Starter',  icon: '🌱', color: '#9CA3AF' };
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: Award points when a subscription is placed or renewed
//   Called from: placeOrder, verifyUserPayment, extendSubscription
// ─────────────────────────────────────────────────────────────────────────────

const awardSubscriptionPoints = async (userId, planType, orderId, isRenewal = false, options = {}) => {
  // Skip points for offer/discounted orders to prevent double-discount
  if (options.skipPoints === true) {
    return { pointsAwarded: 0, totalPoints: null, milestoneReached: null, skipped: true };
  }

  // Skip points if vendor has loyalty OFF — existing wallet is still usable,
  // but no new points are earned while the vendor has opted out.
  if (options.vendorId) {
    try {
      const Vendor = require('../models/Vendor');
      const vendor = await Vendor.findById(options.vendorId).select('loyaltyDiscountsEnabled').lean();
      if (vendor && vendor.loyaltyDiscountsEnabled === false) {
        return { pointsAwarded: 0, totalPoints: null, milestoneReached: null, skipped: true, reason: 'vendor_loyalty_off' };
      }
    } catch (err) {
      // Non-fatal — if lookup fails, proceed with awarding points
      console.error('[awardPoints] vendor loyalty check failed:', err.message);
    }
  }

  // Base points for plan type
  const basePts   = POINTS_MAP[planType] ?? 5;
  const renewalPts = isRenewal ? 15 : 0;

  // Get or create the user's loyalty record
  let loyalty = await LoyaltyPoints.findOne({ userId });
  if (!loyalty) {
    loyalty = await LoyaltyPoints.create({ userId });
  }

  loyalty.points             += basePts + renewalPts;
  loyalty.totalEarned        += basePts + renewalPts;
  loyalty.totalSubscriptions += 1;

  // ── Transaction 1: plan base points ─────────────────────────────────────
  loyalty.transactions.push({
    type:        isRenewal ? 'earned_renewal' : 'earned_subscription',
    points:      basePts,
    description: isRenewal ? `${planType} plan renewed` : `${planType} plan subscribed`,
    planType,
    orderId
  });

  // ── Transaction 2: renewal bonus (separate line so history is clear) ────
  if (isRenewal) {
    loyalty.transactions.push({
      type:        'earned_renewal_bonus',
      points:      renewalPts,
      description: 'Renewal loyalty bonus',
      planType,
      orderId
    });
  }

  // ── First-subscription bonus (one-time, +20) ──────────────────────────────
  const firstSubBonus = (loyalty.totalSubscriptions === 1 && !loyalty.hasFirstSubBonus) ? 20 : 0;
  if (firstSubBonus > 0) {
    loyalty.points         += firstSubBonus;
    loyalty.totalEarned    += firstSubBonus;
    loyalty.hasFirstSubBonus = true;
    loyalty.transactions.push({
      type:        'earned_first_sub',
      points:      firstSubBonus,
      description: 'First subscription bonus!',
      planType,
      orderId
    });
  }

  // ── Milestone bonuses ─────────────────────────────────────────────────────
  let milestoneReached = null;
  const milestone = MILESTONES.find(m => m.count === loyalty.totalSubscriptions);
  if (milestone) {
    loyalty.points      += milestone.bonus;
    loyalty.totalEarned += milestone.bonus;
    loyalty.transactions.push({
      type:        'earned_milestone',
      points:      milestone.bonus,
      description: milestone.description,
      planType,
      orderId
    });
    milestoneReached = { ...milestone };
  }

  await loyalty.save();

  // Notify user about points earned (fire-and-forget)
  const pointsAwarded = basePts + renewalPts + firstSubBonus + (milestoneReached?.bonus || 0);
  const { notifyPointsEarned } = require('../utils/fcmService');
  notifyPointsEarned(userId, pointsAwarded, loyalty.points).catch(() => {});

  return {
    pointsAwarded:    basePts + renewalPts,
    totalPoints:      loyalty.points,
    milestoneReached
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: Award points when a review is submitted
//   Called from: addReview
// ─────────────────────────────────────────────────────────────────────────────

const awardReviewPoints = async (userId) => {
  let loyalty = await LoyaltyPoints.findOne({ userId });
  if (!loyalty) {
    loyalty = await LoyaltyPoints.create({ userId });
  }

  const points = 10;
  loyalty.points      += points;
  loyalty.totalEarned += points;
  loyalty.transactions.push({
    type:        'earned_review',
    points,
    description: 'Review submitted'
  });

  await loyalty.save();
  return { pointsAwarded: points, totalPoints: loyalty.points };
};

// ─────────────────────────────────────────────────────────────────────────────
// API: GET /api/loyalty/points
// ─────────────────────────────────────────────────────────────────────────────

const getLoyaltyPoints = async (req, res) => {
  try {
    let loyalty = await LoyaltyPoints.findOne({ userId: req.user._id });
    if (!loyalty) {
      loyalty = await LoyaltyPoints.create({ userId: req.user._id });
    }

    const { points, totalEarned, totalRedeemed, totalSubscriptions, transactions } = loyalty;

    // Wallet value: ₹ the user can redeem right now
    const walletValue = Math.floor(points / 100) * 10;

    // Points still needed to unlock the next ₹10 batch
    const remainder          = points % 100;
    const pointsToNextRedeem = (remainder === 0 && points > 0) ? 0 : (100 - remainder);

    // Next milestone
    let nextMilestone = null;
    if (totalSubscriptions < 3) {
      const remaining = 3 - totalSubscriptions;
      nextMilestone = {
        target: 3, bonus: 30, remaining,
        message: `${remaining} more subscription${remaining > 1 ? 's' : ''} for 30 bonus points!`
      };
    } else if (totalSubscriptions < 5) {
      const remaining = 5 - totalSubscriptions;
      nextMilestone = {
        target: 5, bonus: 50, remaining,
        message: `${remaining} more subscription${remaining > 1 ? 's' : ''} for 50 bonus points!`
      };
    } else if (totalSubscriptions < 10) {
      const remaining = 10 - totalSubscriptions;
      nextMilestone = {
        target: 10, bonus: 100, remaining,
        message: `${remaining} more subscription${remaining > 1 ? 's' : ''} for 100 bonus points!`
      };
    }

    // Last 20 transactions, newest first
    const recentTransactions = [...transactions]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20);

    // ── Check if user's current active vendor has loyalty OFF ─────────────────
    // This surfaces a notice on the loyalty/rewards screen so the user isn't surprised.
    let vendorLoyaltyNotice = null;
    try {
      const Order  = require('../models/Order');
      const Vendor = require('../models/Vendor');

      const activeOrder = await Order.findOne({
        userId: req.user._id,
        status: 'active'
      }).sort({ endDate: -1 }).select('vendorId').lean();

      if (activeOrder?.vendorId) {
        const activeVendor = await Vendor.findById(activeOrder.vendorId)
          .select('kitchenName loyaltyDiscountsEnabled').lean();

        if (activeVendor && activeVendor.loyaltyDiscountsEnabled === false) {
          vendorLoyaltyNotice = {
            vendorName:  activeVendor.kitchenName,
            // Existing active subscribers are still protected — they can use wallet on renewal
            message:     `${activeVendor.kitchenName} doesn't accept loyalty wallet discounts for new subscribers. As an existing subscriber, you can still use your wallet credit when renewing.`,
            canUseWallet: true   // protected existing subscriber
          };
        }
      }
    } catch (noticeErr) {
      // Non-fatal — skip the notice if lookup fails
      console.error('[getLoyaltyPoints] vendor notice lookup failed:', noticeErr.message);
    }

    res.json({
      points,
      totalEarned,
      totalRedeemed,
      totalSubscriptions,
      walletValue,
      pointsToNextRedeem,
      nextMilestone,
      level:               getUserLevel(points),
      transactions:        recentTransactions,
      vendorLoyaltyNotice  // null if no issue, object if vendor has loyalty off
    });
  } catch (error) {
    console.error('getLoyaltyPoints error:', error);
    res.status(500).json({ message: 'Error fetching loyalty points', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// API: POST /api/loyalty/redeem
//   Body: { points: 100 }  (multiple of 100, min 100, max 500)
// ─────────────────────────────────────────────────────────────────────────────

const redeemPoints = async (req, res) => {
  try {
    const { points } = req.body;

    // ── Validation ────────────────────────────────────────────────────────────
    if (typeof points !== 'number' || isNaN(points)) {
      return res.status(400).json({ message: 'points must be a number' });
    }
    if (points % 100 !== 0) {
      return res.status(400).json({ message: 'Points must be a multiple of 100 (e.g. 100, 200, 300…)' });
    }
    if (points < 100) {
      return res.status(400).json({ message: 'Minimum redemption is 100 points (₹10)' });
    }
    if (points > 500) {
      return res.status(400).json({ message: 'Maximum redemption per transaction is 500 points (₹50)' });
    }

    const loyalty = await LoyaltyPoints.findOne({ userId: req.user._id });
    if (!loyalty || loyalty.points < points) {
      return res.status(400).json({
        message:          'Insufficient points',
        availablePoints:  loyalty?.points ?? 0
      });
    }

    const rupeesCredited = (points / 100) * 10;

    // ── Deduct points ─────────────────────────────────────────────────────────
    loyalty.points        -= points;
    loyalty.totalRedeemed += points;
    loyalty.transactions.push({
      type:        'redeemed',
      points:      -points,
      description: `Redeemed ₹${rupeesCredited} wallet credit`
    });
    await loyalty.save();

    // ── Credit to user wallet ─────────────────────────────────────────────────
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { wallet: rupeesCredited } },
      { new: true }
    );

    res.json({
      success:          true,
      pointsRedeemed:   points,
      rupeesCredited,
      remainingPoints:  loyalty.points,
      newWalletBalance: user.wallet
    });
  } catch (error) {
    console.error('redeemPoints error:', error);
    res.status(500).json({ message: 'Error redeeming points', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// API: GET /api/loyalty/leaderboard
//   Top 10 users by current points balance
// ─────────────────────────────────────────────────────────────────────────────

const getLoyaltyLeaderboard = async (req, res) => {
  try {
    const top10 = await LoyaltyPoints.find()
      .sort({ points: -1 })
      .limit(10)
      .populate('userId', 'name'); // only name — never email

    const leaderboard = top10.map((entry, index) => {
      // Show first name + last-name initial only (e.g. "Ravi K.")
      const fullName = entry.userId?.name || 'Anonymous';
      const parts    = fullName.trim().split(/\s+/);
      const displayName = parts.length > 1
        ? `${parts[0]} ${parts[parts.length - 1][0]}.`
        : parts[0];

      return {
        rank:               index + 1,
        name:               displayName,
        points:             entry.points,
        level:              getUserLevel(entry.points),
        totalSubscriptions: entry.totalSubscriptions
      };
    });

    // ── Always include the requesting user's own rank ─────────────────────────
    // Even if they are outside the top 10, they can see where they stand.
    let yourRank = null;
    try {
      const userLoyalty = await LoyaltyPoints.findOne({ userId: req.user._id });
      if (userLoyalty) {
        const rankPosition = await LoyaltyPoints.countDocuments({
          points: { $gt: userLoyalty.points }
        });
        yourRank = {
          rank:   rankPosition + 1,
          points: userLoyalty.points,
          level:  getUserLevel(userLoyalty.points)
        };
      }
    } catch (rankErr) {
      // Non-fatal — leaderboard still works without yourRank
      console.error('[leaderboard] yourRank lookup failed:', rankErr.message);
    }

    res.json({ leaderboard, yourRank });
  } catch (error) {
    console.error('getLoyaltyLeaderboard error:', error);
    res.status(500).json({ message: 'Error fetching leaderboard', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Internal helpers (used by other controllers)
  awardSubscriptionPoints,
  awardReviewPoints,
  // API handlers
  getLoyaltyPoints,
  redeemPoints,
  getLoyaltyLeaderboard,
  // Shared utility
  getUserLevel
};
