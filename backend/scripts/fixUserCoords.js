/**
 * Re-geocode user delivery addresses that have missing or clearly-wrong coordinates.
 * Uses Nominatim OpenStreetMap (free, no API key needed).
 *
 * Run:  node scripts/fixUserCoords.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const User = require('../models/User');

async function geocode(addrObj) {
  const parts = [
    addrObj.flatHouseNo,
    addrObj.street,
    addrObj.area,
    addrObj.landmark,
    addrObj.city,
    addrObj.pincode,
    'India',
  ].filter(Boolean);

  const q   = encodeURIComponent(parts.join(', '));
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;

  try {
    const res  = await fetch(url, { headers: { 'User-Agent': 'MealSetu/1.0 fix-user-coords' } });
    const data = await res.json();
    if (data?.[0]) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.error('  Geocode fetch error:', err.message);
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isCoordSuspicious(lat, lon) {
  // Coordinates outside India bounding box are wrong
  if (lat == null || lon == null) return true;
  if (lat === 0 && lon === 0)    return true;
  if (lat < 6 || lat > 36)       return true;
  if (lon < 68 || lon > 98)      return true;
  return false;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB\n');

  const users = await User.find({ 'address.city': { $exists: true } })
    .select('name email address');

  console.log(`Found ${users.length} user(s) with address\n`);
  let fixed = 0, skipped = 0, failed = 0;

  for (const user of users) {
    const addr = user.address;
    if (!addr) { skipped++; continue; }

    const needsGeocode = isCoordSuspicious(addr.latitude, addr.longitude);

    if (!needsGeocode) {
      console.log(`OK     ${user.name || user.email} — lat=${addr.latitude}, lon=${addr.longitude}`);
      skipped++;
      continue;
    }

    console.log(`FIX    ${user.name || user.email}`);
    console.log(`  addr : ${addr.fullAddress || JSON.stringify(addr)}`);
    console.log(`  old  : lat=${addr.latitude}, lon=${addr.longitude}`);

    const coords = await geocode(addr);
    if (coords) {
      user.address.latitude  = coords.lat;
      user.address.longitude = coords.lon;
      await user.save();
      console.log(`  new  : lat=${coords.lat}, lon=${coords.lon}`);
      fixed++;
    } else {
      console.log('  FAIL : Nominatim returned no result');
      failed++;
    }

    // Nominatim rate limit: 1 req/sec
    await sleep(1200);
  }

  console.log(`\nDone. Fixed: ${fixed}  Skipped: ${skipped}  Failed: ${failed}`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
