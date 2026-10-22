const mongoose = require('mongoose');

const pendingUserSchema = new mongoose.Schema({
  // --- Auth & Basic Info (same as User model) ---
  name: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  phone: { type: String },
  profilePic: { type: String },
  role: { 
    type: String, 
    enum: ['user', 'vendor', 'admin'], 
    default: 'user',
    required: true
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
    fullAddress: { type: String },
    deliveryPreference: { type: String }
  },
  pincode: { type: String },
  
  // --- Vendor Specific ---
  kitchenName: { type: String },
  kitchenAddress: { type: String },
  kitchenStructuredAddress: { type: mongoose.Schema.Types.Mixed },
  fssaiLicense: { type: String },
  gstDocument: { type: String },
  kitchenPoster: { type: String },

  // --- OTP Verification Fields ---
  otp: { type: String, required: true },
  otpExpiresAt: { type: Date, required: true },
  otpAttempts: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },

  // --- Metadata ---
  createdAt: { type: Date, default: Date.now }
});

// TTL Index: Auto-delete documents after otpExpiresAt + 10 minutes (allow some buffer)
// MongoDB will automatically remove expired documents
pendingUserSchema.index({ otpExpiresAt: 1 }, { expireAfterSeconds: 600 }); // 600 seconds = 10 minutes

// Compound unique index: email + role (prevent duplicate pending registrations)
pendingUserSchema.index({ email: 1, role: 1 }, { unique: true });

module.exports = mongoose.model('PendingUser', pendingUserSchema);
