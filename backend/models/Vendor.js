const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // --- Profile Info ---
  kitchenName: { type: String, required: true },
  address: { type: mongoose.Schema.Types.Mixed, required: true },
pincode: { type: String },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  profileImage: { type: String },
  kitchenPoster: { type: String }, // Kitchen Banner/Poster Image
  isOpen: { type: Boolean, default: true },
  
  // --- Compliance & Documents ---
  fssaiNumber: { type: String },
  fssaiLicense: { type: String }, // File URL
  gstDocument: { type: String },  // File URL
  
  // --- Status & Wallet ---
  closureStartDate: { type: Date }, // Tracks when shop was closed
  closureEndDate: { type: Date },   // Optional: when shop is expected to reopen

  plannedClosures: [
    {
      startDate:   { type: Date, required: true },
      endDate:     { type: Date, required: true },
      reason:      { type: String, default: 'Holiday' },
      closureType: { type: String, enum: ['planned', 'emergency'], default: 'planned' },
      notifiedAt:  { type: Date, default: null },
      createdAt:   { type: Date, default: Date.now }
    }
  ],
  currentClosure: {
    isActive:      { type: Boolean, default: false },
    startDate:     { type: Date,    default: null  },
    endDate:       { type: Date,    default: null  },
    reason:        { type: String,  default: null  },
    closureType:   { type: String,  default: null  },
    closedAt:      { type: Date,    default: null  }, // exact close timestamp (emergency: precise; planned: start of day)
    missedMeals:   { type: Number,  default: null  }, // null for emergency until reopen
    extensionDays: { type: Number,  default: null  }  // null for emergency until reopen
  },

  approvalStatus: { 
    type: String, 
    enum: ['Pending', 'Approved', 'Rejected'], 
    default: 'Pending' 
  },
rejectionReason: { type: String, default: null },
  submittedDate: { type: Date, default: Date.now },
  
  walletBalance: { type: Number, default: 0 },
  
  // --- Weekly Menu Plan (Structured JSON for 7 days) ---
  weeklyPlan: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      Monday: { mainCourse: '', altSabji: '', sides: '', specialAddOns: '' },
      Tuesday: { mainCourse: '', altSabji: '', sides: '', specialAddOns: '' },
      Wednesday: { mainCourse: '', altSabji: '', sides: '', specialAddOns: '' },
      Thursday: { mainCourse: '', altSabji: '', sides: '', specialAddOns: '' },
      Friday: { mainCourse: '', altSabji: '', sides: '', specialAddOns: '' },
      Saturday: { mainCourse: '', altSabji: '', sides: '', specialAddOns: '' },
      Sunday: { mainCourse: '', altSabji: '', sides: '', specialAddOns: '' }
    }
  },
  
  // Optional display fields
  menuPrice: { type: Number, default: 80 },
  upiId: { type: String, default: null },
  rating:      { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  workingDays: { type: String, default: 'Mon - Sat' },
  timings: { type: String, default: '11:00 AM - 09:00 PM' },

  // --- Loyalty / Wallet Discount Settings ---
  loyaltyDiscountsEnabled: { type: Boolean, default: true },  // vendor can opt-out of wallet deductions
  walletCapPercent: { type: Number, default: 20 },            // max wallet discount as % of order (default 20%)

  // --- Trial Settings ---
  trialEnabled: { type: Boolean, default: false },
  trialFee: { type: Number, default: 0 },

  // --- Delivery Settings ---
  deliveryEnabled: { type: Boolean, default: false },
  deliverySettings: {
    autoGroupByArea:      { type: Boolean, default: true },
    lunchDeliveryTime:    { type: String,  default: '12:00' },
    dinnerDeliveryTime:   { type: String,  default: '20:00' },
    maxDeliveriesPerBatch: { type: Number, default: 20 },
    deliveryRadius:       { type: Number, default: 10 }  // km
  },
  monthlyDeliveryExpenses: { type: Number, default: 0 },

  // --- Jain Menu & Pricing ---
  offersJainMenu: { type: Boolean, default: false },
  jainWeeklyPlan: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      Monday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
      Tuesday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
      Wednesday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
      Thursday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
      Friday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
      Saturday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
      Sunday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' }
    }
  },
  pricing: [{
    planType: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
    price: { type: Number, required: true, min: 1, max: 99999 },
    active: { type: Boolean, default: false }
  }],

  // --- OTP Verification Fields (for registration verification) ---
  resetOTP: { type: String },
  resetOTPExpire: { type: Date },
  otpAttempts: { type: Number, default: 0 },

  isOTPVerified: { type: Boolean, default: false },

  // --- New Vendor Request Fields ---
  isApproved: { type: Boolean, default: false },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  resubmittedAt: { type: Date, default: null },
  fssaiDocument: { type: String },
  gstNumber: { type: String },
  ownerName: { type: String },
  phone: { type: String },

  // --- Expense Budgets (category → monthly budget amount) ---
  expenseBudgets: {
    type:    Map,
    of:      Number,
    default: {}
  }
}, { timestamps: true }
);

vendorSchema.index({ pincode: 1, isApproved: 1 });
vendorSchema.index({ status: 1, isApproved: 1 });

module.exports = mongoose.model('Vendor', vendorSchema);

