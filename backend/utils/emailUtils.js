const nodemailer = require('nodemailer');

// Create a reusable transporter instance
// Note: For Gmail, if 2FA is enabled, you need an App Password (16 characters)
// Use process.env.EMAIL_APP_PASSWORD for app passwords instead of regular password
let transporter = null;

/**
 * Initialize and get the email transporter
 * This creates the transporter on first call and reuses it
 */
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS || process.env.EMAIL_APP_PASSWORD
      }
    });
  }
  return transporter;
};

/**
 * Verify email connection at server startup
 * Call this function when the server starts to test email configuration
 */
const verifyEmailConnection = async () => {
  try {
    const transport = getTransporter();
    const verifyResult = await transport.verify();
    console.log('✅ Email server connection verified successfully');
    return { success: true, message: 'Email server connection verified' };
  } catch (error) {
    console.error('❌ Email server connection failed:', error.message);
    console.error('   Please check your EMAIL_USER, EMAIL_PASS (or EMAIL_APP_PASSWORD) in .env file');
    console.error('   For Gmail with 2FA enabled, use an App Password (16 chars) in EMAIL_APP_PASSWORD');
    return { success: false, message: error.message, error };
  }
};

/**
 * Send an email
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML body content
 * @returns {Promise<boolean>} - Returns true if sent successfully, false otherwise
 */
const sendEmail = async (to, subject, html) => {
  try {
    const transport = getTransporter();
    
    // Validate inputs
    if (!to || !to.includes('@')) {
      console.error('Email send error: Invalid recipient email address');
      return false;
    }
    if (!subject || subject.trim() === '') {
      console.error('Email send error: Subject is required');
      return false;
    }
    if (!html || html.trim() === '') {
      console.error('Email send error: HTML body is required');
      return false;
    }

    const mailOptions = {
      // Ensure 'from' address matches the authenticated account exactly
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      html
    };

    const info = await transport.sendMail(mailOptions);
    console.log(`📧 Email sent successfully to ${to}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('Email send error:', error.message);
    // Reset singleton on auth failure — forces fresh credentials on next attempt
    if (error.code === 'EAUTH' || error.responseCode === 535 || error.responseCode === 534) {
      console.error('⚠️  Gmail auth failed — resetting transporter. Check EMAIL_USER / EMAIL_PASS in .env');
      transporter = null;
    }
    return false;
  }
};

/**
 * Send an email and throw error if it fails (for critical emails like OTP)
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML body content
 * @throws {Error} - Throws error if email fails to send
 */
const sendEmailSync = async (to, subject, html) => {
  const transport = getTransporter();
  
  // Validate inputs
  if (!to || !to.includes('@')) {
    throw new Error('Invalid recipient email address');
  }
  if (!subject || subject.trim() === '') {
    throw new Error('Subject is required');
  }
  if (!html || html.trim() === '') {
    throw new Error('HTML body is required');
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    html
  };

  const info = await transport.sendMail(mailOptions);
  console.log(`📧 Email sent successfully to ${to}: ${info.messageId}`);
  return info;
};

module.exports = {
  getTransporter,
  verifyEmailConnection,
  sendEmail,
  sendEmailSync
};

