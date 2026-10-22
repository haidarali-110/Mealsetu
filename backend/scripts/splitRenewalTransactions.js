/**
 * Migration: splitRenewalTransactions.js
 *
 * Problem:
 *   Old renewal transactions stored the base plan points + renewal bonus (15)
 *   as a SINGLE "earned_renewal" transaction (e.g. Weekly renewal → +40 pts).
 *
 * Fix:
 *   For every loyalty record that has an "earned_renewal" transaction where
 *   points > 15 (meaning it includes the bonus already baked in), split it into:
 *     1. earned_renewal        → base plan pts  (e.g. +25 for Weekly)
 *     2. earned_renewal_bonus  → +15 pts
 *
 *   The user's total points / totalEarned balance does NOT change — we are
 *   only splitting the display, not adding or removing any points.
 *
 * Run:
 *   node scripts/splitRenewalTransactions.js
 */

const mongoose = require('mongoose');
const LoyaltyPoints = require('../models/LoyaltyPoints');
require('dotenv').config();

// Must match POINTS_MAP in loyaltyController.js
const POINTS_MAP = { Trial: 5, Weekly: 25, Monthly: 100 };
const RENEWAL_BONUS = 15;

const migrate = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅  Connected to MongoDB');

  const allRecords = await LoyaltyPoints.find({
    'transactions.type': 'earned_renewal'
  });

  console.log(`📋  Found ${allRecords.length} loyalty record(s) with renewal transactions`);

  let totalSplit   = 0;
  let totalSkipped = 0;

  for (const record of allRecords) {
    let modified = false;
    const newTransactions = [];

    for (const tx of record.transactions) {
      // Only process old combined earned_renewal entries that include the bonus
      if (
        tx.type === 'earned_renewal' &&
        tx.points > RENEWAL_BONUS
      ) {
        const basePts = tx.points - RENEWAL_BONUS;   // e.g. 40 - 15 = 25
        const planType = tx.planType || 'Weekly';

        // Sanity check: basePts should match the known POINTS_MAP value
        const expectedBase = POINTS_MAP[planType] ?? basePts;
        if (basePts !== expectedBase) {
          console.warn(
            `  ⚠️  user ${record.userId} tx ${tx._id}: basePts ${basePts} ` +
            `doesn't match expected ${expectedBase} for ${planType} — skipping this tx`
          );
          newTransactions.push(tx);
          totalSkipped++;
          continue;
        }

        // Push split records (keep original createdAt so order is preserved)
        newTransactions.push({
          type:        'earned_renewal',
          points:      basePts,
          description: `${planType} plan renewed`,
          planType:    tx.planType,
          orderId:     tx.orderId,
          createdAt:   tx.createdAt
        });

        newTransactions.push({
          type:        'earned_renewal_bonus',
          points:      RENEWAL_BONUS,
          description: 'Renewal loyalty bonus',
          planType:    tx.planType,
          orderId:     tx.orderId,
          createdAt:   tx.createdAt
        });

        modified = true;
        totalSplit++;
        console.log(
          `  ✂️  user ${record.userId}: split tx ${tx._id} ` +
          `(${planType} +${tx.points}) → +${basePts} plan + +${RENEWAL_BONUS} bonus`
        );
      } else {
        // Not a combined old renewal — keep as-is
        newTransactions.push(tx);
      }
    }

    if (modified) {
      record.transactions = newTransactions;
      await record.save();
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`✅  Done.`);
  console.log(`   Transactions split : ${totalSplit}`);
  console.log(`   Transactions skipped (mismatch): ${totalSkipped}`);
  console.log('─────────────────────────────────────────');

  await mongoose.disconnect();
};

migrate().catch(err => {
  console.error('❌  Migration failed:', err);
  process.exit(1);
});
