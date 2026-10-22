const Order = require('../models/Order');
const Vendor = require('../models/Vendor');
const { LUNCH_CUTOFF_UTC_HOURS, DINNER_CUTOFF_UTC_HOURS } = require('../utils/mealTimingUtils');

const getPreparationList = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrowMidnight = new Date(today);
    tomorrowMidnight.setUTCDate(tomorrowMidnight.getUTCDate() + 1);

    const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);

    const orders = await Order.find({
      vendorId: vendor._id,
      status: { $in: ['active', 'trial'] },
      startDate: { $lt: tomorrowMidnight },
      $or: [
        { endDate: { $gte: today } },
        {
          $and: [
            { endDate: { $in: [null, undefined] } },
            { startDate: { $gte: thirtyDaysAgo } },
            { startDate: { $lte: today } }
          ]
        }
      ]
    });

    const todayMidnightMs = today.getTime();

    const countGroup = (group) => {
      const jain = group.filter(o => o.mealPreference === 'Jain').length;
      return { total: group.length, regular: group.length - jain, jain };
    };

    // Lunch eligibility rules (only matters when startDate === today):
    //
    //   'both'   slot: purchased before 10 AM IST (< 4.5 UTC)  → include lunch ✓
    //   'dinner' slot: purchased 10 AM–5 PM IST (4.5–11.5 UTC) → skip lunch today ✗
    //   'none'   slot: purchased after 5 PM IST  (≥ 11.5 UTC)  → startDate was deferred
    //                  to today; user gets BOTH meals → include lunch ✓
    //
    // If startDate is NOT today the order has been active since a prior day — always
    // include in lunch (its first-day slot has already passed).
    const lunchEligible = orders.filter(order => {
      const orderCreation = order.orderDate ? new Date(order.orderDate) : null;
      if (!orderCreation) return true;

      const startNormalized = new Date(order.startDate);
      startNormalized.setUTCHours(0, 0, 0, 0);
      const startIsToday = startNormalized.getTime() === todayMidnightMs;
      if (!startIsToday) return true;

      const creationUTCHour =
        orderCreation.getUTCHours() + orderCreation.getUTCMinutes() / 60;

      // 'none' slot: plan was deferred to today — full meals from day one.
      if (creationUTCHour >= DINNER_CUTOFF_UTC_HOURS) return true;

      // 'dinner' slot: only dinner was served on purchase day, skip lunch that same day.
      return creationUTCHour < LUNCH_CUTOFF_UTC_HOURS;
    });

    // All orders in the result set are dinner-eligible:
    // orders starting tomorrow (after-dinner-cutoff purchases) were
    // already excluded by startDate: { $lte: today } in the query.
    const lunch  = countGroup(lunchEligible);
    const dinner = countGroup(orders);

    return res.json({
      lunch,
      dinner,
      total: orders.length,
      regular: lunch.regular + dinner.regular,
      jain: lunch.jain + dinner.jain,
      date: today.toISOString().slice(0, 10)
    });
  } catch (error) {
    console.error('Preparation list error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { getPreparationList };
