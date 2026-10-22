const { connectTestDB, disconnectTestDB, clearTestDB } = require('../helpers/dbSetup');
const { createVendor, createUser, createActiveOrder, createPendingOrder } = require('../helpers/factories');
const { calculateMissedMeals }    = require('../../utils/mealSlotCalculator');
const { extendAllPlansOnClosure } = require('../../controllers/vendorController');
const Order = require('../../models/Order');

// UTC date builder — sets time on a copy of base date
const utcDate = (base, hours, mins = 0) => {
  const d = new Date(base);
  d.setUTCHours(hours, mins, 0, 0);
  return d;
};

const TODAY = new Date();
TODAY.setUTCHours(0, 0, 0, 0);

const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => await connectTestDB());
afterAll(async () => await disconnectTestDB());
beforeEach(async () => await clearTestDB());

// ─────────────────────────────────────────
// GROUP 1 — extendAllPlansOnClosure core
// ─────────────────────────────────────────
describe('extendAllPlansOnClosure — core extension', () => {

  test('1 full day: active order endDate shifts by exactly 86400000ms', async () => {
    const vendor = await createVendor();
    const user   = await createUser();
    const order  = await createActiveOrder(vendor._id, user._id, 7);
    const before = new Date(order.endDate).getTime();

    await extendAllPlansOnClosure(vendor._id, 1);

    const after = (await Order.findById(order._id)).endDate.getTime();
    expect(after - before).toBe(DAY_MS);
  });

  test('0.5 days: active order endDate shifts by exactly 43200000ms (12 hours)', async () => {
    const vendor = await createVendor();
    const user   = await createUser();
    const order  = await createActiveOrder(vendor._id, user._id, 7);
    const before = new Date(order.endDate).getTime();

    await extendAllPlansOnClosure(vendor._id, 0.5);

    const after = (await Order.findById(order._id)).endDate.getTime();
    expect(after - before).toBe(0.5 * DAY_MS);
  });

  test('1.5 days: active order endDate shifts by exactly 129600000ms (36 hours)', async () => {
    const vendor = await createVendor();
    const user   = await createUser();
    const order  = await createActiveOrder(vendor._id, user._id, 7);
    const before = new Date(order.endDate).getTime();

    await extendAllPlansOnClosure(vendor._id, 1.5);

    const after = (await Order.findById(order._id)).endDate.getTime();
    expect(after - before).toBe(1.5 * DAY_MS);
  });

  test('0 days: active order endDate is unchanged', async () => {
    const vendor = await createVendor();
    const user   = await createUser();
    const order  = await createActiveOrder(vendor._id, user._id, 7);
    const before = new Date(order.endDate).getTime();

    const result = await extendAllPlansOnClosure(vendor._id, 0);

    const after = (await Order.findById(order._id)).endDate.getTime();
    expect(after).toBe(before);
    expect(result.activeUpdated).toBe(0);
  });

});

// ─────────────────────────────────────────
// GROUP 2 — Pending order: all 4 fields
// ─────────────────────────────────────────
describe('extendAllPlansOnClosure — pending order field shifts', () => {

  test('shifts all 4 date fields on pending order by correct ms', async () => {
    const vendor  = await createVendor();
    const user    = await createUser();
    const pending = await createPendingOrder(vendor._id, user._id, 8);

    const b = {
      start:      new Date(pending.startDate).getTime(),
      end:        new Date(pending.endDate).getTime(),
      schedStart: new Date(pending.scheduledStartDate).getTime(),
      schedEnd:   new Date(pending.scheduledEndDate).getTime()
    };

    await extendAllPlansOnClosure(vendor._id, 1);

    const updated = await Order.findById(pending._id);
    expect(updated.startDate.getTime()         ).toBe(b.start      + DAY_MS);
    expect(updated.endDate.getTime()           ).toBe(b.end        + DAY_MS);
    expect(updated.scheduledStartDate.getTime()).toBe(b.schedStart  + DAY_MS);
    expect(updated.scheduledEndDate.getTime()  ).toBe(b.schedEnd   + DAY_MS);
  });

  test('shifts pending by 0.5 days — all 4 fields shift by 12 hours', async () => {
    const vendor  = await createVendor();
    const user    = await createUser();
    const pending = await createPendingOrder(vendor._id, user._id, 8);

    const b = {
      start:      new Date(pending.startDate).getTime(),
      end:        new Date(pending.endDate).getTime(),
      schedStart: new Date(pending.scheduledStartDate).getTime(),
      schedEnd:   new Date(pending.scheduledEndDate).getTime()
    };

    await extendAllPlansOnClosure(vendor._id, 0.5);

    const updated = await Order.findById(pending._id);
    const halfDay = 0.5 * DAY_MS;

    expect(updated.startDate.getTime()         ).toBe(b.start      + halfDay);
    expect(updated.endDate.getTime()           ).toBe(b.end        + halfDay);
    expect(updated.scheduledStartDate.getTime()).toBe(b.schedStart  + halfDay);
    expect(updated.scheduledEndDate.getTime()  ).toBe(b.schedEnd   + halfDay);
  });

});

// ─────────────────────────────────────────
// GROUP 3 — Scope: who gets extended
// ─────────────────────────────────────────
describe('extendAllPlansOnClosure — scope checks', () => {

  test('extends BOTH active and pending orders in one call', async () => {
    const vendor  = await createVendor();
    const user    = await createUser();
    const active  = await createActiveOrder(vendor._id,  user._id, 7);
    const pending = await createPendingOrder(vendor._id, user._id, 8);

    const beforeActive  = new Date(active.endDate).getTime();
    const beforePending = new Date(pending.endDate).getTime();

    const result = await extendAllPlansOnClosure(vendor._id, 1);

    expect(result.activeUpdated  ).toBe(1);
    expect(result.upcomingUpdated).toBe(1);

    const updatedActive  = await Order.findById(active._id);
    const updatedPending = await Order.findById(pending._id);

    expect(updatedActive.endDate.getTime() ).toBe(beforeActive  + DAY_MS);
    expect(updatedPending.endDate.getTime()).toBe(beforePending + DAY_MS);
  });

  test('does NOT extend orders from a different vendor', async () => {
    const vendor1 = await createVendor({ kitchenName: 'Kitchen 1' });
    const vendor2 = await createVendor({ kitchenName: 'Kitchen 2' });
    const user    = await createUser();

    const order1 = await createActiveOrder(vendor1._id, user._id, 7);
    const order2 = await createActiveOrder(vendor2._id, user._id, 7);

    const before2 = new Date(order2.endDate).getTime();

    await extendAllPlansOnClosure(vendor1._id, 1);

    const updated2 = await Order.findById(order2._id);
    expect(updated2.endDate.getTime()).toBe(before2);  // vendor2 untouched
  });

  test('does NOT extend already-expired active orders', async () => {
    const vendor  = await createVendor();
    const user    = await createUser();
    const expired = await createActiveOrder(vendor._id, user._id, -2);  // ended 2 days ago

    const before = new Date(expired.endDate).getTime();

    await extendAllPlansOnClosure(vendor._id, 1);

    const updated = await Order.findById(expired._id);
    expect(updated.endDate.getTime()).toBe(before);  // expired order unchanged
  });

  test('handles multiple active orders for same vendor', async () => {
    const vendor = await createVendor();
    const user1  = await createUser();
    const user2  = await createUser();

    const order1 = await createActiveOrder(vendor._id, user1._id, 7);
    const order2 = await createActiveOrder(vendor._id, user2._id, 14);

    const before1 = new Date(order1.endDate).getTime();
    const before2 = new Date(order2.endDate).getTime();

    const result = await extendAllPlansOnClosure(vendor._id, 1);

    expect(result.activeUpdated).toBe(2);

    const updated1 = await Order.findById(order1._id);
    const updated2 = await Order.findById(order2._id);

    expect(updated1.endDate.getTime()).toBe(before1 + DAY_MS);
    expect(updated2.endDate.getTime()).toBe(before2 + DAY_MS);
  });

});

// ─────────────────────────────────────────
// GROUP 4 — Full meal calculation → extension
// ─────────────────────────────────────────
describe('Meal calculation → order extension — end to end', () => {

  test('emergency: close pre-lunch, reopen post-lunch same day → 0.5 day', async () => {
    const vendor = await createVendor();
    const user   = await createUser();
    const order  = await createActiveOrder(vendor._id, user._id, 7);
    const before = new Date(order.endDate).getTime();

    const closeTime  = utcDate(TODAY, 3);   // 03:00 UTC = 08:30 IST (before lunch)
    const reopenTime = utcDate(TODAY, 8);   // 08:00 UTC = 13:30 IST (after lunch)

    const { missedMeals, extensionDays } = calculateMissedMeals(closeTime, reopenTime);

    expect(missedMeals  ).toBe(1);
    expect(extensionDays).toBe(0.5);

    await extendAllPlansOnClosure(vendor._id, extensionDays);

    const after = (await Order.findById(order._id)).endDate.getTime();
    expect(after - before).toBe(0.5 * DAY_MS);
  });

  test('emergency: close pre-lunch, reopen post-dinner same day → 1 day', async () => {
    const vendor = await createVendor();
    const user   = await createUser();
    const order  = await createActiveOrder(vendor._id, user._id, 7);
    const before = new Date(order.endDate).getTime();

    const closeTime  = utcDate(TODAY, 3);   // before lunch IST
    const reopenTime = utcDate(TODAY, 14);  // after dinner IST

    const { missedMeals, extensionDays } = calculateMissedMeals(closeTime, reopenTime);

    expect(missedMeals  ).toBe(2);
    expect(extensionDays).toBe(1);

    await extendAllPlansOnClosure(vendor._id, extensionDays);

    const after = (await Order.findById(order._id)).endDate.getTime();
    expect(after - before).toBe(DAY_MS);
  });

  test('emergency: close post-dinner, reopen next morning → 0 extension', async () => {
    const vendor = await createVendor();
    const user   = await createUser();
    const order  = await createActiveOrder(vendor._id, user._id, 7);
    const before = new Date(order.endDate).getTime();

    const tomorrow = new Date(TODAY);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const closeTime  = utcDate(TODAY,    13);  // after dinner IST
    const reopenTime = utcDate(tomorrow, 3);   // before lunch next day IST

    const { missedMeals, extensionDays } = calculateMissedMeals(closeTime, reopenTime);

    expect(missedMeals  ).toBe(0);
    expect(extensionDays).toBe(0);

    // extensionDays=0 → do NOT call extendAllPlansOnClosure
    const after = (await Order.findById(order._id)).endDate.getTime();
    expect(after).toBe(before);  // unchanged
  });

  test('emergency: close morning day 1, reopen morning day 3 → 2 days', async () => {
    const vendor = await createVendor();
    const user   = await createUser();
    const order  = await createActiveOrder(vendor._id, user._id, 14);
    const before = new Date(order.endDate).getTime();

    const day3 = new Date(TODAY);
    day3.setUTCDate(day3.getUTCDate() + 2);

    const closeTime  = utcDate(TODAY, 3);   // morning day 1
    const reopenTime = utcDate(day3,  3);   // morning day 3

    const { missedMeals, extensionDays } = calculateMissedMeals(closeTime, reopenTime);

    expect(missedMeals  ).toBe(4);
    expect(extensionDays).toBe(2);

    await extendAllPlansOnClosure(vendor._id, extensionDays);

    const after = (await Order.findById(order._id)).endDate.getTime();
    expect(after - before).toBe(2 * DAY_MS);
  });

  test('close post-lunch, reopen post-lunch next day → 1 dinner + 1 lunch = 1 day', async () => {
    const vendor = await createVendor();
    const user   = await createUser();
    const order  = await createActiveOrder(vendor._id, user._id, 7);
    const before = new Date(order.endDate).getTime();

    const tomorrow = new Date(TODAY);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const closeTime  = utcDate(TODAY,    7);  // after lunch IST, before dinner
    const reopenTime = utcDate(tomorrow, 7);  // after lunch IST next day

    const { missedMeals, extensionDays } = calculateMissedMeals(closeTime, reopenTime);

    expect(missedMeals  ).toBe(2);  // today dinner + tomorrow lunch
    expect(extensionDays).toBe(1);

    await extendAllPlansOnClosure(vendor._id, extensionDays);

    const after = (await Order.findById(order._id)).endDate.getTime();
    expect(after - before).toBe(DAY_MS);
  });

});
