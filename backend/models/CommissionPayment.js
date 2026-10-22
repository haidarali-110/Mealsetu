const mongoose = require('mongoose');

const commissionPaymentSchema = new mongoose.Schema({
  vendorEarningId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Commission', 
    required: true 
  },
  vendorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Vendor', 
    required: true 
  },
  amountPaid: { 
    type: Number, 
    required: true 
  },
  paymentMethod: { 
    type: String, 
    enum: ['upi', 'bank_transfer', 'cash'],
    required: true
  },
  utrNumber: { 
    type: String 
  },
  proofUrl: { 
    type: String 
  },
  paidAt: { 
    type: Date, 
    default: Date.now 
  },
  verifiedByAdmin: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  verifiedAt: { 
    type: Date 
  },
  notes: { 
    type: String 
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected'],
    default: 'pending'
  },
  attemptCount: {
    type:    Number,
    default: 1
  },
  failureReason: {
    type:    String,
    default: null
  },
  idempotencyKey: {
    type:    String,
    default: null,
    index:   true
  },
  razorpayOrderId: {
    type:    String,
    default: null
  },
  razorpayPaymentId: {
    type:    String,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('CommissionPayment', commissionPaymentSchema);

