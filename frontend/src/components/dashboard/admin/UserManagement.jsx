import React, { useState, useEffect, useMemo } from 'react';
import { Search, Users, ArrowLeft } from 'lucide-react';
import { apiCall } from '../../../utils/api';
import './UserManagement.css';

const UserManagement = () => {
  const [vendors, setVendors] = useState([]);
  const [subscribers, setSubscribers] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [currentView, setCurrentView] = useState('vendors');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [vendorSearchTerm, setVendorSearchTerm] = useState('');
  const [stats, setStats] = useState({ totalVendors: 0, totalUsers: 0, inactiveUsers: 0 });

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiCall('/admin/vendors-stats');
      const vendorList = data.vendors || [];
      setVendors(vendorList);
      console.log('Vendor address type:', typeof vendorList[0]?.address, vendorList[0]?.address);
      const totalVendors = vendorList.length;
      const totalUsers = vendorList.reduce((sum, v) => sum + (v.subscriberCount || 0), 0);
      setStats({ totalVendors, totalUsers, inactiveUsers: 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscribers = async (vendorId) => {
    console.log('fetchSubscribers called with vendorId:', vendorId);
    if (!vendorId || vendorId === 'undefined' || vendorId.trim() === '') {
      setError('Please select a valid vendor');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await apiCall(`/admin/vendor-subscribers/${vendorId}`);
      const userList = data.users || [];
      setSubscribers(userList);
      const vendor = vendors.find(v => v._id === vendorId);
      setSelectedVendor(vendor);
      setCurrentView('subscribers');
      const totalUsers = userList.length;
      const inactiveUsers = userList.filter(u => !u.isActive).length;
      setStats(prev => ({ ...prev, totalUsers, inactiveUsers }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const goBackToVendors = () => {
    setCurrentView('vendors');
    setSubscribers([]);
    setSelectedVendor(null);
   setSearchTerm('');
   setVendorSearchTerm('');
      fetchVendors();
     };

  const filteredSubscribers = useMemo(() => {
    return subscribers.filter(sub =>
      sub.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );
 }, [subscribers, searchTerm]);
  const filteredVendors = useMemo(() => {
     return vendors.filter(vendor =>
         vendor.kitchenName?.toLowerCase().includes(vendorSearchTerm.toLowerCase()) ||     vendor.ownerName?.toLowerCase().includes(vendorSearchTerm.toLowerCase()) ||    vendor.email?.toLowerCase().includes(vendorSearchTerm.toLowerCase())
           );
           }, [vendors, vendorSearchTerm]);
            const formatDate = (date) => {
    if (!date) return '—';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(d);
  };
 const formatAddress = (address) => {
    if (!address) return '—';
    if (typeof address === 'string') return address;

    if (typeof address === 'object') {
      if (address.fullAddress && typeof address.fullAddress === 'string') {
        return address.fullAddress;
      }
      return [
        address.flatHouseNo,
        address.shopNo,
        address.street,
        address.area,
        address.landmark,
        address.city,
        address.pincode
      ].filter(Boolean).join(', ') || '—';
    }

    return '—';
  };

  const getStatusBadge = (user) => {
    if (user.isActive) {
      if (user.daysSinceActive !== null && user.daysSinceActive > 30) return 'Warning';
      return 'Active';
    }
    return 'Inactive';
  };

  const getStatusClass = (user) => {
    if (user.isActive) {
      if (user.daysSinceActive !== null && user.daysSinceActive > 30) return 'um-badge-warning';
      return 'um-badge-active';
    }
    return 'um-badge-inactive';
  };

  const getVendorImage = (vendor) => {
    if (!vendor) return '';
    const path = vendor.profileImage || vendor.kitchenPoster || vendor.profilePic || '';
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${window.location.origin}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const getApprovalBadgeClass = (vendor) => {
    if (vendor.isApproved) return 'um-badge-approved';
    if (vendor.status === 'rejected') return 'um-badge-rejected';
    return 'um-badge-pending';
  };

  const getApprovalText = (vendor) => {
    if (vendor.isApproved) return 'Approved';
    if (vendor.status === 'rejected') return 'Rejected';
    return 'Pending';
  };

  if (loading) {
    return (
      <div className="um-container">
        <div className="um-stats-grid">
{[1, 2, 3].map(i => (
            <div key={`skeleton-${i}`} className="um-stat-card um-stat-skeleton"></div>
          ))}
        </div>
        <div className="um-loading-text">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="um-error">
        <p>{error}</p>
        <button onClick={() => {
          setError(null);
          if (currentView === 'vendors') {
            fetchVendors();
          } else {
            fetchSubscribers(selectedVendor?._id);
          }
        }}>
          Retry
        </button>
      </div>
    );
  }

  if (currentView === 'vendors') {
    return (
      <div className="user-management um-container">
        <div className="um-header">
          <h1>User Management</h1>
          <span className="um-vendor-count-badge">{stats.totalVendors} Vendors</span>
        </div>

        <div className="um-stats-grid">
          <div className="um-stat-card um-stat-card-blue">
            <div className="um-stat-number">{stats.totalVendors}</div>
            <p>Total Vendors</p>
          </div>
          <div className="um-stat-card um-stat-card-green">
            <div className="um-stat-number">{stats.totalUsers}</div>
            <p>Total Subscribers</p>
          </div>
          <div className="um-stat-card um-stat-card-red">
            <div className="um-stat-number">{stats.inactiveUsers}</div>
            <p>Inactive Users</p>
          </div>
      </div>       
            <div className="um-search-input-wrapper">
               <Search size={18} />        
                 <input type="text" placeholder="Search by kitchen name, owner or email..."   value={vendorSearchTerm}  onChange={(e) => setVendorSearchTerm(e.target.value)}/>
                 </div>       
          <div className="um-table-wrapper">
          <table className="um-table">
            <thead>
              <tr>
                <th></th>
                <th>Kitchen Name</th>
                <th>Owner</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Subscribers</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    No vendors found
                  </td>
                </tr>
              ) : (
filteredVendors.map((vendor) => (
                  <tr key={vendor._id}>
                    <td>
                      <div className="um-vendor-avatar">
                        {getVendorImage(vendor) ? (
                          <img
                            src={getVendorImage(vendor)}
                            alt={vendor.kitchenName}
                            className="um-vendor-image"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div
                          className="um-vendor-fallback"
                          style={{ display: getVendorImage(vendor) ? 'none' : 'flex' }}
                        >
                          {vendor.kitchenName?.charAt(0)?.toUpperCase()}
                        </div>
                      </div>
                    </td>
                    <td><strong>{vendor.kitchenName || 'N/A'}</strong></td>
                    <td>{vendor.ownerName || 'N/A'}</td>
                    <td>{vendor.email || 'N/A'}</td>
                    <td>{vendor.phone || 'N/A'}</td>
                    <td>
                      <span className={getApprovalBadgeClass(vendor)}>
                        {getApprovalText(vendor)}
                      </span>
                    </td>
                    <td><strong>{vendor.subscriberCount || 0}</strong></td>
                    <td>{formatDate(vendor.joinDate || vendor.createdAt)}</td>
                    <td>
                      <button
                        className="um-view-btn"
                        onClick={() => fetchSubscribers(vendor._id)}
                      >
                        View Subscribers
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="user-management um-container">
      <button className="um-back-btn" onClick={goBackToVendors}>
        <ArrowLeft size={18} />
        Back to Vendors
      </button>

      <div className="um-vendor-info-card">
        <div className="um-vendor-avatar-large">
          {getVendorImage(selectedVendor) ? (
            <img
              src={getVendorImage(selectedVendor)}
              alt={selectedVendor?.kitchenName}
              className="um-vendor-image-large"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
          ) : null}
          <div
            className="um-vendor-fallback-large"
            style={{ display: getVendorImage(selectedVendor) ? 'none' : 'flex' }}
          >
            {selectedVendor?.kitchenName?.charAt(0)?.toUpperCase()}
          </div>
        </div>
        <div>
          <h2>{selectedVendor?.kitchenName}</h2>
          <p>{selectedVendor?.email}</p>
          <p>{selectedVendor?.phone}</p>
          <p>{formatAddress(selectedVendor?.address)}</p>
        </div>
      </div>

      <div className="um-stats-grid">
        <div className="um-stat-card um-stat-card-blue">
          <div className="um-stat-number">{stats.totalUsers}</div>
          <p>Total Subscribers</p>
        </div>
        <div className="um-stat-card um-stat-card-green">
          <div className="um-stat-number">{stats.totalUsers - stats.inactiveUsers}</div>
          <p>Active Subscribers</p>
        </div>
        <div className="um-stat-card um-stat-card-red">
          <div className="um-stat-number">{stats.inactiveUsers}</div>
          <p>Inactive Subscribers</p>
        </div>
      </div>

      <div className="um-search-input-wrapper">
        <Search size={18} />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {filteredSubscribers.length === 0 ? (
        <div className="um-empty-state">
          <Users size={64} className="um-empty-icon" />
          <h3>No subscribers found</h3>
          <p>This vendor has no subscribers yet or none match your search.</p>
        </div>
      ) : (
        <div className="um-table-wrapper">
          <table className="um-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Join Date</th>
                <th>Last Active</th>
                <th>Days Since Active</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubscribers.map((user, index) => (
                <tr
                  key={user._id || user.email || `user-${index}`}
                  className={user.daysSinceActive > 40 && user.daysSinceActive <= 50 ? 'um-warning-row' : ''}
                >
                  <td>{user.name || 'N/A'}</td>
                  <td>{user.email || 'N/A'}</td>
                  <td>{user.phone || 'N/A'}</td>
                  <td>{formatDate(user.joinDate)}</td>
                  <td>{formatDate(user.lastActiveDate)}</td>
                  <td>{user.daysSinceActive !== null && user.daysSinceActive !== undefined ? `${user.daysSinceActive} days` : '—'}</td>
                  <td>
                    <span className={getStatusClass(user)}>
                      {getStatusBadge(user)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default UserManagement;