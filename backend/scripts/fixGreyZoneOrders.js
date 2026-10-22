require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose          = require('mongoose');
const Order             = require('../models/Order');
const Commission        = require('../models/Commission');
const CommissionSetting = require('../models/CommissionSetting');
const Vendor            = require('../models/Vendor');
const { getCommissionWeek } = require('../utils/commissionWeekCalculator');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');

  // Find Mom's Magic Kitchen
  const vendor = await Vendor.findOne({ kitchenName: /Mom.*Magic/i });
  if (!vendor) {
    console.log('Vendor not found');
    process.exit(1);
  }
  console.log('Vendor:', vendor.kitchenName, vendor._id.toString());

  // Find Week 8 commission (paid, locked)
  const week8 = await Commission.findOne({
    vendorId: vendor._id,
    week:     'FY2026-27-W08'
  });
  if (!week8) {
    console.log('Week 8 commission not found');
    process.exit(1);
  }

  console.log('\nWeek 8 commission:');
  console.log('  weekStart:    ', week8.weekStart);
  console.log('  weekEnd:      ', week8.weekEnd);
  console.log('  status:       ', week8.status);
  console.log('  isLocked:     ', week8.isLocked);
  console.log('  total_earning:', week8.total_earning);
  console.log('  lockedAt:     ', week8.lockedAt);

  // Find ALL orders for this vendor
  const allOrders = await Order.find({
    vendorId: vendor._id,
    status:   { $in: ['active', 'completed', 'pending', 'trial'] }
  }).sort({ createdAt: 1 }).lean();

  console.log(`\nTotal orders for vendor: ${allOrders.length}`);

  // Grey zone = orders within Week 8 date range but created AFTER the lock date
  const week8Start    = new Date(week8.weekStart);
  const week8End      = new Date(week8.weekEnd);
  const week8LockedAt = new Date(week8.lockedAt || week8.payment_date);
  week8End.setUTCHours(23, 59, 59, 999);

  console.log('\nLooking for grey zone orders:');
  console.log('  After lock date: ', week8LockedAt.toISOString());
  console.log('  Within week8:   ', week8Start.toISOString(), '→', week8End.toISOString());

  const greyZoneOrders = allOrders.filter(o => {
    const orderDate = new Date(o.createdAt || o.orderDate);
    return orderDate > week8LockedAt &&
           orderDate >= week8Start &&
           orderDate <= week8End;
  });

  console.log(`\nGrey zone orders found: ${greyZoneOrders.length}`);
  greyZoneOrders.forEach(o => {
    console.log(`  Order ${o._id}: ₹${o.amount} | ${o.status} | ${new Date(o.createdAt).toISOString()}`);
  });

  if (greyZoneOrders.length === 0) {
    console.log('\nNo grey zone orders. Nothing to fix.');
    process.exit(0);
  }

  const totalGreyEarning = greyZoneOrders.reduce((s, o) => s + (o.amount || 0), 0);
  console.log(`\nTotal grey zone earning: ₹${totalGreyEarning}`);

  // Week 9 date range: day after Week 8 ends
  const week9Start = new Date(week8End);
  week9Start.setUTCDate(week9Start.getUTCDate() + 1);
  week9Start.setUTCHours(0, 0, 0, 0);

  const week9End = new Date(week9Start);
  week9End.setUTCDate(week9End.getUTCDate() + 6);
  week9End.setUTCHours(23, 59, 59, 999);

  // Legitimate Week 9 orders (not grey zone — actually within Week 9 dates)
  const week9Orders = allOrders.filter(o => {
    const orderDate = new Date(o.createdAt || o.orderDate);
    return orderDate >= week9Start && orderDate <= week9End;
  });

  console.log(`\nWeek 9 (${week9Start.toDateString()} → ${week9End.toDateString()}):`);
  console.log(`  Legitimate Week 9 orders: ${week9Orders.length}`);
  week9Orders.forEach(o => {
    console.log(`  Order ${o._id}: ₹${o.amount} | ${new Date(o.createdAt).toISOString()}`);
  });

  // Combined Week 9 = grey zone orders + legitimate Week 9 orders
  const allWeek9Orders    = [...greyZoneOrders, ...week9Orders];
  const week9TotalEarning = allWeek9Orders.reduce((s, o) => s + (o.amount || 0), 0);

  // Tier lookup
  const tier = await CommissionSetting.findOne({
    isActive:   true,
    minEarning: { $lte: week9TotalEarning },
    $or: [
      { maxEarning: { $gte: week9TotalEarning } },
      { maxEarning: null }
    ]
  }).sort({ minEarning: -1 }).limit(1).lean();

  const rate            = tier?.ratePercent || 5;
  const week9Commission = Math.round(week9TotalEarning * rate / 100);
  const week9DueDate    = new Date(week9End);
  week9DueDate.setUTCDate(week9DueDate.getUTCDate() + 7);

  // Week key via calculator
  const firstOrder = allOrders[0];
  const week9Info  = getCommissionWeek(firstOrder.createdAt, week9Start);
  const week9Key   = week9Info?.weekKey || 'FY2026-27-W09';
  const settlementNum = `MS-${week9Info?.financialYear || 'FY2026-27'}-W${String(
    week9Info?.fyWeekNumber || 9
  ).padStart(2, '0')}-${String(vendor._id).slice(-4).toUpperCase()}`;

  console.log('\n── PROPOSED WEEK 9 SETTLEMENT ──');
  console.log(`  Week key:      ${week9Key}`);
  console.log(`  Period:        ${week9Start.toDateString()} → ${week9End.toDateString()}`);
  console.log(`  Total orders:  ${allWeek9Orders.length}`);
  console.log(`  Total earning: ₹${week9TotalEarning}`);
  console.log(`  Rate:          ${rate}%`);
  console.log(`  Commission:    ₹${week9Commission}`);
  console.log(`  Due date:      ${week9DueDate.toDateString()}`);
  console.log(`  Settlement ID: ${settlementNum}`);

  // Check if Week 9 already exists
  const existingWeek9 = await Commission.findOne({
    vendorId: vendor._id,
    week:     week9Key
  });

  if (existingWeek9) {
    console.log('\n⚠️  Week 9 record already exists:');
    console.log('  total_earning:    ', existingWeek9.total_earning);
    console.log('  commission_amount:', existingWeek9.commission_amount);
    console.log('  isLocked:         ', existingWeek9.isLocked);
    console.log('  status:           ', existingWeek9.status);
    console.log('\nWill UPDATE existing Week 9 with combined amounts.');
  } else {
    console.log('\nNo existing Week 9 record. Will CREATE new one.');
  }

  const readline = require('readline').createInterface({
    input: process.stdin, output: process.stdout
  });

  readline.question('\nApply this fix? (yes/no): ', async (answer) => {
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('Cancelled. No changes made.');
      readline.close();
      await mongoose.disconnect();
      return;
    }

    if (existingWeek9) {
      await Commission.findByIdAndUpdate(existingWeek9._id, {
        $set: {
          total_orders:      allWeek9Orders.length,
          total_earning:     week9TotalEarning,
          commission_rate:   rate,
          commission_amount: week9Commission,
          due_date:          week9DueDate,
          weekStart:         week9Start,
          weekEnd:           week9End,
          settlementNumber:  settlementNum
        },
        $push: {
          auditLog: {
            action:      'updated',
            performedBy: 'grey-zone-fix-script',
            at:          new Date(),
            note:        `Grey zone orders (₹${totalGreyEarning}) merged into Week 9. ` +
                         `${greyZoneOrders.length} orders moved from Week 8 grey zone.`,
            valueBefore: { total_earning: existingWeek9.total_earning, commission_amount: existingWeek9.commission_amount },
            valueAfter:  { total_earning: week9TotalEarning, commission_amount: week9Commission }
          }
        }
      });
      console.log('\n✅ Week 9 record UPDATED with grey zone orders');

    } else {
      await Commission.create({
        vendorId:            vendor._id,
        week:                week9Key,
        month:               week9Key,
        weekStart:           week9Start,
        weekEnd:             week9End,
        financialYear:       week9Info?.financialYear,
        financialWeekNumber: week9Info?.fyWeekNumber,
        total_orders:        allWeek9Orders.length,
        total_earning:       week9TotalEarning,
        commission_rate:     rate,
        commission_amount:   week9Commission,
        status:              'pending',
        due_date:            week9DueDate,
        isLocked:            false,
        reminderCount:       0,
        settlementNumber:    settlementNum,
        tierSnapshot: {
          tierName:    tier?.tierName    || 'Starter',
          minEarning:  tier?.minEarning  || 0,
          maxEarning:  tier?.maxEarning  || null,
          ratePercent: rate
        },
        auditLog: [{
          action:      'created',
          performedBy: 'grey-zone-fix-script',
          at:          new Date(),
          note:        `Created from grey zone fix. ` +
                       `${greyZoneOrders.length} orders moved from Week 8 grey zone. ` +
                       `Total earning: ₹${week9TotalEarning}`
        }]
      });
      console.log('\n✅ Week 9 record CREATED with grey zone orders');
    }

    console.log('\nSummary:');
    console.log(`  Week 8: ₹${week8.total_earning} → ₹${week8.commission_amount} commission (PAID, unchanged) ✅`);
    console.log(`  Week 9: ₹${week9TotalEarning} → ₹${week9Commission} commission (pending) ✅`);
    console.log(`  Grey zone orders resolved: ${greyZoneOrders.length} ✅`);

    readline.close();
    await mongoose.disconnect();
  });
};

run().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
