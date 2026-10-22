const express = require('express');
const router  = express.Router();
const https   = require('https');

const KEY = 'AIzaSyCgJ0v4LEJaPxZUQR20A56GpBeFa8cf3LQ';

function googleGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// GET /api/maps/geocode/reverse?lat=&lng=
router.get('/geocode/reverse', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ status: 'INVALID_REQUEST', results: [] });
  try {
    const data = await googleGet(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${KEY}&language=en`
    );
    res.json(data);
  } catch {
    res.status(502).json({ status: 'ERROR', results: [] });
  }
});

// GET /api/maps/geocode?address=   (forward geocode for typed address fallback)
router.get('/geocode', async (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ status: 'INVALID_REQUEST', results: [] });
  try {
    const data = await googleGet(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${KEY}&region=in&language=en`
    );
    res.json(data);
  } catch {
    res.status(502).json({ status: 'ERROR', results: [] });
  }
});

// GET /api/maps/places/autocomplete?input=
router.get('/places/autocomplete', async (req, res) => {
  const { input } = req.query;
  if (!input) return res.status(400).json({ status: 'INVALID_REQUEST', predictions: [] });
  try {
    const data = await googleGet(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${KEY}&components=country:in&language=en`
    );
    res.json(data);
  } catch {
    res.status(502).json({ status: 'ERROR', predictions: [] });
  }
});

// GET /api/maps/places/details?place_id=
router.get('/places/details', async (req, res) => {
  const { place_id } = req.query;
  if (!place_id) return res.status(400).json({ status: 'INVALID_REQUEST' });
  try {
    const data = await googleGet(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place_id)}&key=${KEY}&fields=geometry,address_components,name&language=en`
    );
    res.json(data);
  } catch {
    res.status(502).json({ status: 'ERROR' });
  }
});

module.exports = router;
