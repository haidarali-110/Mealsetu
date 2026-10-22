const Order = require('../models/Order');
const DeliveryBatch = require('../models/DeliveryBatch');

/**
 * Normalizes a date string or Date object into start-of-day and end-of-day bounds.
 * @param {string|Date} [dateStr]
 * @returns {{ dayStart: Date, dayEnd: Date }}
 */
const getDayBounds = (dateStr) => {
  const date = dateStr ? new Date(dateStr) : new Date();
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  return { dayStart, dayEnd };
};

/**
 * Builds a human-friendly hint explaining why zero orders are eligible.
 * @param {object} excluded
 * @returns {string}
 */
const generateEligibilityHint = (excluded) => {
  if (!excluded) return '';
  const hints = [];

  if (excluded.startsLater && excluded.startsLater.length > 0) {
    const earliest = new Date(excluded.startsLater[0].startDate);
    const day = String(earliest.getDate()).padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[earliest.getMonth()];
    const year = earliest.getFullYear();
    const formatted = `${day} ${month} ${year}`;
    const isoDate = `${year}-${String(earliest.getMonth() + 1).padStart(2, '0')}-${day}`;
    hints.push(`${excluded.startsLater.length} order(s) start later (next: ${formatted}). Change the date to ${isoDate}.`);
  }

  if (excluded.queuedPending && excluded.queuedPending.length > 0) {
    const nextPending = excluded.queuedPending[0];
    let datePart = '';
    if (nextPending.startDate) {
      const pDate = new Date(nextPending.startDate);
      const day = String(pDate.getDate()).padStart(2, '0');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      datePart = ` on ${day} ${monthNames[pDate.getMonth()]} ${pDate.getFullYear()}`;
    }
    hints.push(`${excluded.queuedPending.length} queued plan(s) activate${datePart}.`);
  }

  if (!hints.length && excluded.alreadyBatched > 0) {
    hints.push(`All ${excluded.alreadyBatched} order(s) for this slot are already batched.`);
  }

  if (!hints.length && excluded.slotRule > 0) {
    hints.push(`${excluded.slotRule} order(s) excluded by first-day / last-day meal slot rules.`);
  }

  if (!hints.length && excluded.ended > 0) {
    hints.push(`${excluded.ended} order(s) have already completed their plan.`);
  }

  return hints.join(' ') || 'No active orders found for this date. Make sure orders exist and are not already batched.';
};

/**
 * Retrieves eligible orders for delivery batching on a given date and slot,
 * optionally computing detailed exclusion reasons.
 *
 * @param {object} params
 * @param {string|import('mongoose').Types.ObjectId} params.vendorId
 * @param {string|Date} [params.date]
 * @param {'lunch'|'dinner'} params.mealSlot
 * @param {boolean} [params.withReasons=false]
 * @returns {Promise<{ eligible: Array, excluded: { alreadyBatched: number, startsLater: Array, ended: number, queuedPending: Array, slotRule: number } }>}
 */
const getEligibleOrders = async ({ vendorId, date, mealSlot, withReasons = false }) => {
  const { dayStart, dayEnd } = getDayBounds(date);

  // Find order IDs already batched for THIS mealSlot today
  const sameMealBatches = await DeliveryBatch.find(
    { vendorId, batchDate: { $gte: dayStart, $lte: dayEnd }, mealSlot },
    'orders.orderId'
  );
  const alreadyBatchedOrderIds = sameMealBatches.flatMap(b => (b.orders || []).map(o => o.orderId));

  // Query candidate active/trial orders within date bounds
  const orders = await Order.find({
    vendorId,
    status: { $in: ['active', 'trial'] },
    $and: [
      {
        $or: [
          { startDate: null },
          { startDate: { $exists: false } },
          { startDate: { $lte: dayEnd } },
        ]
      },
      {
        $or: [
          { endDate: { $gte: dayStart } },
          { endDate: null },
          { endDate: { $exists: false } },
        ]
      },
      { _id: { $nin: alreadyBatchedOrderIds } },
    ]
  }).populate('userId', 'name phone address pincode');

  // Apply first-day and last-day meal slot rules verbatim
  const eligible = orders.filter(order => {
    // First-day check
    if (order.startDate) {
      const orderStart = new Date(order.startDate);
      const isFirstDay = orderStart >= dayStart && orderStart <= dayEnd;
      if (isFirstDay) {
        const slot = order.firstDayMealSlot || 'both';
        if (slot === 'dinner') return mealSlot === 'dinner';
      }
    }

    // Last-day check
    if (order.endDate) {
      const orderEnd = new Date(order.endDate);
      const isLastDay = orderEnd >= dayStart && orderEnd <= dayEnd;
      if (isLastDay) {
        const lastSlot = order.lastDayMealSlot || 'both';
        if (lastSlot === 'lunch') return mealSlot === 'lunch'; // skip dinner
      }
    }

    return true;
  });

  const slotRuleExcludedCount = orders.length - eligible.length;

  let excluded = {
    alreadyBatched: alreadyBatchedOrderIds.length,
    startsLater:    [],
    ended:          0,
    queuedPending:  [],
    slotRule:       slotRuleExcludedCount,
  };

  if (withReasons) {
    // Run read-only query on vendor orders with active/trial/pending status
    const allCandidates = await Order.find({
      vendorId,
      status: { $in: ['active', 'trial', 'pending'] }
    }).populate('userId', 'name');

    const startsLater = [];
    const queuedPending = [];
    let endedCount = 0;

    for (const cand of allCandidates) {
      const custName = cand.customerName || cand.userId?.name || cand.manualCustomerName || 'Customer';

      if (['active', 'trial'].includes(cand.status)) {
        if (cand.startDate && new Date(cand.startDate) > dayEnd) {
          startsLater.push({
            orderId: cand._id,
            customerName: custName,
            startDate: cand.startDate,
          });
        } else if (cand.endDate && new Date(cand.endDate) < dayStart) {
          endedCount += 1;
        }
      } else if (cand.status === 'pending') {
        queuedPending.push({
          orderId: cand._id,
          customerName: custName,
          startDate: cand.startDate || cand.scheduledStartDate || null,
        });
      }
    }

    // Sort startsLater by earliest date first
    startsLater.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    queuedPending.sort((a, b) => {
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return new Date(a.startDate) - new Date(b.startDate);
    });

    excluded = {
      alreadyBatched: alreadyBatchedOrderIds.length,
      startsLater,
      ended:          endedCount,
      queuedPending,
      slotRule:       slotRuleExcludedCount,
    };
  }

  return { eligible, excluded };
};

module.exports = {
  getDayBounds,
  getEligibleOrders,
  generateEligibilityHint,
};
