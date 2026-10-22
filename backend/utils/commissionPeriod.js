// Backend/utils/commissionPeriod.js
// FY = April to March (e.g. "2026-27")

// AFTER — reuse your existing, already-correct FY calculator instead of duplicating it
const { getFinancialYear } = require('./commissionWeekCalculator');
const getFinancialYearLabel = (date) => getFinancialYear(date); // returns "FY2026-27"
// 1 = April ... 12 = March
const getFinancialMonthNumber = (date) => {
    const m = new Date(date).getMonth();
    return m >= 3 ? (m - 3 + 1) : (m + 9 + 1);
};

/**
 * For a vendor's anchor date (their first order) and the cron's run time,
 * compute which billing period should be generated this run.
 *  - If anchor falls inside the PREVIOUS calendar month → vendor's FIRST
 *    cycle: partial period from anchor date to end of that month.
 *    (Joined Sep 4 → first cycle = Sep 4–Sep 30.)
 *  - Otherwise → a normal full previous calendar month.
 *  - If anchor is still inside the CURRENT month (too new) → null,
 *    nothing to bill yet, picked up automatically next run.
 */
const getBillingPeriod = (anchorDate, now = new Date()) => {
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();

    const periodEnd = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59, 999);
    const anchor = new Date(anchorDate);

    if (anchor > periodEnd) return null;

    const isFirstCycle = anchor.getFullYear() === prevYear && anchor.getMonth() === prevMonth;
    const periodStart = isFirstCycle
        ? new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 0, 0, 0)
        : new Date(prevYear, prevMonth, 1, 0, 0, 0);

    const monthKey = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
    const monthLabel = periodStart.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

    return {
        periodStart, periodEnd, monthKey, monthLabel, isFirstCycle,
        financialYear: getFinancialYearLabel(periodEnd),
        financialMonthNumber: getFinancialMonthNumber(periodEnd),
    };
};

/** For the still-open, in-progress period shown live on the vendor's page. */
const getCurrentOpenPeriod = async (Commission, vendorId, anchorDate, now = new Date()) => {
    const hasAnyCommission = await Commission.exists({ vendorId });
    const anchor = new Date(anchorDate);
    const anchorInCurrentMonth =
        anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth();

    const isFirstCycle = !hasAnyCommission && anchorInCurrentMonth;
    const periodStart = isFirstCycle
        ? new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 0, 0, 0)
        : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    return { periodStart, periodEnd, isFirstCycle };
};

module.exports = { getFinancialYearLabel, getFinancialMonthNumber, getBillingPeriod, getCurrentOpenPeriod };