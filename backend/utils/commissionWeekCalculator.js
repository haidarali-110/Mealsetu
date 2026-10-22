/**
 * MealSetu — Commission Week Calculator
 *
 * Rules:
 * - Week starts on vendor's onboard date (first order date)
 * - Each week is exactly 7 days (rolling, not calendar Mon-Sun)
 * - Financial year starts April 1
 * - Week number is counted from first week of April of that FY
 */

/**
 * Returns Indian Financial Year string for a given date.
 * April 1 2026 → March 31 2027 = "FY2026-27"
 */
const getFinancialYear = (date) => {
  const d     = new Date(date);
  const year  = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0=Jan, 3=April

  if (month >= 3) {
    return `FY${year}-${String(year + 1).slice(2)}`;
  } else {
    return `FY${year - 1}-${String(year).slice(2)}`;
  }
};

/**
 * Returns FY start date (April 1 UTC midnight) for a given date.
 */
const getFYStart = (date) => {
  const d     = new Date(date);
  const year  = d.getUTCFullYear();
  const month = d.getUTCMonth();

  const fyYear = month >= 3 ? year : year - 1;
  return new Date(Date.UTC(fyYear, 3, 1, 0, 0, 0, 0)); // April 1
};

/**
 * Given vendor's first order date and a target date, returns which
 * commission week the target date falls in.
 *
 * @param {Date} onboardDate  — date of vendor's first order
 * @param {Date} targetDate   — date to check (defaults to now)
 * @returns {Object|null} { weekNumber, fyWeekNumber, weekStart, weekEnd, dueDate, weekKey, financialYear }
 */
const getCommissionWeek = (onboardDate, targetDate = new Date()) => {
  if (!onboardDate || isNaN(new Date(onboardDate).getTime())) {
    console.error('[getCommissionWeek] Invalid onboardDate:', onboardDate);
    return null;
  }
  if (!targetDate || isNaN(new Date(targetDate).getTime())) {
    console.error('[getCommissionWeek] Invalid targetDate:', targetDate);
    return null;
  }

  const start = new Date(onboardDate);
  start.setUTCHours(0, 0, 0, 0);

  const target = new Date(targetDate);
  target.setUTCHours(0, 0, 0, 0);

  const daysSinceOnboard = Math.floor(
    (target.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (daysSinceOnboard < 0) return null;

  const weekIndex = Math.floor(daysSinceOnboard / 7);

  const weekStart = new Date(start.getTime() + weekIndex * 7 * 24 * 60 * 60 * 1000);
  const weekEnd   = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  weekEnd.setUTCHours(23, 59, 59, 999);

  const dueDate = new Date(weekEnd);
  dueDate.setUTCDate(dueDate.getUTCDate() + 7);

  const fyStart      = getFYStart(weekStart);
  const fyWeekNum    = Math.floor(
    (weekStart.getTime() - fyStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
  ) + 1;
  const financialYear = getFinancialYear(weekStart);
  const weekKey       = `${financialYear}-W${String(fyWeekNum).padStart(2, '0')}`;

  return {
    weekNumber:   weekIndex + 1,
    fyWeekNumber: fyWeekNum,
    weekStart,
    weekEnd,
    dueDate,
    weekKey,
    financialYear
  };
};

/**
 * Returns all commission weeks for a vendor from onboard to today.
 * Useful for generating full history.
 */
const getAllCommissionWeeks = (onboardDate) => {
  const weeks = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const start = new Date(onboardDate);
  start.setUTCHours(0, 0, 0, 0);

  let weekIndex = 0;

  while (true) {
    const weekStart = new Date(start.getTime() + weekIndex * 7 * 24 * 60 * 60 * 1000);
    if (weekStart > today) break;

    const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
    weekEnd.setUTCHours(23, 59, 59, 999);

    const dueDate       = new Date(weekEnd);
    dueDate.setUTCDate(dueDate.getUTCDate() + 7);
    const fyStart       = getFYStart(weekStart);
    const fyWeekNum     = Math.floor(
      (weekStart.getTime() - fyStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
    ) + 1;
    const financialYear = getFinancialYear(weekStart);
    const weekKey       = `${financialYear}-W${String(fyWeekNum).padStart(2, '0')}`;

    weeks.push({
      weekNumber:   weekIndex + 1,
      fyWeekNumber: fyWeekNum,
      weekStart,
      weekEnd,
      dueDate,
      weekKey,
      financialYear
    });

    weekIndex++;
  }

  return weeks;
};

/**
 * Checks if a commission is overdue.
 * overdue = dueDate has passed AND status is still not 'paid'
 */
const isCommissionOverdue = (dueDate, status) => {
  if (status === 'paid') return false;
  return new Date(dueDate) < new Date();
};

module.exports = {
  getCommissionWeek,
  getAllCommissionWeeks,
  getFinancialYear,
  getFYStart,
  isCommissionOverdue
};
