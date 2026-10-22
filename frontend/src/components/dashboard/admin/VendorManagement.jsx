import { useEffect, useState } from 'react';
import { getAuthItem } from '../../../utils/authStorage';
import './VendorManagement.css';

const VendorManagement = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rejectModal, setRejectModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState({});
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
      const response = await fetch('/api/admin/vendor-requests', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch vendors. Status: ' + response.status);
      }
      const data = await response.json();
      setVendors(data.vendors || []);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message || 'Failed to fetch vendor requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (vendorId) => {
    if (actionLoading[vendorId]) return;
    setActionLoading(prev => ({ ...prev, [vendorId]: true }));
    try {
      const response = await fetch('/api/admin/vendor-requests/approve', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ vendorId })
      });
      if (!response.ok) throw new Error('Failed to approve');
      setVendors(prev => prev.filter(v => v._id !== vendorId));
      setSuccessMessage('Vendor approved successfully. Email sent to vendor.');
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [vendorId]: false }));
    }
  };

  const handleRejectOpen = (vendor) => {
    setSelectedVendor(vendor);
    setRejectionReason('');
    setRejectModal(true);
  };

  const handleReject = async () => {
    if (!rejectionReason.trim() || !selectedVendor) return;
    const vid = selectedVendor._id;
    setActionLoading(prev => ({ ...prev, [vid]: true }));
    try {
      const response = await fetch('/api/admin/vendor-requests/reject', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vendorId: vid,
          rejectionReason: rejectionReason.trim()
        })
      });
      if (!response.ok) throw new Error('Failed to reject');
      setVendors(prev => prev.filter(v => v._id !== vid));
      setSuccessMessage('Vendor rejected. Email sent to vendor.');
      setRejectModal(false);
      setRejectionReason('');
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [vid]: false }));
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${window.location.origin}${path.startsWith('/') ? '' : '/'}${path}`;
  };
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
    ].filter(Boolean).join(', ') || 'N/A';
  }
  return 'N/A';
};

  return (
    <div className="vendor-management-page">
      {successMessage && (
        <div className="vm-success-banner">{successMessage}</div>
      )}

      <div className="vm-header">
        <h1>Vendor Requests</h1>
        <span className="vm-count-badge">{vendors.length} Pending</span>
      </div>

      {loading && (
        <div className="vm-loading">
          <p>Loading vendor requests...</p>
        </div>
      )}

      {error && (
        <div className="vm-error">
          <p>{error}</p>
          <button onClick={fetchPendingVendors}>Retry</button>
        </div>
      )}

      {!loading && !error && vendors.length === 0 && (
        <div className="vm-empty">
          <h3>No Pending Vendor Requests</h3>
          <p>All vendor applications have been reviewed.</p>
        </div>
      )}

      {!loading && vendors.length > 0 && (
        <div className="vm-cards-grid">
          {vendors.map((vendor) => (
            <div key={vendor._id} className="vm-card">
              <div className="vm-card-image">
                {vendor.kitchenPoster ? (
                  <img
                    src={getImageUrl(vendor.kitchenPoster)}
                    alt={vendor.kitchenName}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="vm-card-image-placeholder">
                    {vendor.kitchenName ? vendor.kitchenName.charAt(0).toUpperCase() : 'V'}
                  </div>
                )}
              </div>
              <div className="vm-card-body">
                <div className="vm-kitchen-name">{vendor.kitchenName || 'N/A'}</div>
                {vendor.resubmittedAt ? (
                  <span className="resubmit-badge">
                    Resubmitted Documents
                  </span>
                ) : (
                  <span className="vm-pending-badge">
                    Pending Review
                  </span>
                )}
                <div className="vm-info-row">
                  <span className="vm-info-label">Owner:</span>
                  <span>{vendor.ownerId?.name || vendor.ownerName || 'N/A'}</span>
                </div>
                <div className="vm-info-row">
                  <span className="vm-info-label">Email:</span>
                  <span>{vendor.ownerId?.email || vendor.email || 'N/A'}</span>
                </div>
                <div className="vm-info-row">
                  <span className="vm-info-label">Phone:</span>
                  <span>{vendor.phone || vendor.ownerId?.phone || 'N/A'}</span>
                </div>
                <div className="vm-info-row">
                  <span className="vm-info-label">Address:</span>
               <span>{formatAddress(vendor.address)}</span>
                </div>
                <div className="vm-info-row">
                  <span className="vm-info-label">Pincode:</span>
                  <span>{vendor.pincode || 'N/A'}</span>
                </div>
                <div className="vm-info-row">
                  <span className="vm-info-label">Joined:</span>
                  <span>{formatDate(vendor.createdAt)}</span>
                </div>
                {vendor.resubmittedAt && (
                  <div className="vm-info-row" style={{color: '#3b82f6', fontWeight: '600'}}>
                    <span className="vm-info-label">Resubmitted:</span>
                    <span>{new Date(vendor.resubmittedAt).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'})}</span>
                  </div>
                )}
                {vendor.fssaiNumber && (
                  <div className="vm-info-row">
                    <span className="vm-info-label">FSSAI:</span>
                    <span>{vendor.fssaiNumber}</span>
                  </div>
                )}
                {vendor.gstNumber && (
                  <div className="vm-info-row">
                    <span className="vm-info-label">GST:</span>
                    <span>{vendor.gstNumber}</span>
                  </div>
                )}
                <div className="vm-doc-buttons">
                  {(vendor.fssaiDocument || vendor.fssaiLicense) && (
                    <button
                      className="vm-doc-btn"
                      onClick={() => window.open(getImageUrl(vendor.fssaiDocument || vendor.fssaiLicense), '_blank')}
                    >
                      View FSSAI
                    </button>
                  )}
                  {vendor.gstDocument && (
                    <button
                      className="vm-doc-btn"
                      onClick={() => window.open(getImageUrl(vendor.gstDocument), '_blank')}
                    >
                      View GST
                    </button>
                  )}
                </div>
                <div className="vm-card-actions">
                  <button
                    className="vm-approve-btn"
                    onClick={() => handleApprove(vendor._id)}
                    disabled={!!actionLoading[vendor._id]}
                  >
                    {actionLoading[vendor._id] ? 'Processing...' : 'Approve Vendor'}
                  </button>
                  <button
                    className="vm-reject-btn"
                    onClick={() => handleRejectOpen(vendor)}
                    disabled={!!actionLoading[vendor._id]}
                  >
                    Reject Vendor
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejectModal && (
        <div className="vm-modal-overlay">
          <div className="vm-modal-card">
            <h2>Reject Vendor Application</h2>
            <p className="vm-modal-vendor-name">{selectedVendor?.kitchenName}</p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Please provide a clear reason for rejection..."
              className="vm-rejection-textarea"
            />
            <div className="vm-modal-buttons">
              <button
                onClick={() => setRejectModal(false)}
                className="vm-cancel-btn"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectionReason.trim() || (selectedVendor && !!actionLoading[selectedVendor._id])}
                className="vm-confirm-reject-btn"
              >
                {selectedVendor && actionLoading[selectedVendor._id] ? 'Processing...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorManagement;