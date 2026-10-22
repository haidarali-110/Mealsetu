const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Menu = require('../models/Menu');

// Sample data configuration
const SAMPLE_USERS = [
  {
    name: 'Admin User',
    email: 'admin@mealsetu.com',
    password: 'admin123',
    phone: '+91 9876543210',
    role: 'admin',
    isActive: true
  },
  {
    name: 'Priya Sharma',
    email: 'priya.vendor@mealsetu.com',
    password: 'vendor123',
    phone: '+91 9876543211',
    role: 'vendor',
    isActive: true,
    vendorData: {
      kitchenName: 'Annapurna Home Kitchen',
      address: '123 Food Lane, Sector 21, Gandhinagar, Gujarat',
      pincode: '382021',
      approvalStatus: 'Approved',
      menuPrice: 80,
      rating: 4.8,
      workingDays: 'Mon - Sat',
      timings: '11:00 AM - 10:00 PM'
    }
  },
  {
    name: 'Rajesh Patel',
    email: 'rajesh.vendor@mealsetu.com',
    password: 'vendor123',
    phone: '+91 9876543212',
    role: 'vendor',
    isActive: true,
    vendorData: {
      kitchenName: 'Mom\'s Magic Kitchen',
      address: '456 Taste Street, Satellite, Ahmedabad, Gujarat',
      pincode: '380015',
      approvalStatus: 'Approved',
      menuPrice: 100,
      rating: 4.9,
      workingDays: 'All Days',
      timings: '09:00 AM - 09:00 PM'
    }
  },
  {
    name: 'Sonal Gupta',
    email: 'sonal.vendor@mealsetu.com',
    password: 'vendor123',
    phone: '+91 9876543213',
    role: 'vendor',
    isActive: true,
    vendorData: {
      kitchenName: 'Healthy Eats Cafe',
      address: '789 Wellness Way, Vastrapur, Ahmedabad, Gujarat',
      pincode: '380006',
      approvalStatus: 'Rejected',
      rejectionReason: 'FSSAI license expired. Please submit renewed license.',
      menuPrice: 90,
      rating: 4.4,
      workingDays: 'Mon - Fri',
      timings: '10:00 AM - 08:00 PM'
    }
  },
  {
    name: 'Mosin Ali',
    email: 'mosin@mealsetu.com',
    password: 'user123',
    phone: '+91 9876543220',
    address: 'Himatnagar, Gujarat',
    pincode: '383001',
    role: 'user',
    isActive: true
  },
  {
    name: 'Priya Singh',
    email: 'priya.user@mealsetu.com',
    password: 'user123',
    phone: '+91 9876543221',
    address: 'Ahmedabad, Gujarat',
    pincode: '380001',
    role: 'user',
    isActive: true
  },
  {
    name: 'Rajesh Kumar',
    email: 'rajesh.user@mealsetu.com',
    password: 'user123',
    phone: '+91 9876543222',
    address: 'Gandhinagar, Gujarat',
    pincode: '382021',
    role: 'user',
    isActive: false
  },
  {
    name: 'Sneha Kapoor',
    email: 'sneha.user@mealsetu.com',
    password: 'user123',
    phone: '+91 9876543223',
    address: 'Baroda, Gujarat',
    pincode: '390001',
    role: 'user',
    isActive: true
  }
];

// Sample menus for today
const SAMPLE_MENUS = [
  { mainSabji: 'Paneer Butter Masala', altSabji: 'Mix Veg', sweetItem: 'Gulab Jamun', dietaryCategory: 'Regular' },
  { mainSabji: 'Aloo Gobi', altSabji: 'Dal Tadka', sweetItem: 'Rasgulla', dietaryCategory: 'Regular' }
];

/**
 * Smart Seeder - Uses Upsert (Update or Insert) strategy
 * Checks if records exist before creating them
 * Preserves existing real-world data
 */
const seedDatabase = async (options = {}) => {
  const { force = false, verbose = true } = options;
  
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    if (verbose) console.log('Connected to MongoDB');

    // Check existing data count
    const userCount = await User.countDocuments();
    const vendorCount = await Vendor.countDocuments();

    // If data exists and not forced, skip seeding
    if (!force && userCount > 0 && vendorCount > 0) {
      if (verbose) {
        console.log('\n⚠ Database already contains data. Skipping seed.');
        console.log(`   Users: ${userCount}, Vendors: ${vendorCount}`);
        console.log('\n💡 Run with { force: true } to re-seed anyway.');
      }
      return { status: 'skipped', userCount, vendorCount };
    }

    // Hash passwords once
    const salt = await bcrypt.genSalt(10);
    
    // Process each sample user
    const createdUsers = {};
    const createdVendors = {};
    
    for (const userData of SAMPLE_USERS) {
      // Check if user already exists by email
      let user = await User.findOne({ email: userData.email });
      
      if (user) {
        // User exists - skip but store reference
        if (verbose) console.log(`✓ User exists (skipping): ${userData.email}`);
        createdUsers[userData.email] = user;
      } else {
        // Create new user
        const hashedPassword = await bcrypt.hash(userData.password, salt);
        user = await User.create({
          ...userData,
          password: hashedPassword,
          joinDate: new Date()
        });
        if (verbose) console.log(`✓ User created: ${userData.email}`);
        createdUsers[userData.email] = user;
      }

      // If this is a vendor user, also create vendor profile
      if (userData.role === 'vendor' && userData.vendorData) {
        const existingVendor = await Vendor.findOne({ ownerId: user._id });
        
        if (existingVendor) {
          if (verbose) console.log(`✓ Vendor exists (skipping): ${userData.vendorData.kitchenName}`);
          createdVendors[userData.vendorData.kitchenName] = existingVendor;
        } else {
          const vendor = await Vendor.create({
            ownerId: user._id,
            ...userData.vendorData,
            submittedDate: new Date()
          });
          if (verbose) console.log(`✓ Vendor created (${userData.vendorData.approvalStatus}): ${userData.vendorData.kitchenName}`);
          createdVendors[userData.vendorData.kitchenName] = vendor;
        }
      }
    }

    // Create sample menus for APPROVED vendors only
    const today = new Date();
    const approvedVendors = Object.values(createdVendors).filter(v => v.approvalStatus === 'Approved');
    const pendingVendors = Object.values(createdVendors).filter(v => v.approvalStatus === 'Pending');
    
    for (let i = 0; i < approvedVendors.length; i++) {
      const vendor = approvedVendors[i];
      // Check if menu exists for today
      const existingMenu = await Menu.findOne({
        vendorId: vendor._id,
        date: {
          $gte: new Date(today.setHours(0, 0, 0, 0)),
          $lt: new Date(today.setHours(23, 59, 59, 999))
        }
      });
      
      if (!existingMenu && SAMPLE_MENUS[i]) {
        await Menu.create({
          vendorId: vendor._id,
          date: new Date(),
          ...SAMPLE_MENUS[i],
          cycleType: 'Daily'
        });
        if (verbose) console.log(`✓ Sample menu created for: ${vendor.kitchenName}`);
      }
    }

    // Also add menu for pending vendor (for demo purposes)
    if (pendingVendors.length > 0) {
      const pendingVendor = pendingVendors[0];
      const existingMenu = await Menu.findOne({ vendorId: pendingVendor._id });
      if (!existingMenu) {
        await Menu.create({
          vendorId: pendingVendor._id,
          date: new Date(),
          mainSabji: 'Paneer Butter Masala',
          altSabji: 'Mix Veg',
          sweetItem: 'Gulab Jamun',
          dietaryCategory: 'Regular',
          cycleType: 'Daily'
        });
      }
    }

    const finalUserCount = await User.countDocuments();
    const finalVendorCount = await Vendor.countDocuments();

    if (verbose) {
      console.log('\n✅ Database seeded successfully!');
      console.log(`   Total Users: ${finalUserCount}`);
      console.log(`   Total Vendors: ${finalVendorCount}`);
      console.log('\n📋 Test Credentials:');
      console.log('Admin:');
      console.log('  Email: admin@mealsetu.com');
      console.log('  Password: admin123');
      console.log('\nVendor (Approved):');
      console.log('  Email: rajesh.vendor@mealsetu.com');
      console.log('  Password: vendor123');
      console.log('\nVendor (Pending):');
      console.log('  Email: priya.vendor@mealsetu.com');
      console.log('  Password: vendor123');
      console.log('\nUser:');
      console.log('  Email: mosin@mealsetu.com');
      console.log('  Password: user123');
    }

    return { status: 'seeded', userCount: finalUserCount, vendorCount: finalVendorCount };
  } catch (error) {
    console.error('Seeding error:', error);
    throw error;
  }
};

/**
 * Check if database is empty
 */
const isDatabaseEmpty = async () => {
  try {
    const userCount = await User.countDocuments();
    const vendorCount = await Vendor.countDocuments();
    return userCount === 0 && vendorCount === 0;
  } catch (error) {
    console.error('Error checking database:', error);
    return true; // Assume empty on error to trigger seeding
  }
};

/**
 * Get seed statistics
 */
const getSeedStats = async () => {
  const userCount = await User.countDocuments();
  const vendorCount = await Vendor.countDocuments();
  const menuCount = await Menu.countDocuments();
  
  return { userCount, vendorCount, menuCount };
};

// Run seeding if this file is executed directly
if (require.main === module) {
  require('dotenv').config();
  
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  
  seedDatabase({ force, verbose: true })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { seedDatabase, isDatabaseEmpty, getSeedStats };

