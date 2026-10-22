const mongoose = require('mongoose');

const batchOrderSchema = new mongoose.Schema({
  orderId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customerName: { type: String },
  address: {
    flatHouseNo: { type: String },
    street:      { type: String },
    area:        { type: String },
    landmark:    { type: String },
    city:        { type: String },
    pincode:     { type: String },
    latitude:    { type: Number },
    longitude:   { type: Number },
    fullAddress: { type: String }
  },
  phone:                { type: String },
  deliveryPreference:   { type: String, enum: ['hand_to_me', 'leave_at_door', 'leave_at_security', 'leave_at_reception'], default: 'hand_to_me' },
  status:               { type: String, enum: ['pending', 'assigned', 'preparing', 'picked_up', 'on_the_way', 'delivered', 'failed', 'retry_pending'], default: 'pending' },
  sequence:             { type: Number, default: 0 },
  estimatedArrivalTime: { type: Date },
  pickedUpAt:           { type: Date },
  deliveredAt:          { type: Date },
  failReason:           { type: String },
  retryCount:           { type: Number, default: 0 },
  retryHistory:         [{ reason: { type: String }, attemptedAt: { type: Date } }],
  deliveryProof: {
    photoUrl:   { type: String },
    gpsLat:     { type: Number },
    gpsLng:     { type: Number },
    capturedAt: { type: Date }
  }
}, { _id: false });

const routePointSchema = new mongoose.Schema({
  latitude:  { type: Number },
  longitude: { type: Number },
  sequence:  { type: Number },
  orderId:   { type: mongoose.Schema.Types.ObjectId }
}, { _id: false });

const deliveryBatchSchema = new mongoose.Schema({
  vendorId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Vendor',
    required: true
  },
  riderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'DeliveryPartner'
  },
  batchDate: { type: Date, required: true },
  mealSlot: {
    type:     String,
    enum:     ['lunch', 'dinner'],
    required: true
  },
  area:    { type: String },
  pincode: { type: String },

  orders:         [batchOrderSchema],
  optimizedRoute: [routePointSchema],

  batchStatus: {
    type:    String,
    enum:    ['pending', 'assigned', 'in_progress', 'completed', 'partial'],
    default: 'pending'
  },
  scheduledPickupTime: { type: Date },
  deliveryDeadline:    { type: Date },
  startedAt:           { type: Date },
  completedAt:         { type: Date },

  gpsTrail: [{
    lat: { type: Number },
    lng: { type: Number },
    ts:  { type: Date, default: Date.now }
  }],

  tiffinCollection: {
    riderCount:  { type: Number, default: null },
    vendorCount: { type: Number, default: null },
    status:      { type: String, enum: ['pending', 'collected', 'returned_to_vendor'], default: 'pending' },
    collectedAt: { type: Date },
    returnedAt:  { type: Date },
    discrepancy: { type: Boolean, default: false }
  },

  // Force-close audit trail (set by admin when closing a stuck batch)
  forcedClose:       { type: Boolean, default: false },
  forcedCloseReason: { type: String },
  forcedCloseNote:   { type: String },
  forcedCloseAt:     { type: Date },
  forcedCloseBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

deliveryBatchSchema.index({ vendorId: 1, batchDate: -1 });
deliveryBatchSchema.index({ riderId: 1, batchDate: -1 });
deliveryBatchSchema.index({ vendorId: 1, batchDate: 1, mealSlot: 1 });

module.exports = mongoose.model('DeliveryBatch', deliveryBatchSchema);
