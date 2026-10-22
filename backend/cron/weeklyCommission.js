// Backend/cron/weeklyCommission.js
// NOTE: filename kept as-is so server.js's require path doesn't change.
// Commission generation is now MONTHLY + AUTO-DEDUCTED. No vendor payment step.

const cron = require('node-cron');
const Vendor = require('../models/Vendor');
const Order = require('../models/Order');
const Commission = require('../models/Commission');
const CommissionSetting = require('../models/CommissionSetting');
const Expense = require('../models/Expense'); // your existing expense model
const { sendEmail } = require('../utils/emailUtils');

// ===== HELPER: previous calendar month range =====
const getPreviousMonthRange = () => {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1;

  const startOfMonth = new Date(year, month, 1, 0, 0, 0);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthLabel = startOfMonth.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  return { startOfMonth, endOfMonth, monthKey, monthLabel };
};

// ===== HELPER: tier lookup =====
const getTierForEarning = async (amount) => {
  const tiers = await CommissionSetting.find({ isActive: true }).sort({ minEarning: 1 });
  let rate = 3;
  let tierName = 'Starter';
  for (const tier of tiers) {
    if (amount >= tier.minEarning && (tier.maxEarning === null || amount <= tier.maxEarning)) {
      rate = tier.ratePercent;
      tierName = tier.tierName;
      break;
    }
  }
  return { rate, tierName };
};

// ===== JOB 1: 1st of every month, 8AM — generate + AUTO-DEDUCT commission =====
const { getBillingPeriod } = require('../utils/commissionPeriod');

const generateMonthlyCommissions = cron.schedule('0 8 1 * *', async () => {
  console.log('📅 Monthly Commission Cron Started:', new Date().toLocaleString());
  try {
    const now = new Date();
    const vendors = await Vendor.find({ isApproved: true, status: 'approved' }).populate('ownerId', 'email name');
    console.log(`👥 Found ${vendors.length} approved vendors`);

    for (const vendor of vendors) {
      try {
        const firstOrder = await Order.findOne({ vendorId: vendor._id })
          .sort({ orderDate: 1, createdAt: 1 })
          .select('createdAt orderDate startDate');
        if (!firstOrder) continue;
        const anchorDate = firstOrder.createdAt || firstOrder.orderDate || firstOrder.startDate;
        if (!anchorDate) continue;

        const period = getBillingPeriod(anchorDate, now);
        if (!period) continue; // vendor joined too recently — nothing to bill yet
        const { periodStart, periodEnd, monthKey, monthLabel, isFirstCycle, financialYear, financialMonthNumber } = period;

        const existing = await Commission.findOne({ vendorId: vendor._id, month: monthKey });
        if (existing) { console.log(`⏭️ [cron] ${vendor.kitchenName} — ${monthKey} already processed`); continue; }

        const orders = await Order.find({
          vendorId: vendor._id,
          status: { $nin: ['cancelled', 'on-hold'] },
          paymentStatus: 'Paid',
          $or: [
            { createdAt: { $gte: periodStart, $lte: periodEnd } },
            { orderDate: { $gte: periodStart, $lte: periodEnd } }
          ]
        }).select('amount walletDeduction');

        const grossEarning = orders.reduce((s, o) => s + (o.amount || 0), 0);
        const walletDeductions = orders.reduce((s, o) => s + (o.walletDeduction || 0), 0);
        const grossAfterWallet = grossEarning - walletDeductions;

        // Expense.month is already 'YYYY-MM' — safe to use monthKey even for
        // a partial first cycle, since periodStart/periodEnd never cross a
        // month boundary.
        const expenses = await Expense.find({ vendorId: vendor._id, month: monthKey });
        const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);

        const netEarning = Math.max(0, grossAfterWallet - totalExpenses);
        if (netEarning === 0) { console.log(`⏭️ No net earnings: ${vendor.kitchenName} — ${monthKey}`); continue; }

        const { rate, tierName } = await getTierForEarning(netEarning);
        const commissionAmount = Math.round(netEarning * rate / 100);
        const stamp = new Date();

        const cycleNote = isFirstCycle
          ? `First (partial) cycle: ${periodStart.toLocaleDateString('en-IN')} – ${periodEnd.toLocaleDateString('en-IN')}`
          : `Full month: ${monthLabel}`;

        await Commission.create({
          vendorId: vendor._id, month: monthKey, week: null,
          periodStart, periodEnd, isFirstCycle, financialYear, financialMonthNumber,
          total_orders: orders.length,
          total_earning: grossAfterWallet,
          total_wallet_deductions: walletDeductions,
          gross_earning: grossEarning,
          total_expenses: totalExpenses,
          net_earning: netEarning,
          commission_rate: rate,
          commission_amount: commissionAmount,
          status: 'auto_deducted', auto_deducted: true, auto_deducted_at: stamp,
          deduction_method: 'auto', isLocked: true, lockedAt: stamp, lockedBy: 'cron',
          payment_date: stamp, paidOnTime: true,
          notes: `${cycleNote} | Tier: ${tierName} | Gross: ₹${grossEarning} | Wallet: ₹${walletDeductions} | Expenses: ₹${totalExpenses} | Net: ₹${netEarning}`,
          tierSnapshot: { tierName, minEarning: null, maxEarning: null, ratePercent: rate },
          auditLog: [{
            action: 'auto_deducted', performedBy: 'cron', at: stamp,
            note: `Auto-deducted. ${cycleNote}. Net ₹${netEarning} × ${rate}% = ₹${commissionAmount}`,
            valueBefore: {}, valueAfter: { status: 'auto_deducted', commission_amount: commissionAmount }
          }]
        });

        console.log(`✅ [cron] ${vendor.kitchenName} (${isFirstCycle ? 'FIRST cycle' : 'full month'}): ₹${commissionAmount}`);

        const vendorEmail = vendor.ownerId?.email;
        if (vendorEmail) {
          try {
            await sendEmail(
              vendorEmail,
              `MealSetu — Commission Auto-Deducted for ${monthLabel}`,
              `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <div style="background:#1a2240;padding:24px;text-align:center;border-radius:10px 10px 0 0">
                  <h1 style="color:#f97316;margin:0">MealSetu</h1>
                </div>
                <div style="background:white;padding:30px;border-radius:0 0 10px 10px;border:1px solid #e5e7eb">
                  <h2 style="color:#1a2240">${isFirstCycle ? 'Your First Commission Statement' : 'Monthly Commission Statement'}</h2>
                  <p>Dear <strong>${vendor.kitchenName}</strong>,</p>
                  ${isFirstCycle
                ? `<p>Since you joined mid-month, your first billing cycle covers <strong>${periodStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })} – ${periodEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> only. From next month onward, every cycle runs the full calendar month.</p>`
                : `<p>Your commission for <strong>${monthLabel}</strong> has been automatically calculated and deducted. No payment is required from you.</p>`}
                  <table style="width:100%;border-collapse:collapse;margin:20px 0">
                    <tr style="background:#f8fafc"><td style="padding:10px;border:1px solid #e2e8f0">Gross Earnings</td><td style="padding:10px;border:1px solid #e2e8f0;text-align:right;font-weight:700">₹${grossEarning.toLocaleString('en-IN')}</td></tr>
                    ${walletDeductions > 0 ? `<tr><td style="padding:10px;border:1px solid #e2e8f0">Wallet Deductions</td><td style="padding:10px;border:1px solid #e2e8f0;text-align:right;color:#f59e0b;font-weight:700">-₹${walletDeductions.toLocaleString('en-IN')}</td></tr>` : ''}
                    <tr><td style="padding:10px;border:1px solid #e2e8f0">Total Expenses Deducted</td><td style="padding:10px;border:1px solid #e2e8f0;text-align:right;color:#ef4444;font-weight:700">-₹${totalExpenses.toLocaleString('en-IN')}</td></tr>
                    <tr style="background:#f8fafc"><td style="padding:10px;border:1px solid #e2e8f0">Net Earnings</td><td style="padding:10px;border:1px solid #e2e8f0;text-align:right;font-weight:700">₹${netEarning.toLocaleString('en-IN')}</td></tr>
                    <tr><td style="padding:10px;border:1px solid #e2e8f0">Commission Rate (${tierName})</td><td style="padding:10px;border:1px solid #e2e8f0;text-align:right">${rate}%</td></tr>
                    <tr style="background:#fff7ed"><td style="padding:12px;border:2px solid #f97316;font-weight:700">Commission Auto-Deducted</td><td style="padding:12px;border:2px solid #f97316;text-align:right;color:#f97316;font-weight:800;font-size:18px">₹${commissionAmount.toLocaleString('en-IN')}</td></tr>
                    <tr style="background:#dcfce7"><td style="padding:12px;border:2px solid #16a34a;font-weight:700">Your Net Payout</td><td style="padding:12px;border:2px solid #16a34a;text-align:right;color:#16a34a;font-weight:800;font-size:18px">₹${(netEarning - commissionAmount).toLocaleString('en-IN')}</td></tr>
                  </table>
                  <p style="color:#64748b;font-size:13px">Financial Year ${financialYear} · Commission deducted automatically — no manual payment required.</p>
                </div>
              </div>`
            );
          } catch (emailErr) { console.error(`❌ Email failed for ${vendor.kitchenName}:`, emailErr.message); }
        }
      } catch (vendorErr) {
        console.error(`❌ Error processing ${vendor.kitchenName}:`, vendorErr.message);
      }
    }
    console.log('✅ Monthly Commission Cron Completed');
  } catch (error) {
    console.error('❌ Monthly Commission Cron Error:', error);
  }
}, { scheduled: false });

// ===== JOB 2: Daily 9AM — mark legacy 'pending' commissions overdue =====
// (Kept for any pre-existing weekly/manual records still in the pipeline;
//  new monthly records go straight to 'auto_deducted' and never pass through this.)
const markOverdueCommissions = cron.schedule('0 9 * * *', async () => {
  try {
    const overdueCommissions = await Commission.find({
      status: { $in: ['pending', 'pending_verification'] },
      isLocked: true,
      due_date: { $lt: new Date() }
    });

    for (const c of overdueCommissions) {
      c.status = 'overdue';
      await c.save().catch(err => console.error('Overdue save failed:', err.message));
    }

    if (overdueCommissions.length > 0) {
      console.log(`🔴 Marked ${overdueCommissions.length} legacy commission(s) overdue`);
    }
  } catch (error) {
    console.error('❌ Overdue Check Cron Error:', error);
  }
}, { scheduled: false });

// ===== JOB 3: Every day 7AM — Notify users whose plans expire in 1 or 3 days =====
// UNCHANGED — this has nothing to do with commissions, kept exactly as it was
// so plan-expiry notifications keep working.
const notifyExpiringPlans = cron.schedule('0 7 * * *', async () => {
  console.log('🔔 Plan Expiry Notification Cron Started:', new Date().toLocaleString());
  try {
    const { notifyPlanExpiring } = require('../utils/fcmService');

    const startOfDay = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
    const endOfDay = (d) => { const x = new Date(d); x.setUTCHours(23, 59, 59, 999); return x; };

    for (const daysLeft of [1, 3]) {
      const target = new Date();
      target.setDate(target.getDate() + daysLeft);

      const expiringOrders = await Order.find({
        status: 'active',
        endDate: { $gte: startOfDay(target), $lte: endOfDay(target) }
      }).populate('userId', 'fcmToken name')
        .populate('vendorId', 'kitchenName');

      console.log(`⏰ ${expiringOrders.length} plans expiring in ${daysLeft} day(s)`);

      for (const order of expiringOrders) {
        if (!order.userId?._id) continue;
        notifyPlanExpiring(
          order.userId._id,
          order.vendorId?.kitchenName || 'your vendor',
          daysLeft
        ).catch(console.error);
      }
    }
    console.log('✅ Plan Expiry Notification Cron Completed');
  } catch (err) {
    console.error('❌ Plan Expiry Notification Cron Error:', err);
  }
}, { scheduled: false });

// ===== START ALL CRON JOBS =====
const startWeeklyCommissionCron = () => {
  generateMonthlyCommissions.start();
  markOverdueCommissions.start();
  notifyExpiringPlans.start();
  console.log('✅ Commission Cron Jobs Started');
  console.log('   → Commission generation: 1st of every month at 8:00 AM (auto-deducted)');
  console.log('   → Legacy overdue check: Every day at 9:00 AM');
  console.log('   → Plan expiry notifications: Every day at 7:00 AM');
};

module.exports = { startWeeklyCommissionCron };
