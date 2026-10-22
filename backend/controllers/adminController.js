const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Order = require('../models/Order');
const PlatformSetting = require('../models/PlatformSetting');
const Commission = require('../models/Commission');
const CommissionPayment = require('../models/CommissionPayment');
const Review = require('../models/Review');
const DeliveryBatch = require('../models/DeliveryBatch');
const DeliveryPartner = require('../models/DeliveryPartner');
const LoyaltyPoints = require('../models/LoyaltyPoints');
const Complaint = require('../models/Complaint');
const { sendEmail } = require('../utils/emailUtils');

// @desc    Get platform settings (commission rate, etc)
// @route   GET /api/admin/settings
const getPlatformSettings = async (req, res) => {
  try {
    let settings = await PlatformSetting.findOne();
    if (!settings) {
      settings = await PlatformSetting.create({ commissionRate: 10 });
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Update commission rate
// @route   PUT /api/admin/settings/commission
const updateCommissionRate = async (req, res) => {
  try {
    const { commissionRate } = req.body;
    let settings = await PlatformSetting.findOne();
    if (!settings) {
      settings = await PlatformSetting.create({ commissionRate });
    } else {
      settings.commissionRate = commissionRate;
      await settings.save();
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Update platform settings (commission rate + admin UPI ID)
// @route   PUT /api/admin/settings
const updatePlatformSettings = async (req, res) => {
  try {
    const { commissionRate, adminUpiId } = req.body;
    let settings = await PlatformSetting.findOne();
    if (!settings) {
      settings = await PlatformSetting.create({ commissionRate: 10, adminUpiId: '' });
    }
    if (commissionRate !== undefined) settings.commissionRate = commissionRate;
    if (adminUpiId !== undefined) settings.adminUpiId = adminUpiId.trim();
    await settings.save();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get all users


const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get all pending vendor requests
// @route   GET /api/admin/vendor-requests
const getPendingVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find({
      status: 'pending', 
      isApproved: { $ne: true } 
    })
    .sort({ 
      resubmittedAt: -1,  // Resubmissions first
      createdAt: -1       // Then newest first
    })
    .select('-password')
    .populate('ownerId', 'name email phone');

    return res.status(200).json({ vendors });

  } catch (error) {
    console.error('❌ getPendingVendors error:', error.message);
    return res.status(500).json({ message: error.message });
  }
};


// @desc    Approve vendor request
// @route   POST /api/admin/vendor-requests/approve
const approveVendor = async (req, res) => {
  try {
    const { vendorId } = req.body;
    if (!vendorId) {
      return res.status(400).json({ message: 'vendorId is required' });
    }
    const vendor = await Vendor.findByIdAndUpdate(
      vendorId,
      { $set: { isApproved: true, status: 'approved', approvalStatus: 'Approved' } },
      { new: true, runValidators: false }
    ).populate('ownerId', 'name email');
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    try {
      const toEmail = vendor.email || vendor.ownerId?.email;
      if (toEmail) {
        await sendEmail(
          toEmail,
          'Your MealSetu Vendor Account is Approved',
          `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#f26522;padding:30px;text-align:center">
              <h1 style="color:white;margin:0">MealSetu</h1>
            </div>
            <div style="background:white;padding:30px">
              <h2 style="color:#16a34a">Congratulations! Your Kitchen is Now Live</h2>
              <p>Dear ${vendor.kitchenName || 'Vendor'},</p>
              <p>Your vendor account has been approved. Your kitchen is now visible to users on MealSetu.</p>
              <p>Login to your vendor dashboard to start managing your menu and orders.</p>
            </div>
          </div>`
        );
      }
    } catch (emailErr) {
      console.error('Email failed:', emailErr.message);
    }
    if (vendor.ownerId?._id) {
      const { notifyVendorApproved } = require('../utils/fcmService');
      notifyVendorApproved(vendor.ownerId._id, vendor.kitchenName || 'Your Kitchen').catch(console.error);
    }
    return res.status(200).json({ message: 'Vendor approved successfully', vendor });
  } catch (error) {
    console.error('approveVendor error:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Reject vendor request
// @route   POST /api/admin/vendor-requests/reject
const rejectVendor = async (req, res) => {
  try {
    const { vendorId, rejectionReason } = req.body;

    if (!vendorId) {
      return res.status(400).json({ message: 'vendorId is required' });
    }

    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const vendor = await Vendor.findByIdAndUpdate(
      vendorId,
      {
        $set: {
          isApproved: false,
          status: 'rejected',
          approvalStatus: 'Rejected',
          rejectionReason: rejectionReason.trim()
        }
      },
      { new: true, runValidators: false }
    ).populate('ownerId', 'name email');

    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    try {
      const toEmail = vendor.email || vendor.ownerId?.email;
      if (toEmail) {
        await sendEmail(
          toEmail,
          'Update on Your MealSetu Vendor Application',
          `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#f26522;padding:30px;text-align:center;border-radius:10px 10px 0 0">
              <h1 style="color:white;margin:0">MealSetu</h1>
            </div>
            <div style="background:white;padding:30px;border-radius:0 0 10px 10px">
              <h2 style="color:#ef4444">Application Update</h2>
              <p>Dear ${vendor.kitchenName || 'Vendor'},</p>
              <p>We have reviewed your vendor application and could not approve it at this time.</p>
              <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;margin:20px 0;border-radius:0 8px 8px 0">
                <strong>Reason for Rejection:</strong><br/><br/>${rejectionReason.trim()}
              </div>
              <p>Please address the above concerns and submit your application again from the Compliance section of your vendor dashboard.</p>
              <p style="color:#64748b;font-size:13px;margin-top:20px">Thank you for your interest in MealSetu.</p>
            </div>
          </div>`
        );
      }
    } catch (emailErr) {
      console.error('Email send failed:', emailErr.message);
    }
    if (vendor.ownerId?._id) {
      const { notifyVendorRejected } = require('../utils/fcmService');
      notifyVendorRejected(vendor.ownerId._id, vendor.kitchenName || 'Your Kitchen', rejectionReason).catch(console.error);
    }

    return res.status(200).json({
      message: 'Vendor rejected successfully',
      vendor: vendor
    });

  } catch (error) {
    console.error('rejectVendor error:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

// New vendor stats controller
const getAllVendorsForAdmin = async (req, res) => {
  try {
    const vendors = await Vendor.find({}).populate('ownerId', 'name email phone').lean();

    const fixImageUrl = (imgPath) => {
      if (!imgPath) return null;
      if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) return imgPath;
      const backendUrl = `${req.protocol}://${req.get('host')}`;
      return imgPath.startsWith('/') ? `${backendUrl}${imgPath}` : `${backendUrl}/${imgPath}`;
    };

    const vendorsWithStats = await Promise.all(
      vendors.map(async (vendor) => {
        const [orderStats, subscriberResult, riderCount] = await Promise.all([
          // All order metrics in one pass
          Order.aggregate([
            { $match: { vendorId: vendor._id } },
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, '$amount', 0] } },
                activeSubscribers: { $sum: { $cond: [{ $in: ['$status', ['active', 'trial']] }, 1, 0] } },
                appUserIds: {
                  $addToSet: {
                    $cond: [{ $eq: ['$isManualOrder', true] }, '$$REMOVE', '$userId']
                  }
                },
                manualPhones: {
                  $addToSet: {
                    $cond: [{ $eq: ['$isManualOrder', true] }, '$manualCustomerPhone', '$$REMOVE']
                  }
                },
              }
            },
            {
              $project: {
                totalOrders: 1,
                totalRevenue: 1,
                activeSubscribers: 1,
                subscriberCount: { $add: [{ $size: '$appUserIds' }, { $size: '$manualPhones' }] },
              }
            }
          ]).catch(() => []),
          // keep separate for legacy compatibility
          Promise.resolve(null),
          DeliveryPartner.countDocuments({ vendorId: vendor._id }).catch(() => 0),
        ]);

        const stats = orderStats[0] || {};

        return {
          _id: vendor._id.toString(),
          kitchenName: vendor.kitchenName,
          ownerName: vendor.ownerId?.name || vendor.ownerName,
          ownerId: { name: vendor.ownerId?.name, email: vendor.ownerId?.email, phone: vendor.ownerId?.phone },
          email: vendor.ownerId?.email || null,
          phone: vendor.ownerId?.phone || vendor.phone || 'N/A',
          profileImage: fixImageUrl(vendor.profileImage),
          bannerImage: fixImageUrl(vendor.kitchenPoster),
          status: vendor.status,
          isApproved: vendor.isApproved,
          approvalStatus: vendor.approvalStatus,
          address: vendor.address || '',
          pincode: vendor.pincode || '',
          fssaiNumber: vendor.fssaiNumber || '',
          hasGst: !!vendor.gstDocument,
          subscriberCount: stats.subscriberCount || 0,
          totalOrders: stats.totalOrders || 0,
          totalRevenue: stats.totalRevenue || 0,
          activeSubscribers: stats.activeSubscribers || 0,
          riderCount,
          rating: vendor.rating || 0,
          reviewCount: vendor.reviewCount || 0,
          joinDate: vendor.createdAt,
        };
      })
    );

    res.status(200).json({
      vendors: vendorsWithStats.sort((a, b) => new Date(b.joinDate) - new Date(a.joinDate))
    });
  } catch (error) {
    console.error('getAllVendorsForAdmin error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};


// Get subscribers for specific vendor
const getVendorSubscribers = async (req, res) => {
  try {
    const { vendorId } = req.params;

    // Validate vendorId first
    if (!vendorId || vendorId === 'undefined' || vendorId.trim() === '') {
      return res.status(400).json({ message: 'Vendor ID is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ message: 'Invalid vendor ID format' });
    }
    
    const vendor = await Vendor.findById(vendorId).select('kitchenName');
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    const now = new Date();
    const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);

    // Fetch all orders for this vendor, sorted newest first
    const allOrders = await Order.find({
      vendorId: new mongoose.Types.ObjectId(vendorId)
    })
      .sort({ createdAt: -1 })
      .populate('userId', 'name email phone address pincode joinDate isActive')
      .lean();

    const customerMap = new Map();

    for (const order of allOrders) {
      const isManual = order.isManualOrder === true;
      const key = isManual
        ? `manual_${order.manualCustomerPhone}`
        : order.userId?._id?.toString();

      if (!key) continue;

      if (!customerMap.has(key)) {
        let joinDate = null;
        if (isManual) {
          joinDate = order.orderDate;
        } else {
          joinDate = order.userId?.joinDate
            || (order.userId?._id
                ? new Date(parseInt(order.userId._id.toString().slice(0, 8), 16) * 1000)
                : null)
            || order.orderDate;
        }

        customerMap.set(key, {
          _id: key,
          userId: isManual ? null : (order.userId?._id?.toString() || null),
          name: isManual
            ? (order.manualCustomerName || 'Offline Customer')
            : (order.userId?.name || 'Unknown'),
          email: isManual ? '—' : (order.userId?.email || '—'),
          phone: isManual
            ? (order.manualCustomerPhone || 'N/A')
            : (order.userId?.phone || 'N/A'),
          accountStatus: isManual ? true : (order.userId?.isActive !== false),
          joinDate,
          lastOrderDate: order.orderDate,
          isManual,
          hasActiveSubscription: false,
          orderCount: 0,
          totalSpent: 0,
        });
      } else if (isManual) {
        // Sorted newest-first: update joinDate to earlier value as older orders arrive
        const entry = customerMap.get(key);
        if (order.orderDate < entry.joinDate) {
          entry.joinDate = order.orderDate;
        }
      }

      const entry = customerMap.get(key);
      entry.orderCount += 1;
      if (order.paymentStatus === 'Paid') entry.totalSpent += (order.amount || 0);

      // Derive endDate from startDate + planDuration when endDate is missing
      const PLAN_DAYS = { Weekly: 7, Monthly: 30, Trial: 1, Tiffin: 1 };
      const planDuration = PLAN_DAYS[order.planType] || 7;
      const orderStart = order.startDate ? new Date(order.startDate) : null;
      let orderEnd = order.endDate ? new Date(order.endDate) : null;
      if (!orderEnd && orderStart) {
        orderEnd = new Date(orderStart);
        orderEnd.setDate(orderEnd.getDate() + planDuration);
      }

      const isCurrentlyActive =
        (order.status === 'active' || order.status === 'trial') &&
        orderStart !== null &&
        orderStart <= todayStart &&
        orderEnd !== null &&
        orderEnd >= todayStart;

      if (isCurrentlyActive) {
        entry.hasActiveSubscription = true;
      }
    }

    const users = Array.from(customerMap.values()).map(entry => {
      const lastActive = entry.lastOrderDate ? new Date(entry.lastOrderDate) : null;
      const daysSinceActive = lastActive
        ? Math.floor((now - lastActive) / (1000 * 60 * 60 * 24))
        : null;

      // isActive = has a running subscription today, or ordered within last 50 days
      // (50-day fallback covers legacy orders without proper endDate)
      const isActive = entry.hasActiveSubscription
        || (daysSinceActive !== null && daysSinceActive <= 50);

      return {
        _id: entry._id,
        userId: entry.userId,
        name: entry.name,
        email: entry.email,
        phone: entry.phone,
        accountActive: entry.accountStatus,
        joinDate: entry.joinDate ? new Date(entry.joinDate).toISOString() : null,
        lastActiveDate: lastActive ? lastActive.toISOString() : null,
        daysSinceActive,
        isActive,
        isManual: entry.isManual,
        totalOrders: entry.orderCount,
        totalSpent: entry.totalSpent,
      };
    });

    users.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    const totalManualCustomers = users.filter(u => u.isManual).length;

    return res.status(200).json({
      users,
      vendorName: vendor.kitchenName,
      totalAppUsers: users.length - totalManualCustomers,
      totalManualCustomers
    });
  } catch (error) {
    console.error('getVendorSubscribers FULL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


// Auto mark globally inactive users (for cron)
const autoMarkInactiveUsers = async (req, res) => {
  try {
    console.log('Running autoMarkInactiveUsers cron...');
    
    const users = await User.find({}).lean();
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    let updatedCount = 0;

    for (const user of users) {
      const latestOrder = await Order.findOne({ userId: user._id })
        .sort({ createdAt: -1 })
        .select('createdAt')
        .lean();
      
      const lastActive = latestOrder?.createdAt || user.joinDate || now;
      const daysSinceActive = Math.floor((now - lastActive) / dayMs);
      
      const update = daysSinceActive > 50 ? { isActive: false } : { isActive: true };
      if (update.isActive !== user.isActive) {
        await User.findByIdAndUpdate(user._id, {
          ...update,
          lastActiveDate: lastActive
        });
        updatedCount++;
      }
    }

    console.log(`Updated ${updatedCount} users activity status`);
    res.status(200).json({ message: `Updated ${updatedCount} users`, updatedCount });
  } catch (error) {
    console.error('autoMarkInactiveUsers error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

const getAdminProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('name email phone');
    if (!user) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

const updateAdminProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, phone },
      { new: true, runValidators: false }
    ).select('name email phone');
    if (!user) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

const getPublicAdminContact = async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'admin' }).select('name email phone').lean();
    res.json(admin || null);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// ===== COMMISSION CONTROLLER FUNCTIONS =====
// @desc    Get all commissions (admin view)
const getAllCommissions = async (req, res) => {
  try {
    const commissions = await Commission.find({})
      .populate('vendorId', 'kitchenName ownerId')
      .populate('vendorId.ownerId', 'email')
      .sort({ createdAt: -1 });
    
    res.status(200).json({ commissions });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get commission summary statistics
const getCommissionSummary = async (req, res) => {
  try {
    const summary = await Commission.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $group: {
          _id: null,
          pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$count', 0] } },
          pendingAmount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$totalAmount', 0] } },
          paidCount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$count', 0] } },
          paidAmount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$totalAmount', 0] } },
          overdueCount: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, '$count', 0] } },
          overdueAmount: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, '$totalAmount', 0] } }
        }
      }
    ]);
    
    const stats = summary[0] || {};
    res.status(200).json({
      pendingAmount: stats.pendingAmount || 0,
      paidAmount: stats.paidAmount || 0,
      overdueAmount: stats.overdueAmount || 0,
      pendingCount: stats.pendingCount || 0,
      paidCount: stats.paidCount || 0,
      overdueCount: stats.overdueCount || 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};


// @route   PUT /api/admin/commissions/:id/mark-paid
const markCommissionPaid = async (req, res) => {
  try {
    const commission = await Commission.findById(req.params.id)
      .populate({ path: 'vendorId', populate: { path: 'ownerId', select: 'email name' } });
    if (!commission) {
      return res.status(404).json({ message: 'Commission not found' });
    }

    const now        = new Date();
    const prevStatus = commission.status;

    commission.status           = 'paid';
    commission.payment_date     = now;
    commission.paidOnTime       = now <= new Date(commission.due_date);
    commission.paymentReference = `ADMIN-MANUAL-${now.getTime()}`;
    commission.isLocked         = true;
    commission.lockedAt         = commission.lockedAt || now;
    commission.lockedBy         = `admin:${req.user?._id || 'unknown'}`;

    if (!commission.auditLog) commission.auditLog = [];
    commission.auditLog.push({
      action:      'marked_paid',
      performedBy: `admin:${req.user?._id || 'unknown'}`,
      at:          now,
      note:        'Manually marked as paid by admin',
      valueBefore: { status: prevStatus },
      valueAfter:  { status: 'paid', payment_date: now }
    });

    await commission.save();

    // Notify vendor by email
    try {
      const vendorEmail = commission.vendorId?.ownerId?.email;
      const vendorName  = commission.vendorId?.kitchenName || 'Vendor';
      // Right after: const now = new Date(); const prevStatus = commission.status;
      const weekLabel = commission.weekStart && commission.weekEnd
        ? `${new Date(commission.weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(commission.weekEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : (commission.notes || commission.week || commission.month || '');
      if (vendorEmail) {
        await sendEmail(
          vendorEmail,
          'MealSetu — Commission Marked as Paid by Admin',
          `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#16a34a;padding:20px;text-align:center;border-radius:10px 10px 0 0">
              <h1 style="color:white;margin:0">✓ Payment Confirmed</h1>
            </div>
            <div style="background:white;padding:30px;border-radius:0 0 10px 10px;border:1px solid #e5e7eb">
              <p>Dear <strong>${vendorName}</strong>,</p>
              <p>Your commission for <strong>${weekLabel}</strong> has been marked as paid by the MealSetu admin team.</p>
              <div style="background:#f0fdf4;padding:20px;border-radius:8px;border-left:4px solid #16a34a;margin:20px 0">
                <p style="margin:0"><strong>Amount:</strong> ₹${commission.commission_amount?.toLocaleString('en-IN')}</p>
                <p style="margin:8px 0 0"><strong>Reference:</strong> ${commission.paymentReference}</p>
                <p style="margin:8px 0 0"><strong>Date:</strong> ${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
              <p style="color:#64748b;font-size:13px">Thank you for being part of MealSetu!</p>
            </div>
          </div>`
        );
      }
    } catch (emailErr) {
      console.error('[markCommissionPaid] Email failed:', emailErr.message);
    }
    if (commission.vendorId?.ownerId?._id) {
      const { notifyCommissionPaid } = require('../utils/fcmService');
      notifyCommissionPaid(commission.vendorId.ownerId._id, weekLabel, commission.commission_amount).catch(console.error);
    }

    res.status(200).json(commission);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get commission tiers
// @route   GET /api/admin/commission/tiers
const getCommissionTiers = async (req, res) => {
  try {
    const CommissionSetting = require('../models/CommissionSetting');
    const tiers = await CommissionSetting.find({ }).sort({ minEarning: 1 });
    res.status(200).json({ tiers });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Update commission tiers (bulk)
// @route   PUT /api/admin/commission/tiers
const updateCommissionTiers = async (req, res) => {
  try {
    const CommissionSetting = require('../models/CommissionSetting');
    const { tiers } = req.body;
    
    if (!Array.isArray(tiers)) {
      return res.status(400).json({ message: 'Tiers must be an array' });
    }

    // Validate: no overlapping earning ranges among active tiers
    const activeTiers = tiers
      .filter(t => t.isActive !== false)
      .sort((a, b) => a.minEarning - b.minEarning);

    for (let i = 0; i < activeTiers.length - 1; i++) {
      const curr = activeTiers[i];
      const next = activeTiers[i + 1];
      const currMax = curr.maxEarning != null ? curr.maxEarning : Infinity;
      if (currMax >= next.minEarning) {
        return res.status(400).json({
          message: `Tier overlap detected: "${curr.tierName}" (max ₹${curr.maxEarning ?? '∞'}) overlaps with "${next.tierName}" (min ₹${next.minEarning}). Ensure maxEarning of each tier is less than minEarning of the next.`
        });
      }
    }

    // Upsert all tiers by tierName
    const updatedTiers = [];
    for (const tier of tiers) {
      const result = await CommissionSetting.findOneAndUpdate(
        { tierName: tier.tierName },
        {
          $set: {
            tierName: tier.tierName,
            minEarning: tier.minEarning,
            maxEarning: tier.maxEarning,
            ratePercent: tier.ratePercent,
            isActive: tier.isActive !== false
          }
        },
        { upsert: true, new: true }
      );
      updatedTiers.push(result);
    }
    
    res.status(200).json({ 
      message: 'Commission tiers updated successfully',
      tiers: updatedTiers 
    });
  } catch (error) {
    console.error('Update tiers error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get commission vendors overview
// @route   GET /api/admin/commission/vendors
const getCommissionVendors = async (req, res) => {
  try {
    const CommissionSetting = require('../models/CommissionSetting');

    const { month, status, search } = req.query;
    
    let match = {};
    if (month) match.month = month;
    if (status) match.status = status;
    
    const commissions = await Commission.aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'vendors',
          localField: 'vendorId',
          foreignField: '_id',
          as: 'vendor'
        }
      },
      { $unwind: '$vendor' },
      {
        $lookup: {
          from: 'commissionpayments',
          localField: '_id',
          foreignField: 'vendorEarningId',
          as: 'payments'
        }
      },
      {
        $addFields: {
          latestPayment: { $arrayElemAt: ['$payments', -1] }
        }
      },
      {
        $project: {
          vendor_name:       '$vendor.kitchenName',
          vendorId:          1,
          month:             1,
          week:              1,
          weekStart:         1,
          weekEnd:           1,
          total_earning:     1,
          total_wallet_deductions: 1,   // ← ADD
          gross_earning: 1,          // ← ADD
          total_expenses: 1,          // ← ADD
          net_earning: 1,          // ← ADD
          auto_deducted: 1,          // ← ADD
          auto_deducted_at: 1,          // ← ADD
          commission_rate:   1,
          commission_amount: 1,
          status:            1,
          due_date:          1,
          payment_date:      1,
          paidOnTime:        1,
          financialYear:     1,
          disputeStatus:     1,
          payment_id:     { $ifNull: ['$latestPayment._id', null] },
          amount_paid:    { $ifNull: ['$latestPayment.amountPaid', 0] },
          payment_status: '$latestPayment.status',
          proof_url:      { $ifNull: ['$latestPayment.proofUrl', null] },
          paid_at:        { $ifNull: ['$latestPayment.paidAt', null] }
        }
      },
      { $sort: { month: -1 } }
    ]);
    
    // AFTER
    let vendors = commissions;
    if (search) {
      vendors = vendors.filter(v => v.vendor_name?.toLowerCase().includes(search.toLowerCase()));
    }
    res.status(200).json({ vendors });
  } catch (error) {
    console.error('Get commission vendors error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get commission report CSV
// @route   GET /api/admin/commission/report/csv
const getCommissionReportCSV = async (req, res) => {
  try {
    const { month, status } = req.query;

    const query = {};
    if (status && status !== 'all') query.status = status;
    // AFTER — matches new monthly records (via the `month` string field)
    // OR legacy weekly records (via weekStart falling in that month)
    if (month) {
      const [year, mon] = month.split('-').map(Number);
      const monthStart = new Date(Date.UTC(year, mon - 1, 1));
      const monthEnd = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));
      query.$or = [
        { month: month },
        { weekStart: { $gte: monthStart, $lte: monthEnd } }
      ];
    }
    const commissions = await Commission.find(query)
      .populate('vendorId', 'kitchenName address')
      .sort({ weekStart: -1 })
      .lean();

    const rows = [
      [
        'Settlement ID', 'Vendor Name', 'Week',
        'Week Start', 'Week End', 'Total Orders',
        'Total Earning (INR)', 'Commission Rate (%)', 'Commission Amount (INR)',
        'Net Payout (INR)', 'Status', 'Due Date', 'Payment Date', 'Paid On Time'
      ],
      ...commissions.map(c => [
        c.settlementNumber || `MS-${c.financialYear || 'FY'}-${c.week || ''}`,
        c.vendorId?.kitchenName || 'Unknown Vendor',
        c.week || '',
        c.weekStart ? new Date(c.weekStart).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
        c.weekEnd   ? new Date(c.weekEnd).toLocaleDateString('en-IN',   { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
        c.total_orders      ?? 0,
        c.total_earning     ?? 0,
        c.commission_rate   ?? 0,
        c.commission_amount ?? 0,
        (c.total_earning ?? 0) - (c.commission_amount ?? 0),
        c.status || 'pending',
        c.due_date     ? new Date(c.due_date).toLocaleDateString('en-IN',     { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
        c.payment_date ? new Date(c.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
        c.paidOnTime === true ? 'Yes' : c.paidOnTime === false ? 'No' : 'N/A'
      ])
    ];

    const csvContent = rows
      .map(row =>
        row.map(cell => {
          const str = String(cell ?? '');
          return str.includes(',') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }).join(',')
      )
      .join('\n');

    const BOM = '﻿';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="MealSetu_Commission_${month || new Date().toISOString().split('T')[0]}.csv"`
    );
    return res.send(BOM + csvContent);

  } catch (err) {
    console.error('[getCommissionReportCSV]', err);
    return res.status(500).json({ message: err.message });
  }
};

// @desc    Seed default commission tiers (runs if empty)
// @route   POST /api/admin/commission/seed-tiers
const seedDefaultTiers = async (req, res) => {
  try {
    const CommissionSetting = require('../models/CommissionSetting');
    const count = await CommissionSetting.countDocuments();
    
    if (count > 0) {
      return res.json({ message: 'Tiers already exist', count });
    }
    
    const defaultTiers = [
      { tierName: 'Starter', minEarning: 0, maxEarning: 10000, ratePercent: 3, isActive: true },
      { tierName: 'Growth', minEarning: 10001, maxEarning: 50000, ratePercent: 5, isActive: true },
      { tierName: 'Pro', minEarning: 50001, maxEarning: 100000, ratePercent: 8, isActive: true },
      { tierName: 'Enterprise', minEarning: 100001, maxEarning: null, ratePercent: 10, isActive: true }
    ];
    
    await CommissionSetting.insertMany(defaultTiers);
    
    res.json({ message: 'Default tiers seeded', tiers: defaultTiers });
  } catch (error) {
    res.status(500).json({ message: 'Seeding failed', error: error.message });
  }
};

// @desc    Get full week-by-week commission history for one vendor
// @route   GET /api/admin/commission/vendor/:vendorId
const getVendorCommissionDetail = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const vendor  = await Vendor.findById(vendorId).select('kitchenName address');
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const history = await Commission.find({ vendorId }).sort({ createdAt: -1 }).lean();
    const totalPaid = history.filter(h => h.status === 'paid' || h.status === 'auto_deducted')
      .reduce((s, h) => s + (h.commission_amount || 0), 0);
    const totalPending = history.filter(h => h.status !== 'paid' && h.status !== 'auto_deducted')
      .reduce((s, h) => s + (h.commission_amount || 0), 0);
    const overdueCount = history.filter(h => h.status === 'overdue').length;

    return res.json({
      success: true,
      vendor:  { _id: vendor._id, kitchenName: vendor.kitchenName, address: vendor.address },
      summary: { totalPaid, totalPending, overdueCount, totalWeeks: history.length },
      history
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Download CSV report for one vendor's commission history
// @route   GET /api/admin/commission/vendor/:vendorId/report
const downloadVendorCommissionReport = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const vendor  = await Vendor.findById(vendorId).select('kitchenName');
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const history = await Commission.find({ vendorId }).sort({ weekStart: 1 }).lean();

    const rows = [
      ['Week', 'Period Start', 'Period End', 'Earnings', 'Rate %', 'Commission', 'Due Date', 'Status', 'Paid Date'],
      ...history.map(h => [
        h.week || h.month,
        h.weekStart ? new Date(h.weekStart).toLocaleDateString('en-IN') : '-',
        h.weekEnd   ? new Date(h.weekEnd).toLocaleDateString('en-IN')   : '-',
        h.total_earning,
        h.commission_rate,
        h.commission_amount,
        h.due_date      ? new Date(h.due_date).toLocaleDateString('en-IN')      : '-',
        h.status,
        h.payment_date  ? new Date(h.payment_date).toLocaleDateString('en-IN')  : '-'
      ])
    ];

    const csv = rows.map(r => r.join(',')).join('\n');
    const filename = `commission_${vendor.kitchenName.replace(/\s+/g, '_')}_${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Admin view of order breakdown for a vendor for a specific week
// @route GET /api/admin/commission/vendor/:vendorId/week-orders
const getAdminVendorWeekOrders = async (req, res) => {
  try {
    const { vendorId }           = req.params;
    const { weekStart, weekEnd } = req.query;

    if (!weekStart || !weekEnd) {
      return res.status(400).json({ message: 'weekStart and weekEnd are required' });
    }

    const start = new Date(weekStart);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(weekEnd);
    end.setUTCHours(23, 59, 59, 999);

    const orders = await Order.find({
      vendorId,
      status:        { $nin: ['cancelled', 'on-hold'] },
      paymentStatus: 'Paid',
      createdAt:     { $gte: start, $lte: end }
    })
      .populate('userId', 'name phone')
      .sort({ createdAt: 1 })
      .lean();

    const commission = await Commission.findOne({
      vendorId,
      weekStart: { $gte: start },
      weekEnd:   { $lte: end }
    }).lean();

    const commissionRate = commission?.commission_rate || 5;
    const grossEarnings  = orders.reduce((s, o) => s + (o.amount || 0), 0);
    const commissionAmt  = commission?.commission_amount ||
                           Math.round(grossEarnings * commissionRate / 100);

    return res.json({
      success:          true,
      weekStart:        start,
      weekEnd:          end,
      totalOrders:      orders.length,
      grossEarnings,
      commissionRate,
      commissionAmount: commissionAmt,
      netEarnings:      grossEarnings - commissionAmt,
      commissionStatus: commission?.status,
      settlementId:     commission?._id,
      orders: orders.map(o => ({
        orderId:       o._id,
        orderDate:     o.createdAt,
        customerName:  o.userId?.name || 'Customer',
        planType:      o.planType,
        grossAmount:   o.amount || 0,
        commissionCut: Math.round((o.amount || 0) * commissionRate / 100),
        netAmount:     (o.amount || 0) - Math.round((o.amount || 0) * commissionRate / 100),
        paymentMethod: o.paymentMethod
      }))
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// @desc  Get CommissionPayment records for a vendor (admin)
// @route GET /api/admin/commission/vendor/:vendorId/payments
const getVendorPaymentHistory = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const payments = await CommissionPayment.find({ vendorId })
      .sort({ paidAt: -1 })
      .lean();

    const enriched = await Promise.all(payments.map(async (p) => {
      const commission = p.vendorEarningId
        ? await Commission.findById(p.vendorEarningId)
            .select('due_date paidOnTime week').lean()
        : null;

      return {
        ...p,
        paidOnTime: commission?.paidOnTime ?? null,
        weekKey:    commission?.week        ?? null
      };
    }));

    return res.json({ success: true, payments: enriched });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// @desc    Get all open commission disputes
// @route   GET /api/admin/commission/disputes
const getCommissionDisputes = async (req, res) => {
  try {
    const disputes = await Commission.find({
      disputeStatus: { $in: ['raised', 'under_review'] }
    })
      .populate({ path: 'vendorId', select: 'kitchenName', populate: { path: 'ownerId', select: 'email name' } })
      .sort({ disputeRaisedAt: -1 })
      .lean();

    res.status(200).json({ disputes });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Resolve a commission dispute (admin)
// @route   PUT /api/admin/commission/:id/resolve-dispute
const resolveCommissionDispute = async (req, res) => {
  try {
    const { resolutionNote, adjustedAmount } = req.body;

    if (!resolutionNote || !resolutionNote.trim()) {
      return res.status(400).json({ message: 'Resolution note is required' });
    }

    const commission = await Commission.findById(req.params.id)
      .populate({ path: 'vendorId', populate: { path: 'ownerId', select: 'email name' } });
    if (!commission) return res.status(404).json({ message: 'Commission not found' });

    if (!commission.disputeStatus || commission.disputeStatus === 'resolved') {
      return res.status(400).json({ message: 'No open dispute on this settlement' });
    }

    const now           = new Date();
    const adminRef      = `admin:${req.user?._id || 'unknown'}`;
    const prevAmount    = commission.commission_amount;

    commission.disputeStatus         = 'resolved';
    commission.disputeResolvedAt     = now;
    commission.disputeResolvedBy     = adminRef;
    commission.disputeResolutionNote = resolutionNote.trim();

    // Optional: admin can override the commission amount as part of resolution
    if (adjustedAmount !== undefined && adjustedAmount !== null && !isNaN(Number(adjustedAmount))) {
      commission.commission_amount = Math.max(0, Number(adjustedAmount));
    }

    if (!commission.auditLog) commission.auditLog = [];
    commission.auditLog.push({
      action:      'dispute_resolved',
      performedBy: adminRef,
      at:          now,
      note:        `Dispute resolved: ${resolutionNote.trim()}`,
      valueBefore: { disputeStatus: commission.disputeStatus, commission_amount: prevAmount },
      valueAfter:  { disputeStatus: 'resolved', commission_amount: commission.commission_amount }
    });

    await commission.save();

    // Notify vendor by email
    try {
      const vendorEmail = commission.vendorId?.ownerId?.email;
      const vendorName  = commission.vendorId?.kitchenName || 'Vendor';
      const weekLabel   = commission.weekStart && commission.weekEnd
        ? `${new Date(commission.weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(commission.weekEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : (commission.week || '');

      if (vendorEmail) {
        const amountChanged = adjustedAmount !== undefined && Number(adjustedAmount) !== prevAmount;
        await sendEmail(
          vendorEmail,
          'MealSetu — Your Dispute Has Been Resolved',
          `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#2563eb;padding:20px;text-align:center;border-radius:10px 10px 0 0">
              <h1 style="color:white;margin:0">Dispute Resolved</h1>
            </div>
            <div style="background:white;padding:30px;border-radius:0 0 10px 10px;border:1px solid #e5e7eb">
              <p>Dear <strong>${vendorName}</strong>,</p>
              <p>Your dispute for the settlement <strong>${weekLabel}</strong> has been reviewed and resolved by MealSetu.</p>
              <div style="background:#eff6ff;padding:20px;border-radius:8px;border-left:4px solid #2563eb;margin:20px 0">
                <p style="margin:0"><strong>Admin Note:</strong></p>
                <p style="margin:8px 0 0;color:#374151">${resolutionNote.trim()}</p>
                ${amountChanged ? `<p style="margin:12px 0 0"><strong>Commission Adjusted:</strong> ₹${prevAmount?.toLocaleString('en-IN')} → ₹${commission.commission_amount?.toLocaleString('en-IN')}</p>` : ''}
              </div>
              ${commission.status !== 'paid' ? '<p>Please proceed with the updated payment from your vendor dashboard.</p>' : '<p>Your account is now up to date.</p>'}
              <p style="color:#64748b;font-size:13px">Thank you for bringing this to our attention.</p>
            </div>
          </div>`
        );
      }
    } catch (emailErr) {
      console.error('[resolveCommissionDispute] Email failed:', emailErr.message);
    }
    // Find this, right after the email try/catch in markCommissionPaid:
    if (commission.vendorId?.ownerId?._id) {
      const { notifyCommissionPaid } = require('../utils/fcmService');
      notifyCommissionPaid(commission.vendorId.ownerId._id, weekLabel, commission.commission_amount).catch(console.error);
      // ^ weekLabel is out of scope here — crashes
    }

    res.status(200).json({ success: true, commission });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// ===== END COMMISSION FUNCTIONS =====

// ===== REVIEW MODERATION FUNCTIONS =====

// Helper: recalculate vendor rating after hide/delete
const _recalcVendorRating = async (vendorId) => {
  const agg = await Review.aggregate([
    { $match: { vendorId: new mongoose.Types.ObjectId(vendorId), isHidden: { $ne: true } } },
    { $group: { _id: null, avg: { $avg: '$rating' }, total: { $sum: 1 } } },
  ]);
  const avg   = agg.length ? Math.round(agg[0].avg * 10) / 10 : 0;
  const count = agg.length ? agg[0].total : 0;
  await Vendor.findByIdAndUpdate(vendorId, { rating: avg, reviewCount: count });
};

// @desc    Get all reviews (with filters) for admin moderation
// @route   GET /api/admin/reviews
const getAdminReviews = async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page)  || 1);
    const limit    = Math.min(100, parseInt(req.query.limit) || 30);
    const skip     = (page - 1) * limit;
    const filter   = {};

    if (req.query.vendorId) filter.vendorId = req.query.vendorId;
    if (req.query.flagged === 'true')  filter.isFlagged = true;
    if (req.query.hidden  === 'true')  filter.isHidden  = true;
    if (req.query.hidden  === 'false') filter.isHidden  = false;
    if (req.query.rating)  filter.rating = parseInt(req.query.rating);

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('vendorId', 'kitchenName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(filter),
    ]);

    res.json({ reviews, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Admin getReviews error:', error);
    res.status(500).json({ message: 'Error fetching reviews' });
  }
};

// @desc    Hide (soft-delete) a review
// @route   PATCH /api/admin/reviews/:id/hide
const hideReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { isHidden: true, adminNote: req.body.adminNote || '' },
      { new: true }
    );
    if (!review) return res.status(404).json({ message: 'Review not found' });
    await _recalcVendorRating(review.vendorId);
    res.json({ message: 'Review hidden', reviewId: review._id });
  } catch (error) {
    console.error('Admin hideReview error:', error);
    res.status(500).json({ message: 'Error hiding review' });
  }
};

// @desc    Unhide a previously hidden review
// @route   PATCH /api/admin/reviews/:id/unhide
const unhideReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { isHidden: false, adminNote: '' },
      { new: true }
    );
    if (!review) return res.status(404).json({ message: 'Review not found' });
    await _recalcVendorRating(review.vendorId);
    res.json({ message: 'Review unhidden', reviewId: review._id });
  } catch (error) {
    console.error('Admin unhideReview error:', error);
    res.status(500).json({ message: 'Error unhiding review' });
  }
};

// @desc    Permanently delete a review
// @route   DELETE /api/admin/reviews/:id
const deleteReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found' });
    await _recalcVendorRating(review.vendorId);
    res.json({ message: 'Review deleted', reviewId: review._id });
  } catch (error) {
    console.error('Admin deleteReview error:', error);
    res.status(500).json({ message: 'Error deleting review' });
  }
};

// @desc    Unflag a review (clear flag after review)
// @route   PATCH /api/admin/reviews/:id/unflag
const unflagReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { isFlagged: false, flagReason: '', adminNote: req.body.adminNote || '' },
      { new: true }
    );
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json({ message: 'Review unflagged', reviewId: review._id });
  } catch (error) {
    console.error('Admin unflagReview error:', error);
    res.status(500).json({ message: 'Error unflagging review' });
  }
};
// @desc    One-time migration: sync all vendor ratings + backfill isVerifiedPurchase on old reviews
// @route   POST /api/admin/migrate-ratings
const migrateRatings = async (req, res) => {
  try {
    const Order = require('../models/Order');

    // ── Step 1: Backfill isVerifiedPurchase on reviews missing the field ──────
    const oldReviews = await Review.find({ isVerifiedPurchase: { $exists: false } }).lean();
    let verifiedFixed = 0;
    for (const rv of oldReviews) {
      const qualifyingOrder = await Order.findOne({
        userId:   rv.userId,
        vendorId: rv.vendorId,
        status:   { $in: ['active', 'trial', 'completed', 'expired'] },
      });
      await Review.findByIdAndUpdate(rv._id, {
        $set: {
          isVerifiedPurchase: !!qualifyingOrder,
          planType: rv.planType || qualifyingOrder?.planType || '',
          mealDate: rv.mealDate || qualifyingOrder?.orderDate || null,
        },
      });
      verifiedFixed++;
    }

    // ── Step 2: Recalculate rating + reviewCount for every vendor ────────────
    const vendors = await Vendor.find({}).select('_id').lean();
    let ratingSynced = 0;
    for (const v of vendors) {
      await _recalcVendorRating(v._id);
      ratingSynced++;
    }

    res.json({
      message:       'Migration complete',
      reviewsFixed:  verifiedFixed,
      vendorsSynced: ratingSynced,
    });
  } catch (error) {
    console.error('migrateRatings error:', error);
    res.status(500).json({ message: 'Migration failed', error: error.message });
  }
};
// ===== END REVIEW MODERATION FUNCTIONS =====

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD & MANAGEMENT — NEW ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// @desc  Platform-wide stat snapshot
// @route GET /api/admin/dashboard
const getPlatformDashboard = async (req, res) => {
  try {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [
      totalUsers, newUsersToday,
      totalVendors, activeVendors, pendingVendors,
      activeOrders, todayOrders,
      todayRevenueAgg, monthRevenueAgg, totalRevenueAgg,
      openComplaints, overdueCommissions,
      totalRiders, activeRiders,
      pendingTransactions,
      planBreakdown, topVendors, recentOrdersDocs,
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }).catch(() => 0),
      User.countDocuments({ role: 'user', createdAt: { $gte: todayStart } }).catch(() => 0),
      Vendor.countDocuments({}).catch(() => 0),
      Vendor.countDocuments({ isApproved: true }).catch(() => 0),
      Vendor.countDocuments({ isApproved: false }).catch(() => 0),
      Order.countDocuments({ status: { $in: ['active', 'trial'] }, endDate: { $gte: new Date() } }).catch(() => 0),
      Order.countDocuments({ $or: [{ createdAt: { $gte: todayStart } }, { orderDate: { $gte: todayStart } }] }).catch(() => 0),
      Order.aggregate([{ $match: { $or: [{ createdAt: { $gte: todayStart } }, { orderDate: { $gte: todayStart } }], paymentStatus: 'Paid' } }, { $group: { _id: null, t: { $sum: '$amount' } } }]).then(r => r[0]?.t || 0).catch(() => 0),
      Order.aggregate([{ $match: { $or: [{ createdAt: { $gte: monthStart } }, { orderDate: { $gte: monthStart } }], paymentStatus: 'Paid' } }, { $group: { _id: null, t: { $sum: '$amount' } } }]).then(r => r[0]?.t || 0).catch(() => 0),
      Order.aggregate([{ $match: { paymentStatus: 'Paid' } }, { $group: { _id: null, t: { $sum: '$amount' } } }]).then(r => r[0]?.t || 0).catch(() => 0),
      Complaint.countDocuments({ status: 'Open' }).catch(() => 0),
      Commission.countDocuments({ status: 'overdue' }).catch(() => 0),
      DeliveryPartner.countDocuments({}).catch(() => 0),
      DeliveryPartner.countDocuments({ isActive: true, isAvailable: true }).catch(() => 0),
      Order.countDocuments({ paymentStatus: 'Pending', paymentMethod: { $ne: 'Cash' }, createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }).catch(() => 0),
      // Active plan breakdown by type
      Order.aggregate([
        { $match: { status: { $in: ['active', 'trial'] } } },
        { $group: { _id: '$planType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).catch(() => []),
      // Top 5 vendors by all-time paid revenue
      Order.aggregate([
        { $match: { paymentStatus: 'Paid' } },
        { $group: { _id: '$vendorId', revenue: { $sum: '$amount' }, orders: { $sum: 1 } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'vendors', localField: '_id', foreignField: '_id', as: 'v' } },
        { $unwind: { path: '$v', preserveNullAndEmptyArrays: true } },
        { $project: { kitchenName: { $ifNull: ['$v.kitchenName', 'Unknown'] }, revenue: 1, orders: 1 } },
      ]).catch(() => []),
      // Last 5 orders for recent-orders panel
      Order.find({})
        .populate('userId', 'name phone')
        .populate('vendorId', 'kitchenName')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
        .catch(() => []),
    ]);

    // 7-day revenue trend — 14 parallel queries (7 days × 2)
    const trendDays = Array.from({ length: 7 }, (_, i) => {
      const dayStart = new Date(todayStart);
      dayStart.setDate(dayStart.getDate() - (6 - i));
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      return { dayStart, dayEnd };
    });

    const last7DaysTrend = await Promise.all(
      trendDays.map(async ({ dayStart, dayEnd }) => {
        const [rev, cnt] = await Promise.all([
          Order.aggregate([
            { $match: { $or: [{ createdAt: { $gte: dayStart, $lt: dayEnd } }, { orderDate: { $gte: dayStart, $lt: dayEnd } }], paymentStatus: 'Paid' } },
            { $group: { _id: null, t: { $sum: '$amount' } } },
          ]).then(r => r[0]?.t || 0).catch(() => 0),
          Order.countDocuments({ $or: [{ createdAt: { $gte: dayStart, $lt: dayEnd } }, { orderDate: { $gte: dayStart, $lt: dayEnd } }] }).catch(() => 0),
        ]);
        return {
          date: dayStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          revenue: rev,
          orders: cnt,
        };
      })
    );

    res.json({
      stats: {
        users:       { total: totalUsers, newToday: newUsersToday },
        vendors:     { total: totalVendors, active: activeVendors, pending: pendingVendors },
        orders:      { active: activeOrders, today: todayOrders },
        revenue:     { today: todayRevenueAgg, thisMonth: monthRevenueAgg, allTime: totalRevenueAgg },
        complaints:  { open: openComplaints },
        commissions: { overdue: overdueCommissions },
        delivery:    { total: totalRiders, available: activeRiders },
        pendingTransactions,
      },
      charts: {
        last7DaysTrend,
        planBreakdown: planBreakdown.map(p => ({ plan: p._id || 'Unknown', count: p.count })),
        topVendors:    topVendors.map(v => ({ kitchenName: v.kitchenName, revenue: v.revenue, orders: v.orders })),
      },
      recentOrders: recentOrdersDocs.map(o => ({
        customerName: o.userId?.name || o.customerName || o.manualCustomerName || '—',
        phone:        o.userId?.phone || o.manualCustomerPhone || '',
        kitchenName:  o.vendorId?.kitchenName || '—',
        planType:     o.planType,
        amount:       o.amount,
        status:       o.status,
        paymentStatus: o.paymentStatus,
        createdAt:    o.createdAt,
      })),
    });
  } catch (err) {
    console.error('getPlatformDashboard:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Live system health alerts
// @route GET /api/admin/alerts
const getSystemAlerts = async (req, res) => {
  try {
    const now = new Date();
    const alerts = [];

    const [stuckPayments, overdue, pendingV, flagged, stuckBatches] = await Promise.all([
      Order.countDocuments({ paymentStatus: 'Pending', paymentMethod: { $ne: 'Cash' }, createdAt: { $lt: new Date(now - 24 * 60 * 60 * 1000) } }).catch(() => 0),
      Commission.countDocuments({ status: 'overdue' }).catch(() => 0),
      Vendor.countDocuments({ status: 'pending', isApproved: { $ne: true } }).catch(() => 0),
      Review.countDocuments({ isFlagged: true }).catch(() => 0),
      DeliveryBatch.countDocuments({ batchStatus: 'in_progress', startedAt: { $lt: new Date(now - 4 * 60 * 60 * 1000) } }).catch(() => 0),
    ]);

    if (stuckPayments > 0) alerts.push({ type: 'error',   category: 'orders',    icon: '📦', title: `${stuckPayments} Stuck Payments`,    message: 'Online orders pending > 24 hours',     count: stuckPayments, tab: 'orders',      priority: 1 });
    if (overdue > 0)       alerts.push({ type: 'error',   category: 'commission',icon: '💰', title: `${overdue} Overdue Commissions`,      message: 'Vendors have unpaid commissions',       count: overdue,       tab: 'commission',  priority: 1 });
    if (pendingV > 0)      alerts.push({ type: 'warning', category: 'vendors',   icon: '🏪', title: `${pendingV} Pending Approvals`,       message: 'Vendor applications need review',      count: pendingV,      tab: 'requests',    priority: 2 });
    if (flagged > 0)       alerts.push({ type: 'warning', category: 'reviews',   icon: '⭐', title: `${flagged} Flagged Reviews`,          message: 'Reviews need moderation',              count: flagged,       tab: 'reviews',     priority: 2 });
    if (stuckBatches > 0)  alerts.push({ type: 'warning', category: 'delivery',  icon: '🛵', title: `${stuckBatches} Stuck Batches`,       message: 'Delivery batches active > 4 hours',    count: stuckBatches,  tab: 'delivery',    priority: 2 });

    alerts.sort((a, b) => a.priority - b.priority);
    res.json({ alerts, totalAlerts: alerts.length, criticalCount: alerts.filter(a => a.type === 'error').length });
  } catch (err) {
    console.error('getSystemAlerts:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Paginated orders for admin
// @route GET /api/admin/orders
const getAdminOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const query = {};

    if (status && status !== 'all') query.status = status;

    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { name:  { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ],
      }).select('_id').lean();
      const uIds = matchingUsers.map(u => u._id);
      query.$or = [
        { userId:             { $in: uIds } },
        { customerName:       { $regex: search, $options: 'i' } },
        { manualCustomerName: { $regex: search, $options: 'i' } },
      ];
    }

    const lim   = parseInt(limit);
    const skip  = (parseInt(page) - 1) * lim;
    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('userId',   'name email phone')
        .populate('vendorId', 'kitchenName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim),
      Order.countDocuments(query),
    ]);

    res.json({ orders, total, pages: Math.ceil(total / lim) });
  } catch (err) {
    console.error('getAdminOrders:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Admin cancels an order
// @route PATCH /api/admin/orders/:id/cancel
const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    order.status = 'cancelled';
    if (order.paymentStatus === 'Paid') order.paymentStatus = 'Refund Pending';
    await order.save();

    res.json({ success: true, message: 'Order cancelled' });
  } catch (err) {
    console.error('cancelOrder:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Paginated users with order + loyalty stats
// @route GET /api/admin/users/enhanced
const getUsersEnhanced = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const query = { role: 'user' };

    if (search) {
      query.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }
    if (status === 'active')   query.isActive = true;
    if (status === 'inactive') query.isActive = false;

    const lim  = parseInt(limit);
    const skip = (parseInt(page) - 1) * lim;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('name email phone address pincode isActive createdAt wallet')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim),
      User.countDocuments(query),
    ]);

    const userIds = users.map(u => u._id);
    const [orderStats, loyaltyData] = await Promise.all([
      Order.aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: '$userId', count: { $sum: 1 }, spent: { $sum: '$amount' } } },
      ]).catch(() => []),
      LoyaltyPoints.find({ userId: { $in: userIds } }).select('userId points').lean().catch(() => []),
    ]);

    const enriched = users.map(u => {
      const stats   = orderStats.find(s => s._id.toString() === u._id.toString());
      const loyalty = loyaltyData.find(l => l.userId.toString() === u._id.toString());
      return { ...u.toObject(), orderCount: stats?.count || 0, totalSpent: stats?.spent || 0, loyaltyPoints: loyalty?.points || 0 };
    });

    res.json({ users: enriched, total, pages: Math.ceil(total / lim) });
  } catch (err) {
    console.error('getUsersEnhanced:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Suspend a user
// @route PATCH /api/admin/users/:id/suspend
const suspendUser = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'User suspended' });
  } catch (err) {
    console.error('suspendUser:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Activate a suspended user
// @route PATCH /api/admin/users/:id/activate
const activateUser = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isActive: true });
    res.json({ success: true, message: 'User activated' });
  } catch (err) {
    console.error('activateUser:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Reviews with optional flag/hidden filter
// @route GET /api/admin/reviews/all
const getAdminReviewsEnhanced = async (req, res) => {
  try {
    const { filter = 'all' } = req.query;
    const query = {};
    if (filter === 'flagged') query.isFlagged = true;
    if (filter === 'hidden')  query.isHidden  = true;

    const reviews = await Review.find(query)
      .populate('userId',   'name email')
      .populate('vendorId', 'kitchenName')
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({ reviews, total: reviews.length });
  } catch (err) {
    console.error('getAdminReviewsEnhanced:', err);
    res.status(500).json({ message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// VENDOR-DRILL-DOWN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// @desc  Full stats snapshot for one vendor
// @route GET /api/admin/vendors/:vendorId/detail
const getVendorDetail = async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(vendorId)) return res.status(400).json({ message: 'Invalid vendor ID' });
    const vid = new mongoose.Types.ObjectId(vendorId);

    const [vendor, orderStats, riderCount, reviewStats] = await Promise.all([
      Vendor.findById(vid).populate('ownerId', 'name email phone').lean(),
      Order.aggregate([
        { $match: { vendorId: vid } },
        { $group: {
          _id: null,
          total:    { $sum: 1 },
          active:   { $sum: { $cond: [{ $in: ['$status', ['active', 'trial']] }, 1, 0] } },
          revenue:  { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, '$amount', 0] } },
          lastDate: { $max: '$createdAt' },
        }},
      ]).catch(() => []),
      DeliveryPartner.countDocuments({ vendorId: vid }).catch(() => 0),
      Review.aggregate([
        { $match: { vendorId: vid } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 }, flagged: { $sum: { $cond: ['$isFlagged', 1, 0] } } } },
      ]).catch(() => []),
    ]);

    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const os = orderStats[0] || {};
    const rs = reviewStats[0] || {};

    res.json({
      vendor,
      stats: {
        totalOrders:  os.total   || 0,
        activeOrders: os.active  || 0,
        revenue:      os.revenue || 0,
        lastOrderAt:  os.lastDate || null,
        riderCount,
        reviewCount:  rs.count   || 0,
        avgRating:    rs.avg ? Math.round(rs.avg * 10) / 10 : 0,
        flaggedReviews: rs.flagged || 0,
      },
    });
  } catch (err) {
    console.error('getVendorDetail:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Suspend a vendor (revoke approval)
// @route PATCH /api/admin/vendors/:vendorId/suspend
const suspendVendor = async (req, res) => {
  try {
    await Vendor.findByIdAndUpdate(req.params.vendorId, {
      isApproved: false,
      approvalStatus: 'Rejected',
      status: 'suspended',
    });
    res.json({ success: true, message: 'Vendor suspended' });
  } catch (err) {
    console.error('suspendVendor:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Paginated orders for a specific vendor
// @route GET /api/admin/vendors/:vendorId/orders
const getVendorOrders = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { page = 1, limit = 20, status } = req.query;

    const query = { vendorId };
    if (status && status !== 'all') query.status = status;

    const lim  = parseInt(limit);
    const skip = (parseInt(page) - 1) * lim;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('userId', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim),
      Order.countDocuments(query),
    ]);

    res.json({ orders, total, pages: Math.ceil(total / lim) });
  } catch (err) {
    console.error('getVendorOrders:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Cancel one order under a vendor
// @route PATCH /api/admin/vendors/:vendorId/orders/:orderId/cancel
const cancelVendorOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, vendorId: req.params.vendorId });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.status = 'cancelled';
    if (order.paymentStatus === 'Paid') order.paymentStatus = 'Refund Pending';
    await order.save();
    res.json({ success: true, message: 'Order cancelled' });
  } catch (err) {
    console.error('cancelVendorOrder:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Reviews for a vendor with star breakdown
// @route GET /api/admin/vendors/:vendorId/reviews
const getVendorReviews = async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(vendorId)) return res.status(400).json({ message: 'Invalid vendor ID' });
    const { filter = 'all', page = 1, limit = 20 } = req.query;

    const query = { vendorId };
    if (filter === 'flagged') query.isFlagged = true;
    if (filter === 'hidden')  query.isHidden  = true;

    const lim  = parseInt(limit);
    const skip = (parseInt(page) - 1) * lim;

    const [reviews, total, breakdown] = await Promise.all([
      Review.find(query)
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim)
        .lean(),
      Review.countDocuments(query),
      Review.aggregate([
        { $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
      ]).catch(() => []),
    ]);

    const starBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    breakdown.forEach(b => { if (b._id >= 1 && b._id <= 5) starBreakdown[b._id] = b.count; });

    res.json({ reviews, total, pages: Math.ceil(total / lim), starBreakdown });
  } catch (err) {
    console.error('getVendorReviews:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Delivery riders for a vendor with today's batch stats
// @route GET /api/admin/vendors/:vendorId/riders
const getVendorRiders = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

    const riders = await DeliveryPartner.find({ vendorId }).lean();

    const riderIds = riders.map(r => r._id);
    const todayBatches = await DeliveryBatch.find({
      vendorId,
      riderId: { $in: riderIds },
      batchDate: { $gte: todayStart },
    }).lean();

    const enriched = riders.map(rider => {
      const batches = todayBatches.filter(b => b.riderId?.toString() === rider._id.toString());
      let assigned = 0, delivered = 0;
      batches.forEach(b => {
        assigned  += b.orders?.length || 0;
        delivered += b.orders?.filter(o => o.status === 'delivered').length || 0;
      });
      return { ...rider, todayAssigned: assigned, todayDelivered: delivered };
    });

    res.json({ riders: enriched, total: enriched.length });
  } catch (err) {
    console.error('getVendorRiders:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Toggle a rider's active status
// @route PATCH /api/admin/vendors/:vendorId/riders/:riderId/toggle
const toggleVendorRider = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findOne({ _id: req.params.riderId, vendorId: req.params.vendorId });
    if (!rider) return res.status(404).json({ message: 'Rider not found' });
    rider.isActive = !rider.isActive;
    await rider.save();
    res.json({ success: true, isActive: rider.isActive });
  } catch (err) {
    console.error('toggleVendorRider:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Get stuck delivery batches for a vendor (in_progress > 4 hours)
// @route GET /api/admin/vendors/:vendorId/stuck-batches
const getVendorStuckBatches = async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(vendorId)) return res.status(400).json({ message: 'Invalid vendor ID' });

    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

    const batches = await DeliveryBatch.find({
      vendorId:    new mongoose.Types.ObjectId(vendorId),
      batchStatus: 'in_progress',
      startedAt:   { $lt: fourHoursAgo },
    })
      .populate('riderId', 'name phone')
      .sort({ startedAt: 1 })
      .lean();

    const result = batches.map(b => {
      const totalOrders     = b.orders?.length || 0;
      const deliveredOrders = b.orders?.filter(o => o.status === 'delivered').length || 0;
      const failedOrders    = b.orders?.filter(o => o.status === 'failed').length  || 0;
      const pendingOrders   = totalOrders - deliveredOrders - failedOrders;

      const stuckMs  = Date.now() - new Date(b.startedAt).getTime();
      const stuckH   = Math.floor(stuckMs / (1000 * 60 * 60));
      const stuckMin = Math.floor((stuckMs % (1000 * 60 * 60)) / (1000 * 60));

      return {
        _id:            b._id,
        mealSlot:       b.mealSlot,
        batchDate:      b.batchDate,
        startedAt:      b.startedAt,
        stuckFor:       `${stuckH}h ${stuckMin}m`,
        riderName:      b.riderId?.name  || 'Unassigned',
        riderPhone:     b.riderId?.phone || '',
        area:           b.area || '',
        totalOrders,
        deliveredOrders,
        failedOrders,
        pendingOrders,
      };
    });

    res.json({ batches: result, count: result.length });
  } catch (err) {
    console.error('getVendorStuckBatches:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Force-close a stuck delivery batch
// @route PATCH /api/admin/batches/:batchId/force-close
const forceCloseBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { reason, note } = req.body;

    if (!mongoose.Types.ObjectId.isValid(batchId)) return res.status(400).json({ message: 'Invalid batch ID' });
    if (!reason) return res.status(400).json({ message: 'A reason is required' });

    const batch = await DeliveryBatch.findById(batchId);
    if (!batch)                              return res.status(404).json({ message: 'Batch not found' });
    if (batch.batchStatus !== 'in_progress') return res.status(400).json({ message: 'Batch is not in progress' });

    // Mark all unresolved delivery orders as failed
    batch.orders.forEach(o => {
      if (!['delivered', 'failed'].includes(o.status)) {
        o.status     = 'failed';
        o.failReason = `Admin force-closed: ${reason}`;
      }
    });

    batch.batchStatus       = 'completed';
    batch.completedAt       = new Date();
    batch.forcedClose       = true;
    batch.forcedCloseReason = reason;
    batch.forcedCloseNote   = note || '';
    batch.forcedCloseAt     = new Date();
    batch.forcedCloseBy     = req.user._id;

    await batch.save();

    res.json({ success: true, message: 'Batch force-closed successfully' });
  } catch (err) {
    console.error('forceCloseBatch:', err);
    res.status(500).json({ message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CSV EXPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

const escapeCSVCell = (val) => {
  const str = String(val == null ? '' : val);
  return (str.includes(',') || str.includes('"') || str.includes('\n'))
    ? `"${str.replace(/"/g, '""')}"` : str;
};
const toCSVRow = (row) => row.map(escapeCSVCell).join(',');

// @desc  Export orders to CSV
// @route GET /api/admin/export/orders
const exportOrdersCSV = async (req, res) => {
  try {
    const safeDate = (d) => {
      if (!d) return 'N/A';
      const date = new Date(d);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const { vendorId, status, from, to } = req.query;
    const query = {};
    if (vendorId) query.vendorId = vendorId;
    if (status && status !== 'all') query.status = status;
    if (from || to) {
      query.orderDate = {};
      if (from) query.orderDate.$gte = new Date(from);
      if (to)   query.orderDate.$lte = new Date(to + 'T23:59:59');
    }

    const orders = await Order.find(query)
      .select('orderDate startDate endDate planType amount paymentMethod paymentStatus status deliveryStatus mealPreference manualCustomerName manualCustomerPhone userId vendorId _id')
      .populate('userId',   'name email phone')
      .populate('vendorId', 'kitchenName')
      .sort({ orderDate: -1 })
      .limit(5000);

    const headers = [
      'Order ID', 'Date', 'Customer Name', 'Customer Email', 'Customer Phone',
      'Kitchen Name', 'Plan Type', 'Amount (Rs)', 'Payment Method', 'Payment Status',
      'Order Status', 'Delivery Status', 'Start Date', 'End Date', 'Meal Preference',
    ];

    const rows = orders.map(o => [
      o._id.toString(),
      safeDate(o.orderDate || o.createdAt || (o._id ? new Date(parseInt(o._id.toString().substring(0, 8), 16) * 1000) : null)),
      o.userId?.name             || o.manualCustomerName  || 'N/A',
      o.userId?.email            || 'N/A',
      o.userId?.phone            || o.manualCustomerPhone || 'N/A',
      o.vendorId?.kitchenName    || 'N/A',
      o.planType                 || 'N/A',
      o.amount                   || 0,
      o.paymentMethod            || 'N/A',
      o.paymentStatus            || 'N/A',
      o.status                   || 'N/A',
      o.deliveryStatus           || 'N/A',
      safeDate(o.startDate),
      safeDate(o.endDate),
      o.mealPreference           || 'Regular',
    ]);

    const totalRevenue = orders.reduce((s, o) => s + (o.amount || 0), 0);
    rows.push([]);
    rows.push(['SUMMARY', '', '', '', `Total Orders: ${orders.length}`, `Total Revenue: Rs.${totalRevenue}`, '', '', '', '', '', '', '', '', '']);

    const csvLines = [
      [`MealSetu Orders Report - Generated ${new Date().toLocaleDateString('en-IN')}`],
      [],
      headers,
      ...rows,
    ].map(toCSVRow);

    const filename = vendorId
      ? `mealsetu-orders-vendor-${new Date().toISOString().split('T')[0]}.csv`
      : `mealsetu-orders-all-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csvLines.join('\n'));
  } catch (err) {
    console.error('exportOrdersCSV:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Export users/subscribers to CSV
// @route GET /api/admin/export/users
const exportUsersCSV = async (req, res) => {
  try {
    const safeDate = (d) => {
      if (!d) return 'N/A';
      const date = new Date(d);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const getAddr = (u) => {
      if (u.address && typeof u.address === 'object') return u.address;
      if (u.address && typeof u.address === 'string') return { city: u.address };
      return {};
    };
    const { vendorId, status } = req.query;

    // ── Vendor subscribers branch ──────────────────────────────────────────
    if (vendorId) {
      const orders = await Order.find({ vendorId })
        .populate('userId', 'name email phone address pincode isActive joinDate wallet')
        .lean();
      const seen = new Set();
      const users = orders
        .filter(o => {
          if (!o.userId?._id) return false;
          const id = o.userId._id.toString();
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .map(o => o.userId);

      const userIds = users.map(u => u._id).filter(Boolean);
      const orderStats = await Order.aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: '$userId', orderCount: { $sum: 1 }, totalSpent: { $sum: '$amount' }, lastOrder: { $max: '$orderDate' } } },
      ]).catch(() => []);

      const statsMap = {};
      orderStats.forEach(s => { statsMap[s._id.toString()] = s; });

      const headers = [
        'Name', 'Email', 'Phone', 'City', 'Area', 'Pincode',
        'Total Orders', 'Total Spent (Rs)', 'Wallet Balance (Rs)',
        'Account Status', 'Last Order Date', 'Joined Date',
      ];

      const rows = users.map(u => {
        const stats = statsMap[u._id?.toString()] || {};
        const addr  = getAddr(u);
        return [
          u.name    || 'N/A',
          u.email   || 'N/A',
          u.phone   || 'N/A',
          addr.city    || u.city    || 'N/A',
          addr.area    || 'N/A',
          addr.pincode || u.pincode || 'N/A',
          stats.orderCount || 0,
          stats.totalSpent || 0,
          u.wallet  || 0,
          u.isActive ? 'Active' : 'Suspended',
          stats.lastOrder ? safeDate(stats.lastOrder) : 'Never',
          safeDate(u.joinDate),
        ];
      });

      const totalSpent = rows.reduce((s, r) => s + (Number(r[7]) || 0), 0);
      rows.push([]);
      rows.push([`Total Users: ${users.length}`, `Total Spent: Rs.${totalSpent}`, '', '', '', '', '', '', '', '', '', '']);

      const csvLines = [
        [`MealSetu Subscribers Report - Generated ${new Date().toLocaleDateString('en-IN')}`],
        [],
        headers,
        ...rows,
      ].map(toCSVRow);

      const filename = `mealsetu-subscribers-${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send('﻿' + csvLines.join('\n'));
    }

    // ── All-users branch: two sections ────────────────────────────────────
    // Section 1: customers have role:'user'; vendors have role:'vendor' — already separate
    const customerQuery = { role: 'user' };
    if (status === 'active')   customerQuery.isActive = true;
    if (status === 'inactive') customerQuery.isActive = false;

    const realCustomers = await User.find(customerQuery)
      .select('name email phone address pincode isActive joinDate wallet _id')
      .lean();

    // Section 2: vendor owners have role:'vendor'
    const vendorOwners = await User.find({ role: 'vendor' })
      .select('name email phone joinDate isActive _id')
      .lean();

    // Get kitchen info from Vendor collection (address lives on the Vendor doc)
    const vendorDocs = await Vendor.find({}).select('ownerId kitchenName address pincode').lean();
    const vendorKitchenMap = {};
    vendorDocs.forEach(v => {
      if (!v.ownerId) return;
      const addr = (v.address && typeof v.address === 'object') ? v.address : {};
      vendorKitchenMap[v.ownerId.toString()] = {
        kitchenName: v.kitchenName || 'N/A',
        city:        addr.city    || '',
        area:        addr.area    || '',
        pincode:     addr.pincode || v.pincode || 'N/A',
      };
    });

    // Kitchen-aware order stats for customers
    const customerIds = realCustomers.map(u => new mongoose.Types.ObjectId(u._id));
    const customerOrderStats = await Order.aggregate([
      { $match: { userId: { $in: customerIds } } },
      { $sort:  { orderDate: -1 } },
      { $group: {
        _id:           '$userId',
        lastVendorId:  { $first: '$vendorId' },
        orderCount:    { $sum:   1 },
        totalSpent:    { $sum:   '$amount' },
        lastOrderDate: { $max:   '$orderDate' },
      }},
    ]).catch(() => []);

    const lastVendorIds = customerOrderStats.map(s => s.lastVendorId).filter(Boolean);
    const lastVendors   = await Vendor.find({ _id: { $in: lastVendorIds } }).select('_id kitchenName').lean();
    const vendorNameMap = {};
    lastVendors.forEach(v => { vendorNameMap[v._id.toString()] = v.kitchenName; });

    const customerStatsMap = {};
    customerOrderStats.forEach(s => {
      customerStatsMap[s._id.toString()] = {
        kitchenName:   s.lastVendorId ? (vendorNameMap[s.lastVendorId.toString()] || 'N/A') : 'No orders yet',
        orderCount:    s.orderCount    || 0,
        totalSpent:    s.totalSpent    || 0,
        lastOrderDate: s.lastOrderDate,
      };
    });

    const userHeaders = [
      'Name', 'Email', 'Phone', 'City', 'Area', 'Pincode',
      'Kitchen Ordered From', 'Total Orders', 'Total Spent (Rs)', 'Wallet Balance (Rs)',
      'Account Status', 'Last Order Date', 'Joined Date',
    ];
    const vendorHeaders = [
      'Name', 'Email', 'Phone', 'Kitchen Name',
      'City', 'Area', 'Pincode', 'Account Status', 'Joined Date',
    ];

    const customerRows = realCustomers.map(u => {
      const stats = customerStatsMap[u._id.toString()];
      const addr  = (() => {
        if (u.address && typeof u.address === 'object') return u.address;
        if (u.address && typeof u.address === 'string')
          return { city: u.address.split(',')[0]?.trim(), area: u.address };
        return {};
      })();
      return [
        u.name  || 'N/A',
        u.email || 'N/A',
        u.phone || 'N/A',
        addr.city    || 'N/A',
        addr.area    || 'N/A',
        addr.pincode || u.pincode || 'N/A',
        stats?.kitchenName   || 'No orders yet',
        stats?.orderCount    || 0,
        stats?.totalSpent    || 0,
        u.wallet || 0,
        u.isActive ? 'Active' : 'Suspended',
        safeDate(stats?.lastOrderDate),
        safeDate(u.joinDate),
      ];
    });

    const vendorOwnerRows = vendorOwners.map(u => {
      const info = vendorKitchenMap[u._id.toString()] || {};
      return [
        u.name  || 'N/A',
        u.email || 'N/A',
        u.phone || 'N/A',
        info.kitchenName || 'N/A',
        info.city        || 'N/A',
        info.area        || 'N/A',
        info.pincode     || 'N/A',
        u.isActive ? 'Active' : 'Suspended',
        safeDate(u.joinDate),
      ];
    });

    const totalSpent = customerRows.reduce((s, r) => s + (Number(r[8]) || 0), 0);

    const csvLines = [
      `MealSetu Users Report - Generated ${new Date().toLocaleDateString('en-IN')}`,
      `Exported by MealSetu Admin`,
      '',
      '=== SECTION 1: PLATFORM CUSTOMERS ===',
      `Total Customers: ${realCustomers.length}`,
      `Total Revenue from Customers: Rs.${totalSpent}`,
      '',
      toCSVRow(userHeaders),
      ...customerRows.map(toCSVRow),
      '',
      `Customer Summary: ${realCustomers.length} users | Total Spent: Rs.${totalSpent}`,
      '',
      '',
      '=== SECTION 2: VENDOR OWNERS ===',
      `Total Vendor Owners: ${vendorOwners.length}`,
      '',
      toCSVRow(vendorHeaders),
      ...vendorOwnerRows.map(toCSVRow),
      '',
      `Vendor Summary: ${vendorOwners.length} vendors`,
    ];

    const filename = `mealsetu-users-all-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csvLines.join('\n'));
  } catch (err) {
    console.error('exportUsersCSV:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Export delivery report to CSV
// @route GET /api/admin/export/delivery
const exportDeliveryReportCSV = async (req, res) => {
  try {
    const { vendorId, month, riderId } = req.query;

    let dateFilter = {};
    if (month) {
      const [year, mon] = month.split('-').map(Number);
      dateFilter = { batchDate: { $gte: new Date(year, mon - 1, 1), $lte: new Date(year, mon, 0, 23, 59, 59) } };
    } else {
      const now = new Date();
      dateFilter = { batchDate: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } };
    }

    const query = { ...dateFilter };
    if (vendorId) query.vendorId = vendorId;
    if (riderId)  query.riderId  = riderId;

    const batches = await DeliveryBatch.find(query)
      .populate('vendorId', 'kitchenName')
      .populate('riderId',  'name phone monthlySalary')
      .sort({ batchDate: -1 })
      .lean()
      .catch(() => []);

    // Per-rider performance summary
    const riderSummary = {};
    batches.forEach(batch => {
      const key = batch.riderId?._id?.toString();
      if (!key) return;
      if (!riderSummary[key]) {
        riderSummary[key] = {
          name: batch.riderId?.name || 'N/A', phone: batch.riderId?.phone || '',
          salary: batch.riderId?.monthlySalary || 0,
          batches: 0, totalOrders: 0, delivered: 0, failed: 0,
        };
      }
      riderSummary[key].batches++;
      (batch.orders || []).forEach(o => {
        riderSummary[key].totalOrders++;
        if (o.status === 'delivered') riderSummary[key].delivered++;
        if (o.status === 'failed')    riderSummary[key].failed++;
      });
    });

    const summaryHeaders = ['Rider Name', 'Phone', 'Monthly Salary (Rs)', 'Total Batches', 'Total Orders', 'Delivered', 'Failed', 'Success Rate %'];
    const summaryRows = Object.values(riderSummary).map(r => [
      r.name, r.phone, r.salary, r.batches, r.totalOrders, r.delivered, r.failed,
      r.totalOrders > 0 ? `${Math.round((r.delivered / r.totalOrders) * 100)}%` : '0%',
    ]);

    const orderHeaders = [
      'Date', 'Meal Slot', 'Area', 'Batch Status', 'Kitchen',
      'Rider Name', 'Rider Phone', 'Rider Salary (Rs)',
      'Customer Name', 'Customer Phone', 'Customer Area',
      'Delivery Status', 'Stop #', 'Estimated Time', 'Delivered At',
    ];

    const orderRows = [];
    batches.forEach(batch => {
      const batchDate  = new Date(batch.batchDate).toLocaleDateString('en-IN');
      const riderName  = batch.riderId?.name          || 'N/A';
      const riderPhone = batch.riderId?.phone         || '';
      const salary     = batch.riderId?.monthlySalary || 0;
      const kitchen    = batch.vendorId?.kitchenName  || 'N/A';
      (batch.orders || []).forEach(order => {
        orderRows.push([
          batchDate, batch.mealSlot || 'lunch', batch.area || 'N/A', batch.batchStatus || 'N/A', kitchen,
          riderName, riderPhone, salary,
          order.customerName || 'N/A', order.phone || 'N/A',
          order.address?.area || order.address?.city || 'N/A',
          order.status || 'pending', order.sequence || '',
          order.estimatedArrivalTime ? new Date(order.estimatedArrivalTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
          order.deliveredAt          ? new Date(order.deliveredAt).toLocaleTimeString('en-IN',          { hour: '2-digit', minute: '2-digit' }) : 'N/A',
        ]);
      });
    });

    const monthLabel = (() => {
      const d = month ? new Date(month + '-01') : new Date();
      return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    })();

    const csvLines = [
      `MealSetu Delivery Report - ${monthLabel}`,
      `Generated: ${new Date().toLocaleDateString('en-IN')}`,
      '',
      '=== RIDER PERFORMANCE SUMMARY ===',
      toCSVRow(summaryHeaders),
      ...summaryRows.map(toCSVRow),
      '',
      '=== DETAILED ORDER LOG ===',
      toCSVRow(orderHeaders),
      ...orderRows.map(toCSVRow),
    ];

    const filename = `mealsetu-delivery-${month || new Date().toISOString().slice(0, 7)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csvLines.join('\n'));
  } catch (err) {
    console.error('exportDeliveryReportCSV:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc  Export monthly platform summary to CSV
// @route GET /api/admin/export/summary
const exportPlatformSummaryCSV = async (req, res) => {
  try {
    const { month } = req.query;
    const now        = new Date();
    const monthStart = month ? new Date(month + '-01') : new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59);

    const [totalOrders, totalRevenue, newUsers, totalVendors, activeVendors, overdueComm] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: monthStart, $lte: monthEnd } }).catch(() => 0),
      Order.aggregate([
        { $match: { createdAt: { $gte: monthStart, $lte: monthEnd }, paymentStatus: 'Paid' } },
        { $group: { _id: null, t: { $sum: '$amount' } } },
      ]).then(r => r[0]?.t || 0).catch(() => 0),
      User.countDocuments({ role: 'user', createdAt: { $gte: monthStart, $lte: monthEnd } }).catch(() => 0),
      Vendor.countDocuments({}).catch(() => 0),
      Vendor.countDocuments({ isApproved: true }).catch(() => 0),
      Commission.countDocuments({ status: 'overdue' }).catch(() => 0),
    ]);

    const vendorBreakdown = await Order.aggregate([
      { $match: { createdAt: { $gte: monthStart, $lte: monthEnd }, paymentStatus: 'Paid' } },
      { $group: { _id: '$vendorId', revenue: { $sum: '$amount' }, orders: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
      { $lookup: { from: 'vendors', localField: '_id', foreignField: '_id', as: 'v' } },
      { $unwind: { path: '$v', preserveNullAndEmptyArrays: true } },
      { $project: { kitchenName: { $ifNull: ['$v.kitchenName', 'Unknown'] }, revenue: 1, orders: 1 } },
    ]).catch(() => []);

    const monthLabel = monthStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    const csvLines = [
      `MealSetu Platform Summary - ${monthLabel}`,
      `Generated: ${now.toLocaleDateString('en-IN')}`,
      '',
      '=== PLATFORM OVERVIEW ===',
      `Total Orders This Month,${totalOrders}`,
      `Total Revenue This Month,Rs.${totalRevenue}`,
      `New Users This Month,${newUsers}`,
      `Total Vendors,${totalVendors}`,
      `Active Vendors,${activeVendors}`,
      `Overdue Commissions,${overdueComm}`,
      '',
      '=== VENDOR REVENUE BREAKDOWN ===',
      'Rank,Kitchen Name,Orders,Revenue (Rs),Est. Commission (Rs)',
      ...vendorBreakdown.map((v, i) => [
        i + 1, escapeCSVCell(v.kitchenName), v.orders, v.revenue, Math.round(v.revenue * 0.05),
      ].join(',')),
    ];

    const filename = `mealsetu-summary-${month || now.toISOString().slice(0, 7)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csvLines.join('\n'));
  } catch (err) {
    console.error('exportPlatformSummaryCSV:', err);
    res.status(500).json({ message: err.message });
  }
};
// ... existing imports and controllers ...

const getDashboardLeaderboard = async (req, res) => {
  try {
    const Order = require('../models/Order');
    const Vendor = require('../models/Vendor');
    const Commission = require('../models/Commission');

    const now = new Date();
    const startOfMonth = new Date(
      now.getFullYear(), now.getMonth(), 1
    );
    const endOfMonth = new Date(
      now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59
    );
    const currentMonth = `${now.getFullYear()}-${String(
      now.getMonth() + 1).padStart(2, '0')}`;

    // Aggregate orders by vendor this month
    const vendorRevenue = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $group: {
          _id: '$vendorId',
          totalRevenue: { $sum: '$amount' },
          totalOrders: { $sum: 1 }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 }
    ]);

    // Get vendor details and commission status
    const leaderboard = await Promise.all(
      vendorRevenue.map(async (v) => {
        const vendor = await Vendor.findById(v._id)
          .select('kitchenName ownerName ownerId')
          .populate('ownerId', 'name');

        const commission = await Commission.findOne({
          vendorId: v._id,
          month: currentMonth
        });

        const commissionRate = 5;
        const commissionDue = commission?.commission_amount ||
          Math.round(v.totalRevenue * commissionRate / 100);

        return {
          _id: v._id,
          kitchenName: vendor?.kitchenName || 'Unknown',
          ownerName: vendor?.ownerId?.name ||
            vendor?.ownerName || 'N/A',
          totalRevenue: v.totalRevenue,
          totalOrders: v.totalOrders,
          commissionDue,
          commissionStatus: commission?.status || 'pending'
        };
      })
    );

    // Platform pulse stats
    const startOfWeek = new Date();
    startOfWeek.setDate(now.getDate() - 7);

    const vendorsWithNoOrders = await Vendor.aggregate([
      { $match: { isApproved: true, status: 'approved' } },
      {
        $lookup: {
          from: 'orders',
          let: { vid: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$vendorId', '$$vid'] },
                    { $gte: ['$orderDate', startOfWeek] }
                  ]
                }
              }
            }
          ],
          as: 'recentOrders'
        }
      },
      {
        $match: {
          'recentOrders': { $size: 0 }
        }
      },
      { $count: 'count' }
    ]);

    const commissionStats = await Commission.aggregate([
      { $match: { month: currentMonth } },
      {
        $group: {
          _id: null,
          totalCollected: {
            $sum: {
              $cond: [
                {
                  $in: ['$status', ['auto_deducted', 'paid']]
                },
                '$commission_amount',
                0
              ]
            }
          },
          totalPending: {
            $sum: {
              $cond: [
                {
                  $in: ['$status', ['pending', 'overdue']]
                },
                '$commission_amount',
                0
              ]
            }
          }
        }
      }
    ]);

    const avgOrderValue = await Order.aggregate([
      {
        $match: {
          orderDate: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          avg: { $avg: '$amount' }
        }
      }
    ]);

    res.json({
      leaderboard,
      pulse: {
        vendorsWithNoOrders: vendorsWithNoOrders[0]?.count || 0,
        commissionCollected:
          commissionStats[0]?.totalCollected || 0,
        commissionPending:
          commissionStats[0]?.totalPending || 0,
        avgOrderValue:
          Math.round(avgOrderValue[0]?.avg || 0)
      }
    });

  } catch (error) {
    console.error('getDashboardLeaderboard error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};


module.exports = {
  getPlatformSettings,
  updateCommissionRate,
  updatePlatformSettings, 
  getPendingVendors, 
  getAllUsers, 
  approveVendor, 
  rejectVendor,
  getAllVendorsForAdmin,
  getVendorSubscribers,
  autoMarkInactiveUsers,
  getAdminProfile,
  updateAdminProfile,
  getPublicAdminContact,
  getAllCommissions,
  getCommissionSummary,
  markCommissionPaid,
  getCommissionTiers,
  updateCommissionTiers,
  getCommissionVendors,
  getCommissionReportCSV,
  seedDefaultTiers,
  getVendorCommissionDetail,
  downloadVendorCommissionReport,
  getAdminVendorWeekOrders,
  getVendorPaymentHistory,
  getCommissionDisputes,
  resolveCommissionDispute,
  getAdminReviews,
  hideReview,
  unhideReview,
  deleteReview,
  unflagReview,
  migrateRatings,
  getPlatformDashboard,
  getSystemAlerts,
  getAdminOrders,
  cancelOrder,
  getUsersEnhanced,
  suspendUser,
  activateUser,
  getAdminReviewsEnhanced,
  getVendorDetail,
  suspendVendor,
  getVendorOrders,
  cancelVendorOrder,
  getVendorReviews,
  getVendorRiders,
  toggleVendorRider,
  getVendorStuckBatches,
  forceCloseBatch,
  exportOrdersCSV,
  exportUsersCSV,
  exportDeliveryReportCSV,
  exportPlatformSummaryCSV,
  getDashboardLeaderboard // Added here
};



