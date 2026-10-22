jest.mock('../../models/Menu', () => ({}));
jest.mock('../../models/Order', () => ({
  create: jest.fn(),
  findOne: jest.fn()
}));
jest.mock('../../models/Review', () => ({}));
jest.mock('../../models/Vendor', () => ({
  findById: jest.fn()
}));
jest.mock('../../models/User', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn()
}));
jest.mock('../../models/Subscription', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn()
}));
jest.mock('../../models/Complaint', () => ({}));
jest.mock('../../models/VendorPricing', () => ({}));
jest.mock('../../models/JainMenu', () => ({}));
jest.mock('../../utils/emailUtils', () => ({
  sendEmail: jest.fn().mockRejectedValue(new Error('email unavailable'))
}));
jest.mock('../../utils/orderTransaction', () => jest.fn().mockResolvedValue({}));
jest.mock('../loyaltyController', () => ({
  awardSubscriptionPoints: jest.fn().mockResolvedValue(undefined),
  awardReviewPoints: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../utils/fcmService', () => ({
  notifyOrderConfirmed: jest.fn(() => { throw new Error('FCM unavailable'); }),
  notifyVendorNewOrder: jest.fn(() => { throw new Error('FCM unavailable'); }),
  notifyVendorPayment: jest.fn(() => { throw new Error('FCM unavailable'); })
}));
jest.mock('../../utils/razorpayUtils', () => ({
  orders: { fetch: jest.fn().mockRejectedValue(new Error('Razorpay unavailable')) }
}));

const crypto = require('crypto');
const Order = require('../../models/Order');
const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const Subscription = require('../../models/Subscription');
const { placeOrder, verifyUserPayment } = require('../userController');

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

const makeRequest = (body) => ({
  body,
  user: { _id: 'customer-1' },
  app: {
    get() {
      return {
        to() {
          return {
            emit() {
              throw new Error('Socket.IO unavailable');
            }
          };
        }
      };
    }
  }
});

describe('order success and payment verification reliability', () => {
  let user;
  let vendor;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    user = {
      _id: 'customer-1',
      name: 'Customer',
      email: 'customer@example.test',
      phone: '1234567890',
      save: jest.fn().mockResolvedValue(undefined)
    };
    vendor = {
      _id: 'vendor-1',
      ownerId: 'vendor-owner-1',
      kitchenName: 'Kitchen'
    };
    User.findById.mockResolvedValue(user);
    User.findByIdAndUpdate.mockResolvedValue(user);
    Vendor.findById.mockResolvedValue(vendor);
    Subscription.create.mockResolvedValue({});
    Subscription.findOne.mockResolvedValue(null);
    Subscription.findOneAndUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test.each(['Cash', 'Online'])('placeOrder persists %s orders despite socket, email and FCM failures', async (paymentMethod) => {
    const order = { _id: `order-${paymentMethod}`, amount: 100 };
    Order.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null)
    });
    Order.create.mockResolvedValue(order);
    const response = makeResponse();

    await placeOrder(makeRequest({
      vendorId: 'vendor-1',
      amount: 100,
      plan: 'ONEDAY',
      paymentMethod
    }), response);

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);
    expect(Order.create).toHaveBeenCalledWith(expect.objectContaining({
      paymentMethod,
      paymentStatus: paymentMethod === 'Cash' ? 'Pending' : 'Paid'
    }));
    expect(Subscription.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  test('simultaneous payment verification retries return the one persisted order despite side-effect failures', async () => {
    const paymentId = 'pay_same_payment';
    const razorpayOrderId = 'order_razorpay';
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'test-secret')
      .update(`${razorpayOrderId}|${paymentId}`)
      .digest('hex');
    process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'test-secret';

    let persistedOrder = null;
    let persistedSubscription = null;
    Order.findOne.mockImplementation((filter) => {
      if (filter.transactionId) return Promise.resolve(persistedOrder);
      if (filter.status === 'active') return Promise.resolve(null);
      return { sort: jest.fn().mockResolvedValue(null) };
    });
    Order.create.mockImplementation(async (fields) => {
      if (persistedOrder) {
        const duplicate = new Error('duplicate payment ID');
        duplicate.code = 11000;
        throw duplicate;
      }
      persistedOrder = {
        ...fields,
        _id: 'persisted-order',
        save: jest.fn().mockResolvedValue(undefined)
      };
      return persistedOrder;
    });
    Subscription.findOneAndUpdate.mockImplementation(async (_filter, update) => {
      if (!persistedSubscription) persistedSubscription = update.$setOnInsert;
      return persistedSubscription;
    });

    const body = {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      vendorId: 'vendor-1',
      plan: 'WEEKLY',
      amount: 100
    };
    const firstResponse = makeResponse();
    const secondResponse = makeResponse();
    await Promise.all([
      verifyUserPayment(makeRequest(body), firstResponse),
      verifyUserPayment(makeRequest(body), secondResponse)
    ]);

    expect(Order.create).toHaveBeenCalledTimes(2);
    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(firstResponse.body.success).toBe(true);
    expect(secondResponse.body.success).toBe(true);
    expect(firstResponse.body.order).toBe(persistedOrder);
    expect(secondResponse.body.order).toBe(persistedOrder);
    expect(Subscription.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(persistedSubscription.sourceOrderId).toBe(persistedOrder._id);
  });

  test('rejects an invalid Razorpay signature with a clear client error', async () => {
    const response = makeResponse();
    await verifyUserPayment(makeRequest({
      razorpay_order_id: 'order_invalid',
      razorpay_payment_id: 'pay_invalid',
      razorpay_signature: 'invalid',
      vendorId: 'vendor-1',
      amount: 100
    }), response);

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toMatch(/Invalid signature/);
    expect(Order.create).not.toHaveBeenCalled();
  });
});
