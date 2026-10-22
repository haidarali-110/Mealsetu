const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  orderId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Order'  },

  // ── Customer snapshot (cached for display) ──────────────────────────────
  customerName: { type: String, default: '' },

  // ── Core review content ─────────────────────────────────────────────────
  rating:  { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '' },
  images:  [{ type: String }],            // optional photo URLs

  // ── Purchase verification ───────────────────────────────────────────────
  isVerifiedPurchase: { type: Boolean, default: false },
  planType:           { type: String,  default: '' },   // Weekly / Monthly / Trial / Tiffin
  mealDate:           { type: Date },                   // approximate meal date

  // ── Helpfulness ────────────────────────────────────────────────────────
  helpfulCount: { type: Number, default: 0 },

  // ── Edit tracking ──────────────────────────────────────────────────────
  isEdited: { type: Boolean, default: false },
  editedAt: { type: Date },

  // ── Moderation (admin) ─────────────────────────────────────────────────
  isHidden:   { type: Boolean, default: false },
  isFlagged:  { type: Boolean, default: false },
  flagReason: { type: String,  default: '' },
  adminNote:  { type: String,  default: '' },
}, { timestamps: true });

// ── Indexes ─────────────────────────────────────────────────────────────────
reviewSchema.index({ vendorId: 1, createdAt: -1 });
reviewSchema.index({ vendorId: 1, rating: -1 });
reviewSchema.index({ vendorId: 1, isHidden: 1 });
reviewSchema.index({ userId: 1, vendorId: 1 }, { unique: true }); // one review per user per vendor

module.exports = mongoose.model('Review', reviewSchema);
