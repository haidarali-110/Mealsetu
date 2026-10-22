import React from 'react';
import { getVendorsByPincode } from '../../../../utils/api';

const PincodeLocationBar = ({ 
  userPincode, 
  setUserPincode, 
  pincodeInput, 
  setPincodeInput, 
  showPincodeInput, 
  setShowPincodeInput, 
  locationNote, 
  setLocationNote, 
  detectingLocation, 
  setDetectingLocation, 
  filteredTiffins, 
  setFilteredTiffins, 
  tiffins, 
  setLoading 
}) => {
  const handleDetectLocation = () => {
    setDetectingLocation(true);
    if (!navigator.geolocation) {
      alert('Geolocation not supported');
      setDetectingLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=AIzaSyCgJ0v4LEJaPxZUQR20A56GpBeFa8cf3LQ&language=en`
          );
          const data = await response.json();
          const components = data.results?.[0]?.address_components || [];
          const detectedPincode = components.find(c => c.types.includes('postal_code'))?.long_name;
          if (detectedPincode) {
            setUserPincode(detectedPincode);
            setPincodeInput(detectedPincode);
            handlePincodeSearch(detectedPincode);
          } else {
            alert('Could not detect pincode. Please enter manually.');
          }
        } catch (err) {
          alert('Detection failed. Please enter pincode manually.');
        } finally {
          setDetectingLocation(false);
        }
      },
      () => {
        setDetectingLocation(false);
        alert('Location permission denied. Please enter pincode manually.');
      }
    );
  };

  const handlePincodeSearch = async (pincode) => {
    if (!pincode) {
      setFilteredTiffins(tiffins || []);
      setLocationNote('');
      setUserPincode('');
      return;
    }
    
    setShowPincodeInput(false);
    setUserPincode(pincode);
    
    try {
      setLoading(true);
      const result = await getVendorsByPincode(pincode);
      setFilteredTiffins(result.vendors || []);
      if (result.locationNote) setLocationNote(result.locationNote);
    } catch (error) {
      console.error('Pincode search error:', error);
      setFilteredTiffins(tiffins || []);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        background: 'white', padding: '14px 20px',
        borderRadius: '12px', marginBottom: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexWrap: 'wrap'
      }}>
        <span style={{ fontSize: '18px' }}>📍</span>
        <span style={{ fontWeight: '600', color: '#1a2240', fontSize: '14px', flex: 1 }}>
          {userPincode ? `Showing vendors near ${userPincode}` : 'Select your location to find nearby vendors'}
        </span>
        <button
          onClick={() => setShowPincodeInput(!showPincodeInput)}
          style={{ background: 'none', border: '1px solid #f97316', color: '#f97316', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
        >
          Change
        </button>
        <button
          onClick={handleDetectLocation}
          disabled={detectingLocation}
          style={{ background: '#f97316', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', opacity: detectingLocation ? 0.6 : 1 }}
        >
          {detectingLocation ? 'Detecting...' : '📡 Detect Location'}
        </button>
      </div>

      {showPincodeInput && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Enter pincode (e.g. 396001)"
            value={pincodeInput}
            onChange={(e) => setPincodeInput(e.target.value)}
            maxLength={6}
            onKeyPress={(e) => e.key === 'Enter' && handlePincodeSearch(pincodeInput)}
            style={{ padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', width: '200px', outline: 'none' }}
          />
          <button
            onClick={() => handlePincodeSearch(pincodeInput)}
            style={{ background: '#1a2240', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
          >
            Search
          </button>
          <button
            onClick={() => handlePincodeSearch('')}
            style={{ background: 'white', color: '#64748b', border: '1px solid #e2e8f0', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}
          >
            Show All
          </button>
        </div>
      )}

      {locationNote && (
        <div style={{
          padding: '10px 16px', borderRadius: '8px',
          fontSize: '13px', fontWeight: '600', marginBottom: '16px',
          background: locationNote === 'nearby' ? '#dcfce7' : '#eff6ff',
          color: locationNote === 'nearby' ? '#16a34a' : '#2563eb'
        }}>
          {locationNote === 'nearby'
            ? `✅ Showing vendors near your area (${userPincode})`
            : '📦 No vendors in your exact area. Showing all available vendors in the city.'}
        </div>
      )}
    </>
  );
};

export default PincodeLocationBar;

