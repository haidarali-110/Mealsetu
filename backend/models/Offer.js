const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  posterImage: {
    type: String,
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  planDiscounts: [{
    planName: {
      type: String,
      enum: ['One Day', 'Weekly', 'Monthly'],
      required: true
    },
    discountPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  // Array of user IDs who have redeemed this offer
  redeemedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

// Index for querying active offers by date
offerSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('Offer', offerSchema);

