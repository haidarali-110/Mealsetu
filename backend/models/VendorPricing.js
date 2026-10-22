const mongoose = require('mongoose');

const vendorPricingSchema = new mongoose.Schema({
  vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  plan_type: { type: String, required: true, enum: ['daily', 'weekly', 'monthly'] },
  price: { type: Number, required: true, min: 1, max: 99999 },
  is_active: { type: Boolean, default: false }
}, { timestamps: true });

vendorPricingSchema.index({ vendor_id: 1, plan_type: 1 }, { unique: true });

module.exports = mongoose.model('VendorPricing', vendorPricingSchema);

