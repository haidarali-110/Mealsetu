const cron        = require('node-cron');
const Vendor      = require('../models/Vendor');
const Order       = require('../models/Order');
const { sendEmail } = require('../utils/emailUtils');

// Sends a "kitchen has reopened" email to all active subscribers of a vendor.
// closureType: 'planned' | 'emergency'
// opts.missedMeals / opts.extensionDays — from meal calculator; defaults to 0 if not provided.
const sendKitchenReopenEmail = async (vendorId, kitchenName, closureType = 'planned', { missedMeals = 0, extensionDays = 0 } = {}) => {
  const subscribers = await Order.find({
    vendorId,
    status:  { $in: ['active', 'pending'] },
    endDate: { $gte: new Date() }
  }).populate('userId', 'email name');

  // Build extension message based on exact meal count
  let extensionText;
  if (missedMeals === 0) {
    extensionText = 'No meals were missed during the closure — your plan end date is unchanged.';
  } else if (missedMeals === 1) {
    extensionText = '1 meal was missed. Your plan has been extended by half a day (1 extra meal delivered).';
  } else {
    extensionText = `${missedMeals} meals were missed. Your plan has been extended by ${extensionDays} day${extensionDays !== 1 ? 's' : ''}.`;
  }

  for (const order of subscribers) {
    if (!order.userId?.email) continue;
    const newEndFormatted = new Date(order.endDate).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
    try {
      await sendEmail(
        order.userId.email,
        `✅ ${kitchenName} is Back Open!`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#16a34a;padding:24px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="color:white;margin:0;font-size:20px">✅ Kitchen Reopened!</h1>
          </div>
          <div style="padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
            <p>Dear ${order.userId.name},</p>
            <p>Great news — <strong>${kitchenName}</strong> has reopened!</p>
            <div style="background:#dcfce7;border-left:4px solid #16a34a;border-radius:8px;padding:16px;margin:16px 0">
              <p style="margin:0 0 6px;font-weight:700;color:#166534">✅ Your Plan Update</p>
              <p style="margin:0 0 6px;color:#374151">${extensionText}</p>
              <p style="margin:0;color:#374151">Plan valid until: <strong style="color:#16a34a">${newEndFormatted}</strong></p>
            </div>
            <p style="color:#64748b;font-size:13px">Thank you for your patience — MealSetu Team</p>
          </div>
        </div>`
      );
    } catch (emailErr) {
      console.error(`[sendKitchenReopenEmail] Failed for ${order.userId.email}:`, emailErr.message);
    }
  }
};

// Finds and reopens all vendors whose planned closure endDate has passed.
// Called both from the cron and on server startup.
const runAutoReopen = async () => {
  const now = new Date();
  const overdueVendors = await Vendor.find({
    isOpen:                          false,
    'currentClosure.isActive':       true,
    'currentClosure.closureType':    'planned',
    'currentClosure.endDate':        { $lt: now }
  });

  console.log(`[autoReopen] Found ${overdueVendors.length} overdue planned closure(s)`);

  for (const vendor of overdueVendors) {
    try {
      // Capture meal data before clearing
      const missedMeals   = vendor.currentClosure.missedMeals;
      const extensionDays = vendor.currentClosure.extensionDays;

      vendor.isOpen = true;
      vendor.currentClosure = {
        isActive:      false,
        startDate:     null,
        endDate:       null,
        reason:        null,
        closureType:   null,
        closedAt:      null,
        missedMeals:   null,
        extensionDays: null
      };
      await vendor.save();
      console.log(`[autoReopen] Reopened ${vendor.kitchenName} (${vendor._id})`);
      await sendKitchenReopenEmail(vendor._id, vendor.kitchenName, 'planned', { missedMeals, extensionDays });
    } catch (vendorErr) {
      console.error(`[autoReopen] Failed for vendor ${vendor._id}:`, vendorErr.message);
    }
  }
};

const startKitchenClosureCron = () => {
  // Runs every day at 9 AM IST (3:30 AM UTC)
  // Sends advance notification emails for planned closures starting in 2 days
  cron.schedule('30 3 * * *', async () => {
    try {
      const now = new Date();
      const twoDaysFromNow = new Date(now);
      twoDaysFromNow.setUTCDate(twoDaysFromNow.getUTCDate() + 2);
      twoDaysFromNow.setUTCHours(0, 0, 0, 0);

      const nextDay = new Date(twoDaysFromNow);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);

      // Find vendors with planned closures starting in exactly 2 days, not yet notified
      const vendors = await Vendor.find({
        plannedClosures: {
          $elemMatch: {
            startDate:   { $gte: twoDaysFromNow, $lt: nextDay },
            notifiedAt:  null,
            closureType: 'planned'
          }
        }
      });

      for (const vendor of vendors) {
        const closure = vendor.plannedClosures.find(
          c =>
            c.startDate >= twoDaysFromNow &&
            c.startDate <  nextDay &&
            !c.notifiedAt &&
            c.closureType === 'planned'
        );
        if (!closure) continue;

        const activeOrders = await Order.find({
          vendorId: vendor._id,
          status:   'active',
          endDate:  { $gte: now }
        }).populate('userId', 'email name');

        for (const order of activeOrders) {
          if (!order.userId?.email) continue;
          try {
            await sendEmail(
              order.userId.email,
              `Reminder: ${vendor.kitchenName} closing in 2 days`,
              `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <div style="background:#f26522;padding:24px;text-align:center;border-radius:12px 12px 0 0">
                  <h1 style="color:white;margin:0;font-size:20px">📅 Kitchen Closure Reminder</h1>
                </div>
                <div style="padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
                  <p>Dear ${order.userId.name},</p>
                  <p><strong>${vendor.kitchenName}</strong> will be closed from
                     <strong>${new Date(closure.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</strong>
                     to
                     <strong>${new Date(closure.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</strong>.</p>
                  <div style="background:#f0f9ff;border-left:4px solid #3b82f6;border-radius:8px;padding:14px;margin:16px 0">
                    <p style="margin:0;color:#1d4ed8;font-size:14px">
                      ✅ Your plan will be automatically extended by the closure duration. No action needed.
                    </p>
                  </div>
                  <p style="color:#64748b;font-size:13px">Thank you for your understanding — MealSetu Team</p>
                </div>
              </div>`
            );
          } catch (err) {
            console.error('Advance notice email failed:', err.message);
          }
        }

        closure.notifiedAt = new Date();
        await vendor.save();
      }
    } catch (error) {
      console.error('Kitchen closure cron error:', error);
    }
  });

  // AUTO-REOPEN: runs at 3:31 AM UTC daily — 1 minute after notification cron
  cron.schedule('31 3 * * *', async () => {
    console.log(`[autoReopen] Cron triggered at ${new Date().toISOString()}`);
    try {
      await runAutoReopen();
    } catch (err) {
      console.error('[autoReopen] Cron failed:', err.message);
    }
  });

  console.log('Kitchen closure cron started');
};

module.exports = { startKitchenClosureCron, runAutoReopen, sendKitchenReopenEmail };
