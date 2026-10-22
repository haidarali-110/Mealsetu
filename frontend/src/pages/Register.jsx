import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../components/common/Toast';
import { resendRegisterOTP, verifyRegisterOTP } from '../utils/api';
import { setAuthItem } from '../utils/authStorage';

import './Register.css';

export default function Register() {
  const { addToast: showToast } = useToast();
  const [role, setRole] = useState('user');
  const [profilePic, setProfilePic] = useState(null);
  const [profilePicFile, setProfilePicFile] = useState(null);
  
  // State for Kitchen Poster/Banner (for vendors)
  const [kitchenPoster, setKitchenPoster] = useState(null);
  const [kitchenPosterFile, setKitchenPosterFile] = useState(null);
  
  // State for Vendor Documents
  const [docs, setDocs] = useState({ fssai: '', gst: '' });
  const [docFiles, setDocFiles] = useState({ fssai: null, gst: null });
  
// Form data state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    pincode: '',
    flatHouseNo: '',
    street: '',
    area: '',
    landmark: '',
    city: '',
    kitchenName: '',
    kitchenShopNo:   '',
    kitchenStreet:   '',
    kitchenArea:     '',
    kitchenLandmark: '',
    kitchenCity:     '',
    kitchenPincode:  '',
    kitchenLat:      null,
    kitchenLng:      null,
  });

  // Customer location state
  const [detectedLat, setDetectedLat] = useState(null);
  const [detectedLng, setDetectedLng] = useState(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [userLocationDetected, setUserLocationDetected] = useState(false);

  // Vendor location state
  const [vendorLocationDetected, setVendorLocationDetected] = useState(false);
  const [isDetectingVendorLocation, setIsDetectingVendorLocation] = useState(false);

  // User address autocomplete state
  const [userSearchQuery,  setUserSearchQuery]  = useState('');
  const [userSuggestions,  setUserSuggestions]  = useState([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userFetching,     setUserFetching]     = useState(false);
  const [userGeoStatus,    setUserGeoStatus]    = useState('idle'); // 'idle'|'found'|'notfound'

  // Vendor address autocomplete state
  const [vendorSearchQuery,  setVendorSearchQuery]  = useState('');
  const [vendorSuggestions,  setVendorSuggestions]  = useState([]);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [vendorFetching,     setVendorFetching]     = useState(false);

  // Refs for autocomplete dropdowns + debounce
  const userDropdownRef   = useRef(null);
  const vendorDropdownRef = useRef(null);
  const userDebounce      = useRef(null);
  const vendorDebounce    = useRef(null);

  // Errors state for form validation
  const [errors, setErrors] = useState({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // OTP Verification Modal States
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [otpUserId, setOtpUserId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Refs for OTP inputs
  const otpRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  // Close autocomplete dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target))   setShowUserDropdown(false);
      if (vendorDropdownRef.current && !vendorDropdownRef.current.contains(e.target)) setShowVendorDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (showOTPModal && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      setCanResend(true);
    }
  }, [showOTPModal, countdown]);

  // Handle OTP input change
  const handleOtpChange = (e, index) => {
    const value = e.target.value;
    
    if (value.length <= 1) {
      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);
      
      // Auto-focus next input
      if (value && index < 5) {
        otpRefs[index + 1].current.focus();
      }

      // Auto-verify when all 6 digits are filled
      const otpValue = newOtp.join('');
      if (otpValue.length === 6) {
        handleVerifyOTP(otpValue);
      }
    }
  };

  const handleOtpKeyDown = (e, index) => {
    // Handle backspace
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs[index - 1].current.focus();
    }
  };

// Verify OTP
  const handleVerifyOTP = async (otpValue) => {
    if (!otpValue || otpValue.length !== 6) return;
    
    setOtpLoading(true);
    setOtpError('');

    try {
      const data = await verifyRegisterOTP(otpUserId, otpValue);
      
      // Close modal
      setShowOTPModal(false);
      showToast('Email verified successfully! Please login with your credentials.', 'success');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setOtpError(err.message || 'Invalid OTP. Please try again.');
      // Shake animation
      setOtp(['', '', '', '', '', '']);
      otpRefs[0].current.focus();
    } finally {
      setOtpLoading(false);
    }
  };

  // Resend OTP
  const handleResendOTP = async () => {
    setOtpLoading(true);
    setOtpError('');

    try {
      const data = await resendRegisterOTP(otpUserId);
      setMaskedEmail(data.maskedEmail);
      setCountdown(60);
      setCanResend(false);
      setOtp(['', '', '', '', '', '']);
      otpRefs[0].current.focus();
    } catch (err) {
      setOtpError(err.message || 'Failed to resend OTP. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setProfilePic(reader.result);
      reader.readAsDataURL(file);
      setProfilePicFile(file);
    }
  };

  // Handle kitchen poster change
  const handleKitchenPosterChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setKitchenPoster(reader.result);
      reader.readAsDataURL(file);
      setKitchenPosterFile(file);
    }
  };

  const handleDocChange = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      setDocs(prev => ({ ...prev, [type]: file.name }));
      setDocFiles(prev => ({ ...prev, [type]: file }));
    }
  };

  // User GPS detect
  const detectGPS = async () => {
    if (!navigator.geolocation) {
      showToast('Geolocation not supported by your browser', 'error');
      return;
    }

    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;
        setDetectedLat(latitude);
        setDetectedLng(longitude);
        try {
          const res = await fetch(
            `/api/maps/geocode/reverse?lat=${latitude}&lng=${longitude}`
          );
          if (!res.ok) throw new Error('Reverse geocoding failed');
          const data = await res.json();
          const components = data.results?.[0]?.address_components || [];
          const get = (...types) => components.find(c => types.some(t => c.types.includes(t)))?.long_name || '';
          const flatNo  = get('street_number');
          const street  = get('route', 'premise');
          const city    = get('locality', 'administrative_area_level_2');
          const area    = get('sublocality_level_1', 'sublocality', 'neighborhood') || city;
          const pincode = get('postal_code');
          if (!flatNo && !street && !area && !city && !pincode) throw new Error('No address components returned');
          setFormData(prev => ({
            ...prev,
            flatHouseNo: flatNo || prev.flatHouseNo,
            street:      street || prev.street,
            area:        area   || prev.area,
            city:        city   || prev.city,
            pincode:     pincode || prev.pincode,
          }));
          setErrors(prev => {
            const next = { ...prev };
            delete next.area; delete next.city; delete next.pincode;
            return next;
          });
          setUserLocationDetected(true);
          const missingDetails = [];
          if (!street) missingDetails.push('street/road');
          if (!flatNo) missingDetails.push('flat/house number');
          showToast(missingDetails.length
            ? `Area, city and pincode filled. ${missingDetails.join(' and ')} were not available from map data; enter them manually.`
            : 'Location detected and address fields filled. You can still edit them before submitting.',
          missingDetails.length ? 'warning' : 'success');
        } catch {
          showToast('Could not fetch address. Fill manually.', 'warning');
        }
        setIsDetectingLocation(false);
      },
      () => {
        showToast('Location access denied. Please fill address manually.', 'error');
        setIsDetectingLocation(false);
      },
      { timeout: 10000 }
    );
  };

  // Vendor GPS detect
  const detectVendorLocation = async () => {
    if (!navigator.geolocation) {
      showToast('Geolocation not supported by your browser', 'error');
      return;
    }

    setIsDetectingVendorLocation(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;
        try {
          const res = await fetch(
            `/api/maps/geocode/reverse?lat=${latitude}&lng=${longitude}`
          );
          if (!res.ok) throw new Error('Reverse geocoding failed');
          const data = await res.json();
          const components = data.results?.[0]?.address_components || [];
          const get = (...types) => components.find(c => types.some(t => c.types.includes(t)))?.long_name || '';
          const shopNo  = get('street_number');
          const street  = get('route', 'premise');
          const city    = get('locality', 'administrative_area_level_2');
          const area    = get('sublocality_level_1', 'sublocality', 'neighborhood') || city;
          const pincode = get('postal_code');
          if (!shopNo && !street && !area && !city && !pincode) throw new Error('No address components returned');
          setFormData(prev => ({
            ...prev,
            kitchenShopNo: shopNo || prev.kitchenShopNo,
            kitchenStreet: street || prev.kitchenStreet,
            kitchenArea:   area   || prev.kitchenArea,
            kitchenCity:   city   || prev.kitchenCity,
            kitchenPincode: pincode || prev.kitchenPincode,
            kitchenLat: latitude,
            kitchenLng: longitude,
          }));
          setVendorLocationDetected(true);
          setErrors(prev => {
            const next = { ...prev };
            delete next.kitchenStreet; delete next.kitchenArea;
            delete next.kitchenCity;   delete next.kitchenPincode;
            return next;
          });
          const missingDetails = [];
          if (!street) missingDetails.push('street/road');
          if (!shopNo) missingDetails.push('shop/building number');
          showToast(missingDetails.length
            ? `Kitchen area, city and pincode filled. ${missingDetails.join(' and ')} were not available from map data; enter them manually.`
            : 'Kitchen location detected and address fields filled. You can still edit them before submitting.',
          missingDetails.length ? 'warning' : 'success');
        } catch {
          showToast('Could not fetch address. Fill manually.', 'warning');
        }
        setIsDetectingVendorLocation(false);
      },
      () => {
        showToast('Location access denied. Please fill address manually.', 'error');
        setIsDetectingVendorLocation(false);
      },
      { timeout: 10000 }
    );
  };

  // Shared Google Places forward-search
  const fetchGooglePlaces = async (q, setSugg, setShow, setFetch) => {
    if (q.length < 3) { setSugg([]); setShow(false); return; }
    setFetch(true);
    try {
      const { getPlacePredictions } = await import('../utils/googleMaps');
      const predictions = await getPlacePredictions(q);
      setSugg(predictions);
      setShow(predictions.length > 0);
    } catch { setSugg([]); }
    finally { setFetch(false); }
  };

  // User autocomplete handlers
  const handleUserSearchChange = (e) => {
    const q = e.target.value;
    setUserSearchQuery(q);
    setUserGeoStatus('idle');
    clearTimeout(userDebounce.current);
    userDebounce.current = setTimeout(() =>
      fetchGooglePlaces(q, setUserSuggestions, setShowUserDropdown, setUserFetching), 400);
  };

  const handleSelectUserSuggestion = async (s) => {
    setUserSearchQuery(s.description || '');
    setShowUserDropdown(false);
    setUserSuggestions([]);
    setUserFetching(true);
    try {
      const { getPlaceDetails } = await import('../utils/googleMaps');
      const details = await getPlaceDetails(s.place_id);
      if (details) {
        setDetectedLat(details.lat);
        setDetectedLng(details.lng);
        setFormData(prev => ({
          ...prev,
          ...(details.area    && { area:    details.area }),
          ...(details.city    && { city:    details.city }),
          ...(details.pincode && { pincode: details.pincode }),
        }));
        setUserGeoStatus('found');
        setErrors(prev => {
          const n = { ...prev };
          delete n.area; delete n.city; delete n.pincode;
          return n;
        });
      }
    } catch (_) {}
    setUserFetching(false);
  };

  // Vendor autocomplete handlers
  const handleVendorSearchChange = (e) => {
    const q = e.target.value;
    setVendorSearchQuery(q);
    clearTimeout(vendorDebounce.current);
    vendorDebounce.current = setTimeout(() =>
      fetchGooglePlaces(q, setVendorSuggestions, setShowVendorDropdown, setVendorFetching), 400);
  };

  const handleSelectVendorSuggestion = async (s) => {
    setVendorSearchQuery(s.description || '');
    setShowVendorDropdown(false);
    setVendorSuggestions([]);
    setVendorFetching(true);
    try {
      const { getPlaceDetails } = await import('../utils/googleMaps');
      const details = await getPlaceDetails(s.place_id);
      if (details) {
        setFormData(prev => ({
          ...prev,
          ...(details.area    && { kitchenArea:    details.area }),
          ...(details.city    && { kitchenCity:    details.city }),
          ...(details.pincode && { kitchenPincode: details.pincode }),
          kitchenLat: details.lat,
          kitchenLng: details.lng,
        }));
        setVendorLocationDetected(true);
        setErrors(prev => {
          const n = { ...prev };
          delete n.kitchenArea; delete n.kitchenCity; delete n.kitchenPincode;
          return n;
        });
      }
    } catch (_) {}
    setVendorFetching(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Create new errors object
    const newErrors = {};

    // Full Name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Please enter your full name with at least 2 characters.';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Please enter your full name with at least 2 characters.';
    } else if (!/^[a-zA-Z\s]+$/.test(formData.name.trim())) {
      newErrors.name = 'Please enter your full name with at least 2 characters.';
    }

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = 'Please enter a valid email address.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address.';
    }

    // Phone Number validation (for user and vendor roles)
    if (role === 'user' || role === 'vendor') {
      if (!formData.phone) {
        newErrors.phone = 'Please enter a valid 10 digit Indian mobile number starting with 6, 7, 8, or 9.';
      } else if (!/^[6-9]\d{9}$/.test(formData.phone)) {
        newErrors.phone = 'Please enter a valid 10 digit Indian mobile number starting with 6, 7, 8, or 9.';
      }
    }

    // Pincode validation — user only (vendor pincode comes from kitchenPincode)
    if (role === 'user') {
      if (!formData.pincode) {
        newErrors.pincode = 'Please enter a valid 6 digit pincode.';
      } else if (!/^\d{6}$/.test(formData.pincode)) {
        newErrors.pincode = 'Please enter a valid 6 digit pincode.';
      }
    }

    // Customer delivery address validation
    if (role === 'user') {
      if (!formData.area.trim()) {
        newErrors.area = 'Please enter your area / locality.';
      }
      if (!formData.city.trim()) {
        newErrors.city = 'Please enter your city.';
      }
    }

    // Vendor kitchen address validation
    if (role === 'vendor') {
      if (!formData.kitchenStreet?.trim()) {
        newErrors.kitchenStreet = 'Kitchen street / road is required.';
      }
      if (!formData.kitchenArea?.trim()) {
        newErrors.kitchenArea = 'Kitchen area / locality is required.';
      }
      if (!formData.kitchenCity?.trim()) {
        newErrors.kitchenCity = 'Kitchen city is required.';
      }
      if (!formData.kitchenPincode?.trim() || !/^\d{6}$/.test(formData.kitchenPincode)) {
        newErrors.kitchenPincode = 'Valid 6-digit pincode required.';
      }
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password must be at least 8 characters and include 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.';
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#!%^&*()\-_]).{8,}$/.test(formData.password)) {
      newErrors.password = 'Password must be at least 8 characters and include 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.';
    }

    // Confirm Password validation
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match. Please re-enter your password.';
    } else if (formData.confirmPassword !== formData.password) {
      newErrors.confirmPassword = 'Passwords do not match. Please re-enter your password.';
    }

    // Set errors and return if any validation failed
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      return;
    }

    // Vendor document validation (only for vendor role)
    if (role === 'vendor' && (!docFiles.fssai || !docFiles.gst)) {
      setError('Please upload required documents for vendor registration');
      return;
    }

    try {
      setLoading(true);

      // Create FormData for multipart/form-data
      const data = new FormData();
      
      // Common fields
      data.append('name', formData.name);
      data.append('email', formData.email);
      data.append('password', formData.password);
      data.append('role', role);

      // Profile pic
      if (profilePicFile) {
        data.append('profilePic', profilePicFile);
      }

      // Kitchen poster (for vendors)
      if (kitchenPosterFile) {
        data.append('kitchenPoster', kitchenPosterFile);
      }

      // User specific fields
      if (role === 'user') {
        data.append('phone',       formData.phone);
        data.append('pincode',     formData.pincode);
        data.append('flatHouseNo', formData.flatHouseNo);
        data.append('street',      formData.street);
        data.append('area',        formData.area);
        data.append('landmark',    formData.landmark);
        data.append('city',        formData.city);
        if (detectedLat !== null) data.append('latitude',  detectedLat);
        if (detectedLng !== null) data.append('longitude', detectedLng);
      }

      // Vendor specific fields
      if (role === 'vendor') {
        const kitchenFullAddress = [
          formData.kitchenShopNo, formData.kitchenStreet, formData.kitchenArea,
          formData.kitchenLandmark, formData.kitchenCity, formData.kitchenPincode,
        ].filter(Boolean).join(', ');

        data.append('kitchenName',    formData.kitchenName);
        data.append('kitchenShopNo',  formData.kitchenShopNo || '');
        data.append('kitchenStreet',  formData.kitchenStreet);
        data.append('kitchenArea',    formData.kitchenArea);
        data.append('kitchenLandmark', formData.kitchenLandmark || '');
        data.append('kitchenCity',    formData.kitchenCity);
        data.append('kitchenPincode', formData.kitchenPincode);
        data.append('kitchenAddress', kitchenFullAddress); // full string for backend compat
        data.append('pincode',        formData.kitchenPincode);
        data.append('phone',          formData.phone);
        if (formData.kitchenLat) {
          data.append('latitude',  formData.kitchenLat);
          data.append('longitude', formData.kitchenLng);
        }
        if (docFiles.fssai) data.append('fssaiDoc', docFiles.fssai);
        if (docFiles.gst)   data.append('gstDoc',   docFiles.gst);
      }

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        body: data, // Don't set Content-Type header; browser will set it with boundary
      });

      const responseData = await response.json();

      if (response.ok) {
        // Check if OTP verification is required
        if (responseData.requiresOTPVerification) {
          // Show OTP modal
          setOtpUserId(responseData.userId);
          setMaskedEmail(responseData.maskedEmail);
          setShowOTPModal(true);
          setCountdown(60);
          setCanResend(false);
          setOtp(['', '', '', '', '', '']);
          // Focus first OTP input after modal shows
          setTimeout(() => otpRefs[0].current?.focus(), 100);
          setLoading(false);
          return;
        }

        // The backend now returns full URLs for profilePic
        // We need to ensure the full URL is stored in localStorage
        
        // Get the profilePic from response (should already be full URL from backend)
        const storedUser = {
          _id: responseData._id,
          name: responseData.name,
          email: responseData.email,
          role: responseData.role,
          profilePic: responseData.profilePic || null,
          // Include kitchenPoster for vendors (if returned from backend)
          ...(role === 'vendor' && { kitchenPoster: responseData.kitchenPoster || null }),
          token: responseData.token
        };

        // Store token and user data
        setAuthItem('token', responseData.token);
        setAuthItem('user', JSON.stringify(storedUser));

        alert('Registration Successful!');
        
        // Check for trial intent and navigate accordingly
        const trialIntent = localStorage.getItem('trialIntent');
        
// Navigate to appropriate dashboard
        if (role === 'vendor') navigate('/vendor-dashboard');
        else {
          if (trialIntent === 'true') {
            // Clear trial intent and navigate to subscription tab
            localStorage.removeItem('trialIntent');
            navigate('/user-dashboard', { state: { activeTab: 'subscription' } });
          } else {
            navigate('/user-dashboard');
          }
        }
      } else {
        // Check if this is a disposable/temporary email error
        const errorMessage = responseData.message || 'Registration failed. Please try again.';
        
        if (errorMessage.toLowerCase().includes('disposable') || 
            errorMessage.toLowerCase().includes('temporary')) {
          // Show error under email field
          setErrors(prev => ({ ...prev, email: errorMessage }));
        } else {
          // Show general error
          setError(errorMessage);
        }
      }
    } catch (err) {
      console.error('Registration Error:', err);
      setError('Unable to connect to the server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

return (
    <div className="auth-container">
      <div className="modern-register-card flex flex-col md:flex-row">
        
        {/* Left Side: Brand & Image */}
        <div className="auth-sidebar w-full md:w-[35%] h-auto md:h-full">
          <div className="brand-header">
            <h1>MealSetu</h1>
            <p>Your daily meal partner</p>
          </div>
          
          <div className="profile-upload-section">
            <label htmlFor="regImage" className="circular-upload">
              {profilePic ? (
                <img src={profilePic} alt="Preview" />
              ) : (
                <div className="upload-placeholder">
                  <span>+</span>
                </div>
              )}
            </label>
            <p>Upload Profile Photo</p>
            <input id="regImage" type="file" accept="image/*" onChange={handleImageChange} hidden />
          </div>

          <div className="auth-footer-text">
            Already have an account? <Link to="/login">Login</Link>
          </div>
        </div>

        {/* Right Side: Scroll-enabled Form Content */}
        <div className="auth-form-content w-full md:w-[65%]">
          <div className="role-selector">
<button className={role === 'user' ? 'active' : ''} onClick={() => setRole('user')}>Customer</button>
            <button className={role === 'vendor' ? 'active' : ''} onClick={() => setRole('vendor')}>Vendor</button>
          </div>

          {error && <div className="error-message" style={{color: 'red', marginBottom: '10px'}}>{error}</div>}

          {/* Error Summary */}
          {Object.keys(errors).length > 0 && (
            <div className="form-error-summary">
              Please fix the errors below before submitting.
            </div>
          )}

          <form className="grid-form" onSubmit={handleSubmit}>
            {/* Common Fields */}
            <div className="input-field">
              <label>Full Name</label>
              <input 
                type="text" 
                placeholder="John Doe" 
                required 
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={errors.name ? 'input-error' : (formData.name ? 'input-valid' : '')}
              />
              {errors.name && <p className="field-error">{errors.name}</p>}
            </div>
            <div className="input-field">
              <label>Email Address</label>
              <input 
                type="email" 
                placeholder="john@example.com" 
                required 
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={errors.email ? 'input-error' : (formData.email ? 'input-valid' : '')}
              />
              {errors.email && <p className="field-error">{errors.email}</p>}
            </div>

            {/* --- CUSTOMER FIELDS --- */}
            {role === 'user' && (
              <>
                <div className="input-field">
                  <label>Phone Number</label>
                  <input 
                    type="tel" 
                    placeholder="9876543210" 
                    required 
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className={errors.phone ? 'input-error' : (formData.phone ? 'input-valid' : '')}
                  />
                  {errors.phone && <p className="field-error">{errors.phone}</p>}
                </div>
                {/* Map-pick row — user */}
                <div className="input-field full-width" style={{ marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ fontWeight: '600', fontSize: '14px', marginBottom: 0 }}>Delivery Address</label>
                    <button
                      type="button"
                      onClick={detectGPS}
                      disabled={isDetectingLocation}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '6px 14px', borderRadius: '8px',
                        backgroundColor: '#f26522', color: 'white',
                        border: 'none', cursor: isDetectingLocation ? 'not-allowed' : 'pointer',
                        fontSize: '13px', fontWeight: '500', opacity: isDetectingLocation ? 0.7 : 1,
                      }}
                    >
                      {isDetectingLocation ? 'Detecting…' : userLocationDetected ? '📍 Re-detect' : '📍 Detect Location'}
                    </button>
                  </div>
                </div>

                {/* User address autocomplete */}
                <div className="input-field full-width" style={{ position: 'relative', marginBottom: '4px' }} ref={userDropdownRef}>
                  <label style={{ fontWeight: '600', fontSize: '13px' }}>Search Area / Locality</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={handleUserSearchChange}
                      placeholder="Type area name, e.g. Koramangala, Bengaluru…"
                      autoComplete="off"
                      style={{ paddingRight: '36px' }}
                    />
                    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                      {userFetching ? '⏳' : '🔍'}
                    </span>
                  </div>
                  {showUserDropdown && userSuggestions.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
                      background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', marginTop: '4px',
                    }}>
                      {userSuggestions.map((s, i) => {
                        const sf = s.structured_formatting || {};
                        const main = sf.main_text || s.description?.split(',')[0] || '';
                        const secondary = sf.secondary_text || '';
                        return (
                          <div key={i}
                            onMouseDown={() => handleSelectUserSuggestion(s)}
                            style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: i < userSuggestions.length - 1 ? '1px solid #f1f5f9' : 'none', fontSize: '13px' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}
                          >
                            <div style={{ fontWeight: '600', color: '#1a1a2e' }}>📍 {main}</div>
                            {secondary && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{secondary}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {userGeoStatus === 'found' && (
                    <div style={{ marginTop: '6px', padding: '6px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px', color: '#16a34a', fontWeight: '600' }}>
                      📍 Location coordinates saved — rider will navigate here accurately.
                    </div>
                  )}
                </div>

                {/* Flat / House No + Street */}
                <div className="input-field">
                  <label>Flat / House No</label>
                  <input
                    type="text" placeholder="e.g. 101, Block B"
                    name="flatHouseNo" value={formData.flatHouseNo}
                    onChange={handleInputChange}
                    className={formData.flatHouseNo ? 'input-valid' : ''}
                  />
                </div>
                <div className="input-field">
                  <label>Street / Road</label>
                  <input
                    type="text" placeholder="e.g. MG Road"
                    name="street" value={formData.street}
                    onChange={handleInputChange}
                    className={formData.street ? 'input-valid' : ''}
                  />
                </div>

                {/* Area + Landmark */}
                <div className="input-field">
                  <label>Area / Locality *</label>
                  <input
                    type="text" placeholder="e.g. Koramangala" required
                    name="area" value={formData.area}
                    onChange={handleInputChange}
                    className={errors.area ? 'input-error' : (formData.area ? 'input-valid' : '')}
                  />
                  {errors.area && <p className="field-error">{errors.area}</p>}
                </div>
                <div className="input-field">
                  <label>Landmark (optional)</label>
                  <input
                    type="text" placeholder="e.g. Near City Mall"
                    name="landmark" value={formData.landmark}
                    onChange={handleInputChange}
                    className={formData.landmark ? 'input-valid' : ''}
                  />
                </div>

                {/* City + Pincode */}
                <div className="input-field">
                  <label>City *</label>
                  <input
                    type="text" placeholder="e.g. Bengaluru" required
                    name="city" value={formData.city}
                    onChange={handleInputChange}
                    className={errors.city ? 'input-error' : (formData.city ? 'input-valid' : '')}
                  />
                  {errors.city && <p className="field-error">{errors.city}</p>}
                </div>
                <div className="input-field">
                  <label>Pincode *</label>
                  <input
                    type="text" placeholder="383001" required
                    name="pincode" value={formData.pincode}
                    onChange={handleInputChange}
                    className={errors.pincode ? 'input-error' : (formData.pincode ? 'input-valid' : '')}
                  />
                  {errors.pincode && <p className="field-error">{errors.pincode}</p>}
                </div>
              </>
            )}

            {/* --- VENDOR FIELDS --- */}
            {role === 'vendor' && (
              <>
                <div className="input-field full-width">
                  <label>Kitchen Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Annapurna Kitchen" 
                    required 
                    name="kitchenName"
                    value={formData.kitchenName}
                    onChange={handleInputChange}
                    className={formData.kitchenName ? 'input-valid' : ''}
                  />
                </div>
                {/* Structured kitchen address */}
                <div className="input-field full-width" style={{ background: '#fff5f0', border: '1px solid #fed7b0', borderRadius: '10px', padding: '16px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#e8570c', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🏪 Kitchen / Restaurant Address
                  </h4>

                  {/* Vendor address autocomplete */}
                  <div style={{ position: 'relative', marginBottom: '14px' }} ref={vendorDropdownRef}>
                    <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Search Kitchen Area</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        value={vendorSearchQuery}
                        onChange={handleVendorSearchChange}
                        placeholder="Type kitchen area, e.g. Satellite, Ahmedabad…"
                        autoComplete="off"
                        style={{ paddingRight: '36px' }}
                      />
                      <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                        {vendorFetching ? '⏳' : '🔍'}
                      </span>
                    </div>
                    {showVendorDropdown && vendorSuggestions.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
                        background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', marginTop: '4px',
                      }}>
                        {vendorSuggestions.map((s, i) => {
                          const sf = s.structured_formatting || {};
                          const main = sf.main_text || s.description?.split(',')[0] || '';
                          const secondary = sf.secondary_text || '';
                          return (
                            <div key={i}
                              onMouseDown={() => handleSelectVendorSuggestion(s)}
                              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: i < vendorSuggestions.length - 1 ? '1px solid #f1f5f9' : 'none', fontSize: '13px' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
                              onMouseLeave={e => e.currentTarget.style.background = 'white'}
                            >
                              <div style={{ fontWeight: '600', color: '#1a1a2e' }}>📍 {main}</div>
                              {secondary && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{secondary}</div>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Shop / Building No */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                      Shop / Building No. <span style={{ color: '#999', fontWeight: '400' }}>(Optional)</span>
                    </label>
                    <input type="text" name="kitchenShopNo" value={formData.kitchenShopNo} onChange={handleInputChange}
                      placeholder="e.g. Shop 3, Ground Floor, Block B"
                      className={formData.kitchenShopNo ? 'input-valid' : ''} />
                  </div>

                  {/* Street */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Street / Road *</label>
                    <input type="text" name="kitchenStreet" value={formData.kitchenStreet} onChange={handleInputChange}
                      placeholder="e.g. MG Road, SG Highway"
                      className={errors.kitchenStreet ? 'input-error' : formData.kitchenStreet ? 'input-valid' : ''} />
                    {errors.kitchenStreet && <p className="field-error">{errors.kitchenStreet}</p>}
                  </div>

                  {/* Area + Pincode */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Area / Locality *</label>
                      <input type="text" name="kitchenArea" value={formData.kitchenArea} onChange={handleInputChange}
                        placeholder="e.g. Satellite, Navrangpura"
                        className={errors.kitchenArea ? 'input-error' : formData.kitchenArea ? 'input-valid' : ''} />
                      {errors.kitchenArea && <p className="field-error">{errors.kitchenArea}</p>}
                    </div>
                    <div>
                      <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Pincode *</label>
                      <input type="text" name="kitchenPincode" value={formData.kitchenPincode} onChange={handleInputChange}
                        placeholder="380015" maxLength={6}
                        className={errors.kitchenPincode ? 'input-error' : formData.kitchenPincode ? 'input-valid' : ''} />
                      {errors.kitchenPincode && <p className="field-error">{errors.kitchenPincode}</p>}
                    </div>
                  </div>

                  {/* Landmark */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                      Landmark <span style={{ color: '#999', fontWeight: '400' }}>(Optional)</span>
                    </label>
                    <input type="text" name="kitchenLandmark" value={formData.kitchenLandmark} onChange={handleInputChange}
                      placeholder="e.g. Near City Mall, Opp. Park" />
                  </div>

                  {/* City */}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>City *</label>
                    <input type="text" name="kitchenCity" value={formData.kitchenCity} onChange={handleInputChange}
                      placeholder="e.g. Ahmedabad"
                      className={errors.kitchenCity ? 'input-error' : formData.kitchenCity ? 'input-valid' : ''} />
                    {errors.kitchenCity && <p className="field-error">{errors.kitchenCity}</p>}
                  </div>

                  {/* GPS detect row — vendor kitchen */}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '10px 14px', borderRadius: '8px',
                      background: vendorLocationDetected ? '#f0fdf4' : '#f8f9fa',
                      border: `1px solid ${vendorLocationDetected ? '#86efac' : '#e2e8f0'}`,
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>📍</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e' }}>Auto-detect Kitchen Location</div>
                      <div style={{ fontSize: '12px', color: vendorLocationDetected ? '#16a34a' : '#64748b' }}>
                        {vendorLocationDetected
                          ? `✅ Location detected (${formData.kitchenArea})`
                          : 'Fills kitchen address fields automatically'}
                      </div>
                    </div>
                    <button type="button" onClick={detectVendorLocation} disabled={isDetectingVendorLocation} style={{
                      background: '#f26522', color: 'white', border: 'none',
                      borderRadius: '6px', padding: '6px 14px', fontSize: '13px',
                      fontWeight: '600', cursor: isDetectingVendorLocation ? 'not-allowed' : 'pointer',
                      opacity: isDetectingVendorLocation ? 0.7 : 1,
                    }}>
                      {isDetectingVendorLocation ? 'Detecting…' : vendorLocationDetected ? 'Re-detect' : 'Detect'}
                    </button>
                  </div>
                </div>

                <div className="input-field">
                  <label>Phone Number</label>
                  <input
                    type="tel" placeholder="9876543210" required
                    name="phone" value={formData.phone} onChange={handleInputChange}
                    className={errors.phone ? 'input-error' : (formData.phone ? 'input-valid' : '')}
                  />
                  {errors.phone && <p className="field-error">{errors.phone}</p>}
                </div>
                
                {/* Kitchen Poster/Banner Upload */}
                <div className="input-field full-width">
                  <label>Kitchen Banner/Poster Image</label>
                  <div className="file-input-wrapper">
                    <input type="file" id="kitchenPoster" onChange={handleKitchenPosterChange} hidden accept="image/*" />
                    <label htmlFor="kitchenPoster" className="file-label" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {kitchenPoster ? (
                        <img src={kitchenPoster} alt="Kitchen Poster Preview" style={{ width: '100px', height: '60px', objectFit: 'cover', borderRadius: '5px' }} />
                      ) : (
                        "Choose Kitchen Banner Image"
                      )}
                    </label>
                  </div>
                  <small style={{ color: '#666', fontSize: '11px' }}>This image will be displayed in the user dashboard as your kitchen's visual identity</small>
                </div>
                
                {/* Document Uploads */}
                <div className="input-field">
                  <label>FSSAI License Document</label>
                  <div className="file-input-wrapper">
                    <input type="file" id="fssaiDoc" onChange={(e) => handleDocChange(e, 'fssai')} hidden required accept=".pdf,.jpg,.jpeg,.png" />
                    <label htmlFor="fssaiDoc" className="file-label">
                      {docs.fssai ? docs.fssai : "Choose File"}
                    </label>
                  </div>
                </div>
                <div className="input-field">
                  <label>GST Document</label>
                  <div className="file-input-wrapper">
                    <input type="file" id="gstDoc" onChange={(e) => handleDocChange(e, 'gst')} hidden required accept=".pdf,.jpg,.jpeg,.png" />
                    <label htmlFor="gstDoc" className="file-label">
                      {docs.gst ? docs.gst : "Choose File"}
                    </label>
                  </div>
                </div>
              </>
            )}

{/* Passwords */}
            <div className="input-field">
              <label>Password</label>
              <input 
                type="password" 
                placeholder="••••••••" 
                required 
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className={errors.password ? 'input-error' : (formData.password ? 'input-valid' : '')}
              />
              {errors.password && <p className="field-error">{errors.password}</p>}
            </div>
            <div className="input-field">
              <label>Confirm Password</label>
              <input 
                type="password" 
                placeholder="••••••••" 
                required 
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                className={errors.confirmPassword ? 'input-error' : (formData.confirmPassword ? 'input-valid' : '')}
              />
              {errors.confirmPassword && <p className="field-error">{errors.confirmPassword}</p>}
            </div>

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Creating Account...' : `Create ${role} Account`}
            </button>
          </form>
        </div>

      </div>

      {/* OTP Verification Modal */}
      {showOTPModal && (
        <div className="otp-modal-overlay">
          <div className="otp-modal">
            <h2 className="otp-modal-title">Verify Your Email Address</h2>
            <p className="otp-modal-desc">
              We sent a 6 digit OTP to <strong style={{ color: '#f26522' }}>{maskedEmail}</strong>
            </p>

            {otpError && (
              <div className="otp-error-message">
                {otpError}
              </div>
            )}

            <div className="otp-inputs-container">
              {otp.map((digit, index) => (
                <input 
                  key={index}
                  ref={otpRefs[index]}
                  type="text"
                  maxLength="1"
                  className="otp-input-box"
                  value={digit}
                  onChange={(e) => handleOtpChange(e, index)}
                  onKeyDown={(e) => handleOtpKeyDown(e, index)}
                  disabled={otpLoading}
                />
              ))}
            </div>

            <div className="otp-countdown">
              {countdown > 0 ? (
                <span>Resend OTP in {countdown} seconds</span>
              ) : (
                <button 
                  type="button" 
                  className="otp-resend-btn" 
                  onClick={handleResendOTP}
                  disabled={otpLoading}
                >
                  {otpLoading ? 'Sending...' : 'Resend OTP'}
                </button>
              )}
            </div>

            <button 
              type="button" 
              className="otp-verify-btn" 
              onClick={() => handleVerifyOTP(otp.join(''))}
              disabled={otpLoading || otp.join('').length !== 6}
            >
              {otpLoading ? 'Verifying...' : 'Verify OTP'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}