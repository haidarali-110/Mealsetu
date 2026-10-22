/**
 * MealSetu — Meal-slot accurate closure calculator
 *
 * Counts exactly how many meals (lunch/dinner) were missed
 * between kitchen close time and reopen time.
 *
 * All times handled in UTC internally.
 * IST = UTC + 5:30
 */

const LUNCH_CUTOFF_UTC  = { hours: 4,  minutes: 30 }; // 10:00 AM IST
const DINNER_CUTOFF_UTC = { hours: 11, minutes: 30 }; // 05:00 PM IST

const LUNCH_CUTOFF_DECIMAL  = LUNCH_CUTOFF_UTC.hours  + LUNCH_CUTOFF_UTC.minutes  / 60; // 4.5
const DINNER_CUTOFF_DECIMAL = DINNER_CUTOFF_UTC.hours + DINNER_CUTOFF_UTC.minutes / 60; // 11.5

const getUTCDecimalHour = (date) =>
  date.getUTCHours() + date.getUTCMinutes() / 60;

const toUTCMidnight = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/**
 * Meals missed on the day the kitchen closes.
 *
 * closed before lunch  → both meals missed today → 2
 * closed after lunch, before dinner → only dinner missed → 1
 * closed after dinner  → no meals missed today → 0
 */
const getMealsLostOnCloseDay = (closeTime) => {
  const utcHour = getUTCDecimalHour(closeTime);
  if      (utcHour < LUNCH_CUTOFF_DECIMAL)  return 2;
  else if (utcHour < DINNER_CUTOFF_DECIMAL) return 1;
  else                                       return 0;
};

/**
 * Meals missed on the day the kitchen reopens.
 *
 * reopened before lunch  → 0 meals missed (both served today)
 * reopened after lunch, before dinner → 1 meal missed (lunch gone)
 * reopened after dinner  → 2 meals missed (both gone today)
 */
const getMealsLostOnReopenDay = (reopenTime) => {
  const utcHour = getUTCDecimalHour(reopenTime);
  if      (utcHour < LUNCH_CUTOFF_DECIMAL)  return 0;
  else if (utcHour < DINNER_CUTOFF_DECIMAL) return 1;
  else                                       return 2;
};

/**
 * Main function — counts total missed meals between closeTime and reopenTime.
 *
 * @param {Date} closeTime   — exact datetime vendor closed kitchen
 * @param {Date} reopenTime  — exact datetime vendor reopened kitchen
 * @returns {{ missedMeals: number, extensionDays: number, breakdown: Array }}
 *
 * extensionDays = missedMeals / 2 rounded up to nearest 0.5
 */
const calculateMissedMeals = (closeTime, reopenTime) => {
  if (reopenTime <= closeTime) {
    return { missedMeals: 0, extensionDays: 0, breakdown: [] };
  }

  const closeDay  = toUTCMidnight(closeTime);
  const reopenDay = toUTCMidnight(reopenTime);
  const breakdown = [];
  let totalMissedMeals = 0;

  const isSameDay = closeDay.getTime() === reopenDay.getTime();

  if (isSameDay) {
    const closeHour  = getUTCDecimalHour(closeTime);
    const reopenHour = getUTCDecimalHour(reopenTime);
    let mealsLost = 0;

    if (closeHour < LUNCH_CUTOFF_DECIMAL  && reopenHour >= LUNCH_CUTOFF_DECIMAL)  mealsLost += 1;
    if (closeHour < DINNER_CUTOFF_DECIMAL && reopenHour >= DINNER_CUTOFF_DECIMAL) mealsLost += 1;

    breakdown.push({ date: closeDay.toISOString().split('T')[0], type: 'same-day', mealsLost });
    totalMissedMeals += mealsLost;

  } else {
    // Close day
    const closeDayMeals = getMealsLostOnCloseDay(closeTime);
    breakdown.push({ date: closeDay.toISOString().split('T')[0], type: 'close-day', mealsLost: closeDayMeals });
    totalMissedMeals += closeDayMeals;

    // Full days in between
    const cursor = new Date(closeDay);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    while (cursor.getTime() < reopenDay.getTime()) {
      breakdown.push({ date: cursor.toISOString().split('T')[0], type: 'full-day', mealsLost: 2 });
      totalMissedMeals += 2;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // Reopen day
    const reopenDayMeals = getMealsLostOnReopenDay(reopenTime);
    breakdown.push({ date: reopenDay.toISOString().split('T')[0], type: 'reopen-day', mealsLost: reopenDayMeals });
    totalMissedMeals += reopenDayMeals;
  }

  // Round up to nearest 0.5: 1 meal → 0.5d, 3 meals → 1.5d, 4 meals → 2d
  const extensionDays = Math.ceil(totalMissedMeals / 2 * 2) / 2;

  return { missedMeals: totalMissedMeals, extensionDays, breakdown };
};

/**
 * For PLANNED closures — vendor picks dates, not exact times.
 * Assumes kitchen closes at start of startDate (UTC midnight = 05:30 AM IST)
 * and reopens at start of the day AFTER endDate — giving maximum fair extension.
 *
 * @param {Date} plannedStartDate  — closure start date (any time, midnight used)
 * @param {Date} plannedEndDate    — closure end date (any time, midnight of next day used)
 */
const calculatePlannedClosureMeals = (plannedStartDate, plannedEndDate) => {
  const closeTime  = toUTCMidnight(plannedStartDate);
  const reopenTime = toUTCMidnight(plannedEndDate);
  reopenTime.setUTCDate(reopenTime.getUTCDate() + 1);
  return calculateMissedMeals(closeTime, reopenTime);
};

module.exports = {
  calculateMissedMeals,
  calculatePlannedClosureMeals,
  getMealsLostOnCloseDay,
  getMealsLostOnReopenDay,
  LUNCH_CUTOFF_UTC,
  DINNER_CUTOFF_UTC
};
