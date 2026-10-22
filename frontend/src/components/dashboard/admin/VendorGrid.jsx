import { useEffect, useState } from 'react';
import { getAuthItem } from '../../../utils/authStorage';

const apiFetch = async (url, opts = {}) => {
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: 'Bearer ' + getAuthItem('token'), 'Content-Type': 'application/json', ...opts.headers },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || `Request failed (${r.status})`);
  return data;
};
const formatAddress = (address) => {
  if (!address) return '';
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
  return '';
};
// ── Full detailed card (Users tab only) ────────────────────────────────────
const FullVendorCard = ({ vendor, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: 'white',
      borderRadius: '16px',
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.12)';
      e.currentTarget.style.transform = 'translateY(-3px)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
      e.currentTarget.style.transform = 'translateY(0)';
    }}
  >
    {/* Banner */}
    <div style={{
      height: '100px',
      background: vendor.bannerImage
        ? `url(${vendor.bannerImage}) center/cover`
        : 'linear-gradient(135deg, #f26522 0%, #ff8c42 60%, #ffb347 100%)',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: '10px', right: '10px',
        background: vendor.isApproved ? 'rgba(22,163,74,0.92)' : 'rgba(148,163,184,0.92)',
        color: 'white', padding: '4px 12px', borderRadius: '20px',
        fontSize: '11px', fontWeight: '700', backdropFilter: 'blur(4px)',
      }}>
        {vendor.isApproved ? ' Active' : '⏸ Inactive'}
      </div>

      {vendor.fssaiNumber && (
        <div style={{
          position: 'absolute', top: '10px', left: '10px',
          background: 'rgba(255,255,255,0.9)', color: '#16a34a',
          padding: '3px 8px', borderRadius: '6px',
          fontSize: '10px', fontWeight: '700',
        }}>
          ✓ FSSAI
        </div>
      )}

      <div style={{
        position: 'absolute', bottom: '-22px', left: '16px',
        width: '44px', height: '44px', borderRadius: '12px',
        background: 'white', border: '3px solid white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '20px', fontWeight: '800', color: '#f26522',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}>
        {vendor.kitchenName?.[0]?.toUpperCase()}
      </div>
    </div>

    {/* Card body */}
    <div style={{ padding: '30px 16px 16px' }}>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontWeight: '700', fontSize: '15px', color: '#1a1a2e', marginBottom: '2px' }}>
          {vendor.kitchenName}
        </div>
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '2px' }}>
           {vendor.ownerName || '—'}
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {vendor.email && <span> {vendor.email}</span>}
          {vendor.phone && vendor.phone !== 'N/A' && <span> {vendor.phone}</span>}
        </div>
       {vendor.address && (
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
             {formatAddress(vendor.address)}
          </div>
        )}
      </div>

      {/* 2×2 stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <div style={{ background: '#eff6ff', borderRadius: '10px', padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontWeight: '800', fontSize: '20px', color: '#3b82f6' }}>{vendor.subscriberCount || 0}</div>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Subscribers</div>
        </div>
        <div style={{ background: '#fff7ed', borderRadius: '10px', padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontWeight: '800', fontSize: '20px', color: '#f26522' }}>{vendor.totalOrders || 0}</div>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Total Orders</div>
        </div>
        <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontWeight: '800', fontSize: '18px', color: '#16a34a' }}>
            ₹{(vendor.totalRevenue || 0) >= 1000
              ? `${((vendor.totalRevenue || 0) / 1000).toFixed(1)}k`
              : (vendor.totalRevenue || 0)}
          </div>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Revenue</div>
        </div>
        <div style={{ background: '#fdf4ff', borderRadius: '10px', padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontWeight: '800', fontSize: '20px', color: '#a855f7' }}>{vendor.activeSubscribers || 0}</div>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Active Now</div>
        </div>
      </div>

      {/* Rating / riders / join date */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: '10px', borderTop: '1px solid #f1f5f9', marginBottom: '12px',
        flexWrap: 'wrap', gap: '6px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span></span>
          <span style={{ fontWeight: '700', fontSize: '13px', color: '#1a1a2e' }}>
            {vendor.rating ? vendor.rating.toFixed(1) : '0.0'}
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>({vendor.reviewCount || 0} reviews)</span>
        </div>
        {vendor.riderCount > 0 && (
          <div style={{ fontSize: '11px', color: '#8b5cf6', fontWeight: '600', background: '#fdf4ff', padding: '3px 8px', borderRadius: '6px' }}>
             {vendor.riderCount} riders
          </div>
        )}
        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
           {vendor.joinDate
            ? new Date(vendor.joinDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
            : '—'}
        </div>
      </div>

      {/* Compliance */}
      {(vendor.fssaiNumber || vendor.hasGst) && (
        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {vendor.fssaiNumber && (
            <div style={{ fontSize: '11px', color: '#374151' }}>
              <span style={{ color: '#94a3b8' }}>FSSAI: </span>{vendor.fssaiNumber}
            </div>
          )}
          {vendor.hasGst && (
            <div style={{ fontSize: '11px', color: '#374151' }}>
              <span style={{ color: '#94a3b8' }}>GST: </span>
              <span style={{ color: '#16a34a', fontWeight: '600' }}>✓ Uploaded</span>
            </div>
          )}
        </div>
      )}

      {/* View button */}
      <div style={{
        padding: '10px', borderRadius: '10px', textAlign: 'center',
        color: '#f26522', fontSize: '13px', fontWeight: '700',
        background: 'linear-gradient(135deg, #fff7ed, #fff)',
        border: '1px solid #fed7aa',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
      }}>
        View Details <span style={{ fontSize: '16px' }}>→</span>
      </div>
    </div>
  </div>
);

// ── Focused stat card (Orders / Reviews / Delivery tabs) ───────────────────
const SimpleVendorCard = ({ vendor, statType, onClick }) => {
  const getStat = () => {
    switch (statType) {
      case 'orders':
        return {
          value: vendor.totalOrders || 0,
          label: 'Total Orders',
          subValue: vendor.activeSubscribers || 0,
          subLabel: 'active now',
          color: '#f26522',
          bg: '#fff7ed',
        };
      case 'reviews':
        return {
          value: vendor.rating ? vendor.rating.toFixed(1) + ' ⭐' : '0.0 ⭐',
          label: 'Avg Rating',
          subValue: vendor.reviewCount || 0,
          subLabel: 'reviews',
          color: '#f59e0b',
          bg: '#fffbeb',
        };
      case 'riders':
        return {
          value: vendor.riderCount || 0,
          label: 'Delivery Riders',
          subValue: vendor.subscriberCount || 0,
          subLabel: 'subscribers',
          color: '#8b5cf6',
          bg: '#fdf4ff',
        };
      default:
        return { value: 0, label: '', subValue: 0, subLabel: '', color: '#94a3b8', bg: '#f8fafc' };
    }
  };

  const stat = getStat();

  const actionLabel = {
    orders:  'View Orders',
    reviews: 'Moderate Reviews',
    riders:  'Manage Riders',
  }[statType] || 'View';

  const location = [vendor.area, vendor.city].filter(Boolean).join(', ');

  return (
    <div
      onClick={onClick}
      style={{
        background: 'white',
        borderRadius: '14px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Horizontal body */}
      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>

        {/* Kitchen avatar */}
        <div style={{
          width: '52px', height: '52px', borderRadius: '12px',
          background: 'linear-gradient(135deg, #f26522, #ff8c42)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '22px', fontWeight: '800', color: 'white', flexShrink: 0,
        }}>
          {vendor.kitchenName?.[0]?.toUpperCase()}
        </div>

        {/* Kitchen info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: '700', fontSize: '15px', color: '#1a1a2e',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '3px',
          }}>
            {vendor.kitchenName}
          </div>
          <div style={{
            fontSize: '12px', color: '#64748b',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '4px',
          }}>
            👤 {vendor.ownerName || '—'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{
              background: vendor.isApproved ? '#dcfce7' : '#fee2e2',
              color: vendor.isApproved ? '#16a34a' : '#dc2626',
              padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
            }}>
              {vendor.isApproved ? '✅ Active' : '⏸ Inactive'}
            </span>
            {location && (
              <span style={{ fontSize: '10px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {location}
              </span>
            )}
          </div>
        </div>

        {/* The one relevant stat */}
        <div style={{
          background: stat.bg, borderRadius: '12px', padding: '12px 16px',
          textAlign: 'center', flexShrink: 0, minWidth: '84px',
        }}>
          <div style={{ fontSize: '22px', fontWeight: '800', color: stat.color, lineHeight: 1, marginBottom: '4px' }}>
            {stat.value}
          </div>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '2px' }}>
            {stat.label}
          </div>
          {stat.subValue !== undefined && (
            <div style={{ fontSize: '10px', color: '#94a3b8' }}>
              {stat.subValue} {stat.subLabel}
            </div>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div style={{
        padding: '9px 16px', borderTop: '1px solid #f8fafc', background: '#fafafa',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
          {statType === 'orders' && (
            <span>₹{(vendor.totalRevenue || 0) >= 1000
              ? `${((vendor.totalRevenue || 0) / 1000).toFixed(1)}k`
              : (vendor.totalRevenue || 0)} revenue</span>
          )}
          {statType === 'reviews' && (
            <span>{vendor.subscriberCount || 0} subscribers</span>
          )}
          {statType === 'riders' && (
            <span>{vendor.totalOrders || 0} total orders</span>
          )}
        </div>
        <span style={{ color: '#f26522', fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {actionLabel} →
        </span>
      </div>
    </div>
  );
};

// ── Titles & subtitles ─────────────────────────────────────────────────────
const TITLES = {
  users:   ' User Management',
  orders:  ' Order Management',
  reviews: ' Review Moderation',
  riders:  ' Delivery Management',
};

const SUBTITLES = {
  users:   'Click a vendor to view their subscribers',
  orders:  'Click a vendor to manage their orders',
  reviews: 'Click a vendor to moderate their reviews',
  riders:  'Click a vendor to manage their delivery team',
};

// ── Main VendorGrid ────────────────────────────────────────────────────────
const VendorGrid = ({ onSelectVendor, statType = 'users' }) => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    apiFetch('/api/admin/vendors-stats')
      .then(d => setVendors(Array.isArray(d) ? d : d.vendors || []))
      .catch(err => setError(err.message || 'Failed to load vendors'))
      .finally(() => setLoading(false));
  }, []);

 const filtered = vendors.filter(v => {
    const searchLower = search.toLowerCase();
    return !search ||
      (v.kitchenName || '').toLowerCase().includes(searchLower) ||
      (v.ownerName   || '').toLowerCase().includes(searchLower) ||
      formatAddress(v.address).toLowerCase().includes(searchLower);
  });

  const gridStyle = statType === 'users'
    ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }
    : { display: 'flex', flexDirection: 'column', gap: '10px' };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>{TITLES[statType] || ' Vendors'}</h2>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>
          {SUBTITLES[statType] || 'Select a vendor to continue'}
        </p>
      </div>

      {/* Search */}
      <input
        placeholder="Search by kitchen name, owner or address…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '11px 16px',
          border: '1px solid #e2e8f0', borderRadius: '10px',
          fontSize: '14px', marginBottom: '20px',
          boxSizing: 'border-box', outline: 'none',
        }}
      />

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
          Loading vendors…
        </div>
      ) : error ? (
        <div style={{ padding: '80px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}></div>
          <div style={{ fontWeight: '700', color: '#1a1a2e', marginBottom: '8px' }}>Could not load vendors</div>
          <div style={{ color: '#64748b', fontSize: '13px' }}>{error}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '80px', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}></div>
          <div style={{ fontWeight: '600' }}>No vendors found</div>
        </div>
      ) : (
        <div style={gridStyle}>
          {filtered.map(vendor =>
            statType === 'users'
              ? <FullVendorCard key={vendor._id} vendor={vendor} onClick={() => onSelectVendor(vendor)} />
              : <SimpleVendorCard key={vendor._id} vendor={vendor} statType={statType} onClick={() => onSelectVendor(vendor)} />
          )}
        </div>
      )}
    </div>
  );
};

export default VendorGrid;
