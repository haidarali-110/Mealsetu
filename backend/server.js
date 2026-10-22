const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');

dotenv.config();

// Import Routes
const authRoutes = require('./routes/authRoutes');
const vendorRoutes = require('./routes/vendorRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { getVendorWeeklyPlan } = require('./controllers/vendorController');
const { seedDatabase, isDatabaseEmpty } = require('./seeds/sampleData');
const { startOfferActivationCron } = require('./cron/offerActivation');
const { startTrialExpiryCron } = require('./cron/trialExpiry');
const { startUserActivityCron } = require('./cron/userActivityCron');
const { verifyEmailConnection } = require('./utils/emailUtils');
const { startWeeklyCommissionCron } = require('./cron/weeklyCommission');
const { startKitchenClosureCron, runAutoReopen } = require('./cron/kitchenClosureCron');

// ===== SEED DEFAULT COMMISSION TIERS =====
const seedDefaultTiers = async () => {
  try {
    const CommissionSetting = require('./models/CommissionSetting');
    const count = await CommissionSetting.countDocuments();
    if (count === 0) {
      await CommissionSetting.insertMany([
        {
          tierName: 'Starter',
          minEarning: 0,
          maxEarning: 10000,
          ratePercent: 3,
          isActive: true
        },
        {
          tierName: 'Growth',
          minEarning: 10001,
          maxEarning: 50000,
          ratePercent: 5,
          isActive: true
        },
        {
          tierName: 'Pro',
          minEarning: 50001,
          maxEarning: 100000,
          ratePercent: 8,
          isActive: true
        },
        {
          tierName: 'Enterprise',
          minEarning: 100001,
          maxEarning: null,
          ratePercent: 10,
          isActive: true
        }
      ]);
      console.log('✅ Default commission tiers seeded successfully');
    } else {
      console.log(`✅ Commission tiers already exist: ${count} tiers`);
    }
  } catch (error) {
    console.error('❌ Tier seeding failed:', error.message);
  }
};

const app = express();

// Razorpay webhook — must use raw body BEFORE express.json()
app.post('/api/webhooks/razorpay',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const crypto        = require('crypto');
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      const signature     = req.headers['x-razorpay-signature'];

      if (!webhookSecret) {
        console.error('RAZORPAY_WEBHOOK_SECRET is not set — rejecting webhook');
        return res.status(500).json({ message: 'Webhook secret not configured' });
      }

      if (!signature) {
        return res.status(400).json({ message: 'Missing webhook signature' });
      }

      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(req.body)
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature))) {
        return res.status(400).json({ message: 'Invalid webhook signature' });
      }

      const event = JSON.parse(req.body);
      console.log('Razorpay webhook event:', event.event);

      if (event.event === 'payment.captured') {
        const notes = event.payload.payment.entity.notes;
        console.log('Payment captured:', {
          paymentId: event.payload.payment.entity.id,
          amount:    event.payload.payment.entity.amount / 100,
          type:      notes.type || 'subscription'
        });
      }

      res.json({ status: 'ok' });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  }
);

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// app.options('*', cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure upload subdirectories exist on startup
const fs = require('fs');
const commissionsProofDir = path.join(__dirname, 'uploads', 'commission-proofs');
if (!fs.existsSync(commissionsProofDir)) {
  fs.mkdirSync(commissionsProofDir, { recursive: true });
  console.log('Created uploads/commission-proofs directory');
}

// Public route for getting vendor weekly plan (no auth required)
app.get('/api/vendor-profile/:vendorId', async (req, res) => {
  try {
    const Vendor = require('./models/Vendor');
    const { vendorId } = req.params;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    res.json({
      weeklyPlan: vendor.weeklyPlan,
      kitchenName: vendor.kitchenName
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// Mount Routes
app.use('/api/auth',     authRoutes);
app.use('/api/vendor',   vendorRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/loyalty',  require('./routes/loyaltyRoutes'));
app.use('/api/delivery', require('./routes/deliveryRoutes'));
app.use('/api/maps',    require('./routes/mapsRoutes'));

// ===== START SERVER =====
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');

    // Seed default commission tiers if empty
    await seedDefaultTiers();

    // Check if database is empty and auto-seed if needed
    const empty = await isDatabaseEmpty();
    if (empty) {
      console.log('\n📦 Database is empty. Running automatic seed...');
      try {
        const result = await seedDatabase({ force: false, verbose: true });
        if (result.status === 'seeded') {
          console.log('✅ Automatic seeding completed!\n');
        }
      } catch (seedError) {
        console.error('⚠ Automatic seeding failed:', seedError.message);
        console.log('   Server will continue without sample data.\n');
      }
    } else {
      console.log('📊 Database contains existing data. Skipping auto-seed.\n');
    }

    const PORT = process.env.PORT || 5000;
    
    // Create HTTP server with Express app
    const httpServer = createServer(app);
    
    // Initialize Socket.IO with CORS configuration
    const io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true
      }
    });
    
// Make io accessible in all controllers via app.set('io', io)
    app.set('io', io);
    
    // FIX 7: Make io globally available to cron jobs
    global.io = io;
    
    // Socket.IO connection handler
    io.on('connection', (socket) => {
      console.log('🔌 Client connected:', socket.id);
      
      // User joins their personal room by userId
      socket.on('join', (userId) => {
        socket.join(userId);
        console.log(`👤 User ${userId} joined their room`);
      });
      
      // Vendor joins vendor room
      socket.on('joinVendor', (vendorId) => {
        socket.join(`vendor_${vendorId}`);
        console.log(`🍳 Vendor ${vendorId} joined vendor room`);
      });
      
      // Admin joins admin room
      socket.on('joinAdmin', () => {
        socket.join('admin_room');
        console.log('👨‍💼 Admin joined admin room');
      });

      // Delivery partner joins their personal notification room
      socket.on('joinDelivery', (deliveryPartnerId) => {
        socket.join(`delivery_${deliveryPartnerId}`);
        console.log('🛵 Delivery partner joined:', deliveryPartnerId);
      });

      // Vendor subscribes to real-time delivery dashboard updates
      socket.on('joinVendorDelivery', (vendorId) => {
        socket.join(`vendor_delivery_${vendorId}`);
        console.log('🏪 Vendor delivery room:', vendorId);
      });

      // Rider/customer joins a specific batch tracking room
      socket.on('joinBatchTracking', (batchId) => {
        socket.join(`batch_${batchId}`);
        console.log('📦 Joined batch tracking:', batchId);
      });

      socket.on('leaveBatchTracking', (batchId) => {
        socket.leave(`batch_${batchId}`);
        console.log('📦 Left batch tracking:', batchId);
      });

      // Customer starts watching a specific order (live GPS tracking)
      socket.on('joinTracking', (orderId) => {
        socket.join(`tracking_${orderId}`);
        console.log('📍 User tracking order:', orderId);
      });

      // Customer stops watching (e.g. navigates away)
      socket.on('leaveTracking', (orderId) => {
        socket.leave(`tracking_${orderId}`);
        console.log('📍 User stopped tracking order:', orderId);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
      });
    });
    
    // Use httpServer instead of app.listen()
    httpServer.listen(PORT, async () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log('📡 Socket.IO server initialized');

      // Verify email configuration
      await verifyEmailConnection();

// Start cron jobs
      startOfferActivationCron();
      startTrialExpiryCron();
      startUserActivityCron();

      // FIX 4: Run one-time fix for stuck orders on startup
      // This activates orders that are stuck as pending where startDate <= today
      const { fixStuckOrders } = require('./controllers/userController');
      fixStuckOrders().catch(err => console.error('Error running fixStuckOrders on startup:', err));
      runAutoReopen().catch(err => console.error('Error running runAutoReopen on startup:', err));

      // Start weekly commission cron
      startWeeklyCommissionCron();

      // Start kitchen closure advance-notification cron
      startKitchenClosureCron();

      console.log('⏰ All cron jobs started');
    });

  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
};

startServer();
