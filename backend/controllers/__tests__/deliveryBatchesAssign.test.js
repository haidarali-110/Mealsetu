jest.mock('../../models/DeliveryPartner');
jest.mock('../../models/DeliveryBatch');
jest.mock('../../models/Order');
jest.mock('../../models/Vendor');
jest.mock('../../models/User');
jest.mock('../../utils/deliveryEligibility');
jest.mock('../../utils/fcmService', () => ({
  notifyRiderNewBatch: jest.fn().mockResolvedValue({ success: true }),
  notifyDeliveryAssigned: jest.fn().mockResolvedValue({ success: true }),
  notifyDelivered: jest.fn().mockResolvedValue({ success: true }),
}));

const DeliveryPartner = require('../../models/DeliveryPartner');
const DeliveryBatch = require('../../models/DeliveryBatch');
const Order = require('../../models/Order');
const Vendor = require('../../models/Vendor');
const User = require('../../models/User');
const { getEligibleOrders, getDayBounds, generateEligibilityHint } = require('../../utils/deliveryEligibility');
const {
  createDeliveryBatches,
  assignOrdersToRider,
  resolveRiderBatchForOrder,
  updateOrderStatus,
} = require('../deliveryController');

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

describe('Delivery batching and per-order rider assignment', () => {
  const vendorId = 'vendor-test-1';
  const vendorDoc = {
    _id: vendorId,
    vendorId: 'khana_khazana',
    address: { latitude: 20.6, longitude: 72.9 },
  };

  const riderMujju = {
    _id: 'rider-mujju',
    userId: 'user-mujju',
    name: 'Mujju',
    vendorId,
    isActive: true,
    isAvailable: true,
    serviceArea: ['Surat'],
  };

  const riderRehan = {
    _id: 'rider-rehan',
    userId: 'user-rehan',
    name: 'Rehan',
    vendorId,
    isActive: true,
    isAvailable: true,
    serviceArea: ['Valsad'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Vendor.findOne.mockResolvedValue(vendorDoc);
    Vendor.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(vendorDoc),
      }),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(vendorDoc),
    });
    getDayBounds.mockReturnValue({
      dayStart: new Date('2026-10-22T00:00:00.000Z'),
      dayEnd: new Date('2026-10-22T23:59:59.999Z'),
    });
  });

  describe('createDeliveryBatches assignment modes', () => {
    test('auto mode picks least-loaded available rider (Rehan with 0 over Mujju with 4)', async () => {
      // Eligible order in area 'Valsad'
      const eligibleOrder = {
        _id: 'order-1',
        vendorId,
        paymentMethod: 'Cash',
        paymentStatus: 'Pending',
        planPrice: 100,
        userId: {
          _id: 'cust-1',
          name: 'Sapna',
          phone: '9157759250',
          pincode: '396001',
          address: { area: 'Valsad', fullAddress: 'Valsad market' },
        },
      };

      getEligibleOrders.mockResolvedValue({
        eligible: [eligibleOrder],
        excluded: {},
      });

      // Riders query returns Mujju and Rehan (both verified users)
      DeliveryPartner.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue([
          { ...riderMujju, userId: { _id: 'u-m', isActive: true, isVerified: true } },
          { ...riderRehan, userId: { _id: 'u-r', isActive: true, isVerified: true } },
        ]),
      });

      // Existing batches: Mujju has 1 batch with 4 stops for dinner today, Rehan has 0
      DeliveryBatch.find.mockResolvedValue([
        {
          _id: 'batch-mujju-1',
          riderId: 'rider-mujju',
          orders: [{ orderId: 'o1' }, { orderId: 'o2' }, { orderId: 'o3' }, { orderId: 'o4' }],
        },
      ]);

      DeliveryBatch.create.mockImplementation((batchData) => {
        return Promise.resolve({
          _id: 'new-batch-1',
          ...batchData,
        });
      });
      Order.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const req = {
        user: { _id: vendorId, vendorId },
        body: { date: '2026-10-22', mealSlot: 'dinner', assignMode: 'auto' },
        app: { get: () => ({ to: () => ({ emit: jest.fn() }) }) },
      };
      const res = makeResponse();

      await createDeliveryBatches(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.assignments).toBeDefined();
      // Rehan had 0 load, so Rehan gets the batch
      expect(res.body.assignments[0].riderId).toBe('rider-rehan');
      expect(res.body.assignments[0].riderName).toBe('Rehan');
    });

    test('rider mode assigns specifically to the requested rider', async () => {
      const eligibleOrder = {
        _id: 'order-specific',
        vendorId,
        paymentMethod: 'UPI',
        paymentStatus: 'Paid',
        userId: {
          _id: 'cust-2',
          name: 'Customer 2',
          pincode: '396001',
          address: { area: 'Valsad' },
        },
      };

      getEligibleOrders.mockResolvedValue({
        eligible: [eligibleOrder],
        excluded: {},
      });

      DeliveryPartner.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          ...riderMujju,
          userId: { _id: 'u-m', isActive: true, isVerified: true },
        }),
      });

      DeliveryBatch.create.mockImplementation((data) => Promise.resolve({ _id: 'b-specific', ...data }));
      Order.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const req = {
        user: { _id: vendorId, vendorId },
        body: {
          date: '2026-10-22',
          mealSlot: 'dinner',
          assignMode: 'rider',
          riderId: 'rider-mujju',
        },
        app: { get: () => ({ to: () => ({ emit: jest.fn() }) }) },
      };
      const res = makeResponse();

      await createDeliveryBatches(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.assignments[0].riderId).toBe('rider-mujju');
    });

    test('unassigned mode creates batch with pending status and null riderId', async () => {
      const eligibleOrder = {
        _id: 'order-unassigned',
        vendorId,
        userId: { name: 'Sapna', address: { area: 'Valsad' } },
      };

      getEligibleOrders.mockResolvedValue({
        eligible: [eligibleOrder],
        excluded: {},
      });

      DeliveryBatch.create.mockImplementation((data) => Promise.resolve({ _id: 'b-unassigned', ...data }));
      Order.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const req = {
        user: { _id: vendorId, vendorId },
        body: {
          date: '2026-10-22',
          mealSlot: 'dinner',
          assignMode: 'unassigned',
        },
        app: { get: () => ({ to: () => ({ emit: jest.fn() }) }) },
      };
      const res = makeResponse();

      await createDeliveryBatches(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.assignments[0].riderId).toBeNull();
      expect(DeliveryBatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          batchStatus: 'pending',
        })
      );
    });

    test('empty results return HTTP 200 with reasons and hint', async () => {
      getEligibleOrders.mockResolvedValue({
        eligible: [],
        excluded: {
          startsLater: [{ customerName: 'Sapna', startDate: '2026-10-23' }],
          queuedPending: [],
          alreadyBatched: 0,
        },
      });
      generateEligibilityHint.mockReturnValue(
        '1 order(s) start later (next: 23 Oct 2026). Change the date to 2026-10-23.'
      );

      const req = {
        user: { _id: vendorId, vendorId },
        body: { date: '2026-10-22', mealSlot: 'dinner' },
        app: { get: () => null },
      };
      const res = makeResponse();

      await createDeliveryBatches(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.batches).toEqual([]);
      expect(res.body.hint).toContain('start later');
      expect(res.body.reasons.startsLater).toHaveLength(1);
    });
  });

  describe('assignOrdersToRider per-order assignment', () => {
    test('moves order from Mujju in_progress batch to Rehan (creating target batch)', async () => {
      // Validate rider Rehan
      DeliveryPartner.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          ...riderRehan,
          userId: { _id: 'u-rehan', isActive: true, isVerified: true },
        }),
      });

      const orderToMove = {
        _id: 'order-sapna-1',
        vendorId,
        customerName: 'Sapna',
        deliveryStatus: 'assigned',
      };
      Order.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(orderToMove),
      });

      // Source batch: Mujju's batch has 2 orders, status in_progress
      const sourceBatch = {
        _id: 'batch-mujju-dinner',
        vendorId,
        riderId: 'rider-mujju',
        batchStatus: 'in_progress',
        orders: [
          {
            orderId: 'order-sapna-1',
            customerName: 'Sapna',
            status: 'assigned',
            address: { area: 'Valsad', pincode: '396001' },
            toObject: () => ({
              orderId: 'order-sapna-1',
              customerName: 'Sapna',
              status: 'assigned',
              address: { area: 'Valsad', pincode: '396001' },
            }),
          },
          {
            orderId: 'order-other-2',
            customerName: 'Other',
            status: 'in_progress',
            address: { area: 'Valsad', pincode: '396001' },
            toObject: () => ({ orderId: 'order-other-2' }),
          },
        ],
        save: jest.fn().mockResolvedValue(true),
      };

      // 1st DeliveryBatch.findOne: find source batch
      // 2nd DeliveryBatch.findOne: find target batch for Rehan (none found -> creates new)
      DeliveryBatch.findOne
        .mockResolvedValueOnce(sourceBatch)
        .mockResolvedValueOnce(null);

      // Target batch creation
      const createdTargetBatch = {
        _id: 'batch-rehan-dinner',
        riderId: 'rider-rehan',
        orders: [],
        save: jest.fn().mockResolvedValue(true),
      };
      DeliveryBatch.create.mockResolvedValue(createdTargetBatch);

      DeliveryBatch.updateOne.mockResolvedValue({ modifiedCount: 1 });
      Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
      DeliveryPartner.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ userId: 'u-mujju' }),
      });
      DeliveryBatch.findById.mockResolvedValue({
        _id: 'batch-mujju-dinner',
        orders: [{ orderId: 'order-other-2', status: 'in_progress', sequence: 1 }],
        optimizedRoute: [{ orderId: 'order-other-2', sequence: 1 }],
        save: jest.fn().mockResolvedValue(true),
      });

      const req = {
        user: { _id: vendorId, vendorId },
        body: {
          orderIds: ['order-sapna-1'],
          riderId: 'rider-rehan',
          mealSlot: 'dinner',
          date: '2026-10-22',
        },
        app: { get: () => ({ to: () => ({ emit: jest.fn() }) }) },
      };
      const res = makeResponse();

      await assignOrdersToRider(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.movedCount).toBe(1);
      expect(res.body.results[0].ok).toBe(true);
      expect(res.body.results[0].orderId).toBe('order-sapna-1');
      // Order.updateOne called with target rider and batch
      expect(Order.updateOne).toHaveBeenCalledWith(
        { _id: 'order-sapna-1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            deliveryRiderId: 'rider-rehan',
            deliveryStatus: 'assigned',
          }),
        })
      );
    });

    test('returns no-op when order is already assigned to the target rider', async () => {
      DeliveryPartner.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          ...riderRehan,
          userId: { _id: 'u-rehan', isActive: true, isVerified: true },
        }),
      });

      Order.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({ _id: 'order-sapna-1', vendorId }),
      });

      const batchAlreadyRehan = {
        _id: 'batch-rehan-dinner',
        riderId: 'rider-rehan',
        orders: [{ orderId: 'order-sapna-1', status: 'assigned' }],
      };
      DeliveryBatch.findOne.mockResolvedValue(batchAlreadyRehan);

      const req = {
        user: { _id: vendorId, vendorId },
        body: {
          orderIds: ['order-sapna-1'],
          riderId: 'rider-rehan',
          mealSlot: 'dinner',
        },
        app: { get: () => null },
      };
      const res = makeResponse();

      await assignOrdersToRider(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.results[0].ok).toBe(true);
      expect(res.body.results[0].noop).toBe(true);
    });

    test('rejects move for in-transit and delivered stops', async () => {
      DeliveryPartner.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          ...riderRehan,
          userId: { _id: 'u-rehan', isActive: true, isVerified: true },
        }),
      });

      Order.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({ _id: 'order-in-transit', vendorId }),
      });

      const batchInTransit = {
        _id: 'batch-transit',
        riderId: 'rider-mujju',
        orders: [{ orderId: 'order-in-transit', status: 'on_the_way' }],
      };
      DeliveryBatch.findOne.mockResolvedValue(batchInTransit);

      const req = {
        user: { _id: vendorId, vendorId },
        body: {
          orderIds: ['order-in-transit'],
          riderId: 'rider-rehan',
          mealSlot: 'dinner',
        },
        app: { get: () => null },
      };
      const res = makeResponse();

      await assignOrdersToRider(req, res);

      expect(res.statusCode).toBe(400); // all items failed
      expect(res.body.results[0].ok).toBe(false);
      expect(res.body.results[0].code).toBe('ORDER_IN_TRANSIT');
    });

    test('rejects invalid rider with 404', async () => {
      DeliveryPartner.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null),
      });

      const req = {
        user: { _id: vendorId, vendorId },
        body: { orderIds: ['order-1'], riderId: 'non-existent', mealSlot: 'dinner' },
        app: { get: () => null },
      };
      const res = makeResponse();

      await assignOrdersToRider(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Rider not found');
    });
  });

  describe('WP-5 multi-slot order authorization', () => {
    test('resolveRiderBatchForOrder finds rider active batch even if order.deliveryRiderId points to another slot rider', async () => {
      const orderId = 'order-multi-slot';
      const lunchRiderId = 'rider-lunch';
      const dinnerRiderId = 'rider-dinner';

      // Rider lunch queries for their active batch
      DeliveryBatch.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            _id: 'batch-lunch-123',
            riderId: lunchRiderId,
            orders: [{ orderId, status: 'assigned' }],
          },
        ]),
      });

      const resolved = await resolveRiderBatchForOrder(orderId, lunchRiderId);

      expect(resolved).toBeDefined();
      expect(resolved._id).toBe('batch-lunch-123');
    });
  });
});
