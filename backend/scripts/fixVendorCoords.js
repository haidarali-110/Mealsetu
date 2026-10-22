/**
 * One-time script: re-geocode Mom's Magic Kitchen (and any vendor with
 * a missing or clearly-wrong lat/lon) using Nominatim OpenStreetMap.
 *
 * Run:  node scripts/fixVendorCoords.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Vendor = require('../models/Vendor');

async function geocode(address, pincode) {
  const q = encodeURIComponent(`${address}, ${pincode}, India`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
  const res  = await fetch(url, { headers: { 'User-Agent': 'MealSetu/1.0 fix-script' } });
  const data = await res.json();
  if (data && data[0]) {
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  }
  return null;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const vendors = await Vendor.find({ isApproved: true })
    .select('kitchenName address pincode latitude longitude');

  console.log(`Found ${vendors.length} approved vendor(s)\n`);

  for (const v of vendors) {
    if (!v.address || !v.pincode) {
      console.log(`SKIP  ${v.kitchenName} — no address/pincode`);
      continue;
    }

    console.log(`Geocoding: ${v.kitchenName}`);
    console.log(`  address : ${v.address}, ${v.pincode}`);
    console.log(`  current : lat=${v.latitude}, lon=${v.longitude}`);

    const coords = await geocode(v.address, v.pincode);
    if (coords) {
      v.latitude  = coords.lat;
      v.longitude = coords.lon;
      await v.save();
      console.log(`  updated : lat=${coords.lat}, lon=${coords.lon}`);
    } else {
      console.log(`  FAILED  : Nominatim returned no result`);
    }

    // Nominatim rate limit: 1 req / sec
    await sleep(1200);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

run().catch(err => { console.error(err); process.exit(1); });
