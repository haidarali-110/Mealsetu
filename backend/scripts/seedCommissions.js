/**
 * One-time script: generates Commission records from existing Order data
 * Run with: node backend/scripts/seedCommissions.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose          = require('mongoose');
const Order             = require('../models/Order');
const Vendor            = require('../models/Vendor');
const Commission        = require('../models/Commission');
const CommissionSetting = require('../models/CommissionSetting');
const { getCommissionWeek } = require('../utils/commissionWeekCalculator');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');

  const vendors = await Vendor.find({ isApproved: true });
  console.log(`Processing ${vendors.length} vendors...`);

  for (const vendor of vendors) {
    const allOrders = await Order.find({
      vendorId: vendor._id,
      status:   { $in: ['active', 'completed', 'trial', 'pending'] }
    }).sort({ createdAt: 1 }).lean();

    if (allOrders.length === 0) {
      console.log(`  ${vendor.kitchenName}: no orders, skip`);
      continue;
    }

    const firstOrder = allOrders[0];
    const anchorDate = firstOrder.createdAt || firstOrder.orderDate || firstOrder.startDate;
    if (!anchorDate) {
      console.log(`  ${vendor.kitchenName}: first order has no date, skip`);
      continue;
    }
    console.log(`  ${vendor.kitchenName}: ${allOrders.length} orders, first: ${anchorDate}`);

    const weekMap = {};

    for (const order of allOrders) {
      const orderDate = new Date(order.createdAt || order.orderDate || order.startDate);
      if (isNaN(orderDate.getTime())) continue;

      const weekInfo = getCommissionWeek(anchorDate, orderDate);
      if (!weekInfo) continue;

      const key = weekInfo.weekKey;
      if (!weekMap[key]) weekMap[key] = { weekInfo, orders: [] };
      weekMap[key].orders.push(order);
    }

    for (const [weekKey, { weekInfo, orders }] of Object.entries(weekMap)) {
      const totalEarning = orders.reduce((s, o) => s + (o.amount || 0), 0);
      if (totalEarning === 0) continue;

      const tier = await CommissionSetting.findOne({
        isActive:   true,
        minEarning: { $lte: totalEarning },
        $or: [
          { maxEarning: { $gte: totalEarning } },
          { maxEarning: null }
        ]
      }).sort({ minEarning: -1 }).limit(1).lean();

      const rate             = tier?.ratePercent || 5;
      const commissionAmount = Math.round(totalEarning * rate / 100);
      const dueDate          = new Date(weekInfo.weekEnd);
      dueDate.setUTCDate(dueDate.getUTCDate() + 7);

      const settlementNumber = `MS-${weekInfo.financialYear}-W${String(
        weekInfo.fyWeekNumber
      ).padStart(2, '0')}-${String(vendor._id).slice(-4).toUpperCase()}`;

      const existing = await Commission.findOne({ vendorId: vendor._id, week: weekKey });
      if (existing) {
        console.log(`    Week ${weekKey}: already exists, skip`);
        continue;
      }

      await Commission.create({
        vendorId:            vendor._id,
        week:                weekKey,
        month:               weekKey,
        weekStart:           weekInfo.weekStart,
        weekEnd:             weekInfo.weekEnd,
        financialYear:       weekInfo.financialYear,
        financialWeekNumber: weekInfo.fyWeekNumber,
        total_orders:        orders.length,
        total_earning:       totalEarning,
        commission_rate:     rate,
        commission_amount:   commissionAmount,
        status:              'pending',
        due_date:            dueDate,
        isLocked:            false,
        reminderCount:       0,
        settlementNumber,
        tierSnapshot: {
          tierName:    tier?.tierName   || 'Default',
          minEarning:  tier?.minEarning || 0,
          maxEarning:  tier?.maxEarning || null,
          ratePercent: rate
        },
        auditLog: [{
          action:      'created',
          performedBy: 'seed-script',
          at:          new Date(),
          note:        `Seeded from ${orders.length} orders. Total: ₹${totalEarning}`
        }]
      });

      console.log(`    Week ${weekKey}: created ₹${totalEarning} → commission ₹${commissionAmount}`);
    }
  }

  console.log('\n✅ Seed complete');
  await mongoose.disconnect();
};

run().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
