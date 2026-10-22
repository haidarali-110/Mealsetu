const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
  vendorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Vendor', 
    required: true 
  },
  // month: {
  //   type: String, // YYYY-MM format
  //   required: true
  // },

  // Now stores week key like "2026-W12" instead of "2026-03"
week: {
  type: String,
  required: false,
  default: null
},
month: {
  type: String,
  default: null
},
  total_orders: {
    type: Number,
    default: 0
  },
  total_earning: {
    type: Number, 
    required: true 
  },
  commission_rate: { 
    type: Number, 
    required: true 
  },
  commission_amount: { 
    type: Number, 
    required: true 
  },
  // ── MONTHLY AUTO-DEDUCTION ────────────────────────────────
  gross_earning: { type: Number, default: 0 },
  total_expenses: { type: Number, default: 0 },
  net_earning: { type: Number, default: 0 },
  auto_deducted: { type: Boolean, default: false },
  auto_deducted_at: { type: Date, default: null },
  deduction_method: { type: String, enum: ['auto', 'manual'], default: 'auto' },
  status: {
    type: String,
    enum: ['pending', 'auto_deducted', 'paid', 'overdue', 'pending_verification'],
    default: 'pending'
  }, 
  periodStart: { type: Date, default: null },
  periodEnd: { type: Date, default: null },
  isFirstCycle: { type: Boolean, default: false },
  financialMonthNumber: { type: Number, default: null }, // 1=April...12=March
  payment_proof_url: {
    type: String
  },
  payment_date: {
    type: Date
  },
  admin_verified_at: {
    type: Date
  },
  due_date: { 
    type: Date 
  },
  notes: {
    type: String
  },
  rejectionReason: {
    type: String,
    default: null
  },
  weekStart: {
    type: Date,
    default: null
  },
  weekEnd: {
    type: Date,
    default: null
  },
  financialYear: {
    type: String,
    default: null
  },
  financialWeekNumber: {
    type: Number,
    default: null
  },

  // ── SETTLEMENT IDENTITY ──────────────────────────────────
  settlementNumber: {
    type:    String,
    default: null
  },

  // ── LOCK STATE ───────────────────────────────────────────
  isLocked: {
    type:    Boolean,
    default: false
  },
  lockedAt: {
    type:    Date,
    default: null
  },
  lockedBy: {
    type:    String,
    default: null
  },

  // ── WALLET TRANSPARENCY ──────────────────────────────────
  // Total wallet credit used by customers in this week's orders.
  // Commission is calculated on (total_earning - total_wallet_deductions).
  total_wallet_deductions: {
    type:    Number,
    default: 0
  },

  // ── PAYMENT METADATA ─────────────────────────────────────
  paidOnTime: {
    type:    Boolean,
    default: null
  },
  paymentReference: {
    type:    String,
    default: null
  },

  // ── TIER SNAPSHOT ────────────────────────────────────────
  tierSnapshot: {
    tierName:    { type: String,  default: null },
    minEarning:  { type: Number,  default: null },
    maxEarning:  { type: Number,  default: null },
    ratePercent: { type: Number,  default: null }
  },

  // ── REMINDER TRACKING ────────────────────────────────────
  reminderCount: {
    type:    Number,
    default: 0
  },
  lastReminderSentAt: {
    type:    Date,
    default: null
  },

  // ── EMAIL TRACKING ───────────────────────────────────────
  emailDelivered: {
    type:    Boolean,
    default: null   // null = not attempted, true = delivered, false = failed
  },
  emailFailedAt: {
    type:    Date,
    default: null
  },

  // ── PAYMENT AMOUNT VERIFICATION ──────────────────────────
  expectedRazorpayAmount: {
    type:    Number,
    default: null   // set when Razorpay order is created; verified on payment
  },

  // ── DISPUTE ──────────────────────────────────────────────
  disputeStatus: {
    type:    String,
    enum:    [null, 'raised', 'under_review', 'resolved'],
    default: null
  },
  disputeNote: {
    type:    String,
    default: null
  },
  disputeRaisedAt: {
    type:    Date,
    default: null
  },
  disputeResolvedAt: {
    type:    Date,
    default: null
  },
  disputeResolvedBy: {
    type:    String,
    default: null
  },
  disputeResolutionNote: {
    type:    String,
    default: null   // admin's explanation when resolving
  },

  // ── AUDIT LOG ────────────────────────────────────────────
  auditLog: [{
    action:      { type: String },
    performedBy: { type: String },
    at:          { type: Date,   default: Date.now },
    note:        { type: String },
    valueBefore: { type: mongoose.Schema.Types.Mixed },
    valueAfter:  { type: mongoose.Schema.Types.Mixed }
  }]
}, {
  timestamps: true
});

commissionSchema.index({ vendorId: 1, month: 1 });
commissionSchema.index({ vendorId: 1, week: 1 });
commissionSchema.index({ status: 1, due_date: 1 });
commissionSchema.index({ weekStart: 1 });
commissionSchema.index({ vendorId: 1, weekStart: 1 });
commissionSchema.index({ vendorId: 1, status: 1 });
commissionSchema.index({ isLocked: 1, weekEnd: 1 });

module.exports = mongoose.model('Commission', commissionSchema);

