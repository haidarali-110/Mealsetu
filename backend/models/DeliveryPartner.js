const mongoose = require('mongoose');

const salaryPaymentSchema = new mongoose.Schema({
  month:          { type: String },  // "2026-06"
  amount:         { type: Number },
  paymentMethod:  { type: String, enum: ['Cash', 'UPI', 'Razorpay'], default: 'Cash' },
  transactionRef: { type: String, default: '' }, // UPI transaction ID
  paidAt:         { type: Date, default: Date.now },
  paidBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const attendanceSchema = new mongoose.Schema({
  date:       { type: String, required: true }, // "YYYY-MM-DD"
  clockIn:    { type: Date },
  clockOut:   { type: Date },
  hoursWorked:{ type: Number },                 // computed on clock-out
  status:     { type: String, enum: ['present', 'absent', 'half_day'], default: 'present' },
  note:       { type: String }
}, { _id: false });

const deliveryPartnerSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    unique:   true
  },
  vendorId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Vendor',
    required: true
  },
  name:  { type: String },
  phone: { type: String },
  email: { type: String },

  isActive:    { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: true },

  currentLocation: {
    latitude:  { type: Number },
    longitude: { type: Number },
    updatedAt: { type: Date }
  },

  // Salary & payment fields
  monthlySalary:   { type: Number, default: 0 },
  upiId:           { type: String, default: '' }, // rider's UPI ID for salary transfers
  salaryPaidDates: [salaryPaymentSchema],

  // Attendance
  attendance: [attendanceSchema],

  // Service coverage
  serviceArea: {
    areas:    [{ type: String }],
    pincodes: [{ type: String }]
  },

  totalDeliveries:      { type: Number, default: 0 },
  totalDeliveriesToday: { type: Number, default: 0 },
  rating:               { type: Number, default: 5.0 },
  ratingCount:          { type: Number, default: 0 },

  ratingHistory: [{
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    rating:    { type: Number, required: true, min: 1, max: 5 },
    comment:   { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
  }],

  joinedAt: { type: Date, default: Date.now }
}, { timestamps: true });

deliveryPartnerSchema.index({ userId: 1 });
deliveryPartnerSchema.index({ vendorId: 1, isActive: 1 });

module.exports = mongoose.model('DeliveryPartner', deliveryPartnerSchema);
