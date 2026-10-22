const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Order = require('../models/Order');
const User = require('../models/User');
const DeliveryBatch = require('../models/DeliveryBatch');
const { geocodeAddress } = require('../utils/geocode');
const { isValidCoordinate } = require('../utils/geo');

const applyChanges = process.argv.includes('--apply');

const addressText = (address) => {
  if (typeof address === 'string') return address.trim();
  if (!address || typeof address !== 'object') return '';
  return [
    address.flatHouseNo,
    address.street,
    address.area,
    address.landmark,
    address.city,
    address.pincode
  ].filter(Boolean).join(', ');
};

const coordinateNumber = (value) => {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && value.trim() === '')) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const hasCoordinates = (address) =>
  isValidCoordinate(coordinateNumber(address?.latitude), coordinateNumber(address?.longitude));

const geocodeAddressObject = async (address, fallbackPincode) => {
  const query = addressText(address) || fallbackPincode || '';
  if (!query) return null;
  return geocodeAddress(`${query}, India`);
};

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI must be configured in backend/.env');
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Address coordinate backfill mode: ${applyChanges ? 'APPLY' : 'DRY RUN'}`);

  const users = await User.find({ role: 'user' })
    .select('name address pincode')
    .lean();
  const missingUsers = users.filter((user) => !hasCoordinates(user.address));
  const usersById = new Map(users.map((user) => [String(user._id), user]));
  const orders = await Order.find({})
    .select('_id userId source isManualOrder manualCustomerAddress manualCustomerPincode')
    .lean();
  const batches = await DeliveryBatch.find({})
    .select('orders.orderId orders.address')
    .lean();
  const batchCoordinates = new Map();
  for (const batch of batches) {
    for (const item of batch.orders || []) {
      if (!batchCoordinates.has(String(item.orderId)) && hasCoordinates(item.address)) {
        batchCoordinates.set(String(item.orderId), {
          lat: Number(item.address.latitude),
          lng: Number(item.address.longitude)
        });
      }
    }
  }
  const missingOrders = orders.filter((order) => {
    const user = usersById.get(String(order.userId));
    return !hasCoordinates(order.manualCustomerAddress) &&
      !hasCoordinates(user?.address) &&
      !batchCoordinates.has(String(order._id));
  });

  let usersGeocoded = 0;
  let ordersGeocoded = 0;
  let failedLookups = 0;
  console.log(`Users missing valid coordinates: ${missingUsers.length}`);
  console.log(`Orders missing valid delivery coordinates: ${missingOrders.length}`);

  for (const user of missingUsers) {
    const coords = await geocodeAddressObject(user.address, user.pincode);
    if (!coords) {
      failedLookups += 1;
      console.log(`NO MATCH user=${user._id}`);
      continue;
    }
    usersGeocoded += 1;
    console.log(`MATCH user=${user._id} lat=${coords.lat} lng=${coords.lng}`);
    user.address = {
      ...(user.address || {}),
      latitude: coords.lat,
      longitude: coords.lng
    };
    if (applyChanges) {
      await User.updateOne(
        { _id: user._id },
        { $set: { address: user.address } }
      );
    }
  }

  for (const order of missingOrders) {
    let sourceAddress = order.manualCustomerAddress;
    let fallbackPincode = order.manualCustomerPincode;
    let coords = hasCoordinates(sourceAddress) ? {
      lat: Number(sourceAddress.latitude),
      lng: Number(sourceAddress.longitude)
    } : null;

    if (!coords && order.userId) {
      const user = usersById.get(String(order.userId));
      if (hasCoordinates(user?.address)) {
        coords = { lat: Number(user.address.latitude), lng: Number(user.address.longitude) };
        sourceAddress = sourceAddress || user.address;
      } else if (!sourceAddress) {
        sourceAddress = user?.address;
      }
      if (!fallbackPincode) fallbackPincode = user?.pincode || user?.address?.pincode;
      if (!addressText(sourceAddress)) sourceAddress = user?.address || sourceAddress;
    }
    if (!coords) {
      coords = await geocodeAddressObject(sourceAddress, fallbackPincode);
    }
    if (!coords) {
      failedLookups += 1;
      console.log(`NO MATCH order=${order._id}`);
      continue;
    }

    ordersGeocoded += 1;
    console.log(`MATCH order=${order._id} lat=${coords.lat} lng=${coords.lng}`);
    if (applyChanges) {
      const isManualOrder = order.source === 'manual' ||
        order.isManualOrder === true ||
        order.manualCustomerAddress;
      if (isManualOrder) {
        await Order.updateOne(
          { _id: order._id },
          { $set: {
            manualCustomerAddress: {
              ...(order.manualCustomerAddress || {}),
              latitude: coords.lat,
              longitude: coords.lng
            }
          } }
        );
      }
      await DeliveryBatch.updateMany(
        { 'orders.orderId': order._id },
        {
          $set: {
            'orders.$[item].address.latitude': coords.lat,
            'orders.$[item].address.longitude': coords.lng
          }
        },
        { arrayFilters: [{ 'item.orderId': order._id }] }
      );
    }
  }

  console.log(
    `Complete. users=${missingUsers.length} usersGeocoded=${usersGeocoded} ` +
    `manualOrders=${missingOrders.length} ordersGeocoded=${ordersGeocoded} failedLookups=${failedLookups}`
  );
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('Address coordinate backfill failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
