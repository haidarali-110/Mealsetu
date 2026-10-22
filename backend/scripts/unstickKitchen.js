/**
 * One-time script to unstick a vendor whose planned closure expired
 * but isOpen was never reset.
 *
 * Usage:
 *   node scripts/unstickKitchen.js "Mom's Magic Kitchen"
 *   node scripts/unstickKitchen.js  (runs against all overdue planned closures)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Vendor   = require('../models/Vendor');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const targetName = process.argv[2] || null;
  const now        = new Date();

  const query = {
    isOpen:                          false,
    'currentClosure.isActive':       true,
    'currentClosure.closureType':    'planned',
    'currentClosure.endDate':        { $lt: now }
  };
  if (targetName) query.kitchenName = targetName;

  const vendors = await Vendor.find(query);

  if (vendors.length === 0) {
    console.log('No matching vendors found. Nothing to fix.');
    await mongoose.disconnect();
    return;
  }

  for (const vendor of vendors) {
    console.log('\nBefore fix:', {
      kitchenName:      vendor.kitchenName,
      isOpen:           vendor.isOpen,
      currentClosure:   vendor.currentClosure,
      closureStartDate: vendor.closureStartDate,
      closureEndDate:   vendor.closureEndDate
    });

    vendor.isOpen = true;
    vendor.currentClosure = {
      isActive:    false,
      startDate:   null,
      endDate:     null,
      reason:      null,
      closureType: null
    };
    // Clear stale legacy fields written by old toggleShopStatus path
    vendor.closureStartDate = null;
    vendor.closureEndDate   = null;

    await vendor.save();
    console.log(`✅ Reopened: ${vendor.kitchenName}`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
