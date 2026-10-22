const User = require('../models/User');
const Vendor = require('../models/Vendor');
const PendingUser = require('../models/PendingUser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendEmail } = require('../utils/emailUtils');
const { geocodeAddress } = require('../utils/geocode');
const disposableDomains = require('disposable-email-domains');

// Extra blocked domains as backup for very new domains
const EXTRA_BLOCKED_DOMAINS = [
  "medevsa.com", "yopmail.com", "mailinator.com", "guerrillamail.com", "10minutemail.com",
  "tempmail.com", "throwaway.email", "fakeinbox.com", "trashmail.com", "maildrop.cc",
  "sharklasers.com", "grr.la", "spam4.me", "trashmail.at", "trashmail.io", "trashmail.me",
  "trashmail.net", "discard.email", "tempr.email", "emlpro.com", "emltmp.com",
  "discardmail.com", "trbvm.com", "getairmail.com", "filzmail.com", "dayrep.com",
  "rhyta.com", "armyspy.com", "cuvox.de", "fleckens.hu", "gustr.com", "jourrapide.com",
  "spamgourmet.com", "superrito.com", "teleworm.us", "einrot.com", "inoutmail.de",
  "inoutmail.eu", "inoutmail.info", "inoutmail.net", "mail.mezimages.net", "mail2rss.org",
  "mega.zik.dj", "moncourrier.fr.nf", "monemail.fr.nf", "monmail.fr.nf"
];

// Generate JWT
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Helper to generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper to mask email for display
const maskEmail = (email) => {
  const [username, domain] = email.split('@');
  if (username.length <= 3) {
    return `${username}***@${domain}`;
  }
  return `${username.slice(0, 3)}***@${domain}`;
};

// @desc    Register new user
// @route   POST /api/auth/register
const registerUser = async (req, res) => {
  try {
    const {
      name, email, password, role,
      phone, pincode, address,        // User — legacy compat (plain string)
      // User — new structured address fields
      flatHouseNo, street, area, landmark, city, latitude, longitude,
      kitchenName, kitchenAddress,    // Vendor — legacy full-string compat
      // Vendor — new structured kitchen address fields
      kitchenShopNo, kitchenStreet, kitchenArea, kitchenLandmark, kitchenCity, kitchenPincode,
      adminKey                        // Admin specific
    } = req.body;

    // Build structured address object for user role
    let addressObj;
    if (role === 'user') {
      if (flatHouseNo || street || area || city) {
        // New structured format from app/website
        const fullAddress = [flatHouseNo, street, area, landmark, city, pincode]
          .filter(Boolean).join(', ');
        addressObj = {
          flatHouseNo: flatHouseNo || '',
          street:      street      || '',
          area:        area        || '',
          landmark:    landmark    || '',
          city:        city        || '',
          pincode:     pincode     || '',
          latitude:    latitude  != null ? parseFloat(latitude)  : null,
          longitude:   longitude != null ? parseFloat(longitude) : null,
          fullAddress
        };
      } else if (address) {
        // Legacy plain-string address — wrap for backward compat
        addressObj = { fullAddress: address, area: '', city: '', pincode: pincode || '' };
      }
    }
    
    // Check for blocked temporary email domains (two-layer check)
    const emailLower = email.toLowerCase();
    const emailDomain = emailLower.split('@')[1];
    
    if (!emailDomain) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }
    
    const isDisposable = disposableDomains.includes(emailDomain) || EXTRA_BLOCKED_DOMAINS.includes(emailDomain);
    
    if (isDisposable) {
      return res.status(400).json({ 
        message: 'This email domain is not allowed. Temporary and disposable email addresses cannot be used to register. Please use your real Gmail, Yahoo, Outlook, or other permanent email address.' 
      });
    }

    // 1. Check if email already exists in MAIN users collection (verified users)
    // If user exists here, they are already verified - show "User already exists"
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // 2. Check if email exists in pendingUsers collection (unverified)
    // If exists here, we'll UPDATE and resend OTP (don't create duplicate)
    const pendingUserExists = await PendingUser.findOne({ email, role });
    
    // 3. Handle File Uploads (from Multer)
    const normalizePath = (filePath) => {
      if (!filePath) return null;
      let normalized = filePath.replace(/\\/g, '/');
      if (normalized.includes('uploads/')) {
        const parts = normalized.split('uploads/');
        normalized = '/uploads/' + parts[parts.length - 1];
      }
      return normalized;
    };

    const profilePicPath     = req.files?.['profilePic']?.[0]     ? normalizePath(req.files['profilePic'][0].path)     : null;
    const kitchenPosterPath  = req.files?.['kitchenPoster']?.[0]  ? normalizePath(req.files['kitchenPoster'][0].path)  : null;
    const fssaiPath          = req.files?.['fssaiDoc']?.[0]       ? normalizePath(req.files['fssaiDoc'][0].path)       : null;
    const gstPath            = req.files?.['gstDoc']?.[0]         ? normalizePath(req.files['gstDoc'][0].path)         : null;

    // 4. Hash Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 5. Generate OTP
    const otp = generateOTP();
    const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Prepare pending user data
    const pendingUserData = {
      name,
      email,
      password: hashedPassword,
      phone,
      role,
      profilePic: profilePicPath,
      address: role === 'user' ? addressObj : undefined,
      pincode: role === 'vendor'
        ? (kitchenPincode || pincode || '')
        : (role === 'user' ? pincode : undefined),
      kitchenName: role === 'vendor' ? kitchenName : undefined,
      kitchenAddress: role === 'vendor'
        ? (kitchenAddress || [kitchenShopNo, kitchenStreet, kitchenArea, kitchenLandmark, kitchenCity, kitchenPincode].filter(Boolean).join(', '))
        : undefined,
      kitchenStructuredAddress: role === 'vendor' && (kitchenStreet || kitchenArea || kitchenCity)
        ? {
            shopNo:      kitchenShopNo   || '',
            street:      kitchenStreet   || '',
            area:        kitchenArea     || '',
            landmark:    kitchenLandmark || '',
            city:        kitchenCity     || '',
            pincode:     kitchenPincode  || '',
            fullAddress: [kitchenShopNo, kitchenStreet, kitchenArea, kitchenLandmark, kitchenCity, kitchenPincode].filter(Boolean).join(', '),
            latitude:    latitude  != null ? parseFloat(latitude)  : null,
            longitude:   longitude != null ? parseFloat(longitude) : null,
          }
        : undefined,
      fssaiLicense: role === 'vendor' ? fssaiPath : undefined,
      gstDocument: role === 'vendor' ? gstPath : undefined,
      kitchenPoster: role === 'vendor' ? kitchenPosterPath : undefined,
      otp: hashedOTP,
      otpExpiresAt,
      otpAttempts: 0,
      isVerified: false,
      createdAt: new Date()
    };

    // 6. Create or Update in pendingUsers collection
    let pendingUser;
    if (pendingUserExists) {
      // UPDATE existing pending user - overwrite with new data and new OTP
      pendingUser = await PendingUser.findOneAndUpdate(
        { email, role },
        pendingUserData,
        { new: true }
      );
      console.log('Updated existing pending user, resent OTP to:', email);
    } else {
      // CREATE new pending user
      pendingUser = await PendingUser.create(pendingUserData);
      console.log('Created new pending user:', email);
    }

    // 7. Send OTP email
    const emailSubject = role === 'vendor' 
      ? 'MealSetu - Verify Your Vendor Email' 
      : 'MealSetu - Verify Your Email Address';
    
    const emailMessage = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Verify Your Email Address</h1>
        <p>Welcome to MealSetu${role === 'vendor' ? ' Vendor Portal' : ''}, ${name}!</p>
        <p>Thank you for registering. Please verify your email address to activate your account.</p>
        <div style="background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; margin: 20px 0;">
          ${otp}
        </div>
        <p style="color: #666; font-size: 14px;">This OTP will expire in 10 minutes.</p>
        <hr/>
        <p style="color: #999; font-size: 12px;">If you did not create this account, please ignore this email.</p>
      </div>
    `;

    // Non-blocking — registration is saved even if email fails (user can resend)
    const regEmailSent = await sendEmail(email, emailSubject, emailMessage);
    if (regEmailSent) {
      console.log('Registration OTP sent successfully to:', email);
    } else {
      console.error('⚠️  Registration OTP email failed for:', email, '— user can resend via /register-resend-otp');
    }

    // 8. Return response requiring OTP verification
    return res.status(201).json({
      message: 'Registration successful. A 6 digit OTP has been sent to your email.',
      userId: pendingUser._id.toString(),
      maskedEmail: maskEmail(email),
      requiresOTPVerification: true
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
const loginUser = async (req, res) => {
  const { email, password, role } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.role !== role && !(user.role === 'delivery' && role === 'user')) {
      return res.status(401).json({ message: `This account is registered as ${user.role}. Please login via the ${user.role} portal.` });
    }

    // Check if user is verified (for user and vendor roles)
    // Note: Admin users don't need verification (they're created via backend seeding)
    if ((role === 'user' || role === 'vendor') && !user.isVerified) {
      return res.status(401).json({ message: 'Please verify your email first before logging in.' });
    }

    // Transform profilePic to full URL
    const transformPathToUrl = (path) => {
      if (!path) return null;
      // Remove any double slashes
      let cleanPath = path.replace(/\/+/g, '/');
      // Ensure proper format: /uploads/filename
      if (!cleanPath.startsWith('/')) {
        cleanPath = '/' + cleanPath;
      }
      return `${req.protocol}://${req.get('host')}${cleanPath}`;
    };

    const profilePicUrl = user.profilePic 
      ? transformPathToUrl(user.profilePic)
      : null;

    const token = generateToken(user._id, user.role);
    
    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profilePic: profilePicUrl,
      token: token,
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// @desc    Send OTP for password reset
// @route   POST /api/auth/forgot-password/send-otp
const sendOTP = async (req, res) => {
  const { email } = req.body;

  console.log('Send OTP request for:', email);

  try {
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if user exists
      return res.status(200).json({ message: 'If an account exists, an OTP has been sent' });
    }

    // Generate 6-digit OTP
    const otp = generateOTP();
    
    // Hash OTP before storing (for security)
    const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');

    // Set OTP expiry (5 minutes)
    // Use updateOne so Mongoose never runs full-document validation
    // (a legacy user with gender:"" would fail user.save() with an enum error)
    await User.updateOne(
      { _id: user._id },
      { $set: {
          resetOTP: hashedOTP,
          resetOTPExpire: new Date(Date.now() + 5 * 60 * 1000),
          isOTPVerified: false
        }
      }
    );

    // Send OTP via email
    const message = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Password Reset OTP</h1>
        <p>You requested a password reset for your MealSetu account.</p>
        <div style="background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; margin: 20px 0;">
          ${otp}
        </div>
        <p style="color: #666; font-size: 14px;">This OTP will expire in 5 minutes.</p>
        <hr/>
        <p style="color: #999; font-size: 12px;">If you did not request this, please ignore this email.</p>
      </div>
    `;

    const sent = await sendEmail(user.email, 'MealSetu - Password Reset OTP', message);
    if (!sent) {
      // Email delivery failed — throw so the catch block clears the OTP and returns 500
      throw new Error('Email delivery failed');
    }
    console.log('OTP sent successfully to:', user.email);

    res.status(200).json({ message: 'If an account exists with this email, an OTP has been sent', maskedEmail: maskEmail(user.email) });

  } catch (error) {
    console.error('Send OTP error:', error.message);
    console.error('Send OTP error stack:', error.stack?.split('\n')[0]);

    // Clear OTP fields from DB so a corrupt state is not left behind
    // Use updateOne — avoids the same validation issue that may have caused the error
    try {
      await User.updateOne({ email }, { $unset: { resetOTP: 1, resetOTPExpire: 1 } });
    } catch (cleanupErr) {
      console.error('Error clearing OTP fields:', cleanupErr.message);
    }

    res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
  }
};

// @desc    Verify OTP
// @route   POST /api/auth/forgot-password/verify-otp
const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  console.log('Verify OTP request for:', email);

  try {
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    // Check if OTP is valid
    if (!user.resetOTP || !user.resetOTPExpire) {
      return res.status(400).json({ message: 'OTP expired or not requested. Please request a new OTP.' });
    }

    // Check if OTP is expired
    if (Date.now() > user.resetOTPExpire) {
      await User.updateOne({ _id: user._id }, { $unset: { resetOTP: 1, resetOTPExpire: 1 } });
      return res.status(400).json({ message: 'OTP has expired. Please request a new OTP.' });
    }

    // Hash the provided OTP and compare using timing-safe comparison
    const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');
    const storedOTP = user.resetOTP;

    const hashMatch = storedOTP.length === hashedOTP.length &&
      crypto.timingSafeEqual(Buffer.from(storedOTP), Buffer.from(hashedOTP));

    if (!hashMatch) {
      return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    }

    // Mark as verified — updateOne avoids full-document validation
    await User.updateOne({ _id: user._id }, { $set: { isOTPVerified: true } });

    console.log('OTP verified successfully for:', user.email);

    res.status(200).json({ message: 'OTP verified successfully', verified: true });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Server error during OTP verification' });
  }
};

// @desc    Reset password after OTP verification
// @route   POST /api/auth/forgot-password/reset-password
const resetPasswordWithOTP = async (req, res) => {
  const { email, password } = req.body;

  console.log('Reset password request for:', email);

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#!%^&*()\-_]).{8,}$/.test(password)) {
      return res.status(400).json({ message: 'Password must include uppercase, lowercase, a number, and a special character' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    // Check if OTP was verified
    if (!user.isOTPVerified) {
      return res.status(400).json({ message: 'Please verify OTP first' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update password and clear OTP fields atomically — updateOne skips
    // full-document validation (avoids enum errors on legacy user fields)
    await User.updateOne(
      { _id: user._id },
      {
        $set: { password: hashedPassword, isOTPVerified: false },
        $unset: { resetOTP: 1, resetOTPExpire: 1 }
      }
    );

    console.log('Password reset successful for user:', user.email);

    res.status(200).json({ message: 'Password reset successful. You can now login with your new password.' });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error during password reset' });
  }
};

// Keep old functions for backward compatibility (deprecated)
const forgotPassword = async (req, res) => {
  // Redirect to sendOTP
  return sendOTP(req, res);
};

const resetPassword = async (req, res) => {
  // Redirect to resetPasswordWithOTP
  return resetPasswordWithOTP(req, res);
};

// @desc    Verify OTP for registration
// @route   POST /api/auth/register-verify-otp
const verifyRegisterOTP = async (req, res) => {
  const { userId, otp } = req.body;

  console.log('Verify registration OTP request for userId:', userId);

  try {
    if (!userId || !otp) {
      return res.status(400).json({ message: 'User ID and OTP are required' });
    }

    // 1. Find the pending user in pendingUsers collection
    const pendingUser = await PendingUser.findById(userId);

    if (!pendingUser) {
      return res.status(400).json({ message: 'Invalid request. Registration not found or expired. Please register again.' });
    }

    // 2. Check if OTP is valid
    if (!pendingUser.otp || !pendingUser.otpExpiresAt) {
      return res.status(400).json({ message: 'OTP expired or not requested. Please request a new OTP.' });
    }

    // 3. Check if OTP is expired
    if (Date.now() > pendingUser.otpExpiresAt.getTime()) {
      // Clear OTP and save
      pendingUser.otp = undefined;
      pendingUser.otpExpiresAt = undefined;
      pendingUser.otpAttempts = 0;
      await pendingUser.save();
      return res.status(400).json({ message: 'OTP has expired. Please register again to get a new OTP.' });
    }

    // 4. Check attempts (max 5)
    if (pendingUser.otpAttempts >= 5) {
      return res.status(400).json({ message: 'Too many failed attempts. Please register again to get a new OTP.' });
    }

    // 5. Hash the provided OTP and compare using timing-safe comparison
    const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');
    const storedOTP = pendingUser.otp;

    const otpMatch = storedOTP.length === hashedOTP.length &&
      crypto.timingSafeEqual(Buffer.from(storedOTP), Buffer.from(hashedOTP));

    if (!otpMatch) {
      // Increment attempts
      pendingUser.otpAttempts = (pendingUser.otpAttempts || 0) + 1;
      await pendingUser.save();
      return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    }

    // 6. OTP is valid! Now move data from pendingUsers to main users collection
    const userData = {
      name: pendingUser.name,
      email: pendingUser.email,
      password: pendingUser.password,
      phone: pendingUser.phone,
      profilePic: pendingUser.profilePic,
      role: pendingUser.role,
      address: pendingUser.address,
      pincode: pendingUser.pincode,
      isVerified: true
    };

    const newUser = await User.create(userData);
    console.log('Created verified user from pendingUsers:', newUser.email);

    // 7. If role is vendor, create Vendor document
    if (pendingUser.role === 'vendor') {
      const structured = pendingUser.kitchenStructuredAddress;
      const gpsLat = structured?.latitude;
      const gpsLng = structured?.longitude;

      const vendorData = {
        ownerId: newUser._id,
        kitchenName: pendingUser.kitchenName,
        address: structured || pendingUser.kitchenAddress,
        pincode: pendingUser.pincode,
        fssaiLicense: pendingUser.fssaiLicense,
        gstDocument: pendingUser.gstDocument,
        profileImage: pendingUser.profilePic,
        kitchenPoster: pendingUser.kitchenPoster,
        // Use GPS-detected coords if vendor used Detect Location; they are more accurate
        latitude:  gpsLat || null,
        longitude: gpsLng || null,
      };

      const newVendor = await Vendor.create(vendorData);
      console.log('Created vendor document for:', newVendor.kitchenName);

      // Auto-geocode via Google Maps ONLY when vendor did NOT use GPS detect
      if (!gpsLat && pendingUser.kitchenAddress) {
        try {
          let coords = await geocodeAddress(`${pendingUser.kitchenAddress}, India`);
          if (!coords && pendingUser.pincode) {
            coords = await geocodeAddress(`${pendingUser.pincode}, India`);
          }
          if (coords) {
            newVendor.latitude  = coords.lat;
            newVendor.longitude = coords.lng;
            await newVendor.save();
            console.log(`Geocoded vendor to ${coords.lat}, ${coords.lng}`);
          }
        } catch (geoError) {
          console.log('Vendor geocoding failed:', geoError.message);
        }
      } else if (gpsLat) {
        console.log(`Vendor registered with GPS coords: ${gpsLat}, ${gpsLng}`);
      }
    }

    // 7b. Auto-geocode user delivery address via Google Maps
    if (pendingUser.role === 'user' && pendingUser.address) {
      const addr = pendingUser.address;
      if (!addr.latitude && (addr.city || addr.pincode)) {
        try {
          // Attempt 1: area + city + pincode (most specific)
          const areaQuery = [addr.area, addr.city, addr.pincode].filter(Boolean).join(', ');
          let coords = await geocodeAddress(`${areaQuery}, India`);
          // Attempt 2: pincode only
          if (!coords && addr.pincode) {
            coords = await geocodeAddress(`${addr.pincode}, India`);
          }
          if (coords) {
            await newUser.updateOne({
              $set: { 'address.latitude': coords.lat, 'address.longitude': coords.lng }
            });
            console.log(`Geocoded user address to ${coords.lat}, ${coords.lng}`);
          }
        } catch (geoError) {
          console.log('User geocoding failed:', geoError.message);
        }
      }
    }

    // 8. Delete from pendingUsers collection
    await PendingUser.deleteOne({ _id: userId });
    console.log('Deleted pending user:', pendingUser.email);

    // Transform profilePic to full URL
    const transformPathToUrl = (path) => {
      if (!path) return null;
      let cleanPath = path.replace(/\/+/g, '/');
      if (!cleanPath.startsWith('/')) {
        cleanPath = '/' + cleanPath;
      }
      return `${req.protocol}://${req.get('host')}${cleanPath}`;
    };

    const profilePicUrl = newUser.profilePic ? transformPathToUrl(newUser.profilePic) : null;

    // Generate JWT token
    const token = generateToken(newUser._id, newUser.role);

    console.log('Registration OTP verified successfully for:', newUser.email);

    res.status(200).json({
      message: 'Email verified successfully!',
      token,
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        profilePic: profilePicUrl
      }
    });

  } catch (error) {
    console.error('Verify registration OTP error:', error);
    res.status(500).json({ message: 'Server error during OTP verification' });
  }
};

// @desc    Resend OTP for registration
// @route   POST /api/auth/register-resend-otp
const resendRegisterOTP = async (req, res) => {
  const { userId } = req.body;

  console.log('Resend registration OTP request for userId:', userId);

  try {
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Find in pendingUsers collection (not main users!)
    const pendingUser = await PendingUser.findById(userId);

    if (!pendingUser) {
      return res.status(400).json({ message: 'Invalid request. Registration not found or expired. Please register again.' });
    }

    // Generate new OTP
    const otp = generateOTP();
    const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');

    // Set new OTP expiry (10 minutes) and reset attempts
    pendingUser.otp = hashedOTP;
    pendingUser.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    pendingUser.otpAttempts = 0;
    await pendingUser.save();

    // Send OTP email
    const emailSubject = pendingUser.role === 'vendor' 
      ? 'MealSetu - Verify Your Vendor Email' 
      : 'MealSetu - Verify Your Email Address';
    
    const emailMessage = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Verify Your Email Address</h1>
        <p>Welcome to MealSetu${pendingUser.role === 'vendor' ? ' Vendor Portal' : ''}, ${pendingUser.name}!</p>
        <p>Please verify your email address to activate your account.</p>
        <div style="background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; margin: 20px 0;">
          ${otp}
        </div>
        <p style="color: #666; font-size: 14px;">This OTP will expire in 10 minutes.</p>
        <hr/>
        <p style="color: #999; font-size: 12px;">If you did not create this account, please ignore this email.</p>
      </div>
    `;

    // sendEmail catches errors internally and returns false — never throws
    const sent = await sendEmail(pendingUser.email, emailSubject, emailMessage);
    if (!sent) {
      console.error('Failed to resend registration OTP email to:', pendingUser.email);
      return res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
    }
    console.log('Registration OTP resent successfully to:', pendingUser.email);

    res.status(200).json({ 
      message: 'OTP resent successfully',
      maskedEmail: maskEmail(pendingUser.email)
    });

  } catch (error) {
    console.error('Resend registration OTP error:', error);
    res.status(500).json({ message: 'Server error while resending OTP' });
  }
};

module.exports = { 
  registerUser, 
  loginUser, 
  forgotPassword, 
  resetPassword,
  sendOTP,
  verifyOTP,
  resetPasswordWithOTP,
  verifyRegisterOTP,
  resendRegisterOTP
};
