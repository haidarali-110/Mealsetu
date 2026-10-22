import { useEffect, useMemo, useState } from 'react';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/common/Toast';
import AddManualCustomer from '../components/dashboard/vendor/AddManualCustomer';
import CashPayments from '../components/dashboard/vendor/CashPayments';
import CommissionHistory from '../components/dashboard/vendor/CommissionHistory';
import CustomerLoyalty from '../components/dashboard/vendor/CustomerLoyalty';
import DashboardOverview from '../components/dashboard/vendor/DashboardOverview';
import DeliveryManagement from '../components/dashboard/vendor/DeliveryManagement';
import ExpenseTracker from '../components/dashboard/vendor/ExpenseTracker';
import FinanceDashboard from '../components/dashboard/vendor/FinanceDashboard';
import LoyaltySettings from '../components/dashboard/vendor/LoyaltySettings';
import SubscriptionAnalytics from '../components/dashboard/vendor/SubscriptionAnalytics';
import TrialSettings from '../components/dashboard/vendor/TrialSettings';
import VendorOffers from '../components/dashboard/vendor/VendorOffers';
import { getCashPayments, getCustomerPlans, getDashboardStats, getFilteredOrders, getJainMenu, getPricing, getVendorComplaints, getVendorCustomers, getVendorOrders, getVendorProfile, getVendorReviews, getVendorShopStatus, getWeeklyPlan, resolveVendorComplaint, saveJainMenu, savePricing, saveWeeklyPlan, submitVendorCompliance, updateKitchenPoster, updateVendorProfile, updateVendorProfilePic } from '../utils/api';
import { getAuthItem, removeAuthItem, setAuthItem } from '../utils/authStorage';
import { connectSocket, disconnectSocket, offEvent, onEvent } from '../utils/socket';
import './VendorDashboard.css';

const VendorDashboard = () => {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [kitchenOpen, setKitchenOpen] = useState(true);
  const [currentClosure, setCurrentClosure] = useState(null);
  const [menuCycle, setMenuCycle] = useState('Daily');
  const [reportFilter, setReportFilter] = useState('Daily Overview');
  const [orderFilter, setOrderFilter] = useState('daily');
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [filterLoading, setFilterLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [error, setError] = useState('');

  // --- PROFILE STATE ---
  const [profile, setProfile] = useState({
    ownerName:    '',
    email:        '',
    kitchenName:  '',
    addrShopNo:   '',
    addrStreet:   '',
    addrArea:     '',
    addrLandmark: '',
    addrCity:     '',
    addrPincode:  '',
    addrLat:      null,
    addrLng:      null,
    phone:        '',
    upiId:        '',
    image:        null,
    kitchenPoster: null,
    profileImage:  null,
  });
  const [vendorGpsDetected,    setVendorGpsDetected]    = useState(false);
  const [detectingVendorGps,   setDetectingVendorGps]   = useState(false);
  // State to track if there's a new image to upload
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedKitchenPoster, setSelectedKitchenPoster] = useState(null);

  // Loading state for profile image
  const [imageLoading, setImageLoading] = useState(true);

  // Default placeholder image for vendors
  const defaultVendorImage = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iODAiIGhlaWdodD0iODAiIGZpbGw9IiNlMmU4ZjAiLz48Y2lyY2xlIGN4PSI0MCIgY3k9IjMwIiByPSIyMCIgZmlsbD0iI2YzZjVmMiIvPjxwYXRoIGQ9Ik0yMCA2NUwyMCA2NWwxMCAwaC0yMG0xMCAwaC0yMCIgZmlsbD0iI2U0ZThmMCIvPjwvc3ZnPg==';

  const [reviews, setReviews] = useState([]);
  const [vendorOrders, setVendorOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [complaints, setComplaints] = useState([]);

  // Customer plans modal
  const [selectedCustomer, setSelectedCustomer] = useState(null); // { _id, name, email, phone }
  const [customerPlans,    setCustomerPlans]    = useState([]);
  const [plansLoading,     setPlansLoading]     = useState(false);
  const [replyInputs, setReplyInputs] = useState({});   // { [complaintId]: string }
  const [replyLoading, setReplyLoading] = useState({}); // { [complaintId]: bool }


  const [isApproved, setIsApproved] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [documents, setDocuments] = useState({ fssai: null, gst: null });

  // --- TRIAL SETTINGS STATE ---
  const [trialSettings, setTrialSettings] = useState({
    trialEnabled: false,
    trialFee: 0
  });
  const [savingTrialSettings, setSavingTrialSettings] = useState(false);
  const [trialSettingsMessage, setTrialSettingsMessage] = useState({ type: '', text: '' });

  // Pricing state
  const [pricing, setPricing] = useState([
    { type: 'daily', price: 80, active: false },
    { type: 'weekly', price: 500, active: false },
    { type: 'monthly', price: 1800, active: false }
  ]);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingMessage, setPricingMessage] = useState({ type: '', text: '' });
  const [pricingErrors, setPricingErrors] = useState({});

  const [cashPendingCount, setCashPendingCount] = useState(0);
  const [vendorSocketId, setVendorSocketId] = useState(null);

  // --- DASHBOARD STATS STATE ---
  const [dashboardStats, setDashboardStats] = useState({
    totalRevenue: 0,
    todayOrders: 0,
    activeSubscribers: 0,
    pendingPayout: 0,
    cashPaymentsTotal: 0,
    cashPaymentsCount: 0,
    upiPaymentsTotal: 0,
    upiPaymentsCount: 0
  });

  // Load vendor data on mount
  useEffect(() => {
    const token = getAuthItem('token');
    const userData = getAuthItem('user');

    if (!token || !userData) {
      navigate('/login');
      return;
    }

    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== 'vendor') {
      navigate('/');
      return;
    }

    fetchVendorData();
    fetchShopStatus();
  }, [navigate]);

  // Connect socket once vendor ID is known
  useEffect(() => {
    if (!vendorSocketId) return;
    const userData = getAuthItem('user');
    if (!userData) return;
    const parsedUser = JSON.parse(userData);
    connectSocket(parsedUser._id, 'vendor', vendorSocketId);

    const handleNewOrder = () => {
      addToast('New order received! 🎉', 'success');
    };
    const handleOfferRedeemed = (data) => {
      addToast(data.message || 'A customer redeemed your offer!', 'success');
    };
    onEvent('new_order', handleNewOrder);
    onEvent('newOrder', handleNewOrder);
    onEvent('offer_redeemed', handleOfferRedeemed);

    return () => {
      offEvent('new_order', handleNewOrder);
      offEvent('newOrder', handleNewOrder);
      offEvent('offer_redeemed', handleOfferRedeemed);
      disconnectSocket();
    };
  }, [vendorSocketId]); // eslint-disable-line react-hooks/exhaustive-deps

      // Fetch shop status from backend
      const fetchShopStatus = async () => {
        try {
          const status = await getVendorShopStatus();
          setKitchenOpen(status.isOpen);
          setCurrentClosure(status.currentClosure || null);
        } catch (error) {
          console.warn('Failed to fetch shop status:', error);
        }
      };

      // Fetch trial settings from vendor profile
      const fetchTrialSettings = async () => {
        try {
          const vendorData = await getVendorProfile();
          if (vendorData) {
            setTrialSettings({
              trialEnabled: vendorData.trialEnabled === true,
              trialFee: vendorData.trialFee || 0
            });
          }
        } catch (error) {
          console.warn('Failed to fetch trial settings:', error);
        }
      };


const fetchPricing = async () => {
    if (activeTab !== 'pricing') return;

    try {
      const data = await getPricing();

      const pricingArray = ['daily', 'weekly', 'monthly'].map(planType => ({
        type: planType,
        price: data.pricing?.find(p => p.planType === planType)?.price ?? '',
        active: data.pricing?.find(p => p.planType === planType)?.active === true || 
                data.pricing?.find(p => p.planType === planType)?.is_active === true
      }));
      setPricing(pricingArray);

    } catch (error) {
      console.warn('Failed to load pricing:', error);
    }
  };

  useEffect(() => {
    fetchPricing();
  }, [activeTab]);

  // Handle shop open/close toggle
  const handleShopToggle = async () => {
    // Refresh from backend so kitchenOpen + currentClosure stay in sync
    await fetchShopStatus();
  };




  const fetchVendorData = async () => {
    try {
      setLoading(true);
      setError('');
      setImageLoading(true); // Start loading image
      const vendorData = await getVendorProfile();
      
      // Use resolveImageUrl to properly handle image paths
      const resolvedImage = resolveImageUrl(vendorData.profileImage);
      const resolvedKitchenPoster = resolveImageUrl(vendorData.kitchenPoster);
      
      const rawAddr = vendorData.address;
      const a = (typeof rawAddr === 'object' && rawAddr !== null) ? rawAddr : {};
      const isLegacyAddr = typeof rawAddr === 'string';

      // Parse a legacy flat string like "Sayaji Road, Dudhia Talav, Navsari, 396445"
      // into separate fields so the vendor sees their data pre-filled.
      let parsedStreet = '', parsedArea = '', parsedCity = '', parsedPincode = '';
      if (isLegacyAddr && rawAddr.trim()) {
        const parts = rawAddr.split(',').map(p => p.trim()).filter(Boolean);
        // Detect 6-digit pincode at the end
        const lastPincode = /^\d{6}$/.test(parts[parts.length - 1]);
        if (lastPincode) { parsedPincode = parts.pop(); }
        // Remaining: [street, ...area, city]
        if (parts.length >= 1) parsedStreet = parts[0];
        if (parts.length >= 2) parsedCity   = parts[parts.length - 1];
        if (parts.length >= 3) parsedArea   = parts.slice(1, parts.length - 1).join(', ');
        else if (parts.length === 2) parsedArea = '';
      }

      setProfile({
        ownerName:    vendorData.ownerId?.name  || '',
        email:        vendorData.ownerId?.email || '',
        kitchenName:  vendorData.kitchenName || '',
        addrShopNo:   isLegacyAddr ? ''            : (a.shopNo   || ''),
        addrStreet:   isLegacyAddr ? parsedStreet  : (a.street   || ''),
        addrArea:     isLegacyAddr ? parsedArea    : (a.area     || ''),
        addrLandmark: isLegacyAddr ? ''            : (a.landmark || ''),
        addrCity:     isLegacyAddr ? parsedCity    : (a.city     || ''),
        addrPincode:  isLegacyAddr ? parsedPincode : (a.pincode  || vendorData.pincode || ''),
        addrLat:      a.latitude  || null,
        addrLng:      a.longitude || null,
        legacyAddr:   isLegacyAddr ? rawAddr : null,
        phone:        vendorData.ownerId?.phone || '',
        upiId:        vendorData.upiId || '',
        image:        resolvedImage,
        kitchenPoster: resolvedKitchenPoster,
        profileImage:  vendorData.profileImage,
      });
    if (vendorData._id) setVendorSocketId(vendorData._id);
      
      // Image has been resolved, stop loading
      setImageLoading(false);
      setIsApproved(vendorData?.isApproved === true);
      setRejectionReason(vendorData.rejectionReason || '');

      const orders = await getVendorOrders();
      setVendorOrders(orders || []);

      const reviewsData = await getVendorReviews();
      setReviews(reviewsData || []);
      
      // Fetch dashboard stats
      try {
        const stats = await getDashboardStats();
        setDashboardStats({
          totalRevenue: stats.totalRevenue || 0,
          todayOrders: stats.todayOrders || 0,
          activeSubscribers: stats.activeSubscribers || 0,
          pendingPayout: stats.pendingPayout || 0,
          cashPaymentsTotal: stats.cashPaymentsTotal || 0,
          cashPaymentsCount: stats.cashPaymentsCount || 0,
          upiPaymentsTotal: stats.upiPaymentsTotal || 0,
          upiPaymentsCount: stats.upiPaymentsCount || 0
        });
      } catch (e) {
        console.warn('Failed to load dashboard stats', e);
      }

      try {
        const cashData = await getCashPayments();
        setCashPendingCount(cashData.pendingCount || 0);
      } catch (e) {
        console.warn('Failed to load cash payments count', e);
      }

      // customers & complaints
      try {
        const cust = await getVendorCustomers();
        setCustomers(cust || []);
      } catch (e) {
        console.warn('Failed to load customers', e);
      }

      try {
        const comp = await getVendorComplaints();
        setComplaints(comp || []);
      } catch (e) {
        console.warn('Failed to load complaints', e);
      }
    } catch (err) {
      console.error('Error fetching vendor data:', err);
      setError('Failed to load vendor data');
    } finally {
      setLoading(false);
    }
  };

  // --- SUBSCRIPTION DATA GENERATOR ---
  const activeSubscriptions = useMemo(() => {
    const customers = [
      { id: 1, name: "Mosin Ali", phone: "+91 98XXX-X0010", plan: "Monthly", expiry: "2026-02-15", pref: "No Garlic" },
      { id: 2, name: "Priya Sharma", phone: "+91 91XXX-X5521", plan: "Weekly", expiry: "2026-01-28", pref: "Regular" },
      { id: 3, name: "Rahul Varma", phone: "+91 88XXX-X9910", plan: "Monthly", expiry: "2026-01-24", pref: "Jain" },
      { id: 4, name: "Sneha Kapur", phone: "+91 77XXX-X2233", plan: "Trial", expiry: "2026-01-30", pref: "jain" },
    ];
    const today = new Date("2026-01-26"); 
    return customers.map(sub => {
      const expiryDate = new Date(sub.expiry);
      const diffTime = expiryDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      let status = "Active";
      let statusColor = "#16a34a";
      if (diffDays < 0) {
        status = "Expired";
        statusColor = "#ef4444";
      } else if (diffDays <= 3) {
        status = `Expiring in ${diffDays}d`;
        statusColor = "#f26522";
      }
      return { ...sub, status, statusColor, diffDays };
    });
  }, []);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    const addrFields = ['addrShopNo', 'addrStreet', 'addrArea', 'addrCity', 'addrPincode', 'addrLandmark'];
    if (addrFields.includes(name)) {
      // Address typed manually — clear GPS coords so backend re-geocodes from new address
      setProfile(prev => ({ ...prev, [name]: value, addrLat: null, addrLng: null }));
      setVendorGpsDetected(false);
    } else {
      setProfile(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Store the actual file for upload
      setSelectedImage(file);
      
      // Show preview using FileReader
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfile(prev => ({ ...prev, image: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Handler for kitchen poster upload
  const handleKitchenPosterUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Store the actual file for upload
      setSelectedKitchenPoster(file);
      
      // Show preview using FileReader
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfile(prev => ({ ...prev, kitchenPoster: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Helper function to resolve image URL - handles both relative paths and full URLs
  // NOTE: The backend now returns full URLs directly, so we mainly just need to pass through
  const resolveImageUrl = (imagePath) => {
    if (!imagePath) return null;
    
    // If it's a data URL (base64 from FileReader), return as is for preview
    if (imagePath.startsWith('data:')) {
      return imagePath;
    }
    
    // If it's already a full URL (http/https), return as is - backend already provides this!
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }
    
    // For any relative path, construct the URL using window.location.origin for dynamic base
    return `${window.location.origin}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
  };







const handleSavePricing = async () => {
  try {
    setSavingPricing(true);
    setPricingMessage({ type: '', text: '' });
    setPricingErrors({});

    // Client-side validation mirroring backend
    const activePlans = pricing.filter(p => p.active);
    if (activePlans.length === 0) {
      setPricingMessage({ type: 'error', text: 'At least 1 plan must be active' });
      return;
    }

    const invalidPlans = activePlans.filter(p => !p.price || p.price <= 0);
    if (invalidPlans.length > 0) {
      setPricingMessage({ type: 'error', text: 'Active plans must have price > ₹0' });
      return;
    }

    // Check duplicates
    const types = pricing.map(p => p.type);
    const duplicateTypes = types.filter((type, index) => types.indexOf(type) !== index);
    if (duplicateTypes.length > 0) {
      setPricingMessage({ type: 'error', text: `Duplicate plan types: ${duplicateTypes.join(', ')}` });
      return;
    }

    const formattedPricing = pricing.map(p => ({
      planType: p.type,  //  FIXED: Schema expects planType
      price: Number(p.price),
      active: p.active === true
    }));

    console.log("Sending pricing:", formattedPricing);

    await savePricing({ pricing: formattedPricing });

    setPricingMessage({ type: 'success', text: 'Pricing saved successfully!' });

  } catch (error) {
    console.error('Pricing save error:', error);
    // Handle backend validation errors
    if (error.message.includes('Active plans must have price')) {
      setPricingMessage({ type: 'error', text: 'Active plans must have price > ₹0' });
    } else if (error.message.includes('duplicate') || error.message.includes('plan types')) {
      setPricingMessage({ type: 'error', text: 'Duplicate plan types detected' });
    } else {
      setPricingMessage({ type: 'error', text: error.message || 'Failed to save pricing' });
    }
  } finally {
    setSavingPricing(false);
  }
};
  // Enhanced handleSaveProfile with proper persistence and state update - now includes image and kitchen poster upload
  const detectVendorGps = async () => {
    if (!navigator.geolocation) {
      addToast('Geolocation not supported', 'error');
      return;
    }
    setDetectingVendorGps(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;
        try {
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=AIzaSyCgJ0v4LEJaPxZUQR20A56GpBeFa8cf3LQ&language=en`
          );
          const data = await res.json();
          const components = data.results?.[0]?.address_components || [];
          const get = (...types) => components.find(c => types.some(t => c.types.includes(t)))?.long_name || '';
          const street  = get('route', 'premise');
          const area    = get('sublocality_level_1', 'sublocality', 'neighborhood');
          const city    = get('locality', 'administrative_area_level_2');
          const pincode = get('postal_code');
          setProfile(prev => ({
            ...prev,
            addrStreet:  street  || prev.addrStreet,
            addrArea:    area    || prev.addrArea,
            addrCity:    city    || prev.addrCity,
            addrPincode: pincode || prev.addrPincode,
            addrLat: latitude,
            addrLng: longitude,
          }));
          setVendorGpsDetected(true);
          addToast('Kitchen location detected!', 'success');
        } catch {
          addToast('Could not fetch address. Fill manually.', 'warning');
        }
        setDetectingVendorGps(false);
      },
      () => {
        addToast('Location access denied.', 'error');
        setDetectingVendorGps(false);
      },
      { timeout: 10000 }
    );
  };

  const handleSaveProfile = async () => {
    try {
      setLoading(true);
      
      // FIX: Upload profile image and kitchen poster BEFORE updating text fields
      // This ensures the upload result (full URL) is available when setting final values
      
      let finalProfileImage = profile.image;
      let finalKitchenPoster = profile.kitchenPoster;
      
      // If there's a new profile image selected, upload it first
      if (selectedImage) {
        try {
          const formData = new FormData();
          formData.append('profilePic', selectedImage);
          
          const uploadResult = await updateVendorProfilePic(formData);
          
          // Use the returned URL directly from the server (it's already a full URL)
          if (uploadResult.profileImage) {
            finalProfileImage = uploadResult.profileImage;
          }
          
          // Clear the selected image after successful upload
          setSelectedImage(null);
        } catch (uploadError) {
          console.error('Failed to upload profile image:', uploadError);
          // Continue even if image upload fails - profile was still updated
        }
      }
      
      // If there's a new kitchen poster selected, upload it
      if (selectedKitchenPoster) {
        try {
          const posterFormData = new FormData();
          posterFormData.append('kitchenPoster', selectedKitchenPoster);
          
          const posterUploadResult = await updateKitchenPoster(posterFormData);
          
          // Use the returned URL directly from the server (it's already a full URL)
          if (posterUploadResult.kitchenPoster) {
            finalKitchenPoster = posterUploadResult.kitchenPoster;
          }
          
          // Clear the selected kitchen poster after successful upload
          setSelectedKitchenPoster(null);
        } catch (posterUploadError) {
          console.error('Failed to upload kitchen poster:', posterUploadError);
          // Continue even if poster upload fails - profile was still updated
        }
      }
      
      // Build structured address object before sending
      const addrObj = {
        shopNo:      profile.addrShopNo   || '',
        street:      profile.addrStreet   || '',
        area:        profile.addrArea     || '',
        landmark:    profile.addrLandmark || '',
        city:        profile.addrCity     || '',
        pincode:     profile.addrPincode  || '',
        fullAddress: [profile.addrShopNo, profile.addrStreet, profile.addrArea,
                      profile.addrLandmark, profile.addrCity, profile.addrPincode].filter(Boolean).join(', '),
      };
      if (profile.addrLat) addrObj.latitude  = profile.addrLat;
      if (profile.addrLng) addrObj.longitude = profile.addrLng;

      const updatedVendor = await updateVendorProfile({
        kitchenName: profile.kitchenName,
        address: addrObj,
        phone: profile.phone,
        upiId: profile.upiId,
        name: profile.ownerName,
      });
      
      // Use the uploaded image URLs (which have full URLs) if available, otherwise use the updated vendor's values
      const displayImage = finalProfileImage || updatedVendor.profileImage || profile.image;
      const displayKitchenPoster = finalKitchenPoster || updatedVendor.kitchenPoster || profile.kitchenPoster;
      
      // Update local state with the new images + parsed address
      const ua = updatedVendor.address;
      const uaObj = (typeof ua === 'object' && ua !== null) ? ua : {};
      setProfile(prev => ({
        ...prev,
        ownerName:    updatedVendor.ownerId?.name  || prev.ownerName,
        kitchenName:  updatedVendor.kitchenName || prev.kitchenName,
        addrShopNo:   uaObj.shopNo   ?? prev.addrShopNo,
        addrStreet:   uaObj.street   ?? prev.addrStreet,
        addrArea:     uaObj.area     ?? prev.addrArea,
        addrLandmark: uaObj.landmark ?? prev.addrLandmark,
        addrCity:     uaObj.city     ?? prev.addrCity,
        addrPincode:  uaObj.pincode  ?? prev.addrPincode,
        legacyAddr:   null,
        phone:        updatedVendor.ownerId?.phone || prev.phone,
        image:        displayImage,
        kitchenPoster: displayKitchenPoster,
      }));
      
      // Stop image loading to show the image immediately
      setImageLoading(false);
      
      // Update localStorage with new user data to persist profile image across refreshes
      const currentUser = JSON.parse(getAuthItem('user') || '{}');
      const updatedUser = {
        ...currentUser,
        kitchenName: updatedVendor.kitchenName,
        address: updatedVendor.address,
        phone: updatedVendor.ownerId?.phone || currentUser.phone,
        profileImage: displayImage,
        kitchenPoster: displayKitchenPoster,
        profilePic: displayImage // Also update profilePic for consistency
      };
      setAuthItem('user', JSON.stringify(updatedUser));
      
      addToast('Profile updated successfully! Changes will persist after refresh.', 'success');
    } catch (err) {
      console.error('Failed to update profile:', err);
      addToast('Failed to update profile: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };




  const reportData = useMemo(() => {
    const data = [];
    const types = ["Daily Overview", "Weekly Analysis", "Monthly Statement"];
    for (let i = 1; i <= 100; i++) {
      data.push({
        id: `TXN-99${100 + i}`,
        date: new Date(2026, 0, (i % 28) + 1).toLocaleDateString('en-IN'),
        orders: Math.floor(Math.random() * 50) + 10 + " Meals",
        earning: (Math.random() * 5000 + 1000).toFixed(2),
        status: "Settled",
        scope: i <= 30 ? types[0] : i <= 60 ? types[1] : types[2]
      });
    }
    return data;
  }, []);

  const filteredReports = reportData.filter(r => r.scope === reportFilter);

  // Fetch filtered orders for PDF report
  const fetchFilteredOrders = async (filter) => {
    try {
      setFilterLoading(true);
      const data = await getFilteredOrders(filter);
      setFilteredOrders(data || []);
    } catch (error) {
      console.error('Error fetching filtered orders:', error);
      setFilteredOrders([]);
    } finally {
      setFilterLoading(false);
    }
  };

  // Handle filter change
  const handleFilterChange = (newFilter) => {
    setOrderFilter(newFilter);
    fetchFilteredOrders(newFilter);
  };

  // Generate PDF with real order data
  const handleDownloadPDF = async () => {
    try {
      // First fetch the data if not already loaded
      if (filteredOrders.length === 0) {
        await fetchFilteredOrders(orderFilter);
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Watermark
      doc.setFontSize(50);
      doc.setTextColor(240, 240, 240);
      doc.text("MEALSETU PARTNER", pageWidth / 2, pageHeight / 2, { align: "center", angle: 45 });
      
      // Header
      doc.setFontSize(20);
      doc.setTextColor(242, 101, 34); 
      doc.text("Payment Report", 14, 22);
      doc.setFontSize(10);
      doc.setTextColor(100);
      
      // Filter label
      const filterLabels = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
      doc.text(`Filter: ${filterLabels[orderFilter]} Orders`, 14, 32);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 38);
      doc.text(`Total Orders: ${filteredOrders.length}`, 14, 44);
      
      // Summary section
      const totalAmount = filteredOrders.reduce((sum, order) => sum + (Number(order.amount) || 0), 0);
      const cashPayments = filteredOrders.filter(o => o.paymentMethod === 'Cash').length;
      const upiPayments = filteredOrders.filter(o => o.paymentMethod === 'UPI').length;
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Total Amount: ₹${totalAmount.toFixed(2)}`, 14, 52);
      doc.text(`Cash Payments: ${cashPayments}`, 80, 52);
      doc.text(`UPI Payments: ${upiPayments}`, 140, 52);
      
      // Table columns: Order ID, Username, Amount, Payment Method, Plan Type, Meal Preference
      const tableColumn = ["Order ID", "Username", "Amount (INR)", "Payment Method", "Plan Type", "Meal Pref"];
      const tableRows = filteredOrders.map(order => [
        order.orderId ? order.orderId.slice(-8).toUpperCase() : 'N/A',
        order.username || 'Unknown',
        `₹${(Number(order.amount) || 0).toFixed(2)}`,
        order.paymentMethod || 'Cash',
        order.planType || 'Trial',
        order.mealPreference || 'Regular'
      ]);
      
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 60,
        theme: 'grid',
        headStyles: { fillColor: [43, 54, 116], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [244, 247, 254] },
        margin: { top: 60 },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 30 },
          2: { cellWidth: 25, halign: 'right' },
          3: { cellWidth: 25 },
          4: { cellWidth: 20 },
          5: { cellWidth: 25 }
        }
      });
      
      // Add total at the bottom
      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text(`Grand Total: ₹${totalAmount.toFixed(2)}`, 14, finalY);
      
      doc.save(`MealSetu_Payment_Report_${filterLabels[orderFilter]}_${Date.now()}.pdf`);
    } catch (error) {
      console.error("PDF Error:", error);
      alert("Failed to generate PDF. Please try again.");
    }
  };

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      removeAuthItem('token');
      removeAuthItem('user');
      navigate('/login');
    }
  };

  const handleSubmitCompliance = async () => {
              if (!documents.fssai && !documents.gst) {
                alert('Please select at least one document (FSSAI or GST)');
                return;
              }
              
              const formData = new FormData();
              if (documents.fssai) formData.append('fssaiDoc', documents.fssai);
              if (documents.gst) formData.append('gstDoc', documents.gst);
              
              try {
                await submitVendorCompliance(formData);
                alert(' Documents submitted for admin review!\\nStatus reset to Pending. Await approval.');
                setDocuments({ fssai: null, gst: null }); // Reset form
                fetchVendorData(); // Refresh profile/status
              } catch (error) {
                console.error('Compliance submit error:', error);
                alert(' Submit failed: ' + error.message);
              }
            };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardOverview
            profile={profile}
            revenue={dashboardStats.totalRevenue}
            ordersToday={dashboardStats.todayOrders}
            activeUsers={dashboardStats.activeSubscribers}
            kitchenStatus={{ isOpen: kitchenOpen, currentClosure }}
            onToggleKitchen={handleShopToggle}
            onTabChange={setActiveTab}
          />
        );

      case 'cash-payments':
        return <CashPayments />;
case 'commission':
        return <CommissionHistory onGoToExpenses={() => setActiveTab('expenses')} />;

      case 'menu':
        return <WeeklyMenuPlanner />;

case 'orders':
        return (
          <div className="v-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Orders & Upcoming Deliveries</h3>
              <div style={{ display: 'flex', gap: '10px' }}><input type="date" className="v-input" style={{ width: 'auto', margin: 0 }} /><button style={{ background: '#1e293b', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer' }}>Filter</button></div>
            </div>
            <div className="w-full overflow-x-auto">
              <table className="v-table v-table-orders">
                <thead><tr><th>Order ID</th><th>Customer Name</th><th>Meal Preference</th><th>Delivery Slot</th></tr></thead>
                <tbody>
                  {vendorOrders.map(o => (
                    <tr key={o._id}>
                      <td>#{o._id.slice(-6)}</td>
                      <td>{o.customerName || 'Unknown'}</td>
                      <td>{o.mealPreference}</td>
                      <td>{new Date(o.orderDate).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

     case 'customers': {
  // ── helpers ────────────────────────────────────────────────────────
  const fmtD = (d) => d
    ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const statusStyle = (s, daysLeft) => {
    if (s === 'active'    && daysLeft > 7)              return { bg: '#f0fdf4', color: '#16a34a', label: 'Active' };
    if (s === 'active'    && daysLeft <= 7 && daysLeft > 0) return { bg: '#fff7ed', color: '#ea580c', label: `Expiring in ${daysLeft}d` };
    if (s === 'active'    && daysLeft <= 0)             return { bg: '#fef2f2', color: '#dc2626', label: 'Expired' };
    if (s === 'pending')                                return { bg: '#eff6ff', color: '#2563eb', label: 'Upcoming' };
    if (s === 'completed')                              return { bg: '#f8fafc', color: '#64748b', label: 'Completed' };
    if (s === 'cancelled')                              return { bg: '#fef2f2', color: '#dc2626', label: 'Cancelled' };
    return { bg: '#f8fafc', color: '#64748b', label: s || '—' };
  };

  const planColor = { Trial: '#64748b', Weekly: '#f26522', Monthly: '#16a34a' };

  const openPlans = async (c) => {
    setSelectedCustomer(c);
    setCustomerPlans([]);
    setPlansLoading(true);
    try {
      const plans = await getCustomerPlans(c._id);
      setCustomerPlans(Array.isArray(plans) ? plans : []);
    } catch { setCustomerPlans([]); }
    finally { setPlansLoading(false); }
  };
  const closeModal = () => { setSelectedCustomer(null); setCustomerPlans([]); };

  return (
    <>
      {/* ── Responsive CSS ──────────────────────────────────────── */}
      <style>{`
        .cust-grid { display: flex; flex-direction: column; gap: 12px; }
        .cust-card {
          background: #fff; border: 1px solid #e8ecf0; border-radius: 14px;
          padding: 16px; cursor: pointer; transition: box-shadow .15s, border-color .15s;
          display: flex; justify-content: space-between; align-items: center; gap: 12px;
        }
        .cust-card:hover  { border-color: #f26522; box-shadow: 0 4px 16px rgba(242,101,34,.12); }
        .cust-card:active { background: #fff7ed; }
        .cust-card-left   { flex: 1; min-width: 0; }
        .cust-name        { font-size: 15px; font-weight: 800; color: #1e2d5a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cust-meta        { font-size: 12px; color: #64748b; margin-top: 3px; display: flex; flex-wrap: wrap; gap: 6px 12px; }
        .cust-badge       { background: #fff7ed; color: #f26522; font-size: 12px; font-weight: 700;
                            padding: 4px 12px; border-radius: 20px; white-space: nowrap; }
        .cust-arrow       { background: #f26522; color: #fff; font-size: 13px; font-weight: 700;
                            padding: 6px 14px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; }

        /* Modal */
        .cm-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,.5);
          display: flex; align-items: flex-end; justify-content: center;
          z-index: 9999; padding: 0;
        }
        .cm-sheet {
          background: #fff; width: 100%; max-height: 92vh;
          border-radius: 20px 20px 0 0;
          overflow: hidden; display: flex; flex-direction: column;
          box-shadow: 0 -8px 40px rgba(0,0,0,.2);
          animation: slideUp .25s ease;
        }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

        .plan-details-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px 16px;
        }

        /* ── Tablet / Desktop ───────────────────────────── */
        @media (min-width: 640px) {
          .cm-backdrop { align-items: center; padding: 16px; }
          .cm-sheet    { max-width: 720px; max-height: 88vh; border-radius: 18px; animation: fadeIn .2s ease; }
          @keyframes fadeIn { from { opacity:0; transform:scale(.97); } to { opacity:1; transform:scale(1); } }
          .plan-details-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (min-width: 900px) {
          .plan-details-grid { grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); }
        }
      `}</style>

      {/* ── Customer Card List ───────────────────────────────────── */}
      <div className="v-card">
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10 }}>
          <div>
            <h3 style={{ margin:0, fontSize:18, fontWeight:800, color:'#1e2d5a' }}>My Customers</h3>
            <p style={{ margin:'4px 0 0', fontSize:13, color:'#64748b' }}>Tap any card to see full plan history</p>
          </div>
          <span style={{ background:'#fff7ed', color:'#f26522', fontWeight:700, fontSize:13,
            padding:'4px 14px', borderRadius:20, border:'1px solid #fed7aa' }}>
            {customers.length} customers
          </span>
        </div>

        {/* Cards */}
        {customers.length === 0 ? (
          <div style={{ textAlign:'center', padding:48, color:'#94a3b8', fontSize:14 }}>
            No customers yet
          </div>
        ) : (
          <div className="cust-grid">
            {customers.map((c) => (
              <div key={c._id} className="cust-card" onClick={() => openPlans(c)}>
                <div className="cust-card-left">
                  <div className="cust-name">{c.name}</div>
                  <div className="cust-meta">
                    {c.phone && <span> {c.phone}</span>}
                    {c.email && c.email !== '—' && <span>✉️ {c.email}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                  <span className="cust-badge">{c.totalOrders || 0} plans</span>
                  <span className="cust-arrow">View →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Plans Modal (bottom-sheet on mobile, dialog on desktop) ── */}
      {selectedCustomer && (
        <div className="cm-backdrop" onClick={closeModal}>
          <div className="cm-sheet" onClick={e => e.stopPropagation()}>

            {/* Modal Header */}
            <div style={{ padding:'18px 20px', display:'flex', justifyContent:'space-between', alignItems:'flex-start',
              background:'linear-gradient(135deg,#1e2d5a 0%,#2d4a8a 100%)',
              borderRadius:'20px 20px 0 0', flexShrink:0 }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:18, fontWeight:800, color:'#fff',
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {selectedCustomer.name}
                </div>
                <div style={{ fontSize:12, color:'#cbd5e1', marginTop:4, display:'flex', flexWrap:'wrap', gap:'4px 10px' }}>
                  {selectedCustomer.phone && <span> {selectedCustomer.phone}</span>}
                  {selectedCustomer.email && selectedCustomer.email !== '—' &&
                    <span>✉️ {selectedCustomer.email}</span>}
                </div>
              </div>
              <button onClick={closeModal} style={{
                background:'rgba(255,255,255,.15)', border:'none', color:'#fff',
                width:32, height:32, borderRadius:'50%', cursor:'pointer',
                fontSize:16, fontWeight:700, display:'flex', alignItems:'center',
                justifyContent:'center', flexShrink:0, marginLeft:10 }}>✕</button>
            </div>

            {/* Sub-header */}
            <div style={{ padding:'10px 20px', background:'#f8fafc', borderBottom:'1px solid #e8ecf0',
              fontSize:13, color:'#64748b', flexShrink:0 }}>
              📋 <strong style={{ color:'#1e2d5a' }}>
                {customerPlans.length} plan{customerPlans.length !== 1 ? 's' : ''}
              </strong> on record
            </div>

            {/* Scrollable Body */}
            <div style={{ overflowY:'auto', flex:1, padding:'14px 16px 24px' }}>
              {plansLoading ? (
                <div style={{ textAlign:'center', padding:48, color:'#64748b' }}>
                  <div style={{ width:36, height:36, border:'3px solid #e2e8f0',
                    borderTop:'3px solid #f26522', borderRadius:'50%',
                    animation:'spin 1s linear infinite', margin:'0 auto 12px' }} />
                  Loading plans…
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              ) : customerPlans.length === 0 ? (
                <div style={{ textAlign:'center', padding:48, color:'#94a3b8', fontSize:14 }}>
                  No plans found
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {customerPlans.map((p, i) => {
                    const st = statusStyle(p.status, p.daysLeft);
                    const isExpiringSoon = p.status === 'active' && p.daysLeft !== null && p.daysLeft <= 7 && p.daysLeft > 0;
                    const fields = [
                      { icon:'', label:'Start Date',  val: fmtD(p.startDate) },
                      { icon:'', label:'Expiry Date', val: fmtD(p.endDate),
                        valColor: p.daysLeft !== null && p.daysLeft <= 7 && p.daysLeft > 0 ? '#ea580c'
                          : p.daysLeft !== null && p.daysLeft <= 0 ? '#dc2626' : undefined },
                      { icon:'', label:'Amount',      val:`₹${(p.amount||0).toLocaleString('en-IN')}` },
                      { icon:'', label:'Payment',     val:`${p.paymentMethod} · ${p.paymentStatus}` },
                      { icon:'', label:'Meal Pref',   val: p.mealPreference },
                      p.status === 'active' && p.daysLeft !== null
                        ? { icon:'', label:'Days Left',
                            val: p.daysLeft > 0 ? `${p.daysLeft} days` : 'Expired today',
                            valColor: p.daysLeft <= 3 ? '#dc2626' : p.daysLeft <= 7 ? '#ea580c' : '#16a34a' }
                        : null,
                    ].filter(Boolean);

                    return (
                      <div key={i} style={{
                        border:`1px solid ${isExpiringSoon ? '#fed7aa' : '#e8ecf0'}`,
                        borderRadius:12, padding:'14px',
                        background: p.status === 'active' && p.daysLeft > 0 ? '#fafffe' : '#fafafa',
                      }}>
                        {/* Plan top row */}
                        <div style={{ display:'flex', justifyContent:'space-between',
                          alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:6 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:11, fontWeight:700, color:'#94a3b8' }}>PLAN #{p.planNo}</span>
                            <span style={{
                              background: (planColor[p.planType] || '#64748b') + '18',
                              color: planColor[p.planType] || '#64748b',
                              fontSize:12, fontWeight:800, padding:'3px 10px', borderRadius:20 }}>
                              {p.planType}
                            </span>
                          </div>
                          <span style={{ background:st.bg, color:st.color,
                            fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:20 }}>
                            {st.label}
                          </span>
                        </div>

                        {/* Details grid */}
                        <div className="plan-details-grid">
                          {fields.map((row) => (
                            <div key={row.label}>
                              <div style={{ fontSize:10, color:'#94a3b8', fontWeight:700,
                                textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:2 }}>
                                {row.icon} {row.label}
                              </div>
                              <div style={{ fontSize:13, fontWeight:600,
                                color: row.valColor || '#1a202c' }}>{row.val}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

      case 'manual-customers':
        return <AddManualCustomer vendorProfile={profile} />;

      case 'reports':
        return (
          <div className="v-card">
            <div className="pdf-watermark">MEALSETU PARTNER</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Payment Report</h3>
              <button onClick={handleDownloadPDF} disabled={filterLoading} style={{ background: '#f26522', color: 'white', border: 'none', padding: '12px 25px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
                {filterLoading ? ' Loading...' : ' Download PDF'}
              </button>
            </div>
            <div style={{ marginTop: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <label style={{ fontWeight: '600' }}>Filter:</label>
              <select 
                className="v-input" 
                style={{ width: '200px' }} 
                value={orderFilter} 
                onChange={(e) => handleFilterChange(e.target.value)}
              >
                <option value="daily">Daily (Today)</option>
                <option value="weekly">Weekly (Last 7 days)</option>
                <option value="monthly">Monthly (Last 30 days)</option>
              </select>
              <button 
                onClick={() => fetchFilteredOrders(orderFilter)} 
                style={{ background: '#1e293b', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}
              >
                Apply Filter
              </button>
            </div>
            
            {/* Summary Stats */}
            <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
              <div style={{ background: '#f4f7fe', padding: '15px', borderRadius: '10px', flex: 1 }}>
                <p style={{ color: '#a3aed0', margin: 0, fontSize: '12px' }}>Total Orders</p>
                <h3 style={{ color: '#2b3674', margin: '5px 0 0 0' }}>{filteredOrders.length}</h3>
              </div>
              <div style={{ background: '#f4f7fe', padding: '15px', borderRadius: '10px', flex: 1 }}>
                <p style={{ color: '#a3aed0', margin: 0, fontSize: '12px' }}>Total Amount</p>
                <h3 style={{ color: '#2b3674', margin: '5px 0 0 0' }}>₹{filteredOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0).toFixed(2)}</h3>
              </div>
              <div style={{ background: '#f4f7fe', padding: '15px', borderRadius: '10px', flex: 1 }}>
                <p style={{ color: '#a3aed0', margin: 0, fontSize: '12px' }}>Cash Payments</p>
                <h3 style={{ color: '#2b3674', margin: '5px 0 0 0' }}>{filteredOrders.filter(o => o.paymentMethod === 'Cash').length}</h3>
              </div>
              <div style={{ background: '#f4f7fe', padding: '15px', borderRadius: '10px', flex: 1 }}>
                <p style={{ color: '#a3aed0', margin: 0, fontSize: '12px' }}>UPI Payments</p>
                <h3 style={{ color: '#2b3674', margin: '5px 0 0 0' }}>{filteredOrders.filter(o => o.paymentMethod === 'UPI').length}</h3>
              </div>
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '30px' }}>
              <table className="v-table">
                <thead><tr><th>Username</th><th>Amount</th><th>Payment Method</th><th>Plan Type</th><th>Meal Preference</th><th>Date</th></tr></thead>
                <tbody>
                  {filterLoading ? (
                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>Loading...</td></tr>
                  ) : filteredOrders.length > 0 ? (
                    filteredOrders.map((order) => (
                      <tr key={order._id}>
                        <td style={{ fontWeight: 'bold' }}>{order.username || 'Unknown'}</td>
                        <td>₹{(Number(order.amount) || 0).toFixed(2)}</td>
                        <td>
                          <span style={{ 
                            padding: '4px 10px', 
                            borderRadius: '20px', 
                            background: order.paymentMethod === 'UPI' ? '#dcfce7' : '#fef3c7',
                            color: order.paymentMethod === 'UPI' ? '#16a34a' : '#d97706',
                            fontWeight: '600',
                            fontSize: '12px'
                          }}>
                            {order.paymentMethod || 'Cash'}
                          </span>
                        </td>
                        <td>
                          <span style={{ 
                            padding: '4px 10px', 
                            borderRadius: '20px', 
                            background: order.planType === 'Monthly' ? '#dbeafe' : order.planType === 'Weekly' ? '#f3e8ff' : '#f1f5f9',
                            color: order.planType === 'Monthly' ? '#1d4ed8' : order.planType === 'Weekly' ? '#7c3aed' : '#64748b',
                            fontWeight: '600',
                            fontSize: '12px'
                          }}>
                            {order.planType || 'Trial'}
                          </span>
                        </td>
                        <td>
                          <span style={{ 
                            padding: '4px 10px', 
                            borderRadius: '20px', 
                            background: order.mealPreference === 'Jain' ? '#fef3c7' : '#dcfce7',
                            color: order.mealPreference === 'Jain' ? '#d97706' : '#16a34a',
                            fontWeight: '600',
                            fontSize: '12px'
                          }}>
                            {order.mealPreference || 'Regular'}
                          </span>
                        </td>
                        <td>{order.orderDate ? new Date(order.orderDate).toLocaleDateString('en-IN') : 'N/A'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#a3aed0' }}>No orders found for this period. Click "Apply Filter" to load data.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'profile':
        return (
         <div style={{ padding: '10px 0' }}>
            <h3 style={{ color: '#2b3674', marginBottom: '24px' }}>Kitchen Profile Settings</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(220px, 280px)', gap: '30px', alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Personal Info */}
                <div style={{ background: '#f0f4ff', border: '1.5px solid #c7d2fe', borderRadius: '14px', padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
                    <span style={{ fontSize: '18px' }}>👤</span>
                    <span style={{ fontSize: '15px', fontWeight: '700', color: '#3730a3' }}>Personal Info</span>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                      YOUR NAME
                    </label>
                    <input
                      className="v-input"
                      name="ownerName"
                      value={profile.ownerName}
                      onChange={handleProfileChange}
                      placeholder="Your full name"
                      style={{ background: '#fff' }}
                    />
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                      EMAIL <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>(cannot be changed)</span>
                    </label>
                    <input
                      className="v-input"
                      value={profile.email}
                      disabled
                      style={{ background: '#f1f5f9', color: '#94a3b8', cursor: 'not-allowed' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                      PHONE NUMBER
                    </label>
                    <input
                      className="v-input"
                      name="phone"
                      value={profile.phone}
                      onChange={handleProfileChange}
                      placeholder="e.g. 9876543210"
                      style={{ background: '#fff' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>Kitchen Name</label>
                  <input className="v-input" name="kitchenName" value={profile.kitchenName} onChange={handleProfileChange} />
                </div>

                {/* Kitchen Address */}
                <div style={{ background: '#fff8f5', border: '1.5px solid #fcd5b8', borderRadius: '14px', padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
                    <span style={{ fontSize: '18px' }}></span>
                    <span style={{ fontSize: '15px', fontWeight: '700', color: '#c2410c' }}>Kitchen Address</span>
                  </div>

                  {/* Legacy address hint */}
                  {profile.legacyAddr && (
                    <div style={{ fontSize: '12px', color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 12px', marginBottom: '14px' }}>
                      ⚠️ Your original address was saved as a single field. Please fill in the separate fields below so deliveries work correctly.
                      <div style={{ marginTop: '4px', fontWeight: '600' }}>"{profile.legacyAddr}"</div>
                    </div>
                  )}

                  {/* Shop / Building No */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                      SHOP / BUILDING NO. <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>(Optional)</span>
                    </label>
                    <input
                      className="v-input"
                      name="addrShopNo"
                      value={profile.addrShopNo || ''}
                      onChange={handleProfileChange}
                      placeholder="e.g. Shop 3, Ground Floor, Block B"
                      style={{ background: '#fff' }}
                    />
                  </div>

                  {/* Street */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                      STREET / ROAD <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      className="v-input"
                      name="addrStreet"
                      value={profile.addrStreet || ''}
                      onChange={handleProfileChange}
                      placeholder="e.g. Hotel Relief, NH48"
                      style={{ background: '#fff' }}
                    />
                  </div>

                  {/* Area */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                      AREA / LOCALITY <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      className="v-input"
                      name="addrArea"
                      value={profile.addrArea || ''}
                      onChange={handleProfileChange}
                      placeholder="e.g. Baleshwar"
                      style={{ background: '#fff' }}
                    />
                  </div>

                  {/* City + Pincode side by side */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                        CITY <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        className="v-input"
                        name="addrCity"
                        value={profile.addrCity || ''}
                        onChange={handleProfileChange}
                        placeholder="e.g. Surat"
                        style={{ background: '#fff' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                        PINCODE <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        className="v-input"
                        type="text"
                        maxLength={6}
                        name="addrPincode"
                        value={profile.addrPincode || ''}
                        onChange={handleProfileChange}
                        placeholder="e.g. 394315"
                        style={{ background: '#fff' }}
                      />
                    </div>
                  </div>

                  {/* Landmark */}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                      LANDMARK <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '400' }}>(Optional)</span>
                    </label>
                    <input
                      className="v-input"
                      name="addrLandmark"
                      value={profile.addrLandmark || ''}
                      onChange={handleProfileChange}
                      placeholder="e.g. Opp. Khetalaba Tea Stall"
                      style={{ background: '#fff' }}
                    />
                  </div>

                  {/* GPS detect row */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '11px 14px', borderRadius: '10px',
                    background: vendorGpsDetected ? '#f0fdf4' : '#f8fafc',
                    border: `1px solid ${vendorGpsDetected ? '#86efac' : '#e2e8f0'}`,
                  }}>
                    <span style={{ fontSize: '18px' }}>📍</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>Kitchen Location</div>
                      <div style={{ fontSize: '11px', color: vendorGpsDetected ? '#16a34a' : '#94a3b8', marginTop: 2 }}>
                        {vendorGpsDetected
                          ? `✅ Detected (${profile.addrLat?.toFixed(4)}, ${profile.addrLng?.toFixed(4)})`
                          : 'Auto-fill address from your current location'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={detectVendorGps}
                      disabled={detectingVendorGps}
                      style={{
                        background: vendorGpsDetected ? '#16a34a' : '#f26522',
                        color: 'white', border: 'none',
                        borderRadius: '8px', padding: '7px 14px', fontSize: '12px',
                        fontWeight: '600', cursor: detectingVendorGps ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap', opacity: detectingVendorGps ? 0.7 : 1,
                      }}
                    >
                      {detectingVendorGps ? 'Detecting…' : vendorGpsDetected ? ' Re-detect' : ' Detect'}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                    UPI ID
                  </label>
                  <input
                    className="v-input"
                    name="upiId"
                    value={profile.upiId}
                    onChange={handleProfileChange}
                    placeholder="example@upi"
                  />
                </div>
              </div>
              <div style={{ position: 'sticky', top: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Profile Picture */}
                <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#2b3674', marginBottom: '14px' }}>Profile Picture</p>
                  <div style={{ width: '120px', height: '120px', borderRadius: '50%', border: '2px dashed #cbd5e1', margin: '0 auto', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', background: '#f8fafc' }}>
                    {imageLoading ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#e2e8f0' }}>
                        <span style={{ fontSize: '24px' }}>⏳</span>
                      </div>
                    ) : profile.image ? (
                      <img
                        src={resolveImageUrl(profile.image)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        alt="Preview"
                        onError={(e) => { e.target.onerror = null; e.target.src = ''; }}
                        onLoad={() => setImageLoading(false)}
                      />
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>No Image</span>
                    )}
                  </div>
                  <input type="file" accept="image/*" id="imageUpload" hidden onChange={handleImageUpload} />
                  <label htmlFor="imageUpload" style={{ display: 'inline-block', marginTop: '12px', padding: '8px 20px', background: '#f26522', color: 'white', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                    Change Photo
                  </label>
                </div>

                {/* Kitchen Banner */}
                <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#2b3674', marginBottom: '14px' }}>Kitchen Banner / Poster</p>
                  <div style={{ width: '100%', height: '110px', borderRadius: '10px', border: '2px dashed #cbd5e1', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', background: '#f8fafc' }}>
                    {profile.kitchenPoster ? (
                      <img
                        src={resolveImageUrl(profile.kitchenPoster)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        alt="Kitchen Poster"
                        onError={(e) => { e.target.onerror = null; e.target.src = ''; }}
                      />
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>No Banner</span>
                    )}
                  </div>
                  <input type="file" accept="image/*" id="kitchenPosterUpload" hidden onChange={handleKitchenPosterUpload} />
                  <label htmlFor="kitchenPosterUpload" style={{ display: 'inline-block', marginTop: '12px', padding: '8px 20px', background: '#16a34a', color: 'white', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                    Upload Banner
                  </label>
                </div>
              </div>
            </div>
            <button
              className="v-nav-btn"
              style={{ background: '#2b3674', color: 'white', width: '100%', maxWidth: '260px', justifyContent: 'center', marginTop: '28px', padding: '12px 0', fontSize: '14px', fontWeight: '700', borderRadius: '10px' }}
              onClick={handleSaveProfile}
              disabled={loading}
            >
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        );

      // --- NEW RENDER CONTENT CASES ---
      case 'reviews':
        return (
          <div className="v-card">
            <h3>Customer Reviews & Feedback</h3>
            
            {/* Rating Summary */}
            {reviews && reviews.reviews && reviews.reviews.length > 0 && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '20px', 
                marginBottom: '20px',
                padding: '15px',
                background: '#f8fafc',
                borderRadius: '10px'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '36px', fontWeight: 'bold', color: '#f26522' }}>
                    {reviews.averageRating || 0}
                  </span>
                  <div style={{ color: '#f59e0b', fontSize: '20px' }}>
                    {'⭐'.repeat(Math.round(reviews.averageRating || 0))}
                  </div>
                  <small style={{ color: '#64748b' }}>{reviews.totalReviews || 0} reviews</small>
                </div>
                <div style={{ flex: 1 }}>
                  {/* <p style={{ margin: 0, color: '#16a34a', fontWeight: '600' }}>
                    ✓ Reviews sorted by rating (Excellent first)
                  </p>
                  <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    5-star and 4-star reviews are pinned to the top
                  </p> */}
                </div>
              </div>
            )}
            
            <div style={{ marginTop: '20px' }}>
              {reviews && reviews.reviews && reviews.reviews.length > 0 ? (
                reviews.reviews.map((rev, idx) => (
                  <div key={rev._id || idx} style={{
                    padding: '15px',
                    background: rev.isHidden ? '#f8fafc' : rev.rating >= 4 ? '#f0fdf4' : rev.rating <= 2 ? '#fef2f2' : '#fff',
                    marginBottom: '10px',
                    borderRadius: '10px',
                    border: `1px solid ${rev.isFlagged ? '#fecaca' : rev.isHidden ? '#e8ecf0' : '#e8f5e9'}`,
                    opacity: rev.isHidden ? 0.6 : 1,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '15px', color: '#2b3674' }}>{rev.user}</strong>
                          {rev.isVerifiedPurchase && (
                            <span style={{ fontSize: 11, color: '#16a34a', background: '#f0fdf4',
                              border: '1px solid #bbf7d0', borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>
                              ✓ Verified
                            </span>
                          )}
                          {rev.planType && (
                            <span style={{ fontSize: 11, color: '#6d28d9', background: '#ede9fe',
                              borderRadius: 10, padding: '1px 6px' }}>{rev.planType}</span>
                          )}
                          {rev.isHidden && (
                            <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9',
                              borderRadius: 10, padding: '1px 6px' }}>Hidden</span>
                          )}
                          {rev.isFlagged && (
                            <span style={{ fontSize: 11, color: '#dc2626', background: '#fef2f2',
                              borderRadius: 10, padding: '1px 6px' }}>🚩 Flagged</span>
                          )}
                          {rev.isEdited && (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>(edited)</span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>{rev.date}</div>
                      </div>
                      <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontWeight: '600', fontSize: '14px',
                        background: rev.rating >= 4 ? '#dcfce7' : rev.rating <= 2 ? '#fee2e2' : '#fef3c7',
                        color: rev.rating >= 4 ? '#16a34a' : rev.rating <= 2 ? '#dc2626' : '#d97706',
                        whiteSpace: 'nowrap',
                      }}>
                        {'⭐'.repeat(rev.rating)} {rev.rating}/5
                      </span>
                    </div>
                    {rev.comment && (
                      <p style={{ color: '#444', fontSize: '14px', margin: '10px 0 0', lineHeight: 1.6 }}>
                        {rev.comment}
                      </p>
                    )}
                    {rev.helpfulCount > 0 && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                        👍 {rev.helpfulCount} found this helpful
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  <p style={{ fontSize: '18px' }}>📝 No reviews yet</p>
                  <p>Reviews from customers will appear here after they rate your service.</p>
                </div>
              )}
            </div>
          </div>
        );

      case 'compliance':
        return (
          <div className="v-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Kitchen Compliance & Licenses</h3>
<div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
  {isApproved === true ? (
    <span style={{
      background: '#dcfce7',
      color: '#16a34a',
      border: '1px solid #16a34a',
      padding: '8px 20px',
      borderRadius: '20px',
      fontWeight: '700',
      fontSize: '14px'
    }}>
      Approved by Admin
    </span>
  ) : isApproved === false && rejectionReason ? (
    <span style={{
      background: '#fef2f2',
      color: '#ef4444',
      border: '1px solid #ef4444',
      padding: '8px 20px',
      borderRadius: '20px',
      fontWeight: '700',
      fontSize: '14px'
    }}>
      Rejected
    </span>
  ) : (
    <span style={{
      background: '#fff7ed',
      color: '#f26522',
      border: '1px solid #fed7aa',
      padding: '8px 20px',
      borderRadius: '20px',
      fontWeight: '700',
      fontSize: '14px'
    }}>
      Pending Admin Approval
    </span>
  )}
</div>
            </div>
            
            {rejectionReason && !isApproved && (
              <div style={{ 
                background: '#fef2f2', 
                border: '1px solid #fecaca', 
                borderRadius: '12px', 
                padding: '20px', 
                marginTop: '20px',
                marginBottom: '30px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '20px' }}>⚠️</span>
                  <h4 style={{ color: '#dc2626', margin: 0 }}>Admin Rejection Reason</h4>
                </div>
                <p style={{ color: '#991b1b', lineHeight: '1.6', margin: 0 }}>
                  {rejectionReason}
                </p>
              </div>
            )}
            
          <div className="compliance-grid">
  <div style={{ border: '2px dashed #ddd', padding: '20px', borderRadius: '15px', textAlign: 'center' }}>
    <p><strong>FSSAI License</strong></p>
    <input type="file" onChange={(e) => setDocuments({...documents, fssai: e.target.files[0]})} />
    {documents.fssai && <p style={{ color: '#16a34a', fontSize: '12px' }}>Selected: {documents.fssai.name}</p>}
  </div>
  <div style={{ border: '2px dashed #ddd', padding: '20px', borderRadius: '15px', textAlign: 'center' }}>
    <p><strong>GST/Tax Document</strong></p>
    <input type="file" onChange={(e) => setDocuments({...documents, gst: e.target.files[0]})} />
    {documents.gst && <p style={{ color: '#16a34a', fontSize: '12px' }}>Selected: {documents.gst.name}</p>}
  </div>
</div>
           

            <button 
              className="v-nav-btn" 
              style={{ background: '#f26522', color: 'white', marginTop: '20px', width: '200px', justifyContent: 'center' }}
              onClick={handleSubmitCompliance}
            >
              Submit for Approval
            </button>
          </div>
        );

      case 'complaints': {
        const statusBadge = (status) => {
          const map = {
            Open:     { bg: '#fef3c7', color: '#92400e', label: '🔴 Open' },
            Resolved: { bg: '#dcfce7', color: '#166534', label: '✅ Resolved' },
            Rejected: { bg: '#fee2e2', color: '#991b1b', label: '❌ Rejected' },
          };
          const s = map[status] || map['Open'];
          return (
            <span style={{
              background: s.bg, color: s.color,
              padding: '3px 10px', borderRadius: '20px',
              fontSize: '12px', fontWeight: '600'
            }}>{s.label}</span>
          );
        };

        const handleAction = async (id, newStatus) => {
          const reply = replyInputs[id] || '';
          if (newStatus === 'Resolved' && !reply.trim()) {
            setReplyInputs(prev => ({ ...prev, [`${id}_err`]: 'Please write a reply before resolving.' }));
            return;
          }
          setReplyLoading(prev => ({ ...prev, [id]: true }));
          setReplyInputs(prev => ({ ...prev, [`${id}_err`]: '' }));
          try {
            await resolveVendorComplaint(id, newStatus, reply.trim() || 'Noted by vendor');
            await fetchVendorData();
            setReplyInputs(prev => { const n = { ...prev }; delete n[id]; delete n[`${id}_err`]; return n; });
          } catch (e) {
            setReplyInputs(prev => ({ ...prev, [`${id}_err`]: 'Action failed. Please try again.' }));
          } finally {
            setReplyLoading(prev => ({ ...prev, [id]: false }));
          }
        };

        return (
          <div className="v-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#2b3674' }}>Customer Complaints</h3>
                <p style={{ margin: '4px 0 0 0', color: '#a3aed0', fontSize: '13px' }}>
                  {complaints.filter(c => c.status === 'Open').length} open · {complaints.length} total
                </p>
              </div>
              <button
                onClick={fetchVendorData}
                style={{ background: '#f4f7fe', border: 'none', borderRadius: '8px', padding: '8px 14px', color: '#2b3674', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}
              >↻ Refresh</button>
            </div>

            {complaints.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#a3aed0' }}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>🎉</div>
                <div style={{ fontWeight: '600' }}>No complaints yet!</div>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>Your customers are happy.</div>
              </div>
            ) : (
              complaints.map(c => (
                <div key={c._id} style={{
                  border: '1px solid #f4f7fe', borderRadius: '12px',
                  padding: '16px', marginBottom: '14px',
                  borderLeft: `4px solid ${c.status === 'Open' ? '#f59e0b' : c.status === 'Resolved' ? '#16a34a' : '#ef4444'}`
                }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: '700', color: '#2b3674', fontSize: '15px' }}>{c.userId?.name || 'Customer'}</div>
                      <div style={{ color: '#a3aed0', fontSize: '12px', marginTop: '2px' }}>{c.userId?.email || ''}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      {statusBadge(c.status)}
                      <span style={{ color: '#a3aed0', fontSize: '11px' }}>{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Order reference */}
                  {c.orderId && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280', background: '#f9fafb', padding: '4px 10px', borderRadius: '6px', display: 'inline-block' }}>
                      📦 Order: {c.orderId?.planType || c.orderId?._id?.toString().slice(-6) || 'Ref'}
                    </div>
                  )}

                  {/* Message */}
                  <p style={{ margin: '12px 0 0 0', color: '#2b3674', fontSize: '14px', lineHeight: '1.5', background: '#f9fafb', padding: '10px 12px', borderRadius: '8px' }}>
                    {c.message}
                  </p>

                  {/* Vendor response (if already given) */}
                  {c.response && (
                    <div style={{ marginTop: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: '600', marginBottom: '4px' }}>YOUR RESPONSE</div>
                      <div style={{ fontSize: '13px', color: '#166534' }}>{c.response}</div>
                    </div>
                  )}

                  {/* Action area — only for Open complaints */}
                  {c.status === 'Open' && (
                    <div style={{ marginTop: '14px' }}>
                      <textarea
                        placeholder="Write your reply to the customer (required for Resolve)…"
                        rows={2}
                        value={replyInputs[c._id] || ''}
                        onChange={e => setReplyInputs(prev => ({ ...prev, [c._id]: e.target.value }))}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          padding: '10px 12px', border: '1px solid #e2e8f0',
                          borderRadius: '8px', fontSize: '13px', resize: 'vertical',
                          fontFamily: 'inherit', outline: 'none', color: '#2b3674'
                        }}
                      />
                      {replyInputs[`${c._id}_err`] && (
                        <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>{replyInputs[`${c._id}_err`]}</div>
                      )}
                      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                        <button
                          disabled={replyLoading[c._id]}
                          onClick={() => handleAction(c._id, 'Resolved')}
                          style={{ background: replyLoading[c._id] ? '#a3aed0' : '#16a34a', color: 'white', border: 'none', padding: '9px 18px', borderRadius: '8px', fontWeight: '600', cursor: replyLoading[c._id] ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                        >{replyLoading[c._id] ? 'Saving…' : '✓ Resolve'}</button>
                        <button
                          disabled={replyLoading[c._id]}
                          onClick={() => handleAction(c._id, 'Rejected')}
                          style={{ background: replyLoading[c._id] ? '#a3aed0' : '#ef4444', color: 'white', border: 'none', padding: '9px 18px', borderRadius: '8px', fontWeight: '600', cursor: replyLoading[c._id] ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                        >{replyLoading[c._id] ? 'Saving…' : '✗ Reject'}</button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        );
      }

      case 'offers':
        return <VendorOffers />;

      case 'pricing':
        return (
          <div className="v-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
              <div>
                <h3 style={{ color: '#2b3674', margin: 0 }}>Meal Pricing Plans</h3>
                <p style={{ color: '#a3aed0', margin: '5px 0 0 0', fontSize: '14px' }}>
                  Set your Daily/Weekly/Monthly prices. <strong>At least 1 plan must be active.</strong>
                </p>
              </div>
              {/* <span style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '20px', background: pricing.filter(p => p.active).length > 0 ? '#dcfce7' : '#fee2e2', color: pricing.filter(p => p.active).length > 0 ? '#16a34a' : '#ef4444' }}>
                Active: {pricing.filter(p => p.active).length}/3
              </span> */}
              <span
                  style={{
                    fontSize: '12px',
                    padding: '5px 12px',
                    borderRadius: '20px',
                    background:
                      (Array.isArray(pricing) ? pricing : []).filter(p => p.active).length > 0
                        ? '#dcfce7'
                        : '#fee2e2',
                    color:
                      (Array.isArray(pricing) ? pricing : []).filter(p => p.active).length > 0
                        ? '#16a34a'
                        : '#ef4444'
                  }}
                >
                  Active: {(Array.isArray(pricing) ? pricing : []).filter(p => p.active).length}/3
                </span>
            </div>

            {pricingMessage.text && (
              <div style={{ 
                padding: '12px 20px', 
                borderRadius: '8px', 
                marginBottom: '20px',
                background: pricingMessage.type === 'success' ? '#dcfce7' : '#fef2f2',
                color: pricingMessage.type === 'success' ? '#16a34a' : '#ef4444',
                fontWeight: '500'
              }}>
                {pricingMessage.text}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              {pricing.map((plan, index) => (
                <div key={plan.type} className={`pricing-card ${plan.active ? 'active' : ''}`}>
                  <div className="pricing-header">
                    <h4>{plan.type.charAt(0).toUpperCase() + plan.type.slice(1)} Plan</h4>
                    <label className="toggle-switch">
                      <input 
                        type="checkbox" 
                        checked={pricing.find(p => p.type === plan.type)?.active === true}
                        onChange={(e) => {
                          const checked = e.target.checked === true;
                          setPricing(prev => prev.map(p => 
                            p.type === plan.type ? { ...p, active: checked } : p
                          ));
                        }}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                  <div className="price-input-group">
                    <label>Price per {plan.type}</label>
                    <div className="price-input-wrapper">
                      <span>₹</span>
                      <input 
                        type="number" 
                        min="1"
                        max="99999"
                        value={pricing.find(p => p.type === plan.type)?.price ?? ''}
                        onChange={(e) => {
                          const newPrice = Number(e.target.value);
                          setPricing(prev => prev.map(p => 
                            p.type === plan.type ? { ...p, price: newPrice } : p
                          ));
                        }}
                        className="price-input"
                      />
                    </div>
                    {pricingErrors[index] && (
                      <span className="error">{pricingErrors[index]}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginTop: '30px' }}>
              <button 
                onClick={handleSavePricing}
                disabled={savingPricing || pricing.filter(p => p.active).length === 0}
                className="save-pricing-btn"
              >
                {savingPricing ? 'Saving...' : 'Save Pricing Changes'}
              </button>
            </div>
          </div>
        );

      case 'trials':
        return (
          <TrialSettings 
            trialSettings={trialSettings}
            setTrialSettings={setTrialSettings}
            savingTrialSettings={savingTrialSettings}
            trialSettingsMessage={trialSettingsMessage}
            setTrialSettingsMessage={setTrialSettingsMessage}
            fetchVendorData={fetchVendorData}
          />
        );

      case 'loyalty-settings':
        return <LoyaltySettings />;

      case 'finance':
        return <FinanceDashboard />;

      case 'expenses':
        return <ExpenseTracker />;

      case 'analytics':
        return <SubscriptionAnalytics />;

      case 'loyalty':
        return <CustomerLoyalty />;

      case 'delivery-management':
        return <DeliveryManagement />;

      default: return null;
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #f1f5f9', borderTop: '4px solid #f26522', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>Loading your dashboard...</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>🍽️</div>
          <h2 style={{ color: '#2b3674', margin: '0 0 8px 0', fontSize: '22px' }}>Vendor Portal Unavailable</h2>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 24px 0', lineHeight: '1.6' }}>
            We couldn't connect to the server. Please check your internet connection and try again.
          </p>
          <button
            onClick={() => { setError(''); fetchVendorData(); }}
            style={{ background: '#f26522', color: 'white', border: 'none', padding: '12px 28px', borderRadius: '10px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', width: '100%', marginBottom: '12px' }}
          >
             Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', padding: '10px 28px', borderRadius: '10px', fontSize: '14px', cursor: 'pointer', width: '100%' }}
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

return (

  <div className="vendor-container">

    {/* Mobile Topbar - brand left, hamburger right */}
    <div className="vendor-topbar">
      <span className="vendor-topbar-brand">MealSetu</span>
      <button
        className="hamburger-btn"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
    </div>

    {/* Backdrop */}
    <div
      className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`}
      onClick={() => setSidebarOpen(false)}
    />

    <aside className={`v-sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      {/* rest of sidebar stays exactly the same */}
        <h2 style={{ color: '#f26522', fontWeight: '800', marginBottom: '30px' }}>MealSetu</h2>
        <nav style={{ flex: 1 }}>
          <button className={`v-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveTab('dashboard'); setSidebarOpen(false); }}>Overview</button>
          <button className={`v-nav-btn ${activeTab === 'menu' ? 'active' : ''}`} onClick={() => { setActiveTab('menu'); setSidebarOpen(false); }}>Menu Planner</button>
          <button className={`v-nav-btn ${activeTab === 'pricing' ? 'active' : ''}`} onClick={() => { setActiveTab('pricing'); setSidebarOpen(false); }}>Meal Pricing</button>
          <button className={`v-nav-btn ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => { setActiveTab('orders'); setSidebarOpen(false); }}>Order Tracking</button>
          <button className={`v-nav-btn ${activeTab === 'customers' ? 'active' : ''}`} onClick={() => { setActiveTab('customers'); setSidebarOpen(false); }}>My Customers</button>
          <button className={`v-nav-btn ${activeTab === 'manual-customers' ? 'active' : ''}`} onClick={() => { setActiveTab('manual-customers'); setSidebarOpen(false); }}>Add Customer</button>
          <button className={`v-nav-btn ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => { setActiveTab('reports'); setSidebarOpen(false); }}>Reports & PDF</button>
          <button className={`v-nav-btn ${activeTab === 'finance' ? 'active' : ''}`} onClick={() => { setActiveTab('finance'); setSidebarOpen(false); }}>Finance</button>
          <button className={`v-nav-btn ${activeTab === 'expenses' ? 'active' : ''}`} onClick={() => { setActiveTab('expenses'); setSidebarOpen(false); }}> Expenses</button>
          <button className={`v-nav-btn ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => { setActiveTab('analytics'); setSidebarOpen(false); }}> Sub Analytics</button>
          <button className={`v-nav-btn ${activeTab === 'loyalty' ? 'active' : ''}`} onClick={() => { setActiveTab('loyalty'); setSidebarOpen(false); }}>Customer Loyalty</button>
          <button
            className={`v-nav-btn ${activeTab === 'cash-payments' ? 'active' : ''}`}
            onClick={() => { setActiveTab('cash-payments'); setSidebarOpen(false); }}
            style={{ position: 'relative' }}
          >
            Cash Payments
            {cashPendingCount > 0 && (
              <span style={{
                position: 'absolute', right: '12px', top: '50%',
                transform: 'translateY(-50%)', background: '#ef4444',
                color: 'white', borderRadius: '50%', width: '20px', height: '20px',
                fontSize: '11px', fontWeight: '700', display: 'flex',
                alignItems: 'center', justifyContent: 'center', lineHeight: 1
              }}>
                {cashPendingCount > 9 ? '9+' : cashPendingCount}
              </span>
            )}
          </button>
          <button className={`v-nav-btn ${activeTab === 'commission' ? 'active' : ''}`} onClick={() => { setActiveTab('commission'); setSidebarOpen(false); }}>Commission</button>
          <button className={`v-nav-btn ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => { setActiveTab('reviews'); setSidebarOpen(false); }}>Reviews</button>
          <button
            className={`v-nav-btn ${activeTab === 'complaints' ? 'active' : ''}`}
            onClick={() => { setActiveTab('complaints'); setSidebarOpen(false); }}
            style={{ position: 'relative' }}
          >
            Complaints
            {complaints.filter(c => c.status === 'Open').length > 0 && (
              <span style={{
                position: 'absolute', right: '12px', top: '50%',
                transform: 'translateY(-50%)', background: '#ef4444',
                color: 'white', borderRadius: '50%', width: '20px', height: '20px',
                fontSize: '11px', fontWeight: '700', display: 'flex',
                alignItems: 'center', justifyContent: 'center', lineHeight: 1
              }}>
                {complaints.filter(c => c.status === 'Open').length > 9 ? '9+' : complaints.filter(c => c.status === 'Open').length}
              </span>
            )}
          </button>
          <button className={`v-nav-btn ${activeTab === 'compliance' ? 'active' : ''}`} onClick={() => { setActiveTab('compliance'); setSidebarOpen(false); }}>Compliance</button>
          <button className={`v-nav-btn ${activeTab === 'offers' ? 'active' : ''}`} onClick={() => { setActiveTab('offers'); setSidebarOpen(false); }}>Offers</button>
          <button className={`v-nav-btn ${activeTab === 'trials' ? 'active' : ''}`} onClick={() => { setActiveTab('trials'); setSidebarOpen(false); }}>Trial Settings</button>
          <button className={`v-nav-btn ${activeTab === 'loyalty-settings' ? 'active' : ''}`} onClick={() => { setActiveTab('loyalty-settings'); setSidebarOpen(false); }}>Loyalty Settings</button>
          <button className={`v-nav-btn ${activeTab === 'delivery-management' ? 'active' : ''}`} onClick={() => { setActiveTab('delivery-management'); setSidebarOpen(false); }}> Delivery Mangement</button>
          <button className={`v-nav-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => { setActiveTab('profile'); setSidebarOpen(false); }}>Edit Profile</button>
        </nav>
        <button className="v-nav-btn" onClick={handleLogout} style={{ color: '#ef4444', marginTop: 'auto' }}>Logout</button>
      </aside>

      <main className="vendor-main">
     

        <header className="vendor-header">
          <div className="vendor-header-left">
            <h1 className="vendor-title">Vendor Portal</h1>
            <p className="vendor-subtitle">Manage your kitchen operations</p>
          </div>
          <div className="kitchen-status-bar">
            <span className={`kitchen-status-text kitchen-status-${kitchenOpen ? 'open' : 'closed'}`}>
              {kitchenOpen ? '● Kitchen is Open' : '○ Kitchen is Closed'}
            </span>
          </div>
        </header>

        {renderContent()}
      </main>

    </div>
  );
};

export default VendorDashboard;

// ================= Weekly Menu Planner Component =================
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const WeeklyMenuPlanner = () => {
  const [weeklyPlan, setWeeklyPlan] = useState({
    Monday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
    Tuesday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
    Wednesday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
    Thursday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
    Friday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
    Saturday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
    Sunday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' }
  });

  // Jain menu state
  const [jainSettings, setJainSettings] = useState({ offersJainMenu: false });
  const [jainWeeklyPlan, setJainWeeklyPlan] = useState({
    Monday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
    Tuesday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
    Wednesday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
    Thursday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
    Friday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
    Saturday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' },
    Sunday: { mainCourse: '', altSabji: '', altSabji2: '', sides: '', specialAddOns: '' }
  });
  const [loadingJain, setLoadingJain] = useState(true);
  const [savingJain, setSavingJain] = useState(false);
  const [jainMessage, setJainMessage] = useState({ type: '', text: '' });
  const [jainToggleLoading, setJainToggleLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Fetch existing weekly plan on mount
  useEffect(() => {
    const fetchWeeklyPlan = async () => {
      try {
        setLoading(true);
        const data = await getWeeklyPlan();
        if (data.weeklyPlan) {
          setWeeklyPlan(data.weeklyPlan);
        }
      } catch (error) {
        console.warn('Failed to load weekly plan:', error);
      } finally {
        setLoading(false);
      }
    };

    const fetchJainMenu = async () => {
      try {
        setLoadingJain(true);
        const data = await getJainMenu();
        setJainSettings({ offersJainMenu: data.offersJainMenu || false });
        if (data.jainWeeklyPlan) {
          setJainWeeklyPlan(data.jainWeeklyPlan);
        }
      } catch (error) {
        console.warn('Failed to load Jain menu:', error);
        setJainSettings({ offersJainMenu: false });
      } finally {
        setLoadingJain(false);
      }
    };

    fetchWeeklyPlan();
    fetchJainMenu();
  }, []);

// Handle input changes for REGULAR menu
  const handleDayChange = (day, field, value) => {
    setWeeklyPlan(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value
      }
    }));
  };

  // Handle input changes for JAIN menu
  const handleJainDayChange = (day, field, value) => {
    setJainWeeklyPlan(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value
      }
    }));
  };

  // Jain Toggle Handler - Optimistic + API call
  const handleJainToggle = async (e) => {
    const newValue = e.target.checked;
    try {
      setJainToggleLoading(true);
      
      // Optimistic UI update
      setJainSettings(prev => ({ offersJainMenu: newValue }));
      
      // // API call
      // await saveJainMenu({
      //   offersJainMenu: newValue,
      //   jainWeeklyPlan: jainWeeklyPlan
      // });

      if (newValue) {
  // Check at least one day has data before enabling
  const hasData = Object.values(jainWeeklyPlan).some(
    day => day.mainCourse && day.mainCourse.trim() !== ''
  );

  if (!hasData) {
    alert(' Please fill Jain menu first before enabling');
    return;
  }
}

await saveJainMenu({
  offersJainMenu: newValue,
  jainWeeklyPlan: jainWeeklyPlan
});
      
    } catch (error) {
      // Revert on error
      setJainSettings(prev => ({ offersJainMenu: !newValue }));
      alert('Failed to update Jain toggle: ' + error.message);
    } finally {
      setJainToggleLoading(false);
    }
  };

  // Save Jain Menu with validation
  const handleSaveJainMenu = async () => {
    try {
      setSavingJain(true);
      setJainMessage({ type: '', text: '' });
      
      // Validation: mainCourse required for every day
      const errors = [];
      DAYS_OF_WEEK.forEach(day => {
        if (!jainWeeklyPlan[day].mainCourse.trim()) {
          errors.push(`${day}: Main course is required`);
        }
      });
      
      if (errors.length > 0) {
        setJainMessage({ type: 'error', text: errors.join('; ') });
        return;
      }
      
      await saveJainMenu({
        offersJainMenu: true,
        jainWeeklyPlan: jainWeeklyPlan
      });
      
      setJainMessage({ type: 'success', text: 'Jain menu saved successfully!' });
      setTimeout(() => setJainMessage({ type: '', text: '' }), 4000);
      
    } catch (error) {
      setJainMessage({ type: 'error', text: error.message || 'Failed to save Jain menu' });
    } finally {
      setSavingJain(false);
    }
  };


  
  // Batch Save - Save entire week's schedule in one API call
  const handleBatchSave = async () => {
    try {
      setSaving(true);
      setMessage({ type: '', text: '' });
      
      await saveWeeklyPlan(weeklyPlan);
      
      setMessage({ type: 'success', text: 'Weekly menu plan saved successfully!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save weekly plan: ' + error.message });
    } finally {
      setSaving(false);
    }
  };



  if (loading) {
    return (
      <div className="v-card" style={{ textAlign: 'center', padding: '40px' }}>
        <p>Loading weekly menu plan...</p>
      </div>
    );
  }

  return (
    <div className="v-card">
      {/* ===== JAIN MENU SETTINGS - NEW TOP SECTION ===== */}
      <div style={{ background: '#fff8f0', padding: '20px', borderRadius: '12px', border: '2px solid #f26522', marginBottom: '25px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div>
            <h3 style={{ color: '#f26522', margin: 0, fontSize: '18px' }}> Jain Menu Settings</h3>
            <p style={{ color: '#a3aed0', margin: '5px 0 0 0', fontSize: '14px' }}>
              Offer Jain (no onion/garlic) menu to customers
            </p>
          </div>
        </div>

        {/* Toggle Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <label className="toggle-switch-large" style={{ fontSize: '16px', fontWeight: '600' }}>
            <input 
              type="checkbox" 
              checked={jainSettings.offersJainMenu} 
              onChange={handleJainToggle}
              disabled={jainToggleLoading}
            />
            <span className="slider-large"></span>
            Offer Jain Menu to customers
          </label>
          {jainToggleLoading && <div style={{ width: '20px', height: '20px', border: '2px solid #f3f4f6', borderTop: '2px solid #f26522', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />}
        </div>

        {/* Disabled Info Box */}
        {!jainSettings.offersJainMenu && !loadingJain && (
          <div style={{ 
            background: '#f3f4f6', 
            border: '1px solid #d1d5db', 
            borderRadius: '8px', 
            padding: '15px', 
            marginTop: '15px',
            color: '#6b7280'
          }}>
            ℹ️ Jain menu is disabled. Customers will see "Jain menu not available for your kitchen."
          </div>
        )}

        {/* Jain Weekly Planner - Conditional */}
        {jainSettings.offersJainMenu && (
          <>
            <h4 style={{ color: '#f26522', margin: '20px 0 15px 0', fontSize: '16px' }}>Jain Menu — Weekly Schedule</h4>
            
            {/* Jain Message */}
            {jainMessage.text && (
              <div style={{ 
                padding: '12px 20px', 
                borderRadius: '8px', 
                marginBottom: '20px',
                background: jainMessage.type === 'success' ? '#dcfce7' : '#fef2f2',
                color: jainMessage.type === 'success' ? '#16a34a' : '#ef4444'
              }}>
                {jainMessage.text}
              </div>
            )}

            {/* Jain 7-Day Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {DAYS_OF_WEEK.map(day => (
                <div key={day} style={{ background: '#f0fdf4', borderRadius: '12px', padding: '20px', border: '1px solid #bbf7d0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px', paddingBottom: '10px', borderBottom: '2px solid #16a34a' }}>
                    <span style={{ fontSize: '20px' }}></span>
                    <h4 style={{ margin: 0, color: '#166534', fontSize: '16px' }}>{day}</h4>
                  </div>

                  {/* Main Course */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                      Main Course <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input 
                      type="text"
                      className="v-input"
                      placeholder="Aloo Gobi, Lauki Sabji"
                      value={jainWeeklyPlan[day].mainCourse}
                      onChange={(e) => handleJainDayChange(day, 'mainCourse', e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* Alt Sabji */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                      Alt Sabji
                    </label>
                    <input 
                      type="text"
                      className="v-input"
                      placeholder="Mix Veg (no garlic), Tinda Sabji"
                      value={jainWeeklyPlan[day].altSabji}
                      onChange={(e) => handleJainDayChange(day, 'altSabji', e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* 2nd Alt Sabji */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                      2nd Alt Sabji
                    </label>
                    <input 
                      type="text"
                      className="v-input"
                      placeholder="Bhindi, Karela Sabji"
                      value={jainWeeklyPlan[day].altSabji2 || ''}
                      onChange={(e) => handleJainDayChange(day, 'altSabji2', e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* Sides */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                      Sides
                    </label>
                    <input 
                      type="text"
                      className="v-input"
                      placeholder="Roti, Rice (no onion/garlic)"
                      value={jainWeeklyPlan[day].sides}
                      onChange={(e) => handleJainDayChange(day, 'sides', e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* Special Add-ons */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                      Special Add-ons
                    </label>
                    <input 
                      type="text"
                      className="v-input"
                      placeholder="Jain Sweet, Cucumber Raita"
                      value={jainWeeklyPlan[day].specialAddOns}
                      onChange={(e) => handleJainDayChange(day, 'specialAddOns', e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Save Jain Menu Button */}
            <div style={{ marginTop: '30px', textAlign: 'center' }}>
              <button 
                onClick={handleSaveJainMenu}
                disabled={savingJain}
                style={{ 
                  background: savingJain ? '#94a3b8' : '#16a34a',
                  color: 'white',
                  border: 'none',
                  padding: '15px 50px',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: savingJain ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)'
                }}
              >
                {savingJain ? (
                  <>🟢 Saving...</>
                ) : (
                  <>🟢 Save Jain Menu</>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ===== REGULAR WEEKLY PLANNER ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <div>
          <h3 style={{ color: '#2b3674', margin: 0 }}>Weekly Menu Planner</h3>
          <p style={{ color: '#a3aed0', margin: '5px 0 0 0', fontSize: '14px' }}>
            Manage your 7-day rolling schedule (Monday to Sunday)
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ 
            fontSize: '12px', 
            padding: '5px 12px', 
            borderRadius: '20px',
            background: '#f4f7fe',
            color: '#2b3674'
          }}>
            📅 Rolling Week
          </span>
        </div>
      </div>

      {/* Regular Success/Error Message */}
      {message.text && (
        <div style={{ 
          padding: '12px 20px', 
          borderRadius: '8px', 
          marginBottom: '20px',
          background: message.type === 'success' ? '#dcfce7' : '#fef2f2',
          color: message.type === 'success' ? '#16a34a' : '#ef4444',
          fontWeight: '500'
        }}>
          {message.text}
        </div>
      )}

      {/* Regular 7-Day Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        {DAYS_OF_WEEK.map(day => (
          <div 
            key={day} 
            style={{ 
              background: '#f8fafc', 
              borderRadius: '12px', 
              padding: '20px',
              border: '1px solid #e2e8f0'
            }}
          >
            {/* Day Header */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px',
              marginBottom: '15px',
              paddingBottom: '10px',
              borderBottom: '2px solid #f26522'
            }}>
              <span style={{ fontSize: '20px' }}>
                {day === 'Monday' ? '' : day === 'Tuesday' ? '' : day === 'Wednesday' ? '' : day === 'Thursday' ? '' : day === 'Friday' ? '' : day === 'Saturday' ? '' : ''}
              </span>
              <h4 style={{ margin: 0, color: '#2b3674', fontSize: '16px' }}>{day}</h4>
            </div>

            {/* Main Course Input */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                 Main Course
              </label>
              <input 
                type="text"
                className="v-input"
                placeholder="e.g. Paneer Butter Masala"
                value={weeklyPlan[day].mainCourse}
                onChange={(e) => handleDayChange(day, 'mainCourse', e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Alternative Sabji Input */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                 Alt Sabji
              </label>
              <input 
                type="text"
                className="v-input"
                placeholder="e.g. Mix Veg Fry"
                value={weeklyPlan[day].altSabji}
                onChange={(e) => handleDayChange(day, 'altSabji', e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Second Alternative Sabji Input */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                 2nd Alt Sabji
              </label>
              <input 
                type="text"
                className="v-input"
                placeholder="e.g. Aloo Gobhi"
                value={weeklyPlan[day].altSabji2 || ''}
                onChange={(e) => handleDayChange(day, 'altSabji2', e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Sides Input */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                 Sides
              </label>
              <input 
                type="text"
                className="v-input"
                placeholder="e.g. Dal Fry + Rice + Roti"
                value={weeklyPlan[day].sides}
                onChange={(e) => handleDayChange(day, 'sides', e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Special Add-ons Input */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>
                   Special Add-ons
              </label>
              <input 
                type="text"
                className="v-input"
                placeholder="e.g. Sweet + Salad + Papad"
                value={weeklyPlan[day].specialAddOns}
                onChange={(e) => handleDayChange(day, 'specialAddOns', e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Batch Save Button */}
      <div style={{ marginTop: '30px', textAlign: 'center' }}>
        <button 
          onClick={handleBatchSave}
          disabled={saving}
          style={{ 
            background: saving ? '#94a3b8' : '#f26522',
            color: 'white',
            border: 'none',
            padding: '15px 50px',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 4px 14px rgba(242, 101, 34, 0.3)'
          }}
        >
          {saving ? (
            <> Saving...</>
          ) : (
            <> Batch Save Weekly Plan</>
          )}
        </button>
        <p style={{ color: '#a3aed0', fontSize: '12px', marginTop: '10px' }}>
          Saves all 7 days in one API call
        </p>
      </div>
    </div>
  );
};