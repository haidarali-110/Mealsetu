// Smart subscription start date logic based on purchase time.
// All dates stored as UTC midnight to be consistent with all query comparisons.

const LUNCH_CUTOFF_UTC_HOURS  = 4.5;   // 04:30 UTC = 10:00 AM IST
const DINNER_CUTOFF_UTC_HOURS = 11.5;  // 11:30 UTC = 05:00 PM IST

/**
 * Returns { startDate, endDate, mealSlotToday }
 *
 * mealSlotToday values:
 *   'both'   — purchased before lunch cutoff; both meals active today
 *   'dinner' — purchased between cutoffs; only dinner active today;
 *              endDate extended by 1 day to compensate missed lunch
 *   'none'   — purchased after dinner cutoff; starts tomorrow
 *
 * @param {number} planDurationDays  1=Trial, 7=Weekly, 30=Monthly
 * @param {Date}   purchaseTime      defaults to new Date()
 */
const computeSubscriptionDates = (planDurationDays, purchaseTime = new Date()) => {
  const utcHour = purchaseTime.getUTCHours() + purchaseTime.getUTCMinutes() / 60;

  const todayMidnight = new Date(purchaseTime);
  todayMidnight.setUTCHours(0, 0, 0, 0);

  const tomorrowMidnight = new Date(todayMidnight);
  tomorrowMidnight.setUTCDate(tomorrowMidnight.getUTCDate() + 1);

  let startDate;
  let extraDays = 0;
  let mealSlotToday;

  let lastDayMealSlot;

  if (utcHour < LUNCH_CUTOFF_UTC_HOURS) {
    startDate      = todayMidnight;
    mealSlotToday  = 'both';
    lastDayMealSlot = 'both';   // no missed meals → last day is normal
  } else if (utcHour < DINNER_CUTOFF_UTC_HOURS) {
    startDate      = todayMidnight;
    extraDays      = 1;
    mealSlotToday  = 'dinner';
    lastDayMealSlot = 'lunch';  // missed lunch on day 1 → compensate on last day
  } else {
    startDate      = tomorrowMidnight;
    mealSlotToday  = 'none';
    lastDayMealSlot = 'both';   // starts tomorrow with full day → last day normal
  }

  const endDate = new Date(startDate);
  // -1 makes endDate the INCLUSIVE last meal day (e.g. June 18 = last delivery)
  // rather than exclusive (June 19 = day after, which caused an extra free day)
  endDate.setUTCDate(endDate.getUTCDate() + planDurationDays + extraDays - 1);

  // firstDayMealSlot is what gets stored on the Order for batch filtering.
  // 'none' means "no meals on purchase day" — but since startDate = tomorrow,
  // the actual first delivery day is tomorrow and the user gets both meals.
  // Storing 'none' would cause the batch filter to wrongly exclude them on day 1.
  const firstDayMealSlot = mealSlotToday === 'none' ? 'both' : mealSlotToday;

  return { startDate, endDate, mealSlotToday, firstDayMealSlot, lastDayMealSlot };
};

/**
 * Returns plan duration in days. Accepts both 'Weekly' and 'weekly'.
 * Trial = 2 days (48-hour window).
 */
const getPlanDurationDays = (planType) => {
  const map = {
    trial: 2, Trial: 2,
    weekly: 7, Weekly: 7,
    monthly: 30, Monthly: 30,
    tiffin: 1, Tiffin: 1
  };
  return map[planType] || 7;
};

/**
 * Returns human-readable meal slot info for emails and UI.
 * Pass the order's startDate and orderDate (purchase time).
 */
const getMealSlotInfo = (startDate, orderDate) => {
  const purchaseTime = orderDate ? new Date(orderDate) : new Date();
  const utcHour = purchaseTime.getUTCHours() +
                  purchaseTime.getUTCMinutes() / 60;

  const startFormatted = new Date(startDate).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  if (utcHour < LUNCH_CUTOFF_UTC_HOURS) {
    return {
      slot:         'both',
      slotLabel:    '🌅 Lunch + Dinner',
      startMessage: `Your plan is active from today (${startFormatted})`,
      mealMessage:  'You will receive both Lunch and Dinner starting today.',
      badgeColor:   '#16a34a',
      badgeBg:      '#dcfce7'
    };
  } else if (utcHour < DINNER_CUTOFF_UTC_HOURS) {
    return {
      slot:         'dinner',
      slotLabel:    '🌙 Dinner Only Today',
      startMessage: `Your plan is active from today (${startFormatted})`,
      mealMessage:  'Lunch time has passed. You will receive Dinner today. From tomorrow, both Lunch and Dinner will be served. One extra day has been added to your plan to compensate.',
      badgeColor:   '#d97706',
      badgeBg:      '#fef3c7'
    };
  } else {
    return {
      slot:         'none',
      slotLabel:    '🌄 Starts Tomorrow',
      startMessage: `Your plan starts tomorrow (${startFormatted})`,
      mealMessage:  'Dinner time has passed for today. Your plan will start from tomorrow with both Lunch and Dinner.',
      badgeColor:   '#7c3aed',
      badgeBg:      '#ede9fe'
    };
  }
};

module.exports = {
  computeSubscriptionDates,
  getPlanDurationDays,
  getMealSlotInfo,
  LUNCH_CUTOFF_UTC_HOURS,
  DINNER_CUTOFF_UTC_HOURS
};
