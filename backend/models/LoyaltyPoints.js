const mongoose = require('mongoose');
const { Schema } = mongoose;

const loyaltyPointsSchema = new Schema(
  {
    userId: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      unique:   true
    },
    points:             { type: Number, default: 0 },
    totalEarned:        { type: Number, default: 0 },
    totalRedeemed:      { type: Number, default: 0 },
    totalSubscriptions: { type: Number, default: 0 },
    hasFirstSubBonus:   { type: Boolean, default: false },

    transactions: [
      {
        type: {
          type: String,
          enum: [
            'earned_subscription',
            'earned_review',
            'earned_referral',
            'earned_milestone',
            'earned_renewal',
            'earned_renewal_bonus',
            'redeemed',
            'earned_first_sub'
          ]
        },
        points:      { type: Number },
        description: { type: String },
        planType:    { type: String },
        orderId:     { type: Schema.Types.ObjectId, ref: 'Order' },
        createdAt:   { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

loyaltyPointsSchema.index({ userId: 1 });
loyaltyPointsSchema.index({ points: -1 }); // for leaderboard sort

module.exports = mongoose.model('LoyaltyPoints', loyaltyPointsSchema);
