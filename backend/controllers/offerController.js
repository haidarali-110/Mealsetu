const Offer = require('../models/Offer');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
const { sendEmail } = require('../utils/emailUtils');
const { notifyAllUsers, notifyOfferRedeemed } = require('../utils/fcmService');
const { computeSubscriptionDates, getPlanDurationDays } = require('../utils/mealTimingUtils');

// Helper function to transform image path to full URL
const transformImageUrl = (imagePath, req) => {
  if (!imagePath) return null;
  
  // If already a full URL, return as is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // Use dynamic protocol and host from request
  const backendUrl = `${req.protocol}://${req.get('host')}`;
  
  // Remove any double slashes
  let cleanPath = imagePath.replace(/\/+/g, '/');
  
  // If path starts with /uploads, prepend backend URL
  if (cleanPath.startsWith('/uploads/')) {
    return `${backendUrl}${cleanPath}`;
  }
  
  return `${backendUrl}/uploads/${cleanPath.replace(/^\/?uploads\//, '')}`;
};


// @desc    Create a new offer (vendor)
// @route   POST /api/vendor/offers
const createOffer = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an offer poster image' });
    }

    const { startDate, endDate, planDiscounts } = req.body;

    // Parse planDiscounts if it's a string
    let parsedPlanDiscounts = planDiscounts;
    if (typeof planDiscounts === 'string') {
      parsedPlanDiscounts = JSON.parse(planDiscounts);
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
      return res.status(400).json({ message: 'Start date cannot be in the past' });
    }

    if (end <= start) {
      return res.status(400).json({ message: 'End date must be after start date' });
    }

    // Validate plan discounts
    if (!parsedPlanDiscounts || !Array.isArray(parsedPlanDiscounts) || parsedPlanDiscounts.length === 0) {
      return res.status(400).json({ message: 'At least one plan discount is required' });
    }

    // Create the offer
    const offer = await Offer.create({
      vendorId: vendor._id,
      posterImage: `/uploads/${req.file.filename}`,
      startDate: start,
      endDate: end,
      planDiscounts: parsedPlanDiscounts
    });

    // Populate vendor details for email
    const populatedOffer = await Offer.findById(offer._id).populate('vendorId', 'kitchenName');

    // Send promotional emails to all users in the background (non-blocking)
    setImmediate(async () => {
      try {
        const users = await User.find({ role: 'user', isActive: true }).select('email name');
        
        if (users.length > 0) {
          // Format discount details for email
          const discountText = populatedOffer.planDiscounts
            .map(pd => `${pd.planName}: ${pd.discountPercentage}% OFF`)
            .join(', ');

          const emailSubject = '🎉 New Offer Available on MealSetu!';
          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #f26522 0%, #ff6b35 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 28px;">🍱 New Offer Alert!</h1>
              </div>
              <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                <p style="font-size: 16px; color: #333;">Hello,</p>
                <p style="font-size: 16px; color: #333;">Great news! <strong>${populatedOffer.vendorId.kitchenName}</strong> has launched a new exciting offer on MealSetu!</p>
                
                <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px solid #f26522;">
                  <h3 style="color: #f26522; margin: 0 0 15px 0;">🎁 Offer Details</h3>
                  <p style="font-size: 18px; font-weight: bold; color: #16a34a;">${discountText}</p>
                </div>
                
                <div style="background: #fff3ed; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 5px 0; color: #555;"><strong>📅 Valid From:</strong> ${new Date(populatedOffer.startDate).toLocaleDateString('en-IN')}</p>
                  <p style="margin: 5px 0; color: #555;"><strong>📅 Valid Until:</strong> ${new Date(populatedOffer.endDate).toLocaleDateString('en-IN')}</p>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${req.protocol}://${req.get('host')}/user" style="background: #f26522; color: white; padding: 15px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 16px; display: inline-block;">🔥 Grab This Offer Now!</a>
                </div>
                
                <p style="color: #888; font-size: 14px; text-align: center; margin-top: 20px;">
                  Don't miss out on this amazing deal. Order now and enjoy delicious meals at discounted prices!
                </p>
              </div>
              <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
                <p>MealSetu - Quality Food, Delivered with Care</p>
              </div>
            </div>
          `;

          // Send emails in batches
          const batchSize = 10;
          for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            await Promise.all(
              batch.map(user => sendEmail(user.email, emailSubject, emailHtml))
            );
          }
          console.log(`Promotional emails sent to ${users.length} users for offer ${offer._id}`);
        }

        // FCM push to all users
        const userIds = users.map(u => u._id);
        if (userIds.length > 0) {
          const discountText = populatedOffer.planDiscounts
            .map(pd => `${pd.planName}: ${pd.discountPercentage}% OFF`)
            .join(', ');
          notifyAllUsers(
            userIds,
            `🎁 New Offer from ${populatedOffer.vendorId.kitchenName}!`,
            discountText,
            { type: 'new_offer', offerId: String(offer._id), screen: 'offers' }
          ).catch(console.error);
        }
      } catch (emailError) {
        console.error('Failed to send promotional emails/FCM:', emailError);
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('offers_updated', {
        type: 'new_offer',
        vendorId: vendor._id,
        vendorName: vendor.kitchenName,
        message: `New offer available from ${vendor.kitchenName}!`
      });
    }

    res.status(201).json({
      message: 'Offer created successfully',
      offer: {
        ...populatedOffer.toObject(),
        posterImage: transformImageUrl(populatedOffer.posterImage, req)
      }
    });
  } catch (error) {
    console.error('Create offer error:', error);
    res.status(500).json({ message: 'Error creating offer', error: error.message });
  }
};

// @desc    Get vendor's all offers
// @route   GET /api/vendor/offers
const getVendorOffers = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    const offers = await Offer.find({ vendorId: vendor._id })
      .populate('vendorId', 'kitchenName')
      .sort({ createdAt: -1 });

    // Transform image URLs
    const transformedOffers = offers.map(offer => ({
      ...offer.toObject(),
      posterImage: transformImageUrl(offer.posterImage, req)
    }));

    res.json(transformedOffers);
  } catch (error) {
    console.error('Get vendor offers error:', error);
    res.status(500).json({ message: 'Error fetching offers' });
  }
};

// @desc    Delete an offer (vendor)
// @route   DELETE /api/vendor/offers/:id
const deleteOffer = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    const offer = await Offer.findOne({ _id: req.params.id, vendorId: vendor._id });
    if (!offer) {
      return res.status(404).json({ message: 'Offer not found' });
    }

    await Offer.findByIdAndDelete(req.params.id);

    const io = req.app.get('io');
    if (io) {
      io.emit('offers_updated', { type: 'offer_deleted', vendorId: vendor._id });
    }

    res.json({ message: 'Offer deleted successfully' });
  } catch (error) {
    console.error('Delete offer error:', error);
    res.status(500).json({ message: 'Error deleting offer' });
  }
};

// @desc    Get all active offers (for user dashboard)
// @route   GET /api/users/active-offers
const getActiveOffers = async (req, res) => {
  try {
    // Get current user ID if authenticated
    const userId = req.user ? req.user._id : null;
    
    // Use current date with proper time handling
    const now = new Date();
    
    // Start of today (00:00:00)
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    
    // End of today (23:59:59.999)
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    console.log('[getActiveOffers] Searching for active and upcoming offers...');
    console.log('[getActiveOffers] Current date range:', {
      startOfToday: startOfToday.toISOString(),
      endOfToday: endOfToday.toISOString()
    });

    // ============================================================
    // EXPIRED OFFER REMOVAL STATUS:
    // The query below has been FIXED to explicitly filter out expired offers.
    // Previously, the query did NOT include a condition to filter out offers
    // where endDate is less than today's date. This has been corrected now.
    // The query now returns only offers where:
    //   1. endDate >= startOfToday (offer has not expired)
    //   2. Either active (started and not ended) OR upcoming (not yet started)
    // ============================================================
    
    // Query: Get both active offers (currently running) and upcoming offers (future)
    // Active: startDate <= endOfToday AND endDate >= startOfToday AND endDate >= today
    // Upcoming: startDate > endOfToday AND endDate > startOfToday (future offers)
    // IMPORTANT: All queries now include endDate: { $gte: startOfToday } to exclude expired offers
    const offers = await Offer.find({
      $or: [
        { isActive: true },
        { isActive: { $exists: false } }
      ],
      // CRITICAL: Filter out any offer where endDate is before today
      endDate: { $gte: startOfToday },
      $or: [
        // Active offers: started and not yet ended (both startDate and endDate must be today or in past/future respectively)
        {
          startDate: { $lte: endOfToday },
          endDate: { $gte: startOfToday }
        },
        // Upcoming offers: future offers that haven't started yet (startDate > endOfToday AND endDate > startOfToday)
        {
          startDate: { $gt: endOfToday },
          endDate: { $gte: startOfToday }
        }
      ]
    })
      .populate('vendorId', 'kitchenName address profileImage kitchenPoster')
      .sort({ createdAt: -1 });

    console.log('[getActiveOffers] Offers found after query:', offers.length);

    if (offers.length > 0) {
      console.log('[getActiveOffers] Sample offer dates:');
      offers.slice(0, 3).forEach((offer, i) => {
        console.log(`  Offer ${i + 1}:`, {
          _id: offer._id,
          startDate: offer.startDate,
          endDate: offer.endDate,
          isActive: offer.isActive
        });
      });
    }

    // Transform image URLs and add offerStatus
    const transformedOffers = offers
      .filter(offer => offer.vendorId)
      .map(offer => {
        // Determine if offer is active or upcoming
        const offerStartDate = new Date(offer.startDate);
        const offerEndDate = new Date(offer.endDate);
        
        // Check if offer has started (startDate <= endOfToday) and hasn't ended (endDate >= startOfToday)
        const isActive = offerStartDate <= endOfToday && offerEndDate >= startOfToday;
        // Check if offer is upcoming (startDate > endOfToday)
        const isUpcoming = offerStartDate > endOfToday;
        
        const offerStatus = isActive ? 'active' : (isUpcoming ? 'coming-soon' : 'active');
        
        // Check if the current user has claimed this offer
        // Convert userId to string for comparison if it exists
        const isClaimedByUser = userId && offer.redeemedBy 
          ? offer.redeemedBy.some(id => id.toString() === userId.toString())
          : false;
        
        return {
          _id: offer._id,
          vendorId: offer.vendorId._id,
          kitchenName: offer.vendorId.kitchenName,
          vendorAddress: offer.vendorId.address,
          vendorProfileImage: transformImageUrl(offer.vendorId.profileImage, req),
          vendorKitchenPoster: transformImageUrl(offer.vendorId.kitchenPoster, req),
          posterImage: transformImageUrl(offer.posterImage, req),
          startDate: offer.startDate,
          endDate: offer.endDate,
          planDiscounts: offer.planDiscounts,
          createdAt: offer.createdAt,
          offerStatus: offerStatus,
          // Include isClaimedByUser field for frontend to determine claimed state
          isClaimedByUser: isClaimedByUser
        };
      });

    console.log('[getActiveOffers] Returning transformed offers:', transformedOffers.length);
    console.log('[getActiveOffers] Offer status breakdown:', {
      active: transformedOffers.filter(o => o.offerStatus === 'active').length,
      'coming-soon': transformedOffers.filter(o => o.offerStatus === 'coming-soon').length,
      claimedByUser: transformedOffers.filter(o => o.isClaimedByUser === true).length
    });
    
    // Return the array directly (not wrapped in object)
    res.json(transformedOffers);
  } catch (error) {
    console.error('Get active offers error:', error);
    res.status(500).json({ message: 'Error fetching active offers' });
  }
};

// @desc    Get offers claimed by current user
// @route   GET /api/users/claimed-offers
const getClaimedOffers = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find all offers that have been redeemed by this user
    const claimedOffers = await Offer.find({
      redeemedBy: userId
    }).select('_id');
    
    // Return array of offer IDs
    const claimedOfferIds = claimedOffers.map(offer => offer._id);
    
    console.log('[getClaimedOffers] User:', userId.toString());
    console.log('[getClaimedOffers] Claimed offer IDs:', claimedOfferIds);
    
    res.json(claimedOfferIds);
  } catch (error) {
    console.error('Get claimed offers error:', error);
    res.status(500).json({ message: 'Error fetching claimed offers' });
  }
};

// @desc    Create Razorpay order for offer payment
// @route   POST /api/users/offers/create-payment-order
const createOfferPaymentOrder = async (req, res) => {
  try {
    const razorpay = require('../utils/razorpayUtils');
    const { offerId, planType } = req.body;

    if (!offerId || !planType) {
      return res.status(400).json({ message: 'offerId and planType are required' });
    }

    const offer = await Offer.findById(offerId);
    if (!offer) return res.status(404).json({ message: 'Offer not found' });
    if (!offer.isActive) return res.status(400).json({ message: 'This offer has expired' });

    const planDiscount = offer.planDiscounts.find(
      pd => pd.planName.toLowerCase() === planType.toLowerCase()
    );
    if (!planDiscount || planDiscount.discountPercentage === 0) {
      return res.status(400).json({ message: `No discount available for ${planType} plan` });
    }

    const PLAN_PRICES = { 'One Day': 80, 'Weekly': 560, 'Monthly': 2000 };
    const originalPrice = PLAN_PRICES[planType] || 80;
    const discountedPrice = Math.round(originalPrice * (1 - planDiscount.discountPercentage / 100));

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(discountedPrice * 100),
      currency: 'INR',
      receipt: `o_${Date.now()}`,
      notes: { userId: req.user._id.toString(), offerId, planType }
    });

    res.json({
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      discountedPrice
    });
  } catch (error) {
    console.error('Create offer payment order error:', error);
    res.status(500).json({ message: 'Payment initiation failed', error: error.message });
  }
};

// @desc    Redeem an offer (user)
// @route   POST /api/users/offers/redeem
const redeemOffer = async (req, res) => {
  try {
    const { offerId, planType, paymentMethod, razorpayData = {} } = req.body;
    const userId = req.user._id;

    if (!offerId || !planType) {
      return res.status(400).json({ message: 'offerId and planType are required' });
    }

    // CHECK 1 — Offer exists and isActive flag is true
    const offerCheck = await Offer.findById(offerId);
    if (!offerCheck) return res.status(404).json({ message: 'Offer not found' });
    if (!offerCheck.isActive) return res.status(400).json({ message: 'This offer has expired' });

    // CHECK 2 — 3-plan limit
    const limitNow = new Date();
    limitNow.setUTCHours(0, 0, 0, 0);
    const activeOrder = await Order.findOne({ userId, status: 'active', endDate: { $gte: limitNow } });
    if (activeOrder) {
      const pendingCount = await Order.countDocuments({ userId, status: 'pending' });
      if (pendingCount >= 3) {
        const earliestPlan = await Order.findOne({
          userId, status: 'active', endDate: { $gte: limitNow }
        }).sort({ endDate: 1 });
        return res.status(400).json({
          code: 'LIMIT_REACHED',
          message: earliestPlan?.endDate
            ? `Your plan queue is full. Your earliest plan ends on ${
                new Date(earliestPlan.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })
              }. Wait for a slot to open then redeem this offer.`
            : 'You have reached the maximum limit of 3 upcoming plans.'
        });
      }
    }

    // CHECK 3 — Validate paymentMethod
    if (!paymentMethod || !['Cash', 'Online'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'Please select a payment method', code: 'NO_PAYMENT_METHOD' });
    }

    // CHECK 4 — If Online, verify Razorpay signature
    if (paymentMethod === 'Online') {
      const crypto = require('crypto');
      const sigBody = razorpayData.razorpay_order_id + '|' + razorpayData.razorpay_payment_id;
      const expectedSig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(sigBody).digest('hex');
      if (expectedSig !== razorpayData.razorpay_signature) {
        return res.status(400).json({ message: 'Payment verification failed' });
      }
    }

    // Fetch offer with vendor populated
    const offer = await Offer.findById(offerId).populate('vendorId', 'kitchenName');
    if (!offer.vendorId || !offer.vendorId._id) {
      return res.status(500).json({ message: 'Offer vendor data is invalid. Please contact support.' });
    }

    // Check offer date range
    const dateNow = new Date();
    dateNow.setHours(0, 0, 0, 0);
    const offerStart = new Date(offer.startDate);
    const offerEnd = new Date(offer.endDate);
    offerStart.setHours(0, 0, 0, 0);
    offerEnd.setHours(23, 59, 59, 999);
    if (dateNow < offerStart || dateNow > offerEnd) {
      return res.status(400).json({ message: 'This offer has expired or is not yet active' });
    }

    // Find plan discount
    const planDiscount = offer.planDiscounts.find(
      pd => pd.planName.toLowerCase() === planType.toLowerCase()
    );
    if (!planDiscount || planDiscount.discountPercentage === 0) {
      return res.status(400).json({ message: `No discount available for ${planType} plan` });
    }

    // Prices
    const PLAN_PRICES = { 'One Day': 80, 'Weekly': 560, 'Monthly': 2000 };
    const originalPrice = PLAN_PRICES[planType] || 80;
    const discountPercentage = planDiscount.discountPercentage;
    const discountedPrice = Math.round(originalPrice * (1 - discountPercentage / 100));

    // Duration — 'One Day' maps to Trial (1 day), not in getPlanDurationDays
    let durationDays;
    switch (planType) {
      case 'Weekly':  durationDays = 7;  break;
      case 'Monthly': durationDays = 30; break;
      default:        durationDays = 1;  break; // 'One Day'
    }

    // Map 'One Day' → 'Trial' for Order.planType enum
    const PLAN_TYPE_MAP = { 'One Day': 'Trial', 'Weekly': 'Weekly', 'Monthly': 'Monthly' };
    const orderPlanType = PLAN_TYPE_MAP[planType] || planType;

    // Duplicate check (60-second window)
    const sixtySecondsAgo = new Date(Date.now() - 60000);
    const duplicateOrder = await Order.findOne({
      userId,
      vendorId: offer.vendorId._id,
      planType: orderPlanType,
      $or: [{ status: 'pending' }, { offerStatus: 'pending' }],
      createdAt: { $gte: sixtySecondsAgo }
    });
    if (duplicateOrder) {
      return res.status(409).json({
        message: 'A pending order with the same plan already exists. Please wait or cancel the existing order first.'
      });
    }

    // Active/pending logic — chain from last pending if exists, else from active
    const existingActiveOrder = await Order.findOne({
      userId, status: 'active', endDate: { $gte: new Date() }
    });

    const lastPendingOrder = await Order.findOne({
      userId, status: 'pending'
    }).sort({ endDate: -1 });

    const chainFromOrder = lastPendingOrder || existingActiveOrder;
    const orderStatus = existingActiveOrder ? 'pending' : 'active';
    const { startDate: computedStart, endDate: computedEnd } = computeSubscriptionDates(durationDays);

    let orderStartDate = computedStart;
    let orderEndDate = computedEnd;
    if (chainFromOrder) {
      const chainEnd = new Date(chainFromOrder.endDate);
      chainEnd.setUTCHours(0, 0, 0, 0);
      orderStartDate = new Date(chainEnd.getTime() + 86400000);
      orderEndDate = new Date(orderStartDate);
      orderEndDate.setUTCDate(orderEndDate.getUTCDate() + durationDays);
    }

    const dbPaymentMethod = paymentMethod === 'Online' ? 'UPI' : 'Cash';
    const dbPaymentStatus = paymentMethod === 'Online' ? 'Paid' : 'Pending';

    const order = await Order.create({
      userId,
      vendorId: offer.vendorId._id,
      amount: discountedPrice,
      deliverySlot: 'Lunch',
      mealPreference: 'Regular',
      paymentStatus: dbPaymentStatus,
      paymentMethod: dbPaymentMethod,
      ...(paymentMethod === 'Online' && { transactionId: razorpayData.razorpay_payment_id }),
      planType: orderPlanType,
      status: orderStatus,
      startDate: orderStartDate,
      endDate: orderEndDate,
      scheduledStartDate: orderStatus === 'pending' ? orderStartDate : null,
      scheduledEndDate:   orderStatus === 'pending' ? orderEndDate   : null,
      isOfferOrder: true,
      offerId: offer._id,
      originalPrice,
      discountPercentage,
      discountedPrice,
      offerStatus: orderStatus,
      customerName: req.user.name
    });

    if (orderStatus === 'active') {
      await Subscription.create({
        userId,
        vendorId: offer.vendorId._id,
        planType: orderPlanType,
        startDate: orderStartDate,
        expiryDate: orderEndDate,
        status: 'active',
        customerName: req.user.name,
        contact: req.user.phone,
        isOfferSubscription: true,
        offerId: offer._id
      });
      await User.findByIdAndUpdate(userId, { expiryDate: orderEndDate });
    }

    await Offer.findByIdAndUpdate(offerId, { $addToSet: { redeemedBy: userId } });

    // Socket events
    const io = req.app.get('io');
    if (io) {
      io.to(userId.toString()).emit('subscription_updated', {
        type: 'offer_redeemed', planType: orderPlanType,
        message: orderStatus === 'pending'
          ? `${planType} offer queued after your current subscription.`
          : `Your ${planType} offer is now active!`
      });
      io.to(`vendor_${offer.vendorId._id}`).emit('offer_redeemed', {
        userName: req.user.name, planType, discountedPrice,
        message: `${req.user.name} redeemed your ${planType} offer for ₹${discountedPrice}!`
      });
      io.to(`vendor_${offer.vendorId._id}`).emit('offers_updated', { type: 'redemption', vendorId: offer.vendorId._id });
    }

    // Email (non-blocking for pending, awaited for active)
    const isQueued = orderStatus === 'pending';
    const sendOfferEmail = async () => {
      try {
        const subject = isQueued ? 'MealSetu - Offer Redeemed Successfully!' : `🎉 Offer Activated! - ${offer.vendorId.kitchenName}`;
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:${isQueued ? '#f26522' : '#16a34a'}">${isQueued ? '🎉 Offer Redeemed!' : '🎉 Offer Activated!'}</h2>
          <p>Dear ${req.user.name},</p>
          <p>Your offer from <strong>${offer.vendorId.kitchenName}</strong> has been ${isQueued ? 'redeemed' : 'activated'} successfully!</p>
          <div style="background:#f5f5f5;padding:20px;border-radius:10px;margin:16px 0">
            <p><strong>Plan:</strong> ${planType}</p>
            <p><strong>Original Price:</strong> ₹${originalPrice}</p>
            <p><strong>Discount:</strong> ${discountPercentage}% OFF</p>
            <p><strong>You Pay:</strong> ₹${discountedPrice}</p>
            <p><strong>Payment:</strong> ${paymentMethod}</p>
            <p><strong>${isQueued ? 'Scheduled Start' : 'Valid until'}:</strong> ${orderEndDate.toLocaleDateString('en-IN')}</p>
          </div>
          ${isQueued ? '<p style="color:#555;background:#fef3c7;padding:15px;border-radius:8px;">⏰ Your plan will activate automatically after your current subscription ends.</p>' : '<p>Enjoy your discounted meals!</p>'}
        </div>`;
        await sendEmail(req.user.email, subject, html);
      } catch (e) { console.error('Offer email error:', e.message); }
    };
    if (isQueued) setImmediate(sendOfferEmail); else await sendOfferEmail();

    notifyOfferRedeemed(userId, offer.vendorId.kitchenName, planType, discountedPrice).catch(console.error);

    return res.status(201).json({
      message: isQueued ? 'Offer redeemed successfully!' : 'Offer redeemed and activated successfully!',
      status: orderStatus,
      ...(isQueued && { scheduledActivationDate: orderStartDate }),
      offerDetails: {
        vendorName: offer.vendorId.kitchenName,
        planType, originalPrice, discountPercentage, discountedPrice,
        offerEndDate: offer.endDate
      },
      ...(!isQueued && {
        subscription: { planType: orderPlanType, startDate: orderStartDate, expiryDate: orderEndDate, status: 'active' }
      })
    });

  } catch (error) {
    console.error('Redeem offer error:', error.message);
    res.status(500).json({ message: 'Failed to redeem offer', error: error.message });
  }
};

module.exports = {
  createOffer,
  getVendorOffers,
  deleteOffer,
  getActiveOffers,
  getClaimedOffers,
  createOfferPaymentOrder,
  redeemOffer
};

