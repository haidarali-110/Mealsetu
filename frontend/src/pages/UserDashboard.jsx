import { useEffect, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import jsPDF from 'jspdf';

import autoTable from 'jspdf-autotable';

import Sidebar from '../components/dashboard/shared/Sidebar';

import WelcomeCard from '../components/dashboard/user/WelcomeCard';

import OrderMeals from '../components/dashboard/user/OrderMeals';

import Subscription from '../components/dashboard/user/Subscription';

import History from '../components/dashboard/user/History';
import { getAuthItem, removeAuthItem, setAuthItem } from '../utils/authStorage';

import Offers from '../components/dashboard/user/Offers';

import Safety from '../components/dashboard/user/Safety';

import ProfileModal from '../components/dashboard/user/ProfileModal';

import ReviewModal from '../components/dashboard/user/ReviewModal';

import AllReviewsModal from '../components/dashboard/user/AllReviewsModal';

import PasswordModal from '../components/dashboard/user/PasswordModal';

import { OrderProvider } from '../context/OrderContext';
import { addReview, applyLeave, checkReviewEligibility, extendSubscription, getActiveOffers, getActiveSubscriptionStatus, getApprovedVendors, getClaimedOffers, getCurrentUser, getMenus, getUserOrders, getUserSubscription, getVendorWeeklyPlan, placeOrder, updateUserProfile, updateUserProfilePic, downloadUserOrderInvoice } from '../utils/api';
import { connectSocket, disconnectSocket, offEvent, onEvent } from '../utils/socket';

import './UserDashbord.css';

export default function UserDashboard() {
  const navigate = useNavigate();

  // Sidebar state for mobile drawer
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 1. INITIALIZE STATE
  const [user, setUser] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    pincode: "",
    profilePic: "",
    autoRenew: false,
    expiryDate: "",
    pausedDays: []
  });



  // Subscription state

  const [subscription, setSubscription] = useState(null);

  // State for tracking if user has active plan (to hide trial button)
  const [hasActivePlan, setHasActivePlan] = useState(false);



  // State for storing selected photo file

  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);



  const [orders, setOrders] = useState([]);

  const [tiffins, setTiffins] = useState([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');



  // LEAVE FORM STATE

  const [leaveStart, setLeaveStart] = useState('');

  const [leaveEnd, setLeaveEnd] = useState('');

  const [mealType, setMealType] = useState('both');



  // MODAL & OTP STATES

  const [showProfileModal, setShowProfileModal] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [showReviewModal, setShowReviewModal] = useState(false);

  const [showAllReviewsModal, setShowAllReviewsModal] = useState(false);



// FEATURE STATE: ACTIVE TAB
  const [activeTab, setActiveTab] = useState('services');

  // REVIEW ELIGIBILITY STATE
  const [reviewEligibility, setReviewEligibility] = useState(null);
  const [showReviewEligibilityPopup, setShowReviewEligibilityPopup] = useState(false);

  // Selected vendor for reviews
  const [selectedVendor, setSelectedVendor] = useState(null);

  // ACTIVE OFFERS STATE
  const [activeOffers, setActiveOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState(null);
  const [newOfferAlert, setNewOfferAlert] = useState(null);
  
  // CLAIMED OFFERS STATE - array of offer IDs that the current user has redeemed
  const [claimedOfferIds, setClaimedOfferIds] = useState([]);
  
  // Selected offer for redemption - when user clicks redeem, we navigate to order flow
  const [selectedOfferVendor, setSelectedOfferVendor] = useState(null);
  const [selectedOfferPlan, setSelectedOfferPlan] = useState(null);
const handleViewReviews = (vendor) => {
  setSelectedVendor(vendor);
  setShowAllReviewsModal(true);
};

  // Check if user can review a vendor
  const handleWriteReview = async (vendor) => {
    try {
      const vendorId = vendor.vendorId || vendor._id || vendor.id;
      const eligibility = await checkReviewEligibility(vendorId);
      setReviewEligibility(eligibility);
      
      if (eligibility.canReview) {
        // User can review - open the review modal
        setSelectedVendor(vendor);
        setShowReviewModal(true);
      } else {
        // User cannot review - show popup with message
        setSelectedVendor(vendor);
        setShowReviewEligibilityPopup(true);
      }
    } catch (error) {
      console.error('Error checking review eligibility:', error);
      // On error, allow trying to submit review anyway (fallback behavior)
      setSelectedVendor(vendor);
      setShowReviewModal(true);
    }
  };



  // Load user data on mount
  useEffect(() => {
    const token = getAuthItem('token');
    const userData = getAuthItem('user');

    if (!token || !userData) {
      navigate('/login');
      return;
    }

    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== 'user') {
      navigate('/');
      return;
    }

    // Initialize user state with profilePic from localStorage if available
    if (parsedUser.profilePic) {
      setUser(prev => ({
        ...prev,
        ...parsedUser,
        profilePic: parsedUser.profilePic || prev.profilePic
      }));
    }

    connectSocket(parsedUser._id, 'user');
    fetchUserData();
    return () => disconnectSocket();
  }, [navigate]);

  // Real-time offers socket listener
  useEffect(() => {
    const handleOffersUpdated = (data) => {
      if (data?.type === 'new_offer') {
        setNewOfferAlert(data.message || 'A new offer is available!');
        setTimeout(() => setNewOfferAlert(null), 6000);
      }
      fetchActiveOffers();
    };
    onEvent('offers_updated', handleOffersUpdated);
    return () => offEvent('offers_updated', handleOffersUpdated);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle trial intent from login/register redirect
  useEffect(() => {
    // First check React Router state (from Login/Register navigation)
    const locationState = window.history.state;
    if (locationState && locationState.state && locationState.state.activeTab === 'subscription') {
      setActiveTab('subscription');
    }
    
    // Also check localStorage for trial intent (set by LandingPage)
    const trialIntent = localStorage.getItem('trialIntent');
    if (trialIntent === 'true') {
      // Clear the intent
      localStorage.removeItem('trialIntent');
      // Navigate to subscription tab
      setActiveTab('subscription');
    }
  }, []);

  // Polling to refresh menu data every 30 seconds for real-time updates
  useEffect(() => {
    const intervalId = setInterval(async () => {
      try {
        const menus = await getMenus();
        // Map menus to tiffins UI shape - include kitchenPoster for vendor images
        const mapped = (menus || []).map(m => ({
          vendorId: m.vendorId || null,
          name: m.kitchenName || (m.vendorId && m.vendorId.kitchenName) || 'Partner Kitchen',
          price: m.menuPrice || m.price || 80,
          rating: m.rating ?? 0,
          reviewCount: m.reviewCount ?? 0,
          type: m.dietaryCategory || 'Regular',
          fssai: m.fssaiNumber || '',
          workingDays: m.workingDays || 'Mon - Sat',
          timings: m.timings || '11:00 AM - 9:00 PM',
          // Include kitchenPoster from vendor data
          kitchenPoster: m.kitchenPoster || null,
          // Trial settings
          trialEnabled: m.trialEnabled === true,
          trialFee: m.trialFee || 0,
          reviews: []
        }));
        if (mapped.length > 0) setTiffins(mapped);
      } catch (e) {
        console.warn('Polling: Failed to refresh menus', e);
      }
    }, 30000); // 30 seconds polling interval

    // Cleanup on unmount
    return () => clearInterval(intervalId);
  }, []);

  // Fetch claimed offers (offers already redeemed by current user)
  const fetchClaimedOffers = async () => {
    try {
      console.log('[UserDashboard] Fetching claimed offers...');
      const claimedIds = await getClaimedOffers();
      console.log('[UserDashboard] Claimed offer IDs:', claimedIds);
      // Ensure we set an array
      const idsArray = Array.isArray(claimedIds) ? claimedIds : [];
      setClaimedOfferIds(idsArray);
    } catch (error) {
      console.error('[UserDashboard] Error fetching claimed offers:', error);
      // Don't set error state for claimed offers - it's non-critical
    }
  };

  // Fetch active offers when offers tab is selected
  const fetchActiveOffers = async () => {
    try {
      setOffersLoading(true);
      setOffersError(null);
      console.log('[UserDashboard] Fetching active offers...');
      const offers = await getActiveOffers();
      console.log('[UserDashboard] Active offers response:', offers);
      console.log('[UserDashboard] Number of offers:', offers?.length || 0);
      
      // Ensure we set an array - handle both direct array and wrapped response
      const offersArray = Array.isArray(offers) ? offers : (offers?.offers || []);
      setActiveOffers(offersArray);
    } catch (error) {
      console.error('[UserDashboard] Error fetching active offers:', error);
      setOffersError('Failed to load offers. Please try again.');
    } finally {
      setOffersLoading(false);
    }
  };

  // Fetch offers when switching to offers tab
  useEffect(() => {
    if (activeTab === 'offers') {
      // Fetch both active offers and claimed offers for the current user
      fetchActiveOffers();
      fetchClaimedOffers();
    }
  }, [activeTab]);

  // Called by Offers.jsx after a successful redemption — updates parent state
  const handleRedeemOffer = async (offerId) => {
    setClaimedOfferIds(prev => prev.includes(offerId) ? prev : [...prev, offerId]);
    try {
      try {
        const userOrders = await getUserOrders();
        setOrders(userOrders || []);
      } catch (refreshError) {
        console.error('Order succeeded, but order history refresh failed:', refreshError);
        alert('Your order was placed successfully. Refresh the page to update your order history.');
      }
      const userData = await getCurrentUser();
      setUser(prev => ({ ...prev, expiryDate: userData.expiryDate }));
    } catch (e) {
      console.error('Failed to refresh after offer redemption:', e);
    }
  };



  const fetchUserData = async () => {

    try {

      setLoading(true);
      setError('');

      const userData = await getCurrentUser();

      const updatedUser = {

        ...user,

        ...userData,

        pausedDays: user.pausedDays

      };

      setUser(updatedUser);

     

      // Update localStorage with fresh user data from backend
      const storedUser = JSON.parse(getAuthItem('user') || '{}');
      setAuthItem('user', JSON.stringify({
        ...storedUser,
        ...userData,
        profilePic: userData.profilePic || storedUser.profilePic
      }));

     

      const userOrders = await getUserOrders();

      setOrders(userOrders || []);

     

      // Fetch subscription data - 404 expected if no active sub
      try {
        const subData = await getUserSubscription();
        setSubscription(subData);
      } catch (subErr) {
        if (subErr.message?.includes('No active subscription')) {
          console.log('[UserDashboard] No active subscription found - normal');
        } else {
          console.warn('Subscription fetch error:', subErr.message);
        }
        setSubscription(null);
      }
     
      // Fetch active subscription status (for trial button visibility) - 404 expected
      try {
        const statusData = await getActiveSubscriptionStatus();
        setHasActivePlan(statusData.hasActivePlan || false);
      } catch (statusErr) {
        if (statusErr.message?.includes('No active subscription')) {
          console.log('[UserDashboard] No active plan found - trial available');
        } else {
          console.warn('Subscription status error:', statusErr.message);
        }
        setHasActivePlan(false);
      }

      // Fetch claimed offers on initial dashboard load so badges appear immediately
      try {
        const claimedIds = await getClaimedOffers();
        console.log('[UserDashboard] Initial claimed offer IDs:', claimedIds);
        const idsArray = Array.isArray(claimedIds) ? claimedIds : [];
        setClaimedOfferIds(idsArray);
      } catch (claimedErr) {
        console.warn('Could not fetch claimed offers');
      }

     

      try {
        const menus = await getMenus();
        // Map menus to tiffins UI shape - include full menu data for dynamic display
        let mapped = (menus || []).map(m => ({
          // Vendor info
          vendorId: m.vendorId || null,
          name: m.kitchenName || 'Partner Kitchen',
          address: m.address || '',
          price: m.menuPrice || m.price || 80,
          rating: m.rating ?? 0,
          reviewCount: m.reviewCount ?? 0,
          type: m.dietaryCategory || 'Regular',
          fssai: m.fssaiNumber || '',
          workingDays: m.workingDays || 'Mon - Sat',
          timings: m.timings || '11:00 AM - 9:00 PM',
          pricing: m.pricing || [],
          offersJainMenu: m.offersJainMenu || false,
          upiId: m.upiId || null,
          jainWeeklyPlan: m.jainWeeklyPlan || {},

          // Menu items from Menu collection
          menuId: m._id,
          mainSabji: m.mainSabji || '',
          altSabji: m.altSabji || '',
          sweetItem: m.sweetItem || '',
          menuDate: m.date,
          // Include kitchenPoster from vendor data
          kitchenPoster: m.kitchenPoster || null,
          // Trial settings
          trialEnabled: m.trialEnabled === true,
          trialFee: m.trialFee || 0,
          reviews: []
        }));

        
        // If no menus found, fetch approved vendors as fallback
        if (mapped.length === 0) {
          try {
            const vendors = await getApprovedVendors();
            mapped = (vendors || []).map(v => ({
              vendorId: v.vendorId || v._id || null,
              name: v.name || v.kitchenName || 'Partner Kitchen',
              address: v.address || '',
              price: v.menuPrice || v.price || 80,
              rating: v.rating ?? 0,
              reviewCount: v.reviewCount ?? 0,
              type: v.type || 'Regular',
              fssai: v.fssaiNumber || v.fssai || '',
              workingDays: v.workingDays || 'Mon - Sat',
              timings: v.timings || '11:00 AM - 9:00 PM',
              pricing: v.pricing || [],
              offersJainMenu: v.offersJainMenu || false,
              upiId: v.upiId || null,
              jainWeeklyPlan: v.jainWeeklyPlan || {},
              weeklyPlan: v.weeklyPlan,
              // Include kitchenPoster from vendor data
              kitchenPoster: v.kitchenPoster || null,
              // Trial settings
              trialEnabled: v.trialEnabled === true,
              trialFee: v.trialFee || 0,
              reviews: []
            }));

          } catch (vendorErr) {
            console.warn('Failed to load vendors', vendorErr);
          }
        }
        
        if (mapped.length > 0) setTiffins(mapped);
      } catch (e) {
        console.warn('Failed to load menus', e);
        
        // Try fetching vendors as final fallback
        try {
          const vendors = await getApprovedVendors();
          const mapped = (vendors || []).map(v => ({
            vendorId: v.vendorId || v._id || null,
            name: v.name || v.kitchenName || 'Partner Kitchen',
            address: v.address || '',
            price: v.menuPrice || v.price || 80,
            rating: v.rating ?? 0,
            reviewCount: v.reviewCount ?? 0,
            type: v.type || 'Regular',
            fssai: v.fssaiNumber || v.fssai || '',
            workingDays: v.workingDays || 'Mon - Sat',
            timings: v.timings || '11:00 AM - 9:00 PM',
            weeklyPlan: v.weeklyPlan,
            // Include kitchenPoster from vendor data
            kitchenPoster: v.kitchenPoster || null,
            // Trial settings
            trialEnabled: v.trialEnabled === true,
            trialFee: v.trialFee || 0,
            reviews: []
          }));
          if (mapped.length > 0) setTiffins(mapped);
        } catch (vendorErr) {
          console.warn('Failed to load vendors as fallback', vendorErr);
        }
      }

    } catch (err) {

      console.error('Error fetching user data:', err);

      setError('Failed to load user data');

    } finally {

      setLoading(false);

    }

  };



  // --- FUNCTIONS ---



  // Handle Photo Change - store the file for upload

  const handlePhotoChange = (e) => {

    const file = e.target.files[0];

    if (file) {

      // Store the file for later upload

      setSelectedPhotoFile(file);

     

      // Also show preview immediately

      const reader = new FileReader();

      reader.onloadend = () => {

        setUser({ ...user, profilePic: reader.result });

      };

      reader.readAsDataURL(file);

    }

  };



  const handleSaveProfile = async (profileData) => {

    try {

      const userData = JSON.parse(getAuthItem('user'));

      let newProfilePic = null;
     

      // If there's a new profile picture, upload it first

      if (selectedPhotoFile) {

        const formData = new FormData();

        formData.append('profilePic', selectedPhotoFile);

       

        const picResponse = await updateUserProfilePic(userData._id, formData);

       

        // Update user state with new profile pic URL from backend

        newProfilePic = picResponse.profilePic;
        
        setUser(prev => ({

          ...prev,

          ...profileData,

          profilePic: newProfilePic

        }));

       

        // Update localStorage with both profile data and new picture URL

        const storedUser = JSON.parse(getAuthItem('user') || '{}');

        setAuthItem('user', JSON.stringify({

          ...storedUser,

          ...profileData,

          profilePic: newProfilePic

        }));

       

        // Clear the selected file

        setSelectedPhotoFile(null);

      }

     

      // Update other profile fields
      const updated = await updateUserProfile(userData._id, profileData);

      
      // FIX Bug 5: Merge all updates, applying newProfilePic LAST to preserve the full URL
      const finalUpdate = {
        ...user,
        ...updated,
        ...profileData,
        ...(newProfilePic && { profilePic: newProfilePic })
      };
      
      setUser(finalUpdate);

      
      // Update localStorage with final merged data
      const storedUser = JSON.parse(getAuthItem('user') || '{}');
      setAuthItem('user', JSON.stringify({
        ...storedUser,
        ...profileData,
        ...(newProfilePic && { profilePic: newProfilePic })
      }));

      // Re-fetch user data to ensure ProfileModal shows fresh data on next open
      try {
        const freshUserData = await getCurrentUser();
        setUser(prev => ({
          ...prev,
          ...freshUserData,
          profilePic: freshUserData.profilePic || newProfilePic || prev.profilePic
        }));
      } catch (fetchErr) {
        console.warn('Failed to refresh user data after save:', fetchErr);
      }

      setShowProfileModal(false);

      alert("Profile updated successfully!");

    } catch (err) {

      console.error('Error updating profile:', err);

      alert('Failed to update profile: ' + err.message);

    }

  };



const handleDownloadInvoiceLegacy = async (historyItem) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 20;

  // ── Date helpers ──
  const fmtDate = (d) => {
    if (!d) return '--';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const fmtDateTime = (d) => {
    if (!d) return '--';
    return new Date(d).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // ── Safe field extraction ──
  const vendorName     = historyItem.vendorName     || 'Partner Kitchen';
  const vendorAddress  = historyItem.vendorAddress  || '';
  const customerName   = historyItem.customerName   || user.name  || 'Customer';
  const customerPhone  = historyItem.customerPhone  || user.phone || '';
  const customerEmail  = historyItem.customerEmail  || user.email || '';
  const mealPreference = historyItem.mealPreference || 'Regular';
  const paymentMethod  = historyItem.paymentMethod  || 'Cash';
  const orderAmount    = Number(historyItem.amount) || 0;
  const orderDate      = historyItem.orderDate ? new Date(historyItem.orderDate) : new Date();
  const dayOfWeek      = orderDate.toLocaleDateString('en-US', { weekday: 'long' });

  // ── Status logic (uses pre-computed status from history mapping) ──
  const isPaid = historyItem.status === 'Paid';
  const isFree = historyItem.status === 'Free';
  const isUPI  = paymentMethod === 'UPI';

  const statusLabel    = isPaid ? 'PAID' : isFree ? 'FREE' : 'PAYMENT PENDING';
  const statusColor    = (isPaid || isFree) ? [22, 163, 74]   : [234, 88, 12];
  const statusBgColor  = (isPaid || isFree) ? [220, 252, 231] : [255, 247, 237];

  const confirmationLine =
    isPaid && historyItem.cashPaymentConfirmedAt
      ? 'Cash collected on ' + fmtDateTime(historyItem.cashPaymentConfirmedAt)
      : isPaid && isUPI
      ? 'Paid via UPI'
      : isFree
      ? 'Free Trial - No payment required'
      : 'Please pay Rs.' + orderAmount.toLocaleString('en-IN') + ' in cash when collecting your tiffin';

  // ── Fetch weekly plan for today's menu ──
  let mainCourse = '', sides = '', specialAddOns = '';
  try {
    if (historyItem.vendorId) {
      const vendorPlan = await getVendorWeeklyPlan(historyItem.vendorId);
      if (vendorPlan.weeklyPlan && vendorPlan.weeklyPlan[dayOfWeek]) {
        const dayMenu  = vendorPlan.weeklyPlan[dayOfWeek];
        mainCourse     = dayMenu.mainCourse    || '';
        sides          = dayMenu.sides         || '';
        specialAddOns  = dayMenu.specialAddOns || '';
      }
    }
  } catch (e) {
    console.warn('Could not fetch vendor weekly plan for invoice:', e);
  }
  const hasTodayMenu = !!(mainCourse || sides);
  const menuText = [mainCourse, sides, specialAddOns].filter(Boolean).join(' | ');

  // ══════════════════════════════════════════════════════
  // SECTION 1 — Header bar
  // ══════════════════════════════════════════════════════
  doc.setFillColor(242, 101, 34);
  doc.rect(0, 0, 210, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('MealSetu', pageW / 2, 15, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('TAX INVOICE', pageW / 2, 25, { align: 'center' });

  // ══════════════════════════════════════════════════════
  // SECTION 2 — Invoice meta + status badge
  // ══════════════════════════════════════════════════════
  let y = 45;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Invoice No:', margin, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(33, 37, 41);
  doc.text(historyItem.id || '--', margin + 24, y);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Date:', margin, y + 7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(33, 37, 41);
  doc.text(historyItem.date || fmtDate(historyItem.orderDate), margin + 13, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Plan:', margin, y + 14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(33, 37, 41);
  doc.text(historyItem.plan || '--', margin + 13, y + 14);

  // Status badge (right column)
  const badgeW = 58, badgeH = 18;
  const badgeX = pageW - margin - badgeW;
  const badgeY = y - 2;
  doc.setFillColor(...statusBgColor);
  doc.setDrawColor(...statusColor);
  doc.setLineWidth(0.5);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3, 3, 'FD');
  doc.setTextColor(...statusColor);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(statusLabel, badgeX + badgeW / 2, badgeY + 11, { align: 'center' });

  // ══════════════════════════════════════════════════════
  // SECTION 3 — Divider
  // ══════════════════════════════════════════════════════
  y = 68;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);

  // ══════════════════════════════════════════════════════
  // SECTION 4 — Vendor + Customer info blocks
  // ══════════════════════════════════════════════════════
  y = 74;
  const colW = 78, boxH = 38;
  const vendorX = margin;
  const custX   = margin + colW + 10;

  // Vendor box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(vendorX, y, colW, boxH, 2, 2, 'FD');

  doc.setTextColor(242, 101, 34);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('VENDOR', vendorX + 4, y + 7);

  doc.setTextColor(33, 37, 41);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(doc.splitTextToSize(vendorName, colW - 8)[0], vendorX + 4, y + 14);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  if (vendorAddress) {
    doc.splitTextToSize(vendorAddress, colW - 8).slice(0, 2)
      .forEach((line, i) => doc.text(line, vendorX + 4, y + 21 + i * 6));
  }

  // Customer box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(custX, y, colW, boxH, 2, 2, 'FD');

  doc.setTextColor(242, 101, 34);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('CUSTOMER', custX + 4, y + 7);

  doc.setTextColor(33, 37, 41);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(doc.splitTextToSize(customerName, colW - 8)[0], custX + 4, y + 14);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  if (customerPhone) doc.text('Ph: ' + customerPhone, custX + 4, y + 21);
  if (customerEmail) {
    doc.text(doc.splitTextToSize(customerEmail, colW - 8)[0], custX + 4, y + 27);
  }

  // ══════════════════════════════════════════════════════
  // SECTION 5 — Subscription details table
  // ══════════════════════════════════════════════════════
  y = y + boxH + 8;

  const tableBody = [
    ['Tiffin Subscription', (historyItem.plan || '--') + ' Plan', 'Rs.' + orderAmount.toLocaleString('en-IN')],
    ['Meal Preference',     mealPreference, '--'],
    ['Plan Period',         fmtDate(historyItem.startDate) + ' to ' + fmtDate(historyItem.endDate), '--'],
    ['Payment Method',      paymentMethod, '--'],
  ];
  if (hasTodayMenu) tableBody.push(["Today's Menu", menuText, '--']);
  tableBody.push(['Transaction ID', historyItem.id || '--', '--']);

  autoTable(doc, {
    startY: y,
    head: [['DESCRIPTION', 'DETAILS', 'AMOUNT']],
    body: tableBody,
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
      textColor: [33, 37, 41],
      lineColor: [226, 232, 240],
      lineWidth: 0.3,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [107, 114, 128],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 90 },
      2: { cellWidth: 25, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    tableLineColor: [226, 232, 240],
    tableLineWidth: 0.3,
  });

  // ══════════════════════════════════════════════════════
  // SECTION 6 — Totals (right-aligned)
  // ══════════════════════════════════════════════════════
  const tableEndY = doc.lastAutoTable.finalY;
  const totalsY   = tableEndY + 6;
  const totalsX   = pageW - margin - 68;

  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(totalsX, totalsY, 68, 30, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  doc.text('Subtotal:', totalsX + 5, totalsY + 8);
  doc.text('Rs.' + orderAmount.toLocaleString('en-IN'), totalsX + 63, totalsY + 8, { align: 'right' });

  doc.text('Tax (0%):', totalsX + 5, totalsY + 15);
  doc.text('Rs.0.00', totalsX + 63, totalsY + 15, { align: 'right' });

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.4);
  doc.line(totalsX + 5, totalsY + 18, totalsX + 63, totalsY + 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(33, 37, 41);
  doc.text('Grand Total:', totalsX + 5, totalsY + 25);
  doc.setTextColor(242, 101, 34);
  doc.text('Rs.' + orderAmount.toLocaleString('en-IN'), totalsX + 63, totalsY + 25, { align: 'right' });

  // ══════════════════════════════════════════════════════
  // SECTION 7 — Payment status banner (full-width)
  // ══════════════════════════════════════════════════════
  const bannerY = totalsY + 38;
  const bannerH = 22;

  doc.setFillColor(...statusBgColor);
  doc.setDrawColor(...statusColor);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, bannerY, pageW - 2 * margin, bannerH, 3, 3, 'FD');

  // Icon circle
  doc.setFillColor(...statusColor);
  doc.circle(margin + 11, bannerY + bannerH / 2, 5.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(isPaid || isFree ? 'OK' : '!', margin + 11, bannerY + bannerH / 2 + 3, { align: 'center' });

  // Banner title + confirmation line
  doc.setTextColor(...statusColor);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text((isPaid || isFree) ? 'PAYMENT CONFIRMED' : 'PAYMENT PENDING', margin + 22, bannerY + 9);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const confirmLines = doc.splitTextToSize(confirmationLine, pageW - 2 * margin - 26);
  doc.text(confirmLines, margin + 22, bannerY + 16);

  // ══════════════════════════════════════════════════════
  // SECTION 8 — Footer
  // ══════════════════════════════════════════════════════
  const footerY = bannerY + bannerH + 8;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(margin, footerY, pageW - margin, footerY);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(242, 101, 34);
  doc.text('Thank you for choosing MealSetu!', pageW / 2, footerY + 8, { align: 'center' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text('This is a computer-generated invoice.', pageW / 2, footerY + 14, { align: 'center' });
  doc.text('MealSetu | Quality Food, Served with Care', pageW / 2, footerY + 20, { align: 'center' });

  // ── Save with status-aware filename ──
  const fileStatus = isPaid ? 'PAID' : isFree ? 'FREE' : 'PENDING';
  doc.save(`MealSetu_Invoice_${historyItem.id}_${fileStatus}.pdf`);
};

const handleDownloadInvoice = async (historyItem) => {
  if (!historyItem.orderId) return handleDownloadInvoiceLegacy(historyItem);

  try {
    const blob = await downloadUserOrderInvoice(historyItem.orderId);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoice-${historyItem.orderId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    alert('Invoice download failed: ' + (error.message || 'Please try again.'));
  }
};




  const handleApplyLeave = async () => {

    if (!leaveStart || !leaveEnd) {

      alert("Please select both Start and End dates.");

      return;

    }



    const start = new Date(leaveStart);

    const end = new Date(leaveEnd);

    const today = new Date();

    today.setHours(0,0,0,0);



    if (start < today) {

      alert("Leave cannot start in the past.");

      return;

    }

    if (end < start) {

      alert("End date cannot be before Start date.");

      return;

    }



    const diffTime = Math.abs(end - start);

    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;



    const confirmLeave = window.confirm(

      `Confirm Leave: ${leaveStart} to ${leaveEnd} (${diffDays} days).\nYour subscription will extend by ${diffDays} day(s).`

    );



    if (confirmLeave) {

      try {

        // Call the backend API to apply leave

        const response = await applyLeave(leaveStart, leaveEnd, mealType);

       

        // Update local state with the new expiry date from backend

        const newExpiryDate = new Date(response.newExpiryDate).toISOString().split('T')[0];

       

        const newLeaveRecord = { from: leaveStart, to: leaveEnd, type: mealType, days: diffDays };

        const updatedPausedDays = [...(user.pausedDays || []), newLeaveRecord];



        setUser({ ...user, expiryDate: newExpiryDate, pausedDays: updatedPausedDays });



        localStorage.setItem('expiryDate', newExpiryDate);

        localStorage.setItem('pausedDates', JSON.stringify(updatedPausedDays));



        // Show success message as per requirement

        alert("Subscription extended successfully");

        setLeaveStart('');

        setLeaveEnd('');

      } catch (error) {

        console.error('Error applying leave:', error);

        alert('Failed to apply leave: ' + error.message);

      }

    }

  };



  const handleLogout = () => {

  removeAuthItem('token');

  removeAuthItem('user');

    navigate('/login');

  };



  const handleAutoLocation = () => {

    setUser({ ...user, address: "Detecting...", pincode: "..." });

    setTimeout(() => {

      setUser({ ...user, address: "Sector 21, Gandhinagar", pincode: "382021" });

    }, 1000);

  };



  const submitReview = (vendor, rating, comment) => {
    (async () => {
      try {
        await addReview(vendor.vendorId || vendor._id || vendor.id, rating, comment);
        alert('Review submitted');
        setShowReviewModal(false);
      } catch (e) {
        alert('Failed to submit review: ' + e.message);
      }
    })();
  };



  const handleOrder = async (vendor, orderData = {}) => {
    const vendorId = vendor.vendorId || vendor._id || vendor.id;
    if (!vendorId) throw new Error('Unable to place order: missing vendor id');

    const planTypeMap = { 'ONEDAY': 'daily', 'WEEKLY': 'weekly', 'MONTHLY': 'monthly' };
    const selectedPlanKey = orderData?.plan || 'ONEDAY';
    const selectedPlanType = planTypeMap[selectedPlanKey] || 'daily';
    const activePricing = (vendor.pricing || []).filter(p => (p.active || p.is_active) && p.price > 0);
    const matchedPlan = activePricing.find(p => p.type === selectedPlanType);
    const amount = matchedPlan ? matchedPlan.price : (orderData?.totalAmount || orderData?.price || parseInt(vendor.price || 80, 10));

    if (!amount || amount <= 0) throw new Error('Unable to place order: invalid amount');

    const mealPrefRaw = (vendor.type || '').toString();
    const mealPreference = /jain/i.test(mealPrefRaw) ? 'Jain' : 'Regular';

    await placeOrder(vendorId, [], amount, 'Lunch', mealPreference, orderData);

    try {
      const userOrders = await getUserOrders();
      setOrders(userOrders || []);
    } catch (refreshError) {
      console.error('Order succeeded, but order history refresh failed:', refreshError);
      alert('Your order was placed successfully. Refresh the page to update your order history.');
    }
  };



  const handleExtendSubscription = async (plan, paymentMethod = 'Cash') => {

    try {

      // Get the first available vendor ID (for demo purposes)

      const vendorId = tiffins[0]?.vendorId || '65f000000000000000000001';

     

      // Call the API with payment method

      const response = await extendSubscription(plan, vendorId, paymentMethod);

     

      // Update subscription state with the new data

      if (response.subscription) {

        setSubscription({

          subscription: response.subscription,

          isActive: true,

          isExpired: false,

          daysRemaining: response.subscription.days || 30

        });

      }

     

      // Refresh user data

      const userData = await getCurrentUser();

      setUser(prev => ({ ...prev, expiryDate: userData.expiryDate }));

     

      // Refresh orders

      const userOrders = await getUserOrders();

      setOrders(userOrders || []);

     

    } catch (error) {

      console.error('Error extending subscription:', error);

      alert('Failed to extend subscription: ' + error.message);

    }

  };



  // --- DATA ---

  // All tiffin/menu data now comes from backend via `tiffins` state

  // Active offers are fetched dynamically from the API and passed to the Offers component



  const menuItems = [

    { key: 'services', label: 'Order Meals' },

    { key: 'subscription', label: 'Subscription' },

    { key: 'history', label: 'History' },

    { key: 'offers', label: 'Offers' },

    { key: 'safety', label: 'Safety' }

  ];



  const userInfo = {

    profilePic: user.profilePic,

    name: user.name,

    onEditProfile: () => setShowProfileModal(true)

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
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>😕</div>
          <h2 style={{ color: '#2b3674', margin: '0 0 8px 0', fontSize: '22px' }}>Something went wrong</h2>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 24px 0', lineHeight: '1.6' }}>
            We couldn't load your dashboard right now. This is usually a temporary issue.
          </p>
          <button
            onClick={() => { setError(''); setLoading(true); fetchUserData(); }}
            style={{ background: '#f26522', color: 'white', border: 'none', padding: '12px 28px', borderRadius: '10px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginBottom: '12px', width: '100%' }}
          >
            🔄 Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', padding: '10px 28px', borderRadius: '10px', fontSize: '14px', cursor: 'pointer', width: '100%' }}
          >
            Refresh Page
          </button>
          <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '16px' }}>
            If the problem persists, contact support at mealsetuservice@gmail.com
          </p>
        </div>
      </div>
    );
  }


return (
  <div className="user-container">

    {/* Mobile Topbar - shows on mobile only */}
    <div className="user-topbar">
      <span className="user-topbar-brand">MealSetu</span>
      <button
        className="user-hamburger"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open menu"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
    </div>

    {/* Backdrop */}
    <div
      className={`user-sidebar-backdrop ${sidebarOpen ? 'show' : ''}`}
      onClick={() => setSidebarOpen(false)}
    />

    {/* Sidebar */}
    <Sidebar
      isOpen={sidebarOpen}
      onClose={() => setSidebarOpen(false)}
      menuItems={menuItems}
      activeTab={activeTab}
      onTabChange={(tab) => { setActiveTab(tab); setSidebarOpen(false); }}
      onLogout={handleLogout}
      userInfo={userInfo}
    />

    {/* Main Content */}
    <main className="user-main">
      <WelcomeCard
        user={user}
        onDetectLocation={handleAutoLocation}
        onSecuritySettings={() => setShowPasswordModal(true)}
      />

      {activeTab === 'services' && (
        <OrderProvider>
        <OrderMeals
  tiffins={tiffins}
  user={user}
  hasActivePlan={hasActivePlan}
  activeSubscription={subscription}
  onOrder={handleOrder}
  onViewReviews={handleViewReviews}
  onWriteReview={handleWriteReview}
/>
        </OrderProvider>
      )}

      {activeTab === 'subscription' && (
 <Subscription
  user={user}
  subscription={subscription}
  leaveStart={leaveStart}
  leaveEnd={leaveEnd}
  mealType={mealType}
  onLeaveStartChange={setLeaveStart}
  onLeaveEndChange={setLeaveEnd}
  onMealTypeChange={setMealType}
  onApplyLeave={handleApplyLeave}
  onExtendSubscription={handleExtendSubscription}
  // onSubscriptionActivated={fetchUserData}
  vendorId={subscription?.vendorId}
  onNavigateToOrderMeals={() => setActiveTab('services')}

          onSubscriptionActivated={(response) => {
            setHasActivePlan(true);
            if (response.subscription) {
              setSubscription({
                subscription: response.subscription,
                isActive: true,
                isExpired: false,
                daysRemaining: response.subscription.days || 30
              });
            }
            if (response.subscription && response.subscription.expiryDate) {
              const newExpiryDate = new Date(response.subscription.expiryDate).toISOString().split('T')[0];
              setUser(prev => ({ ...prev, expiryDate: newExpiryDate }));
            }
            getUserOrders().then(orders => setOrders(orders || []));
          }}
        />
      )}

      {activeTab === 'history' && (
        <History
          paymentHistory={(orders || []).map(o => ({
            id: o._id ? o._id.slice(-8).toUpperCase() : 'N/A',
            date: o.orderDate ? new Date(o.orderDate).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'),
            plan: o.planType || o.mealPreference || 'Tiffin',
            amount: Number(o.amount) || 0,
            status: Number(o.amount) === 0 ? 'Free' : (o.paymentStatus || 'Pending'),
            vendorId: o.vendorId?._id || o.vendorId || null,
            vendorName: o.vendorId?.kitchenName || 'Partner Kitchen',
            vendorAddress: o.vendorId?.address || '',
            mealPreference: o.mealPreference || 'Regular',
            deliverySlot: o.deliverySlot || 'Lunch',
            paymentMethod: o.paymentMethod || 'Cash',
            transactionId: o.transactionId || 'N/A',
            orderId: o._id || '',
            orderDate: o.orderDate || new Date().toISOString(),
            startDate: o.startDate || null,
            endDate: o.endDate || null,
            customerName: user.name || '',
            customerPhone: user.phone || '',
            customerEmail: user.email || '',
            customerAddress: user.address || '',
            cashPaymentConfirmedAt: o.cashPaymentConfirmedAt || null
          }))}
          onDownloadInvoice={handleDownloadInvoice}
        />
      )}

      {activeTab === 'offers' && (
        <>
          {newOfferAlert && (
            <div style={{
              background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
              borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontWeight: '600'
            }}>
              🎁 {newOfferAlert}
            </div>
          )}
          <Offers
            activeOffers={activeOffers}
            offersLoading={offersLoading}
            offersError={offersError}
            onRedeemOffer={handleRedeemOffer}
            claimedOfferIds={claimedOfferIds}
            user={user}
          />
        </>
      )}

      {activeTab === 'safety' && <Safety />}
    </main>

    {/* Modals */}
    {showProfileModal && (
      <ProfileModal
        user={user}
        onSave={handleSaveProfile}
        onClose={() => { setShowProfileModal(false); setSelectedPhotoFile(null); }}
        onPhotoChange={handlePhotoChange}
      />
    )}

    {showAllReviewsModal && (
      <AllReviewsModal
        vendor={selectedVendor}
        onClose={() => setShowAllReviewsModal(false)}
      />
    )}

    {showReviewModal && (
      <ReviewModal
        vendor={selectedVendor}
        onSubmit={submitReview}
        onClose={() => setShowReviewModal(false)}
      />
    )}

    {showPasswordModal && (
      <PasswordModal
        user={user}
        onClose={() => setShowPasswordModal(false)}
        onForgotPassword={() => {}}
      />
    )}

    {showReviewEligibilityPopup && (
      <div className="modal-overlay" onClick={() => setShowReviewEligibilityPopup(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '10px' }}>📋</div>
          <h3 className="modal-title" style={{ marginBottom: '15px' }}>Review Status</h3>
          <p style={{ color: '#555', marginBottom: '20px', lineHeight: '1.5' }}>
            {reviewEligibility?.message || 'Unable to submit review at this time.'}
          </p>
          {reviewEligibility?.hasOrdered && (
            <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
              <strong>Current Order Status:</strong> {reviewEligibility?.orderStatus || 'N/A'}
            </div>
          )}
          {!reviewEligibility?.hasOrdered && (
            <div style={{ background: '#fee2e2', padding: '10px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
              Please place an order first to be able to leave a review.
            </div>
          )}
          <div className="modal-actions">
            <button className="btn-primary"
              onClick={() => setShowReviewEligibilityPopup(false)}>OK</button>
          </div>
        </div>
      </div>
    )}

  </div>
);

}