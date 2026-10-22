const cron = require('node-cron');
const User = require('../models/User');
const Order = require('../models/Order');

// Process inactive users (daily cron handler)
const processInactiveUsers = async () => {
  console.log('🔄 Running cron job: Auto-marking inactive users...');
  
  try {
    const users = await User.find({}).lean();
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    let updatedCount = 0;

    for (const user of users) {
      const latestOrder = await Order.findOne({ userId: user._id })
        .sort({ createdAt: -1 })
        .select('createdAt')
        .lean();
      
      const lastActive = latestOrder?.createdAt || user.joinDate || now;
      const daysSinceActive = Math.floor((now - lastActive) / dayMs);
      
      const shouldBeActive = daysSinceActive <= 50;
      if (user.isActive !== shouldBeActive) {
        await User.findByIdAndUpdate(user._id, {
          isActive: shouldBeActive,
          lastActiveDate: lastActive
        });
        updatedCount++;
      }
    }

    console.log(`✅ Cron completed: Updated activity status for ${updatedCount} users`);
  } catch (error) {
    console.error('❌ User activity cron error:', error);
  }
};

// Schedule cron job for midnight daily
const startUserActivityCron = () => {
  console.log('📅 User activity cron scheduled: Daily at midnight');
  cron.schedule('0 0 * * *', processInactiveUsers);
};

module.exports = {
  startUserActivityCron,
  processInactiveUsers
};
