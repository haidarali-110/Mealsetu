
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
userId: { 
  type: mongoose.Schema.Types.ObjectId, 
  ref: 'User', 
  required: [function() { return this.source !== 'manual'; }, 'userId is required for app orders']
},
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  
  // Order Details 
  customerName: { type: String },
  mealPreference: { type: String, enum: ['Regular', 'Jain'] },
  deliverySlot: { type: String, enum: ['Lunch', 'Dinner'] },
  // Which meals the customer gets on the FIRST day of their plan:
  //   'both'   — bought before lunch cutoff  → gets lunch + dinner today
  //   'dinner' — bought between cutoffs      → gets dinner only today
  //   'none'   — bought after dinner cutoff  → starts tomorrow
  firstDayMealSlot: { type: String, enum: ['both', 'dinner', 'none'], default: 'both' },
  // Which meals the customer gets on the LAST day of their plan:
  //   'both'  — normal end day → gets lunch + dinner
  //   'lunch' — compensating a missed lunch from day 1 → gets lunch only
  lastDayMealSlot: { type: String, enum: ['both', 'lunch'], default: 'both' },
  orderDate: { type: Date, default: Date.now },
  
  // Subscription Plan Type (Weekly, Monthly, Trial)
  planType: { type: String, enum: ['Weekly', 'Monthly', 'Trial', 'Tiffin'], default: 'Tiffin' },

  // Trial Order - Start and End dates for trial period
  startDate: { type: Date },
  endDate: { type: Date },

  // Payment & Status
  amount: { type: Number, required: true },
  paymentStatus: { type: String, enum: ['Paid', 'Pending', 'Failed'], default: 'Pending' },
  paymentMethod: { type: String, enum: ['Cash', 'UPI', 'Free'], default: 'Cash' },
  cashPaymentConfirmedAt: { type: Date, default: null },
  cashPaymentConfirmedBy: { type: mongoose.Schema.Types.Mixed, default: null },
  cashPaymentConfirmedByType: { type: String, enum: ['Vendor', 'DeliveryPartner', 'Admin'], default: null },
  cashCollection: {
    collected: { type: Boolean, default: false },
    amount: { type: Number, default: 0 },
    expectedAmount: { type: Number, default: 0 },
    difference: { type: Number, default: 0 },
    amountMismatch: { type: Boolean, default: false },
    collectedAt: { type: Date, default: null },
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryPartner', default: null },
    riderName: { type: String, default: null }
  },
  orderStatus: {
    type: String, 
    enum: ['Preparing', 'Delivered', 'Cancelled', 'In Kitchen', 'Out for Delivery'], 
    default: 'Preparing' 
  },
  transactionId: { type: String },

  // Offer-related fields
  isOfferOrder: { type: Boolean, default: false },
  offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer' },
  originalPrice: { type: Number },
  discountPercentage: { type: Number },
  discountedPrice: { type: Number },
  scheduledActivationDate: { type: Date },
  offerStatus: {
    type: String,
    enum: ['active', 'pending', 'on-hold', 'cancelled', 'expired', 'completed', 'trial'],
    default: null
  },

  // For subscription extension - scheduled start/end dates for pending orders
  scheduledStartDate: { type: Date },
  scheduledEndDate: { type: Date },

  // Order status: pending, active, expired
  status: {
    type: String,
    enum: ['pending', 'active', 'on-hold', 'expired', 'cancelled', 'completed', 'trial'],
    default: 'active'
  },

  // Wallet deduction applied at checkout (vendor-locked)
  walletDeduction: { type: Number, default: 0 },

  // Manual/Offline Customer fields
  source: { type: String, enum: ['app', 'manual'], default: 'app' },
  manualCustomerName: { type: String, default: null },
  manualCustomerPhone: { type: String, default: null },
  manualCustomerAddress: {
    flatHouseNo: { type: String },
    street:      { type: String },
    area:        { type: String },
    landmark:    { type: String },
    city:        { type: String },
    pincode:     { type: String },
    latitude:    { type: Number },
    longitude:   { type: Number },
    fullAddress: { type: String },
    deliveryPreference: { type: String, default: 'hand_to_me' },
  },
  manualCustomerPincode: { type: String, default: null },
  isManualOrder: { type: Boolean, default: false },

  // ── Delivery fields ───────────────────────────────────────────────────────
  deliveryPartnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'DeliveryPartner',
    default: null
  },
  // New batch-based delivery fields
  deliveryRiderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'DeliveryPartner',
    default: null
  },
  deliveryBatchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'DeliveryBatch',
    default: null
  },
  mealSlot: {
    type: String,
    enum: ['lunch', 'dinner'],
    default: null
  },
  deliveryStatus: {
    type: String,
    enum: ['pending', 'assigned', 'preparing', 'picked_up', 'on_the_way', 'delivered', 'failed', 'retry_pending'],
    default: 'pending'
  },
  retryCount: { type: Number, default: 0 },
  deliveryLocation: {
    latitude:  { type: Number },
    longitude: { type: Number },
    updatedAt: { type: Date }
  },
  deliveredAt:           { type: Date, default: null },
  pickedUpAt:            { type: Date, default: null },
  estimatedDeliveryTime: { type: Date, default: null },

  deliveryProof: {
    photoUrl:   { type: String },
    gpsLat:     { type: Number },
    gpsLng:     { type: Number },
    capturedAt: { type: Date }
  },

  reportedNotReceived: { type: Boolean, default: false },
  reportedAt:          { type: Date,    default: null  },
  isFlagged:           { type: Boolean, default: false },
  flagReason:          { type: String,  default: null  },
  flaggedAt:           { type: Date,    default: null  },

  // ── Final failure resolution (vendor decision) ────────────────────────────
  failureResolution: {
    action:     { type: String, enum: ['compensated', 'no_action'] },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }
});

orderSchema.index({ vendorId: 1, createdAt: -1 });
orderSchema.index({ vendorId: 1, status: 1, createdAt: -1 });
orderSchema.index({ userId: 1, status: 1, endDate: 1 });

module.exports = mongoose.model('Order', orderSchema);
