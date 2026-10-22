const Menu = require('../models/Menu');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Complaint = require('../models/Complaint');
const Subscription = require('../models/Subscription');
const Payout = require('../models/Payout');
const Commission = require('../models/Commission');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { computeSubscriptionDates, getPlanDurationDays } = require('../utils/mealTimingUtils');
const { geocodeAddress } = require('../utils/geocode');
const { calculateMissedMeals, calculatePlannedClosureMeals } = require('../utils/mealSlotCalculator');

const VendorPricing = require('../models/VendorPricing');
const CommissionSetting = require('../models/CommissionSetting');
const JainMenu = require('../models/JainMenu');
const { sendEmail } = require('../utils/emailUtils');
// Helper function to transform profilePic path to full URL
const transformProfilePic = (profilePic, req) => {
  if (!profilePic) return null;
  if (profilePic.startsWith('http://') || profilePic.startsWith('https://')) {
    return profilePic;
  }
  const backendUrl = `${req.protocol}://${req.get('host')}`;
  let cleanPath = profilePic.replace(/\/+/g, '/');
  if (cleanPath.startsWith('/uploads/')) {
    return `${backendUrl}${cleanPath}`;
  }
  return `${backendUrl}/uploads/${cleanPath.replace(/^\/?uploads\//, '')}`;
};

// Helper function to transform kitchenPoster path to full URL
const transformKitchenPoster = (kitchenPoster, req) => {
  if (!kitchenPoster) return null;
  if (kitchenPoster.startsWith('http://') || kitchenPoster.startsWith('https://')) {
    return kitchenPoster;
  }
  const backendUrl = `${req.protocol}://${req.get('host')}`;
  let cleanPath = kitchenPoster.replace(/\/+/g, '/');
  if (cleanPath.startsWith('/uploads/')) {
    return `${backendUrl}${cleanPath}`;
  }
  return `${backendUrl}/uploads/${cleanPath.replace(/^\/?uploads\//, '')}`;
};

// @desc    Get vendor profile
// @route   GET /api/vendor/me
const getVendorProfile = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id })
      .populate('ownerId', '-password');
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }
    const vendorObj = vendor.toObject();
    vendorObj.profileImage = transformProfilePic(vendor.profileImage, req);
    vendorObj.kitchenPoster = transformKitchenPoster(vendor.kitchenPoster, req);
    res.json(vendorObj);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Update vendor profile
// @route   PUT /api/vendor/me
const updateVendorProfile = async (req, res) => {
  try {
    const { kitchenName, address, pincode, phone, upiId, name } = req.body;
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    // Support structured address object {street, area, landmark, city, pincode, latitude, longitude}
    // as well as the old plain string format.
    let addressStr;
    let pincodeStr = pincode;
    let newAddressValue = address;

    if (typeof address === 'object' && address !== null) {
      addressStr = [address.shopNo, address.street, address.area, address.landmark, address.city]
        .filter(Boolean).join(', ');
      pincodeStr = address.pincode || pincode;
      // Use coordinates supplied by the frontend GPS detector if present
      if (address.latitude)  vendor.latitude  = parseFloat(address.latitude);
      if (address.longitude) vendor.longitude = parseFloat(address.longitude);
    } else if (typeof address === 'string') {
      addressStr = address;
    }

    // Detect address change BEFORE updating fields so we know whether to re-geocode
    const prevAddrStr = typeof vendor.address === 'object'
      ? vendor.address?.fullAddress || ''
      : (vendor.address || '');
    const addressChanged = (addressStr && addressStr !== prevAddrStr) ||
                           (pincodeStr && pincodeStr !== vendor.pincode);

    vendor.kitchenName = kitchenName || vendor.kitchenName;
    // Store structured object when provided, otherwise keep flat string for legacy compat
    if (newAddressValue !== undefined) {
      vendor.address = newAddressValue;
      vendor.markModified('address');
    }
    if (pincodeStr) vendor.pincode = pincodeStr;
    if (upiId !== undefined) vendor.upiId = upiId;

    // Re-geocode whenever address changed OR when coordinates are still missing.
    // Skip only when the frontend GPS detector already supplied coordinates.
    const hasFrontendCoords = typeof address === 'object' && address !== null &&
                              (address.latitude || address.longitude);
    if (addressStr && pincodeStr && !hasFrontendCoords &&
        (addressChanged || !vendor.latitude || !vendor.longitude)) {
      try {
        const coords = await geocodeAddress(`${addressStr}, ${pincodeStr}, India`);
        if (coords) {
          vendor.latitude  = coords.lat;
          vendor.longitude = coords.lng;
        }
      } catch (geoError) {
        console.log('Geocoding failed, continuing without coordinates:', geoError.message);
      }
    }

    await vendor.save();
    const userUpdates = {};
    if (phone) userUpdates.phone = phone;
    if (name)  userUpdates.name  = name;
    if (Object.keys(userUpdates).length) {
      await User.findByIdAndUpdate(req.user._id, userUpdates);
    }
    const updatedUser = await User.findById(req.user._id).select('-password');
    const vendorObj = vendor.toObject();
    vendorObj.ownerId = updatedUser ? updatedUser.toObject() : { _id: req.user._id };
    vendorObj.profileImage  = transformProfilePic(vendor.profileImage, req);
    vendorObj.kitchenPoster = transformKitchenPoster(vendor.kitchenPoster, req);
    res.json(vendorObj);
  } catch (error) {
    console.error('updateVendorProfile error:', error);
    res.status(500).json({ message: 'Server Error', detail: error.message });
  }
};

// @desc    Get vendor menus
// @route   GET /api/vendor/menus
const getVendorMenus = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }
    const menus = await Menu.find({ vendorId: vendor._id }).sort({ date: -1 });
    res.json(menus);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get vendor customers
// @route   GET /api/vendor/customers
const getVendorCustomers = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found' });

    const customerAggregation = await Order.aggregate([
      { $match: { vendorId: vendor._id, userId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$userId',
          totalOrders: { $sum: 1 },
          customerName: { $first: '$customerName' }
        }
      },
      { $match: { _id: { $ne: null } } }
    ]);

    const customerIds = customerAggregation.map(c => c._id);
    const users = await User.find({ _id: { $in: customerIds } })
      .select('name email phone');

    const customers = customerAggregation
      .map(c => {
        const user = users.find(u => u._id.toString() === c._id?.toString());
        if (!user) return null;
        return {
          _id: c._id,
          name: user.name || c.customerName || 'Unknown',
          email: user.email || '',
          phone: user.phone || '',
          totalOrders: c.totalOrders,
          isManual: false
        };
      })
      .filter(Boolean);

    // Manual customers: group by phone to deduplicate legacy fake-userId orders
    const manualOrders = await Order.aggregate([
      {
        $match: {
          vendorId: vendor._id,
          isManualOrder: true,
          manualCustomerPhone: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$manualCustomerPhone',
          name: { $first: '$manualCustomerName' },
          phone: { $first: '$manualCustomerPhone' },
          totalOrders: { $sum: 1 }
        }
      }
    ]);

    manualOrders.forEach(mo => {
      const alreadyExists = customers.some(
        c => c.phone?.replace(/\D/g, '') === mo.phone?.replace(/\D/g, '')
      );
      if (!alreadyExists) {
        customers.push({
          _id: `manual_${mo._id}`,
          name: mo.name || 'Offline Customer',
          email: '—',
          phone: mo.phone,
          totalOrders: mo.totalOrders,
          isManual: true
        });
      }
    });

    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get all plans for a specific customer of this vendor
// @route   GET /api/vendor/customer/:customerId/plans
const getCustomerPlans = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const { customerId } = req.params;
    const isManual = customerId.startsWith('manual_');

    let orders;
    if (isManual) {
      // Manual customer — match by phone
      const phone = customerId.replace('manual_', '');
      orders = await Order.find({
        vendorId: vendor._id,
        isManualOrder: true,
        manualCustomerPhone: phone
      }).sort({ orderDate: -1 });
    } else {
      orders = await Order.find({
        vendorId: vendor._id,
        userId: customerId
      }).sort({ orderDate: -1 });
    }

    const now = new Date();
    const plans = orders.map((o, idx) => {
      const end = o.endDate ? new Date(o.endDate) : null;
      const start = o.startDate ? new Date(o.startDate) : null;
      const daysLeft = end ? Math.ceil((end - now) / (1000 * 60 * 60 * 24)) : null;

      let displayStatus = o.status;
      if (o.status === 'active' && end && end < now) displayStatus = 'expired';

      return {
        planNo:        orders.length - idx,
        planType:      o.planType || '—',
        startDate:     o.startDate || null,
        endDate:       o.endDate   || null,
        amount:        o.amount    || 0,
        paymentMethod: o.paymentMethod || '—',
        paymentStatus: o.paymentStatus || '—',
        status:        displayStatus,
        daysLeft:      daysLeft,
        mealPreference: o.mealPreference || '—',
        isManualOrder: o.isManualOrder || false,
      };
    });

    res.json(plans);
  } catch (err) {
    console.error('getCustomerPlans error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get vendor complaints
// @route   GET /api/vendor/complaints
const getVendorComplaints = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found' });
    const complaints = await Complaint.find({ vendorId: vendor._id })
      .populate('userId', 'name email')
      .populate('orderId', 'planType orderDate')
      .sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Resolve a complaint
// @route   PUT /api/vendor/complaints/:id
const resolveComplaint = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found' });

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    // Security: ensure the complaint belongs to this vendor
    if (complaint.vendorId.toString() !== vendor._id.toString()) {
      return res.status(403).json({ message: 'Not authorised to update this complaint' });
    }

    complaint.status = req.body.status || complaint.status;
    if (req.body.response) complaint.response = req.body.response;
    await complaint.save();
    res.json(complaint);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Generate reports
// @route   GET /api/vendor/reports
const getVendorReports = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found' });

    const agg = await Order.aggregate([
      { $match: { vendorId: vendor._id } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: '$orderDate' } },
          totalOrders: { $sum: 1 },
          totalEarnings: { $sum: '$amount' }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]);

    res.json(agg.map(a => ({
      date: a._id,
      orders: a.totalOrders,
      earnings: a.totalEarnings
    })));
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get Vendor Reviews (vendor's own dashboard view — all reviews including hidden)
// @route   GET /api/vendor/reviews
const getVendorReviews = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const reviews = await Review.find({ vendorId: vendor._id })
      .populate('userId', 'name')
      .sort({ createdAt: -1 });

    const formattedReviews = reviews.map(review => ({
      _id:                review._id,
      user:               review.customerName || review.userId?.name || 'Anonymous',
      rating:             review.rating,
      stars:              review.rating,
      comment:            review.comment,
      isVerifiedPurchase: review.isVerifiedPurchase,
      planType:           review.planType,
      helpfulCount:       review.helpfulCount || 0,
      isEdited:           review.isEdited,
      isHidden:           review.isHidden,
      isFlagged:          review.isFlagged,
      flagReason:         review.flagReason,
      date: new Date(review.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      }),
      createdAt: review.createdAt,
      orderId:   review.orderId,
    }));

    const visibleReviews = reviews.filter(r => !r.isHidden);
    const totalRating    = visibleReviews.reduce((s, r) => s + r.rating, 0);
    const avgRating      = visibleReviews.length
      ? Math.round((totalRating / visibleReviews.length) * 10) / 10
      : 0;

    res.json({
      reviews:       formattedReviews,
      averageRating: avgRating,
      totalReviews:  reviews.length,
      visibleCount:  visibleReviews.length,
      flaggedCount:  reviews.filter(r => r.isFlagged).length,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching reviews' });
  }
};

// @desc    Add a Daily Menu
// @route   POST /api/vendor/menu
const addMenu = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found' });
    const newMenu = await Menu.create({ vendorId: vendor._id, ...req.body });
    res.status(201).json(newMenu);
  } catch (error) {
    console.error('Pricing save error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get Vendor Orders
// @route   GET /api/vendor/orders
const getVendorOrders = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    const orders = await Order.find({ vendorId: vendor._id })
      .populate('userId', 'name phone email');
    
    const formattedOrders = orders.map(order => ({
      _id: order._id,
      customerName:
        order.manualCustomerName
        || order.userId?.name
        || order.customerName
        || 'Unknown',
      phone:
        order.manualCustomerPhone
        || order.userId?.phone
        || 'N/A',
      mealPreference: order.mealPreference,
      orderDate: order.orderDate,
      createdAt: order.createdAt,
      planType: order.planType,
      amount: order.amount,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus || 'Pending',
      status: order.status,
      endDate: order.endDate,
      isManualOrder: order.isManualOrder || false
    }));
    
    res.json(formattedOrders);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get Vendor Orders with Date Filter
// @route   GET /api/vendor/orders/filtered
const getFilteredOrders = async (req, res) => {
  try {
    const { filter } = req.query;
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found' });

    const now = new Date();
    let startDate;

    if (filter === 'daily') {
      startDate = new Date(now.setHours(0, 0, 0, 0));
    } else if (filter === 'weekly') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (filter === 'monthly') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(0);
    }

    const orders = await Order.find({
      vendorId: vendor._id,
      orderDate: { $gte: startDate }
    }).populate('userId', 'name').sort({ orderDate: -1 });

    const formattedOrders = orders.map(order => {
      const resolvedName =
        order.manualCustomerName ||
        order.userId?.name ||
        order.customerName ||
        'Unknown';
      return {
      _id: order._id,
      orderId: order._id,
      username: resolvedName,
      customerName: resolvedName,
      amount: Number(order.amount) || 0,
      paymentMethod: order.paymentMethod || 'Cash',
      planType: order.planType || 'Trial',
      mealPreference: order.mealPreference || 'Regular',
      deliverySlot: order.deliverySlot || 'Lunch',
      orderDate: order.orderDate,
      paymentStatus: order.paymentStatus || 'Pending',
      transactionId: order.transactionId || 'N/A'
      };
    });

    res.json(formattedOrders);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Update Order Status
// @route   PUT /api/vendor/orders/:id
const updateOrderStatus = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const previousStatus = order.orderStatus;
    order.orderStatus = req.body.status;
    await order.save();
    
    // Emit Socket.IO events for real-time updates
    const io = req.app.get('io');
    if (io) {
      // Notify customer about order status change
      if (order.userId) {
        const customerId = order.userId.toString();
        io.to(customerId).emit('orderStatusUpdate', {
          orderId: order._id,
          status: order.orderStatus,
          previousStatus: previousStatus,
          message: getStatusUpdateMessage(order.orderStatus)
        });
      }
      
      // Notify admin about order update
      io.to('admin_room').emit('orderUpdate', {
        order: order,
        action: 'status_change',
        previousStatus: previousStatus
      });
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// Helper function to get status update message
const getStatusUpdateMessage = (status) => {
  const messages = {
    'Preparing': 'Your order is being prepared!',
    'Ready': 'Your order is ready for pickup!',
    'Out for Delivery': 'Your order is out for delivery!',
    'Delivered': 'Your order has been delivered! Enjoy your meal!',
    'Cancelled': 'Your order has been cancelled.'
  };
  return messages[status] || `Order status updated to ${status}`;
};

// @desc    Get Dashboard Stats
// @route   GET /api/vendor/dashboard-stats
const getDashboardStats = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const revenueAgg = await Order.aggregate([
      { $match: { vendorId: vendor._id } },
      { $group: { _id: null, totalRevenue: { $sum: '$amount' } } }
    ]);
    const totalRevenue = revenueAgg[0]?.totalRevenue || 0;

    const todayOrdersAgg = await Order.aggregate([
      {
        $match: {
          vendorId: vendor._id,
          orderDate: { $gte: today, $lt: tomorrow }
        }
      },
      { $count: 'todayOrders' }
    ]);
    const todayOrders = todayOrdersAgg[0]?.todayOrders || 0;

    const activeSubscribersAgg = await Subscription.aggregate([
      { $match: { vendorId: vendor._id, status: 'active' } },
      { $count: 'activeSubscribers' }
    ]);
    const activeSubscribers = activeSubscribersAgg[0]?.activeSubscribers || 0;

    const pendingCommissions = await Commission.aggregate([
      {
        $match: {
          vendorId: vendor._id,
          status: { $in: ['pending', 'overdue'] }
        }
      },
      { $group: { _id: null, totalPending: { $sum: '$commission_amount' } } }
    ]);
    const pendingPayout = pendingCommissions[0]?.totalPending || 0;

    const cashAgg = await Order.aggregate([
      { $match: { vendorId: vendor._id, paymentMethod: 'Cash' } },
      {
        $group: {
          _id: null,
          totalCashAmount: { $sum: '$amount' },
          cashCount: { $sum: 1 }
        }
      }
    ]);
    const cashPaymentsTotal = cashAgg[0]?.totalCashAmount || 0;
    const cashPaymentsCount = cashAgg[0]?.cashCount || 0;

    const upiAgg = await Order.aggregate([
      { $match: { vendorId: vendor._id, paymentMethod: 'UPI' } },
      {
        $group: {
          _id: null,
          totalUPIAmount: { $sum: '$amount' },
          upiCount: { $sum: 1 }
        }
      }
    ]);
    const upiPaymentsTotal = upiAgg[0]?.totalUPIAmount || 0;
    const upiPaymentsCount = upiAgg[0]?.upiCount || 0;

    res.json({
      totalRevenue,
      todayOrders,
      activeSubscribers,
      pendingPayout,
      cashPaymentsTotal,
      cashPaymentsCount,
      upiPaymentsTotal,
      upiPaymentsCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Save Weekly Menu Plan
// @route   PUT /api/vendor/weekly-plan
const saveWeeklyPlan = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }
    const { weeklyPlan } = req.body;
    if (!weeklyPlan || typeof weeklyPlan !== 'object') {
      return res.status(400).json({ message: 'Invalid weekly plan format' });
    }
    vendor.weeklyPlan = weeklyPlan;
    await vendor.save();
    res.json({
      message: 'Weekly plan saved successfully',
      weeklyPlan: vendor.weeklyPlan
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get Weekly Menu Plan
// @route   GET /api/vendor/weekly-plan
const getWeeklyPlan = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }
    res.json({ weeklyPlan: vendor.weeklyPlan });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// NEW MANUAL CUSTOMER FUNCTIONS - ADDED
// @desc    Add Manual Customer
// @route   POST /api/vendor/manual-customer
const addManualCustomer = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    const {
      name,
      phone,
      email,
      planType = 'daily',
      startDate,
      paymentMethod = 'Cash',
      amount,
      deliveryPincode,
      mealPreference = 'Regular',
      deliverySlot,
      leavesAllowed,
      address: addressObj,
      paymentStatus
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Customer full name is required' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ message: 'Phone number is required' });
    }
    if (amount === undefined || amount === null || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    const normalizedPlan = (planType || '').toLowerCase();
    const structuredAddress = (addressObj && typeof addressObj === 'object') ? addressObj : {};
    const pincode = structuredAddress?.pincode || deliveryPincode || '';

    let planTypeMapped = 'Daily';
    let planLeaves = 0;

    if (normalizedPlan === 'daily' || normalizedPlan === 'tiffin') {
      planTypeMapped = 'Daily';
      planLeaves = 0;
    } else if (normalizedPlan === 'weekly') {
      planTypeMapped = 'Weekly';
      planLeaves = 0;
      if (!startDate) {
        return res.status(400).json({ message: 'Start date is required for Weekly plan' });
      }
      if (!mealPreference) {
        return res.status(400).json({ message: 'Meal preference is required for Weekly plan' });
      }
    } else if (normalizedPlan === 'monthly') {
      planTypeMapped = 'Monthly';
      planLeaves = leavesAllowed !== undefined ? Number(leavesAllowed) : 2;
      if (!startDate) {
        return res.status(400).json({ message: 'Start date is required for Monthly plan' });
      }
      if (!mealPreference) {
        return res.status(400).json({ message: 'Meal preference is required for Monthly plan' });
      }
      if (!structuredAddress.area || !structuredAddress.area.trim()) {
        return res.status(400).json({ message: 'Area / Locality is required for Monthly plan' });
      }
      if (!pincode || !pincode.trim()) {
        return res.status(400).json({ message: 'Pincode is required for Monthly plan' });
      }
      if (!structuredAddress.city || !structuredAddress.city.trim()) {
        return res.status(400).json({ message: 'City is required for Monthly plan' });
      }
    } else if (normalizedPlan === 'trial') {
      planTypeMapped = 'Trial';
      planLeaves = 0;
    }

    const requestedStart = startDate ? new Date(startDate) : new Date();
    requestedStart.setUTCHours(0, 0, 0, 0);

    const todayMidnight = new Date();
    todayMidnight.setUTCHours(0, 0, 0, 0);

    let startDateObj, endDateObj, firstDayMealSlot;
    if (planTypeMapped === 'Daily') {
      startDateObj     = requestedStart;
      endDateObj       = new Date(requestedStart); // same day
      firstDayMealSlot = 'both';
    } else if (requestedStart.getTime() === todayMidnight.getTime()) {
      // Starting today — apply smart meal timing (same as online users)
      const computed = computeSubscriptionDates(getPlanDurationDays(planTypeMapped));
      startDateObj     = computed.startDate;
      endDateObj       = computed.endDate;
      firstDayMealSlot = computed.mealSlotToday; // 'both' | 'dinner' | 'none'
    } else {
      // Future date — full plan from day 1, both meals
      startDateObj     = requestedStart;
      endDateObj       = new Date(startDateObj);
      endDateObj.setUTCDate(endDateObj.getUTCDate() + getPlanDurationDays(planTypeMapped) - 1);
      firstDayMealSlot = 'both';
    }

    // STEP 1 — Geocode address via Google Maps if lat/lng not provided and details exist
    let geocodedAddress = (structuredAddress && (structuredAddress.area || structuredAddress.pincode || structuredAddress.city))
      ? { ...structuredAddress }
      : null;

    if (geocodedAddress && (!geocodedAddress.latitude || !geocodedAddress.longitude)) {
      try {
        const q = [geocodedAddress.area, geocodedAddress.city, geocodedAddress.pincode, 'India'].filter(Boolean).join(', ');
        let coords = await geocodeAddress(q);
        if (!coords && geocodedAddress.pincode) {
          coords = await geocodeAddress(`${geocodedAddress.pincode}, India`);
        }
        if (coords) {
          geocodedAddress.latitude  = coords.lat;
          geocodedAddress.longitude = coords.lng;
        }
      } catch (_) { /* geocoding failure is non-fatal */ }
    }

    // STEP 2 — Find or create a real User for this manual customer
    let customerId;
    const existingUser = await User.findOne({ phone: phone.trim() });
    if (existingUser) {
      customerId = existingUser._id;
      // Update address if better data is now available and user is a manual customer
      if (existingUser.isManualCustomer && geocodedAddress) {
        await User.updateOne({ _id: existingUser._id }, { $set: { address: geocodedAddress, pincode: pincode } });
      }
    } else {
      const userEmail = email && email.trim() ? email.trim() : `offline_${phone.trim()}@mealsetu.internal`;
      const newUser = await User.create({
        name: name.trim(),
        phone: phone.trim(),
        email: userEmail,
        password: await bcrypt.hash(Math.random().toString(36).slice(2), 10),
        role: 'user',
        address: geocodedAddress || (pincode ? { pincode } : {}),
        pincode: pincode || undefined,
        isManualCustomer: true,
        isVerified: false
      });
      customerId = newUser._id;
    }

    const payStatus = paymentStatus || 'Pending';

    // STEP 3 — Create Order using the real userId
    const newOrder = new Order({
      userId: customerId,
      vendorId: vendor._id,
      customerName: name.trim(),
      manualCustomerName: name.trim(),
      manualCustomerPhone: phone.trim(),
      manualCustomerAddress: geocodedAddress || undefined,
      manualCustomerPincode: pincode || undefined,
      planType: planTypeMapped,
      startDate: startDateObj,
      endDate: endDateObj,
      status: 'active',
      amount: parseFloat(amount),
      paymentStatus: payStatus,
      paymentMethod: paymentMethod || 'Cash',
      orderStatus: 'Preparing',
      mealPreference: mealPreference || 'Regular',
      deliverySlot: firstDayMealSlot === 'dinner' ? 'Dinner' : 'Lunch',
      firstDayMealSlot,
      source: 'manual',
      isManualOrder: true,
      isOfflineOrder: true,
      leavesAllowed: planLeaves,
      ...(payStatus === 'Paid' ? {
        cashPaymentConfirmedAt: new Date(),
        cashPaymentConfirmedBy: vendor._id,
        cashPaymentConfirmedByType: 'Vendor',
        cashCollectedAt: new Date(),
        cashCollectedBy: vendor._id,
        cashCollectedByRole: 'vendor'
      } : {})
    });

    await newOrder.save();

    // Notify vendor analytics dashboard in real-time
    try {
      const _io = req.app.get('io') || global.io;
      if (_io) _io.to(`vendor_${vendor._id}`).emit('analytics_update');
      if (_io) _io.to(`vendor_${vendor._id}`).emit('new_order_placed');
    } catch (_) {}

    // Build human-readable meal slot summary for vendor confirmation
    const slotSummary =
      firstDayMealSlot === 'both'   ? { label: '☀️🌙 Lunch + Dinner today',     color: '#16a34a', note: 'Gets both meals from today.' } :
      firstDayMealSlot === 'dinner' ? { label: '🌙 Dinner only today',           color: '#d97706', note: 'Lunch time has passed. Gets dinner today + both meals from tomorrow. One extra day added to plan.' } :
                                      { label: '🌄 Starts tomorrow',             color: '#7c3aed', note: 'Dinner time has passed. Plan starts from tomorrow with both meals.' };

    res.status(201).json({
      message: 'Manual customer added successfully',
      order: newOrder,
      mealSlotInfo: {
        firstDayMealSlot,
        ...slotSummary,
        startDate: startDateObj,
        endDate:   endDateObj,
      }
    });
  } catch (error) {
    console.error('Add manual customer error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get Manual Customers
// @route   GET /api/vendor/manual-customers
const getManualCustomers = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    const manualOrders = await Order.find({
      vendorId: vendor._id,
      isManualOrder: true
    }).sort({ createdAt: -1 }).select('-__v');

    res.json(manualOrders);
  } catch (error) {
    console.error('Get manual customers error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Calculate Manual Order Amount
// @route   GET /api/vendor/manual-customer/calculate
const calculateManualOrderAmount = async (req, res) => {
  try {
    const { planType, startDate } = req.query;
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const normalizedPlan = (planType || '').toLowerCase();
    let days = 0;
    if (normalizedPlan === 'daily' || normalizedPlan === 'tiffin') {
      const dailyPricing = await VendorPricing.findOne({
        vendor_id: vendor._id,
        plan_type: { $regex: '^daily$', $options: 'i' },
        is_active: true
      });
      const vendorPricingArray = Array.isArray(vendor.pricing) ? vendor.pricing : [];
      const planPricing = vendorPricingArray.find(
        p => (p.planType?.toLowerCase() === 'daily' || p.type?.toLowerCase() === 'daily') && p.active === true
      );
      const dailyPrice = dailyPricing?.price || planPricing?.price || vendor.dailyPrice || 80;
      return res.json({
        amount: dailyPrice,
        days: 1,
        dailyPrice,
        planType: 'Daily',
        vendorPrice: dailyPrice,
        startDate: startDate || new Date().toISOString(),
        source: dailyPricing || planPricing ? 'vendor_pricing' : 'default'
      });
    }
    if (planType === 'trial') {
      // 🔥 BUG FIX: Trial uses trialFee OR daily plan price OR 80
      const dailyPricing = await VendorPricing.findOne({
        vendor_id: vendor._id,
        plan_type: 'daily',
        is_active: true
      });
      
      const trialPrice = vendor.trialFee || (dailyPricing?.price || 80);
      const source = vendor.trialFee ? 'trial_fee' : dailyPricing ? 'daily_plan' : 'default';
      
      console.log(`📊 Trial pricing for ${vendor.kitchenName}: trialFee=${vendor.trialFee}, daily=${dailyPricing?.price}, final=${trialPrice}, source=${source}`);
      
      res.json({ 
        amount: trialPrice,
        days: 2, // Standard 2-day trial
        dailyPrice: trialPrice,
        planType,
        vendorPrice: trialPrice,
        startDate,
        source,
        usesDailyPlan: !!dailyPricing
      });
      return;
    }
    else if (planType === 'monthly') days = 30;

    // ✅ PRIORITIZE VendorPricing collection (user-visible)
    const vendorPricingDoc = await VendorPricing.findOne({ 
      vendor_id: vendor._id, 
      plan_type: planType,
      is_active: true 
    });
    
    let planPricing = vendorPricingDoc ? {
      planType: vendorPricingDoc.plan_type,
      price: vendorPricingDoc.price,
      active: true
    } : null;
    
    // Fallback to Vendor.pricing array
    if (!planPricing) {
      const vendorPricingArray = Array.isArray(vendor.pricing) ? vendor.pricing : [];
      planPricing = vendorPricingArray.find(
        p => (p.planType === planType || p.type === planType) && p.active === true
      );
    }
    
  let price = planPricing?.price;

// ✅ If trial → use daily price
if (!price && planType === 'trial') {
  const dailyPlan = await VendorPricing.findOne({
    vendor_id: vendor._id,
    plan_type: { $regex: '^daily$', $options: 'i' },
    is_active: true
  });

  price = dailyPlan?.price;
}

// ✅ final fallback
if (!price) price = 80;
    const amount = price;

    res.json({ 
      amount,
      days,
      dailyPrice: Math.round(price / days),
      planType,
      vendorPrice: price,
      startDate,
      source: planPricing ? 'vendor_pricing' : 'default'
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get Jain Menu Settings
// @route   GET /api/vendor/jain-menu
const getJainMenu = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }
    res.json({
      offersJainMenu: vendor.offersJainMenu,
      jainWeeklyPlan: vendor.jainWeeklyPlan
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Save Jain Menu Settings (toggle + weekly plan)
// @route   POST /api/vendor/jain-menu
const saveJainMenu = async (req, res) => {
  try {
    console.log('saveJainMenu req.body:', JSON.stringify(req.body));
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }
    const { offersJainMenu, jainWeeklyPlan } = req.body;
    vendor.offersJainMenu = offersJainMenu !== undefined ? offersJainMenu : vendor.offersJainMenu;
    if (jainWeeklyPlan) {
      vendor.jainWeeklyPlan = jainWeeklyPlan;
      vendor.markModified('jainWeeklyPlan');
    }
    await vendor.save();

    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    try {
      await JainMenu.deleteMany({ vendor_id: vendor._id });
      if (offersJainMenu && jainWeeklyPlan) {
        const jainMenuDocs = DAYS.map(day => ({
          vendor_id: vendor._id,
          day: day,
          main_course: jainWeeklyPlan[day]?.mainCourse || null,
          alt_sabji: jainWeeklyPlan[day]?.altSabji || null,
          alt_sabji2: jainWeeklyPlan[day]?.altSabji2 || null,
          sides: jainWeeklyPlan[day]?.sides || null,
          special_addons: jainWeeklyPlan[day]?.specialAddOns || null
        }));
        await JainMenu.insertMany(jainMenuDocs);
      }
    } catch (jainErr) {
      console.error('Failed to save JainMenu collection:', jainErr.message);
    }

    console.log('After save offersJainMenu:', vendor.offersJainMenu, 'Monday mainCourse:', vendor.jainWeeklyPlan?.Monday?.mainCourse);
    res.json({
      message: 'Jain menu saved successfully',
      offersJainMenu: vendor.offersJainMenu,
      jainWeeklyPlan: vendor.jainWeeklyPlan
    });
  } catch (error) {
    console.error('saveJainMenu error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get Pricing Plans
// @route   GET /api/vendor/pricing
const getPricing = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found' });
    // Always return as array with planType field
    const pricing = (vendor.pricing || []).map(p => ({
      planType: p.planType,
      price: p.price,
      active: p.active
    }));
    res.json({ pricing });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Save Pricing Plans
// @route   POST /api/vendor/pricing
const savePricing = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }
    const { pricing } = req.body;

    // Validation 1: Every active plan must have price > 0
    const invalidPlans = pricing.filter(p => p.active && (!p.price || p.price <= 0));
    if (invalidPlans.length > 0) {
      return res.status(400).json({
        message: 'Active plans must have price > 0',
        invalidPlans: invalidPlans.map(p => ({ planType: p.planType, price: p.price }))
      });
    }

    // Validation 2: No duplicate plan types
    const types = pricing.map(p => p.planType);
    const duplicateTypes = types.filter((type, index) => types.indexOf(type) !== index);
    if (duplicateTypes.length > 0) {
      return res.status(400).json({
        message: 'Duplicate plan types detected',
        duplicates: [...new Set(duplicateTypes)]
      });
    }

    // Validation 3: At least one plan active
    const activePlans = pricing.filter(p => p.active);
    if (activePlans.length === 0) {
      return res.status(400).json({
        message: 'At least one plan must be active'
      });
    }

    // Save to both Vendor.pricing AND VendorPricing collection (for user endpoints)
    vendor.pricing = pricing;
    vendor.markModified('pricing');
    await vendor.save();

    // Sync to VendorPricing collection for user frontend visibility
    await VendorPricing.deleteMany({ vendor_id: vendor._id });
    const pricingDocs = pricing.map(p => ({
      vendor_id: vendor._id,
      plan_type: p.planType,
      price: p.price,
      is_active: p.active
    }));
    await VendorPricing.insertMany(pricingDocs);

    res.json({
      message: 'Pricing updated successfully',
      pricing: vendor.pricing
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get Vendor Weekly Plan (Public)
const getVendorWeeklyPlan = async (req, res) => {
  try {
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
};

// @desc    Get Shop Status
// @route   GET /api/vendor/shop-status
const getShopStatus = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    const now = new Date();

    // LAZY REOPEN: if planned closure endDate has passed, auto-clear on read.
    // Defense-in-depth in case the nightly cron missed this vendor.
    if (
      !vendor.isOpen &&
      vendor.currentClosure?.isActive &&
      vendor.currentClosure?.closureType === 'planned' &&
      vendor.currentClosure?.endDate &&
      new Date(vendor.currentClosure.endDate) < now
    ) {
      // Capture meal data before clearing — closure object is reset below
      const closureMissedMeals   = vendor.currentClosure.missedMeals;
      const closureExtensionDays = vendor.currentClosure.extensionDays;

      vendor.isOpen = true;
      vendor.currentClosure = {
        isActive: false, startDate: null,
        endDate: null, reason: null, closureType: null,
        closedAt: null, missedMeals: null, extensionDays: null
      };
      await vendor.save();
      console.log(`[lazyReopen] Auto-reopened ${vendor.kitchenName} on dashboard load`);

      // Notify customers async — do not block the response
      const { sendKitchenReopenEmail } = require('../cron/kitchenClosureCron');
      sendKitchenReopenEmail(vendor._id, vendor.kitchenName, 'planned', {
        missedMeals:   closureMissedMeals,
        extensionDays: closureExtensionDays
      }).catch(err =>
        console.error('[lazyReopen] Reopen email failed:', err.message)
      );
    }

    res.json({
      isOpen:         vendor.isOpen,
      currentClosure: vendor.currentClosure || null
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Toggle Shop Status
// @route   PUT /api/vendor/shop-status
const toggleShopStatus = async (req, res) => {
  try {
    const { isOpen, closureEndDate } = req.body;
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    const previousStatus = vendor.isOpen;
    vendor.isOpen = isOpen;

    if (isOpen === false) {
      vendor.closureStartDate = new Date();
      vendor.closureEndDate = closureEndDate ? new Date(closureEndDate) : null;
      await vendor.save();

      try {
        const activeSubscriptions = await Subscription.find({
          vendorId: vendor._id,
          status: 'active'
        }).populate('userId', 'email name');

        const userEmails = new Map();
        activeSubscriptions.forEach(sub => {
          if (sub.userId && sub.userId.email) {
            userEmails.set(sub.userId._id.toString(), sub.userId);
          }
        });

        for (const [_, user] of userEmails) {
          await sendEmail(
            user.email,
            `MealSetu - ${vendor.kitchenName} is Temporarily Closed`,
            `<div style="font-family: Arial, sans-serif;">
              <h1 style="color: #f26522;">Kitchen Temporarily Closed</h1>
              <p>Dear ${user.name},</p>
              <p><strong>${vendor.kitchenName}</strong> is temporarily closed.</p>
              <p>Your subscription has been paused and will be extended when the kitchen reopens.</p>
            </div>`
          );
        }
      } catch (emailError) {
        console.error('Failed to send closure emails:', emailError);
      }

      // FCM push to all affected users
      const closedUserIds = [...userEmails.keys()];
      if (closedUserIds.length > 0) {
        const { notifyAllUsers: _nau } = require('../utils/fcmService');
        _nau(closedUserIds, `🔒 ${vendor.kitchenName} Temporarily Closed`, 'Your subscription is paused and will be extended when the kitchen reopens.', { type: 'kitchen_closed', screen: 'subscription' }).catch(console.error);
      }

      return res.json({
        message: 'Kitchen closed successfully',
        isOpen: vendor.isOpen,
        closureStartDate: vendor.closureStartDate,
        closureEndDate: vendor.closureEndDate,
        subscriptionsExtended: 0
      });

    } else if (isOpen === true && previousStatus === false) {
      if (!vendor.closureStartDate) {
        vendor.isOpen = true;
        vendor.closureStartDate = null;
        vendor.closureEndDate = null;
        await vendor.save();
        return res.json({
          message: 'Kitchen opened successfully',
          isOpen: true,
          subscriptionsExtended: 0
        });
      }

      const closureStart = new Date(vendor.closureStartDate);
      const closureEnd = new Date();
      const diffTime = Math.abs(closureEnd - closureStart);
      const closureDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let subscriptionsExtended = 0;
      const extendedSubscriptions = [];

      if (closureDays >= 1) {
        const activeSubscriptions = await Subscription.find({
          vendorId: vendor._id,
          status: 'active'
        }).populate('userId', 'email name');

        for (const subscription of activeSubscriptions) {
          const currentExpiry = new Date(subscription.expiryDate);
          const now = new Date();
          const previousExpiry = new Date(currentExpiry);

          if (currentExpiry > now) {
            currentExpiry.setDate(currentExpiry.getDate() + closureDays);
            subscription.expiryDate = currentExpiry;
            await subscription.save();
            subscriptionsExtended++;

            if (subscription.userId) {
              extendedSubscriptions.push({
                user: subscription.userId,
                previousExpiry: previousExpiry.toLocaleDateString(),
                newExpiry: currentExpiry.toLocaleDateString()
              });
            }
          }
        }

        try {
          for (const extSub of extendedSubscriptions) {
            await sendEmail(
              extSub.user.email,
              `MealSetu - ${vendor.kitchenName} is Back in Service!`,
              `<div style="font-family: Arial, sans-serif;">
                <h1 style="color: #16a34a;">Kitchen Reopened!</h1>
                <p>Dear ${extSub.user.name},</p>
                <p><strong>${vendor.kitchenName}</strong> is back in service!</p>
                <p>Subscription extended by ${closureDays} day(s).</p>
                <p><strong>New Expiry: ${extSub.newExpiry}</strong></p>
              </div>`
            );
          }
        } catch (emailError) {
          console.error('Failed to send reopening emails:', emailError);
        }

        // FCM push to all extended users
        const reopenedUserIds = extendedSubscriptions.map(s => s.user._id?.toString()).filter(Boolean);
        if (reopenedUserIds.length > 0) {
          const { notifyAllUsers: _nau } = require('../utils/fcmService');
          _nau(reopenedUserIds, `🔓 ${vendor.kitchenName} is Back!`, `Kitchen reopened! Your subscription has been extended by ${closureDays} day(s).`, { type: 'kitchen_reopened', screen: 'subscription' }).catch(console.error);
        }
      }

      vendor.closureStartDate = null;
      vendor.closureEndDate = null;
      await vendor.save();

      return res.json({
        message: `Kitchen opened! ${subscriptionsExtended > 0
          ? `${subscriptionsExtended} subscription(s) extended by ${closureDays} day(s)`
          : ''}`,
        isOpen: vendor.isOpen,
        closureDays,
        subscriptionsExtended
      });

    } else {
      await vendor.save();
      return res.json({
        message: 'Kitchen status unchanged',
        isOpen: vendor.isOpen
      });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Update vendor profile picture
// @route   PUT /api/vendor/me/profile-pic
const updateVendorProfilePic = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image file' });
    }
    vendor.profileImage = `/uploads/${req.file.filename}`;
    await vendor.save();
    const profileImageUrl = transformProfilePic(vendor.profileImage, req);
    res.json({
      message: 'Profile picture updated successfully',
      profileImage: profileImageUrl
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Update vendor kitchen poster
// @route   PUT /api/vendor/me/kitchen-poster
const updateKitchenPoster = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image file' });
    }
    vendor.kitchenPoster = `/uploads/${req.file.filename}`;
    await vendor.save();
    const kitchenPosterUrl = transformKitchenPoster(vendor.kitchenPoster, req);
    res.json({
      message: 'Kitchen poster updated successfully',
      kitchenPoster: kitchenPosterUrl
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Update vendor trial settings
// @route   PATCH /api/vendor/trial-settings
const updateTrialSettings = async (req, res) => {
  try {
    const { trialEnabled, trialFee } = req.body;
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }
    if (trialEnabled !== undefined) vendor.trialEnabled = trialEnabled;
    if (trialFee !== undefined) {
      const fee = Number(trialFee);
      if (isNaN(fee) || fee < 0) {
        return res.status(400).json({ message: 'trialFee must be a positive number or zero' });
      }
      vendor.trialFee = fee;
    }
    await vendor.save();
    res.json({
      message: 'Trial settings updated successfully',
      trialEnabled: vendor.trialEnabled,
      trialFee: vendor.trialFee
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Submit vendor compliance
const submitVendorCompliance = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    if (req.files) {
      const normalizePath = (filePath) => {
        let normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('uploads/')) {
          const parts = normalized.split('uploads/');
          normalized = '/uploads/' + parts[parts.length - 1];
        }
        return normalized;
      };
      if (req.files.fssaiDoc) {
        vendor.fssaiLicense = normalizePath(req.files.fssaiDoc[0].path);
      }
      if (req.files.gstDoc) {
        vendor.gstDocument = normalizePath(req.files.gstDoc[0].path);
      }
    }

    const updateResult = await Vendor.findByIdAndUpdate(
      vendor._id,
      {
        $set: {
          isApproved: false,
          status: 'pending',
          approvalStatus: 'Pending',
          rejectionReason: null,
          resubmittedAt: new Date(),
          submittedDate: new Date()
        }
      },
      { new: true, runValidators: false }
    );

    res.json({
      message: 'Documents submitted successfully.',
      vendorId: updateResult._id,
      newStatus: updateResult.status
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ===== COMMISSION FUNCTIONS =====

// @desc    Get vendor commission summary (current rolling week)
// @route   GET /api/vendor/commission/summary
const getCommissionSummary = async (req, res) => {
  try {
    const Expense = require('../models/Expense');
    const CommissionSetting = require('../models/CommissionSetting');
    const { getCurrentOpenPeriod, getFinancialYearLabel } = require('../utils/commissionPeriod');

    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const vendorId = vendor._id;
    const now = new Date();

    const firstOrder = await Order.findOne({ vendorId })
      .sort({ orderDate: 1, createdAt: 1 })
      .select('createdAt orderDate startDate').lean();
    const anchorDate = firstOrder?.createdAt || firstOrder?.orderDate || firstOrder?.startDate;

    if (!anchorDate) {
      return res.json({
        success: true, status: 'not_generated',
        gross_earning: 0, total_expenses: 0, net_earning: 0,
        commission_rate: 0, commission_due: 0, vendor_keeps: 0,
        tier_name: 'Starter', current_month: now.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
        orders_count: 0, expenses_count: 0, auto_deducted: false,
        lifetimeNetEarning: 0, lifetimeCommission: 0
      });
    }

    const openPeriod = await getCurrentOpenPeriod(Commission, vendorId, anchorDate, now);
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const orders = await Order.find({
      vendorId, status: { $nin: ['cancelled', 'on-hold'] }, paymentStatus: 'Paid',
      $or: [
        { createdAt: { $gte: openPeriod.periodStart, $lte: openPeriod.periodEnd } },
        { orderDate: { $gte: openPeriod.periodStart, $lte: openPeriod.periodEnd } }
      ]
    }).select('amount walletDeduction').lean();

    const grossEarning = orders.reduce((s, o) => s + (o.amount || 0), 0);
    const walletDeductions = orders.reduce((s, o) => s + (o.walletDeduction || 0), 0);
    const grossAfterWallet = grossEarning - walletDeductions;

    const expenses = await Expense.find({ vendorId, month: currentMonth }).lean();
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const netEarning = Math.max(0, grossAfterWallet - totalExpenses);

    const tiers = await CommissionSetting.find({ isActive: true }).sort({ minEarning: 1 });
    let commissionRate = 3, tierName = 'Starter';
    for (const tier of tiers) {
      if (netEarning >= tier.minEarning && (tier.maxEarning === null || netEarning <= tier.maxEarning)) {
        commissionRate = tier.ratePercent; tierName = tier.tierName; break;
      }
    }
    const commissionDue = Math.round(netEarning * commissionRate / 100);
    const vendorKeeps = netEarning - commissionDue;

    const existingCommission = await Commission.findOne({ vendorId, month: currentMonth }).lean();

    const lifetimeAgg = await Commission.aggregate([
      { $match: { vendorId, status: { $in: ['auto_deducted', 'paid'] } } },
      { $group: { _id: null, lifetimeNet: { $sum: '$net_earning' }, lifetimeCommission: { $sum: '$commission_amount' } } }
    ]);

    return res.status(200).json({
      success: true,
      gross_earning: grossAfterWallet,
      total_expenses: totalExpenses,
      net_earning: existingCommission ? existingCommission.net_earning : netEarning,
      commission_rate: existingCommission ? existingCommission.commission_rate : commissionRate,
      commission_due: existingCommission ? existingCommission.commission_amount : commissionDue,
      vendor_keeps: existingCommission ? (existingCommission.net_earning - existingCommission.commission_amount) : vendorKeeps,
      tier_name: tierName,
      current_month: now.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
      month: currentMonth,
      status: existingCommission ? existingCommission.status : 'not_generated',
      orders_count: orders.length,
      expenses_count: expenses.length,
      auto_deducted: existingCommission?.auto_deducted || false,
      auto_deducted_at: existingCommission?.auto_deducted_at || null,
      commissionId: existingCommission?._id || null,
      periodStart: existingCommission?.periodStart || openPeriod.periodStart,
      periodEnd: existingCommission?.periodEnd || openPeriod.periodEnd,
      isFirstCycle: existingCommission ? existingCommission.isFirstCycle : openPeriod.isFirstCycle,
      financialYear: getFinancialYearLabel(now),
      lifetimeNetEarning: lifetimeAgg[0]?.lifetimeNet || 0,
      lifetimeCommission: lifetimeAgg[0]?.lifetimeCommission || 0
    });
  } catch (err) {
    console.error('[getCommissionSummary]', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc    Get pending payout (legacy dashboard)
const getPendingPayout = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(200).json({ pendingAmount: 0, overdueAmount: 0 });
    }

    const pendingCommissions = await Commission.aggregate([
      {
        $match: {
          vendorId: vendor._id,
          status: { $in: ['pending', 'overdue'] }
        }
      },
      { $group: { _id: null, totalPending: { $sum: '$commission_amount' } } }
    ]);

    res.status(200).json({
      pendingAmount: pendingCommissions[0]?.totalPending || 0,
      overdueAmount: 0,
      pendingCount: 1,
      overdueCount: 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get all commissions for vendor
// @route   GET /api/vendor/commission/history
const getMyCommissions = async (req, res) => {
  try {
    console.log('=== getCommissionHistory CALLED ===');
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) {
      return res.status(200).json({ commissions: [], total: 0 });
    }
    console.log('vendorId:', vendor._id);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const commissions = await Commission.find({ vendorId: vendor._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Commission.countDocuments({ vendorId: vendor._id });

    const allCommissions = await Commission.find({ vendorId: vendor._id }).lean();
    console.log('=== ALL COMMISSIONS IN DB FOR VENDOR ===', {
      count:    allCommissions.length,
      vendorId: vendor._id,
      records:  allCommissions.map(c => ({
        id:      c._id,
        week:    c.week,
        status:  c.status,
        amount:  c.commission_amount,
        earning: c.total_earning,
        vendorIdOnRecord: c.vendorId
      }))
    });

    res.status(200).json({
      commissions,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const getAdminUpiId = async (req, res) => {
  try {
    const PlatformSetting = require('../models/PlatformSetting');
    const settings = await PlatformSetting.findOne();
    if (!settings || !settings.adminUpiId) {
      return res.json({ adminUpiId: null, configured: false });
    }
    res.json({ adminUpiId: settings.adminUpiId, configured: true });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get all cash payment orders for this vendor
// @route   GET /api/vendor/cash-payments
const getCashPayments = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const [orders, pendingCount] = await Promise.all([
      Order.find({ vendorId: vendor._id, paymentMethod: 'Cash' })
        .populate('userId', 'name phone email')
        .sort({ orderDate: -1 }),
      Order.countDocuments({
        vendorId: vendor._id,
        paymentMethod: 'Cash',
        paymentStatus: 'Pending'
      })
    ]);

    const mapped = orders.map(order => ({
      orderId: order._id,
      customerName: order.manualCustomerName || order.userId?.name || order.customerName || 'Unknown',
      customerPhone: order.manualCustomerPhone || order.userId?.phone || 'N/A',
      planType: order.planType,
      amount: order.amount,
      orderDate: order.orderDate,
      paymentStatus: order.paymentStatus,
      cashPaymentConfirmedAt: order.cashPaymentConfirmedAt || null,
      cashPaymentConfirmedBy: order.cashPaymentConfirmedBy || null,
      cashPaymentConfirmedByType: order.cashPaymentConfirmedByType || null,
      cashCollectedBy: order.cashCollectedBy || null,
      cashCollectedAt: order.cashCollectedAt || order.cashPaymentConfirmedAt || null,
      cashCollectedByRole: order.cashCollectedByRole || (order.cashPaymentConfirmedByType === 'DeliveryPartner' ? 'rider' : order.cashPaymentConfirmedByType === 'Vendor' ? 'vendor' : null),
      cashCollection: order.cashCollection || null,
      startDate: order.startDate,
      endDate: order.endDate,
      source: order.source,
      isManualOrder: order.isManualOrder || false,
      isOfflineOrder: order.isOfflineOrder || order.isManualOrder || order.source === 'manual' || false
    }));

    res.json({ orders: mapped, pendingCount });
  } catch (error) {
    console.error('getCashPayments error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Mark a cash payment order as paid
// @route   PATCH /api/vendor/cash-payments/:orderId/mark-paid
const markCashPaymentPaid = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const order = await Order.findOne({
      _id: req.params.orderId,
      vendorId: vendor._id,
      paymentMethod: 'Cash',
      paymentStatus: 'Pending'
    }).populate('userId', 'name email');

    if (!order) {
      return res.status(404).json({ message: 'Order not found or already marked as paid' });
    }

    order.paymentStatus = 'Paid';
    order.cashPaymentConfirmedAt = new Date();
    order.cashPaymentConfirmedBy = vendor._id;
    order.cashPaymentConfirmedByType = 'Vendor';
    order.cashCollectedAt = new Date();
    order.cashCollectedBy = vendor._id;
    order.cashCollectedByRole = 'vendor';
    await order.save();

    const io = req.app.get('io');
    if (io) {
      if (order.userId) {
        io.to(order.userId.toString()).emit('payment_confirmed', {
          orderId: order._id,
          message: 'Your cash payment has been confirmed by the vendor!'
        });
      }
      io.to(`vendor_${vendor._id}`).emit('cash_payment_updated', {
        orderId: order._id
      });
    }

    try {
      if (order.userId?.email) {
        const { getMealSlotInfo } = require('../utils/mealTimingUtils');
        const slotInfo = getMealSlotInfo(order.startDate, order.orderDate);
        const endFormatted = order.endDate
          ? new Date(order.endDate).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'long', year: 'numeric'
            })
          : 'N/A';
        const confirmedAt = new Date(order.cashPaymentConfirmedAt).toLocaleString('en-IN');
        await sendEmail(
          order.userId.email,
          'MealSetu — Cash Payment Confirmed ✅',
          `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#16a34a;padding:24px;text-align:center;border-radius:12px 12px 0 0">
              <h1 style="color:white;margin:0;font-size:22px">✅ Cash Payment Confirmed</h1>
            </div>
            <div style="padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
              <p>Dear ${order.userId.name || 'Customer'},</p>
              <p>Your cash payment has been confirmed by the vendor. Your subscription is now active.</p>
              <div style="background:${slotInfo.badgeBg};border-left:4px solid ${slotInfo.badgeColor};border-radius:8px;padding:16px;margin:16px 0">
                <p style="margin:0 0 6px 0;font-weight:700;color:${slotInfo.badgeColor};font-size:16px">${slotInfo.slotLabel}</p>
                <p style="margin:0 0 4px 0;color:#374151;font-size:14px">${slotInfo.startMessage}</p>
                <p style="margin:0;color:#64748b;font-size:13px">${slotInfo.mealMessage}</p>
              </div>
              <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr style="background:#f8fafc">
                  <td style="padding:10px 14px;font-weight:600;color:#374151">Plan</td>
                  <td style="padding:10px 14px;color:#64748b">${order.planType}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;font-weight:600;color:#374151">Amount</td>
                  <td style="padding:10px 14px;color:#64748b">₹${order.amount}</td>
                </tr>
                <tr style="background:#f8fafc">
                  <td style="padding:10px 14px;font-weight:600;color:#374151">Valid Until</td>
                  <td style="padding:10px 14px;color:#64748b">${endFormatted}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;font-weight:600;color:#374151">Confirmed At</td>
                  <td style="padding:10px 14px;color:#64748b">${confirmedAt}</td>
                </tr>
              </table>
              <p style="color:#64748b;font-size:13px;text-align:center;margin-top:20px">Thank you for choosing MealSetu!</p>
            </div>
          </div>`
        );
      }
    } catch (emailError) {
      console.error('Failed to send cash payment confirmation email:', emailError);
    }

    if (order.userId?._id) {
      const { notifyCashPaymentConfirmed } = require('../utils/fcmService');
      notifyCashPaymentConfirmed(order.userId._id, vendor.kitchenName, order.planType || 'subscription').catch(console.error);
    }

    res.json({ message: 'Payment marked as paid', order });
  } catch (error) {
    console.error('markCashPaymentPaid error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Extends all active orders and shifts all pending orders by extensionDays.
// Uses millisecond math so 0.5-day (12-hour) extensions are precise.
// Returns { activeUpdated, upcomingUpdated } counts.
const extendAllPlansOnClosure = async (vendorId, extensionDays) => {
  if (!extensionDays || extensionDays <= 0) {
    console.log(`[extendPlans] extensionDays=${extensionDays} — skipping`);
    return { activeUpdated: 0, upcomingUpdated: 0 };
  }

  const extensionMs = extensionDays * 24 * 60 * 60 * 1000;

  const activeOrders = await Order.find({
    vendorId,
    status:  'active',
    endDate: { $gte: new Date() }
  });

  const pendingOrders = await Order.find({ vendorId, status: 'pending' });

  console.log(`[extendPlans] vendorId=${vendorId} extensionDays=${extensionDays} extensionMs=${extensionMs}`);
  console.log(`[extendPlans] active=${activeOrders.length} pending=${pendingOrders.length}`);

  for (const order of activeOrders) {
    const oldEnd  = new Date(order.endDate);
    order.endDate = new Date(oldEnd.getTime() + extensionMs);
    await order.save();
    console.log(`[extendPlans] active ${order._id}: ${oldEnd.toDateString()} → ${order.endDate.toDateString()}`);
  }

  for (const order of pendingOrders) {
    if (order.startDate) {
      order.startDate          = new Date(new Date(order.startDate).getTime() + extensionMs);
      order.scheduledStartDate = order.scheduledStartDate
        ? new Date(new Date(order.scheduledStartDate).getTime() + extensionMs)
        : order.startDate;
    }
    if (order.endDate) {
      order.endDate            = new Date(new Date(order.endDate).getTime() + extensionMs);
      order.scheduledEndDate   = order.scheduledEndDate
        ? new Date(new Date(order.scheduledEndDate).getTime() + extensionMs)
        : order.endDate;
    }
    await order.save();
    console.log(`[extendPlans] pending ${order._id} shifted +${extensionDays} days`);
  }

  return { activeUpdated: activeOrders.length, upcomingUpdated: pendingOrders.length };
};

// @desc  Close kitchen with user notification + plan extension
// @route POST /api/vendor/kitchen/close
const closeKitchenWithClosure = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id })
      .populate('ownerId', 'email name');
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    if (vendor.currentClosure?.isActive === true) {
      return res.status(409).json({ message: 'Kitchen is already closed. Reopen before closing again.' });
    }

    const { closureType, startDate, endDate, reason } = req.body;
    const isEmergency = closureType === 'emergency';

    // For emergency: start is always NOW server-side — never trust client time
    const start = isEmergency ? new Date() : (() => {
      const d = new Date(startDate);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    })();

    const end = new Date(endDate);
    // 18:29:59 UTC = 23:59:59 IST — end of day in Indian timezone, avoids +1 day display artifact
    end.setUTCHours(18, 29, 59, 999);

    // Compute meal-accurate extension for planned closures.
    // For emergency: unknown duration — compute at reopen using closedAt.
    let plannedMissedMeals   = null;
    let plannedExtensionDays = null;
    let plannedBreakdown     = [];
    if (!isEmergency) {
      const calc = calculatePlannedClosureMeals(start, end);
      plannedMissedMeals   = calc.missedMeals;
      plannedExtensionDays = calc.extensionDays;
      plannedBreakdown     = calc.breakdown;
      console.log(`[plannedClosure] vendor=${vendor._id} kitchen=${vendor.kitchenName}`);
      console.log(`[plannedClosure] missedMeals=${plannedMissedMeals} extensionDays=${plannedExtensionDays}`);
      console.log(`[plannedClosure] breakdown=${JSON.stringify(plannedBreakdown)}`);
    }

    vendor.currentClosure = {
      isActive:      true,
      startDate:     start,
      endDate:       end,
      reason:        reason || (isEmergency ? 'Emergency' : 'Holiday'),
      closureType,
      closedAt:      new Date(),   // exact API-call timestamp; for emergency: precise close time
      missedMeals:   plannedMissedMeals,
      extensionDays: plannedExtensionDays
    };
    vendor.plannedClosures.push({
      startDate:   start,
      endDate:     end,
      reason:      reason || (isEmergency ? 'Emergency' : 'Holiday'),
      closureType,
      notifiedAt:  new Date()
    });
    vendor.isOpen = false;
    await vendor.save();

    const startFormatted = start.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const endFormatted   = end.toLocaleDateString('en-IN',   { day: 'numeric', month: 'long', year: 'numeric' });

    const activeOrders = await Order.find({
      vendorId: vendor._id,
      status:   'active',
      endDate:  { $gte: new Date() }
    }).populate('userId', 'email name');

    // ── EMERGENCY: send Email 1 only, do NOT extend plans yet ──
    if (isEmergency) {
      for (const order of activeOrders) {
        if (!order.userId?.email) continue;
        try {
          await sendEmail(
            order.userId.email,
            `🚨 ${vendor.kitchenName} – Emergency Closure Notice`,
            `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#dc2626;padding:24px;text-align:center;border-radius:12px 12px 0 0">
                <h1 style="color:white;margin:0;font-size:20px">⚠️ Emergency Kitchen Closure</h1>
              </div>
              <div style="padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
                <p>Dear ${order.userId.name},</p>
                <p><strong>${vendor.kitchenName}</strong> has had to close temporarily due to an emergency.</p>
                <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:8px;padding:16px;margin:16px 0">
                  <p style="margin:0 0 8px;font-weight:700;color:#92400e">Closure Details</p>
                  <p style="margin:4px 0;color:#374151">📅 <strong>Closed from:</strong> ${startFormatted}</p>
                  <p style="margin:4px 0;color:#374151">📅 <strong>Expected reopen:</strong> ${endFormatted}</p>
                  <p style="margin:4px 0;color:#374151">📝 <strong>Reason:</strong> ${reason || 'Emergency'}</p>
                </div>
                <div style="background:#f0f9ff;border-left:4px solid #3b82f6;border-radius:8px;padding:16px;margin:16px 0">
                  <p style="margin:0 0 8px;font-weight:700;color:#1d4ed8">ℹ️ Your Plan</p>
                  <p style="margin:0;color:#374151">Your active plan has been noted. It will be extended by the <strong>exact number of meals missed</strong> during the closure. We will confirm your new plan end date when the kitchen reopens.</p>
                </div>
                <p style="color:#64748b;font-size:13px">We will notify you the moment the kitchen reopens.</p>
                <p style="color:#64748b;font-size:13px">Thank you for your understanding — MealSetu Team</p>
              </div>
            </div>`
          );
        } catch (emailErr) {
          console.error('Emergency Email 1 failed:', order.userId.email, emailErr.message);
        }
      }

      const io = req.app.get('io');
      if (io) {
        for (const order of activeOrders) {
          if (order.userId?._id) {
            io.to(order.userId._id.toString()).emit('subscription_updated', {
              type: 'kitchen_closed',
              message: `${vendor.kitchenName} has temporarily closed. Your plan will be extended when they reopen.`
            });
          }
        }
      }

      // FCM push for emergency closure
      const emergencyUserIds = activeOrders.map(o => o.userId?._id?.toString()).filter(Boolean);
      if (emergencyUserIds.length > 0) {
        const { notifyAllUsers: _nau } = require('../utils/fcmService');
        _nau(emergencyUserIds, `🚨 ${vendor.kitchenName} Emergency Closure`, `${vendor.kitchenName} has had to close temporarily. Your plan will be extended when they reopen.`, { type: 'emergency_closure', screen: 'subscription' }).catch(console.error);
      }

      return res.json({
        success:       true,
        message:       `Kitchen closed (emergency). ${activeOrders.length} subscribers notified.`,
        extendedCount: 0,
        missedMeals:   null,
        extensionDays: null,
        startDate:     start,
        endDate:       end
      });
    }

    // ── PLANNED: extend active plans + shift upcoming (pending) plans ──
    const extensionMs = plannedExtensionDays * 24 * 60 * 60 * 1000;

    if (plannedExtensionDays > 0) {
      await extendAllPlansOnClosure(vendor._id, plannedExtensionDays);
    } else {
      console.log(`[plannedClosure] extensionDays=0 — no order extension needed`);
    }

    // Send closure notification to each active subscriber
    // activeOrders was fetched before the extension; new endDate = oldEnd + extensionMs
    for (const order of activeOrders) {
      if (!order.userId?.email) continue;
      const newEndDate      = new Date(new Date(order.endDate).getTime() + extensionMs);
      const newEndFormatted = newEndDate.toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      const mealLine = plannedMissedMeals > 0
        ? `<p style="margin:4px 0;color:#374151">🍽️ <strong>Meals covered:</strong> ${plannedMissedMeals} meal${plannedMissedMeals !== 1 ? 's' : ''}</p>`
        : '';
      try {
        await sendEmail(
          order.userId.email,
          `📅 ${vendor.kitchenName} – Planned Closure Notice`,
          `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#f26522;padding:24px;text-align:center;border-radius:12px 12px 0 0">
              <h1 style="color:white;margin:0;font-size:20px">📅 Planned Kitchen Closure</h1>
            </div>
            <div style="padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
              <p>Dear ${order.userId.name},</p>
              <p><strong>${vendor.kitchenName}</strong> will be closed for a planned break.</p>
              <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:8px;padding:16px;margin:16px 0">
                <p style="margin:0 0 8px;font-weight:700;color:#92400e">Closure Details</p>
                <p style="margin:4px 0;color:#374151">📅 <strong>From:</strong> ${startFormatted}</p>
                <p style="margin:4px 0;color:#374151">📅 <strong>To:</strong> ${endFormatted}</p>
                <p style="margin:4px 0;color:#374151">📝 <strong>Reason:</strong> ${reason || 'Holiday'}</p>
              </div>
              <div style="background:#dcfce7;border-left:4px solid #16a34a;border-radius:8px;padding:16px;margin:16px 0">
                <p style="margin:0 0 8px;font-weight:700;color:#166534">✅ Your Plan Has Been Extended</p>
                <p style="margin:4px 0;color:#374151">Your subscription has been automatically extended by <strong>${plannedExtensionDays} day${plannedExtensionDays !== 1 ? 's' : ''}</strong>.</p>
                ${mealLine}
                <p style="margin:8px 0 0;color:#374151">New plan end date: <strong style="color:#16a34a">${newEndFormatted}</strong></p>
              </div>
              <p style="color:#64748b;font-size:13px">We apologize for the inconvenience and look forward to serving you again.</p>
              <p style="color:#64748b;font-size:13px">Thank you for your understanding — MealSetu Team</p>
            </div>
          </div>`
        );
      } catch (emailErr) {
        console.error('Planned closure email failed:', order.userId.email, emailErr.message);
      }
    }

    const io = req.app.get('io');
    if (io) {
      for (const order of activeOrders) {
        if (order.userId?._id) {
          io.to(order.userId._id.toString()).emit('subscription_updated', {
            type: 'plan_extended',
            message: plannedExtensionDays > 0
              ? `${vendor.kitchenName} is closed. Your plan has been extended by ${plannedExtensionDays} days.`
              : `${vendor.kitchenName} is closed temporarily.`
          });
        }
      }
    }

    // FCM push for planned closure
    const plannedUserIds = activeOrders.map(o => o.userId?._id?.toString()).filter(Boolean);
    if (plannedUserIds.length > 0) {
      const { notifyAllUsers: _nau } = require('../utils/fcmService');
      _nau(plannedUserIds, `📅 ${vendor.kitchenName} Planned Closure`, `Closed ${startFormatted}–${endFormatted}. Your plan extended by ${plannedExtensionDays} day(s).`, { type: 'planned_closure', screen: 'subscription' }).catch(console.error);
    }

    res.json({
      success:       true,
      message:       `Kitchen closed. ${activeOrders.length} active plans extended by ${plannedExtensionDays} days (${plannedMissedMeals} missed meals).`,
      extendedCount: activeOrders.length,
      missedMeals:   plannedMissedMeals,
      extensionDays: plannedExtensionDays,
      startDate:     start,
      endDate:       end
    });
  } catch (error) {
    console.error('closeKitchenWithClosure error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc  Reopen kitchen after closure
// @route POST /api/vendor/kitchen/reopen
const reopenKitchen = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const closure = vendor.currentClosure;

    if (!closure?.isActive) {
      return res.status(400).json({ success: false, message: 'No active closure found' });
    }

    const reopenTime = new Date();

    let extensionDays = 0;
    let missedMeals   = 0;
    let breakdown     = [];

    if (closure.closureType === 'emergency') {
      // Use closedAt (exact close time), not startDate (UTC midnight)
      const closeTime = new Date(closure.closedAt || closure.startDate);
      const result    = calculateMissedMeals(closeTime, reopenTime);
      extensionDays   = result.extensionDays;
      missedMeals     = result.missedMeals;
      breakdown       = result.breakdown;

      console.log(`[emergencyReopen] vendor=${vendor._id} kitchen=${vendor.kitchenName}`);
      console.log(`[emergencyReopen] closeTime=${closeTime.toISOString()} reopenTime=${reopenTime.toISOString()}`);
      console.log(`[emergencyReopen] missedMeals=${missedMeals} extensionDays=${extensionDays}`);
      console.log(`[emergencyReopen] breakdown=${JSON.stringify(breakdown)}`);
    }

    if (closure.closureType === 'planned') {
      console.log(`[plannedReopen] vendor=${vendor._id} — planned closure cleared, no re-extension`);
    }

    // Clear closure state first — vendor is open again
    vendor.isOpen = true;
    vendor.currentClosure = {
      isActive:      false,
      startDate:     null,
      endDate:       null,
      reason:        null,
      closureType:   null,
      closedAt:      null,
      missedMeals:   null,
      extensionDays: null
    };
    await vendor.save();

    // Extend orders only for emergency (planned orders were extended at close time)
    if (closure.closureType === 'emergency') {
      await extendAllPlansOnClosure(vendor._id, extensionDays);
    }

    // Send reopen notification with accurate meal info
    const { sendKitchenReopenEmail } = require('../cron/kitchenClosureCron');
    sendKitchenReopenEmail(vendor._id, vendor.kitchenName, closure.closureType, {
      missedMeals, extensionDays
    }).catch(err => console.error('[reopenKitchen] Email failed:', err.message));

    const io = req.app.get('io');
    if (io) {
      const activeOrders = await Order.find({ vendorId: vendor._id, status: 'active', endDate: { $gte: new Date() } });
      for (const order of activeOrders) {
        if (order.userId) {
          io.to(order.userId.toString()).emit('subscription_updated', {
            type:    'plan_extended',
            message: extensionDays > 0
              ? `${vendor.kitchenName} has reopened! Your plan was extended by ${extensionDays} days.`
              : `${vendor.kitchenName} has reopened!`
          });
        }
      }
    }

    return res.json({
      success:       true,
      message:       'Kitchen reopened successfully',
      missedMeals,
      extensionDays
    });
  } catch (error) {
    console.error('[reopenKitchen] Error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc  Get all customers of this vendor with loyalty data
// @route GET /api/vendor/customer-loyalty
// ─────────────────────────────────────────────────────────────────────────────
const getVendorCustomerLoyalty = async (req, res) => {
  try {
    const LoyaltyPoints = require('../models/LoyaltyPoints');
    const { getUserLevel } = require('./loyaltyController');

    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const orders = await Order.find({ vendorId: vendor._id })
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 });

    const customerMap = {};
    orders.forEach(order => {
      const uid = order.userId?._id?.toString();
      if (!uid) return;
      if (!customerMap[uid]) {
        customerMap[uid] = {
          userId:             uid,
          name:               order.userId.name,
          email:              order.userId.email,
          phone:              order.userId.phone,
          totalOrders:        0,
          totalSpent:         0,
          firstOrder:         order.createdAt,
          lastOrder:          order.createdAt,
          planTypes:          [],
          loyaltyPoints:      0,
          loyaltyLevel:       getUserLevel(0),
          totalSubscriptions: 0
        };
      }
      customerMap[uid].totalOrders++;
      customerMap[uid].totalSpent += order.amount || 0;
      if (new Date(order.createdAt) > new Date(customerMap[uid].lastOrder))
        customerMap[uid].lastOrder = order.createdAt;
      if (order.planType && !customerMap[uid].planTypes.includes(order.planType))
        customerMap[uid].planTypes.push(order.planType);
    });

    const customerIds = Object.keys(customerMap);
    const loyaltyRecords = await LoyaltyPoints.find({ userId: { $in: customerIds } });
    loyaltyRecords.forEach(record => {
      const uid = record.userId.toString();
      if (customerMap[uid]) {
        customerMap[uid].loyaltyPoints      = record.points;
        customerMap[uid].loyaltyLevel       = getUserLevel(record.points);
        customerMap[uid].totalSubscriptions = record.totalSubscriptions;
      }
    });

    const customers = Object.values(customerMap).sort((a, b) => b.totalSpent - a.totalSpent);
    res.json({ totalCustomers: customers.length, customers });
  } catch (error) {
    console.error('getVendorCustomerLoyalty error:', error);
    res.status(500).json({ message: 'Error fetching customer loyalty data', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc  Get vendor's loyalty discount settings
// @route GET /api/vendor/loyalty-settings
// ─────────────────────────────────────────────────────────────────────────────
const getLoyaltySettings = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id })
      .select('loyaltyDiscountsEnabled walletCapPercent');
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    res.json({
      loyaltyDiscountsEnabled: vendor.loyaltyDiscountsEnabled ?? true,
      walletCapPercent:        vendor.walletCapPercent        ?? 20
    });
  } catch (err) {
    console.error('[getLoyaltySettings]', err);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc  Update vendor's loyalty discount settings
// @route PUT /api/vendor/loyalty-settings
// Body: { loyaltyDiscountsEnabled: Boolean, walletCapPercent: Number (1–100) }
// ─────────────────────────────────────────────────────────────────────────────
const updateLoyaltySettings = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id })
      .select('loyaltyDiscountsEnabled walletCapPercent kitchenName _id');
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const { loyaltyDiscountsEnabled, walletCapPercent } = req.body;

    // Read current state BEFORE making any changes (for turningOff detection below)
    const wasEnabled = vendor.loyaltyDiscountsEnabled ?? true;

    // Validate + apply loyaltyDiscountsEnabled FIRST, then compute turningOff
    if (loyaltyDiscountsEnabled !== undefined) {
      if (typeof loyaltyDiscountsEnabled !== 'boolean') {
        return res.status(400).json({ message: 'loyaltyDiscountsEnabled must be a boolean' });
      }
      vendor.loyaltyDiscountsEnabled = loyaltyDiscountsEnabled;
    }

    // Safe to compute now — loyaltyDiscountsEnabled is guaranteed boolean if provided
    const turningOff = loyaltyDiscountsEnabled === false && wasEnabled === true;

    if (walletCapPercent !== undefined) {
      const cap = Number(walletCapPercent);
      if (isNaN(cap) || cap < 1 || cap > 100) {
        return res.status(400).json({ message: 'walletCapPercent must be between 1 and 100' });
      }
      vendor.walletCapPercent = cap;
    }

    await vendor.save();

    // ── Notify affected active subscribers when vendor turns OFF loyalty ─────
    if (turningOff) {
      try {
        const Order  = require('../models/Order');
        const User   = require('../models/User');
        const { sendEmail } = require('../utils/emailUtils');

        // Find all users who currently have an active subscription at this vendor
        const activeOrders = await Order.find({
          vendorId: vendor._id,
          status:   'active'
        }).distinct('userId');

        const affectedUsers = await User.find({
          _id: { $in: activeOrders }
        }).select('name email wallet');

        console.log(`[loyaltySettings] Notifying ${affectedUsers.length} active subscribers that ${vendor.kitchenName} turned off loyalty`);

        // FCM push to all affected users
        const loyaltyUserIds = affectedUsers.map(u => u._id?.toString()).filter(Boolean);
        if (loyaltyUserIds.length > 0) {
          const { notifyAllUsers: _nau } = require('../utils/fcmService');
          _nau(loyaltyUserIds, `Update from ${vendor.kitchenName}`, 'Loyalty wallet discounts are no longer accepted at this kitchen for new orders.', { type: 'loyalty_discount_off', screen: 'subscription' }).catch(console.error);
        }

        for (const u of affectedUsers) {
          if (!u.email) continue;
          try {
            await sendEmail(
              u.email,
              `Update from ${vendor.kitchenName} — Loyalty Wallet Discounts`,
              `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <div style="background:#f97316;padding:20px;text-align:center;border-radius:10px 10px 0 0">
                  <h1 style="color:white;margin:0;font-size:20px">MealSetu Loyalty Update</h1>
                </div>
                <div style="background:white;padding:28px;border-radius:0 0 10px 10px;border:1px solid #e5e7eb">
                  <p>Dear <strong>${u.name}</strong>,</p>
                  <p>We wanted to let you know that <strong>${vendor.kitchenName}</strong> has updated their loyalty discount policy.</p>

                  <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px;border-radius:8px;margin:20px 0">
                    <p style="margin:0;color:#92400e;font-weight:600">ℹ️ Wallet discounts are no longer accepted at ${vendor.kitchenName} for new subscribers.</p>
                  </div>

                  <p><strong>What this means for you (existing subscriber):</strong></p>
                  <ul style="color:#374151;line-height:1.8">
                    <li>✅ Your current subscription continues normally — no changes.</li>
                    <li>✅ As an existing loyal subscriber, you can <strong>still use your wallet credit</strong> when renewing at ${vendor.kitchenName}.</li>
                    ${u.wallet > 0 ? `<li>💰 Your current wallet balance is <strong>₹${u.wallet}</strong>.</li>` : ''}
                    <li>⏸️ Earning new loyalty points is <strong>paused</strong> at ${vendor.kitchenName} while loyalty discounts are off. Your existing points balance is safe and will resume earning when they re-enable loyalty.</li>
                  </ul>

                  <p style="color:#64748b;font-size:13px;margin-top:24px">
                    Thank you for being a loyal MealSetu customer!
                  </p>
                </div>
              </div>`
            );
          } catch (emailErr) {
            console.error(`[loyaltySettings] Email failed for user ${u.email}:`, emailErr.message);
          }
        }
      } catch (notifyErr) {
        // Non-fatal — settings are already saved, just log the error
        console.error('[loyaltySettings] Notification error:', notifyErr.message);
      }
    }

    res.json({
      message:                 'Loyalty settings updated successfully',
      loyaltyDiscountsEnabled: vendor.loyaltyDiscountsEnabled,
      walletCapPercent:        vendor.walletCapPercent,
      notifiedSubscribers:     turningOff ? true : false
    });
  } catch (err) {
    console.error('[updateLoyaltySettings]', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc   Vendor resolves a final-failed delivery — compensate (+1 meal) or no action
// @route  PATCH /api/vendor/delivery/failed/:orderId/resolve
const resolveFailedDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { action }  = req.body; // 'compensated' | 'no_action'

    if (!['compensated', 'no_action'].includes(action)) {
      return res.status(400).json({ message: 'action must be "compensated" or "no_action"' });
    }

    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const order = await Order.findOne({ _id: orderId, vendorId: vendor._id });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.failureResolution?.action) {
      return res.status(400).json({ message: 'This delivery has already been resolved' });
    }

    order.failureResolution = { action, resolvedAt: new Date(), resolvedBy: req.user._id };
    await order.save();

    // Compensate: extend the customer's active subscription by +1 day
    if (action === 'compensated') {
      const sub = await Subscription.findOne({
        userId:   order.userId,
        vendorId: vendor._id,
        status:   { $in: ['active', 'trial'] },
      }).sort({ expiryDate: -1 });

      if (sub) {
        const current = new Date(sub.expiryDate);
        current.setDate(current.getDate() + 1);
        sub.expiryDate = current;
        await sub.save();
      }

      // Notify customer about the free meal
      const { notifyFreeMealAdded } = require('../utils/fcmService');
      notifyFreeMealAdded(order.userId, vendor.kitchenName).catch(console.error);
    }

    return res.json({
      message: action === 'compensated'
        ? '+1 meal added to customer subscription'
        : 'Marked as no compensation — customer was absent',
      action,
    });
  } catch (err) {
    console.error('resolveFailedDelivery:', err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getVendorProfile,
  updateVendorProfile,
  updateVendorProfilePic,
  updateKitchenPoster,
  getVendorMenus,
  addMenu,
  getVendorOrders,
  getFilteredOrders,
  updateOrderStatus,
  getVendorReviews,
  getVendorCustomers,
  getVendorComplaints,
  resolveComplaint,
  getVendorReports,
  getDashboardStats,
  saveWeeklyPlan,
  getWeeklyPlan,
  addManualCustomer,
  getManualCustomers,
  calculateManualOrderAmount,
  getJainMenu,
  saveJainMenu,
  getPricing,       // ✅ FIXED
  savePricing,
  getVendorWeeklyPlan,
  toggleShopStatus,
  getShopStatus,
  updateTrialSettings,
  submitVendorCompliance,
  getCommissionSummary,
  getPendingPayout,
  getMyCommissions,
  getAdminUpiId,
  getCashPayments,
  markCashPaymentPaid,
  createCommissionPaymentOrder,
  verifyCommissionPaymentRazorpay,
  closeKitchenWithClosure,
  reopenKitchen,
  extendAllPlansOnClosure,
  getWeekOrderBreakdown,
  downloadSettlementInvoice,
  raiseCommissionDispute,
  getVendorCustomerLoyalty,
  getLoyaltySettings,
  updateLoyaltySettings,
  resolveFailedDelivery,
};

// ===== RAZORPAY COMMISSION PAYMENT =====

// @desc  Create Razorpay order for vendor commission payment
// @route POST /api/vendor/commission/create-payment-order
async function createCommissionPaymentOrder(req, res) {
  try {
    const razorpay  = require('../utils/razorpayUtils');
    const Commission = require('../models/Commission');

    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const { commissionId } = req.body;
    const commission = await Commission.findOne({ _id: commissionId, vendorId: vendor._id });
    if (!commission) return res.status(404).json({ message: 'Commission not found' });

    if (!commission.weekEnd) {
      console.warn('[payment] Commission missing weekEnd:', commission._id);
    } else if (new Date(commission.weekEnd) >= new Date()) {
      const closesOn = new Date(commission.weekEnd)
        .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      const payFrom = new Date(new Date(commission.weekEnd).getTime() + 86400000)
        .toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
      return res.status(400).json({
        success: false,
        code:    'WEEK_STILL_OPEN',
        message: `This week closes on ${closesOn}. Pay button activates from ${payFrom}.`
      });
    }

    if (!commission.isLocked) {
      return res.status(400).json({
        success: false,
        code:    'NOT_LOCKED',
        message: 'Settlement not yet finalized by the system.'
      });
    }

    if (commission.status === 'paid') {
      return res.status(400).json({
        success: false,
        code:    'ALREADY_PAID',
        message: 'This settlement is already paid.'
      });
    }

    const amountPaise = Math.round(commission.commission_amount * 100);

    const razorpayOrder = await razorpay.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      receipt:  `c_${Date.now()}`,
      notes: {
        vendorId:     vendor._id.toString(),
        commissionId: commissionId,
        type:         'commission_payment',
        expectedAmt:  String(commission.commission_amount)
      }
    });

    // Persist the expected Razorpay amount so verify-payment can cross-check
    await Commission.findByIdAndUpdate(commissionId, {
      $set: { expectedRazorpayAmount: commission.commission_amount }
    });

    res.json({
      orderId:          razorpayOrder.id,
      amount:           razorpayOrder.amount,
      currency:         razorpayOrder.currency,
      keyId:            process.env.RAZORPAY_KEY_ID,
      commissionAmount: commission.commission_amount,
      week:             commission.month
    });
  } catch (error) {
    console.error('Create commission payment order error:', error);
    res.status(500).json({ message: 'Payment initiation failed', error: error.message });
  }
}

// @desc  Verify Razorpay commission payment — auto-confirms, no manual review needed
// @route POST /api/vendor/commission/verify-payment
async function verifyCommissionPaymentRazorpay(req, res) {
  try {
    const crypto            = require('crypto');
    const razorpay          = require('../utils/razorpayUtils');
    const Commission        = require('../models/Commission');
    const CommissionPayment = require('../models/CommissionPayment');

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      commissionId
    } = req.body;

    const body        = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ message: 'Payment verification failed' });
    }

    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    // Read commission before the atomic update — check status, due_date, and verify amount
    const existing = await Commission.findOne(
      { _id: commissionId, vendorId: vendor._id },
      { due_date: 1, status: 1, expectedRazorpayAmount: 1, commission_amount: 1 }
    ).lean();
    if (!existing) return res.status(404).json({ message: 'Commission not found' });

    // Amount verification: if expectedRazorpayAmount was set, the Razorpay order amount must match.
    // Fetch the actual Razorpay order to verify it wasn't tampered.
    if (existing.expectedRazorpayAmount != null) {
      try {
        const rzpOrder = await razorpay.orders.fetch(razorpay_order_id);
        const paidAmt  = Math.round(rzpOrder.amount / 100); // paise → rupees
        if (paidAmt !== existing.expectedRazorpayAmount) {
          console.error(`[verify-commission] Amount mismatch: expected ₹${existing.expectedRazorpayAmount}, got ₹${paidAmt} (orderId: ${razorpay_order_id})`);
          return res.status(400).json({
            success: false,
            code:    'AMOUNT_MISMATCH',
            message: `Payment amount ₹${paidAmt} does not match expected ₹${existing.expectedRazorpayAmount}. Please contact support.`
          });
        }
      } catch (fetchErr) {
        // If Razorpay order fetch fails, log and continue (don't block legitimate payments)
        console.error('[verify-commission] Could not fetch Razorpay order for amount check:', fetchErr.message);
      }
    }

    const paymentTime  = new Date();
    const isPaidOnTime = paymentTime <= new Date(existing.due_date);

    // Atomic guard — if two requests race, only the first wins; second gets null
    const commission = await Commission.findOneAndUpdate(
      { _id: commissionId, vendorId: vendor._id, status: { $ne: 'paid' } },
      {
        $set: {
          status:            'paid',
          payment_date:      paymentTime,
          paidOnTime:        isPaidOnTime,
          paymentReference:  razorpay_payment_id,
          admin_verified_at: paymentTime,
          rejectionReason:   null
        },
        $push: {
          auditLog: {
            action:      'paid',
            performedBy: 'vendor',
            at:          paymentTime,
            note:        `Paid via Razorpay. On time: ${isPaidOnTime}`,
            valueBefore: { status: existing.status },
            valueAfter:  { status: 'paid', paymentReference: razorpay_payment_id }
          }
        }
      },
      { new: true }
    );
    if (!commission) {
      return res.status(409).json({ success: false, message: 'Settlement already paid.' });
    }

    await CommissionPayment.create({
      vendorEarningId:   commission._id,
      vendorId:          vendor._id,
      amountPaid:        commission.commission_amount,
      paymentMethod:     'upi',
      utrNumber:         razorpay_payment_id,
      razorpayOrderId:   razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      paidAt:            paymentTime,
      status:            'confirmed',
      verifiedAt:        paymentTime
    });

    // Auto-record commission as an expense entry
    try {
      const Expense = require('../models/Expense');
      const weekLabel = commission.weekStart && commission.weekEnd
        ? `${new Date(commission.weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(commission.weekEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : (commission.week || commission.month || 'this week');
      const toMonthStr = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
      };
      await Expense.create({
        vendorId:       vendor._id,
        amount:         commission.commission_amount,
        category:       'Platform Commission',
        customCategory: '',
        description:    `MealSetu platform commission — ${weekLabel}`,
        date:           paymentTime,
        month:          toMonthStr(paymentTime),
      });
    } catch (expErr) {
      console.error('[auto-expense] Failed to record commission expense:', expErr.message);
    }

    try {
      const vendorWithOwner = await Vendor.findById(vendor._id).populate('ownerId', 'email name');
      if (vendorWithOwner?.ownerId?.email) {
        await sendEmail(
          vendorWithOwner.ownerId.email,
          'MealSetu — Commission Payment Confirmed',
          `<div style="font-family:Arial,sans-serif;max-width:600px">
            <h2 style="color:#16a34a">Commission Payment Received</h2>
            <p>Dear ${vendorWithOwner.ownerId.name},</p>
            <div style="background:#f0fdf4;padding:20px;border-radius:10px;margin:16px 0">
              <p><strong>Week:</strong> ${commission.weekStart && commission.weekEnd
                ? `${new Date(commission.weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(commission.weekEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : commission.month}</p>
              <p><strong>Amount Paid:</strong> ₹${commission.commission_amount}</p>
              <p><strong>Transaction ID:</strong> ${razorpay_payment_id}</p>
              <p><strong>Status:</strong> Confirmed ✓</p>
            </div>
            <p>Thank you for your payment!</p>
          </div>`
        );
      }
    } catch (emailErr) {
      console.error('Email failed:', emailErr.message);
    }

    if (vendor?.ownerId) {
      const { notifyCommissionPaid } = require('../utils/fcmService');
      const wLabel = commission.weekStart && commission.weekEnd
        ? `${new Date(commission.weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(commission.weekEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : commission.month || 'this period';
      notifyCommissionPaid(vendor.ownerId, wLabel, commission.commission_amount).catch(console.error);
    }

    res.json({
      success:       true,
      message:       'Commission payment successful!',
      transactionId: razorpay_payment_id
    });
  } catch (error) {
    console.error('Verify commission payment error:', error);
    res.status(500).json({ message: 'Payment verification failed', error: error.message });
  }
}

// @desc  Vendor raises dispute on a settlement
// @route POST /api/vendor/commission/:commissionId/dispute
async function raiseCommissionDispute(req, res) {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const { commissionId } = req.params;
    const { note }         = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ message: 'Dispute note is required' });
    }

    const commission = await Commission.findOne({ _id: commissionId, vendorId: vendor._id });
    if (!commission) return res.status(404).json({ message: 'Settlement not found' });
    if (commission.status === 'paid') {
      return res.status(400).json({ message: 'Cannot dispute a paid settlement' });
    }
    if (commission.disputeStatus === 'raised') {
      return res.status(400).json({ message: 'Dispute already raised for this settlement' });
    }

    commission.disputeStatus   = 'raised';
    commission.disputeNote     = note.trim();
    commission.disputeRaisedAt = new Date();
    if (!commission.auditLog) commission.auditLog = [];
    commission.auditLog.push({
      action:      'disputed',
      performedBy: `vendor:${vendor._id}`,
      at:          new Date(),
      note:        `Vendor raised dispute: ${note.trim()}`,
      valueBefore: { disputeStatus: null },
      valueAfter:  { disputeStatus: 'raised' }
    });

    await commission.save();
    return res.json({ success: true, message: 'Dispute raised successfully' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

// @desc  Order breakdown for a specific commission week
// @route GET /api/vendor/commission/week-orders
async function getWeekOrderBreakdown(req, res) {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const { weekStart, weekEnd } = req.query;
    if (!weekStart || !weekEnd) {
      return res.status(400).json({ message: 'weekStart and weekEnd are required' });
    }

    const start = new Date(weekStart);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(weekEnd);
    end.setUTCHours(23, 59, 59, 999);

    const orders = await Order.find({
      vendorId:      vendor._id,
      status:        { $nin: ['cancelled', 'on-hold'] },
      paymentStatus: 'Paid',
      createdAt:     { $gte: start, $lte: end }
    })
      .populate('userId', 'name phone')
      .sort({ createdAt: 1 })
      .lean();

    const commission = await Commission.findOne({
      vendorId: vendor._id,
      weekStart: { $gte: start },
      weekEnd:   { $lte: end }
    }).lean();

    const commissionRate       = commission?.commission_rate || 5;
    const grossEarnings        = orders.reduce((sum, o) => sum + (o.amount || 0), 0);
    const totalWalletDeductions = orders.reduce((sum, o) => sum + (o.walletDeduction || 0), 0);
    // Commission base = gross - wallet deductions (vendor already received less cash)
    const commissionBase       = grossEarnings - totalWalletDeductions;
    const commissionAmt        = commission?.commission_amount ||
                                 Math.round(commissionBase * commissionRate / 100);
    const netEarnings          = commissionBase - commissionAmt;

    const orderBreakdown = orders.map(order => {
      const gross     = order.amount || 0;
      const wallet    = order.walletDeduction || 0;
      const base      = gross - wallet;
      const commCut   = Math.round(base * commissionRate / 100);
      return {
        orderId:          order._id,
        orderDate:        order.createdAt,
        customerName:     order.userId?.name || 'Customer',
        customerPhone:    order.userId?.phone || '',
        planType:         order.planType,
        grossAmount:      gross,
        walletDeduction:  wallet,
        commissionBase:   base,
        commissionRate,
        commissionCut:    commCut,
        netAmount:        base - commCut,
        paymentMethod:    order.paymentMethod,
        paymentStatus:    order.paymentStatus
      };
    });

    return res.json({
      success:               true,
      weekStart:             start,
      weekEnd:               end,
      weekKey:               commission?.week || '',
      totalOrders:           orders.length,
      grossEarnings,
      totalWalletDeductions,
      commissionBase,
      commissionRate,
      commissionAmount:      commissionAmt,
      netEarnings,
      commissionStatus:      commission?.status || 'pending',
      dueDate:               commission?.due_date || null,
      settlementId:          commission?._id || null,
      orders:                orderBreakdown
    });
  } catch (err) {
    console.error('[getWeekOrderBreakdown]', err);
    return res.status(500).json({ message: err.message });
  }
}

// @desc  Download PDF settlement invoice for a commission week
// @route GET /api/vendor/commission/invoice/:commissionId
async function downloadSettlementInvoice(req, res) {
  try {
    const { generateSettlementInvoicePDF } = require('../utils/invoicePdfGenerator');
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const { commissionId } = req.params;
    const commission = await Commission.findOne({ _id: commissionId, vendorId: vendor._id }).lean();
    if (!commission) return res.status(404).json({ message: 'Settlement not found' });

    const start = new Date(commission.weekStart);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(commission.weekEnd);
    end.setUTCHours(23, 59, 59, 999);

    const orders = await Order.find({
      vendorId:      vendor._id,
      status:        { $nin: ['cancelled', 'on-hold'] },
      paymentStatus: 'Paid',
      createdAt:     { $gte: start, $lte: end }
    })
      .populate('userId', 'name')
      .lean();

    const commissionRate = commission.commission_rate || 5;
    const orderBreakdown = orders.map(o => ({
      orderDate:     o.createdAt,
      customerName:  o.userId?.name || 'Customer',
      planType:      o.planType,
      grossAmount:   o.amount || 0,
      commissionCut: Math.round((o.amount || 0) * commissionRate / 100),
      netAmount:     (o.amount || 0) - Math.round((o.amount || 0) * commissionRate / 100)
    }));

    generateSettlementInvoicePDF(res, {
      settlementId:     commission._id,
      vendorName:       vendor.kitchenName,
      vendorAddress:    vendor.address,
      weekStart:        commission.weekStart,
      weekEnd:          commission.weekEnd,
      orders:           orderBreakdown,
      grossEarnings:    commission.total_earning,
      commissionRate,
      commissionAmount: commission.commission_amount,
      netEarnings:      commission.total_earning - commission.commission_amount,
      commissionStatus: commission.status,
      dueDate:          commission.due_date,
      generatedAt:      new Date()
    });
  } catch (err) {
    console.error('[downloadSettlementInvoice]', err);
    return res.status(500).json({ message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc   Subscription Analytics — subscriber behaviour & growth trends
// @route  GET /api/vendor/subscription-analytics
// @access Vendor (protected)
// ─────────────────────────────────────────────────────────────────────────────
const getSubscriptionAnalytics = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found' });
    const vendorId = vendor._id;
    const now      = new Date();

    // ── Date ranges ────────────────────────────────────────────────────────
    const last30Days = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const last90Days = new Date(now - 90 * 24 * 60 * 60 * 1000); // eslint-disable-line no-unused-vars

    // ── All orders for this vendor ─────────────────────────────────────────
    const allOrders = await Order.find({ vendorId })
      .populate('userId', 'name email phone')
      .sort({ orderDate: -1 });

    // ── 1. Status breakdown ────────────────────────────────────────────────
    const activeOrders    = allOrders.filter(o =>
      o.status === 'active' && new Date(o.endDate) >= now);
    const pendingOrders   = allOrders.filter(o => o.status === 'pending');
    const completedOrders = allOrders.filter(o =>
      o.status === 'completed' ||
      (o.status === 'active' && new Date(o.endDate) < now));
    const trialOrders     = allOrders.filter(o => o.planType === 'Trial');

    // Unique subscribers = users who have a currently running plan
    // OR an upcoming pending plan (they already committed, they ARE subscribers)
    const activeSubscriberIds = new Set([
      ...activeOrders.map(o => o.userId?._id?.toString()).filter(Boolean),
      ...pendingOrders.map(o => o.userId?._id?.toString()).filter(Boolean),
    ]);

    // ── 2. Churn rate ──────────────────────────────────────────────────────
    const endedLast30 = allOrders.filter(o => {
      const ended = new Date(o.endDate);
      return ended >= last30Days && ended < now && o.status !== 'active';
    });
    const churnedUsers = [];
    for (const order of endedLast30) {
      const uid = order.userId?._id?.toString();
      const hasNewOrder = allOrders.some(o =>
        o.userId?._id?.toString() === uid &&
        (o.status === 'active' || o.status === 'pending') &&
        new Date(o.orderDate) > new Date(order.endDate)
      );
      if (!hasNewOrder) churnedUsers.push(order);
    }
    const churnRate   = endedLast30.length > 0
      ? Math.round((churnedUsers.length / endedLast30.length) * 100) : 0;

    // ── 3. Renewal rate ────────────────────────────────────────────────────
    const renewedUsers  = endedLast30.length - churnedUsers.length;
    const renewalRate   = endedLast30.length > 0
      ? Math.round((renewedUsers / endedLast30.length) * 100) : 0;

    // ── 4. Plan popularity ─────────────────────────────────────────────────
    const planCounts  = { Trial: 0, Weekly: 0, Monthly: 0 };
    const planRevenue = { Trial: 0, Weekly: 0, Monthly: 0 };
    allOrders.forEach(o => {
      if (planCounts[o.planType] !== undefined) {
        planCounts[o.planType]++;
        planRevenue[o.planType] += o.amount || 0;
      }
    });
    const totalOrders     = allOrders.length;
    const mostPopularPlan = Object.entries(planCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Weekly';

    // ── 5. Weekly trend (last 8 weeks) ─────────────────────────────────────
    const weeklyTrend = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (i * 7) - 7);
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() - (i * 7));

      const weekOrders = allOrders.filter(o => {
        const d = new Date(o.orderDate || o.startDate);
        return d >= weekStart && d < weekEnd;
      });
      weeklyTrend.push({
        week:             `Week ${8 - i}`,
        weekLabel:        weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        newSubscriptions: weekOrders.length,
        revenue:          weekOrders.reduce((s, o) => s + (o.amount || 0), 0),
      });
    }

    // ── 6. Monthly trend (last 6 months) ───────────────────────────────────
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart     = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() - i + 1, 1); // exclusive upper bound

      const monthOrders = allOrders.filter(o => {
        const d = new Date(o.orderDate || o.startDate);
        return d >= monthStart && d < nextMonthStart;
      });
      monthlyTrend.push({
        month:              monthStart.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
        newSubscriptions:   monthOrders.length,
        revenue:            monthOrders.reduce((s, o) => s + (o.amount || 0), 0),
        activeAtEndOfMonth: monthOrders.filter(o => new Date(o.endDate) >= nextMonthStart).length,
      });
    }

    // ── 7. Expiring soon (next 7 days) — only users with NO upcoming plan ──
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const expiringSoon = activeOrders
      .filter(o => {
        // Must expire within next 7 days
        if (new Date(o.endDate) > next7Days) return false;

        // Exclude if this user already has another active or pending order
        // that starts after this order's end date (i.e. they already renewed)
        const uid = o.userId?._id?.toString();
        const hasUpcoming = allOrders.some(other =>
          other._id.toString() !== o._id.toString() &&
          other.userId?._id?.toString() === uid &&
          (other.status === 'active' || other.status === 'pending') &&
          new Date(other.startDate || other.createdAt) >= new Date(o.endDate)
        );
        return !hasUpcoming;
      })
      .map(o => ({
        customerName:  o.userId?.name,
        customerPhone: o.userId?.phone,
        customerEmail: o.userId?.email,
        planType:      o.planType,
        expiryDate:    o.endDate,
        daysLeft:      Math.ceil((new Date(o.endDate) - now) / (1000 * 60 * 60 * 24)),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft);

    // ── 8. Payment method breakdown ────────────────────────────────────────
    const paymentBreakdown = {};
    allOrders.forEach(o => {
      const method = o.paymentMethod || 'Cash';
      paymentBreakdown[method] = (paymentBreakdown[method] || 0) + 1;
    });

    // ── 9. Trial conversion rate ───────────────────────────────────────────
    const trialUserIds = [...new Set(
      trialOrders.map(o => o.userId?._id?.toString()).filter(Boolean)
    )];
    let convertedFromTrial = 0;
    for (const uid of trialUserIds) {
      const trialDate = trialOrders.find(t =>
        t.userId?._id?.toString() === uid)?.createdAt || 0;
      const hasPaidPlan = allOrders.some(o =>
        o.userId?._id?.toString() === uid &&
        o.planType !== 'Trial' &&
        new Date(o.orderDate || o.startDate) > new Date(trialDate)
      );
      if (hasPaidPlan) convertedFromTrial++;
    }
    const trialConversionRate = trialUserIds.length > 0
      ? Math.round((convertedFromTrial / trialUserIds.length) * 100) : 0;

    // ── Response ───────────────────────────────────────────────────────────
    res.json({
      summary: {
        totalSubscriptions: allOrders.length,
        activeNow:          activeSubscriberIds.size,
        pendingUpcoming:    pendingOrders.length,
        completedTotal:     completedOrders.length,
        totalTrials:        trialOrders.length,
        churnRate,
        renewalRate,
        mostPopularPlan,
        trialConversionRate,
      },
      planBreakdown: {
        Trial: {
          count:      planCounts.Trial,
          revenue:    planRevenue.Trial,
          percentage: totalOrders > 0 ? Math.round((planCounts.Trial / totalOrders) * 100) : 0,
        },
        Weekly: {
          count:      planCounts.Weekly,
          revenue:    planRevenue.Weekly,
          percentage: totalOrders > 0 ? Math.round((planCounts.Weekly / totalOrders) * 100) : 0,
        },
        Monthly: {
          count:      planCounts.Monthly,
          revenue:    planRevenue.Monthly,
          percentage: totalOrders > 0 ? Math.round((planCounts.Monthly / totalOrders) * 100) : 0,
        },
      },
      weeklyTrend,
      monthlyTrend,
      expiringSoon,
      paymentBreakdown,
      trialConversion: {
        totalTrialUsers: trialUserIds.length,
        converted:       convertedFromTrial,
        notConverted:    trialUserIds.length - convertedFromTrial,
        conversionRate:  trialConversionRate,
      },
    });
  } catch (err) {
    console.error('[getSubscriptionAnalytics]', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

// Export after definition (functions are consts declared after module.exports)
module.exports.getSubscriptionAnalytics = getSubscriptionAnalytics;
module.exports.getCustomerPlans = getCustomerPlans;
