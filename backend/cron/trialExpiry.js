const cron = require('node-cron');
const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const { sendEmail } = require('../utils/emailUtils');

// Function to check for expired trials and send reminder emails
const processExpiredTrials = async () => {
  console.log('🔄 Running cron job: Checking for expired trials...');
  
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Find all trial orders that have ended but are still active
    const expiredTrials = await Order.find({
      planType: 'Trial',
      endDate: { $lt: now },
      orderStatus: { $nin: ['Delivered', 'Cancelled'] }
    }).populate('vendorId').populate('userId');

    console.log(`📋 Found ${expiredTrials.length} expired trials to process`);

    for (const order of expiredTrials) {
try {
        // Update order status to indicate trial has ended
        order.orderStatus = 'Trial Expired';
        await order.save();

        // FIX 6: Also update Subscription status to 'expired'
        await Subscription.findOneAndUpdate(
          { userId: order.userId._id, status: 'active', planType: 'Trial' },
          { status: 'expired' }
        );

        // Send reminder email to user
        const emailSubject = `⏰ Your Free Trial Has Ended - ${order.vendorId.kitchenName} - MealSetu`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #f26522 0%, #ff6b35 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">⏰ Trial Period Ended</h1>
            </div>
            <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
              <p style="font-size: 16px;">Dear <strong>${order.userId.name}</strong>,</p>
              <p style="font-size: 16px;">Your 2-day free trial from <strong>${order.vendorId.kitchenName}</strong> has ended.</p>
              
              <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px solid #f26522;">
                <h3 style="color: #f26522; margin: 0 0 15px 0;">📋 Trial Summary</h3>
                <p style="margin: 8px 0;"><strong>🏪 Vendor:</strong> ${order.vendorId.kitchenName}</p>
                <p style="margin: 8px 0;"><strong>📅 Trial Started:</strong> ${order.startDate ? new Date(order.startDate).toLocaleDateString('en-IN') : 'N/A'}</p>
                <p style="margin: 8px 0;"><strong>📅 Trial Ended:</strong> ${order.endDate ? new Date(order.endDate).toLocaleDateString('en-IN') : 'N/A'}</p>
              </div>
              
              <p style="color: #555; font-size: 16px;">Don't miss out on continuing your meal subscription! Subscribe now to enjoy delicious home-cooked meals daily.</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="#" style="background: #f26522; color: white; padding: 15px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 16px; display: inline-block;">Subscribe Now</a>
              </div>
              
              <p style="color: #999; font-size: 14px;">Or subscribe to a weekly or monthly plan to continue enjoying meals from ${order.vendorId.kitchenName}</p>
            </div>
            <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
              <p>MealSetu - Quality Food, Delivered with Care</p>
            </div>
        `;

        await sendEmail(order.userId.email, emailSubject, emailHtml);

        console.log(`✅ Sent trial expiry reminder for order ${order._id} to user ${order.userId.email}`);
      } catch (orderError) {
        console.error(`❌ Error processing trial order ${order._id}:`, orderError);
      }
    }

    console.log('✅ Cron job completed: Processed expired trials');
  } catch (error) {
    console.error('❌ Cron job error:', error);
  }
};

// Schedule cron job to run every day at 8 AM
const startTrialExpiryCron = () => {
  console.log('📅 Trial expiry cron job scheduled to run daily at 8 AM');
  
  // Schedule for 8 AM every day
  cron.schedule('0 8 * * *', () => {
    processExpiredTrials();
  });
};

module.exports = {
  startTrialExpiryCron,
  processExpiredTrials
};
