const mongoose = require('mongoose');

const platformSettingSchema = new mongoose.Schema({
  commissionRate: { type: Number, default: 10 },
  adminUpiId:     { type: String, default: '' },
  updatedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt:      { type: Date, default: Date.now }
});

module.exports = mongoose.model('PlatformSetting', platformSettingSchema);
