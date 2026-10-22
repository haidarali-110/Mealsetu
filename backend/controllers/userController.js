const Menu = require('../models/Menu');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Transaction = require('../models/Transaction');
const Complaint = require('../models/Complaint');
const bcrypt = require('bcryptjs');
const { sendEmail } = require('../utils/emailUtils');
const { computeSubscriptionDates, getPlanDurationDays, getMealSlotInfo } = require('../utils/mealTimingUtils');
const { geocodeAddress } = require('../utils/geocode');
const VendorPricing = require('../models/VendorPricing');
const JainMenu      = require('../models/JainMenu');
const { awardSubscriptionPoints, awardReviewPoints } = require('./loyaltyController');

// Helper function to transform profilePic path to full URL
const transformProfilePic = (profilePic, protocol, host) => {
  if (!profilePic) return null;
  if (profilePic.startsWith('http://') || profilePic.startsWith('https://')) {
    return profilePic;
  }
  return `${protocol}://${host}${profilePic.startsWith('/') ? '' : '/'}${profilePic}`;
};

// Helper function to count user's pending plans.
// Counts by status:'pending' only — this covers both regular and offer orders,
// since all pending orders (regardless of type) carry status:'pending'.
// Using offerStatus alongside would double-count offer orders that have both fields set.
const getPendingPlansCount = async (userId) => {
  return await Order.countDocuments({
    userId: userId,
    status: 'pending'
  });
};

// @desc    Get user active subscription
// @route   GET /api/users/subscription
const getUserSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    const subscription = await Subscription.findOne({
      userId: userId,
      status: 'active'
    }).populate('vendorId', 'kitchenName address');

    if (!subscription) {
      return res.status(404).json({ message: 'No active subscription found' });
    }

    const now = new Date();
    const expiryDate = new Date(subscription.expiryDate);
    const isExpired = expiryDate < now;

    res.json({
      subscription: subscription,
      isActive: !isExpired,
      isExpired: isExpired,
      daysRemaining: isExpired ? 0 : Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ message: 'Error getting subscription', error: error.message });
  }
};

// @desc    Apply leave — max 2 leaves per subscription
//          Active plan  → extend expiry by leave days
//          Upcoming plan (pending) → shift start/end dates
//          No plan      → return warning
// @route   POST /api/users/apply-leave
const MAX_LEAVES_PER_SUBSCRIPTION = 2;

const applyLeave = async (req, res) => {
  try {
    const { leaveDate, leaveEndDate, mealType } = req.body;
    const userId = req.user._id;

    if (!leaveDate) {
      return res.status(400).json({ message: 'Leave start date is required' });
    }

    const startDate = new Date(leaveDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = leaveEndDate ? new Date(leaveEndDate) : new Date(startDate);
    endDate.setHours(23, 59, 59, 999);

    if (endDate < startDate) {
      return res.status(400).json({ message: 'Leave end date cannot be before start date' });
    }

    const leaveDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const now = new Date();

    // ── CASE 1: Active subscription ───────────────────────────────────────────
    const activeSub = await Subscription.findOne({ userId, status: 'active' });

    // ── Reject if the requested dates overlap any existing leave ──────────────
    if (activeSub && Array.isArray(activeSub.leaveDates) && activeSub.leaveDates.length > 0) {
      const overlap = activeSub.leaveDates.some(existing => {
        const eStart = new Date(existing.startDate);
        const eEnd   = new Date(existing.endDate);
        return startDate <= eEnd && endDate >= eStart;
      });
      if (overlap) {
        return res.status(400).json({
          message: 'The selected dates overlap with an existing leave. Please choose different dates.'
        });
      }
    }

    if (activeSub && new Date(activeSub.expiryDate) >= now) {
      // Enforce 2-leave limit
      if ((activeSub.leavesUsed || 0) >= MAX_LEAVES_PER_SUBSCRIPTION) {
        return res.status(400).json({
          message: `You have already used all ${MAX_LEAVES_PER_SUBSCRIPTION} leaves for this subscription. Leaves reset when you start a new subscription.`,
          leavesUsed: activeSub.leavesUsed,
          leavesAllowed: MAX_LEAVES_PER_SUBSCRIPTION
        });
      }

      const originalExpiry = new Date(activeSub.expiryDate);
      const newExpiry = new Date(originalExpiry);
      newExpiry.setDate(newExpiry.getDate() + leaveDays);

      activeSub.leaveDate = startDate;
      activeSub.expiryDate = newExpiry;
      activeSub.leavesUsed = (activeSub.leavesUsed || 0) + 1;
      activeSub.leaveDates = activeSub.leaveDates || [];
      activeSub.leaveDates.push({ startDate, endDate, days: leaveDays, appliedAt: now });
      await activeSub.save();

      // ── Sync the active Order's endDate so getMySubscription returns the new date ──
      await Order.findOneAndUpdate(
        { userId, status: { $in: ['active', 'trial'] }, endDate: { $gte: now } },
        { $set: { endDate: newExpiry } }
      );

      // Shift any pending orders that come after this subscription
      const pendingOrders = await Order.find({ userId, status: 'pending' }).sort({ scheduledStartDate: 1 });
      const DURATION_MAP = { Weekly: 7, Monthly: 30, Trial: 1, Tiffin: 1 };
      let chainEnd = new Date(newExpiry);
      for (const po of pendingOrders) {
        const dur = DURATION_MAP[po.planType] ?? 7;
        const newStart = new Date(chainEnd.getTime() + 86400000);
        const newEnd   = new Date(newStart.getTime() + dur * 86400000);
        po.scheduledStartDate = newStart;
        po.scheduledEndDate   = newEnd;
        po.startDate          = newStart;
        po.endDate            = newEnd;
        await po.save();
        chainEnd = newEnd;
      }

      // Sync expiry snapshot on User doc
      await User.findByIdAndUpdate(userId, { expiryDate: newExpiry });

      try {
        const user = await User.findById(userId);
        if (user) {
          await sendEmail(user.email, 'MealSetu - Leave Applied & Subscription Extended', `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #EA580C;">Leave Applied Successfully!</h1>
              <p>Dear ${user.name},</p>
              <p>Your leave has been recorded and your subscription has been extended.</p>
              <div style="background:#f5f5f5;padding:20px;margin:20px 0;border-radius:8px;">
                <p><strong>Leave Period:</strong> ${startDate.toLocaleDateString('en-IN')} ${leaveEndDate ? '— ' + endDate.toLocaleDateString('en-IN') : ''}</p>
                <p><strong>Days of Leave:</strong> ${leaveDays} day(s)</p>
                <p><strong>Meals Skipped:</strong> ${mealType === 'both' ? 'Lunch & Dinner' : mealType === 'lunch' ? 'Lunch Only' : 'Dinner Only'}</p>
                <p><strong>Old Expiry Date:</strong> ${originalExpiry.toLocaleDateString('en-IN')}</p>
                <p><strong>New Expiry Date:</strong> ${newExpiry.toLocaleDateString('en-IN')}</p>
                <p><strong>Leaves Used:</strong> ${activeSub.leavesUsed} / ${MAX_LEAVES_PER_SUBSCRIPTION}</p>
              </div>
              <p style="color:#999;font-size:12px;">Thank you for choosing MealSetu!</p>
            </div>
          `);
        }
      } catch (emailErr) {
        console.error('Leave email failed:', emailErr);
      }
      const { notifyLeaveApplied } = require('../utils/fcmService');
      notifyLeaveApplied(userId, leaveDays, newExpiry).catch(console.error);

      return res.status(200).json({
        message: 'Leave applied successfully. Your active subscription has been extended.',
        mode: 'active_extended',
        newExpiryDate: newExpiry,
        leaveDays,
        leavesUsed: activeSub.leavesUsed,
        leavesRemaining: MAX_LEAVES_PER_SUBSCRIPTION - activeSub.leavesUsed
      });
    }

    // ── CASE 2: No active plan — check for upcoming (pending) plan ────────────
    const upcomingSub = await Subscription.findOne({
      userId,
      status: 'pending'
    }).sort({ startDate: 1 });

    if (upcomingSub) {
      // Enforce 2-leave limit on upcoming subscription too
      if ((upcomingSub.leavesUsed || 0) >= MAX_LEAVES_PER_SUBSCRIPTION) {
        return res.status(400).json({
          message: `You have already used all ${MAX_LEAVES_PER_SUBSCRIPTION} leaves for your upcoming subscription.`,
          leavesUsed: upcomingSub.leavesUsed,
          leavesAllowed: MAX_LEAVES_PER_SUBSCRIPTION
        });
      }

      const originalStart = new Date(upcomingSub.startDate);
      const originalEnd   = new Date(upcomingSub.expiryDate);

      const newStart = new Date(originalStart);
      newStart.setDate(newStart.getDate() + leaveDays);
      const newEnd = new Date(originalEnd);
      newEnd.setDate(newEnd.getDate() + leaveDays);

      upcomingSub.startDate  = newStart;
      upcomingSub.expiryDate = newEnd;
      upcomingSub.leavesUsed = (upcomingSub.leavesUsed || 0) + 1;
      upcomingSub.leaveDates = upcomingSub.leaveDates || [];
      upcomingSub.leaveDates.push({ startDate, endDate, days: leaveDays, appliedAt: now });
      await upcomingSub.save();

      return res.status(200).json({
        message: 'Leave applied. Your upcoming subscription start and end dates have been shifted forward.',
        mode: 'upcoming_shifted',
        newStartDate: newStart,
        newExpiryDate: newEnd,
        leaveDays,
        leavesUsed: upcomingSub.leavesUsed,
        leavesRemaining: MAX_LEAVES_PER_SUBSCRIPTION - upcomingSub.leavesUsed
      });
    }

    // ── CASE 3: No plan at all ────────────────────────────────────────────────
    return res.status(400).json({
      message: 'You do not have any active or upcoming subscription. Please subscribe first before applying a leave.',
      mode: 'no_plan'
    });

  } catch (error) {
    console.error('Apply leave error:', error);
    res.status(500).json({ message: 'Error processing leave request', error: error.message });
  }
};

// @desc    Extend subscription (renew)
// @route   POST /api/users/extend-subscription
const extendSubscription = async (req, res) => {
  try {
    const { plan, vendorId, paymentMethod = 'Cash', deliverySlot = 'Lunch', mealPreference = 'Regular' } = req.body;

    // Enforce only Lunch or Dinner — no breakfast
    if (!['Lunch', 'Dinner'].includes(deliverySlot)) {
      return res.status(400).json({ message: 'Invalid delivery slot. Only Lunch and Dinner are available.' });
    }
    const userId = req.user._id;

    if (!plan || !vendorId) {
      return res.status(400).json({ message: 'Plan and vendorId are required' });
    }

    const paymentStatus = paymentMethod === 'UPI' ? 'Paid' : 'Pending';

    let durationDays = 1;
    let planType = 'Trial';
    let amount = 80;

    switch (plan) {
      case 'WEEKLY':
        durationDays = 7;
        planType = 'Weekly';
        
        break;
      case 'MONTHLY':
        durationDays = 30;
        planType = 'Monthly';
        
        break;
      case 'ONEDAY':
      default:
        durationDays = 1;
        planType = 'Trial';
        amount = 80;
        break;
    }

    // Dynamic pricing — single source of truth: VendorPricing collection only.
      // Vendor.pricing array fallback removed to prevent price inconsistencies.
      const vendorPricingRecord = await VendorPricing.findOne({
        vendor_id: vendorId,
        plan_type: planType.toLowerCase(),
        is_active: true
      });

      if (vendorPricingRecord && vendorPricingRecord.price > 0) {
        amount = vendorPricingRecord.price;
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({
          message: 'This vendor has not configured pricing yet. Please contact the vendor or support.'
        });
      }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);

    const user = await User.findById(userId);
    const vendor = await Vendor.findById(vendorId);

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    let subscriptionStartDate = new Date();
    let newExpiryDate;

    const existingSubscription = await Subscription.findOne({
      userId: userId,
      status: 'active'
    });

    if (existingSubscription) {
      const currentExpiry = new Date(existingSubscription.expiryDate);
      const now = new Date();

      if (currentExpiry < now) {
        subscriptionStartDate = now;
        newExpiryDate = new Date(now);
      } else {
        newExpiryDate = currentExpiry;
      }

      newExpiryDate.setDate(newExpiryDate.getDate() + durationDays);
      existingSubscription.planType = planType;
      existingSubscription.expiryDate = newExpiryDate;
      await existingSubscription.save();
    } else {
      newExpiryDate = new Date(subscriptionStartDate);
      newExpiryDate.setDate(newExpiryDate.getDate() + durationDays);

      await Subscription.create({
        userId: userId,
        vendorId,
        planType,
        startDate: subscriptionStartDate,
        expiryDate: newExpiryDate,
        status: 'active',
        customerName: user.name,
        contact: user.phone
      });
    }

    user.expiryDate = newExpiryDate;
    await user.save();

    const order = await Order.create({
      userId: userId,
      vendorId,
      amount: amount,
      deliverySlot: deliverySlot,
      mealPreference: mealPreference,
      paymentStatus: paymentStatus,
      paymentMethod: paymentMethod,
      planType: planType,
      status: 'active',
      startDate: subscriptionStartDate,
      endDate: newExpiryDate,
      scheduledStartDate: subscriptionStartDate,
      scheduledEndDate: newExpiryDate
    });

    // Notify vendor analytics dashboard in real-time
    try { const _io = req.app.get('io') || global.io; _io?.to(`vendor_${vendorId}`).emit('analytics_update'); _io?.to(`vendor_${vendorId}`).emit('new_order_placed'); } catch (_) {}

    // Award loyalty points — isRenewal=true when extending an existing active subscription
    // skipPoints if offer order; vendorId so vendor loyalty-off check runs inside
    awardSubscriptionPoints(userId, planType, order._id, !!existingSubscription, { skipPoints: !!order.isOfferOrder, vendorId })
      .catch(err => console.error('Loyalty points error (extendSubscription):', err));

    try {
      const emailSubject = `MealSetu - ${planType} Subscription ${existingSubscription ? 'Extended' : 'Activated'}`;
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">${existingSubscription ? 'Subscription Extended!' : 'Subscription Activated!'}</h1>
          <p>Dear ${user.name},</p>
          <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0;">
            <p><strong>Vendor:</strong> ${vendor.kitchenName}</p>
            <p><strong>Plan:</strong> ${planType}</p>
            <p><strong>Start Date:</strong> ${subscriptionStartDate.toLocaleDateString()}</p>
            <p><strong>Expiry Date:</strong> ${newExpiryDate.toLocaleDateString()}</p>
            <p><strong>Amount Paid:</strong> ₹${amount}</p>
          </div>
          <p>Enjoy your meals!</p>
          <hr/>
          <p style="color: #999; font-size: 12px;">Thank you for choosing MealSetu!</p>
        </div>
      `;
      await sendEmail(user.email, emailSubject, emailHtml);
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
    }
    const { notifySubscriptionExtended } = require('../utils/fcmService');
    notifySubscriptionExtended(userId, vendor.kitchenName, planType, newExpiryDate).catch(console.error);

    res.status(200).json({
      message: existingSubscription ? 'Subscription extended successfully' : 'Subscription activated successfully',
      subscription: {
        planType,
        startDate: subscriptionStartDate,
        expiryDate: newExpiryDate,
        status: 'active'
      },
      order,
      amount
    });
  } catch (error) {
    console.error('Extend subscription error:', error);
    res.status(500).json({ message: 'Error extending subscription', error: error.message });
  }
};

// @desc    Get current user profile
// @route   GET /api/users/me
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userObj = user.toObject();
    userObj.profilePic = transformProfilePic(user.profilePic, req.protocol, req.get('host'));

    // Compute display string from either new object or old string address
    const addr = userObj.address;
    if (addr && typeof addr === 'object') {
      userObj.addressString = addr.fullAddress ||
        [addr.flatHouseNo, addr.street, addr.area, addr.city, addr.pincode]
          .filter(Boolean).join(', ');
    } else {
      userObj.addressString = typeof addr === 'string' ? addr : '';
    }

    res.json(userObj);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/:id
const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { name, phone, pincode, gender } = req.body;

    // Accept address fields as a nested object OR as flat top-level keys.
    // Flutter sends { address: { flatHouseNo, street, … } }; some callers
    // may send the fields at the top level — both are handled below.
    const bodyAddr = req.body.address;
    const src = (typeof bodyAddr === 'object' && bodyAddr !== null) ? bodyAddr : req.body;
    const {
      flatHouseNo, street, area, landmark, city,
      latitude, longitude,
      pincode: addrPincode,
    } = src;

    // Existing address (may be an object from the new schema or a legacy string).
    const existingAddr =
      (typeof user.address === 'object' && user.address !== null) ? user.address : {};

    // Merge: undefined ⇒ keep existing; any other value (incl. '') ⇒ overwrite.
    const newAddr = {
      flatHouseNo: flatHouseNo ?? existingAddr.flatHouseNo ?? '',
      street:      street      ?? existingAddr.street      ?? '',
      area:        area        ?? existingAddr.area        ?? '',
      landmark:    landmark    ?? existingAddr.landmark    ?? '',
      city:        city        ?? existingAddr.city        ?? '',
      pincode:     addrPincode ?? pincode ?? existingAddr.pincode ?? '',
      latitude:    latitude    ?? existingAddr.latitude    ?? null,
      longitude:   longitude   ?? existingAddr.longitude   ?? null,
    };
    newAddr.fullAddress = [
      newAddr.flatHouseNo, newAddr.street,
      newAddr.area, newAddr.landmark,
      newAddr.city, newAddr.pincode,
    ].filter(Boolean).join(', ');

    // Re-geocode when address changed but no GPS coords provided by the client.
    // Detect address change by comparing key fields against the existing address.
    const addrChanged =
      (area     !== undefined && area     !== existingAddr.area)     ||
      (city     !== undefined && city     !== existingAddr.city)     ||
      (street   !== undefined && street   !== existingAddr.street)   ||
      ((addrPincode || pincode) !== undefined && (addrPincode || pincode) !== existingAddr.pincode);

    const frontendSentCoords = latitude != null && longitude != null;

    if (!frontendSentCoords && addrChanged && (newAddr.city || newAddr.pincode)) {
      try {
        const geoQuery = [newAddr.area, newAddr.city, newAddr.pincode].filter(Boolean).join(', ');
        const coords = await geocodeAddress(`${geoQuery}, India`);
        if (coords) {
          newAddr.latitude  = coords.lat;
          newAddr.longitude = coords.lng;
        }
      } catch (_) {}
    }

    const updateFields = { address: newAddr, pincode: newAddr.pincode || user.pincode || '' };
    if (name  !== undefined) updateFields.name  = name;
    if (phone !== undefined) updateFields.phone = phone;
    updateFields.gender = (gender && gender.trim() !== '') ? gender.trim() : null;

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true }
    ).select('-password');

    const userObj = updated.toObject();
    userObj.profilePic = transformProfilePic(updated.profilePic, req.protocol, req.get('host'));

    res.json(userObj);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Update user profile picture
// @route   PUT /api/users/:id/profile-pic
const updateUserProfilePic = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const normalizePath = (filePath) => {
      if (!filePath) return null;
      let normalized = filePath.replace(/\\/g, '/');
      if (normalized.includes('uploads/')) {
        const parts = normalized.split('uploads/');
        normalized = '/uploads/' + parts[parts.length - 1];
      }
      return normalized;
    };

    const profilePicPath = normalizePath(req.file.path);
    const profilePicUrl = `${req.protocol}://${req.get('host')}${profilePicPath}`;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { profilePic: profilePicPath },
      { new: true }
    ).select('-password');

    res.json({
      ...user.toObject(),
      profilePic: profilePicUrl
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Change password
// @route   POST /api/users/:id/change-password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isPasswordCorrect = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// ── Auto-heal helper ──────────────────────────────────────────────────────────
// If a race condition left multiple active/trial orders, keep the most recently
// created one as active and reschedule the rest as pending (chained after it).
// Also re-chains any pre-existing pending orders so dates stay consecutive.
const healDuplicateActiveOrders = async (userId) => {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);

  const activeOrders = await Order.find({
    userId,
    status: { $in: ['active', 'trial'] },
    endDate: { $gte: now },
  }).sort({ createdAt: -1 }); // newest first → primary = activeOrders[0]

  if (activeOrders.length <= 1) return; // nothing to fix

  const primary = activeOrders[0];

  // Chain starts the day after the primary plan ends
  let cursor = new Date(primary.endDate);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  cursor.setUTCHours(0, 0, 0, 0);

  const rescheduledIds = [];

  // Step 1: reschedule each duplicate active order as pending
  for (let i = 1; i < activeOrders.length; i++) {
    const dup = activeOrders[i];
    const days = Math.round(
      (new Date(dup.endDate) - new Date(dup.startDate)) / 86400000
    );
    const newEnd = new Date(cursor);
    newEnd.setUTCDate(newEnd.getUTCDate() + days);
    newEnd.setUTCHours(0, 0, 0, 0);

    await Order.findByIdAndUpdate(dup._id, {
      $set: {
        status:             'pending',
        startDate:          cursor,
        endDate:            newEnd,
        scheduledStartDate: cursor,
        scheduledEndDate:   newEnd,
      },
    });

    rescheduledIds.push(dup._id.toString());
    cursor = new Date(newEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Step 2: re-chain any pre-existing pending orders so they follow cleanly
  const existingPending = await Order.find({
    userId,
    status: 'pending',
    _id: { $nin: rescheduledIds },
  }).sort({ startDate: 1 });

  for (const p of existingPending) {
    const days = Math.round(
      (new Date(p.endDate) - new Date(p.startDate)) / 86400000
    );
    const newEnd = new Date(cursor);
    newEnd.setUTCDate(newEnd.getUTCDate() + days);
    newEnd.setUTCHours(0, 0, 0, 0);

    await Order.findByIdAndUpdate(p._id, {
      $set: {
        startDate:          cursor,
        endDate:            newEnd,
        scheduledStartDate: cursor,
        scheduledEndDate:   newEnd,
      },
    });

    cursor = new Date(newEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
};

// @desc    Get user orders
// @route   GET /api/users/orders
const getUserOrders = async (req, res) => {
  try {
    // Fix any race-condition duplicates before returning data
    await healDuplicateActiveOrders(req.user._id);

    const orders = await Order.find({ userId: req.user._id })
      .populate('vendorId', 'kitchenName address')
      .sort({ orderDate: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get All Menus for a specific date
// @route   GET /api/users/menus?date=2026-02-05
// const getMenus = async (req, res) => {
//   try {
//     const date = req.query.date ? new Date(req.query.date) : new Date();
//     const start = new Date(date);
//     start.setHours(0, 0, 0, 0);
//     const end = new Date(date);
//     end.setHours(23, 59, 59, 999);

//     const menus = await Menu.find({ date: { $gte: start, $lte: end }, isLive: true })
//       .populate(
//         'vendorId',
//         'kitchenName address kitchenAddress menuPrice rating workingDays timings profileImage kitchenPoster fssaiNumber fssaiLicense trialEnabled trialFee latitude longitude upiId offersJainMenu'
//       );  // Removed pricing from populate - fetch separately

//     const transformImageUrl = (imagePath) => {
//       if (!imagePath) return null;
//       if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return imagePath;
//       const backendUrl = `${req.protocol}://${req.get('host')}`;
//       if (imagePath.startsWith('/uploads/')) return `${backendUrl}${imagePath}`;
//       return `${backendUrl}/uploads/${imagePath.replace(/^\/?uploads\//, '')}`;
//     };

//     // ✅ OPTIMIZED: Single query for all vendor pricing using $in
//     const vendorIds = menus.map(m => m.vendorId?._id).filter(Boolean);
//     // ✅ PRICING
//     const pricingRecords = await VendorPricing.find({ 
//       vendor_id: { $in: vendorIds } 
//     });
//     // ✅ JAIN MENU
//     const jainMenuRecords = await JainMenu.find({ vendor_id: { $in: vendorIds } });
//     const jainMenuByVendor = {};
//     jainMenuRecords.forEach(record => {
//       if (!jainMenuByVendor[record.vendor_id.toString()]) jainMenuByVendor[record.vendor_id.toString()] = [];
//       jainMenuByVendor[record.vendor_id.toString()].push(record);
//     });

//     // Group pricing by vendor_id for O(1) lookup
//     const pricingByVendor = {};
//     pricingRecords.forEach(record => {
//       if (!pricingByVendor[record.vendor_id.toString()]) {
//         pricingByVendor[record.vendor_id.toString()] = [];
//       }
//       pricingByVendor[record.vendor_id.toString()].push({
//         type: record.plan_type,
//         price: record.price,
//         active: record.is_active
//       });
//     });

//     const mapped = await Promise.all(menus.map(async (m) => {
//       const v = m.vendorId || {};
      
//       // ✅ DYNAMIC PRICING FROM VendorPricing collection
//       const vendorPricing = pricingByVendor[v._id?.toString()] || [];
//       const activePricing = vendorPricing.filter(p => p.active && p.price > 0);
//       const jainMenu = jainMenuByVendor[v._id?.toString()] || [];
      
//       return {
//         _id: m._id,
//         date: m.date,
//         mainSabji: m.mainSabji,
//         altSabji: m.altSabji,
//         sweetItem: m.sweetItem,
//         dietaryCategory: m.dietaryCategory,
//         cycleType: m.cycleType,

//         vendorId: v._id || null,
//         kitchenName: v.kitchenName || 'Partner Kitchen',
//         address: v.address || v.kitchenAddress || '',
//         pincode: v.pincode || '',

//         pricing: activePricing,  // ✅ Frontend-expected array format
//         jainMenu,  // ✅ Array [{day: 'Monday', main_course: '...'}]
//         upiId: v.upiId || '',

//         menuPrice: v.menuPrice || 80,
//         rating: v.rating || 4.5,
//         fssaiNumber: v.fssaiNumber || v.fssaiLicense || '',
//         workingDays: v.workingDays || 'Mon - Sat',
//         timings: v.timings || '11:00 AM - 09:00 PM',

//         profileImage: v.profileImage ? transformImageUrl(v.profileImage) : null,
//         kitchenPoster: v.kitchenPoster ? transformImageUrl(v.kitchenPoster) : null,

//         trialEnabled: v.trialEnabled === true,
//         trialFee: v.trialFee || 0,
//         offersJainMenu: v.offersJainMenu || false,
//         upiId: v.upiId || null,
//         latitude: v.latitude,
//         longitude: v.longitude
//       };
//     }));

//     res.json(mapped);
//   } catch (error) {
//     console.error('getMenus error:', error);
//     res.status(500).json({ message: 'Server Error', error: error.message });
//   }
// };


const getMenus = async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const menus = await Menu.find({
      date: { $gte: start, $lte: end },
      isLive: true
    }).populate(
      'vendorId',
      'kitchenName address kitchenAddress menuPrice rating workingDays timings profileImage kitchenPoster fssaiNumber fssaiLicense trialEnabled trialFee latitude longitude upiId offersJainMenu jainWeeklyPlan pricing'
    );

    const transformImageUrl = (imagePath) => {
      if (!imagePath) return null;
      if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return imagePath;

      const backendUrl = `${req.protocol}://${req.get('host')}`;

      if (imagePath.startsWith('/uploads/')) {
        return `${backendUrl}${imagePath}`;
      }

      return `${backendUrl}/uploads/${imagePath.replace(/^\/?uploads\//, '')}`;
    };

    // 🔥 Get all vendor IDs
    const vendorIds = menus.map(m => m.vendorId?._id).filter(Boolean);

    // 🔥 Fetch pricing in one query
    const pricingRecords = await VendorPricing.find({
      vendor_id: { $in: vendorIds }
    });

    // 🔥 Group pricing by vendor
    const pricingByVendor = {};
    pricingRecords.forEach(record => {
      const vid = record.vendor_id.toString();

      if (!pricingByVendor[vid]) {
        pricingByVendor[vid] = [];
      }

      pricingByVendor[vid].push({
        type: record.plan_type,
        price: record.price,
        active: record.is_active
      });
    });

    // 🔥 Map menus
    const mapped = menus.map((m) => {
      const v = m.vendorId || {};

      const vendorPricing = pricingByVendor[v._id?.toString()] || [];

      const activePricing = vendorPricing.filter(
        p => p.active && p.price > 0
      );

      return {
        _id: m._id,
        date: m.date,

        mainSabji: m.mainSabji,
        altSabji: m.altSabji,
        sweetItem: m.sweetItem,
        dietaryCategory: m.dietaryCategory,
        cycleType: m.cycleType,

        vendorId: v._id || null,
        kitchenName: v.kitchenName || 'Partner Kitchen',

        address: v.address || v.kitchenAddress || '',
        pincode: v.pincode || '',

        // ✅ PRICING FIX
        pricing: activePricing,

        menuPrice: v.menuPrice || 80,
        rating: v.rating || 4.5,

        fssaiNumber: v.fssaiNumber || v.fssaiLicense || '',
        workingDays: v.workingDays || 'Mon - Sat',
        timings: v.timings || '11:00 AM - 09:00 PM',

        profileImage: v.profileImage
          ? transformImageUrl(v.profileImage)
          : null,

        kitchenPoster: v.kitchenPoster
          ? transformImageUrl(v.kitchenPoster)
          : null,

        trialEnabled: v.trialEnabled === true,
        trialFee: v.trialFee || 0,
        offersJainMenu: v.offersJainMenu || false,
        jainWeeklyPlan: v.jainWeeklyPlan || {},

        latitude: v.latitude,
        longitude: v.longitude
      };
    });


    res.json(mapped);

  } catch (error) {
    console.error('getMenus error:', error);
    res.status(500).json({
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Place an Order or Create Subscription
// @route   POST /api/users/order
const placeOrder = async (req, res) => {
  // Get Socket.IO instance
  const io = req.app.get('io');
  try {
    console.log('=== PLACE ORDER API CALLED ===');
    console.log('userId:', req.user?._id);
    console.log('vendorId:', req.body?.vendorId);
    console.log('plan:', req.body?.plan);
    console.log('timestamp:', new Date().toISOString());
    console.log('================================');

    const {
      vendorId,
      items = [],
      amount,
      deliverySlot = 'Lunch',
      mealPreference,
      plan = 'ONEDAY',
      startDate,
      altMainSubji = '',
      paymentMethod = 'Cash'
    } = req.body;

    if (!vendorId) {
      return res.status(400).json({ message: 'vendorId is required' });
    }
    if (amount == null) {
      return res.status(400).json({ message: 'amount is required' });
    }
    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: 'amount must be a positive number' });
    }

    const mealPreferenceMap = {
      'regular': 'Regular',
      'jain': 'Jain',
      'Regular': 'Regular',
      'Jain': 'Jain'
    };
    const mealPref = mealPreferenceMap[mealPreference] || 'Regular';

    const user = await User.findById(req.user._id);
    const vendor = await Vendor.findById(vendorId);

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    let durationDays = 1;
    let planType = 'Trial';
    switch (plan) {
      case 'WEEKLY':
        durationDays = 7;
        planType = 'Weekly';
        break;
      case 'MONTHLY':
        durationDays = 30;
        planType = 'Monthly';
        break;
      case 'ONEDAY':
      default:
        durationDays = 1;
        planType = 'Trial';
        break;
    }

    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    const activeOrder = await Order.findOne({
      userId: req.user._id,
      status: { $in: ['active', 'trial'] },
      endDate: { $gte: now }
    }).sort({ orderDate: -1 });

    console.log('=== CHECKING FOR ACTIVE ORDER ===');
    console.log('activeOrder found:', activeOrder ? activeOrder._id : null);
    console.log('activeOrder endDate:', activeOrder?.endDate);
    console.log('===================================');

    let subscriptionStartDate;
    let subscriptionExpiryDate;

    if (activeOrder) {
      // Check pending plans limit (max 3)
      const pendingCount = await getPendingPlansCount(req.user._id);
      if (pendingCount >= 3) {
        return res.status(400).json({
          message: 'You have reached the maximum limit of 3 upcoming plan extensions.'
        });
      }

      // Find existing pending orders to chain after
      const existingPendingOrders = await Order.find({
        userId: req.user._id,
        status: 'pending'
      }).sort({ scheduledEndDate: -1 });

      if (existingPendingOrders && existingPendingOrders.length > 0) {
        const lastScheduledEndDate = new Date(existingPendingOrders[0].scheduledEndDate);
        subscriptionStartDate = new Date(lastScheduledEndDate.getTime() + 86400000);
      } else {
        if (activeOrder.endDate) {
          subscriptionStartDate = new Date(new Date(activeOrder.endDate).getTime() + 86400000);
        } else {
          subscriptionStartDate = new Date(now);
          subscriptionStartDate.setDate(subscriptionStartDate.getDate() + 1);
        }
      }

      // -1: endDate is inclusive last meal day (matches computeSubscriptionDates fix)
      subscriptionExpiryDate = new Date(subscriptionStartDate.getTime() + (durationDays - 1) * 86400000);

      console.log('=== CREATING PENDING ORDER ===');
      console.log('scheduledStartDate:', subscriptionStartDate);
      console.log('scheduledEndDate:', subscriptionExpiryDate);
      console.log('=================================');

      const order = await Order.create({
        userId: req.user._id,
        vendorId,
        amount: numericAmount,
        deliverySlot,
        mealPreference: mealPref,
        paymentStatus: paymentMethod === 'Cash' ? 'Pending' : 'Paid',
        paymentMethod,
        planType,
        status: 'pending',
        scheduledStartDate: subscriptionStartDate,
        scheduledEndDate: subscriptionExpiryDate,
        startDate: subscriptionStartDate,
        endDate: subscriptionExpiryDate
      });

      console.log('=== PENDING ORDER SAVED ===');
      console.log('orderId:', order._id);
      console.log('status:', order.status);
      console.log('===========================');

      // Notify vendor analytics dashboard in real-time
      try { const _io = req.app.get('io') || global.io; _io?.to(`vendor_${vendorId}`).emit('analytics_update'); _io?.to(`vendor_${vendorId}`).emit('new_order_placed'); } catch (_) {}

      try {
        const emailSubject = `MealSetu - ${planType} Subscription Queued!`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333;">Order Queued!</h1>
            <p>Dear ${user.name},</p>
            <p>Your subscription has been queued. It will automatically activate after your current plan ends.</p>
            <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0;">
              <p><strong>Vendor:</strong> ${vendor.kitchenName}</p>
              <p><strong>Plan:</strong> ${planType}</p>
              <p><strong>Scheduled Start Date:</strong> ${subscriptionStartDate.toLocaleDateString()}</p>
              <p><strong>Scheduled End Date:</strong> ${subscriptionExpiryDate.toLocaleDateString()}</p>
              <p><strong>Amount:</strong> ₹${numericAmount}</p>
              <p><strong>Payment Method:</strong> ${paymentMethod}</p>
            </div>
            <hr/>
            <p style="color: #999; font-size: 12px;">Thank you for choosing MealSetu!</p>
          </div>
        `;
        await sendEmail(user.email, emailSubject, emailHtml);
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
      }

      // Award loyalty points (fire-and-forget — never blocks the response)
      // skipPoints if offer order; vendorId so vendor loyalty-off check runs inside
      awardSubscriptionPoints(req.user._id, planType, order._id, false, { skipPoints: !!order.isOfferOrder, vendorId })
        .catch(err => console.error('Loyalty points error (placeOrder pending):', err));

      // FCM notifications (fire-and-forget)
      try {
        const { notifyOrderConfirmed, notifyVendorNewOrder } = require('../utils/fcmService');
        if (typeof notifyOrderConfirmed === 'function') {
          notifyOrderConfirmed(req.user._id, {
            planType, vendorName: vendor.kitchenName,
            startDate: subscriptionStartDate, orderId: order._id,
          }).catch(console.error);
        }
        if (vendor.ownerId && typeof notifyVendorNewOrder === 'function') {
          notifyVendorNewOrder(vendor.ownerId, user.name, planType, numericAmount).catch(console.error);
        }
      } catch (fcmErr) {
        console.error('FCM error in placeOrder pending:', fcmErr.message);
      }

      return res.status(201).json({
        success: true,
        order,
        message: 'Order queued successfully. It will activate after your current plan ends.'
      });
    }

    // No active order — create active order immediately with smart meal timing
    ({ startDate: subscriptionStartDate, endDate: subscriptionExpiryDate,
       mealSlotToday: subscriptionFirstDaySlot,
       firstDayMealSlot: subscriptionFirstDayMealSlot,
       lastDayMealSlot: subscriptionLastDaySlot } =
      computeSubscriptionDates(durationDays));

    const order = await Order.create({
      userId: req.user._id,
      vendorId,
      amount: numericAmount,
      deliverySlot,
      mealPreference: mealPref,
      paymentStatus: paymentMethod === 'Cash' ? 'Pending' : 'Paid',
      paymentMethod,
      planType,
      status: 'active',
      startDate: subscriptionStartDate,
      endDate: subscriptionExpiryDate,
      firstDayMealSlot: subscriptionFirstDayMealSlot || 'both',
      lastDayMealSlot:  subscriptionLastDaySlot     || 'both',
    });

    console.log('=== ACTIVE ORDER SAVED ===');
    console.log('orderId:', order._id);
    console.log('status:', order.status);
    console.log('==========================');

    // Notify vendor analytics dashboard in real-time
    try { const _io = req.app.get('io') || global.io; _io?.to(`vendor_${vendorId}`).emit('analytics_update'); _io?.to(`vendor_${vendorId}`).emit('new_order_placed'); } catch (_) {}

    const subscription = await Subscription.findOneAndUpdate(
      { sourceOrderId: order._id },
      {
        $setOnInsert: {
          userId: req.user._id,
          vendorId,
          planType,
          startDate: subscriptionStartDate,
          expiryDate: subscriptionExpiryDate,
          status: 'active',
          customerName: user.name,
          contact: user.phone,
          dietaryPref: altMainSubji || mealPref,
          sourceOrderId: order._id
        }
      },
      { upsert: true, new: true }
    );

user.expiryDate = subscriptionExpiryDate;
    await user.save();

    // Award loyalty points for new active subscription (fire-and-forget)
    // skipPoints if offer order; vendorId so vendor loyalty-off check runs inside
    awardSubscriptionPoints(req.user._id, planType, order._id, false, { skipPoints: !!order.isOfferOrder, vendorId })
      .catch(err => console.error('Loyalty points error (placeOrder active):', err));

    // FCM notifications (fire-and-forget)
    try {
      const { notifyOrderConfirmed: _notifyOC, notifyVendorNewOrder: _notifyVO } = require('../utils/fcmService');
      if (typeof _notifyOC === 'function') {
        _notifyOC(req.user._id, {
          planType, vendorName: vendor.kitchenName,
          startDate: subscriptionStartDate, orderId: order._id,
        }).catch(console.error);
      }
      if (vendor.ownerId && typeof _notifyVO === 'function') {
        _notifyVO(vendor.ownerId, user.name, planType, numericAmount).catch(console.error);
      }
    } catch (fcmErr) {
      console.error('FCM error in placeOrder active:', fcmErr.message);
    }

    // ===== REAL-TIME: Emit socket events for new order =====
    if (io) {
      // Delay 1.5 s before emitting — gives the frontend time to connect and
      // join its socket room, preventing the race condition where the event
      // fires before the client has joined (which would silently drop the event).
      setTimeout(() => {
        try {
          io.to(`vendor_${vendorId}`).emit('newOrder', {
            order: order,
            message: 'New order received!'
          });
          io.to('admin_room').emit('orderUpdate', {
            order: order,
            message: 'New order placed'
          });
          io.to(req.user._id.toString()).emit('subscription_updated', {
            type: 'order_placed',
            planType: order.planType
          });
          console.log('📡 Socket events emitted for new order');
        } catch (socketErr) {
          console.error('Socket emit error in placeOrder active:', socketErr.message);
        }
      }, 1500);
    }

    try {
      const slotInfo = getMealSlotInfo(subscriptionStartDate, new Date());
      const endFormatted = new Date(subscriptionExpiryDate).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      const emailSubject = `MealSetu — ${planType} Subscription Confirmed`;
      const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#f26522;padding:24px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="color:white;margin:0;font-size:22px">✅ Subscription Confirmed!</h1>
          </div>
          <div style="padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
            <p>Dear ${user.name},</p>
            <p>Your <strong>${planType}</strong> plan from <strong>${vendor.kitchenName}</strong> is confirmed.</p>
            <div style="background:${slotInfo.badgeBg};border-left:4px solid ${slotInfo.badgeColor};border-radius:8px;padding:16px;margin:16px 0">
              <p style="margin:0 0 6px 0;font-weight:700;color:${slotInfo.badgeColor};font-size:16px">${slotInfo.slotLabel}</p>
              <p style="margin:0 0 4px 0;color:#374151;font-size:14px">${slotInfo.startMessage}</p>
              <p style="margin:0;color:#64748b;font-size:13px">${slotInfo.mealMessage}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr style="background:#f8fafc">
                <td style="padding:10px 14px;font-weight:600;color:#374151">Plan</td>
                <td style="padding:10px 14px;color:#64748b">${planType}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-weight:600;color:#374151">Kitchen</td>
                <td style="padding:10px 14px;color:#64748b">${vendor.kitchenName}</td>
              </tr>
              <tr style="background:#f8fafc">
                <td style="padding:10px 14px;font-weight:600;color:#374151">Valid Until</td>
                <td style="padding:10px 14px;color:#64748b">${endFormatted}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-weight:600;color:#374151">Amount</td>
                <td style="padding:10px 14px;color:#64748b">₹${numericAmount}</td>
              </tr>
              <tr style="background:#f8fafc">
                <td style="padding:10px 14px;font-weight:600;color:#374151">Payment Method</td>
                <td style="padding:10px 14px;color:#64748b">${paymentMethod}</td>
              </tr>
            </table>
            <p style="color:#64748b;font-size:13px;text-align:center;margin-top:20px">Thank you for choosing MealSetu!</p>
          </div>
        </div>
      `;
      await sendEmail(user.email, emailSubject, emailHtml);
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
    }

    res.status(201).json({
      success: true,
      order,
      subscription,
      message: 'Order placed and subscription created successfully'
    });

  } catch (error) {
    console.error('Place order error:', error);
    res.status(500).json({ message: 'Error placing order', error: error.message });
  }
};

// ── Helper: recalculate and persist Vendor.rating + Vendor.reviewCount ──────
const updateVendorRating = async (vendorId) => {
  const agg = await Review.aggregate([
    { $match: { vendorId: new (require('mongoose').Types.ObjectId)(vendorId), isHidden: { $ne: true } } },
    { $group: { _id: null, avg: { $avg: '$rating' }, total: { $sum: 1 } } },
  ]);
  const avg   = agg.length ? Math.round(agg[0].avg * 10) / 10 : 0;
  const count = agg.length ? agg[0].total : 0;
  await Vendor.findByIdAndUpdate(vendorId, { rating: avg, reviewCount: count });
};

// @desc    Add or update review (one review per user per vendor)
// @route   POST /api/users/review
const addReview = async (req, res) => {
  try {
    const { vendorId, rating, comment, images } = req.body;

    // Validate rating
    const r = Number(rating);
    if (!r || r < 1 || r > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Must have at least one order from this vendor (any status)
    const qualifyingOrder = await Order.findOne({
      userId:   req.user._id,
      vendorId: vendorId,
      status:   { $in: ['active', 'trial', 'completed', 'expired', 'pending'] },
    }).sort({ orderDate: -1 });

    if (!qualifyingOrder) {
      return res.status(403).json({
        message: 'You must have placed an order from this vendor to leave a review',
      });
    }

    // Determine if verified purchase (completed / expired plan)
    const isVerifiedPurchase = ['completed', 'expired', 'active'].includes(qualifyingOrder.status);

    // Upsert — one review per userId+vendorId
    const existing = await Review.findOne({ userId: req.user._id, vendorId });
    let review;
    let isNew = false;

    if (existing) {
      existing.rating             = r;
      existing.comment            = comment || existing.comment;
      existing.images             = images  || existing.images;
      existing.isEdited           = true;
      existing.editedAt           = new Date();
      existing.isVerifiedPurchase = isVerifiedPurchase;
      existing.planType           = qualifyingOrder.planType || existing.planType;
      existing.mealDate           = qualifyingOrder.orderDate || existing.mealDate;
      await existing.save();
      review = existing;
    } else {
      review = await Review.create({
        userId:             req.user._id,
        vendorId,
        orderId:            qualifyingOrder._id,
        rating:             r,
        comment:            comment || '',
        images:             images  || [],
        customerName:       user.name || 'Anonymous',
        isVerifiedPurchase,
        planType:           qualifyingOrder.planType || '',
        mealDate:           qualifyingOrder.orderDate,
      });
      isNew = true;
    }

    // Recalculate vendor rating
    await updateVendorRating(vendorId);

    // Award loyalty points (fire-and-forget, only for new reviews)
    if (isNew) {
      awardReviewPoints(req.user._id)
        .catch(err => console.error('Loyalty points error (addReview):', err));
    }

    // Notify vendor about new review (fire-and-forget, only for new reviews)
    if (isNew) {
      const vendorDoc = await (require('../models/Vendor')).findById(vendorId).select('ownerId').lean();
      if (vendorDoc?.ownerId) {
        const { notifyVendorNewReview } = require('../utils/fcmService');
        notifyVendorNewReview(vendorDoc.ownerId, user.name, r).catch(console.error);
      }
    }

    res.status(isNew ? 201 : 200).json({ review, isNew });
  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({ message: 'Error adding review' });
  }
};

// @desc    Get Vendor Reviews (Amazon-style with analytics)
// @route   GET /api/users/vendor-reviews/:vendorId
const getVendorReviews = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    // Only visible reviews for public view
    const baseFilter = { vendorId, isHidden: { $ne: true } };

    // ── Analytics aggregation ─────────────────────────────────────────────
    const agg = await Review.aggregate([
      { $match: { vendorId: new (require('mongoose').Types.ObjectId)(vendorId), isHidden: { $ne: true } } },
      {
        $group: {
          _id:           null,
          avgRating:     { $avg: '$rating' },
          totalReviews:  { $sum: 1 },
          // Count as verified if isVerifiedPurchase=true OR orderId is set (backward compat with old reviews)
          verifiedCount: { $sum: { $cond: [
            { $or: [
              { $eq: ['$isVerifiedPurchase', true] },
              { $gt: ['$orderId', null] }
            ]},
            1, 0
          ]}},
          r1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          r2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          r3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          r4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          r5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        },
      },
    ]);

    const g     = agg[0] || {};
    const total = g.totalReviews || 0;
    const avg   = total ? Math.round((g.avgRating || 0) * 10) / 10 : 0;

    const ratingLabel = avg >= 4.5 ? 'Excellent' : avg >= 4.0 ? 'Very Good'
      : avg >= 3.5 ? 'Good' : avg >= 3.0 ? 'Average' : avg > 0 ? 'Poor' : 'No Reviews';

    const breakdown = { 5: g.r5 || 0, 4: g.r4 || 0, 3: g.r3 || 0, 2: g.r2 || 0, 1: g.r1 || 0 };
    const breakdownPercent = {};
    [5,4,3,2,1].forEach(s => {
      breakdownPercent[s] = total ? Math.round((breakdown[s] / total) * 100) : 0;
    });

    // ── Reviews list ──────────────────────────────────────────────────────
    const reviews = await Review.find(baseFilter)
      .sort({ helpfulCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const formattedReviews = reviews.map(rv => ({
      _id:                rv._id,
      user:               rv.customerName || 'Anonymous',
      rating:             rv.rating,
      comment:            rv.comment,
      images:             rv.images || [],
      isVerifiedPurchase: rv.isVerifiedPurchase,
      planType:           rv.planType,
      helpfulCount:       rv.helpfulCount || 0,
      isEdited:           rv.isEdited,
      date: new Date(rv.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      }),
      createdAt: rv.createdAt,
    }));

    res.json({
      analytics: {
        avgRating:        avg,
        totalReviews:     total,
        verifiedCount:    g.verifiedCount || 0,
        ratingLabel,
        breakdown,
        breakdownPercent,
      },
      reviews:    formattedReviews,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get vendor reviews error:', error);
    res.status(500).json({ message: 'Error fetching reviews' });
  }
};

// @desc    Get Vendor Rating
// @route   GET /api/users/vendor-rating/:vendorId
const getVendorRating = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const ratingAgg = await Review.aggregate([
      { $match: { vendorId: require('mongoose').Types.ObjectId.createFromHexString(vendorId) } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    const avgRating = ratingAgg.length > 0 ? Math.round(ratingAgg[0].avgRating * 10) / 10 : 0;
    const reviewCount = ratingAgg.length > 0 ? ratingAgg[0].count : 0;

    res.json({
      vendorId,
      rating: avgRating,
      reviewCount,
      hasReviews: reviewCount > 0
    });
  } catch (error) {
    console.error('Get vendor rating error:', error);
    res.status(500).json({ message: 'Error fetching vendor rating' });
  }
};

// @desc    Get Vendor Status
// @route   GET /api/users/vendor-status/:vendorId
const getVendorStatus = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    res.json({
      vendorId: vendor._id,
      kitchenName: vendor.kitchenName,
      isOpen: vendor.isOpen,
      closureStartDate: vendor.closureStartDate,
      closureEndDate: vendor.closureEndDate
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get All Approved Vendors
// @route   GET /api/users/vendors
const getApprovedVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find({
      isApproved: true
    }).select('kitchenName address pincode menuPrice rating workingDays timings profileImage kitchenPoster weeklyPlan trialEnabled trialFee latitude longitude upiId offersJainMenu jainWeeklyPlan deliveryEnabled _id');

    const vendorIds = vendors.map(v => v._id);

    // ✅ PRICING + JAIN MENU + REVIEW STATS — all in parallel
    const [pricingRecords, jainMenuRecords, reviewAgg] = await Promise.all([
      VendorPricing.find({ vendor_id: { $in: vendorIds } }),
      JainMenu.find({ vendor_id: { $in: vendorIds } }),
      Review.aggregate([
        { $match: { vendorId: { $in: vendorIds }, isHidden: { $ne: true } } },
        { $group: { _id: '$vendorId', count: { $sum: 1 }, avg: { $avg: '$rating' } } },
      ]),
    ]);

    const pricingByVendor = {};
    pricingRecords.forEach(record => {
      if (!pricingByVendor[record.vendor_id.toString()]) pricingByVendor[record.vendor_id.toString()] = [];
      pricingByVendor[record.vendor_id.toString()].push({
        type: record.plan_type,
        price: record.price,
        active: record.is_active
      });
    });

    const jainMenuByVendor = {};
    jainMenuRecords.forEach(record => {
      if (!jainMenuByVendor[record.vendor_id.toString()]) jainMenuByVendor[record.vendor_id.toString()] = [];
      jainMenuByVendor[record.vendor_id.toString()].push(record);
    });

    // Live review stats lookup
    const reviewStats = {};
    reviewAgg.forEach(r => {
      reviewStats[r._id.toString()] = {
        count: r.count,
        avg:   Math.round(r.avg * 10) / 10,
      };
    });

    const transformedVendors = vendors.map(vendor => {
      const activePricing = (pricingByVendor[vendor._id.toString()] || []).filter(p => p.active && p.price > 0);
      const rv = reviewStats[vendor._id.toString()];

      return {
        _id: vendor._id,
        vendorId: vendor._id,
        name: vendor.kitchenName,
        address: vendor.address,
        pincode: vendor.pincode || '',
        price: vendor.menuPrice || 80,
        rating:      rv ? rv.avg   : 0,   // 0 = no reviews yet
        reviewCount: rv ? rv.count : 0,   // live count from Review collection
        type: 'Regular',
        fssai: vendor.fssaiNumber || '',
        workingDays: vendor.workingDays || 'Mon - Sat',
        timings: vendor.timings || '11:00 AM - 09:00 PM',
        profileImage: vendor.profileImage ? transformProfilePic(vendor.profileImage, req.protocol, req.get('host')) : null,
        kitchenPoster: vendor.kitchenPoster ? transformProfilePic(vendor.kitchenPoster, req.protocol, req.get('host')) : null,
        pricing: activePricing,
        offersJainMenu: vendor.offersJainMenu || false,
        jainWeeklyPlan: vendor.jainWeeklyPlan || {},
        upiId: vendor.upiId || null,
        weeklyPlan: vendor.weeklyPlan,
        trialEnabled: vendor.trialEnabled === true,
        trialFee: vendor.trialFee || 0
      };
    });

    res.json(transformedVendors);
  } catch (error) {
    console.error('Error fetching approved vendors:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get Vendors By Pincode
// @route   GET /api/users/vendors-by-pincode
const getVendorsByPincode = async (req, res) => {
  try {
    const { pincode, userLat, userLon } = req.query;

    if (!pincode) {
      return res.status(400).json({ message: 'Pincode is required' });
    }

    const userLatitude = userLat ? parseFloat(userLat) : null;
    const userLongitude = userLon ? parseFloat(userLon) : null;

    function haversineDistance(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return Math.round(R * c * 10) / 10;
    }

    let vendors = await Vendor.find({
      isApproved: true,
      pincode: pincode
    }).select('kitchenName address pincode menuPrice rating workingDays timings profileImage kitchenPoster weeklyPlan trialEnabled trialFee latitude longitude upiId offersJainMenu jainWeeklyPlan deliveryEnabled _id');

    let locationNote = '';

    if (vendors.length === 0) {
      const prefix3 = pincode.slice(0, 3);
    vendors = await Vendor.find({
        isApproved: true,
        $expr: { $regexMatch: { input: '$pincode', regex: `^${prefix3}` } }
      }).select('kitchenName address pincode menuPrice rating workingDays timings profileImage kitchenPoster weeklyPlan trialEnabled trialFee latitude longitude upiId offersJainMenu jainWeeklyPlan deliveryEnabled _id');

      if (vendors.length === 0) {
    vendors = await Vendor.find({ isApproved: true })
      .select('kitchenName address pincode menuPrice rating workingDays timings profileImage kitchenPoster weeklyPlan trialEnabled trialFee latitude longitude upiId offersJainMenu jainWeeklyPlan deliveryEnabled _id');
        locationNote = 'Showing all available vendors — no vendors found in your exact area yet';
      } else {
        locationNote = `Found ${vendors.length} vendors near ${pincode} (area match)`;
      }
    } else {
      locationNote = `Showing ${vendors.length} vendors in ${pincode}`;
    }

    // ✅ OPTIMIZED pricing fetch (same as getMenus/getApprovedVendors)
    const vendorIds = vendors.map(v => v._id);
    const [pricingRecords, reviewAgg] = await Promise.all([
      VendorPricing.find({ vendor_id: { $in: vendorIds } }),
      // Live review count + avg rating — single aggregation for all vendors at once
      Review.aggregate([
        { $match: { vendorId: { $in: vendorIds }, isHidden: { $ne: true } } },
        { $group: { _id: '$vendorId', count: { $sum: 1 }, avg: { $avg: '$rating' } } },
      ]),
    ]);

    const pricingByVendor = {};
    pricingRecords.forEach(record => {
      if (!pricingByVendor[record.vendor_id.toString()]) {
        pricingByVendor[record.vendor_id.toString()] = [];
      }
      pricingByVendor[record.vendor_id.toString()].push({
        type: record.plan_type,
        price: record.price,
        active: record.is_active
      });
    });

    // Build lookup: vendorId → { count, avg }
    const reviewStats = {};
    reviewAgg.forEach(r => {
      reviewStats[r._id.toString()] = {
        count: r.count,
        avg:   Math.round(r.avg * 10) / 10,
      };
    });

    const transformedVendors = vendors.map(vendor => {
      const activePricing = (pricingByVendor[vendor._id.toString()] || []).filter(p => p.active && p.price > 0);
      const rv = reviewStats[vendor._id.toString()];
      let distanceKm = null;
      if (userLatitude && userLongitude && vendor.latitude && vendor.longitude) {
        distanceKm = haversineDistance(userLatitude, userLongitude, vendor.latitude, vendor.longitude);
      }

      return {
        _id: vendor._id,
        vendorId: vendor._id,
        name: vendor.kitchenName,
        address: vendor.address,
        pincode: vendor.pincode || '',
        price: vendor.menuPrice || 80,
        rating:      rv ? rv.avg   : 0,   // 0 = no reviews (shows "New" badge in app)
        reviewCount: rv ? rv.count : 0,   // live count from Review collection
        type: 'Regular',
        fssai: vendor.fssaiNumber || '',
        workingDays: vendor.workingDays || 'Mon - Sat',
        timings: vendor.timings || '11:00 AM - 09:00 PM',
        profileImage: vendor.profileImage ? transformProfilePic(vendor.profileImage, req.protocol, req.get('host')) : null,
        kitchenPoster: vendor.kitchenPoster ? transformProfilePic(vendor.kitchenPoster, req.protocol, req.get('host')) : null,
        upiId: vendor.upiId || null,
        weeklyPlan: vendor.weeklyPlan,
        trialEnabled: vendor.trialEnabled === true,
        trialFee: vendor.trialFee || 0,
        offersJainMenu:  vendor.offersJainMenu  || false,
        jainWeeklyPlan:  vendor.jainWeeklyPlan  || {},
        deliveryEnabled: vendor.deliveryEnabled  === true,
        pricing: activePricing,
        distanceKm,
        latitude: vendor.latitude,
        longitude: vendor.longitude
      };
    });

    res.json({
      vendors: transformedVendors,
      locationNote,
      matchedBy: vendors.length > 0 ? 'pincode' : 'fallback',
      totalCount: transformedVendors.length
    });
  } catch (error) {
    console.error('Error in getVendorsByPincode:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Check review eligibility
// @route   GET /api/users/review-eligibility/:vendorId
const checkReviewEligibility = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const userId = req.user._id;

    const anyOrder = await Order.findOne({
      userId: userId,
      vendorId: vendorId
    }).sort({ createdAt: -1 });

    if (anyOrder) {
      return res.json({
        canReview: true,
        hasOrdered: true,
        orderId: anyOrder._id,
        orderStatus: anyOrder.status,
        message: 'You can review this vendor!'
      });
    }

    return res.json({
      canReview: false,
      hasOrdered: false,
      orderId: null,
      orderStatus: null,
      message: 'You must have placed an order from this vendor to leave a review'
    });
  } catch (error) {
    console.error('Check review eligibility error:', error);
    res.status(500).json({ message: 'Error checking review eligibility' });
  }
};

// @desc    Mark a review as helpful (+1)
// @route   POST /api/users/review/:id/helpful
const markReviewHelpful = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { $inc: { helpfulCount: 1 } },
      { new: true }
    );
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json({ helpfulCount: review.helpfulCount });
  } catch (error) {
    console.error('Mark helpful error:', error);
    res.status(500).json({ message: 'Error marking review helpful' });
  }
};

// @desc    Flag a review (report inappropriate content)
// @route   POST /api/users/review/:id/flag
const flagReview = async (req, res) => {
  try {
    const { reason } = req.body;
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { isFlagged: true, flagReason: reason || 'Inappropriate content' },
      { new: true }
    );
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json({ message: 'Review flagged for moderation', reviewId: review._id });
  } catch (error) {
    console.error('Flag review error:', error);
    res.status(500).json({ message: 'Error flagging review' });
  }
};

// @desc    Get vendors where user has a recently-ended plan but hasn't reviewed yet
// @route   GET /api/users/pending-rating
const getPendingRating = async (req, res) => {
  try {
    const userId = req.user._id;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Orders that ended in the last 7 days
    const recentOrders = await Order.find({
      userId,
      status:    { $in: ['completed', 'expired'] },
      endDate:   { $gte: sevenDaysAgo },
    }).sort({ endDate: -1 }).lean();

    if (!recentOrders.length) return res.json([]);

    // Vendors the user has already reviewed
    const reviewedVendorIds = (await Review.find({ userId }, 'vendorId').lean())
      .map(r => r.vendorId.toString());

    // Unique vendor IDs not yet reviewed
    const seen = new Set();
    const pending = recentOrders.filter(o => {
      const vid = o.vendorId.toString();
      if (seen.has(vid) || reviewedVendorIds.includes(vid)) return false;
      seen.add(vid);
      return true;
    });

    const vendorIds  = pending.map(o => o.vendorId);
    const vendorDocs = await Vendor.find({ _id: { $in: vendorIds } }, 'kitchenName profileImage').lean();
    const vendorMap  = Object.fromEntries(vendorDocs.map(v => [v._id.toString(), v]));

    const result = pending.map(o => ({
      orderId:     o._id,
      vendorId:    o.vendorId,
      kitchenName: vendorMap[o.vendorId.toString()]?.kitchenName || 'Unknown',
      profileImage: vendorMap[o.vendorId.toString()]?.profileImage || null,
      planType:    o.planType,
      endDate:     o.endDate,
    }));

    res.json(result);
  } catch (error) {
    console.error('Get pending rating error:', error);
    res.status(500).json({ message: 'Error fetching pending ratings' });
  }
};

// @desc    Get trial eligibility
// @route   GET /api/users/trial-eligibility/:vendorId
const getTrialEligibility = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    if (!vendor.trialEnabled) {
      return res.json({
        eligible: false,
        reason: 'trial_not_available',
        message: 'This vendor does not offer trials'
      });
    }

    // Check trialHistory array on User document.
    const hasUsedTrialHistory = user.trialHistory && user.trialHistory.some(
      trial => trial.vendorId && trial.vendorId.toString() === vendorId
    );

    // Belt-and-braces: also check the Order table.
    // If user.save() ever failed while creating the trial, trialHistory may be
    // empty even though an Order record exists — this covers that edge case.
    const existingTrialOrder = await Order.findOne({
      userId,
      vendorId,
      planType: 'Trial'
    }).lean();

    if (hasUsedTrialHistory || existingTrialOrder) {
      return res.json({
        eligible: false,
        reason: 'trial_already_used',
        message: 'You have already used a trial for this vendor',
        trialFee: vendor.trialFee || 0
      });
    }

    return res.json({
      eligible: true,
      trialFee: vendor.trialFee || 0,
      message: vendor.trialFee > 0 ? `Trial available for ₹${vendor.trialFee}` : 'Free trial available'
    });
  } catch (error) {
    console.error('Get trial eligibility error:', error);
    res.status(500).json({ message: 'Error checking trial eligibility' });
  }
};

// @desc    Get active subscription status
// @route   GET /api/users/subscription-status
const getActiveSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeSubscription = await Subscription.findOne({
      userId: userId,
      status: 'active',
      expiryDate: { $gt: today }
    }).populate('vendorId', 'kitchenName');

    if (activeSubscription) {
      return res.json({
        hasActivePlan: true,
        planType: activeSubscription.planType,
        startDate: activeSubscription.startDate,
        endDate: activeSubscription.expiryDate,
        vendorName: activeSubscription.vendorId?.kitchenName || 'Unknown Vendor'
      });
    }

    const activeOrder = await Order.findOne({
      userId: userId,
      status: { $in: ['active', 'trial'] },
      endDate: { $gt: today }
    }).sort({ createdAt: -1 }).populate('vendorId', 'kitchenName');

    if (activeOrder) {
      return res.json({
        hasActivePlan: true,
        planType: activeOrder.planType,
        startDate: activeOrder.startDate,
        endDate: activeOrder.endDate,
        vendorName: activeOrder.vendorId?.kitchenName || 'Unknown Vendor'
      });
    }

    return res.json({
      hasActivePlan: false,
      planType: null,
      startDate: null,
      endDate: null,
      vendorName: null
    });
  } catch (error) {
    console.error('Get active subscription status error:', error);
    res.status(500).json({ message: 'Error checking subscription status', error: error.message });
  }
};

// @desc    Create a trial order
// @route   POST /api/users/trial
const createTrialOrder = async (req, res) => {
  try {
    const { vendorId, paymentMethod = 'Cash', mealPreference = 'Regular' } = req.body;

    console.log('Trial order request received:', { vendorId, paymentMethod, mealPreference, userId: req.user?._id });

    if (!vendorId) return res.status(400).json({ message: 'vendorId is required' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    if (!vendor.trialEnabled) {
      return res.status(400).json({ message: 'This vendor does not offer trials' });
    }

    // ── Duplicate trial check — trialHistory + Order table (belt-and-braces) ──
    // user.save() can fail when the User document has a field with an invalid
    // enum value (e.g. gender: ''), which would skip saving trialHistory even
    // after a successful order creation.  Checking the Order table as a fallback
    // ensures the button goes grey even if trialHistory was never persisted.
    const hasUsedTrialHistory = user.trialHistory && user.trialHistory.some(
      trial => trial.vendorId && trial.vendorId.toString() === vendorId
    );
    const existingTrialOrder = await Order.findOne({
      userId: req.user._id,
      vendorId,
      planType: 'Trial'
    }).lean();

    if (hasUsedTrialHistory || existingTrialOrder) {
      return res.status(403).json({ message: 'You have already used a trial for this vendor' });
    }

    const trialFee = vendor.trialFee || 0;
    const { startDate, endDate, mealSlotToday } = computeSubscriptionDates(
      getPlanDurationDays('Trial')
    );

    let paymentStatus = 'Pending';
    if (trialFee === 0) {
      paymentStatus = 'Paid';    // free trial — no payment needed, mark as settled
    } else {
      paymentStatus = paymentMethod === 'UPI' ? 'Paid' : 'Pending';
    }

    let order;
    try {
      order = await Order.create({
        userId: req.user._id,
        vendorId,
        customerName: user.name,
        mealPreference,
        deliverySlot: 'Lunch',
        planType: 'Trial',
        amount: trialFee,
        paymentStatus,
        paymentMethod: trialFee > 0 ? paymentMethod : 'Free',
        startDate,
        endDate,
        firstDayMealSlot: mealSlotToday || 'both',
        orderStatus: 'Preparing'
      });
      console.log('Trial order created successfully:', order._id);
      // Notify vendor analytics dashboard in real-time
      try { const _io = req.app.get('io') || global.io; _io?.to(`vendor_${vendorId}`).emit('analytics_update'); _io?.to(`vendor_${vendorId}`).emit('new_order_placed'); } catch (_) {}
    } catch (orderError) {
      console.error('Error creating trial order:', orderError.message);
      return res.status(500).json({ message: 'Error creating trial order: ' + orderError.message });
    }

    let subscription;
    try {
      subscription = await Subscription.create({
        userId: req.user._id,
        vendorId,
        planType: 'Trial',
        startDate,
        expiryDate: endDate,
        status: 'active',
        customerName: user.name,
        contact: user.phone,
        dietaryPref: mealPreference
      });
    } catch (subError) {
      console.error('Error creating trial subscription:', subError.message);
    }

    // ── Persist trialHistory with $push to bypass Mongoose document-level
    // validators (e.g. enum on gender: '').  Using findByIdAndUpdate with $push
    // is atomic and does NOT run schema validators on unrelated fields.
    try {
      await User.findByIdAndUpdate(
        req.user._id,
        { $push: { trialHistory: { vendorId, trialTakenAt: new Date() } } }
      );
    } catch (histErr) {
      // Non-fatal — order was already created; log and continue.
      console.error('trialHistory update failed (non-fatal):', histErr.message);
    }

    try {
      const slotInfo = getMealSlotInfo(startDate, new Date());
      const endFormatted = new Date(endDate).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      const emailSubject = 'MealSetu — Your 2-Day Trial is Activated!';
      const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#16a34a;padding:24px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="color:white;margin:0;font-size:22px">🎉 Trial Activated!</h1>
          </div>
          <div style="padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
            <p>Dear ${user.name},</p>
            <p>Your 2-day trial from <strong>${vendor.kitchenName}</strong> has been activated!</p>
            <div style="background:${slotInfo.badgeBg};border-left:4px solid ${slotInfo.badgeColor};border-radius:8px;padding:16px;margin:16px 0">
              <p style="margin:0 0 6px 0;font-weight:700;color:${slotInfo.badgeColor};font-size:16px">${slotInfo.slotLabel}</p>
              <p style="margin:0 0 4px 0;color:#374151;font-size:14px">${slotInfo.startMessage}</p>
              <p style="margin:0;color:#64748b;font-size:13px">${slotInfo.mealMessage}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr style="background:#f8fafc">
                <td style="padding:10px 14px;font-weight:600;color:#374151">Kitchen</td>
                <td style="padding:10px 14px;color:#64748b">${vendor.kitchenName}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-weight:600;color:#374151">Trial Ends</td>
                <td style="padding:10px 14px;color:#64748b">${endFormatted}</td>
              </tr>
              <tr style="background:#f8fafc">
                <td style="padding:10px 14px;font-weight:600;color:#374151">Trial Fee</td>
                <td style="padding:10px 14px;color:#64748b">${trialFee > 0 ? `₹${trialFee}` : 'FREE'}</td>
              </tr>
            </table>
            <p style="color:#64748b;font-size:13px;text-align:center;margin-top:20px">Thank you for choosing MealSetu!</p>
          </div>
        </div>
      `;
      await sendEmail(user.email, emailSubject, emailHtml);
    } catch (emailError) {
      console.error('Failed to send trial confirmation email:', emailError);
    }
    const { notifyTrialConfirmed } = require('../utils/fcmService');
    notifyTrialConfirmed(req.user._id, vendor.kitchenName, order._id).catch(console.error);

    // Socket.IO is fire-and-forget — any emit error must NOT reach the outer
    // catch block, because by this point the order, subscription, and
    // trialHistory have all been saved successfully.
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(req.user._id.toString()).emit('subscription_updated', {
          type: 'trial_started',
          message: 'Your trial is now active!'
        });
        io.to(`vendor_${vendorId}`).emit('new_order', {
          type: 'trial_order',
          message: 'New trial order received'
        });
      }
    } catch (ioError) {
      // Non-fatal — order was already persisted; just log and continue.
      console.error('Socket.IO emit error (non-fatal):', ioError.message);
    }

    res.status(201).json({
      message: 'Trial order created successfully',
      order,
      subscription,
      trialDetails: {
        vendorName: vendor.kitchenName,
        startDate,
        endDate,
        trialFee,
        isFree: trialFee === 0
      }
    });
  } catch (error) {
    console.error('Create trial order error:', error.message);
    res.status(500).json({ message: 'Error creating trial order', error: error.message });
  }
};

// @desc    Get this user's cash payment orders
// @route   GET /api/users/my-cash-payments
const getMyCashPayments = async (req, res) => {
  try {
    const orders = await Order.find({
      userId: req.user._id,
      paymentMethod: 'Cash'
    })
      .populate('vendorId', 'kitchenName address')
      .sort({ orderDate: -1 });

    const mapped = orders.map(order => ({
      orderId: order._id,
      planType: order.planType,
      amount: order.amount,
      orderDate: order.orderDate,
      paymentStatus: order.paymentStatus,
      cashPaymentConfirmedAt: order.cashPaymentConfirmedAt || null,
      vendorName: order.vendorId?.kitchenName || 'Partner Kitchen',
      startDate: order.startDate,
      endDate: order.endDate
    }));

    res.json(mapped);
  } catch (error) {
    console.error('getMyCashPayments error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get current user's active subscription order
// @route   GET /api/orders/my-subscription
// FIX 2: Fixed to properly return active orders where startDate has already started
const getMySubscription = async (req, res) => {
  try {
    const userId = req.user._id;

    // Fix any race-condition duplicate active orders first
    await healDuplicateActiveOrders(userId);

    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const tomorrowMidnight = new Date(now);
    tomorrowMidnight.setUTCDate(tomorrowMidnight.getUTCDate() + 1);

    let activeOrder = await Order.findOne({
      userId: userId,
      status: { $in: ['active', 'trial'] },
      startDate: { $lt: tomorrowMidnight },
      endDate: { $gte: now }
    })
      .populate('vendorId', 'kitchenName')
      .sort({ createdAt: -1 });

    let startsTomorrow = false;

    if (!activeOrder) {
      const tomorrowStart = new Date();
      tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
      tomorrowStart.setUTCHours(0, 0, 0, 0);

      const tomorrowEnd = new Date(tomorrowStart);
      tomorrowEnd.setUTCHours(23, 59, 59, 999);

      activeOrder = await Order.findOne({
        userId,
        status:    { $in: ['active', 'pending'] },
        startDate: { $gte: tomorrowStart, $lte: tomorrowEnd }
      }).populate('vendorId', 'kitchenName');

      console.log('=== PENDING ORDER QUERY ===', {
        tomorrowStart: tomorrowStart.toISOString(),
        tomorrowEnd:   tomorrowEnd.toISOString(),
        foundOrder:    !!activeOrder,
        orderId:       activeOrder?._id,
        orderStatus:   activeOrder?.status,
        orderStart:    activeOrder?.startDate,
      });

      if (activeOrder) startsTomorrow = true;
    }

    if (!activeOrder) return res.json(null);

    // Fetch subscription record — also the source-of-truth for expiryDate after leaves
    const activeSub = await Subscription.findOne({
      userId,
      status: { $in: ['active', 'pending'] }
    }).sort({ createdAt: -1 });
    const leavesUsed = activeSub?.leavesUsed || 0;

    // If the subscription has a later expiryDate (due to leaves), use that.
    // This keeps Order.endDate and Subscription.expiryDate in sync on the response.
    const effectiveEndDate = (activeSub?.expiryDate && new Date(activeSub.expiryDate) > new Date(activeOrder.endDate))
      ? activeSub.expiryDate
      : activeOrder.endDate;

    // ✅ Fetch vendor pricing for frontend dynamic plan rendering
    const vendorPricingRecords = await VendorPricing.find({
      vendor_id: activeOrder.vendorId._id,
      is_active: true
    });

    const pricing = vendorPricingRecords
      .filter(p => p.price > 0)
      .map(p => ({ type: p.plan_type, price: p.price }));

    console.log('=== getMySubscription RESPONSE ===', JSON.stringify({
      hasOrder:        !!activeOrder,
      orderStatus:     activeOrder?.status,
      orderStart:      activeOrder?.startDate,
      startsTomorrow,
      currentPlanKeys: activeOrder ? Object.keys(activeOrder.toObject ? activeOrder.toObject() : activeOrder) : null
    }, null, 2));

    res.json({
      planType: activeOrder.planType,
      startDate: activeOrder.startDate,
      endDate: effectiveEndDate,
      orderDate: activeOrder.orderDate,
      status: 'active',
      vendorId: activeOrder.vendorId?._id,
      vendorName: activeOrder.vendorId?.kitchenName || 'Partner Kitchen',
      amount: activeOrder.amount,
      paymentMethod: activeOrder.paymentMethod,
      paymentStatus: activeOrder.paymentStatus,
      cashPaymentConfirmedAt: activeOrder.cashPaymentConfirmedAt || null,
      orderId: activeOrder._id,
      firstDayMealSlot: activeOrder.firstDayMealSlot || 'both',
      lastDayMealSlot:  activeOrder.lastDayMealSlot  || 'both',
      pricing,
      startsTomorrow,
      leavesUsed,
      leavesAllowed: 2,
      leaveDates: (activeSub?.leaveDates || []).map(l => ({
        startDate: l.startDate,
        endDate: l.endDate
      }))
    });
  } catch (error) {
    console.error('Get my subscription error:', error);
    res.status(500).json({ message: 'Error getting subscription', error: error.message });
  }
};

// @desc    Get upcoming (pending) orders
// @route   GET /api/orders/upcoming
// FIX 3: Add date filter so only truly future pending orders show as upcoming
const getUpcomingOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    const upcomingOrders = await Order.find({
      userId: userId,
      status: 'pending',
      startDate: { $gte: now }
    })
      .populate('vendorId', 'kitchenName')
      .sort({ startDate: 1 });

    const formattedOrders = upcomingOrders.map(order => ({
      _id: order._id,
      planType: order.planType,
      vendorId: order.vendorId?._id,
      vendorName: order.vendorId?.kitchenName || 'Partner Kitchen',
      scheduledStartDate: order.scheduledStartDate || order.scheduledActivationDate,
      scheduledEndDate: order.scheduledEndDate || order.endDate,
      amount: order.amount,
      status: order.status || order.offerStatus,
      isOfferOrder: order.isOfferOrder
    }));

    res.json(formattedOrders);
  } catch (error) {
    console.error('Get upcoming orders error:', error);
    res.status(500).json({ message: 'Error getting upcoming orders', error: error.message });
  }
};

// FIX 4: One-time fix for already broken orders in database
// This function finds orders stuck as pending where startDate <= today
// and activates them if user has no other active order
const fixStuckOrders = async () => {
  try {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    console.log('🔧 Running fixStuckOrders...');

    // Find orders stuck as pending where startDate <= today
    const stuckOrders = await Order.find({
      status: 'pending',
      startDate: { $lte: now }
    });

    console.log(`📋 Found ${stuckOrders.length} stuck orders to check`);

    for (const order of stuckOrders) {
      try {
        // Check if user already has an active order
        const hasActive = await Order.findOne({
          userId: order.userId,
          status: 'active',
          endDate: { $gte: now },
          _id: { $ne: order._id }
        });

        if (!hasActive) {
          // Activate using the stored startDate (honours any closure-shifted dates)
          const DURATION_MAP = { Weekly: 7, Monthly: 30, Trial: 1, Tiffin: 1 };
          const durationDays = DURATION_MAP[order.planType] ?? 7;
          const honouredStart = new Date(order.startDate);
          honouredStart.setUTCHours(0, 0, 0, 0);
          const honouredEnd = new Date(honouredStart);
          honouredEnd.setUTCDate(honouredEnd.getUTCDate() + durationDays);

          order.status = 'active';
          order.startDate = honouredStart;
          order.endDate = honouredEnd;
          await order.save();

          console.log('✅ Fixed stuck order:', order._id);
        }
      } catch (orderError) {
        console.error(`❌ Error fixing stuck order ${order._id}:`, orderError);
      }
    }

    console.log('✅ fixStuckOrders completed');
  } catch (error) {
    console.error('❌ fixStuckOrders error:', error);
  }
};

// API endpoint to manually trigger fixStuckOrders
const runFixStuckOrders = async (req, res) => {
  try {
    await fixStuckOrders();
    res.json({ message: 'Stuck orders fixed successfully' });
  } catch (error) {
    console.error('Error running fixStuckOrders:', error);
    res.status(500).json({ message: 'Error fixing stuck orders', error: error.message });
  }
};

// @desc    Extend subscription (create pending order)
// @route   POST /api/orders/extend
const extendSubscriptionOrder = async (req, res) => {
  console.log('=== EXTEND SUBSCRIPTION API CALLED ===');
  console.log('userId:', req.user._id);
  console.log('vendorId:', req.body?.vendorId);
  console.log('planType:', req.body?.plan);
  console.log('timestamp:', new Date().toISOString());
  console.log('=====================================');

  try {
    const userId = req.user._id;

    const pendingCount = await getPendingPlansCount(userId);
    if (pendingCount >= 3) {
      return res.status(400).json({
        message: 'You have reached the maximum limit of 3 upcoming plan extensions.'
      });
    }

    const { plan, vendorId, paymentMethod = 'Cash', walletDeduction = 0 } = req.body;

    if (!plan || !vendorId) {
      return res.status(400).json({ message: 'Plan and vendorId are required' });
    }

    let durationDays = 7;
    let planType = 'Weekly';
    let amount = 0;

    switch (plan) {
      case 'WEEKLY':
        durationDays = 7;
        planType = 'Weekly';
        break;
      case 'MONTHLY':
        durationDays = 30;
        planType = 'Monthly';
        break;
      case 'ONEDAY':
        durationDays = 1;
        planType = 'Trial';
        amount = 80;
        break;
      default:
        return res.status(400).json({ message: 'Invalid plan type' });
    }

    // ✅ Dynamic pricing from VendorPricing (WEEKLY/MONTHLY) to avoid hardcoded amounts
    if (planType === 'Weekly' || planType === 'Monthly') {
      const pricingRecord = await VendorPricing.findOne({
        vendor_id: vendorId,
        plan_type: planType.toLowerCase(),
        is_active: true
      });

      if (!pricingRecord || pricingRecord.price <= 0) {
        return res.status(400).json({
          message: 'Pricing not configured for this vendor. Please contact support.'
        });
      }

      amount = pricingRecord.price;
    }

    // NOTE: ONEDAY/TRIAL amount is kept as existing behavior (₹80)


    // Duplicate check - prevent duplicate orders within 30 seconds
    const thirtySecondsAgo = new Date(Date.now() - 30000);
    const duplicateOrder = await Order.findOne({
      userId: userId,
      vendorId: vendorId,
      planType: planType,
      status: 'pending',
      createdAt: { $gte: thirtySecondsAgo }
    });

    if (duplicateOrder) {
      return res.status(409).json({ message: 'duplicate order detected' });
    }

    const existingPendingOrders = await Order.find({
      userId: userId,
      status: 'pending'
    }).sort({ scheduledEndDate: -1 });

    let scheduledStartDate;

    if (existingPendingOrders && existingPendingOrders.length > 0) {
      const lastScheduledEndDate = new Date(existingPendingOrders[0].scheduledEndDate);
      scheduledStartDate = new Date(lastScheduledEndDate.getTime() + 86400000);
    } else {
      const now = new Date();
      now.setUTCHours(0, 0, 0, 0);

      const activeOrder = await Order.findOne({
        userId: userId,
        status: 'active',
        endDate: { $gte: now }
      });

      if (activeOrder && activeOrder.endDate) {
        // Use the later of Order.endDate or Subscription.expiryDate (leaves extend Subscription)
        const activeSub = await Subscription.findOne({ userId: userId, status: 'active' });
        const orderEnd = new Date(activeOrder.endDate);
        const subEnd   = activeSub?.expiryDate ? new Date(activeSub.expiryDate) : orderEnd;
        const activeEnd = subEnd > orderEnd ? subEnd : orderEnd;
        activeEnd.setUTCHours(0, 0, 0, 0);
        scheduledStartDate = new Date(activeEnd.getTime() + 86400000);
      } else {
        scheduledStartDate = new Date(now);
        scheduledStartDate.setUTCDate(scheduledStartDate.getUTCDate() + 1);
      }
    }

    const scheduledEndDate = new Date(scheduledStartDate.getTime() + durationDays * 86400000);

    const user = await User.findById(userId);
    const vendor = await Vendor.findById(vendorId);

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const paymentStatus = paymentMethod === 'UPI' ? 'Paid' : 'Pending';

    // ── Wallet guard (before order creation to store walletDeduction on order) ──
    const VendorModel = require('../models/Vendor');
    let walletApplied = Number(walletDeduction) || 0;
    if (walletApplied > 0 && paymentMethod === 'UPI') {
      const vendorForWallet = await VendorModel.findById(vendorId)
        .select('loyaltyDiscountsEnabled walletCapPercent');

      // Check if user already has an active sub at this vendor (before any opt-out check)
      const activeSubCheck = await Order.findOne({
        userId:   userId,
        vendorId: vendorId,
        status:   'active'
      });

      if (vendorForWallet && vendorForWallet.loyaltyDiscountsEnabled === false) {
        // Vendor opted out — but protect existing active loyal subscribers
        if (!activeSubCheck) {
          walletApplied = 0; // new subscriber → vendor's opt-out applies
          console.log(`Wallet blocked — vendor opted out and no active sub for user ${userId}`);
        }
        // else: existing loyal subscriber — wallet is honoured even though vendor opted out
      }

      if (walletApplied > 0) {
        const capPct = vendorForWallet?.walletCapPercent ?? 20;
        const maxCap = Math.floor(amount * capPct / 100);
        walletApplied = Math.min(walletApplied, amount, maxCap);

        if (walletApplied > 0) {
          if (activeSubCheck) {
            await User.findByIdAndUpdate(userId, { $inc: { wallet: -walletApplied } });
            console.log(`Wallet deducted ₹${walletApplied} for user ${userId} (vendor: ${vendorId})`);
          } else {
            walletApplied = 0; // no active sub with vendor — skip
            console.log(`Wallet deduction skipped — no active sub with vendor ${vendorId}`);
          }
        }
      }
    }

    const order = await Order.create({
      userId: userId,
      vendorId,
      customerName: user.name,
      amount: amount,
      walletDeduction: walletApplied,
      deliverySlot: 'Lunch',
      mealPreference: 'Regular',
      paymentStatus: paymentStatus,
      paymentMethod: paymentMethod,
      planType: planType,
      status: 'pending',
      scheduledStartDate: scheduledStartDate,
      scheduledEndDate: scheduledEndDate,
      startDate: scheduledStartDate,
      endDate: scheduledEndDate
    });

    // Notify vendor analytics dashboard in real-time
    try { const _io = req.app.get('io') || global.io; _io?.to(`vendor_${vendorId}`).emit('analytics_update'); _io?.to(`vendor_${vendorId}`).emit('new_order_placed'); } catch (_) {}

    console.log('=== EXTEND SUBSCRIPTION ORDER SAVED ===');
    console.log('orderId:', order._id);
    console.log('status:', order.status);
    console.log('walletDeduction:', walletApplied);
    console.log('scheduledStartDate:', order.scheduledStartDate);
    console.log('scheduledEndDate:', order.scheduledEndDate);
    console.log('=========================================');

    // ── Award loyalty points for subscription renewal (fire-and-forget) ──────
    // isRenewal = true (this is always an extension of an existing subscription)
    // vendorId is passed so awardSubscriptionPoints can skip if vendor has loyalty OFF
    awardSubscriptionPoints(userId, planType, order._id, true, { skipPoints: false, vendorId })
      .catch(err => console.error('[extendSubscriptionOrder] Loyalty points error:', err.message));

    try {
      const emailSubject = 'MealSetu - Subscription Extended Successfully!';
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #16a34a;">✅ Subscription Extended!</h1>
          <p>Dear ${user.name},</p>
          <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px solid #16a34a;">
            <p><strong>Vendor:</strong> ${vendor.kitchenName}</p>
            <p><strong>Plan Type:</strong> ${planType}</p>
            <p><strong>Amount:</strong> ₹${amount}</p>
            <p><strong>Scheduled Start:</strong> ${scheduledStartDate.toLocaleDateString('en-IN')}</p>
            <p><strong>Scheduled End:</strong> ${scheduledEndDate.toLocaleDateString('en-IN')}</p>
            <p><strong>Duration:</strong> ${durationDays} days</p>
          </div>
          <hr/>
          <p style="color: #999; font-size: 12px;">Thank you for choosing MealSetu!</p>
        </div>
      `;
      await sendEmail(user.email, emailSubject, emailHtml);
    } catch (emailError) {
      console.error('Failed to send extension confirmation email:', emailError.message);
    }

    const populatedOrder = await Order.findById(order._id).populate('vendorId', 'kitchenName');
    const { notifySubscriptionExtended: _notifySE } = require('../utils/fcmService');
    _notifySE(userId, populatedOrder.vendorId?.kitchenName || 'MealSetu', planType, scheduledEndDate).catch(console.error);

    res.status(201).json({
      message: 'Subscription extended successfully',
      order: {
        _id: populatedOrder._id,
        planType: populatedOrder.planType,
        vendorId: populatedOrder.vendorId._id,
        vendorName: populatedOrder.vendorId.kitchenName,
        scheduledStartDate: populatedOrder.scheduledStartDate,
        scheduledEndDate: populatedOrder.scheduledEndDate,
        amount: populatedOrder.amount,
        status: populatedOrder.status
      }
    });
  } catch (error) {
    console.error('Extend subscription order error:', error);
    res.status(500).json({ message: 'Error extending subscription', error: error.message });
  }
};

// @desc    Check subscription payment status  
// @route   GET /api/users/orders/:orderId/payment-status
const checkSubscriptionPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId).populate('vendorId', 'kitchenName upiId');
    if (!order) {
      return res.status(404).json({ paid: false, message: 'Order not found' });
    }

    const orderAgeSeconds = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 1000);

    // Timeout after 5 minutes (300 seconds)
    if (orderAgeSeconds > 300) {
      return res.json({ 
        paid: false, 
        timeout: true, 
        message: 'Payment not received. Please try again.' 
      });
    }

    // Verified by webhook or admin action
    if (order.paymentStatus === 'Verified') {
      return res.json({ paid: true, message: 'Payment verified' });
    }

    // Still within the 5-minute window — awaiting real payment confirmation
    return res.json({
      paid: false,
      timeout: false,
      message: 'Awaiting payment...'
    });

  } catch (error) {
    console.error('Payment status check error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getVendorPricingForUser = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const vendor = await Vendor.findById(vendorId)
      .select('kitchenName upiId');

    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    const pricingRecords = await VendorPricing.find({
      vendor_id: vendorId,
      is_active: true
    });

    const pricing = pricingRecords
      .filter(p => p.price > 0)
      .map(p => ({ type: p.plan_type, price: p.price }));

    res.json({
      vendorId: vendor._id,
      vendorName: vendor.kitchenName,
      upiId: vendor.upiId || null,
      pricing
    });
  } catch (error) {
    console.error('Get vendor pricing error:', error);
    res.status(500).json({
      message: 'Error fetching vendor pricing',
      error: error.message
    });
  }
};

// @desc    Create Razorpay order for subscription payment
// @route   POST /api/users/payment/create-order
const createRazorpayOrder = async (req, res) => {
  try {
    const razorpay = require('../utils/razorpayUtils');
    const { amount, vendorId, plan, mealPreference, walletDeduction = 0 } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    // ── Wallet guard: vendor opt-out + same-vendor renewal check + per-order cap ──
    let walletApplied = Number(walletDeduction) || 0;
    let walletBlockedReason = null; // surfaced back to client for UI message
    if (walletApplied > 0 && vendorId) {
      const VendorModel = require('../models/Vendor');
      const vendor = await VendorModel.findById(vendorId)
        .select('loyaltyDiscountsEnabled walletCapPercent');

      if (vendor && vendor.loyaltyDiscountsEnabled === false) {
        // Vendor opted out — BUT protect existing active loyal subscribers.
        // If user already has an active subscription at this vendor they earned these
        // credits here, so we honour the wallet for renewals.
        const hasActiveSub = await Order.findOne({
          userId:   req.user._id,
          vendorId: vendorId,
          status:   'active'
        });
        if (!hasActiveSub) {
          // New subscriber at this vendor — vendor's opt-out applies
          walletApplied = 0;
          walletBlockedReason = 'vendor_opted_out';
        }
        // else: existing loyal subscriber — wallet allowed despite opt-out
        // (still apply cap below)
      }

      if (walletApplied > 0) {
        // Cap: max walletCapPercent% of order value (default 20%)
        const capPct = vendor?.walletCapPercent ?? 20;
        const maxCap = Math.floor(amount * capPct / 100);
        walletApplied = Math.min(walletApplied, amount, maxCap);

        // Same-vendor renewal check (only for vendors who HAVE loyalty enabled —
        // already handled above for opted-out vendors)
        if (walletApplied > 0 && vendor?.loyaltyDiscountsEnabled !== false) {
          const hasActiveSubWithVendor = await Order.findOne({
            userId:   req.user._id,
            vendorId: vendorId,
            status:   'active'
          });
          if (!hasActiveSubWithVendor) {
            walletApplied = 0;
            walletBlockedReason = 'no_active_sub'; // new vendor — wallet not applicable
          }
        }
      }
    }
    const finalAmount = Math.max(1, amount - walletApplied); // min ₹1 for Razorpay

    const razorpayOrder = await razorpay.orders.create({
      amount:   Math.round(finalAmount * 100),
      currency: 'INR',
      receipt:  `r_${Date.now()}`,
      notes: {
        userId:          req.user._id.toString(),
        vendorId:        vendorId,
        plan:            plan,
        mealPreference:  mealPreference || 'Regular',
        walletDeduction: walletApplied.toString()
      }
    });

    res.json({
      orderId:             razorpayOrder.id,
      amount:              razorpayOrder.amount,   // in paise, already reduced
      currency:            razorpayOrder.currency,
      keyId:               process.env.RAZORPAY_KEY_ID,
      walletDeduction:     walletApplied,          // echo back so client can display it
      walletBlockedReason: walletBlockedReason     // null | 'vendor_opted_out' | 'no_active_sub'
    });
  } catch (error) {
    console.error('Create Razorpay order error:', error);
    res.status(500).json({ message: 'Payment initiation failed', error: error.message });
  }
};

// @desc    Verify Razorpay payment + activate subscription
// @route   POST /api/users/payment/verify
const verifyUserPayment = async (req, res) => {
  try {
    const crypto = require('crypto');
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      vendorId,
      plan,
      amount,
      mealPreference,
      deliverySlot
    } = req.body;

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: 'Payment verification failed. Invalid signature.' });
    }

    // Read wallet deduction from Razorpay order notes (set in createRazorpayOrder)
    let walletUsed = 0;
    try {
      const razorpay   = require('../utils/razorpayUtils');
      const rzpOrder   = await razorpay.orders.fetch(razorpay_order_id);
      walletUsed = Number(rzpOrder?.notes?.walletDeduction) || 0;
    } catch (rzpErr) {
      console.error('[verifyPayment] Could not fetch Razorpay order notes:', rzpErr.message);
      // Non-fatal — proceed without wallet info
    }

    const PLAN_MAP = {
      'ONEDAY':  'Trial',   'Trial':   'Trial',   'trial':   'Trial',
      'WEEKLY':  'Weekly',  'Weekly':  'Weekly',  'weekly':  'Weekly',
      'MONTHLY': 'Monthly', 'Monthly': 'Monthly', 'monthly': 'Monthly'
    };
    const planType     = PLAN_MAP[plan] || 'Trial';
    const durationDays = getPlanDurationDays(planType);
    const { startDate, endDate, mealSlotToday: upiFirstDaySlot } = computeSubscriptionDates(durationDays);

    const user   = await User.findById(req.user._id);
    const vendor = await Vendor.findById(vendorId);
    if (!user)   return res.status(404).json({ message: 'User not found' });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    // Idempotent check: if this payment was already recorded, return the existing order
    const existingPaymentOrder = await Order.findOne({ transactionId: razorpay_payment_id });
    if (existingPaymentOrder) {
      if (existingPaymentOrder.status === 'active') {
        await Subscription.findOneAndUpdate(
          { sourceOrderId: existingPaymentOrder._id },
          {
            $setOnInsert: {
              userId:       req.user._id,
              vendorId,
              planType:     existingPaymentOrder.planType || planType,
              startDate:    existingPaymentOrder.startDate,
              expiryDate:   existingPaymentOrder.endDate,
              status:       'active',
              customerName: user.name,
              contact:      user.phone,
              sourceOrderId: existingPaymentOrder._id
            }
          },
          { upsert: true, new: true }
        );
      }
      return res.json({
        success:       true,
        message:       existingPaymentOrder.status === 'pending'
          ? 'Payment successful! Plan queued after your current subscription.'
          : 'Payment successful! Subscription activated.',
        order:         existingPaymentOrder,
        planType:      existingPaymentOrder.planType || planType,
        isQueued:      existingPaymentOrder.status === 'pending',
        transactionId: razorpay_payment_id
      });
    }

    // Check for existing active order — new plan queues behind it
    const existingActiveOrder = await Order.findOne({
      userId:  req.user._id,
      status:  'active',
      endDate: { $gte: new Date() }
    });

    const lastPendingOrder = await Order.findOne({
      userId:  req.user._id,
      status:  'pending'
    }).sort({ endDate: -1 });

    const chainFromOrder = lastPendingOrder || existingActiveOrder;
    const orderStatus = existingActiveOrder ? 'pending' : 'active';

    let orderStartDate = startDate;
    let orderEndDate   = endDate;

    if (chainFromOrder) {
      const chainEnd   = new Date(chainFromOrder.endDate);
      chainEnd.setUTCHours(0, 0, 0, 0);
      orderStartDate   = new Date(chainEnd.getTime() + 86400000);
      orderEndDate     = new Date(orderStartDate);
      orderEndDate.setUTCDate(orderEndDate.getUTCDate() + durationDays);
    }

    // Deduct wallet from user balance now that payment is verified
    if (walletUsed > 0) {
      await User.findByIdAndUpdate(req.user._id, { $inc: { wallet: -walletUsed } });
      console.log(`[verifyPayment] Wallet deducted ₹${walletUsed} for user ${req.user._id}`);
    }

    let order;
    try {
      order = await Order.create({
        userId:             req.user._id,
        vendorId,
        amount:             Number(amount),
        walletDeduction:    walletUsed,
        deliverySlot:       deliverySlot || 'Lunch',
        mealPreference:     mealPreference || 'Regular',
        paymentStatus:      'Paid',
        paymentMethod:      'UPI',
        transactionId:      razorpay_payment_id,
        planType,
        status:             orderStatus,
        startDate:          orderStartDate,
        endDate:            orderEndDate,
        scheduledStartDate:  orderStatus === 'pending' ? orderStartDate : null,
        scheduledEndDate:    orderStatus === 'pending' ? orderEndDate   : null,
        firstDayMealSlot:    orderStatus === 'active'  ? (upiFirstDaySlot || 'both') : 'both',
      });
    } catch (createErr) {
      if (createErr.code === 11000 || createErr.message?.includes('duplicate')) {
        order = await Order.findOne({ transactionId: razorpay_payment_id });
      }
      if (!order) throw createErr;
    }

    // Notify vendor analytics dashboard in real-time
    try { const _io = req.app.get('io') || global.io; _io?.to(`vendor_${vendorId}`).emit('analytics_update'); _io?.to(`vendor_${vendorId}`).emit('new_order_placed'); } catch (_) {}

    if (orderStatus === 'active') {
      await Subscription.findOneAndUpdate(
        { sourceOrderId: order._id },
        {
          $setOnInsert: {
            userId:       req.user._id,
            vendorId,
            planType,
            startDate:    orderStartDate,
            expiryDate:   orderEndDate,
            status:       'active',
            customerName: user.name,
            contact:      user.phone,
            sourceOrderId: order._id
          }
        },
        { upsert: true, new: true }
      );
      user.expiryDate = orderEndDate;
      await user.save();
    }

    // Award loyalty points for online payment subscription (fire-and-forget)
    // skipPoints if offer order; vendorId so vendor loyalty-off check runs inside
    awardSubscriptionPoints(req.user._id, planType, order._id, orderStatus === 'pending', { skipPoints: !!order.isOfferOrder, vendorId })
      .catch(err => console.error('Loyalty points error (verifyUserPayment):', err));

    try {
      const isQueued = orderStatus === 'pending';
      const slotInfo = !isQueued ? getMealSlotInfo(orderStartDate, new Date()) : null;
      const endFormatted = new Date(orderEndDate).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      const startFormatted = new Date(orderStartDate).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      await sendEmail(
        user.email,
        `MealSetu — ${planType} Plan ${isQueued ? 'Queued' : 'Activated'}`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#f26522;padding:24px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="color:white;margin:0;font-size:22px">✅ Payment Successful!</h1>
          </div>
          <div style="padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
            <p>Dear ${user.name},</p>
            <p>Your <strong>${planType}</strong> plan from <strong>${vendor.kitchenName}</strong> is confirmed.</p>
            ${isQueued
              ? `<div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:8px;padding:16px;margin:16px 0">
                   <p style="margin:0 0 4px 0;font-weight:700;color:#1d4ed8;font-size:15px">📅 Plan Queued</p>
                   <p style="margin:0;color:#374151;font-size:14px">Your plan will activate automatically on <strong>${startFormatted}</strong> after your current plan ends.</p>
                 </div>`
              : `<div style="background:${slotInfo.badgeBg};border-left:4px solid ${slotInfo.badgeColor};border-radius:8px;padding:16px;margin:16px 0">
                   <p style="margin:0 0 6px 0;font-weight:700;color:${slotInfo.badgeColor};font-size:16px">${slotInfo.slotLabel}</p>
                   <p style="margin:0 0 4px 0;color:#374151;font-size:14px">${slotInfo.startMessage}</p>
                   <p style="margin:0;color:#64748b;font-size:13px">${slotInfo.mealMessage}</p>
                 </div>`
            }
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr style="background:#f8fafc">
                <td style="padding:10px 14px;font-weight:600;color:#374151">Plan</td>
                <td style="padding:10px 14px;color:#64748b">${planType}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-weight:600;color:#374151">Kitchen</td>
                <td style="padding:10px 14px;color:#64748b">${vendor.kitchenName}</td>
              </tr>
              <tr style="background:#f8fafc">
                <td style="padding:10px 14px;font-weight:600;color:#374151">Valid Until</td>
                <td style="padding:10px 14px;color:#64748b">${endFormatted}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-weight:600;color:#374151">Amount Paid</td>
                <td style="padding:10px 14px;color:#64748b">₹${amount}</td>
              </tr>
              <tr style="background:#f8fafc">
                <td style="padding:10px 14px;font-weight:600;color:#374151">Transaction ID</td>
                <td style="padding:10px 14px;color:#64748b">${razorpay_payment_id}</td>
              </tr>
            </table>
            <p style="color:#64748b;font-size:13px;text-align:center;margin-top:20px">Thank you for choosing MealSetu!</p>
          </div>
        </div>`
      );
    } catch (emailErr) {
      console.error('Email failed:', emailErr.message);
    }

    const io = req.app.get('io') || global.io;
    if (io) {
      // Delay 1.5 s — same race-condition guard as placeOrder
      setTimeout(() => {
        try {
          io.to(req.user._id.toString()).emit('subscription_updated', {
            type: 'payment_success',
            planType,
            message: orderStatus === 'pending'
              ? `${planType} plan queued after your current subscription.`
              : `Your ${planType} subscription is now active!`
          });
          io.to(`vendor_${vendorId}`).emit('new_order', {
            type: 'new_subscription',
            message: 'New subscription order received'
          });
        } catch (socketErr) {
          console.error('Socket emit error in verifyUserPayment:', socketErr.message);
        }
      }, 1500);
    }

    // FCM notifications (fire-and-forget)
    try {
      const { notifyOrderConfirmed: _notifyOC2, notifyVendorPayment: _notifyVP } = require('../utils/fcmService');
      if (typeof _notifyOC2 === 'function') {
        _notifyOC2(req.user._id, {
          planType, vendorName: vendor.kitchenName,
          startDate: orderStartDate, orderId: order._id,
        }).catch(console.error);
      }
      if (vendor.ownerId && typeof _notifyVP === 'function') {
        _notifyVP(vendor.ownerId, user.name, amount).catch(console.error);
      }
    } catch (fcmErr) {
      console.error('FCM error in verifyUserPayment:', fcmErr.message);
    }

    res.json({
      success:       true,
      message:       orderStatus === 'pending'
        ? 'Payment successful! Plan queued after your current subscription.'
        : 'Payment successful! Subscription activated.',
      order,
      planType,
      isQueued:      orderStatus === 'pending',
      transactionId: razorpay_payment_id
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ message: 'Payment verification failed', error: error.message });
  }
};

const checkCanAddPlan = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    const activeOrder = await Order.findOne({
      userId,
      status: 'active',
      endDate: { $gte: now }
    });

    if (!activeOrder) {
      return res.json({ canPurchase: true, reason: 'no_active_plan' });
    }

    const pendingCount = await Order.countDocuments({
      userId,
      status: 'pending'
    });

    if (pendingCount >= 3) {
      const earliestPlan = await Order.findOne({
        userId,
        status: 'pending'
      }).sort({ startDate: 1 });

      const earliestExpiry = earliestPlan
        ? earliestPlan.startDate.toISOString().split('T')[0]
        : null;

      return res.json({
        canPurchase: false,
        reason: 'limit_reached',
        message: earliestExpiry
          ? `You already have 3 upcoming plans. Your earliest plan starts on ${earliestExpiry}. Wait for a plan to expire before adding more.`
          : 'You have reached the maximum limit of 3 upcoming plan extensions. Wait for a plan to expire before adding more.',
        earliestExpiry
      });
    }

    return res.json({
      canPurchase: true,
      reason: 'has_active_plan',
      pendingCount,
      remaining: 3 - pendingCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Submit a complaint (user)
// @route   POST /api/users/complaint
const submitComplaint = async (req, res) => {
  try {
    const { vendorId, orderId, message } = req.body;
    if (!vendorId || !message?.trim()) {
      return res.status(400).json({ message: 'Vendor and message are required' });
    }
    const complaint = await Complaint.create({
      userId:   req.user._id,
      vendorId,
      orderId:  orderId || undefined,
      message:  message.trim()
    });
    res.status(201).json({ message: 'Complaint submitted successfully', complaint });
  } catch (error) {
    console.error('Submit complaint error:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get current user's complaints
// @route   GET /api/users/my-complaints
const getMyComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ userId: req.user._id })
      .populate('vendorId', 'kitchenName')
      .populate('orderId', 'planType orderDate')
      .sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    console.error('Get my complaints error:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Download order invoice as PDF
// @route   GET /api/users/orders/:orderId/invoice
const getUserOrderInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate('vendorId', 'kitchenName address phone')
      .populate('userId',   'name email phone');

    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Security: only the order owner can download
    const orderUserId = (order.userId?._id || order.userId)?.toString();
    if (!orderUserId || orderUserId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4', compress: false });

    const invoiceNo  = order._id.toString().slice(-8).toUpperCase();
    const orderDate  = order.orderDate ? new Date(order.orderDate) : new Date();
    const startDate  = order.startDate ? new Date(order.startDate) : null;
    const endDate    = order.endDate   ? new Date(order.endDate)   : null;
    const fmtDate    = (d) => d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

    const payStatus   = order.paymentStatus || 'Pending';
    const statusColor = payStatus === 'Paid' ? '#16a34a' : payStatus === 'Failed' ? '#dc2626' : '#d97706';
    const statusBadge = payStatus === 'Pending' ? 'PAYMENT PENDING' : payStatus.toUpperCase();

    const vendor = order.vendorId || {};
    const user   = order.userId   || {};

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order._id}.pdf"`);
    doc.pipe(res);

    // ── HEADER ────────────────────────────────────────────────────────────────
    doc.rect(0, 0, 612, 80).fill('#f97316');
    doc.fillColor('white')
       .fontSize(26).font('Helvetica-Bold')
       .text('MEALSETU', 50, 22);
    doc.fontSize(11).font('Helvetica')
       .text('Tax Invoice', 50, 52);
    doc.fontSize(10)
       .text(`Invoice #${invoiceNo}`, 380, 28, { align: 'right', width: 182 })
       .text(`Date: ${fmtDate(orderDate)}`, 380, 44, { align: 'right', width: 182 });

    // ── PAYMENT STATUS BADGE ──────────────────────────────────────────────────
    doc.moveDown(2.5);
    doc.fillColor(statusColor)
       .fontSize(13).font('Helvetica-Bold')
       .text(statusBadge, 380, 96, { align: 'right', width: 182 });

    // ── DIVIDER ───────────────────────────────────────────────────────────────
    doc.moveTo(50, 118).lineTo(562, 118).strokeColor('#e5e7eb').stroke();

    // ── CUSTOMER INFO (left) + KITCHEN INFO (right) ────────────────────────────
    doc.fillColor('#6b7280').fontSize(9).font('Helvetica-Bold')
       .text('BILLED TO', 50, 133)
       .text('KITCHEN', 350, 133);

    doc.fillColor('#1f2937').fontSize(11).font('Helvetica-Bold')
       .text(user.name || 'Customer', 50, 148)
       .text(vendor.kitchenName || 'Kitchen', 350, 148);

    doc.fillColor('#6b7280').fontSize(10).font('Helvetica')
       .text(user.email || '', 50, 164)
       .text(user.phone || '', 50, 178);

    doc.fillColor('#6b7280').fontSize(10).font('Helvetica')
       .text(
         (typeof vendor.address === 'object' ? (vendor.address?.fullAddress || [vendor.address?.street, vendor.address?.area, vendor.address?.city].filter(Boolean).join(', ')) : vendor.address) || '',
         350, 164, { width: 210 }
       );

    // ── DIVIDER ───────────────────────────────────────────────────────────────
    doc.moveTo(50, 210).lineTo(562, 210).strokeColor('#e5e7eb').stroke();

    // ── PLAN DETAILS TABLE ────────────────────────────────────────────────────
    doc.fillColor('#1f2937').fontSize(12).font('Helvetica-Bold')
       .text('Subscription Details', 50, 225);

    const tableTop = 248;
    doc.rect(50, tableTop, 512, 22).fill('#f9fafb');
    doc.fillColor('#6b7280').fontSize(9).font('Helvetica-Bold')
       .text('PLAN TYPE',       60,  tableTop + 7)
       .text('PERIOD',          180, tableTop + 7)
       .text('MEAL PREFERENCE', 340, tableTop + 7)
       .text('PAYMENT METHOD',  470, tableTop + 7);

    doc.rect(50, tableTop + 22, 512, 26).fill('#ffffff').stroke('#f3f4f6');
    doc.fillColor('#374151').fontSize(10).font('Helvetica')
       .text(order.planType    || '—', 60,  tableTop + 29)
       .text(`${fmtDate(startDate)} – ${fmtDate(endDate)}`, 180, tableTop + 29, { width: 155 })
       .text(order.mealPreference || '—', 340, tableTop + 29)
       .text(order.paymentMethod  || '—', 470, tableTop + 29);

    // ── TRANSACTION ID (if online) ────────────────────────────────────────────
    let nextY = tableTop + 70;
    if (order.razorpayOrderId || order.razorpayPaymentId) {
      doc.fillColor('#6b7280').fontSize(9).font('Helvetica')
         .text(`Transaction ID: ${order.razorpayPaymentId || order.razorpayOrderId || '—'}`,
               50, nextY);
      nextY += 18;
    }

    // ── AMOUNT SUMMARY BOX ────────────────────────────────────────────────────
    nextY += 10;
    doc.rect(360, nextY, 202, 80).fill('#f9fafb').stroke('#e5e7eb');

    const isFree = (order.paymentMethod || '').toLowerCase() === 'free';
    const amt    = isFree ? 0 : (order.amount || 0);

    doc.fillColor('#6b7280').fontSize(10).font('Helvetica')
       .text('Subtotal',  370, nextY + 14)
       .text('Tax (0%)',  370, nextY + 32)
    doc.fillColor('#374151').font('Helvetica-Bold')
       .text('Total',     370, nextY + 52);

    doc.fillColor('#374151').fontSize(10).font('Helvetica')
       .text(isFree ? 'Free' : `Rs.${amt}`, 510, nextY + 14, { align: 'right', width: 42 })
       .text('Rs.0',                          510, nextY + 32, { align: 'right', width: 42 });
    doc.fillColor('#f97316').fontSize(13).font('Helvetica-Bold')
       .text(isFree ? 'FREE' : `Rs.${amt}`,  510, nextY + 50, { align: 'right', width: 42 });

    // ── PAYMENT STATUS BANNER ─────────────────────────────────────────────────
    nextY += 100;
    const bannerBg = payStatus === 'Paid'   ? '#f0fdf4'
                   : payStatus === 'Failed' ? '#fef2f2' : '#fffbeb';
    const bannerBorder = payStatus === 'Paid'   ? '#bbf7d0'
                       : payStatus === 'Failed' ? '#fecaca' : '#fde68a';

    doc.rect(50, nextY, 512, 40).fill(bannerBg).stroke(bannerBorder);
    const bannerMsg = payStatus === 'Paid'
      ? '✓  Payment received. Thank you for your subscription!'
      : payStatus === 'Failed'
      ? '✗  Payment failed. Please contact support.'
      : '⏳  Cash payment pending. Please pay the vendor directly.';

    doc.fillColor(statusColor).fontSize(11).font('Helvetica-Bold')
       .text(bannerMsg, 62, nextY + 13, { width: 490 });

    // ── FOOTER ────────────────────────────────────────────────────────────────
    doc.moveTo(50, 760).lineTo(562, 760).strokeColor('#e5e7eb').stroke();
    doc.fillColor('#9ca3af').fontSize(8).font('Helvetica')
       .text(
         'This is a computer-generated invoice from MealSetu. No signature required.',
         50, 770, { align: 'center', width: 512 }
       )
       .text(
         'For support contact: support@mealsetu.com',
         50, 782, { align: 'center', width: 512 }
       );

    doc.end();
  } catch (error) {
    console.error('Invoice generation error:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to generate invoice' });
  }
};

// @desc  Get vendor contact details for nearby/area kitchens (Contact Us screen)
// @route GET /api/users/vendor-contacts
const getVendorContacts = async (req, res) => {
  try {
    const { pincode, userLat, userLon } = req.query;

    if (!pincode) {
      return res.status(400).json({ message: 'Pincode is required' });
    }

    const userLatitude  = userLat ? parseFloat(userLat) : null;
    const userLongitude = userLon ? parseFloat(userLon) : null;

    function haversineDistance(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return Math.round(R * c * 10) / 10;
    }

    const fields = 'kitchenName address pincode latitude longitude profileImage ownerName';

    // Level 1 — exact pincode match
    let vendors = await Vendor.find({ isApproved: true, pincode })
      .select(fields)
      .populate('ownerId', 'email name phone');

    // Level 2 — 3-digit prefix fallback
    if (vendors.length === 0) {
      const prefix3 = pincode.slice(0, 3);
      vendors = await Vendor.find({
        isApproved: true,
        $expr: { $regexMatch: { input: '$pincode', regex: `^${prefix3}` } }
      }).select(fields).populate('ownerId', 'email name phone');
    }

    // Level 3 — all approved vendors
    if (vendors.length === 0) {
      vendors = await Vendor.find({ isApproved: true })
        .select(fields)
        .populate('ownerId', 'email name phone');
    }

    const result = vendors.map(v => {
      let distanceKm = null;
      if (userLatitude && userLongitude && v.latitude && v.longitude) {
        distanceKm = haversineDistance(userLatitude, userLongitude, v.latitude, v.longitude);
      }
      return {
        _id:          v._id,
        kitchenName:  v.kitchenName,
        address:      v.address    || '',
        pincode:      v.pincode    || '',
        phone:        v.ownerId?.phone || null,
        email:        v.ownerId?.email || null,
        ownerName:    v.ownerName  || v.ownerId?.name || null,
        profileImage: v.profileImage
          ? transformProfilePic(v.profileImage, req.protocol, req.get('host'))
          : null,
        distanceKm,
      };
    });

    // Sort nearest first when coordinates available
    result.sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return 0;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });

    res.json({ vendors: result });
  } catch (error) {
    console.error('Error in getVendorContacts:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc   Save / refresh FCM token for push notifications
// @route  POST /api/users/fcm-token
const saveFCMToken = async (req, res) => {
  try {
    const { token } = req.body;
    await User.findByIdAndUpdate(req.user._id, {
      fcmToken:          token || null,
      fcmTokenUpdatedAt: new Date(),
    });
    res.json({ success: true });
  } catch (err) {
    console.error('saveFCMToken:', err.message);
    res.status(500).json({ message: 'Failed to save FCM token' });
  }
};

module.exports = {
  getUserSubscription,
  getActiveSubscriptionStatus,
  applyLeave,
  extendSubscription,
  getCurrentUser,
  updateUserProfile,
  updateUserProfilePic,
  changePassword,
  getUserOrders,
  getMenus,
  placeOrder,
  addReview,
  getVendorReviews,
  getVendorRating,
  markReviewHelpful,
  flagReview,
  getPendingRating,
  getVendorStatus,
  getApprovedVendors,
  getVendorsByPincode,
  checkReviewEligibility,
  getTrialEligibility,
  createTrialOrder,
  getMyCashPayments,
  getMySubscription,
  getUpcomingOrders,
  extendSubscriptionOrder,
  checkSubscriptionPaymentStatus,
  getVendorPricingForUser,
  fixStuckOrders,
  runFixStuckOrders,
  createRazorpayOrder,
  verifyUserPayment,
  checkCanAddPlan,
  submitComplaint,
  getMyComplaints,
  getUserOrderInvoice,
  getVendorContacts,
  saveFCMToken,
  reportNotReceived,
};

// ── reportNotReceived (defined here to keep exports clean) ───────────────────
async function reportNotReceived(req, res) {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ _id: orderId, userId: req.user._id });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.deliveryStatus !== 'delivered') {
      return res.status(400).json({ message: 'Order has not been delivered yet' });
    }
    if (!order.deliveredAt) {
      return res.status(400).json({ message: 'Delivery timestamp missing' });
    }
    const minutesSince = (Date.now() - new Date(order.deliveredAt).getTime()) / 60000;
    if (minutesSince > 45) {
      return res.status(400).json({ message: 'Report window has expired (45 min after delivery)' });
    }
    if (order.reportedNotReceived) {
      return res.status(400).json({ message: 'Issue already reported for this delivery' });
    }

    order.reportedNotReceived = true;
    order.reportedAt          = new Date();
    order.isFlagged            = true;
    order.flagReason           = req.body.reason || 'Customer reported not received';
    order.flaggedAt            = new Date();
    await order.save();

    // Notify vendor via Socket.IO
    const io = req.app?.get?.('io') || global.io;
    if (io) {
      io.to(`vendor_${order.vendorId}`).emit('delivery_flagged', {
        orderId:    order._id,
        flagReason: order.flagReason,
        flaggedAt:  order.flaggedAt
      });
    }

    // FCM push to vendor
    try {
      const Vendor = require('../models/Vendor');
      const { notifyOrderFlagged } = require('../utils/fcmService');
      const vendor = await Vendor.findById(order.vendorId).select('ownerId').lean();
      if (vendor?.ownerId) {
        notifyOrderFlagged(vendor.ownerId, req.user.name || 'Customer', order._id).catch(console.error);
      }
    } catch (_) {}

    return res.json({ success: true, message: 'Issue reported. The vendor will review it shortly.' });
  } catch (err) {
    console.error('reportNotReceived:', err.message);
    return res.status(500).json({ message: 'Failed to report issue' });
  }
}
