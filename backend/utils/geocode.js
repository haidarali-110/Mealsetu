/**
 * Geocode an address string to { lat, lng } using Google Maps Geocoding API.
 * Falls back to null if the key is missing or the request fails.
 *
 * Usage:
 *   const { geocodeAddress } = require('../utils/geocode');
 *   const coords = await geocodeAddress('Tarsadi, Bardoli, 394350, India');
 *   // coords = { lat: 21.122, lng: 73.106 }  or  null
 */

const geocodeAddress = async (query) => {
  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) {
    console.warn('GOOGLE_MAPS_KEY not set — skipping geocoding');
    return null;
  }

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(query)}&key=${key}&region=in`;

  try {
    const res  = await fetch(url);
    const data = await res.json();

    if (data.status === 'OK' && data.results?.[0]) {
      const loc = data.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }

    // ZERO_RESULTS or other non-OK status — not an error, just no match
    if (data.status !== 'OK') {
      console.log(`Geocode "${query}" → ${data.status}`);
    }
  } catch (err) {
    console.error('geocodeAddress error:', err.message);
  }
  return null;
};

module.exports = { geocodeAddress };
