import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapPicker.css';

export default function MapPicker({ initialLat, initialLng, onConfirm, onClose }) {
  const mapRef       = useRef(null);
  const mapInstance  = useRef(null);
  const geocodeTimer = useRef(null);
  const blueDotRef   = useRef(null);

  const defaultLat = initialLat || 21.17;
  const defaultLng = initialLng || 72.83;

  const [center,    setCenter]    = useState({ lat: defaultLat, lng: defaultLng });
  const [address,   setAddress]   = useState({ street: '', area: '', city: '', pincode: '' });
  const [isLoading, setIsLoading] = useState(false);

  const reverseGeocode = async (lat, lng) => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'MealSetu/1.0' } }
      );
      const data = await res.json();
      const a       = data.address || {};
      const hasCity = a.city || a.town;
      setAddress({
        street:  [a.house_number, a.road || a.pedestrian || a.footway].filter(Boolean).join(' '),
        area:    a.suburb || a.neighbourhood || a.quarter || a.hamlet || a.locality ||
                 (hasCity ? a.village : null) || '',
        city:    a.city || a.town || a.village || a.municipality || '',
        pincode: a.postcode || '',
      });
    } catch (_) {}
    setIsLoading(false);
  };

  useEffect(() => {
    if (mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 16,
      zoomControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    mapInstance.current = map;

    // Force layout recalculation so tiles load correctly inside modal
    setTimeout(() => map.invalidateSize(), 100);

    // Geocode the initial centre on open
    reverseGeocode(defaultLat, defaultLng);

    // Live location blue dot — shown as a circleMarker (no browser overlay)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const { latitude, longitude } = coords;
          // Outer accuracy ring
          L.circle([latitude, longitude], {
            radius: 30,
            color: '#4285f4',
            fillColor: '#4285f4',
            fillOpacity: 0.12,
            weight: 1,
          }).addTo(map);
          // Blue dot
          const dot = L.circleMarker([latitude, longitude], {
            radius: 8,
            fillColor: '#4285f4',
            color: '#ffffff',
            weight: 2,
            fillOpacity: 1,
          }).addTo(map);
          blueDotRef.current = dot;
        },
        () => {},
        { timeout: 8000, maximumAge: 30000 }
      );
    }

    map.on('move', () => {
      const c = map.getCenter();
      setCenter({ lat: c.lat, lng: c.lng });
      clearTimeout(geocodeTimer.current);
      geocodeTimer.current = setTimeout(() => reverseGeocode(c.lat, c.lng), 700);
    });

    return () => {
      clearTimeout(geocodeTimer.current);
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  const handleConfirm = () => {
    onConfirm({ lat: center.lat, lng: center.lng, ...address });
  };

  return (
    <div className="mp-overlay">
      <div className="mp-modal">

        {/* Top bar */}
        <div className="mp-header">
          <button className="mp-back-btn" onClick={onClose}>
            <span className="mp-back-icon">&#8592;</span>
          </button>
          <div className="mp-header-text">
            <div className="mp-title">Pin Your Location</div>
            <div className="mp-subtitle">Pan &amp; zoom to position the pin exactly</div>
          </div>
          {isLoading && <div className="mp-spinner-small" />}
        </div>

        {/* Map + fixed centre pin */}
        <div className="mp-map-wrap">
          <div ref={mapRef} className="mp-map" />
          <div className="mp-pin-wrap">
            <div className="mp-pin-circle">🍽️</div>
            <div className="mp-pin-stem" />
            <div className="mp-pin-dot" />
          </div>
        </div>

        {/* Bottom address card */}
        <div className="mp-card">
          <div className="mp-detected-row">
            <span className="mp-detected-icon">📍</span>
            <span className="mp-detected-label">Detected Address</span>
          </div>

          {isLoading ? (
            <p className="mp-loading-text">Fetching address…</p>
          ) : (
            <div className="mp-addr-lines">
              {address.street && (
                <div className="mp-addr-line"><span>🛣️</span> {address.street}</div>
              )}
              {address.area && (
                <div className="mp-addr-line"><span>🏘️</span> {address.area}</div>
              )}
              {(address.city || address.pincode) && (
                <div className="mp-addr-line">
                  <span>🏙️</span>{' '}
                  {[address.city, address.pincode].filter(Boolean).join('  —  ')}
                </div>
              )}
              {!address.street && !address.area && !address.city && (
                <p className="mp-no-address">
                  No address found — you can still confirm this spot.
                </p>
              )}
            </div>
          )}

          <button className="mp-confirm-btn" onClick={handleConfirm}>
            ✔ Confirm Location
          </button>
        </div>

      </div>
    </div>
  );
}
