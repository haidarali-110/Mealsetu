const admin = require('firebase-admin');
const path  = require('path');

// ── Firebase Admin init (singleton) ─────────────────────────────────────────
if (!admin.apps.length) {
  try {
    const serviceAccount = require(
      path.resolve(
        process.env.FIREBASE_SERVICE_ACCOUNT || './firebase-service-account.json'
      )
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId:  process.env.FIREBASE_PROJECT_ID,
    });
  } catch (initErr) {
    console.warn('Firebase Admin init bypassed or service account not found:', initErr.message);
  }
}

// ── Core send ────────────────────────────────────────────────────────────────

const sendNotification = async ({ token, tokens, title, body, data = {}, imageUrl }) => {
  try {
    const message = {
      notification: { title, body },
      // FCM data values must all be strings
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        notification: {
          channelId: 'mealsetu_channel',
          priority:  'high',
          sound:     'default',
          icon:      'ic_launcher',
          color:     '#F26522',
          ...(imageUrl && { imageUrl }),
        },
        priority: 'high',
      },
      apns: {
        payload: {
          aps: { sound: 'default', badge: 1, contentAvailable: true },
        },
      },
    };

    if (tokens && tokens.length > 0) {
      const validTokens = tokens.filter(Boolean);
      if (validTokens.length === 0) return null;
      const response = await admin.messaging().sendEachForMulticast({
        ...message,
        tokens: validTokens,
      });
      console.log(`📱 FCM multicast: ${response.successCount}/${validTokens.length} delivered`);
      return response;
    }

    if (token) {
      const response = await admin.messaging().send({ ...message, token });
      console.log('📱 FCM sent:', response);
      return response;
    }
  } catch (error) {
    console.error('FCM error:', error.message);
    return null;
  }
};

// ── Helper: resolve FCM token for any user ───────────────────────────────────

const getUserFCMToken = async (userId) => {
  const User = require('../models/User');
  return User.findById(userId).select('fcmToken name').lean();
};

const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

// ── Notification templates ────────────────────────────────────────────────────

// 1. Order confirmed (to user)
const notifyOrderConfirmed = async (userId, orderData) => {
  const user = await getUserFCMToken(userId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '✅ Order Confirmed!',
    body:  `Your ${orderData.planType} plan from ${orderData.vendorName} is confirmed. Starts ${formatDate(orderData.startDate)}`,
    data:  {
      type:    'order_confirmed',
      orderId: String(orderData.orderId || ''),
      screen:  'subscription',
    },
  });
};

// 2. Delivery partner assigned (to user)
const notifyDeliveryAssigned = async (userId, riderName, orderId) => {
  const user = await getUserFCMToken(userId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '🛵 Delivery Partner Assigned!',
    body:  `${riderName} will deliver your meal today. Track live!`,
    data:  {
      type:    'delivery_assigned',
      orderId: String(orderId || ''),
      screen:  'subscription',
    },
  });
};

// 3. Meal picked up (to user)
const notifyMealPickedUp = async (userId, riderName) => {
  const user = await getUserFCMToken(userId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '📦 Meal Picked Up!',
    body:  `${riderName} has picked up your tiffin and is on the way!`,
    data:  { type: 'meal_picked_up', screen: 'subscription' },
  });
};

// 4. Out for delivery (to user)
const notifyOutForDelivery = async (userId, etaTime) => {
  const user = await getUserFCMToken(userId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '🚀 Almost There!',
    body:  `Your meal is on the way! Expected arrival: ${etaTime || 'soon'}`,
    data:  { type: 'out_for_delivery', screen: 'subscription' },
  });
};

// 5. Delivered (to user)
const notifyDelivered = async (userId, vendorName) => {
  const user = await getUserFCMToken(userId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '🎉 Meal Delivered!',
    body:  `Your ${vendorName} tiffin has been delivered. Enjoy! Rate your experience.`,
    data:  { type: 'delivered', screen: 'subscription' },
  });
};

// 6. Plan expiring soon (to user) — called by cron
const notifyPlanExpiring = async (userId, vendorName, daysLeft) => {
  const user = await getUserFCMToken(userId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '⏰ Plan Expiring Soon!',
    body:  `Your ${vendorName} plan expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. Renew now!`,
    data:  { type: 'plan_expiring', screen: 'subscription' },
  });
};

// 7. New offer (to user)
const notifyNewOffer = async (userId, offerData) => {
  const user = await getUserFCMToken(userId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '🎁 New Offer for You!',
    body:  `${offerData.vendorName}: ${offerData.discountPercent}% OFF on ${offerData.planType} plan. Limited time!`,
    data:  {
      type:    'new_offer',
      offerId: String(offerData.offerId || ''),
      screen:  'offers',
    },
  });
};

// 8. Loyalty points earned (to user)
const notifyPointsEarned = async (userId, points, totalPoints) => {
  const user = await getUserFCMToken(userId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '🏅 Points Earned!',
    body:  `You earned ${points} loyalty points! Total: ${totalPoints} pts. Redeem for wallet credit.`,
    data:  {
      type:   'points_earned',
      points: String(points),
      screen: 'loyalty',
    },
  });
};

// 9. New order (to vendor)
const notifyVendorNewOrder = async (vendorUserId, customerName, planType, amount) => {
  const user = await getUserFCMToken(vendorUserId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '🆕 New Order Received!',
    body:  `${customerName} subscribed to ${planType} plan. Amount: ₹${amount}`,
    data:  { type: 'new_order', screen: 'orders' },
  });
};

// 10. Payment received (to vendor)
const notifyVendorPayment = async (vendorUserId, customerName, amount) => {
  const user = await getUserFCMToken(vendorUserId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '💰 Payment Confirmed!',
    body:  `₹${amount} received from ${customerName}`,
    data:  { type: 'payment_received', screen: 'dashboard' },
  });
};

// 11. New review (to vendor)
const notifyVendorNewReview = async (vendorUserId, customerName, rating) => {
  const user = await getUserFCMToken(vendorUserId);
  if (!user?.fcmToken) return;
  const stars = '⭐'.repeat(Math.min(Math.max(rating, 1), 5));
  return sendNotification({
    token: user.fcmToken,
    title: `${stars} New Review!`,
    body:  `${customerName} gave you ${rating}/5 stars. Check your reviews.`,
    data:  { type: 'new_review', screen: 'reviews' },
  });
};

// 12. New batch assigned (to delivery rider)
const notifyRiderNewBatch = async (riderUserId, area, orderCount, pickupTime, mealSlot) => {
  const user = await getUserFCMToken(riderUserId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '📦 New Delivery Batch!',
    body:  `${orderCount} orders in ${area}. ${mealSlot === 'lunch' ? '🌞 Lunch' : '🌙 Dinner'} pickup at ${pickupTime}`,
    data:  {
      type:       'new_batch',
      area:       area || '',
      orderCount: String(orderCount),
      screen:     'batches',
    },
  });
};

// 13. Order flagged — not received (to vendor)
const notifyOrderFlagged = async (vendorUserId, customerName, orderId) => {
  const user = await getUserFCMToken(vendorUserId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '🚨 Delivery Issue Reported',
    body:  `${customerName} reported not receiving their tiffin. Please review.`,
    data:  {
      type:    'order_flagged',
      orderId: String(orderId || ''),
      screen:  'orders',
    },
  });
};

// 14. Bulk notification (to multiple users)
const notifyAllUsers = async (userIds, title, body, data = {}) => {
  const User = require('../models/User');
  const users = await User.find({
    _id:      { $in: userIds },
    fcmToken: { $exists: true, $ne: null },
  }).select('fcmToken').lean();

  const tokens = users.map((u) => u.fcmToken).filter(Boolean);
  if (tokens.length === 0) return;

  const BATCH_SIZE = 500;
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    await sendNotification({
      tokens: tokens.slice(i, i + BATCH_SIZE),
      title,
      body,
      data,
    });
  }
};

// 15. Leave applied + subscription extended (to user)
const notifyLeaveApplied = async (userId, leaveDays, newExpiry) => {
  const user = await getUserFCMToken(userId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '📅 Leave Applied!',
    body:  `${leaveDays} day(s) of leave recorded. Subscription extended to ${formatDate(newExpiry)}.`,
    data:  { type: 'leave_applied', screen: 'subscription' },
  });
};

// 16. Trial order confirmed (to user)
const notifyTrialConfirmed = async (userId, vendorName, orderId) => {
  const user = await getUserFCMToken(userId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '🍱 Trial Started!',
    body:  `Your 2-day trial with ${vendorName} is now active. Enjoy your meals!`,
    data:  { type: 'trial_confirmed', orderId: String(orderId || ''), screen: 'subscription' },
  });
};

// 17. Subscription extended (to user)
const notifySubscriptionExtended = async (userId, vendorName, planType, newEndDate) => {
  const user = await getUserFCMToken(userId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '📆 Subscription Extended!',
    body:  `Your ${planType} plan with ${vendorName} is extended to ${formatDate(newEndDate)}.`,
    data:  { type: 'subscription_extended', screen: 'subscription' },
  });
};

// 18. Cash payment confirmed by vendor (to user)
const notifyCashPaymentConfirmed = async (userId, vendorName, planType) => {
  const user = await getUserFCMToken(userId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '✅ Cash Payment Confirmed!',
    body:  `${vendorName} confirmed your cash payment. Your ${planType} plan is now active!`,
    data:  { type: 'cash_payment_confirmed', screen: 'subscription' },
  });
};

// 19. Offer redeemed (to user)
const notifyOfferRedeemed = async (userId, vendorName, planType, discountedPrice) => {
  const user = await getUserFCMToken(userId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '🎁 Offer Redeemed!',
    body:  `${planType} plan from ${vendorName} for ₹${discountedPrice} confirmed. Enjoy!`,
    data:  { type: 'offer_redeemed', screen: 'subscription' },
  });
};

// 20. Vendor approved by admin (to vendor owner)
const notifyVendorApproved = async (vendorOwnerId, kitchenName) => {
  const user = await getUserFCMToken(vendorOwnerId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '🎉 Kitchen Approved!',
    body:  `${kitchenName} is now live on MealSetu. Start managing your orders!`,
    data:  { type: 'vendor_approved', screen: 'dashboard' },
  });
};

// 21. Vendor rejected by admin (to vendor owner)
const notifyVendorRejected = async (vendorOwnerId, kitchenName, reason) => {
  const user = await getUserFCMToken(vendorOwnerId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '❌ Application Not Approved',
    body:  `${kitchenName}: ${reason || 'Please review and resubmit your application.'}`,
    data:  { type: 'vendor_rejected', screen: 'compliance' },
  });
};

// 22. Commission payment confirmed (to vendor owner — self-pay or admin mark)
const notifyCommissionPaid = async (vendorOwnerId, weekLabel, amount) => {
  const user = await getUserFCMToken(vendorOwnerId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '💳 Commission Confirmed!',
    body:  `₹${amount} commission for ${weekLabel} has been confirmed. Thank you!`,
    data:  { type: 'commission_paid', screen: 'dashboard' },
  });
};

// 23. Salary paid (to rider)
const notifyRiderSalaryPaid = async (riderUserId, amount, month, paymentMethod) => {
  const user = await getUserFCMToken(riderUserId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '💰 Salary Credited!',
    body:  `₹${amount} salary for ${month} has been paid via ${paymentMethod}. Check your Stats tab.`,
    data:  {
      type:   'salary_paid',
      amount: String(amount),
      month:  month,
      screen: 'delivery-home',
    },
  });
};

// 24. Commission dispute resolved (to vendor owner)
const notifyDisputeResolved = async (vendorOwnerId, weekLabel) => {
  const user = await getUserFCMToken(vendorOwnerId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '✅ Dispute Resolved',
    body:  `Your commission dispute for ${weekLabel} has been reviewed and resolved.`,
    data:  { type: 'dispute_resolved', screen: 'dashboard' },
  });
};

// Delivery failed after all attempts (to user)
const notifyDeliveryFailed = async (userId, reason) => {
  const user = await getUserFCMToken(userId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '❌ Tiffin Not Delivered Today',
    body:  reason
      ? `We couldn't deliver your tiffin. Reason: ${reason}. Contact your vendor for help.`
      : `We couldn't deliver your tiffin today after multiple attempts. Contact your vendor for help.`,
    data:  { type: 'delivery_failed', screen: 'subscription' },
  });
};

// Vendor gave +1 free meal as compensation (to user)
const notifyFreeMealAdded = async (userId, vendorName) => {
  const user = await getUserFCMToken(userId);
  if (!user?.fcmToken) return;
  return sendNotification({
    token: user.fcmToken,
    title: '🎁 Free Meal Added!',
    body:  `${vendorName} added 1 free meal to your subscription as compensation for today's failed delivery.`,
    data:  { type: 'free_meal_added', screen: 'subscription' },
  });
};

module.exports = {
  sendNotification,
  notifyOrderConfirmed,
  notifyDeliveryAssigned,
  notifyMealPickedUp,
  notifyOutForDelivery,
  notifyDelivered,
  notifyPlanExpiring,
  notifyNewOffer,
  notifyPointsEarned,
  notifyVendorNewOrder,
  notifyVendorPayment,
  notifyVendorNewReview,
  notifyRiderNewBatch,
  notifyOrderFlagged,
  notifyAllUsers,
  notifyLeaveApplied,
  notifyTrialConfirmed,
  notifySubscriptionExtended,
  notifyCashPaymentConfirmed,
  notifyOfferRedeemed,
  notifyVendorApproved,
  notifyVendorRejected,
  notifyCommissionPaid,
  notifyDisputeResolved,
  notifyRiderSalaryPaid,
  notifyDeliveryFailed,
  notifyFreeMealAdded,
};
