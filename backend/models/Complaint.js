const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  message: { type: String, required: true },
  status: { type: String, enum: ['Open', 'Resolved', 'Rejected'], default: 'Open' },
  response: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Complaint', complaintSchema);
