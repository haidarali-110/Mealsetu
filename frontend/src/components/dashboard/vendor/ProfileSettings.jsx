import React, { useState } from 'react';
import './ProfileSettings.css';

// Parse vendor kitchen address from either object or legacy string
function parseAddress(addr) {
  if (!addr) return { street: '', area: '', landmark: '', city: '', pincode: '' };
  if (typeof addr === 'string') return { street: addr, area: '', landmark: '', city: '', pincode: '' };
  return {
    street:   addr.street   || '',
    area:     addr.area     || '',
    landmark: addr.landmark || '',
    city:     addr.city     || '',
    pincode:  addr.pincode  || '',
  };
}

const ProfileSettings = ({ profile, onProfileChange, onImageUpload, onSave }) => {
  const [kitchenName, setKitchenName] = useState(profile.kitchenName || '');

  const parsed = parseAddress(profile.address || profile.kitchenAddress);
  const [street,   setStreet]   = useState(parsed.street);
  const [area,     setArea]     = useState(parsed.area);
  const [landmark, setLandmark] = useState(parsed.landmark);
  const [city,     setCity]     = useState(parsed.city);
  const [pincode,  setPincode]  = useState(parsed.pincode || profile.pincode || '');

  const [detectedLat, setDetectedLat] = useState(null);
  const [detectedLng, setDetectedLng] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [locationDetected, setLocationDetected] = useState(false);

  const detectGPS = async () => {
    if (!navigator.geolocation) return;
    setIsDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;
        setDetectedLat(latitude);
        setDetectedLng(longitude);
        try {
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=AIzaSyCgJ0v4LEJaPxZUQR20A56GpBeFa8cf3LQ&language=en`
          );
          const data = await res.json();
          const comps = data.results?.[0]?.address_components || [];
          const get = (...types) => comps.find(c => types.some(t => c.types.includes(t)))?.long_name || '';
          const s = get('route', 'premise');           if (s) setStreet(s);
          const ar = get('sublocality_level_1', 'sublocality', 'neighborhood'); if (ar) setArea(ar);
          const ct = get('locality', 'administrative_area_level_2');            if (ct) setCity(ct);
          const pc = get('postal_code');               if (pc) setPincode(pc);
        } catch (_) {}
        setLocationDetected(true);
        setIsDetecting(false);
      },
      () => setIsDetecting(false),
      { timeout: 10000 }
    );
  };

  const handleSave = () => {
    const pin = pincode.trim();
    const addressObj = {
      street:      street.trim(),
      area:        area.trim(),
      landmark:    landmark.trim(),
      city:        city.trim(),
      pincode:     pin,
      fullAddress: [street, area, landmark, city, pin].map(s => s.trim()).filter(Boolean).join(', '),
    };
    if (detectedLat !== null) addressObj.latitude  = detectedLat;
    if (detectedLng !== null) addressObj.longitude = detectedLng;
    onSave({ kitchenName, address: addressObj, pincode: pin });
  };

  const inputCls = 'profile-input';

  return (
    <div className="profile-settings">
      <h3>Kitchen Profile Settings</h3>
      <div className="profile-form">
        <div className="form-left">
          <div className="form-group">
            <label>Kitchen Name</label>
            <input
              type="text"
              className={inputCls}
              value={kitchenName}
              onChange={(e) => setKitchenName(e.target.value)}
            />
          </div>

          {/* Address section */}
          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <label style={{ marginBottom: 0 }}>Kitchen Address</label>
              <button
                type="button"
                onClick={detectGPS}
                disabled={isDetecting}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '5px 12px', borderRadius: '6px',
                  backgroundColor: '#f26522', color: 'white',
                  border: 'none', cursor: isDetecting ? 'not-allowed' : 'pointer',
                  fontSize: '12px', fontWeight: '600', opacity: isDetecting ? 0.7 : 1,
                }}
              >
                {isDetecting ? 'Detecting…' : locationDetected ? '📍 Re-detect' : '📍 Detect Location'}
              </button>
            </div>

            <input
              type="text" className={inputCls}
              placeholder="Street / Road (e.g. MG Road)"
              value={street} onChange={(e) => setStreet(e.target.value)}
              style={{ marginBottom: '8px' }}
            />
            <input
              type="text" className={inputCls}
              placeholder="Area / Locality *"
              value={area} onChange={(e) => setArea(e.target.value)}
              style={{ marginBottom: '8px' }}
            />
            <input
              type="text" className={inputCls}
              placeholder="Landmark (optional)"
              value={landmark} onChange={(e) => setLandmark(e.target.value)}
              style={{ marginBottom: '8px' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input
                type="text" className={inputCls}
                placeholder="City *"
                value={city} onChange={(e) => setCity(e.target.value)}
              />
              <input
                type="text" className={inputCls}
                placeholder="Pincode"
                value={pincode} onChange={(e) => setPincode(e.target.value)}
                maxLength={6}
              />
            </div>
          </div>
        </div>

        <div className="form-right">
          <div className="image-upload">
            {profile.image ? (
              <img src={profile.image} alt="Kitchen Preview" />
            ) : (
              <span>No Image</span>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            id="imageUpload"
            hidden
            onChange={onImageUpload}
          />
          <label htmlFor="imageUpload" className="upload-btn">
            Change Image
          </label>
        </div>
      </div>

      <button className="save-btn" onClick={handleSave}>
        Save Changes
      </button>

    </div>
  );
};

export default ProfileSettings;
