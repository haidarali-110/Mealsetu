const bcrypt          = require('bcryptjs');
const jwt             = require('jsonwebtoken');
const User            = require('../models/User');
const DeliveryPartner = require('../models/DeliveryPartner');
const DeliveryBatch   = require('../models/DeliveryBatch');
const Order           = require('../models/Order');
const Vendor          = require('../models/Vendor');

// ══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════════════

// Haversine distance in km
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Nearest-neighbor route optimization starting from vendorLat/vendorLng
const optimizeRoute = (vendorLat, vendorLng, stops) => {
  if (!stops.length) return [];
  const unvisited = [...stops];
  const route     = [];
  let curLat = vendorLat;
  let curLng = vendorLng;

  while (unvisited.length) {
    let nearestIdx  = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const { lat, lng } = unvisited[i];
      if (lat == null || lng == null) { nearestIdx = i; break; }
      const d = calculateDistance(curLat, curLng, lat, lng);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    const next = unvisited.splice(nearestIdx, 1)[0];
    route.push(next);
    curLat = next.lat ?? curLat;
    curLng = next.lng ?? curLng;
  }
  return route;
};

// Returns a display string for either old (string) or new (object) address
const getAddressString = (addr) => {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  return addr.fullAddress ||
    [addr.flatHouseNo, addr.street, addr.area, addr.city, addr.pincode]
      .filter(Boolean).join(', ');
};

const getStatusMessage = (status) => {
  const map = {
    assigned:      'Delivery partner assigned to your order',
    preparing:     'Your meal is being prepared 👨‍🍳',
    picked_up:     'Meal picked up! On the way 🛵',
    on_the_way:    'Almost there! Delivery in progress 🛵',
    delivered:     'Delivered! Enjoy your meal 🎉',
    failed:        'Delivery failed. Contact support',
    retry_pending: 'Delivery failed — re-attempt scheduled'
  };
  return map[status] || 'Order status updated';
};

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

// @desc   Create delivery partner (admin)
// @route  POST /api/admin/delivery-partners
const createDeliveryPartner = async (req, res) => {
  try {
    const { name, phone, email, password, vendorId } = req.body;
    if (!name || !email || !password || !vendorId) {
      return res.status(400).json({ message: 'name, email, password and vendorId are required' });
    }
    if (await User.findOne({ email })) {
      return res.status(400).json({ message: 'A user with this email already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const user    = await User.create({ name, email, phone: phone || '', password: hashedPassword, role: 'delivery', isVerified: true });
    const partner = await DeliveryPartner.create({ userId: user._id, vendorId, name, phone, email });
    return res.status(201).json({
      message: 'Delivery partner created successfully',
      partner: { _id: partner._id, userId: user._id, name, phone, email, vendorId, isActive: partner.isActive }
    });
  } catch (err) {
    console.error('createDeliveryPartner:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   List all delivery partners (admin)
// @route  GET /api/admin/delivery-partners
const getDeliveryPartners = async (req, res) => {
  try {
    const partners = await DeliveryPartner.find()
      .populate('userId',   'name email phone isActive')
      .populate('vendorId', 'kitchenName')
      .sort({ joinedAt: -1 });
    return res.json(partners);
  } catch (err) {
    console.error('getDeliveryPartners:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Toggle partner active status (admin)
// @route  PATCH /api/admin/delivery-partners/:id/toggle
const togglePartnerStatus = async (req, res) => {
  try {
    const partner = await DeliveryPartner.findById(req.params.id);
    if (!partner) return res.status(404).json({ message: 'Delivery partner not found' });
    partner.isActive = !partner.isActive;
    await partner.save();
    return res.json({ message: `Partner ${partner.isActive ? 'activated' : 'deactivated'}`, isActive: partner.isActive });
  } catch (err) {
    console.error('togglePartnerStatus:', err);
    return res.status(500).json({ message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  VENDOR FUNCTIONS — Delivery Setup
// ══════════════════════════════════════════════════════════════════════════════

// @desc   Enable or disable delivery for the vendor
// @route  PATCH /api/vendor/delivery/toggle
const toggleVendorDelivery = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    vendor.deliveryEnabled = !vendor.deliveryEnabled;
    await vendor.save();
    return res.json({ deliveryEnabled: vendor.deliveryEnabled });
  } catch (err) {
    console.error('toggleVendorDelivery:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Update delivery timing / grouping settings
// @route  PUT /api/vendor/delivery/settings
const updateDeliverySettings = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const { autoGroupByArea, lunchDeliveryTime, dinnerDeliveryTime, maxDeliveriesPerBatch, deliveryRadius } = req.body;
    vendor.deliverySettings = {
      ...(vendor.deliverySettings || {}),
      ...(autoGroupByArea      !== undefined && { autoGroupByArea }),
      ...(lunchDeliveryTime               && { lunchDeliveryTime }),
      ...(dinnerDeliveryTime              && { dinnerDeliveryTime }),
      ...(maxDeliveriesPerBatch           && { maxDeliveriesPerBatch }),
      ...(deliveryRadius                  && { deliveryRadius })
    };
    await vendor.save();
    return res.json({ deliverySettings: vendor.deliverySettings });
  } catch (err) {
    console.error('updateDeliverySettings:', err);
    return res.status(500).json({ message: err.message });
  }
};

// ── VENDOR FUNCTIONS — Rider Management ───────────────────────────────────

// @desc   Add a new rider to vendor's team
// @route  POST /api/vendor/delivery/riders
const addRider = async (req, res) => {
  try {
    const { name, phone, email, password, monthlySalary, serviceAreas, servicePincodes } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    if (await User.findOne({ email })) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const user    = await User.create({ name, email, phone: phone || '', password: hashedPassword, role: 'delivery', isVerified: true });
    const partner = await DeliveryPartner.create({
      userId:       user._id,
      vendorId:     vendor._id,
      name, phone, email,
      monthlySalary:  monthlySalary || 0,
      serviceArea: {
        areas:    serviceAreas    || [],
        pincodes: servicePincodes || []
      }
    });
    return res.status(201).json({
      message: 'Rider added successfully',
      rider: {
        _id: partner._id, name, phone, email,
        monthlySalary: partner.monthlySalary,
        serviceArea:   partner.serviceArea,
        isActive:      partner.isActive
      }
    });
  } catch (err) {
    console.error('addRider:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Get all riders for vendor
// @route  GET /api/vendor/delivery/riders
const getVendorRiders = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const riders = await DeliveryPartner.find({ vendorId: vendor._id })
      .populate('userId', 'name email phone isActive');
    return res.json(riders);
  } catch (err) {
    console.error('getVendorRiders:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Update rider info, salary, or service area
// @route  PUT /api/vendor/delivery/riders/:riderId
const updateRider = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const rider = await DeliveryPartner.findOne({ _id: req.params.riderId, vendorId: vendor._id });
    if (!rider) return res.status(404).json({ message: 'Rider not found' });
    const { name, phone, monthlySalary, upiId, serviceAreas, servicePincodes, isActive, newPassword } = req.body;
    if (name          !== undefined) rider.name          = name;
    if (phone         !== undefined) rider.phone         = phone;
    if (monthlySalary !== undefined) rider.monthlySalary = monthlySalary;
    if (upiId         !== undefined) rider.upiId         = upiId;
    if (isActive      !== undefined) rider.isActive      = isActive;
    if (serviceAreas  !== undefined || servicePincodes !== undefined) {
      rider.serviceArea = {
        areas:    serviceAreas    ?? rider.serviceArea?.areas    ?? [],
        pincodes: servicePincodes ?? rider.serviceArea?.pincodes ?? []
      };
    }
    await rider.save();

    // Update password on the linked User document if vendor provided a new one
    if (newPassword && newPassword.trim().length >= 6) {
      const hashed = await bcrypt.hash(newPassword.trim(), await bcrypt.genSalt(10));
      await User.findByIdAndUpdate(rider.userId, { password: hashed });
    }

    return res.json({ message: 'Rider updated', rider });
  } catch (err) {
    console.error('updateRider:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Deactivate a rider
// @route  DELETE /api/vendor/delivery/riders/:riderId
const deleteRider = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const rider = await DeliveryPartner.findOne({ _id: req.params.riderId, vendorId: vendor._id });
    if (!rider) return res.status(404).json({ message: 'Rider not found' });
    rider.isActive = false;
    await rider.save();
    return res.json({ message: 'Rider deactivated' });
  } catch (err) {
    console.error('deleteRider:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Create Razorpay order for rider salary payment
// @route  POST /api/vendor/delivery/riders/:riderId/salary/razorpay-order
const createSalaryRazorpayOrder = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const rider = await DeliveryPartner.findOne({ _id: req.params.riderId, vendorId: vendor._id });
    if (!rider)  return res.status(404).json({ message: 'Rider not found' });

    const { month, amount } = req.body;
    if (!month)  return res.status(400).json({ message: 'month (YYYY-MM) is required' });
    if (rider.salaryPaidDates.some(s => s.month === month)) {
      return res.status(400).json({ message: `Salary for ${month} already marked as paid` });
    }

    const salaryAmount = Number(amount) || rider.monthlySalary;
    const razorpay = require('../utils/razorpayUtils');
    const order = await razorpay.orders.create({
      amount:   Math.round(salaryAmount * 100), // paise
      currency: 'INR',
      receipt:  `salary_${rider._id}_${month}`,
      notes:    { riderId: rider._id.toString(), month, vendorId: vendor._id.toString() }
    });

    return res.json({
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    process.env.RAZORPAY_KEY_ID,
      riderName: rider.name,
    });
  } catch (err) {
    console.error('createSalaryRazorpayOrder:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Verify Razorpay payment and mark salary paid
// @route  POST /api/vendor/delivery/riders/:riderId/salary/razorpay-verify
const verifySalaryRazorpayPayment = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const rider = await DeliveryPartner.findOne({ _id: req.params.riderId, vendorId: vendor._id });
    if (!rider)  return res.status(404).json({ message: 'Rider not found' });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, month, amount } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Missing Razorpay payment details' });
    }

    // Verify signature
    const crypto = require('crypto');
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    if (expected !== razorpay_signature) {
      return res.status(400).json({ message: 'Payment verification failed — invalid signature' });
    }

    if (rider.salaryPaidDates.some(s => s.month === month)) {
      return res.status(400).json({ message: `Salary for ${month} already marked as paid` });
    }

    const salaryAmount = Number(amount) / 100; // convert paise to rupees
    rider.salaryPaidDates.push({
      month,
      amount:         salaryAmount,
      paymentMethod:  'Razorpay',
      transactionRef: razorpay_payment_id,
      paidBy:         req.user._id,
    });
    await rider.save();
    await Vendor.findByIdAndUpdate(vendor._id, { $inc: { monthlyDeliveryExpenses: salaryAmount } });

    // Real-time socket + push notification to rider
    const io = global.io;
    if (io && rider.userId) {
      io.to(`delivery_${rider.userId}`).emit('salary_paid', {
        amount: salaryAmount, month, paymentMethod: 'Razorpay',
      });
    }
    const { notifyRiderSalaryPaid } = require('../utils/fcmService');
    if (rider.userId) notifyRiderSalaryPaid(rider.userId, salaryAmount, month, 'Razorpay').catch(console.error);

    return res.json({ message: 'Salary paid via Razorpay', month, amount: salaryAmount, paymentId: razorpay_payment_id });
  } catch (err) {
    console.error('verifySalaryRazorpayPayment:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Record monthly salary payment for a rider
// @route  POST /api/vendor/delivery/riders/:riderId/salary
const markSalaryPaid = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const rider = await DeliveryPartner.findOne({ _id: req.params.riderId, vendorId: vendor._id });
    if (!rider) return res.status(404).json({ message: 'Rider not found' });
    const { month, amount, paymentMethod, transactionRef } = req.body;
    if (!month) return res.status(400).json({ message: 'month (YYYY-MM) is required' });
    if (rider.salaryPaidDates.some(s => s.month === month)) {
      return res.status(400).json({ message: `Salary for ${month} already marked as paid` });
    }
    if (paymentMethod === 'UPI' && !transactionRef?.trim()) {
      return res.status(400).json({ message: 'UPI transaction ID is required for UPI payment' });
    }
    const salaryAmount = amount ?? rider.monthlySalary;
    rider.salaryPaidDates.push({
      month,
      amount:        salaryAmount,
      paymentMethod: paymentMethod || 'Cash',
      transactionRef: transactionRef?.trim() || '',
      paidBy:        req.user._id,
    });
    await rider.save();
    await Vendor.findByIdAndUpdate(vendor._id, { $inc: { monthlyDeliveryExpenses: salaryAmount } });

    // Real-time socket + push notification to rider
    const io = global.io;
    if (io && rider.userId) {
      io.to(`delivery_${rider.userId}`).emit('salary_paid', {
        amount: salaryAmount, month, paymentMethod: paymentMethod || 'Cash',
      });
    }
    const { notifyRiderSalaryPaid } = require('../utils/fcmService');
    if (rider.userId) notifyRiderSalaryPaid(rider.userId, salaryAmount, month, paymentMethod || 'Cash').catch(console.error);

    return res.json({ message: 'Salary marked as paid', month, amount: salaryAmount, paymentMethod: paymentMethod || 'Cash' });
  } catch (err) {
    console.error('markSalaryPaid:', err);
    return res.status(500).json({ message: err.message });
  }
};

// ── VENDOR FUNCTIONS — Batch Management ──────────────────────────────────

// @desc   Auto-group today's orders into delivery batches by area
// @route  POST /api/vendor/delivery/batches/create
const createDeliveryBatches = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    // Accept both `batchDate` (preferred) and `date` (legacy frontend key)
    const { batchDate, date: legacyDate, mealSlot } = req.body;
    if (!mealSlot || !['lunch', 'dinner'].includes(mealSlot)) {
      return res.status(400).json({ message: 'mealSlot must be "lunch" or "dinner"' });
    }

    const dateStr  = batchDate || legacyDate || null;
    const date     = dateStr ? new Date(dateStr) : new Date();
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);

    console.log(`[createBatch] vendor=${vendor._id} mealSlot=${mealSlot} dayStart=${dayStart.toISOString()} dayEnd=${dayEnd.toISOString()}`);

    // Find order IDs already batched for THIS mealSlot today.
    // Using the batch's own orders array as source of truth so lunch batches
    // do NOT block orders from being included in dinner batches and vice versa.
    const sameMealBatches = await DeliveryBatch.find(
      { vendorId: vendor._id, batchDate: { $gte: dayStart, $lte: dayEnd }, mealSlot },
      'orders.orderId'
    );
    const alreadyBatchedOrderIds = sameMealBatches.flatMap(b => b.orders.map(o => o.orderId));
    console.log(`[createBatch] existing ${mealSlot} batches today: ${sameMealBatches.length}, already-batched order IDs: ${alreadyBatchedOrderIds.length}`);

    // Include all active/trial orders for the day that are NOT yet in a
    // same-mealSlot batch. Recurring subscriptions appear every day —
    // they may already have a lunch batch but must still enter a dinner batch.
    // NOTE: startDate may be null on older orders — include those too so they
    // are not silently dropped.
    const orders = await Order.find({
      vendorId: vendor._id,
      status:   { $in: ['active', 'trial'] },
      $and: [
        {
          $or: [
            { startDate: null },
            { startDate: { $exists: false } },
            { startDate: { $lte: dayEnd } },
          ]
        },
        {
          $or: [
            { endDate: { $gte: dayStart } },
            { endDate: null },
            { endDate: { $exists: false } },
          ]
        },
        { _id: { $nin: alreadyBatchedOrderIds } },
      ]
    }).populate('userId', 'name phone address pincode');

    console.log(`[createBatch] orders found (pre-filter): ${orders.length}`);
    orders.forEach(o => {
      console.log(`  order ${o._id}: status=${o.status} startDate=${o.startDate} endDate=${o.endDate} firstDayMealSlot=${o.firstDayMealSlot} source=${o.source}`);
    });

    // Apply first-day and last-day meal slot rules.
    //
    // firstDayMealSlot (start date):
    //   'both'   → include in both lunch and dinner batches
    //   'dinner' → skip lunch batch on day 1, include in dinner batch only
    //   'none'   → skip all batches today (plan starts tomorrow)
    //
    // lastDayMealSlot (end date / last meal day):
    //   'both'   → normal last day — include in both lunch and dinner batches
    //   'lunch'  → compensation day — include in lunch batch ONLY
    //              (used when firstDayMealSlot='dinner': missed lunch on day 1
    //               is compensated by giving only lunch on the final day)
    const filteredOrders = orders.filter(order => {
      // ── First-day check ──────────────────────────────────────────────────
      if (order.startDate) {
        const orderStart = new Date(order.startDate);
        const isFirstDay = orderStart >= dayStart && orderStart <= dayEnd;
        if (isFirstDay) {
          const slot = order.firstDayMealSlot || 'both';
          // 'none' was a legacy mis-stored value — treat as 'both' (startDate is
          // already set to the actual first delivery day, so both meals apply)
          if (slot === 'dinner') return mealSlot === 'dinner';
          // 'both' / 'none' (legacy) → fall through to last-day check
        }
      }

      // ── Last-day check ───────────────────────────────────────────────────
      if (order.endDate) {
        const orderEnd  = new Date(order.endDate);
        const isLastDay = orderEnd >= dayStart && orderEnd <= dayEnd;
        if (isLastDay) {
          const lastSlot = order.lastDayMealSlot || 'both';
          if (lastSlot === 'lunch') return mealSlot === 'lunch'; // skip dinner
          // 'both' → include in both batches
        }
      }

      return true;
    });

    console.log(`[createBatch] orders after meal-slot filter: ${filteredOrders.length}`);
    if (filteredOrders.length !== orders.length) {
      const filteredIds = new Set(filteredOrders.map(o => String(o._id)));
      const skipped = orders.filter(o => !filteredIds.has(String(o._id)));
      skipped.forEach(o => console.log(`  SKIPPED: order ${o._id} firstDayMealSlot=${o.firstDayMealSlot} lastDayMealSlot=${o.lastDayMealSlot} startDate=${o.startDate} endDate=${o.endDate}`));
    }

    if (!filteredOrders.length) {
      return res.json({ message: 'No unbatched orders found for this date/slot', batches: [], debug: { dayStart, dayEnd, mealSlot, ordersBeforeFilter: orders.length } });
    }

    const riders = await DeliveryPartner.find({ vendorId: vendor._id, isActive: true, isAvailable: true });
    console.log(`[createBatch] available riders: ${riders.length}`);

    // GPS-based clustering (2 km radius) with pincode fallback
    // Orders with valid GPS are clustered spatially; those without GPS fall back
    // to pincode/area text grouping. GPS clusters absorb nearby pincode orders.
    const GPS_CLUSTER_RADIUS_KM = 2.0;

    const allStops = filteredOrders.map(order => {
      const user = order.userId;
      let area    = 'unknown';
      let pincode = 'unknown';
      let lat     = null;
      let lng     = null;

      // Resolve address: prefer structured user.address, fall back to manualCustomerAddress, then pincode
      const resolvedAddr =
        (typeof user?.address === 'object' && user?.address?.area) ? user.address :
        (order.manualCustomerAddress && typeof order.manualCustomerAddress === 'object' && order.manualCustomerAddress.area) ? order.manualCustomerAddress :
        null;

      if (resolvedAddr) {
        area    = resolvedAddr.area    || resolvedAddr.city || 'unknown';
        pincode = resolvedAddr.pincode || user?.pincode     || order.manualCustomerPincode || 'unknown';
        lat     = typeof resolvedAddr.latitude  === 'number' ? resolvedAddr.latitude  : null;
        lng     = typeof resolvedAddr.longitude === 'number' ? resolvedAddr.longitude : null;
      } else if (user) {
        pincode = user.pincode || order.manualCustomerPincode || 'unknown';
        area    = pincode;
      } else if (order.manualCustomerPincode) {
        pincode = order.manualCustomerPincode;
        area    = pincode;
      }
      return { order, lat, lng, area, pincode, clusterId: null };
    });

    // Greedy GPS clustering: assign each GPS stop to the nearest existing cluster
    // centroid if within radius, else start a new cluster
    const gpsClusters = []; // [{ centLat, centLng, area, pincode, stops[] }]
    for (const stop of allStops) {
      if (stop.lat == null || stop.lng == null) continue; // handle later

      let assigned = false;
      for (const cluster of gpsClusters) {
        if (calculateDistance(stop.lat, stop.lng, cluster.centLat, cluster.centLng) <= GPS_CLUSTER_RADIUS_KM) {
          cluster.stops.push(stop);
          // Recalculate centroid
          cluster.centLat = cluster.stops.reduce((s, x) => s + x.lat, 0) / cluster.stops.length;
          cluster.centLng = cluster.stops.reduce((s, x) => s + x.lng, 0) / cluster.stops.length;
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        gpsClusters.push({ centLat: stop.lat, centLng: stop.lng, area: stop.area, pincode: stop.pincode, stops: [stop] });
      }
    }

    // For each cluster pick the most common area/pincode label
    const labelCluster = (cluster) => {
      const areaCount = {};
      for (const s of cluster.stops) { areaCount[s.area] = (areaCount[s.area] || 0) + 1; }
      const topArea = Object.entries(areaCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
      const pinCount = {};
      for (const s of cluster.stops) { pinCount[s.pincode] = (pinCount[s.pincode] || 0) + 1; }
      const topPin  = Object.entries(pinCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
      cluster.area    = topArea;
      cluster.pincode = topPin;
    };
    gpsClusters.forEach(labelCluster);

    // Absorb no-GPS stops: assign to nearest GPS cluster (if within radius)
    // else fall back to pincode/area text bucket
    const pincodeGroups = {};
    for (const stop of allStops) {
      if (stop.lat != null && stop.lng != null) continue; // already in gpsClusters

      // Try nearest GPS cluster
      let bestCluster = null;
      let bestDist    = Infinity;
      for (const cluster of gpsClusters) {
        // Match by pincode OR area label first (same zone, no GPS)
        if (cluster.pincode === stop.pincode || cluster.area === stop.area) {
          cluster.stops.push(stop);
          bestCluster = cluster;
          break;
        }
      }
      if (!bestCluster) {
        // No matching GPS cluster — put in pincode text bucket
        const key = stop.pincode !== 'unknown' ? stop.pincode : stop.area;
        if (!pincodeGroups[key]) pincodeGroups[key] = { area: stop.area, pincode: stop.pincode, stops: [] };
        pincodeGroups[key].stops.push(stop);
      }
    }

    // Merge all cluster sources into final groups array
    const groups = [
      ...gpsClusters.map(c => ({ area: c.area, pincode: c.pincode, stops: c.stops })),
      ...Object.values(pincodeGroups),
    ].filter(g => g.stops.length > 0);

    console.log(`[createBatch] GPS clusters: ${gpsClusters.length}, pincode groups: ${Object.keys(pincodeGroups).length}, total groups: ${groups.length}`);
    groups.forEach(g => console.log(`  group area=${g.area} pincode=${g.pincode} stops=${g.stops.length}`));

    // ── Dabbawala-style scheduled times ──────────────────────────────────────
    // Lunch: kitchen ready 11:45, rider picks up 12:00, deliver by 14:00
    // Dinner: kitchen ready 18:45, rider picks up 19:00, deliver by 21:00
    const SLOT_SCHEDULE = {
      lunch:  { pickupH: 12, pickupM: 0,  deadlineH: 14, deadlineM: 0 },
      dinner: { pickupH: 19, pickupM: 0,  deadlineH: 21, deadlineM: 0 },
    };
    const sched = SLOT_SCHEDULE[mealSlot] || SLOT_SCHEDULE.lunch;
    const scheduledPickupTime = new Date(dayStart);
    scheduledPickupTime.setHours(sched.pickupH, sched.pickupM, 0, 0);
    const deliveryDeadline = new Date(dayStart);
    deliveryDeadline.setHours(sched.deadlineH, sched.deadlineM, 0, 0);
    const MINS_PER_STOP = 7;   // avg minutes between consecutive stops
    const TRANSIT_MINS  = 5;   // kitchen → first stop transit

    const createdBatches = [];
    const vendorLat = vendor.latitude  || 0;
    const vendorLng = vendor.longitude || 0;

    // Split clusters that exceed vendor's maxDeliveriesPerBatch setting
    const MAX_PER_BATCH = vendor.deliverySettings?.maxDeliveriesPerBatch || 10;
    const finalGroups = [];
    for (const group of groups) {
      if (group.stops.length <= MAX_PER_BATCH) {
        finalGroups.push(group);
      } else {
        // Chunk into sub-batches of MAX_PER_BATCH
        for (let i = 0; i < group.stops.length; i += MAX_PER_BATCH) {
          finalGroups.push({
            area:    group.area,
            pincode: group.pincode,
            stops:   group.stops.slice(i, i + MAX_PER_BATCH),
          });
        }
      }
    }

    let riderRoundRobin = 0;
    for (const group of finalGroups) {
      // Prefer rider whose serviceArea covers this pincode/area, else round-robin
      const assignedRider = riders.length
        ? (riders.find(r =>
            r.serviceArea?.pincodes?.includes(group.pincode) ||
            r.serviceArea?.areas?.includes(group.area)
          ) || riders[riderRoundRobin++ % riders.length])
        : null;

      // Optimize stop sequence
      const optimized = optimizeRoute(
        vendorLat, vendorLng,
        group.stops.map(s => ({ lat: s.lat, lng: s.lng, orderId: s.order._id, order: s.order }))
      );

      const batchOrders = optimized.map((stop, idx) => {
        const ord  = stop.order;
        const user = ord.userId;
        let addr         = {};
        let phone        = '';
        let customerName = '';

        if (user) {
          // Prefer user's structured address; for manual customers fall back to order's manualCustomerAddress
          if (typeof user.address === 'object' && user.address && user.address.area) {
            addr = user.address;
          } else if (ord.manualCustomerAddress && typeof ord.manualCustomerAddress === 'object' && ord.manualCustomerAddress.area) {
            addr = ord.manualCustomerAddress;
          } else {
            addr = { fullAddress: typeof user.address === 'string' ? user.address : '' };
          }
          phone        = user.phone || '';
          customerName = user.name  || ord.customerName || '';
        } else {
          addr         = (ord.manualCustomerAddress && typeof ord.manualCustomerAddress === 'object')
                           ? ord.manualCustomerAddress
                           : { fullAddress: '' };
          phone        = ord.manualCustomerPhone || '';
          customerName = ord.manualCustomerName  || '';
        }

        return {
          orderId:             ord._id,
          userId:              user?._id,
          customerName,
          address:             addr,
          deliveryPreference:  addr?.deliveryPreference || 'hand_to_me',
          phone,
          status:              'pending',
          sequence:            idx + 1,
          estimatedArrivalTime: new Date(
            scheduledPickupTime.getTime() +
            (TRANSIT_MINS + (idx + 1) * MINS_PER_STOP) * 60 * 1000
          ),
        };
      });

      const batch = await DeliveryBatch.create({
        vendorId:            vendor._id,
        riderId:             assignedRider?._id,
        batchDate:           dayStart,
        mealSlot,
        area:                group.area,
        pincode:             group.pincode,
        orders:              batchOrders,
        batchStatus:         assignedRider ? 'assigned' : 'pending',
        scheduledPickupTime,
        deliveryDeadline,
        optimizedRoute: optimized.map((stop, idx) => ({
          latitude:  stop.lat,
          longitude: stop.lng,
          sequence:  idx + 1,
          orderId:   stop.orderId
        }))
      });

      // Stamp batch/rider onto every order
      await Order.updateMany(
        { _id: { $in: optimized.map(s => s.orderId) } },
        {
          $set: {
            deliveryBatchId: batch._id,
            deliveryRiderId: assignedRider?._id || null,
            deliveryStatus:  assignedRider ? 'assigned' : 'pending',
            mealSlot
          }
        }
      );

      try {
        const io = global.io;
        if (io && assignedRider && assignedRider.userId) {
          io.to(`delivery_${assignedRider.userId}`).emit('new_batch_assigned', {
            batchId:    batch._id,
            mealSlot,
            area:       group.area,
            orderCount: batchOrders.length,
            batchDate:  dayStart
          });
        }
      } catch (socketErr) {
        console.error('Socket emit error in createDeliveryBatches:', socketErr.message);
      }

      // FCM push to rider + each customer (fire-and-forget)
      if (assignedRider) {
        try {
          const { notifyRiderNewBatch, notifyDeliveryAssigned } = require('../utils/fcmService');
          const pickupTime = mealSlot === 'lunch' ? '12:00 PM' : '7:00 PM';
          if (assignedRider.userId && typeof notifyRiderNewBatch === 'function') {
            notifyRiderNewBatch(assignedRider.userId, group.area, batchOrders.length, pickupTime, mealSlot).catch(console.error);
          }
          if (typeof notifyDeliveryAssigned === 'function') {
            for (const batchOrder of batchOrders) {
              if (batchOrder.userId) {
                notifyDeliveryAssigned(batchOrder.userId, assignedRider.name, batchOrder.orderId).catch(console.error);
              }
            }
          }
        } catch (fcmErr) {
          console.error('FCM error in createDeliveryBatches:', fcmErr.message);
        }
      }

      createdBatches.push(batch);
    }

    const io = global.io;
    if (io) {
      io.to(`vendor_delivery_${vendor._id}`).emit('batches_created', {
        count:     createdBatches.length,
        mealSlot,
        batchDate: dayStart
      });
    }

    const unassigned = createdBatches.filter(b => !b.riderId).length;
    return res.json({
      message:       `${createdBatches.length} batch(es) created`,
      batchesCreated: createdBatches.length,
      totalOrders:   orders.length,
      unassigned,
      batches:       createdBatches,
    });
  } catch (err) {
    console.error('createDeliveryBatches:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   List delivery batches for vendor
// @route  GET /api/vendor/delivery/batches
const getBatches = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const { date, mealSlot } = req.query;
    const filter = { vendorId: vendor._id };
    if (date) {
      const d = new Date(date);
      filter.batchDate = {
        $gte: new Date(new Date(d).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(d).setHours(23, 59, 59, 999))
      };
    }
    if (mealSlot) filter.mealSlot = mealSlot;
    const batches = await DeliveryBatch.find(filter)
      .populate('riderId', 'name phone')
      .sort({ batchDate: -1, mealSlot: 1 });
    return res.json(batches);
  } catch (err) {
    console.error('getBatches:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Assign (or reassign) a batch to a specific rider
// @route  PATCH /api/vendor/delivery/batches/:batchId/assign
const assignBatchToRider = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const { riderId } = req.body;
    if (!riderId) return res.status(400).json({ message: 'riderId is required' });
    const batch = await DeliveryBatch.findOne({ _id: req.params.batchId, vendorId: vendor._id });
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    if (batch.batchStatus === 'completed') {
      return res.status(400).json({ message: 'Cannot assign a completed batch' });
    }
    const rider = await DeliveryPartner.findOne({ _id: riderId, vendorId: vendor._id, isActive: true });
    if (!rider) return res.status(404).json({ message: 'Rider not found or inactive' });
    batch.riderId     = riderId;
    batch.batchStatus = 'assigned';
    await batch.save();
    await Order.updateMany(
      { deliveryBatchId: batch._id },
      { $set: { deliveryRiderId: riderId, deliveryStatus: 'assigned' } }
    );
    try {
      const io = global.io;
      if (io && rider.userId) {
        io.to(`delivery_${rider.userId}`).emit('new_batch_assigned', {
          batchId: batch._id, mealSlot: batch.mealSlot, area: batch.area, orderCount: batch.orders.length
        });
      }
    } catch (socketErr) {
      console.error('Socket error in assignBatchToRider:', socketErr.message);
    }
    // FCM push to rider + each customer (fire-and-forget)
    try {
      if (rider.userId) {
        const { notifyRiderNewBatch, notifyDeliveryAssigned } = require('../utils/fcmService');
        const pickupTime = batch.mealSlot === 'lunch' ? '12:00 PM' : '7:00 PM';
        if (typeof notifyRiderNewBatch === 'function') {
          notifyRiderNewBatch(rider.userId, batch.area, batch.orders.length, pickupTime, batch.mealSlot).catch(console.error);
        }
        if (typeof notifyDeliveryAssigned === 'function') {
          for (const batchOrder of batch.orders) {
            if (batchOrder.userId) {
              notifyDeliveryAssigned(batchOrder.userId, rider.name, batchOrder.orderId).catch(console.error);
            }
          }
        }
      }
    } catch (fcmErr) {
      console.error('FCM error in assignBatchToRider:', fcmErr.message);
    }
    return res.json({ message: 'Batch assigned to rider', batch });
  } catch (err) {
    console.error('assignBatchToRider:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Rider clock-in  (rider calls this)
// @route  POST /api/delivery/attendance/clock-in
const clockIn = async (req, res) => {
  try {
    const partner = await DeliveryPartner.findById(req.deliveryPartner._id);
    if (!partner) return res.status(404).json({ message: 'Partner not found' });

    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const existing = partner.attendance.find(a => a.date === today);
    if (existing?.clockIn) {
      return res.status(400).json({ message: 'Already clocked in today' });
    }
    if (existing) {
      existing.clockIn = new Date();
      existing.status  = 'present';
    } else {
      partner.attendance.push({ date: today, clockIn: new Date(), status: 'present' });
    }
    await partner.save();
    return res.json({ message: 'Clocked in', clockIn: new Date() });
  } catch (err) {
    console.error('clockIn:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Rider clock-out (rider calls this)
// @route  POST /api/delivery/attendance/clock-out
const clockOut = async (req, res) => {
  try {
    const partner = await DeliveryPartner.findById(req.deliveryPartner._id);
    if (!partner) return res.status(404).json({ message: 'Partner not found' });

    const today = new Date().toISOString().slice(0, 10);
    const record = partner.attendance.find(a => a.date === today);
    if (!record?.clockIn) return res.status(400).json({ message: 'Not clocked in today' });
    if (record.clockOut)  return res.status(400).json({ message: 'Already clocked out' });

    record.clockOut    = new Date();
    record.hoursWorked = parseFloat(
      ((record.clockOut - record.clockIn) / 3600000).toFixed(2)
    );
    if (record.hoursWorked < 4) record.status = 'half_day';
    await partner.save();
    return res.json({ message: 'Clocked out', clockOut: record.clockOut, hoursWorked: record.hoursWorked });
  } catch (err) {
    console.error('clockOut:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Vendor views attendance for all their riders
// @route  GET /api/vendor/delivery/attendance?month=YYYY-MM
const getAttendance = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const now    = new Date();
    const month  = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = month + '-'; // "2026-06-"

    const riders = await DeliveryPartner.find({ vendorId: vendor._id, isActive: true })
      .select('name phone attendance');

    const result = riders.map(r => ({
      riderId:    r._id,
      name:       r.name,
      phone:      r.phone,
      attendance: r.attendance.filter(a => a.date.startsWith(prefix)),
      summary: {
        present:  r.attendance.filter(a => a.date.startsWith(prefix) && a.status === 'present').length,
        halfDay:  r.attendance.filter(a => a.date.startsWith(prefix) && a.status === 'half_day').length,
        absent:   r.attendance.filter(a => a.date.startsWith(prefix) && a.status === 'absent').length,
        totalHours: parseFloat(
          r.attendance
            .filter(a => a.date.startsWith(prefix))
            .reduce((s, a) => s + (a.hoursWorked || 0), 0)
            .toFixed(2)
        ),
      },
    }));

    return res.json({ month, riders: result });
  } catch (err) {
    console.error('getAttendance:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Delivery analytics: on-time rate, success rate, lunch/dinner split
// @route  GET /api/vendor/delivery/analytics?month=YYYY-MM
const getDeliveryAnalytics = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const now   = new Date();
    const month = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [year, mon] = month.split('-').map(Number);
    const monthStart  = new Date(year, mon - 1, 1);
    const monthEnd    = new Date(year, mon, 0, 23, 59, 59, 999);

    const batches = await DeliveryBatch.find({
      vendorId:  vendor._id,
      batchDate: { $gte: monthStart, $lte: monthEnd },
    });

    let totalOrders = 0, delivered = 0, onTime = 0, failed = 0;
    const lunchStats  = { total: 0, delivered: 0, onTime: 0 };
    const dinnerStats = { total: 0, delivered: 0, onTime: 0 };

    for (const batch of batches) {
      const slot = batch.mealSlot === 'dinner' ? dinnerStats : lunchStats;
      for (const o of batch.orders) {
        totalOrders++;
        slot.total++;
        if (o.status === 'delivered') {
          delivered++;
          slot.delivered++;
          // On-time: deliveredAt before the batch's 2-hour delivery deadline
          if (o.deliveredAt && batch.deliveryDeadline && o.deliveredAt <= new Date(batch.deliveryDeadline)) {
            onTime++;
            slot.onTime++;
          }
        }
        if (o.status === 'failed') failed++;
      }
    }

    const riderStats = await DeliveryPartner.find({ vendorId: vendor._id, isActive: true })
      .select('name totalDeliveries totalDeliveriesToday rating attendance');

    const monPad   = String(mon).padStart(2, '0');
    const monStart = `${year}-${monPad}-01`;
    const monEnd   = `${year}-${monPad}-31`;

    // Daily trend — last 7 days (local date to avoid IST/UTC midnight shift)
    const toLocalDateStr = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const dailyTrend = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = toLocalDateStr(d);
      const dayBatches = batches.filter(
        b => toLocalDateStr(new Date(b.batchDate)) === dateStr
      );
      const dayTotal     = dayBatches.reduce((s, b) => s + b.orders.length, 0);
      const dayDelivered = dayBatches.reduce(
        (s, b) => s + b.orders.filter(o => o.status === 'delivered').length, 0
      );
      const dayFailed    = dayBatches.reduce(
        (s, b) => s + b.orders.filter(o => o.status === 'failed' || o.status === 'cancelled').length, 0
      );
      return {
        date:        dateStr,
        label:       d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
        total:       dayTotal,
        delivered:   dayDelivered,
        failed:      dayFailed,
        successRate: dayTotal > 0 ? Math.round((dayDelivered / dayTotal) * 100) : 0,
      };
    });

    return res.json({
      month,
      totalOrders,
      delivered,
      failed,
      pending:     totalOrders - delivered - failed,
      successRate: totalOrders ? +((delivered / totalOrders) * 100).toFixed(1) : 0,
      onTimeRate:  delivered   ? +((onTime   / delivered)   * 100).toFixed(1) : 0,
      totalBatches:     batches.length,
      completedBatches: batches.filter(b => b.batchStatus === 'completed').length,
      lunch:  { ...lunchStats,  successRate: lunchStats.total  ? +((lunchStats.delivered  / lunchStats.total)  * 100).toFixed(1) : 0 },
      dinner: { ...dinnerStats, successRate: dinnerStats.total ? +((dinnerStats.delivered / dinnerStats.total) * 100).toFixed(1) : 0 },
      dailyTrend,
      riders: riderStats.map(r => {
        const monthAttend = r.attendance.filter(a => a.date >= monStart && a.date <= monEnd);
        return {
          riderId:         r._id,
          name:            r.name,
          totalDeliveries: r.totalDeliveries,
          todayDeliveries: r.totalDeliveriesToday,
          rating:          r.rating,
          presentDays:     monthAttend.filter(a => a.status === 'present').length,
          halfDays:        monthAttend.filter(a => a.status === 'half_day').length,
          absentDays:      monthAttend.filter(a => a.status === 'absent').length,
          totalHours:      +monthAttend.reduce((s, a) => s + (a.hoursWorked || 0), 0).toFixed(1),
          attendance:      monthAttend,
        };
      }),
    });
  } catch (err) {
    console.error('getDeliveryAnalytics:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Delivery financial summary for vendor (revenue, salaries, commission, net)
// @route  GET /api/vendor/delivery/financials
const getDeliveryFinancials = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const now          = new Date();
    const targetMonth  = req.query.month ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [year, mon]  = targetMonth.split('-').map(Number);
    const monthStart   = new Date(year, mon - 1, 1);
    const monthEnd     = new Date(year, mon, 0, 23, 59, 59, 999);

    const revenueResult = await Order.aggregate([
      { $match: { vendorId: vendor._id, paymentStatus: 'Paid', orderDate: { $gte: monthStart, $lte: monthEnd } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalRevenue = revenueResult[0]?.total || 0;

    const riders = await DeliveryPartner.find({ vendorId: vendor._id });
    const totalSalaries = riders.reduce((sum, r) => {
      return sum + r.salaryPaidDates
        .filter(s => s.month === targetMonth)
        .reduce((s2, p) => s2 + (p.amount || 0), 0);
    }, 0);

    const vendorGrossEarnings = totalRevenue - totalSalaries;
    const platformCommission  = Math.max(0, vendorGrossEarnings * 0.05);
    const vendorNetEarnings   = vendorGrossEarnings - platformCommission;

    const riderStats = riders.map(r => {
      const paidRecord    = r.salaryPaidDates.find(s => s.month === targetMonth);
      const paidThisMonth = paidRecord?.amount || 0;
      return {
        _id:                 r._id,
        name:                r.name,
        phone:               r.phone,
        upiId:               r.upiId || '',
        monthlySalary:       r.monthlySalary,
        salaryPaidThisMonth: paidThisMonth,
        paymentMethod:       paidRecord?.paymentMethod || '',
        transactionRef:      paidRecord?.transactionRef || '',
        totalDeliveries:     r.totalDeliveries,
      };
    });

    // salaryRecords in the format the frontend table expects
    const salaryRecords = riderStats.map(r => ({
      riderId:        r._id,
      name:           r.name,
      upiId:          r.upiId,
      status:         r.salaryPaidThisMonth > 0 ? 'paid' : 'pending',
      amount:         r.salaryPaidThisMonth,
      paymentMethod:  r.paymentMethod,
      transactionRef: r.transactionRef,
    }));

    return res.json({
      month: targetMonth,
      totalRevenue,
      totalSalaries,
      vendorGrossEarnings,
      platformCommission,
      vendorNetEarnings,
      riderCount: riders.length,
      riderStats,
      salaryRecords,
    });
  } catch (err) {
    console.error('getDeliveryFinancials:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Live rider GPS locations for vendor map
// @route  GET /api/vendor/delivery/riders/live
const getLiveRiderLocations = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const riders = await DeliveryPartner.find({ vendorId: vendor._id, isActive: true })
      .select('name phone currentLocation isAvailable totalDeliveriesToday');

    const liveData = riders.map(r => ({
      riderId:   r._id,
      name:      r.name,
      phone:     r.phone,
      available: r.isAvailable,
      deliveriesToday: r.totalDeliveriesToday || 0,
      location: r.currentLocation?.latitude && r.currentLocation?.longitude ? {
        latitude:  r.currentLocation.latitude,
        longitude: r.currentLocation.longitude,
        updatedAt: r.currentLocation.updatedAt,
      } : null,
    }));

    return res.json(liveData);
  } catch (err) {
    console.error('getLiveRiderLocations:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Reassign a batch to a different rider (vendor override)
// @route  PATCH /api/vendor/delivery/batches/:batchId/reassign
const reassignBatch = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const { riderId } = req.body;
    if (!riderId) return res.status(400).json({ message: 'riderId is required' });

    const batch = await DeliveryBatch.findOne({ _id: req.params.batchId, vendorId: vendor._id });
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    if (['completed', 'partial'].includes(batch.batchStatus)) {
      return res.status(400).json({ message: 'Cannot reassign a completed batch' });
    }

    const rider = await DeliveryPartner.findOne({ _id: riderId, vendorId: vendor._id, isActive: true });
    if (!rider) return res.status(404).json({ message: 'Rider not found or inactive' });

    const oldRiderId = batch.riderId;
    batch.riderId     = riderId;
    batch.batchStatus = 'assigned';
    await batch.save();

    await Order.updateMany(
      { deliveryBatchId: batch._id },
      { $set: { deliveryRiderId: riderId, deliveryStatus: 'assigned' } }
    );

    try {
      const io = global.io;
      if (io && rider.userId) {
        io.to(`delivery_${rider.userId}`).emit('new_batch_assigned', {
          batchId: batch._id, mealSlot: batch.mealSlot, area: batch.area, orderCount: batch.orders.length,
        });
        if (oldRiderId && String(oldRiderId) !== String(riderId)) {
          const oldRider = await DeliveryPartner.findById(oldRiderId).select('userId');
          if (oldRider?.userId) {
            io.to(`delivery_${oldRider.userId}`).emit('batch_reassigned', { batchId: batch._id });
          }
        }
      }
    } catch (socketErr) {
      console.error('Socket error in reassignBatch:', socketErr.message);
    }
    // FCM push to rider + each customer (fire-and-forget)
    try {
      if (rider.userId) {
        const { notifyRiderNewBatch, notifyDeliveryAssigned } = require('../utils/fcmService');
        const pickupTime = batch.mealSlot === 'lunch' ? '12:00 PM' : '7:00 PM';
        if (typeof notifyRiderNewBatch === 'function') {
          notifyRiderNewBatch(rider.userId, batch.area, batch.orders.length, pickupTime, batch.mealSlot).catch(console.error);
        }
        if (typeof notifyDeliveryAssigned === 'function') {
          for (const batchOrder of batch.orders) {
            if (batchOrder.userId) {
              notifyDeliveryAssigned(batchOrder.userId, rider.name, batchOrder.orderId).catch(console.error);
            }
          }
        }
      }
    } catch (fcmErr) {
      console.error('FCM error in reassignBatch:', fcmErr.message);
    }

    return res.json({ message: 'Batch reassigned', batch });
  } catch (err) {
    console.error('reassignBatch:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Merge two batches into one (vendor override)
// @route  POST /api/vendor/delivery/batches/merge
const mergeBatches = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const { sourceBatchId, targetBatchId } = req.body;
    if (!sourceBatchId || !targetBatchId) {
      return res.status(400).json({ message: 'sourceBatchId and targetBatchId are required' });
    }
    if (sourceBatchId === targetBatchId) {
      return res.status(400).json({ message: 'Cannot merge a batch with itself' });
    }

    const [source, target] = await Promise.all([
      DeliveryBatch.findOne({ _id: sourceBatchId, vendorId: vendor._id }),
      DeliveryBatch.findOne({ _id: targetBatchId, vendorId: vendor._id }),
    ]);
    if (!source) return res.status(404).json({ message: 'Source batch not found' });
    if (!target) return res.status(404).json({ message: 'Target batch not found' });
    if (['in_progress', 'completed', 'partial'].includes(source.batchStatus)) {
      return res.status(400).json({ message: 'Source batch is already in progress or completed' });
    }

    // Re-sequence merged orders
    const merged = [...target.orders, ...source.orders].map((o, i) => ({ ...o.toObject(), sequence: i + 1 }));
    target.orders = merged;
    // Recalculate ETAs
    const { scheduledPickupTime } = target;
    const TRANSIT_MINS = 5;
    const MINS_PER_STOP = 7;
    if (scheduledPickupTime) {
      target.orders = target.orders.map((o, idx) => ({
        ...o,
        estimatedArrivalTime: new Date(
          new Date(scheduledPickupTime).getTime() +
          (TRANSIT_MINS + (idx + 1) * MINS_PER_STOP) * 60 * 1000
        ),
      }));
    }
    await target.save();

    // Update orders from source to reference target batch
    await Order.updateMany(
      { deliveryBatchId: source._id },
      { $set: { deliveryBatchId: target._id, deliveryRiderId: target.riderId || null } }
    );

    // Delete the now-empty source batch
    await DeliveryBatch.deleteOne({ _id: source._id });

    return res.json({ message: 'Batches merged', batch: target });
  } catch (err) {
    console.error('mergeBatches:', err);
    return res.status(500).json({ message: err.message });
  }
};

// ── VENDOR FUNCTIONS — kept for backward compat with vendorRoutes.js ─────

const getVendorDeliveryPartners = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const partners = await DeliveryPartner.find({ vendorId: vendor._id, isActive: true })
      .populate('userId', 'name email phone');
    return res.json(partners);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const assignDelivery = async (req, res) => {
  try {
    const { orderId, deliveryPartnerId } = req.body;
    if (!orderId || !deliveryPartnerId) {
      return res.status(400).json({ message: 'orderId and deliveryPartnerId are required' });
    }
    const order = await Order.findById(orderId).populate('userId', 'name address phone');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const partner = await DeliveryPartner.findById(deliveryPartnerId);
    if (!partner || !partner.isActive || !partner.isAvailable) {
      return res.status(400).json({ message: 'Rider is not active or not available' });
    }
    order.deliveryRiderId = deliveryPartnerId;
    order.deliveryStatus  = 'assigned';
    await order.save();
    const io = global.io;
    if (io && partner.userId) {
      io.to(`delivery_${partner.userId}`).emit('new_delivery_assigned', {
        orderId:         order._id,
        customerName:    order.userId?.name || 'Customer',
        customerAddress: getAddressString(order.userId?.address) || getAddressString(order.manualCustomerAddress) || ''
      });
      if (order.userId) {
        io.to(order.userId._id.toString()).emit('delivery_status_update', {
          orderId: order._id, status: 'assigned', message: getStatusMessage('assigned')
        });
      }
    }
    return res.json({ message: 'Rider assigned', orderId: order._id, deliveryStatus: order.deliveryStatus });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const getTodayOrders = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const orders = await Order.find({
      vendorId: vendor._id,
      status:   { $in: ['active', 'trial'] },
      $and: [
        {
          $or: [
            { startDate: null },
            { startDate: { $exists: false } },
            { startDate: { $lte: todayEnd } },
          ]
        },
        {
          $or: [
            { endDate: { $gte: todayStart } },
            { endDate: null },
            { endDate: { $exists: false } },
          ]
        },
      ]
    })
      .populate('userId',          'name address phone')
      .populate('deliveryRiderId', 'name phone')
      .sort({ orderDate: -1 });
    return res.json(orders);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  RIDER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

// @desc   Rider / delivery partner login
// @route  POST /api/delivery/login
const riderLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
    const user = await User.findOne({ email });
    if (!user || user.role !== 'delivery') {
      return res.status(401).json({ message: 'Invalid credentials or not a delivery account' });
    }
    if (!user.isActive) return res.status(403).json({ message: 'Account deactivated. Contact your vendor.' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });
    const partner = await DeliveryPartner.findOne({ userId: user._id })
      .populate('vendorId', 'kitchenName latitude longitude');
    if (!partner)          return res.status(404).json({ message: 'Delivery partner profile not found' });
    if (!partner.isActive) return res.status(403).json({ message: 'Delivery account deactivated' });
    user.lastLogin = new Date();
    await user.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const riderData = {
      _id:                  partner._id,
      userId:               user._id,
      name:                 partner.name,
      phone:                partner.phone,
      email:                partner.email,
      vendorId:             partner.vendorId,
      isActive:             partner.isActive,
      isAvailable:          partner.isAvailable,
      totalDeliveries:      partner.totalDeliveries,
      totalDeliveriesToday: partner.totalDeliveriesToday,
      rating:               partner.rating,
      monthlySalary:        partner.monthlySalary,
      serviceArea:          partner.serviceArea
    };
    return res.json({
      token,
      // Flutter app reads 'user' for basic profile and 'rider' for partner data
      user:    { _id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role },
      rider:   riderData,
      partner: riderData, // kept for web compatibility
    });
  } catch (err) {
    console.error('riderLogin:', err);
    return res.status(500).json({ message: err.message });
  }
};
const deliveryLogin = riderLogin; // alias

// @desc   Get today's orders assigned to rider (flat list, for Flutter app)
// @route  GET /api/delivery/my-deliveries
const getMyDeliveries = async (req, res) => {
  try {
    const partner    = req.deliveryPartner;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const orders = await Order.find({
      deliveryRiderId: partner._id,
      $or: [
        { startDate: { $lte: todayEnd }, endDate: { $gte: todayStart } },
        { planType: 'Tiffin', orderDate: { $gte: todayStart, $lte: todayEnd } }
      ]
    })
      .populate('userId',   'name address phone pincode')
      .populate('vendorId', 'kitchenName name')
      .sort({ orderDate: -1 });
    return res.json(orders);
  } catch (err) {
    console.error('getMyDeliveries:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Get batches assigned to this rider (+ vendor's unassigned pending batches)
// @route  GET /api/delivery/batches
const getMyBatches = async (req, res) => {
  try {
    const partner = req.deliveryPartner;
    const { date, mealSlot } = req.query;

    const dateFilter = {};
    if (date) {
      const d = new Date(date);
      dateFilter.batchDate = {
        $gte: new Date(new Date(d).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(d).setHours(23, 59, 59, 999))
      };
    } else {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      dateFilter.batchDate = { $gte: today };
    }

    const mealFilter = {};
    if (mealSlot && ['lunch', 'dinner'].includes(mealSlot)) mealFilter.mealSlot = mealSlot;

    // Return batches assigned to THIS rider OR unassigned pending batches from the same vendor
    const filter = {
      ...dateFilter,
      ...mealFilter,
      $or: [
        { riderId: partner._id },
        { riderId: null, vendorId: partner.vendorId, batchStatus: 'pending' }
      ]
    };

    const batches = await DeliveryBatch.find(filter)
      .populate('vendorId', 'kitchenName address latitude longitude')
      .sort({ batchDate: 1, mealSlot: 1 });
    return res.json(batches);
  } catch (err) {
    console.error('getMyBatches:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Accept or return a batch
// @route  PATCH /api/delivery/batches/:batchId/accept
const acceptBatch = async (req, res) => {
  try {
    const partner = req.deliveryPartner;
    const { accepted } = req.body;
    const batch = await DeliveryBatch.findOne({ _id: req.params.batchId, riderId: partner._id });
    if (!batch) return res.status(404).json({ message: 'Batch not found or not assigned to you' });
    if (accepted !== false && ['completed', 'partial'].includes(batch.batchStatus)) {
      return res.status(400).json({ message: 'Cannot accept a completed batch' });
    }
    if (accepted === false) {
      batch.riderId     = undefined;
      batch.batchStatus = 'pending';
      await Order.updateMany(
        { deliveryBatchId: batch._id },
        { $set: { deliveryRiderId: null, deliveryStatus: 'pending' } }
      );
    } else {
      batch.batchStatus = 'in_progress';
      if (!batch.startedAt) batch.startedAt = new Date();
    }
    await batch.save();
    if (accepted === false) {
      return res.json({ message: 'Batch returned to pool', batchStatus: batch.batchStatus });
    }
    return res.json({
      message:    'Batch accepted',
      batchStatus: batch.batchStatus,
      pickupTime:  batch.scheduledPickupTime,
      deadline:    batch.deliveryDeadline,
      totalStops:  batch.orders.length,
      checklist: [
        'All tiffins packed and sealed',
        'Route reviewed on map',
        'Phone charged and GPS enabled',
        'All contact numbers saved',
        'Delivery bag ready',
      ],
    });
  } catch (err) {
    console.error('acceptBatch:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Update delivery status for a single order (in or out of a batch)
// @route  PATCH /api/delivery/orders/:orderId/status
const updateOrderStatus = async (req, res) => {
  try {
    const { status, failReason } = req.body;
    const { orderId }            = req.params;
    const partner                = req.deliveryPartner;

    const validStatuses = ['preparing', 'picked_up', 'on_the_way', 'delivered', 'failed', 'retry_pending'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Allowed: ${validStatuses.join(', ')}` });
    }

    // Support both new (deliveryRiderId) and old (deliveryPartnerId) assignment fields
    const order = await Order.findOne({
      _id: orderId,
      $or: [{ deliveryRiderId: partner._id }, { deliveryPartnerId: partner._id }]
    });
    if (!order) return res.status(404).json({ message: 'Order not assigned to you' });

    // Handle retry_pending: max 2 attempts, record history
    if (status === 'retry_pending') {
      const MAX_RETRIES = 2;
      if ((order.retryCount || 0) >= MAX_RETRIES) {
        return res.status(400).json({
          message: `Maximum ${MAX_RETRIES} re-attempts reached. Mark as final failure instead.`,
          code: 'MAX_RETRIES_REACHED',
          retryCount: order.retryCount
        });
      }
      order.retryCount = (order.retryCount || 0) + 1;
    }

    order.deliveryStatus = status;
    if (status === 'picked_up') order.pickedUpAt  = new Date();
    if (status === 'delivered') {
      const { haversineDistanceMeters, isValidCoordinate } = require('../utils/geo');
      const riderLat = req.body.latitude !== undefined ? Number(req.body.latitude) : (req.body.gpsLat !== undefined ? Number(req.body.gpsLat) : undefined);
      const riderLng = req.body.longitude !== undefined ? Number(req.body.longitude) : (req.body.gpsLng !== undefined ? Number(req.body.gpsLng) : undefined);
      const accuracy = req.body.accuracy !== undefined && req.body.accuracy !== null ? Number(req.body.accuracy) : undefined;
      const { cashCollected, cashAmount, proofPhotoUrl } = req.body;

      // 1. Validate rider coordinates before looking up delivery address
      if (riderLat === undefined || riderLng === undefined || !isValidCoordinate(riderLat, riderLng)) {
        return res.status(400).json({
          success: false,
          code: 'GPS_REQUIRED',
          message: 'Current rider GPS coordinates are required to mark delivery'
        });
      }

      // 2. Validate GPS accuracy threshold
      const maxAccuracy = Number(process.env.GPS_ACCURACY_THRESHOLD) || 50;
      if (accuracy !== undefined && Number.isFinite(accuracy) && accuracy > maxAccuracy) {
        return res.status(400).json({
          success: false,
          code: 'LOW_ACCURACY',
          message: 'Move to open sky and retry'
        });
      }

      // 3. Look up delivery address coordinates
      let custLat;
      let custLng;

      if (order.deliveryBatchId) {
        const batchForProof = await DeliveryBatch.findById(order.deliveryBatchId).select('orders');
        const batchOrd = batchForProof?.orders.find(o => o.orderId.toString() === orderId);
        custLat = batchOrd?.address?.latitude;
        custLng = batchOrd?.address?.longitude;
      }

      if (custLat === undefined || custLng === undefined) {
        const user = await User.findById(order.userId).select('address').lean();
        custLat = user?.address?.latitude ?? user?.address?.lat;
        custLng = user?.address?.longitude ?? user?.address?.lng;
      }

      if (custLat === undefined || custLng === undefined) {
        if (order.manualCustomerAddress?.latitude !== undefined && order.manualCustomerAddress?.longitude !== undefined) {
          custLat = order.manualCustomerAddress.latitude;
          custLng = order.manualCustomerAddress.longitude;
        }
      }

      if (custLat === undefined || custLng === undefined || !isValidCoordinate(Number(custLat), Number(custLng))) {
        return res.status(400).json({
          success: false,
          code: 'DELIVERY_COORDINATES_MISSING',
          message: 'Delivery address is missing coordinates. Contact the vendor.'
        });
      }

      // 4. Compute haversine distance and enforce geofence
      const distanceMeters = Math.round(haversineDistanceMeters(riderLat, riderLng, Number(custLat), Number(custLng)));
      const allowedMeters = Number(process.env.DELIVERY_GEOFENCE_METERS) || 50;
      if (distanceMeters > allowedMeters) {
        return res.status(403).json({
          success: false,
          code: 'TOO_FAR',
          distanceMeters,
          allowedMeters,
          message: `You are ${distanceMeters} m away. You must be within ${allowedMeters} m of the delivery location to mark delivery.`
        });
      }

      // 5. Cash order confirmation (enforced after geofence check)
      const isCashOrder = (order.paymentMethod || '').toLowerCase() === 'cash';
      if (isCashOrder) {
        const parsedCashAmount = Number(cashAmount);
        if (cashCollected !== true || !Number.isFinite(parsedCashAmount) || parsedCashAmount <= 0) {
          return res.status(400).json({
            success: false,
            code: 'CASH_COLLECTION_REQUIRED',
            message: 'Cash collection confirmation and collected amount are required for cash orders.'
          });
        }

        const expectedAmount = Number(order.amount) || 0;
        const difference = parsedCashAmount - expectedAmount;
        const amountMismatch = difference !== 0;

        order.paymentStatus = 'Paid';
        order.cashPaymentConfirmedAt = new Date();
        order.cashPaymentConfirmedBy = partner._id;
        order.cashPaymentConfirmedByType = 'DeliveryPartner';
        order.cashCollection = {
          collected: true,
          amount: parsedCashAmount,
          expectedAmount,
          difference,
          amountMismatch,
          collectedAt: new Date(),
          collectedBy: partner._id,
          riderName: partner.name || ''
        };

        const recordOrderTransaction = require('../utils/orderTransaction');
        await recordOrderTransaction(order, 'Verified', parsedCashAmount);

        try {
          const io = global.io;
          if (io) {
            io.to(`vendor_${order.vendorId}`).emit('cash_payment_updated', {
              orderId: order._id,
              paymentStatus: 'Paid',
              cashCollection: order.cashCollection
            });
          }
        } catch (socketErr) {
          console.error('Socket error emitting cash_payment_updated:', socketErr.message);
        }
      }

      // 6. Record delivery proof & update metrics
      order.deliveryProof = {
        photoUrl:   proofPhotoUrl || null,
        gpsLat:     riderLat,
        gpsLng:     riderLng,
        capturedAt: new Date()
      };
      order.deliveredAt = new Date();
      await DeliveryPartner.findByIdAndUpdate(partner._id, {
        $inc: { totalDeliveries: 1, totalDeliveriesToday: 1 }
      });
    }
    await order.save();

    // Sync status inside the DeliveryBatch sub-document
    if (order.deliveryBatchId) {
      const updateFields = { 'orders.$.status': status };
      if (status === 'picked_up') updateFields['orders.$.pickedUpAt']  = new Date();
      if (status === 'delivered') {
        updateFields['orders.$.deliveredAt']   = new Date();
        updateFields['orders.$.deliveryProof'] = order.deliveryProof || null;
      }
      if (failReason) updateFields['orders.$.failReason'] = failReason;
      if (status === 'retry_pending') {
        updateFields['orders.$.retryCount'] = order.retryCount;
      }
      await DeliveryBatch.updateOne(
        { _id: order.deliveryBatchId, 'orders.orderId': order._id },
        { $set: updateFields }
      );

      // For retry_pending: push to retryHistory in batch order item, then reuse the
      // fetched doc for the completion check to avoid a 2nd findById.
      let batchForCompletion = null;
      if (status === 'retry_pending' && failReason) {
        const batchDoc = await DeliveryBatch.findById(order.deliveryBatchId);
        if (batchDoc) {
          const batchOrder = batchDoc.orders.find(o => o.orderId.toString() === orderId);
          if (batchOrder) {
            batchOrder.retryHistory.push({ reason: failReason, attemptedAt: new Date() });
            await batchDoc.save();
          }
          batchForCompletion = batchDoc;
        }
      }

      // Check if entire batch is done.
      // retry_pending orders are NOT 'delivered'/'failed' so allDone stays false while any exist.
      const batch = batchForCompletion || await DeliveryBatch.findById(order.deliveryBatchId);
      if (batch) {
        const allDone   = batch.orders.every(o => o.status === 'delivered' || o.status === 'failed');
        const anyFailed = batch.orders.some(o => o.status === 'failed');
        if (allDone) {
          batch.batchStatus = anyFailed ? 'partial' : 'completed';
          batch.completedAt = new Date();
          await batch.save();
        }
      }
    }

    // Socket notifications
    const io = global.io;
    if (io) {
      if (order.userId) {
        io.to(order.userId.toString()).emit('delivery_status_update', {
          orderId: order._id, status, message: getStatusMessage(status)
        });
      }
      io.to(`vendor_${order.vendorId}`).emit('delivery_status_changed', { orderId: order._id, status });
      if (order.deliveryBatchId) {
        io.to(`batch_${order.deliveryBatchId}`).emit('batch_order_updated', { orderId: order._id, status });
      }
    }

    // FCM push notifications (fire-and-forget)
    if (order.userId) {
      const {
        notifyDeliveryAssigned, notifyMealPickedUp,
        notifyOutForDelivery,  notifyDelivered, notifyDeliveryFailed,
      } = require('../utils/fcmService');

      if (status === 'picked_up') {
        notifyMealPickedUp(order.userId, partner.name).catch(console.error);
      } else if (status === 'on_the_way') {
        const etaStr = order.estimatedDeliveryTime
          ? new Date(order.estimatedDeliveryTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          : null;
        notifyOutForDelivery(order.userId, etaStr).catch(console.error);
      } else if (status === 'delivered') {
        const vendorDoc = await Vendor.findById(order.vendorId).select('kitchenName').lean();
        notifyDelivered(order.userId, vendorDoc?.kitchenName || 'MealSetu').catch(console.error);
      } else if (status === 'failed') {
        notifyDeliveryFailed(order.userId, failReason || null).catch(console.error);
      }
    }

    return res.json({
      message:        'Delivery status updated',
      orderId:        order._id,
      deliveryStatus: status,
      statusMessage:  getStatusMessage(status)
    });
  } catch (err) {
    console.error('updateOrderStatus:', err);
    return res.status(500).json({ message: err.message });
  }
};
const updateDeliveryStatus = updateOrderStatus; // alias for old route name

// @desc   Update rider GPS location
// @route  POST /api/delivery/location
const updateRiderLocation = async (req, res) => {
  try {
    const { latitude, longitude, batchId } = req.body;
    const partner = req.deliveryPartner;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: 'latitude and longitude are required' });
    }
    const now = new Date();
    await DeliveryPartner.findByIdAndUpdate(partner._id, {
      'currentLocation.latitude':  latitude,
      'currentLocation.longitude': longitude,
      'currentLocation.updatedAt': now
    });
    // Append point to GPS trail for the active batch
    if (batchId) {
      await DeliveryBatch.updateOne(
        { _id: batchId, riderId: partner._id },
        { $push: { gpsTrail: { lat: latitude, lng: longitude, ts: now } } }
      );
    }
    const io = global.io;
    if (io) {
      const payload = {
        latitude, longitude, updatedAt: now,
        riderId:   partner._id,
        riderName: partner.name || '',
      };
      if (batchId) {
        io.to(`batch_${batchId}`).emit('rider_location_update', payload);
      }
      io.to(`vendor_delivery_${partner.vendorId}`).emit('rider_location_update', payload);
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('updateRiderLocation:', err);
    return res.status(500).json({ message: err.message });
  }
};
const updateLocation = updateRiderLocation; // alias

// @desc   Get rider's own profile
// @route  GET /api/delivery/profile
const getDeliveryProfile = async (req, res) => {
  try {
    const partner = await DeliveryPartner.findById(req.deliveryPartner._id)
      .populate('vendorId', 'kitchenName address latitude longitude');
    if (!partner) return res.status(404).json({ message: 'Profile not found' });
    const vendor = partner.vendorId;
    return res.json({
      _id:                  partner._id,
      name:                 partner.name,
      phone:                partner.phone,
      email:                partner.email,
      isActive:             partner.isActive,
      isAvailable:          partner.isAvailable,
      totalDeliveries:      partner.totalDeliveries,
      totalDeliveriesToday: partner.totalDeliveriesToday,
      rating:               partner.rating,
      monthlySalary:        partner.monthlySalary,
      serviceArea:          partner.serviceArea,
      vendorName:           vendor?.kitchenName || '',
      vendorAddress:        getAddressString(vendor?.address) || '',
      currentLocation:      partner.currentLocation || null
    });
  } catch (err) {
    console.error('getDeliveryProfile:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Rider views own attendance (last 30 days)
// @route  GET /api/delivery/attendance
const getMyAttendance = async (req, res) => {
  try {
    const partner = await DeliveryPartner.findById(req.deliveryPartner._id)
      .select('name attendance');
    if (!partner) return res.status(404).json({ message: 'Partner not found' });

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 29);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const records = partner.attendance
      .filter(a => a.date >= cutoffStr)
      .sort((a, b) => b.date.localeCompare(a.date));

    const present  = records.filter(a => a.status === 'present').length;
    const halfDay  = records.filter(a => a.status === 'half_day').length;
    const absent   = records.filter(a => a.status === 'absent').length;
    const totalHours = +records.reduce((s, a) => s + (a.hoursWorked || 0), 0).toFixed(1);

    // Today's clock-in status
    const today = new Date().toISOString().slice(0, 10);
    const todayRecord = partner.attendance.find(a => a.date === today);

    return res.json({
      records,
      summary: { present, halfDay, absent, totalHours, totalDays: records.length },
      today: {
        date:       today,
        clockIn:    todayRecord?.clockIn    || null,
        clockOut:   todayRecord?.clockOut   || null,
        hoursWorked: todayRecord?.hoursWorked || null,
        status:     todayRecord?.status     || null,
        isClockedIn:  !!(todayRecord?.clockIn && !todayRecord?.clockOut),
        isClockedOut: !!(todayRecord?.clockOut),
      },
    });
  } catch (err) {
    console.error('getMyAttendance:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Toggle rider on/off duty
// @route  PATCH /api/delivery/availability
const updateAvailability = async (req, res) => {
  try {
    const { isAvailable } = req.body;
    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({ message: 'isAvailable must be a boolean' });
    }
    const partner = await DeliveryPartner.findByIdAndUpdate(req.deliveryPartner._id, { isAvailable }, { new: true });
    if (!partner) return res.status(404).json({ message: 'Partner not found' });
    return res.json({ success: true, isAvailable: partner.isAvailable });
  } catch (err) {
    console.error('updateAvailability:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Get rider's delivery stats
// @route  GET /api/delivery/stats
const getMyStats = async (req, res) => {
  try {
    const partner = await DeliveryPartner.findById(req.deliveryPartner._id);
    const today   = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const [deliveriesTodayResult, deliveriesMonthResult] = await Promise.all([
      DeliveryBatch.aggregate([
        { $match: { riderId: partner._id, batchDate: { $gte: today, $lt: tomorrow } } },
        { $unwind: '$orders' },
        { $match: { 'orders.status': 'delivered' } },
        { $count: 'total' }
      ]),
      DeliveryBatch.aggregate([
        { $match: { riderId: partner._id, batchDate: { $gte: new Date(today.getFullYear(), today.getMonth(), 1) } } },
        { $unwind: '$orders' },
        { $match: { 'orders.status': 'delivered' } },
        { $count: 'total' }
      ])
    ]);

    const currentMonth        = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const salaryPaidThisMonth = partner.salaryPaidDates
      .filter(s => s.month === currentMonth)
      .reduce((sum, s) => sum + (s.amount || 0), 0);

    return res.json({
      totalDeliveries:      partner.totalDeliveries,
      deliveriesToday:      deliveriesTodayResult[0]?.total || 0,
      monthDeliveries:      deliveriesMonthResult[0]?.total || 0,
      deliveriesThisMonth:  deliveriesMonthResult[0]?.total || 0,
      rating:               partner.rating,
      monthlySalary:        partner.monthlySalary,
      salaryPaidThisMonth,
      salaryStatus:         salaryPaidThisMonth > 0 ? 'Paid' : 'Pending',
      isAvailable:          partner.isAvailable
    });
  } catch (err) {
    console.error('getMyStats:', err);
    return res.status(500).json({ message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  USER FUNCTION
// ══════════════════════════════════════════════════════════════════════════════

// @desc   Live tracking info for an order (customer-facing)
// @route  GET /api/users/track-order/:orderId
const getOrderTracking = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, userId: req.user._id })
      .populate('deliveryRiderId', 'name phone currentLocation')
      .populate('deliveryPartnerId', 'name phone currentLocation')
      .populate({ path: 'deliveryBatchId', select: 'batchStatus optimizedRoute orders' });
    if (!order) return res.status(404).json({ message: 'Order not found or access denied' });

    // Support both new riderId and old partnerId
    const rider = order.deliveryRiderId || order.deliveryPartnerId;

    // Customer coords + stops-ahead from batch sub-doc
    let stopsAhead  = 0;
    let customerLat = null;
    let customerLng = null;
    const batch = order.deliveryBatchId;
    if (batch?.orders?.length) {
      const mySubDoc = batch.orders.find(
        o => o.orderId.toString() === order._id.toString()
      );
      if (mySubDoc) {
        customerLat = mySubDoc.address?.latitude  ?? null;
        customerLng = mySubDoc.address?.longitude ?? null;
        stopsAhead  = batch.orders.filter(
          o => o.sequence < mySubDoc.sequence &&
               o.status !== 'delivered' &&
               o.status !== 'failed'
        ).length;
      }
    }

    return res.json({
      orderId:        order._id,
      deliveryStatus: order.deliveryStatus,
      statusMessage:  getStatusMessage(order.deliveryStatus),
      deliveryPartner: rider
        ? { _id: rider._id, name: rider.name, phone: rider.phone, currentLocation: rider.currentLocation || null }
        : null,
      batchStatus:           order.deliveryBatchId?.batchStatus || null,
      estimatedDeliveryTime: order.estimatedDeliveryTime || null,
      pickedUpAt:            order.pickedUpAt  || null,
      deliveredAt:           order.deliveredAt || null,
      stopsAhead,
      customerLat,
      customerLng,
    });
  } catch (err) {
    console.error('getOrderTracking:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Upload delivery proof photo
// @route  POST /api/delivery/delivery-photo
const uploadDeliveryPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No photo uploaded' });
    const photoUrl = `/uploads/delivery-proofs/${req.file.filename}`;
    return res.json({ success: true, photoUrl });
  } catch (err) {
    console.error('uploadDeliveryPhoto:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Rider records empty tiffins collected at end of batch
// @route  POST /api/delivery/batches/:batchId/tiffin-collect
const collectTiffins = async (req, res) => {
  try {
    const partner = req.deliveryPartner;
    const { tiffinsCollected } = req.body;
    if (tiffinsCollected === undefined || isNaN(Number(tiffinsCollected))) {
      return res.status(400).json({ message: 'tiffinsCollected (number) is required' });
    }
    const batch = await DeliveryBatch.findOne({ _id: req.params.batchId, riderId: partner._id });
    if (!batch) return res.status(404).json({ message: 'Batch not found or not assigned to you' });
    batch.tiffinCollection.riderCount  = parseInt(tiffinsCollected);
    batch.tiffinCollection.status      = 'collected';
    batch.tiffinCollection.collectedAt = new Date();
    await batch.save();
    return res.json({ message: 'Tiffin collection recorded', riderCount: batch.tiffinCollection.riderCount });
  } catch (err) {
    console.error('collectTiffins:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Vendor confirms tiffins returned by rider
// @route  PATCH /api/vendor/delivery/batches/:batchId/tiffin-return
const confirmTiffinReturn = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const { confirmedCount } = req.body;
    if (confirmedCount === undefined) return res.status(400).json({ message: 'confirmedCount is required' });
    const batch = await DeliveryBatch.findOne({ _id: req.params.batchId, vendorId: vendor._id });
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    const rCount = batch.tiffinCollection.riderCount;
    const vCount = parseInt(confirmedCount);
    batch.tiffinCollection.vendorCount = vCount;
    batch.tiffinCollection.status      = 'returned_to_vendor';
    batch.tiffinCollection.returnedAt  = new Date();
    batch.tiffinCollection.discrepancy = rCount !== null && rCount !== vCount;
    await batch.save();
    return res.json({
      message:     'Tiffin return confirmed',
      riderCount:  rCount,
      vendorCount: vCount,
      discrepancy: batch.tiffinCollection.discrepancy
    });
  } catch (err) {
    console.error('confirmTiffinReturn:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Vendor gets flagged (reported) orders
// @route  GET /api/vendor/delivery/flagged-orders
const getFlaggedOrders = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const orders = await Order.find({ vendorId: vendor._id, isFlagged: true })
      .populate('userId', 'name phone')
      .sort({ flaggedAt: -1 })
      .limit(100)
      .lean();
    return res.json({ flaggedOrders: orders, total: orders.length });
  } catch (err) {
    console.error('getFlaggedOrders:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   User rates a rider after delivery
// @route  POST /api/delivery/rate-rider
const rateRider = async (req, res) => {
  try {
    const { orderId, riderId, rating, comment } = req.body;
    const userId = req.user._id;

    if (!orderId || !riderId) {
      return res.status(400).json({ message: 'orderId and riderId are required' });
    }
    const ratingNum = parseInt(rating, 10);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ message: 'Rating must be 1–5' });
    }

    // Verify the order belongs to this user and is delivered
    const order = await Order.findOne({ _id: orderId, userId }).lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.deliveryStatus !== 'delivered') {
      return res.status(400).json({ message: 'Can only rate after delivery is completed' });
    }

    const partner = await DeliveryPartner.findById(riderId);
    if (!partner) return res.status(404).json({ message: 'Rider not found' });

    // Verify the rider actually delivered this order
    const orderRiderId = (order.deliveryRiderId || order.deliveryPartnerId)?.toString();
    if (orderRiderId && orderRiderId !== riderId.toString()) {
      return res.status(400).json({ message: 'This rider did not deliver your order' });
    }

    // Prevent duplicate rating for the same order
    const alreadyRated = partner.ratingHistory.some(r => r.orderId.toString() === orderId.toString());
    if (alreadyRated) {
      return res.status(400).json({ message: 'You have already rated this delivery' });
    }

    // Save rating
    partner.ratingHistory.push({
      userId,
      orderId,
      rating:    ratingNum,
      comment:   (comment || '').trim(),
      createdAt: new Date(),
    });

    // Recalculate average rating
    const totalRatings = partner.ratingHistory.length;
    const sum          = partner.ratingHistory.reduce((s, r) => s + r.rating, 0);
    partner.rating      = Math.round((sum / totalRatings) * 10) / 10;
    partner.ratingCount = totalRatings;

    await partner.save();

    return res.json({
      message:     'Rating submitted. Thank you!',
      newRating:   partner.rating,
      ratingCount: partner.ratingCount,
    });
  } catch (err) {
    console.error('rateRider:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Vendor gets orders that are awaiting re-attempt (retry_pending)
// @route  GET /api/vendor/delivery/retry-queue
const getRetryOrders = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const orders = await Order.find({ vendorId: vendor._id, deliveryStatus: 'retry_pending' })
      .populate('userId', 'name phone address')
      .populate('deliveryRiderId', 'name phone')
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    return res.json({ retryOrders: orders, total: orders.length });
  } catch (err) {
    console.error('getRetryOrders:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc   Vendor gets final-failed deliveries that need a resolution decision
// @route  GET /api/vendor/delivery/failed-queue
const getFailedDeliveries = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const since = new Date();
    since.setDate(since.getDate() - 7);

    // Collect orderIds that are marked 'failed' in any batch sub-document
    const batches = await DeliveryBatch.find({
      vendorId:        vendor._id,
      'orders.status': 'failed',
      updatedAt:       { $gte: since },
    }).select('orders').lean();

    const failedOrderIds = [];
    for (const batch of batches) {
      for (const o of batch.orders) {
        if (o.status === 'failed') failedOrderIds.push(o.orderId);
      }
    }

    if (failedOrderIds.length === 0) {
      return res.json({ failedOrders: [], total: 0 });
    }

    // Fetch Order documents — exclude already-resolved ones
    const orders = await Order.find({
      _id:                         { $in: failedOrderIds },
      'failureResolution.action':  { $exists: false },
    })
      .populate('userId',          'name phone address')
      .populate('deliveryRiderId', 'name phone')
      .sort({ updatedAt: -1 })
      .lean();

    // Attach lastFailureReason from the batch sub-doc if not on Order
    const batchOrderMap = {};
    for (const batch of batches) {
      for (const o of batch.orders) {
        if (o.status === 'failed') batchOrderMap[o.orderId.toString()] = o;
      }
    }
    const enriched = orders.map((order) => {
      const batchOrd = batchOrderMap[order._id.toString()];
      return {
        ...order,
        lastFailureReason: order.lastFailureReason || batchOrd?.failReason || null,
        retryCount:        order.retryCount ?? batchOrd?.retryCount ?? 0,
        deliveryAddress:   order.deliveryAddress || batchOrd?.address?.addressLine || null,
      };
    });

    return res.json({ failedOrders: enriched, total: enriched.length });
  } catch (err) {
    console.error('getFailedDeliveries:', err);
    return res.status(500).json({ message: err.message });
  }
};

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  // Admin
  createDeliveryPartner,
  getDeliveryPartners,
  togglePartnerStatus,
  // Vendor — legacy (vendorRoutes.js backward compat)
  getVendorDeliveryPartners,
  assignDelivery,
  getTodayOrders,
  // Vendor — new delivery management
  toggleVendorDelivery,
  updateDeliverySettings,
  addRider,
  getVendorRiders,
  updateRider,
  deleteRider,
  markSalaryPaid,
  createSalaryRazorpayOrder,
  verifySalaryRazorpayPayment,
  createDeliveryBatches,
  getBatches,
  assignBatchToRider,
  reassignBatch,
  mergeBatches,
  getLiveRiderLocations,
  getAttendance,
  getDeliveryAnalytics,
  getDeliveryFinancials,
  // Rider — new
  riderLogin,
  deliveryLogin,
  getMyDeliveries,
  getMyBatches,
  acceptBatch,
  updateOrderStatus,
  updateDeliveryStatus,
  updateRiderLocation,
  updateLocation,
  getDeliveryProfile,
  updateAvailability,
  getMyStats,
  clockIn,
  clockOut,
  getMyAttendance,
  // User
  getOrderTracking,
  // Delivery verification
  uploadDeliveryPhoto,
  collectTiffins,
  confirmTiffinReturn,
  getFlaggedOrders,
  getRetryOrders,
  getFailedDeliveries,
  rateRider,
};
