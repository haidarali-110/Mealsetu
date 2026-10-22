require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const OrderSchema  = new mongoose.Schema({}, { strict: false });
const VendorSchema = new mongoose.Schema({}, { strict: false });
const Order  = mongoose.model('Order',  OrderSchema,  'orders');
const Vendor = mongoose.model('Vendor', VendorSchema, 'vendors');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected\n');

  const allOrders  = await Order.find({}).lean();
  const allVendors = await Vendor.find({}).lean();

  console.log('=== TOTALS ===');
  console.log('Total orders:', allOrders.length);
  console.log('Total vendors:', allVendors.length);

  if (allOrders[0]) {
    const s = allOrders[0];
    console.log('\n=== SAMPLE ORDER ===');
    console.log('Fields:', Object.keys(s).join(', '));
    console.log('vendorId value:', s.vendorId);
    console.log('vendorId type:', typeof s.vendorId);
    console.log('vendorId._bsontype:', s.vendorId?._bsontype);
    console.log('status:', s.status);
    console.log('amount:', s.amount);
    console.log('createdAt:', s.createdAt);
    console.log('orderDate:', s.orderDate);
    console.log('startDate:', s.startDate);
  }

  const allStatuses = [...new Set(allOrders.map(o => o.status))];
  console.log('\n=== UNIQUE ORDER STATUSES ===', allStatuses);

  console.log('\n=== VENDOR ORDER COUNTS ===');
  for (const v of allVendors) {
    const byObjId  = await Order.countDocuments({ vendorId: v._id });
    const byString = await Order.countDocuments({ vendorId: v._id.toString() });
    console.log(`  ${v.kitchenName} | isApproved=${v.isApproved} | _id=${v._id} | byObjectId=${byObjId} | byString=${byString}`);
  }

  console.log('\n=== ALL ORDER vendorId VALUES ===');
  allOrders.forEach((o, i) => {
    console.log(`  order[${i}] vendorId=${o.vendorId} | status=${o.status} | amount=${o.amount}`);
  });

  await mongoose.disconnect();
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
