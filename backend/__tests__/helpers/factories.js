const mongoose = require('mongoose');
const Vendor   = require('../../models/Vendor');
const Order    = require('../../models/Order');
const User     = require('../../models/User');

const createUser = async (overrides = {}) => {
  return await User.create({
    _id:      new mongoose.Types.ObjectId(),
    name:     'Test User',
    email:    `test_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
    phone:    '9999999999',
    password: 'hashedpassword',
    role:     'user',
    ...overrides
  });
};

const createVendor = async (overrides = {}) => {
  // Vendor.ownerId is required — auto-create an owner user if not provided
  const owner = await createUser({ name: 'Vendor Owner', role: 'vendor' });
  return await Vendor.create({
    _id:            new mongoose.Types.ObjectId(),
    ownerId:        owner._id,
    kitchenName:    'Test Kitchen',
    address:        '123 Test Street',
    pincode:        '380015',
    isOpen:         true,
    approvalStatus: 'Approved',
    isApproved:     true,
    status:         'approved',
    pricing: [
      { planType: 'weekly',  price: 549,  active: true },
      { planType: 'monthly', price: 2050, active: true }
    ],
    currentClosure: {
      isActive:      false,
      startDate:     null,
      endDate:       null,
      reason:        null,
      closureType:   null,
      closedAt:      null,
      missedMeals:   null,
      extensionDays: null
    },
    ...overrides
  });
};

/**
 * Active order ending N days from now
 */
const createActiveOrder = async (vendorId, userId, endsInDays = 7, overrides = {}) => {
  const now     = new Date();
  const endDate = new Date(now.getTime() + endsInDays * 24 * 60 * 60 * 1000);

  return await Order.create({
    _id:                new mongoose.Types.ObjectId(),
    vendorId,
    userId,
    status:             'active',
    planType:           'Weekly',       // enum: ['Weekly','Monthly','Trial','Tiffin']
    startDate:          now,
    endDate,
    scheduledStartDate: now,
    scheduledEndDate:   endDate,
    amount:             549,
    paymentStatus:      'Paid',         // enum: ['Paid','Pending','Failed']
    paymentMethod:      'UPI',
    ...overrides
  });
};

/**
 * Pending order starting N days from now, lasting 7 days
 */
const createPendingOrder = async (vendorId, userId, startsInDays = 8, overrides = {}) => {
  const startDate = new Date(Date.now() + startsInDays         * 24 * 60 * 60 * 1000);
  const endDate   = new Date(Date.now() + (startsInDays + 7)   * 24 * 60 * 60 * 1000);

  return await Order.create({
    _id:                new mongoose.Types.ObjectId(),
    vendorId,
    userId,
    status:             'pending',
    planType:           'Weekly',
    startDate,
    endDate,
    scheduledStartDate: startDate,
    scheduledEndDate:   endDate,
    amount:             549,
    paymentStatus:      'Paid',
    paymentMethod:      'UPI',
    ...overrides
  });
};

module.exports = { createVendor, createUser, createActiveOrder, createPendingOrder };
