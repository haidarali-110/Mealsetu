const mongoose = require('mongoose');
const Order = require('../models/Order');
require('dotenv').config();

const fix = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  // Fix 1: free trials showing Pending
  const r1 = await Order.updateMany(
    { planType: 'Trial', amount: 0, paymentStatus: 'Pending' },
    { $set: { paymentStatus: 'Paid', paymentMethod: 'Free' } }
  );
  console.log(`Fixed paymentStatus: ${r1.modifiedCount} orders`);

  // Fix 2: trial orders with timestamp startDate instead of UTC midnight
  const trialOrders = await Order.find({
    planType: 'Trial',
    startDate: { $exists: true }
  }).select('startDate endDate');

  let fixedDates = 0;
  for (const order of trialOrders) {
    const sd = new Date(order.startDate);
    if (sd.getUTCHours() !== 0 || sd.getUTCMinutes() !== 0) {
      const midnight = new Date(sd);
      midnight.setUTCHours(0, 0, 0, 0);
      const newEnd = new Date(midnight);
      newEnd.setUTCDate(newEnd.getUTCDate() + 2); // 2-day trial
      await Order.updateOne(
        { _id: order._id },
        { $set: { startDate: midnight, endDate: newEnd } }
      );
      fixedDates++;
    }
  }
  console.log(`Fixed startDate: ${fixedDates} trial orders`);

  await mongoose.disconnect();
  console.log('Done.');
};

fix().catch(console.error);
