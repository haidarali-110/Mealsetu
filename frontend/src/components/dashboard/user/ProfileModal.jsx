import React, { useState, useRef, useEffect } from 'react';
import './ProfileModal.css';



function parseAddress(addr) {
  if (!addr) return { flatHouseNo: '', street: '', area: '', landmark: '', city: '', pincode: '', latitude: null, longitude: null };
  if (typeof addr === 'string') return { flatHouseNo: '', street: addr, area: '', landmark: '', city: '', pincode: '', latitude: null, longitude: null };
  return {
    flatHouseNo: addr.flatHouseNo || '',
    street:      addr.street      || '',
    area:        addr.area        || '',
    landmark:    addr.landmark    || '',
    city:        addr.city        || '',
    pincode:     addr.pincode     || '',
    latitude:    addr.latitude    ?? null,
    longitude:   addr.longitude   ?? null,
  };
}

const ProfileModal = ({ user, onSave, onClose, onPhotoChange }) => {
  const [name,  setName]  = useState(user.name  || '');
  const [email, setEmail] = useState(user.email || '');
  const [phone, setPhone] = useState(user.phone || '');

  const parsed = parseAddress(user.address);
  const [flatHouseNo, setFlatHouseNo] = useState(parsed.flatHouseNo);
  const [street,      setStreet]      = useState(parsed.street);
  const [area,        setArea]        = useState(parsed.area);
  const [landmark,    setLandmark]    = useState(parsed.landmark);
  const [city,        setCity]        = useState(parsed.city);
  const [pincode,     setPincode]     = useState(parsed.pincode || user.pincode || '');

  const [lat,          setLat]         = useState(parsed.latitude);
  const [lng,          setLng]         = useState(parsed.longitude);
  // 'idle' | 'searching' | 'found' | 'notfound'
  const [geoStatus,    setGeoStatus]   = useState(parsed.latitude ? 'found' : 'idle');

  const [searchQuery,  setSearchQuery]  = useState('');
  const [suggestions,  setSuggestions]  = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [fetching,     setFetching]     = useState(false);
  const [saving,       setSaving]       = useState(false);

  const debounceRef  = useRef(null);
  const dropdownRef  = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchSuggestions = async (q) => {
    if (q.length < 3) { setSuggestions([]); setShowDropdown(false); return; }
    setFetching(true);
    try {
      const { getPlacePredictions } = await import('../../../utils/googleMaps');
      const predictions = await getPlacePredictions(q);
      setSuggestions(predictions);
      setShowDropdown(predictions.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setFetching(false);
    }
  };

  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    setLat(null); setLng(null); setGeoStatus('idle');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(q), 400);
  };

  const handleSelectSuggestion = async (s) => {
    setSearchQuery(s.description || '');
    setShowDropdown(false);
    setSuggestions([]);
    setGeoStatus('searching');
    try {
      const { getPlaceDetails } = await import('../../../utils/googleMaps');
      const details = await getPlaceDetails(s.place_id);
      if (details) {
        if (details.area)    setArea(details.area);
        if (details.city)    setCity(details.city);
        if (details.pincode) setPincode(details.pincode);
        setLat(details.lat);
        setLng(details.lng);
        setGeoStatus('found');
      }
    } catch { setGeoStatus('idle'); }
  };

  // Fallback: geocode using current field values when saving without autocomplete
  const geocodeFallback = async () => {
    const q = [area, city, pincode].filter(Boolean).join(', ');
    if (!q || q.length < 4) return null;
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=AIzaSyCgJ0v4LEJaPxZUQR20A56GpBeFa8cf3LQ&region=in&language=en`
      );
      const data = await res.json();
      const loc = data.results?.[0]?.geometry?.location;
      if (loc) return { lat: loc.lat, lng: loc.lng };
    } catch {}
    return null;
  };

  const handleSave = async () => {
    setSaving(true);
    let finalLat = lat;
    let finalLng = lng;

    if (!finalLat || !finalLng) {
      setGeoStatus('searching');
      const geo = await geocodeFallback();
      if (geo) {
        finalLat = geo.lat;
        finalLng = geo.lng;
        setGeoStatus('found');
      } else {
        setGeoStatus('notfound');
      }
    }

    const pin = pincode.trim();
    const addressObj = {
      flatHouseNo: flatHouseNo.trim(),
      street:      street.trim(),
      area:        area.trim(),
      landmark:    landmark.trim(),
      city:        city.trim(),
      pincode:     pin,
      fullAddress: [flatHouseNo, street, area, landmark, city, pin]
        .map(s => s.trim()).filter(Boolean).join(', '),
      latitude:  finalLat  || null,
      longitude: finalLng || null,
    };

    onSave({
      name, email, phone,
      address:   addressObj,
      pincode:   pin,
      latitude:  finalLat  || null,
      longitude: finalLng || null,
    });
    setSaving(false);
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0',
    borderRadius: '8px', fontSize: '14px', outline: 'none',
    boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px', display: 'block' };
  const groupStyle = { marginBottom: '14px' };
  const rowStyle   = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' };

  const geoStatusInfo = {
    found:     { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: '📍', text: 'Location coordinates saved — rider will navigate here accurately.' },
    notfound:  { color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '⚠️', text: 'Could not find exact coordinates. Delivery will use pincode area.' },
    searching: { color: '#0ea5e9', bg: '#f0f9ff', border: '#bae6fd', icon: '🔍', text: 'Finding location coordinates…' },
  };
  const geo = geoStatusInfo[geoStatus];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Edit Profile</h3>
        </div>

        <div className="photo-section">
          <div className="avatar-wrapper">
            <img
              src={user.profilePic}
              className="avatar-main"
              alt="User"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgdmlld0JveD0iMCAwIDE1MCAxNTAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjE1MCIgaGVpZ2h0PSIxNTAiIGZpbGw9IiNlMmU4ZjAiLz48Y2lyY2xlIGN4PSI3NSIgY3k9IjU1IiByPSI0MCIgZmlsbD0iI2YzZjVmMiIvPjxwYXRoIGQ9Ik0zNSAxMzBDMzUgMTAyLjM4NCA1Mi4zODQgODAgODAgODBINzBDOTcuNjE2IDgwIDExNSAxMDIuMzg0IDExNSAxMzBWMTUwSDMzek0xMjUgMTUwaC05MG0xMjUgMGgtOTBtLTEyNSAwaC05MCIgZmlsbD0iI2U0ZThmMCIvPjwvc3ZnPg==';
              }}
            />
            <label className="upload-badge">
              <i className="camera-icon">+</i>
              <input type="file" accept="image/*" onChange={onPhotoChange} hidden />
            </label>
          </div>
        </div>

        <div className="modal-body">
          {/* Personal info */}
          <div style={groupStyle}>
            <label style={labelStyle}>Full Name</label>
            <input style={inputStyle} type="text" value={name}
              onChange={(e) => setName(e.target.value)} placeholder="Mosin Ali" />
          </div>

          <div style={rowStyle}>
            <div style={groupStyle}>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="mosin@example.com" />
            </div>
            <div style={groupStyle}>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} type="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" />
            </div>
          </div>

          {/* Address section header */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: '700', fontSize: '14px', color: '#111827', marginBottom: '4px' }}>
              Delivery Address
            </div>
            <div style={{ width: '40px', height: '3px', backgroundColor: '#f26522', borderRadius: '2px' }} />
          </div>

          {/* Location search autocomplete */}
          <div style={{ ...groupStyle, position: 'relative' }} ref={dropdownRef}>
            <label style={labelStyle}>Search Area / Locality</label>
            <div style={{ position: 'relative' }}>
              <input
                style={{ ...inputStyle, paddingRight: '36px' }}
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Type your area, e.g. Koramangala, Bengaluru…"
                autoComplete="off"
              />
              <span style={{
                position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                fontSize: '16px', pointerEvents: 'none',
              }}>
                {fetching ? '⏳' : '🔍'}
              </span>
            </div>

            {/* Suggestions dropdown */}
            {showDropdown && suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
                background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', marginTop: '4px',
              }}>
                {suggestions.map((s, i) => {
                  const sf = s.structured_formatting || {};
                  const title = sf.main_text || s.description?.split(',')[0] || '';
                  const sub   = sf.secondary_text || '';
                  return (
                    <div
                      key={i}
                      onMouseDown={() => handleSelectSuggestion(s)}
                      style={{
                        padding: '10px 14px', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid #f1f5f9' : 'none',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}
                    >
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e' }}>📍 {title}</div>
                      {sub && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{sub}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Geo status badge */}
          {geo && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
              background: geo.bg, border: `1px solid ${geo.border}`, borderRadius: '8px',
              marginBottom: '14px', fontSize: '12px', color: geo.color, fontWeight: '600',
            }}>
              <span>{geo.icon}</span>
              <span>{geo.text}</span>
            </div>
          )}

          {/* Address fields */}
          <div style={rowStyle}>
            <div style={groupStyle}>
              <label style={labelStyle}>Flat / House No</label>
              <input style={inputStyle} type="text" value={flatHouseNo}
                onChange={(e) => setFlatHouseNo(e.target.value)} placeholder="e.g. 101, Block B" />
            </div>
            <div style={groupStyle}>
              <label style={labelStyle}>Street / Road</label>
              <input style={inputStyle} type="text" value={street}
                onChange={(e) => setStreet(e.target.value)} placeholder="e.g. MG Road" />
            </div>
          </div>

          <div style={rowStyle}>
            <div style={groupStyle}>
              <label style={labelStyle}>Area / Locality</label>
              <input style={inputStyle} type="text" value={area}
                onChange={(e) => setArea(e.target.value)} placeholder="e.g. Koramangala" />
            </div>
            <div style={groupStyle}>
              <label style={labelStyle}>Landmark (optional)</label>
              <input style={inputStyle} type="text" value={landmark}
                onChange={(e) => setLandmark(e.target.value)} placeholder="e.g. Near City Mall" />
            </div>
          </div>

          <div style={rowStyle}>
            <div style={groupStyle}>
              <label style={labelStyle}>City</label>
              <input style={inputStyle} type="text" value={city}
                onChange={(e) => setCity(e.target.value)} placeholder="e.g. Bengaluru" />
            </div>
            <div style={groupStyle}>
              <label style={labelStyle}>Pin Code</label>
              <input style={inputStyle} type="text" value={pincode}
                onChange={(e) => setPincode(e.target.value)} placeholder="383001" maxLength={6} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose} disabled={saving}>Discard</button>
          <button className="btn-save" onClick={handleSave} disabled={saving}>
            {saving ? '📍 Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
