'use strict';

const Transaction = require('../models/Transaction');

const recordOrderTransaction = async (order, status, amount = order.amount) => {
  const filter = { orderId: order._id };
  const update = {
    $set: {
      userId: order.userId?._id || order.userId,
      vendorId: order.vendorId,
      amount,
      paymentMethod: order.paymentMethod,
      status
    },
    $setOnInsert: { orderId: order._id }
  };
  try {
    return await Transaction.findOneAndUpdate(
      filter,
      update,
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
    return Transaction.findOneAndUpdate(filter, update, { new: true, runValidators: true });
  }
};

module.exports = recordOrderTransaction;
