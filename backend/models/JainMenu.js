const mongoose = require('mongoose');

const jainMenuSchema = new mongoose.Schema({
  vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  day: { type: String, required: true, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
  main_course: { type: String, default: null },
  alt_sabji: { type: String, default: null },
  alt_sabji2: { type: String, default: null },
  sides: { type: String, default: null },
  special_addons: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('JainMenu', jainMenuSchema);

