jest.mock('../../models/Order', () => ({
  find: jest.fn(),
}));
jest.mock('../../models/DeliveryBatch', () => ({
  find: jest.fn(),
}));

const Order = require('../../models/Order');
const DeliveryBatch = require('../../models/DeliveryBatch');
const {
  getDayBounds,
  getEligibleOrders,
  generateEligibilityHint,
} = require('../deliveryEligibility');

describe('deliveryEligibility unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDayBounds', () => {
    test('returns exact start and end of day in local time', () => {
      const bounds = getDayBounds('2026-10-22');
      expect(bounds.dayStart.getHours()).toBe(0);
      expect(bounds.dayStart.getMinutes()).toBe(0);
      expect(bounds.dayStart.getSeconds()).toBe(0);
      expect(bounds.dayEnd.getHours()).toBe(23);
      expect(bounds.dayEnd.getMinutes()).toBe(59);
      expect(bounds.dayEnd.getSeconds()).toBe(59);
      expect(bounds.dayEnd.getMilliseconds()).toBe(999);
    });
  });

  describe('getEligibleOrders', () => {
    const vendorId = 'vendor-123';
    const testDate = '2026-10-22';
    const { dayStart, dayEnd } = getDayBounds(testDate);

    test('an order starting tomorrow is not eligible today and appears in startsLater', async () => {
      // 1. DeliveryBatch.find returns no batched orders
      DeliveryBatch.find.mockResolvedValue([]);

      // 2. Candidate query in getEligibleOrders returns 0 eligible orders
      const populateMock = jest.fn().mockResolvedValue([]);
      Order.find.mockReturnValueOnce({ populate: populateMock });

      // 3. withReasons query returns candidate starting tomorrow
      const tomorrowDate = new Date(dayEnd.getTime() + 1000 * 60 * 60);
      const candidatesPopulate = jest.fn().mockResolvedValue([
        {
          _id: 'order-sapna-cash',
          status: 'active',
          startDate: tomorrowDate,
          customerName: 'Sapna',
        },
      ]);
      Order.find.mockReturnValueOnce({ populate: candidatesPopulate });

      const result = await getEligibleOrders({
        vendorId,
        date: testDate,
        mealSlot: 'dinner',
        withReasons: true,
      });

      expect(result.eligible).toHaveLength(0);
      expect(result.excluded.startsLater).toHaveLength(1);
      expect(result.excluded.startsLater[0].orderId).toBe('order-sapna-cash');
      expect(result.excluded.startsLater[0].customerName).toBe('Sapna');
    });

    test('a queued pending order appears in queuedPending', async () => {
      DeliveryBatch.find.mockResolvedValue([]);
      Order.find.mockReturnValueOnce({ populate: jest.fn().mockResolvedValue([]) });

      const futureDate = new Date(dayEnd.getTime() + 1000 * 60 * 60 * 24);
      const candidatesPopulate = jest.fn().mockResolvedValue([
        {
          _id: 'order-sapna-upi-pending',
          status: 'pending',
          startDate: futureDate,
          customerName: 'Sapna',
        },
      ]);
      Order.find.mockReturnValueOnce({ populate: candidatesPopulate });

      const result = await getEligibleOrders({
        vendorId,
        date: testDate,
        mealSlot: 'dinner',
        withReasons: true,
      });

      expect(result.eligible).toHaveLength(0);
      expect(result.excluded.queuedPending).toHaveLength(1);
      expect(result.excluded.queuedPending[0].orderId).toBe('order-sapna-upi-pending');
    });

    test('an order already in a same-slot batch is excluded', async () => {
      // Batch already contains order-1
      DeliveryBatch.find.mockResolvedValue([
        { orders: [{ orderId: 'order-1' }] },
      ]);

      // Database returns only unbatched orders (mocking $nin filter)
      Order.find.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue([]),
      });

      const result = await getEligibleOrders({
        vendorId,
        date: testDate,
        mealSlot: 'dinner',
        withReasons: false,
      });

      expect(result.eligible).toHaveLength(0);
      expect(result.excluded.alreadyBatched).toBe(1);
      // Verify DeliveryBatch query used vendorId and slot
      expect(DeliveryBatch.find).toHaveBeenCalledWith(
        expect.objectContaining({ vendorId, mealSlot: 'dinner' }),
        'orders.orderId'
      );
    });

    test('first-day dinner rule works for lunch vs dinner', async () => {
      DeliveryBatch.find.mockResolvedValue([]);

      const orderFirstDayDinner = {
        _id: 'order-first-dinner',
        status: 'active',
        startDate: new Date(testDate),
        firstDayMealSlot: 'dinner',
      };

      // Lunch slot: should be excluded
      Order.find.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue([orderFirstDayDinner]),
      });

      const lunchResult = await getEligibleOrders({
        vendorId,
        date: testDate,
        mealSlot: 'lunch',
        withReasons: false,
      });
      expect(lunchResult.eligible).toHaveLength(0);
      expect(lunchResult.excluded.slotRule).toBe(1);

      // Dinner slot: should be included
      Order.find.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue([orderFirstDayDinner]),
      });

      const dinnerResult = await getEligibleOrders({
        vendorId,
        date: testDate,
        mealSlot: 'dinner',
        withReasons: false,
      });
      expect(dinnerResult.eligible).toHaveLength(1);
      expect(dinnerResult.eligible[0]._id).toBe('order-first-dinner');
    });

    test('regression: active orders within dates are returned as eligible', async () => {
      DeliveryBatch.find.mockResolvedValue([]);

      const activeOrder = {
        _id: 'order-reg-1',
        status: 'active',
        startDate: new Date(dayStart),
        endDate: new Date(dayEnd.getTime() + 1000 * 60 * 60 * 24 * 7),
        userId: { name: 'Customer Test', phone: '9999999999' },
      };

      Order.find.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue([activeOrder]),
      });

      const result = await getEligibleOrders({
        vendorId,
        date: testDate,
        mealSlot: 'lunch',
        withReasons: false,
      });

      expect(result.eligible).toHaveLength(1);
      expect(result.eligible[0]._id).toBe('order-reg-1');
    });
  });

  describe('generateEligibilityHint', () => {
    test('generates appropriate explanation when orders start later', () => {
      const hint = generateEligibilityHint({
        startsLater: [{ customerName: 'Sapna', startDate: new Date('2026-10-23T00:00:00.000Z') }],
        queuedPending: [],
      });
      expect(hint).toContain('start later');
      expect(hint).toContain('Change the date to');
    });

    test('generates appropriate explanation when orders are queued pending', () => {
      const hint = generateEligibilityHint({
        startsLater: [],
        queuedPending: [{ customerName: 'Sapna', startDate: new Date('2026-10-24T00:00:00.000Z') }],
      });
      expect(hint).toContain('queued plan(s) activate');
    });
  });
});
