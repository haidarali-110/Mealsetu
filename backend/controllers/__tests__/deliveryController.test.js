jest.mock('../../models/DeliveryPartner', () => ({
  findByIdAndUpdate: jest.fn()
}));
jest.mock('../../models/DeliveryBatch', () => ({
  findById: jest.fn(),
  updateOne: jest.fn()
}));
jest.mock('../../models/Order', () => ({
  findOne: jest.fn(),
  updateMany: jest.fn()
}));
jest.mock('../../models/User', () => ({
  findById: jest.fn()
}));
jest.mock('../../models/Vendor', () => ({
  findById: jest.fn()
}));
jest.mock('../../utils/orderTransaction', () => jest.fn().mockResolvedValue({}));
jest.mock('../../utils/fcmService', () => ({
  notifyDelivered: jest.fn().mockResolvedValue({ success: true })
}));

const Order = require('../../models/Order');
const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const DeliveryPartner = require('../../models/DeliveryPartner');
const recordOrderTransaction = require('../../utils/orderTransaction');
const { updateOrderStatus } = require('../deliveryController');

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
  }
});

const runDelivery = async ({ riderCoordinates = true, riderLongitude = 0.0004, address = { latitude: 0, longitude: 0 }, cashCollected, cashAmount, accuracy } = {}) => {
  const order = {
    _id: 'order-1',
    userId: 'user-1',
    vendorId: 'vendor-1',
    deliveryBatchId: null,
    paymentMethod: 'Cash',
    paymentStatus: 'Pending',
    deliveryStatus: 'on_the_way',
    amount: 100,
    save: jest.fn().mockResolvedValue(undefined)
  };
  Order.findOne.mockResolvedValue(order);
  User.findById.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue({ address })
  });
  Vendor.findById.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(null)
  });
  DeliveryPartner.findByIdAndUpdate.mockResolvedValue({});
  recordOrderTransaction.mockClear();
  const res = makeResponse();
  const body = {
    status: 'delivered',
    cashCollected,
    cashAmount,
    accuracy,
    ...(riderCoordinates ? { latitude: 0, longitude: riderLongitude } : {})
  };

  await updateOrderStatus({
    body,
    params: { orderId: 'order-1' },
    deliveryPartner: { _id: 'rider-1', name: 'Rider' }
  }, res);
  return { order, res };
};

describe('updateOrderStatus delivery validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete global.io;
  });

  test('rejects missing rider coordinates before looking up delivery address', async () => {
    const { res } = await runDelivery({ riderCoordinates: false });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('GPS_REQUIRED');
    expect(User.findById).not.toHaveBeenCalled();
  });

  test('rejects delivery addresses without coordinates', async () => {
    const { res, order } = await runDelivery({
      address: { area: 'No coordinates' },
      cashCollected: true,
      cashAmount: 100
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('DELIVERY_COORDINATES_MISSING');
    expect(res.body.message).toMatch(/Contact the vendor/);
    expect(order.save).not.toHaveBeenCalled();
  });

  test('rejects a rider 51 meters from the address with the complete error shape', async () => {
    const { res } = await runDelivery({
      address: { latitude: 0, longitude: 0 },
      riderLongitude: 51 / 111194.9,
      cashCollected: true,
      cashAmount: 100
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual(expect.objectContaining({
      success: false,
      code: 'TOO_FAR',
      distanceMeters: expect.any(Number),
      allowedMeters: 50
    }));
    expect(res.body.distanceMeters).toBeGreaterThan(50);
  });

  test('checks cash confirmation after the geofence', async () => {
    const { res, order } = await runDelivery({
      cashCollected: false,
      cashAmount: 100
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('CASH_COLLECTION_REQUIRED');
    expect(order.save).not.toHaveBeenCalled();
  });

  test('persists rider cash collection and records an amount mismatch when in range', async () => {
    const { res, order } = await runDelivery({
      address: { latitude: 0, longitude: 0 },
      cashCollected: true,
      cashAmount: 85,
      accuracy: 20
    });
    expect(res.statusCode).toBe(200);
    expect(order.paymentStatus).toBe('Paid');
    expect(order.cashPaymentConfirmedAt).toBeInstanceOf(Date);
    expect(order.cashPaymentConfirmedBy).toBe('rider-1');
    expect(order.cashPaymentConfirmedByType).toBe('DeliveryPartner');
    expect(order.cashCollection).toEqual(expect.objectContaining({
      collected: true,
      amount: 85,
      expectedAmount: 100,
      difference: -15,
      amountMismatch: true
    }));
    expect(recordOrderTransaction).toHaveBeenCalledWith(order, 'Verified', 85);
  });

  test('rejects GPS accuracy above the configured default', async () => {
    const { res, order } = await runDelivery({
      cashCollected: true,
      cashAmount: 100,
      accuracy: 51
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('LOW_ACCURACY');
    expect(res.body.message).toBe('Move to open sky and retry');
    expect(order.save).not.toHaveBeenCalled();
  });
});
