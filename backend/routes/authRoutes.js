const express = require('express');
const { registerUser, loginUser, forgotPassword, resetPassword, sendOTP, verifyOTP, resetPasswordWithOTP, verifyRegisterOTP, resendRegisterOTP } = require('../controllers/authController');
const upload = require('../middleware/uploadMiddleware');
const router = express.Router();

// Configure Upload Fields based on your frontend keys
const uploadFields = upload.fields([
    { name: 'profilePic', maxCount: 1 },
    { name: 'fssaiDoc', maxCount: 1 },
    { name: 'gstDoc', maxCount: 1 },
    { name: 'kitchenPoster', maxCount: 1 }
]);

router.post('/register', uploadFields, registerUser);
router.post('/login', loginUser);

// OTP-based Password Reset Routes
router.post('/forgot-password/send-otp', sendOTP);
router.post('/forgot-password/verify-otp', verifyOTP);
router.post('/forgot-password/reset-password', resetPasswordWithOTP);

// Registration OTP Verification Routes
router.post('/register-verify-otp', verifyRegisterOTP);
router.post('/register-resend-otp', resendRegisterOTP);

// Legacy routes (kept for backward compatibility)
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

module.exports = router;
