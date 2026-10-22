const mongoose = require('mongoose');

const commissionSettingSchema = new mongoose.Schema({
  tierName: {
    type: String,
    required: true,
    trim: true
  },
  minEarning: {
    type: Number,
    required: true,
    default: 0
  },
  maxEarning: {
    type: Number,
    default: null
  },
  ratePercent: {
    type: Number,
    required: true
  },
  isActive: {
    type:    Boolean,
    default: true
  },
  effectiveFrom: {
    type:    Date,
    default: null
  },
  createdBy: {
    type:    String,
    default: null
  },
  updatedBy: {
    type:    String,
    default: null
  },
  changeHistory: [{
    changedAt:  { type: Date },
    changedBy:  { type: String },
    oldRate:    { type: Number },
    newRate:    { type: Number },
    note:       { type: String }
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('CommissionSetting', commissionSettingSchema);
