import axios from 'axios';
import { Calendar, CheckCircle, FileText, Loader2, Mail, MapPin, Phone, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getAuthItem } from '../../../utils/authStorage';
import './VendorRequests.css';

const VendorRequests = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const token = getAuthItem('token');

  useEffect(() => {
    fetchPendingVendors();
  }, []);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const fetchPendingVendors = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get('/api/admin/vendor-requests', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setVendors(response.data.vendors || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch vendors');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (vendorId) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await axios.post('/api/admin/vendor-requests/approve', { vendorId }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVendors(vendors.filter(v => v._id !== vendorId));
      setSuccessMessage('Vendor approved successfully. Email sent to vendor.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to approve vendor');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectOpen = (vendor) => {
    setSelectedVendor(vendor);
    setRejectionReason('');
    setRejectModal(true);
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError('Please provide a rejection reason');
      return;
    }
    setActionLoading(true);
    try {
      await axios.post('/api/admin/vendor-requests/reject', { 
        vendorId: selectedVendor._id, 
        rejectionReason: rejectionReason.trim() 
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVendors(vendors.filter(v => v._id !== selectedVendor._id));
      setSuccessMessage('Vendor rejected. Email sent to vendor.');
      setRejectModal(false);
      setRejectionReason('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reject vendor');
    } finally {
      setActionLoading(false);
    }
  };

  if (successMessage && document.getElementById('success-banner')) {
    // 
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `http://localhost:5000${path}`;
  };

  const getInitials = (name) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
const formatAddress = (address) => {
    if (!address) return 'N/A';
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
      ].filter(Boolean).join(', ');
    }
    return 'N/A';
  };
  return (
    <div className="vendor-requests-container">
      {successMessage && (
        <div id="success-banner" className="success-banner">
          {successMessage}
        </div>
      )}

      <div className="vendor-requests-header">
        <div>
          <h1>Vendor Requests</h1>
          <span className={`pending-badge ${vendors.length === 0 ? 'grey' : ''}`}>
            {vendors.length} Pending Requests
          </span>
        </div>
      </div>

      {loading ? (
        <div className="skeleton-grid">
          {[1,2,3].map(i => (
            <div key={i} className="skeleton-card"></div>
          ))}
        </div>
      ) : error ? (
        <div className="error-div">
          <p>{error}</p>
          <button onClick={fetchPendingVendors} className="retry-btn">Retry</button>
        </div>
      ) : vendors.length === 0 ? (
        <div className="empty-state">
          <CheckCircle size={80} className="empty-icon" />
          <h3>No Pending Vendor Requests</h3>
          <p>All vendor applications have been reviewed.</p>
        </div>
      ) : (
        <div className="vendor-cards-grid">
          {vendors.map((vendor) => {
            const fullVendor = vendor.ownerId ? { ...vendor, ...vendor.ownerId } : vendor;
            const posterUrl = getImageUrl(vendor.kitchenPoster);
            return (
              <div key={vendor._id} className="vendor-request-card">
                <div className="card-image">
                  {posterUrl ? (
                    <img src={posterUrl} alt={vendor.kitchenName} onError={(e) => e.target.style.display='none'} />
                  ) : (
                    <div className="image-placeholder">
                      {getInitials(vendor.kitchenName)}
                    </div>
                  )}
                </div>
                <div className="card-body">
                  <div className="kitchen-name">{vendor.kitchenName}</div>
                  {vendor.resubmittedAt ? (
                    <span className="resubmitted-badge">
                      🔄 Resubmitted ({formatDate(vendor.resubmittedAt)})
                    </span>
                  ) : (
                    <span className="pending-status-badge">Pending Review</span>
                  )}
                  
                  <div className="info-row">
                    <User size={16} />
                    <span>{vendor.ownerName || fullVendor.name || 'N/A'}</span>
                  </div>
                  <div className="info-row">
                    <Mail size={16} />
                    <span>{fullVendor.email}</span>
                  </div>
                  <div className="info-row">
                    <Phone size={16} />
                    <span>{vendor.phone || fullVendor.phone || 'N/A'}</span>
                  </div>
                 <div className="info-row">
                    <MapPin size={16} />
                           <span>{formatAddress(vendor.address)}</span>
                       </div>
                  <div className="info-row">
                    <Calendar size={16} />
                    <span>Joined {formatDate(vendor.createdAt)}</span>
                  </div>
                  
                  {vendor.fssaiNumber && (
                    <div className="info-row">
                      <span>FSSAI: {vendor.fssaiNumber}</span>
                    </div>
                  )}
                  {vendor.gstNumber && (
                    <div className="info-row">
                      <span>GST: {vendor.gstNumber}</span>
                    </div>
                  )}

                  <div className="document-buttons">
                    {vendor.fssaiDocument || vendor.fssaiLicense ? (
                      <button 
                        className="document-btn"
                        onClick={() => window.open(getImageUrl(vendor.fssaiDocument || vendor.fssaiLicense), '_blank')}
                      >
                        <FileText size={14} />
                        View FSSAI
                      </button>
                    ) : null}
                    {vendor.gstDocument ? (
                      <button 
                        className="document-btn"
                        onClick={() => window.open(getImageUrl(vendor.gstDocument), '_blank')}
                      >
                        <FileText size={14} />
                        View GST
                      </button>
                    ) : null}
                  </div>

                  <div className="card-actions">
                    <button 
                      className="approve-btn"
                      onClick={() => handleApprove(vendor._id)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <Loader2 className="spinner" size={20} /> : 'Approve Vendor'}
                    </button>
                    <button 
                      className="reject-btn"
                      onClick={() => handleRejectOpen(vendor)}
                      disabled={actionLoading}
                    >
                      Reject Vendor
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rejectModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2>Reject Vendor Application</h2>
            <div className="vendor-name">{selectedVendor?.kitchenName}</div>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Please provide a clear reason for rejection so the vendor can improve their application..."
              className="rejection-textarea"
            />
            {error && rejectionReason.trim() === '' && <div className="inline-error">Rejection reason is required</div>}
            <div className="modal-buttons">
              <button onClick={() => setRejectModal(false)} className="cancel-btn">Cancel</button>
              <button onClick={handleReject} disabled={actionLoading || !rejectionReason.trim()} className="confirm-reject-btn">
                {actionLoading ? <Loader2 className="spinner" size={20} /> : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorRequests;

