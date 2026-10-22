const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  
  // Report Cycle
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  
  // Stats
  totalOrders: { type: Number, default: 0 },
  totalEarning: { type: Number, required: true },
  
  // Status
  status: { 
    type: String, 
    enum: ['Settled', 'Pending', 'Processing'], 
    default: 'Pending' 
  }
});

module.exports = mongoose.model('Payout', payoutSchema);