const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // --- Auth & Basic Info ---
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String },
  profilePic: { type: String }, 
  role: {
    type: String,
    enum: ['user', 'vendor', 'admin', 'superadmin', 'delivery'],
    default: 'user'
  },
  
  // --- Customer Specific ---
  address: {
    flatHouseNo: { type: String },
    street:      { type: String },
    area:        { type: String },
    landmark:    { type: String },
    city:        { type: String },
    pincode:     { type: String },
    latitude:    { type: Number },
    longitude:   { type: Number },
    fullAddress:         { type: String },
    deliveryPreference:  {
      type:    String,
      enum:    ['hand_to_me', 'leave_at_door', 'leave_at_security', 'leave_at_reception'],
      default: 'hand_to_me'
    }
  },
  pincode: { type: String }, // top-level kept for backward compat
  
  // --- Admin Specific  ---
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },

  // --- User Management Fields  ---
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  joinDate: { type: Date, default: Date.now },

  // --- Password Reset Fields (Token-based - kept for compatibility) ---
  resetPasswordToken: { type: String },
  resetPasswordExpire: { type: Date },

  // --- OTP Verification Fields (for password reset) ---
  resetOTP: { type: String },
  resetOTPExpire: { type: Date },
  otpAttempts: { type: Number, default: 0 },
  isOTPVerified: { type: Boolean, default: false },

  // --- Email Verification for Registration ---
  isVerified: { type: Boolean, default: false },

  // --- Subscription snapshot (for quick dashboard reads) ---
  expiryDate: { type: Date, default: null },

  // --- Trial History ---
  trialHistory: [{
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    trialTakenAt: { type: Date, default: Date.now }
  }],
  lastActiveDate: { type: Date, default: null },
  isManualCustomer: { type: Boolean, default: false },

  // ── Loyalty wallet balance (₹ credited from point redemptions) ────────────
  wallet: { type: Number, default: 0 },

  // ── Firebase Cloud Messaging ──────────────────────────────────────────────
  fcmToken:          { type: String, default: null },
  fcmTokenUpdatedAt: { type: Date }
});

userSchema.index({ email: 1 });
userSchema.index({ role: 1, isActive: 1 });

userSchema.virtual('addressString').get(function () {
  const addr = this.address;
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  return addr.fullAddress ||
    [addr.flatHouseNo, addr.street, addr.area, addr.city, addr.pincode]
      .filter(Boolean).join(', ');
});

module.exports = mongoose.model('User', userSchema);
