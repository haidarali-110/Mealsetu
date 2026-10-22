/**
 * Unit tests for mealSlotCalculator.js
 *
 * All times expressed in UTC. IST = UTC + 5:30.
 * Meal cutoffs:
 *   Lunch  cutoff: 04:30 UTC (10:00 AM IST)
 *   Dinner cutoff: 11:30 UTC (05:00 PM IST)
 */

const {
  calculateMissedMeals,
  calculatePlannedClosureMeals,
  getMealsLostOnCloseDay,
  getMealsLostOnReopenDay
} = require('../mealSlotCalculator');

// Helper — build a UTC Date from parts
const utc = (y, mo, d, h = 0, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h, mi));

// ── getMealsLostOnCloseDay ──────────────────────────────────────────────────

describe('getMealsLostOnCloseDay', () => {
  test('closes before lunch (04:30 UTC) → 2 meals lost', () => {
    expect(getMealsLostOnCloseDay(utc(2024, 5, 1, 4, 0))).toBe(2);
  });

  test('closes exactly at lunch cutoff (04:30 UTC) → 1 meal lost', () => {
    // at cutoff: utcHour === 4.5, NOT < 4.5, so lunch is served → only dinner missed
    expect(getMealsLostOnCloseDay(utc(2024, 5, 1, 4, 30))).toBe(1);
  });

  test('closes between lunch and dinner (09:00 UTC) → 1 meal lost', () => {
    expect(getMealsLostOnCloseDay(utc(2024, 5, 1, 9, 0))).toBe(1);
  });

  test('closes exactly at dinner cutoff (11:30 UTC) → 0 meals lost', () => {
    expect(getMealsLostOnCloseDay(utc(2024, 5, 1, 11, 30))).toBe(0);
  });

  test('closes after dinner (14:00 UTC) → 0 meals lost', () => {
    expect(getMealsLostOnCloseDay(utc(2024, 5, 1, 14, 0))).toBe(0);
  });
});

// ── getMealsLostOnReopenDay ────────────────────────────────────────────────

describe('getMealsLostOnReopenDay', () => {
  test('reopens before lunch (04:00 UTC) → 0 meals lost', () => {
    expect(getMealsLostOnReopenDay(utc(2024, 5, 2, 4, 0))).toBe(0);
  });

  test('reopens exactly at lunch cutoff (04:30 UTC) → 1 meal lost', () => {
    // at cutoff: lunch cutoff passed → lunch missed
    expect(getMealsLostOnReopenDay(utc(2024, 5, 2, 4, 30))).toBe(1);
  });

  test('reopens between meals (08:00 UTC) → 1 meal lost (lunch)', () => {
    expect(getMealsLostOnReopenDay(utc(2024, 5, 2, 8, 0))).toBe(1);
  });

  test('reopens exactly at dinner cutoff (11:30 UTC) → 2 meals lost', () => {
    expect(getMealsLostOnReopenDay(utc(2024, 5, 2, 11, 30))).toBe(2);
  });

  test('reopens after dinner (15:00 UTC) → 2 meals lost', () => {
    expect(getMealsLostOnReopenDay(utc(2024, 5, 2, 15, 0))).toBe(2);
  });
});

// ── calculateMissedMeals — edge cases ─────────────────────────────────────

describe('calculateMissedMeals — edge cases', () => {
  test('reopenTime <= closeTime returns zero', () => {
    const t = utc(2024, 5, 1, 8, 0);
    const result = calculateMissedMeals(t, t);
    expect(result).toEqual({ missedMeals: 0, extensionDays: 0, breakdown: [] });
  });

  test('reopenTime before closeTime returns zero', () => {
    const result = calculateMissedMeals(utc(2024, 5, 2, 8, 0), utc(2024, 5, 1, 8, 0));
    expect(result.missedMeals).toBe(0);
  });
});

// ── calculateMissedMeals — same-day scenarios ─────────────────────────────

describe('calculateMissedMeals — same day', () => {
  test('closed before lunch, reopens after lunch but before dinner → 1 meal (lunch)', () => {
    const result = calculateMissedMeals(
      utc(2024, 5, 1, 3, 0),   // 08:30 IST — before lunch
      utc(2024, 5, 1, 7, 0)    // 12:30 IST — after lunch
    );
    expect(result.missedMeals).toBe(1);
    expect(result.extensionDays).toBe(0.5);
  });

  test('closed before lunch, reopens after dinner → 2 meals', () => {
    const result = calculateMissedMeals(
      utc(2024, 5, 1, 3, 0),   // before lunch
      utc(2024, 5, 1, 14, 0)   // after dinner
    );
    expect(result.missedMeals).toBe(2);
    expect(result.extensionDays).toBe(1);
  });

  test('closed after lunch but before dinner, reopens after dinner → 1 meal (dinner)', () => {
    const result = calculateMissedMeals(
      utc(2024, 5, 1, 8, 0),   // 13:30 IST — after lunch
      utc(2024, 5, 1, 14, 0)   // 19:30 IST — after dinner
    );
    expect(result.missedMeals).toBe(1);
    expect(result.extensionDays).toBe(0.5);
  });

  test('closed after lunch but before dinner, reopens before dinner → 0 meals', () => {
    const result = calculateMissedMeals(
      utc(2024, 5, 1, 8, 0),   // after lunch
      utc(2024, 5, 1, 10, 0)   // before dinner
    );
    expect(result.missedMeals).toBe(0);
    expect(result.extensionDays).toBe(0);
  });

  test('closed and reopened both after dinner → 0 meals', () => {
    const result = calculateMissedMeals(
      utc(2024, 5, 1, 13, 0),
      utc(2024, 5, 1, 14, 0)
    );
    expect(result.missedMeals).toBe(0);
    expect(result.extensionDays).toBe(0);
  });
});

// ── calculateMissedMeals — multi-day scenarios ────────────────────────────

describe('calculateMissedMeals — multi-day', () => {
  test('closes at UTC midnight (05:30 IST), reopens at UTC midnight next day → 2 meals', () => {
    // close = before lunch (00:00 UTC) → 2 meals on close day
    // reopen = before lunch (00:00 UTC) → 0 meals on reopen day
    // no full days in between
    const result = calculateMissedMeals(
      utc(2024, 5, 1, 0, 0),
      utc(2024, 5, 2, 0, 0)
    );
    expect(result.missedMeals).toBe(2);
    expect(result.extensionDays).toBe(1);
    expect(result.breakdown).toHaveLength(2);
  });

  test('closes after dinner day 1, reopens before lunch day 3 → 2 full-day meals', () => {
    // close day: 0 meals (after dinner)
    // full day 2: 2 meals
    // reopen day 3 before lunch: 0 meals
    const result = calculateMissedMeals(
      utc(2024, 5, 1, 14, 0),  // after dinner
      utc(2024, 5, 3, 2, 0)    // before lunch
    );
    expect(result.missedMeals).toBe(2);
    expect(result.extensionDays).toBe(1);
    expect(result.breakdown).toHaveLength(3);
  });

  test('closes before lunch day 1, reopens after dinner day 3 → 6 meals', () => {
    // close day: 2 meals
    // full day 2: 2 meals
    // reopen day 3 after dinner: 2 meals
    const result = calculateMissedMeals(
      utc(2024, 5, 1, 3, 0),   // before lunch
      utc(2024, 5, 3, 14, 0)   // after dinner
    );
    expect(result.missedMeals).toBe(6);
    expect(result.extensionDays).toBe(3);
  });

  test('3 missed meals → extensionDays rounds up to 1.5', () => {
    // close before lunch (2 meals on close day)
    // reopen day 2 between meals (1 meal on reopen day)
    const result = calculateMissedMeals(
      utc(2024, 5, 1, 3, 0),
      utc(2024, 5, 2, 8, 0)
    );
    expect(result.missedMeals).toBe(3);
    expect(result.extensionDays).toBe(1.5);
  });

  test('1 missed meal → extensionDays = 0.5', () => {
    const result = calculateMissedMeals(
      utc(2024, 5, 1, 8, 0),   // after lunch, before dinner
      utc(2024, 5, 2, 3, 0)    // before lunch next day (dinner missed yesterday, nothing today)
    );
    // close day: 1 meal (dinner)
    // reopen day before lunch: 0 meals
    expect(result.missedMeals).toBe(1);
    expect(result.extensionDays).toBe(0.5);
  });

  test('breakdown entries have correct types and dates', () => {
    const result = calculateMissedMeals(
      utc(2024, 5, 1, 8, 0),
      utc(2024, 5, 3, 8, 0)
    );
    const types = result.breakdown.map(b => b.type);
    expect(types[0]).toBe('close-day');
    expect(types[types.length - 1]).toBe('reopen-day');
    result.breakdown.forEach(b => {
      expect(b).toHaveProperty('date');
      expect(b).toHaveProperty('mealsLost');
      expect(b.mealsLost).toBeGreaterThanOrEqual(0);
      expect(b.mealsLost).toBeLessThanOrEqual(2);
    });
  });
});

// ── calculatePlannedClosureMeals ──────────────────────────────────────────

describe('calculatePlannedClosureMeals', () => {
  test('1-day closure (startDate = endDate) → 2 full days computed (start midnight to end+1 midnight)', () => {
    // start = May 1 midnight UTC (05:30 IST)
    // reopen = May 2 midnight UTC (05:30 IST)
    // close day (May 1) before lunch → 2 meals
    // reopen day (May 2) before lunch → 0 meals
    const result = calculatePlannedClosureMeals(
      utc(2024, 5, 1),
      utc(2024, 5, 1)   // same date → reopen = May 2 midnight
    );
    expect(result.missedMeals).toBe(2);
    expect(result.extensionDays).toBe(1);
  });

  test('3-day closure (May 1 to May 3) → 6 meals, 3 days', () => {
    // close = May 1 midnight UTC, reopen = May 4 midnight UTC
    // May 1 (close, before lunch): 2 meals
    // May 2 (full): 2 meals
    // May 3 (full): 2 meals
    // May 4 (reopen, before lunch): 0 meals
    const result = calculatePlannedClosureMeals(
      utc(2024, 5, 1),
      utc(2024, 5, 3)
    );
    expect(result.missedMeals).toBe(6);
    expect(result.extensionDays).toBe(3);
  });

  test('extensionDays is always a multiple of 0.5', () => {
    for (let days = 1; days <= 5; days++) {
      const result = calculatePlannedClosureMeals(
        utc(2024, 5, 1),
        utc(2024, 5, days)
      );
      expect(result.extensionDays % 0.5).toBe(0);
    }
  });

  test('ignores time component of input — always uses UTC midnight', () => {
    // Whether we pass midday or midnight, result should be the same
    const r1 = calculatePlannedClosureMeals(utc(2024, 5, 1, 0, 0), utc(2024, 5, 3, 0, 0));
    const r2 = calculatePlannedClosureMeals(utc(2024, 5, 1, 12, 0), utc(2024, 5, 3, 18, 0));
    expect(r1.missedMeals).toBe(r2.missedMeals);
    expect(r1.extensionDays).toBe(r2.extensionDays);
  });
});
