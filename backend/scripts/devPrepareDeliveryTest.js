/**
 * Dev utility to prepare/reset test customer orders for local delivery testing.
 * Strictly blocked in production. Never modifies payment fields.
 *
 * Usage:
 *   node scripts/devPrepareDeliveryTest.js --phone=9157759250
 *   node scripts/devPrepareDeliveryTest.js --phone=9157759250 --date=2026-10-22 --apply
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: devPrepareDeliveryTest.js is for development only and cannot be run in production.');
  process.exit(1);
}

// Models
require('../models/User');
const User = mongoose.model('User');
const Order = require('../models/Order');
const DeliveryBatch = require('../models/DeliveryBatch');
const Vendor = require('../models/Vendor');

// Parse CLI arguments
const args = process.argv.slice(2);
const getArg = (name) => {
  const match = args.find(a => a.startsWith(`--${name}=`));
  return match ? match.split('=')[1] : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

const phone = getArg('phone');
const vendorIdArg = getArg('vendorId');
const dateArg = getArg('date');
const apply = hasFlag('apply');

if (!phone) {
  console.error('Usage: node scripts/devPrepareDeliveryTest.js --phone=<customer phone> [--vendorId=<optional>] [--date=YYYY-MM-DD] [--apply]');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mealsetu');

    const user = await User.findOne({ phone });
    if (!user) {
      console.error(`User with phone ${phone} not found.`);
      process.exit(1);
    }

    const orderQuery = {
      $or: [
        { userId: user._id },
        { manualCustomerPhone: phone }
      ]
    };
    if (vendorIdArg) {
      orderQuery.vendorId = vendorIdArg;
    }

    const orders = await Order.find(orderQuery).populate('userId', 'name phone address').lean();

    if (!orders.length) {
      console.log(`No orders found for customer ${user.name} (${phone}).`);
      process.exit(0);
    }

    // Determine target start date (UTC midnight)
    const targetDateObj = dateArg ? new Date(dateArg) : new Date();
    const targetStartDate = new Date(targetDateObj);
    targetStartDate.setUTCHours(0, 0, 0, 0);
    const targetDateStr = targetStartDate.toISOString().slice(0, 10);

    console.log(`\n======================================================`);
    console.log(`  DEV PREPARE DELIVERY TEST: Customer ${user.name} (${phone})`);
    console.log(`  Target Date: ${targetDateStr} (UTC midnight)`);
    console.log(`  Mode: ${apply ? 'APPLY (modifications enabled)' : 'DRY RUN (no changes written)'}`);
    console.log(`======================================================\n`);

    const batchIds = orders.map(o => o.deliveryBatchId).filter(Boolean);
    const batches = await DeliveryBatch.find({ _id: { $in: batchIds } }).lean();
    const batchMap = new Map(batches.map(b => [String(b._id), b]));

    const tableRows = [];
    let missingCoordsCount = 0;
    const ordersToUpdate = [];

    for (const ord of orders) {
      const u = ord.userId || user;
      const userCoords = (u?.address?.latitude != null && u?.address?.longitude != null)
        ? `${u.address.latitude.toFixed(4)}, ${u.address.longitude.toFixed(4)}`
        : null;

      const manualCoords = (ord.manualCustomerAddress?.latitude != null && ord.manualCustomerAddress?.longitude != null)
        ? `${ord.manualCustomerAddress.latitude.toFixed(4)}, ${ord.manualCustomerAddress.longitude.toFixed(4)}`
        : null;

      const batchDoc = ord.deliveryBatchId ? batchMap.get(String(ord.deliveryBatchId)) : null;
      const batchItem = batchDoc?.orders?.find(o => String(o.orderId) === String(ord._id));
      const batchCoords = (batchItem?.address?.latitude != null && batchItem?.address?.longitude != null)
        ? `${batchItem.address.latitude.toFixed(4)}, ${batchItem.address.longitude.toFixed(4)}`
        : null;

      const effectiveCoords = batchCoords || manualCoords || userCoords || 'MISSING';
      if (effectiveCoords === 'MISSING') missingCoordsCount++;

      tableRows.push({
        orderId: String(ord._id).slice(-8),
        planType: ord.planType || 'Tiffin',
        status: ord.status,
        payment: `${ord.paymentMethod}/${ord.paymentStatus}`,
        start: ord.startDate ? ord.startDate.toISOString().slice(0, 10) : 'null',
        end: ord.endDate ? ord.endDate.toISOString().slice(0, 10) : 'null',
        batchId: ord.deliveryBatchId ? String(ord.deliveryBatchId).slice(-6) : 'none',
        riderId: ord.deliveryRiderId ? String(ord.deliveryRiderId).slice(-6) : 'none',
        deliveryStatus: ord.deliveryStatus || 'none',
        coords: effectiveCoords
      });

      // Check if order qualifies for reset to active today:
      // Active or pending orders that have not been delivered today
      if (['active', 'pending', 'trial'].includes(ord.status) && ord.deliveryStatus !== 'delivered') {
        ordersToUpdate.push(ord);
      }
    }

    console.log('--- CURRENT ORDERS ---');
    console.table(tableRows);

    if (missingCoordsCount > 0) {
      console.warn(`\n⚠️  WARNING: ${missingCoordsCount} order(s) have MISSING GPS coordinates.`);
      console.warn(`    Delivery will fail geofence checks unless coordinates are populated.`);
      console.warn(`    To fix, run: node scripts/backfillAddressCoords.js\n`);
    }

    if (!apply) {
      console.log(`[DRY RUN] ${ordersToUpdate.length} order(s) would be updated to active for ${targetDateStr}.`);
      console.log(`To apply changes, run again with --apply`);
    } else {
      console.log(`--- APPLYING UPDATES TO ${ordersToUpdate.length} ORDER(S) ---`);
      const afterRows = [];

      for (const ord of ordersToUpdate) {
        // Calculate new end date based on duration
        let durationDays = 1;
        if (ord.startDate && ord.endDate) {
          const diffMs = new Date(ord.endDate) - new Date(ord.startDate);
          const computedDays = Math.round(diffMs / (86400000)) + 1;
          if (computedDays > 1) durationDays = computedDays;
        } else if (ord.planType === 'Weekly') {
          durationDays = 7;
        } else if (ord.planType === 'Monthly') {
          durationDays = 30;
        }

        const newEndDate = new Date(targetStartDate);
        newEndDate.setUTCDate(newEndDate.getUTCDate() + durationDays - 1);

        await Order.updateOne(
          { _id: ord._id },
          {
            $set: {
              status: 'active',
              startDate: targetStartDate,
              endDate: newEndDate,
              firstDayMealSlot: 'both',
              lastDayMealSlot: 'both',
              deliveryBatchId: null,
              deliveryRiderId: null,
              deliveryStatus: 'pending'
            }
          }
        );

        afterRows.push({
          orderId: String(ord._id).slice(-8),
          newStatus: 'active',
          paymentUnchanged: `${ord.paymentMethod}/${ord.paymentStatus}`,
          newStart: targetStartDate.toISOString().slice(0, 10),
          newEnd: newEndDate.toISOString().slice(0, 10),
          firstSlot: 'both',
          lastSlot: 'both',
          deliveryBatchId: 'null',
          deliveryRiderId: 'null'
        });
      }

      console.table(afterRows);
      console.log(`\nSuccessfully prepared ${ordersToUpdate.length} order(s) for delivery testing on ${targetDateStr}.`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error running devPrepareDeliveryTest:', err);
    process.exit(1);
  }
})();
