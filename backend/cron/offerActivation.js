const cron = require('node-cron');
const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
const Offer = require('../models/Offer');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const { sendEmail } = require('../utils/emailUtils');

// Function to process pending offer orders
const processPendingOfferOrders = async () => {
  console.log('🔄 Running cron job: Processing pending offer orders...');
  
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Find all pending orders where scheduled activation date has arrived
    const pendingOrders = await Order.find({
      isOfferOrder: true,
      offerStatus: 'pending',
      scheduledActivationDate: { $lte: now }
    }).populate('vendorId').populate('userId').populate('offerId');

    console.log(`📋 Found ${pendingOrders.length} pending offer orders to process`);

    for (const order of pendingOrders) {
      try {
        // Check if the offer is still valid
        const offer = await Offer.findById(order.offerId);
        
        if (!offer) {
          // Offer was deleted - cancel the order and notify user
          order.offerStatus = 'expired';
          await order.save();
          
          await sendEmail(
            order.userId.email,
            '⚠️ Offer Update - MealSetu',
            `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #ef4444;">Offer No Longer Available</h1>
              <p>Dear ${order.userId.name},</p>
              <p>We regret to inform you that the offer you redeemed from <strong>${order.vendorId.kitchenName}</strong> is no longer available as the offer has been removed by the vendor.</p>
              <p>Please browse new offers on your dashboard to find other exciting deals!</p>
              <a href="#" style="background: #f26522; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">Browse Offers</a>
              <hr/>
              <p style="color: #999; font-size: 12px;">MealSetu - Quality Food, Delivered with Care</p>
            </div>`
          );
          continue;
        }

        // Check if offer is still active
        const offerEndDate = new Date(offer.endDate);
        offerEndDate.setHours(23, 59, 59, 999);
        
        if (now > offerEndDate) {
          // Offer has expired - cancel the order and notify user
          order.offerStatus = 'expired';
          await order.save();
          
          await sendEmail(
            order.userId.email,
            '⚠️ Offer Expired - MealSetu',
            `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #ef4444;">Offer Expired</h1>
              <p>Dear ${order.userId.name},</p>
              <p>We regret to inform you that the offer from <strong>${order.vendorId.kitchenName}</strong> that you redeemed has expired before it could be activated.</p>
              <div style="background: #f5f5f5; padding: 15px; margin: 15px 0;">
                <p><strong>Plan:</strong> ${order.planType}</p>
                <p><strong>Offer Valid Until:</strong> ${offerEndDate.toLocaleDateString()}</p>
              </div>
              <p>Please browse new offers on your dashboard to find other exciting deals!</p>
              <a href="#" style="background: #f26522; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">Browse Offers</a>
              <hr/>
              <p style="color: #999; font-size: 12px;">MealSetu - Quality Food, Delivered with Care</p>
            </div>`
          );
          continue;
        }

        // Activate the order
        order.offerStatus = 'active';
        order.orderStatus = 'Preparing';
        order.status = 'active';
        await order.save();

        // Update the subscription to active
        await Subscription.findOneAndUpdate(
          { userId: order.userId._id, offerId: offer._id, status: 'pending' },
          { status: 'active' }
        );

        // Update user expiry date
        const subscription = await Subscription.findOne({
          userId: order.userId._id,
          vendorId: order.vendorId._id,
          status: 'active'
        });

        if (subscription) {
          await User.findByIdAndUpdate(order.userId._id, {
            expiryDate: subscription.expiryDate
          });
        }

        // Send activation email to user
        const emailSubject = `🎉 Your Discounted Plan is Now Active! - ${order.vendorId.kitchenName}`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">🎉 Offer Activated!</h1>
            </div>
            <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
              <p style="font-size: 16px;">Dear <strong>${order.userId.name}</strong>,</p>
              <p style="font-size: 16px;">Great news! Your discounted plan from <strong>${order.vendorId.kitchenName}</strong> is now active!</p>
              
              <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px solid #16a34a;">
                <h3 style="color: #16a34a; margin: 0 0 15px 0;">📋 Order Details</h3>
                <p style="margin: 8px 0;"><strong>🏪 Vendor:</strong> ${order.vendorId.kitchenName}</p>
                <p style="margin: 8px 0;"><strong>📦 Plan Type:</strong> ${order.planType}</p>
                <p style="margin: 8px 0;"><strong>💰 Original Price:</strong> ₹${order.originalPrice}</p>
                <p style="margin: 8px 0;"><strong>🏷️ Discount:</strong> ${order.discountPercentage}% OFF</p>
                <p style="margin: 8px 0; font-size: 18px; color: #16a34a;"><strong>✅ Amount Paid:</strong> ₹${order.discountedPrice}</p>
                <p style="margin: 8px 0;"><strong>📅 Start Date:</strong> ${new Date(order.scheduledActivationDate).toLocaleDateString('en-IN')}</p>
                <p style="margin: 8px 0;"><strong>📅 End Date:</strong> ${subscription ? new Date(subscription.expiryDate).toLocaleDateString('en-IN') : 'N/A'}</p>
              </div>
              
              <p style="color: #555;">Your discounted meal subscription is now active. Enjoy your delicious meals!</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="#" style="background: #f26522; color: white; padding: 15px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 16px; display: inline-block;">Order Your Meals Now</a>
              </div>
            </div>
            <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
              <p>MealSetu - Quality Food, Delivered with Care</p>
            </div>
          </div>
        `;

        await sendEmail(order.userId.email, emailSubject, emailHtml);

        console.log(`✅ Activated offer order ${order._id} for user ${order.userId.name}`);
      } catch (orderError) {
        console.error(`❌ Error processing order ${order._id}:`, orderError);
      }
    }

    console.log('✅ Cron job completed: Processed pending offer orders');
  } catch (error) {
    console.error('❌ Cron job error:', error);
  }
};

// Function to process all pending subscription orders (including non-offer extensions)
const processPendingSubscriptionOrders = async () => {
  console.log('🔄 Running cron job: Processing pending subscription orders...');
  
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const today = new Date(now);

    // FIX 5: Also find pending orders where startDate <= today (missed by previous runs)
    const pendingOrders = await Order.find({
      status: 'pending',
      $or: [
        { scheduledStartDate: { $lte: now } },
        { startDate: { $lte: now } }
      ]
    }).populate('vendorId').populate('userId');

    console.log(`📋 Found ${pendingOrders.length} pending subscription orders to process`);

    for (const order of pendingOrders) {
      try {
        // Check if there's a previous active order that needs to be expired
        const previousActiveOrder = await Order.findOne({
          userId: order.userId._id,
          status: 'active',
          _id: { $ne: order._id }
        }).sort({ endDate: -1 });

        // If previous order has ended, expire it first
        if (previousActiveOrder && previousActiveOrder.endDate) {
          const prevEndDate = new Date(previousActiveOrder.endDate);
          if (prevEndDate < now) {
            previousActiveOrder.status = 'expired';
            await previousActiveOrder.save();
            console.log(`⏰ Expired previous order ${previousActiveOrder._id} for user ${order.userId.name}`);
          }
        }

        // Calculate actual start and end dates
        const startDate = order.scheduledStartDate || now;
        let endDate = order.scheduledEndDate;
        
        // If no scheduledEndDate, calculate based on plan type
        if (!endDate) {
          const durationDays = order.planType === 'Weekly' ? 7 : order.planType === 'Monthly' ? 30 : 7;
          endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + durationDays);
        }

// Update order status to active
        order.status = 'active';
        order.startDate = startDate;
        order.endDate = endDate;
        await order.save();

        // FIX 3: Also update the subscription if exists - match by BOTH userId AND vendorId
        const existingSub = await Subscription.findOne({
          userId: order.userId._id,
          vendorId: order.vendorId._id,
          status: 'pending'
        });

        if (existingSub) {
          existingSub.status = 'active';
          existingSub.startDate = startDate;
          existingSub.expiryDate = endDate;
          existingSub.planType = order.planType;
          await existingSub.save();
        } else {
          // Create new subscription if not exists
          await Subscription.create({
            userId: order.userId._id,
            vendorId: order.vendorId._id,
            planType: order.planType,
            startDate: startDate,
            expiryDate: endDate,
            status: 'active',
            customerName: order.userId.name,
            contact: order.userId.phone
          });
        }

        // Update user expiry date
        await User.findByIdAndUpdate(order.userId._id, {
          expiryDate: endDate
        });

        // FIX 5: Send Socket.IO notification
        if (global.io) {
          global.io.to(order.userId._id.toString()).emit('subscriptionUpdate', {
            message: 'Your upcoming plan is now active!',
            planType: order.planType
          });
          global.io.to('admin_room').emit('orderUpdate', {
            message: 'Order auto-activated'
          });
        }

        // Send activation email to user
        const emailSubject = '🎉 Your Upcoming Plan is Now Active! - MealSetu';
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">🎉 Plan Activated!</h1>
            </div>
            <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
              <p style="font-size: 16px;">Dear <strong>${order.userId.name}</strong>,</p>
              <p style="font-size: 16px;">Great news! Your upcoming plan from <strong>${order.vendorId?.kitchenName || 'MealSetu'}</strong> is now <strong>active</strong>!</p>
              
              <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px solid #16a34a;">
                <h3 style="color: #16a34a; margin: 0 0 15px 0;">📋 Plan Details</h3>
                <p style="margin: 8px 0;"><strong>🏪 Kitchen:</strong> ${order.vendorId?.kitchenName || 'MealSetu'}</p>
                <p style="margin: 8px 0;"><strong>📦 Plan Type:</strong> ${order.planType}</p>
                <p style="margin: 8px 0;"><strong>💰 Amount Paid:</strong> ₹${order.amount}</p>
                <p style="margin: 8px 0;"><strong>📅 Start Date:</strong> ${new Date(startDate).toLocaleDateString('en-IN')}</p>
                <p style="margin: 8px 0;"><strong>📅 End Date:</strong> ${new Date(endDate).toLocaleDateString('en-IN')}</p>
              </div>
              
              <p style="color: #555;">Thank you for choosing MealSetu! Enjoy your delicious meals!</p>
            </div>
            <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
              <p>MealSetu - Quality Food, Delivered with Care</p>
            </div>
          </div>
        `;

        await sendEmail(order.userId.email, emailSubject, emailHtml);

        console.log(`✅ Activated subscription order ${order._id} for user ${order.userId.name}`);
      } catch (orderError) {
        console.error(`❌ Error processing subscription order ${order._id}:`, orderError);
      }
    }

    console.log('✅ Cron job completed: Processed pending subscription orders');
  } catch (error) {
    console.error('❌ Cron job error:', error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Send expiry reminder emails
//
// Rules (fixed):
//  1. Only send when EXACTLY 2 days left  (one email, never repeated)
//  2. Only send when EXACTLY 1 day left   (one email, never repeated)
//  3. Skip entirely if user already has an upcoming pending plan
//  4. Flags (reminder2DaySent / reminder1DaySent) on Subscription prevent
//     duplicate sends even though the cron runs every hour
// ─────────────────────────────────────────────────────────────────────────────
const sendExpiryReminders = async () => {
  console.log('🔄 Running cron job: Sending expiry reminder emails...');

  try {
    // Work in whole-day units — both "now" and expiry compared at midnight
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    // Active subscriptions expiring in exactly 1 or 2 days
    const day1 = new Date(todayMidnight); day1.setDate(day1.getDate() + 1);
    const day2 = new Date(todayMidnight); day2.setDate(day2.getDate() + 2);
    const day3 = new Date(todayMidnight); day3.setDate(day3.getDate() + 3); // exclusive upper bound

    // Fetch active subscriptions expiring within the next 1–2 days
    const subs = await Subscription.find({
      status:     'active',
      expiryDate: { $gte: day1, $lt: day3 }   // tomorrow or day-after-tomorrow
    }).populate('userId', 'name email');

    let sentCount = 0;

    for (const sub of subs) {
      try {
        const user = sub.userId;
        if (!user?.email) continue;

        // ── Normalise expiry to midnight for clean day-diff arithmetic ────
        const expiryMidnight = new Date(sub.expiryDate);
        expiryMidnight.setHours(0, 0, 0, 0);

        const daysRemaining = Math.round(
          (expiryMidnight - todayMidnight) / (1000 * 60 * 60 * 24)
        );

        // Only act on exactly 2 or 1 day(s) remaining
        if (daysRemaining !== 2 && daysRemaining !== 1) continue;

        // ── Already sent this reminder? Skip ──────────────────────────────
        if (daysRemaining === 2 && sub.reminder2DaySent) continue;
        if (daysRemaining === 1 && sub.reminder1DaySent) continue;

        // ── User has an upcoming pending plan? Skip ───────────────────────
        const hasUpcomingPlan = await Order.findOne({
          userId:              user._id,
          status:              'pending',
          scheduledStartDate:  { $gt: todayMidnight }   // future start only
        }).lean();

        if (hasUpcomingPlan) {
          console.log(`⏭️  Skipped reminder for ${user.email} — upcoming plan exists`);
          continue;
        }

        // ── Build and send email ──────────────────────────────────────────
        const label        = daysRemaining === 1 ? 'Tomorrow!' : 'in 2 Days';
        const urgencyColor = daysRemaining === 1 ? '#dc2626' : '#f59e0b';

        const emailSubject = `⏰ Your Meal Plan Expires ${label} — MealSetu`;
        const emailHtml = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:linear-gradient(135deg,${urgencyColor} 0%,${daysRemaining === 1 ? '#ef4444' : '#fbbf24'} 100%);
                        padding:30px;text-align:center;border-radius:10px 10px 0 0">
              <h1 style="color:white;margin:0">⏰ Plan Expiring ${label}</h1>
            </div>
            <div style="background:#f8f9fa;padding:30px;border-radius:0 0 10px 10px">
              <p style="font-size:16px">Dear <strong>${user.name}</strong>,</p>
              <p style="font-size:16px">
                Your current meal plan expires
                <strong style="color:${urgencyColor}">
                  ${daysRemaining === 1 ? 'tomorrow' : 'in 2 days'}
                </strong>!
              </p>

              <div style="background:white;padding:20px;border-radius:10px;margin:20px 0;
                          border:2px solid ${urgencyColor}">
                <h3 style="color:${urgencyColor};margin:0 0 15px 0">📋 Current Plan</h3>
                <p style="margin:8px 0"><strong>📅 Expires On:</strong>
                  ${expiryMidnight.toLocaleDateString('en-IN')}</p>
                <p style="margin:8px 0"><strong>⏱️ Days Remaining:</strong>
                  ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}</p>
              </div>

              <p style="color:${urgencyColor};font-size:16px;font-weight:bold">
                ⚠️ Extend now to avoid missing your meals!
              </p>

              <div style="text-align:center;margin:30px 0">
                <a href="#"
                   style="background:#f26522;color:white;padding:15px 40px;
                          text-decoration:none;border-radius:30px;
                          font-weight:bold;font-size:16px;display:inline-block">
                  Extend Subscription Now
                </a>
              </div>

              <p style="color:#555">Thank you for choosing MealSetu!</p>
            </div>
            <div style="text-align:center;padding:20px;color:#999;font-size:12px">
              <p>MealSetu - Quality Food, Delivered with Care</p>
            </div>
          </div>`;

        await sendEmail(user.email, emailSubject, emailHtml);

        // ── Mark flag so this reminder is never sent again ────────────────
        if (daysRemaining === 2) sub.reminder2DaySent = true;
        if (daysRemaining === 1) sub.reminder1DaySent = true;
        await sub.save();

        sentCount++;
        console.log(`📧 Sent ${daysRemaining}-day reminder to ${user.email}`);

      } catch (subErr) {
        console.error(`❌ Error processing subscription ${sub._id}:`, subErr.message);
      }
    }

    console.log(`✅ Expiry reminders done — sent: ${sentCount}`);
  } catch (error) {
    console.error('❌ sendExpiryReminders error:', error);
  }
};

// FIX 2: Process expired active subscriptions and activate next pending (including Order sync + Socket.IO)
// FIX: Query Order collection using endDate (not Subscription.expiryDate) - THIS WAS THE ROOT CAUSE BUG
const processExpiredSubscriptions = async () => {
  console.log('🔄 Running cron job: Processing expired subscriptions...');
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // FIX: Query ORDERS (not Subscriptions) by endDate - THIS IS THE CORRECT LOGIC
    const expiredOrders = await Order.find({
      status: 'active',
      endDate: { $lte: now }
    }).populate('userId').populate('vendorId');

    console.log(`📋 Found ${expiredOrders.length} expired orders to process`);

    for (const order of expiredOrders) {
      const userId = order.userId._id;
      try {
        // Mark order as completed
        order.status = 'completed';
        await order.save();
        console.log(`⏰ Expired order ${order._id} for user ${order.userId.name}`);

        // Mark subscription as expired
        await Subscription.findOneAndUpdate(
          { userId: userId, status: 'active' },
          { status: 'expired' }
        );

        // Find next pending order (earliest scheduledStartDate)
        const nextPending = await Order.findOne({
          userId: userId,
          status: 'pending'
        }).sort({ scheduledStartDate: 1 }).populate('userId').populate('vendorId');

        if (nextPending) {
          // Calculate duration based on planType
          let durationDays = 7;
          if (nextPending.planType === 'Monthly') durationDays = 30;
          else if (nextPending.planType === 'Trial') durationDays = 2;

          // FIX: Activate with TODAY's dates (ignore scheduledStartDate - activate immediately)
          const startDate = new Date();
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + durationDays);

          // Activate the pending order
          nextPending.status = 'active';
          nextPending.startDate = startDate;
          nextPending.endDate = endDate;
          await nextPending.save();
          console.log(`✅ Activated order ${nextPending._id}`);

          // Update or create Subscription
          const existingSub = await Subscription.findOne({ userId: userId });
          if (existingSub) {
            existingSub.status = 'active';
            existingSub.planType = nextPending.planType;
            existingSub.startDate = startDate;
            existingSub.expiryDate = endDate;
            existingSub.vendorId = nextPending.vendorId._id;
            await existingSub.save();
          } else {
            await Subscription.create({
              userId: userId,
              vendorId: nextPending.vendorId._id,
              planType: nextPending.planType,
              startDate: startDate,
              expiryDate: endDate,
              status: 'active',
              customerName: nextPending.userId.name,
              contact: nextPending.userId.phone
            });
          }

          // Update user expiryDate
          await User.findByIdAndUpdate(userId, { expiryDate: endDate });

          // Socket notification
          if (global.io) {
            global.io.to(userId.toString()).emit('subscriptionUpdate', {
              message: 'Your next plan is now active!',
              planType: nextPending.planType
            });
            global.io.to('admin_room').emit('orderUpdate', {
              message: 'Subscription auto-activated'
            });
          }

          // Send email
          try {
            await sendEmail(
              nextPending.userId.email,
              'MealSetu - Your Next Plan is Now Active!',
              `<div style="font-family: Arial, sans-serif;">
                <h2 style="color: #16a34a;">Your ${nextPending.planType} Plan is Now Active!</h2>
                <p>Dear ${nextPending.userId.name},</p>
                <p>Your previous plan expired and your next plan is now active.</p>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px;">
                  <p><strong>Plan:</strong> ${nextPending.planType}</p>
                  <p><strong>Kitchen:</strong> ${nextPending.vendorId.kitchenName}</p>
                  <p><strong>Start Date:</strong> ${startDate.toLocaleDateString('en-IN')}</p>
                  <p><strong>End Date:</strong> ${endDate.toLocaleDateString('en-IN')}</p>
                  <p><strong>Amount:</strong> Rs.${nextPending.amount}</p>
                </div>
                <p>Enjoy your meals!</p>
              </div>`
            );
            console.log(`📧 Email sent to ${nextPending.userId.email}`);
          } catch (emailError) {
            console.error('❌ Email failed:', emailError.message);
          }

          console.log(`✅ Activated next pending order ${nextPending._id} for user ${order.userId.name}`);
        } else {
          console.log(`ℹ️ No pending order found for user ${order.userId.name}`);
        }
      } catch (userError) {
        console.error(`❌ Error processing user ${userId}:`, userError);
      }
    }
    console.log('✅ Cron job completed: Processed expired subscriptions');
  } catch (error) {
    console.error('❌ Cron error in processExpiredSubscriptions:', error);
  }
};



// Combined function to run all subscription-related cron tasks
const processAllSubscriptions = async () => {
  console.log('=== Starting combined subscription cron job ===');
  await processExpiredSubscriptions();
  await processPendingOfferOrders();
  await processPendingSubscriptionOrders();
  await sendExpiryReminders();
  console.log('=== Completed combined subscription cron job ===');
};


// Schedule cron job to run every hour
// The cron expression: '0 * * * *' means at minute 0 of every hour
const startOfferActivationCron = () => {
  console.log('📅 Subscription cron job (incl. auto-activation on expiry) scheduled every hour');
  
  // Run IMMEDIATELY on startup to catch any missed activations
  processAllSubscriptions();
  
  // Schedule for every hour (at minute 0)
  cron.schedule('0 * * * *', () => {
    processAllSubscriptions();
  });
};

module.exports = {
  startOfferActivationCron,
  processExpiredSubscriptions,
  processPendingOfferOrders,
  processPendingSubscriptionOrders,
  sendExpiryReminders,
  processAllSubscriptions
};


