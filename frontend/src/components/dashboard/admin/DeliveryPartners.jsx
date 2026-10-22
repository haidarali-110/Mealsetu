import React, { useState, useEffect, useCallback } from 'react';
import {
  getDeliveryPartners,
  createDeliveryPartner,
  toggleDeliveryPartner,
  getAllVendorsList,
} from '../../../utils/api';

// ── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ active }) => (
  <span style={{
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    background: active ? '#dcfce7' : '#fee2e2',
    color:      active ? '#16a34a' : '#dc2626',
  }}>
    {active ? 'Active' : 'Inactive'}
  </span>
);

// ── Add Partner Modal ─────────────────────────────────────────────────────────
const AddPartnerModal = ({ vendors, onClose, onCreated }) => {
  const [form, setForm]     = useState({ name: '', email: '', phone: '', password: '', vendorId: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.phone || !form.password) {
      setError('All fields are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await createDeliveryPartner(form);
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create partner.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1px solid #e2e8f0', fontSize: 14, outline: 'none',
    background: '#f8fafc', boxSizing: 'border-box',
  };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420,
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Add Delivery Partner</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b' }}>×</button>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Full Name</label>
            <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Partner name" />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="partner@email.com" />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input style={inputStyle} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="10-digit mobile" />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input style={inputStyle} type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Set login password" />
          </div>
          <div>
            <label style={labelStyle}>Assign to Vendor (optional)</label>
            <select style={inputStyle} value={form.vendorId} onChange={e => set('vendorId', e.target.value)}>
              <option value="">— Select vendor —</option>
              {vendors.map(v => (
                <option key={v._id} value={v._id}>{v.kitchenName || v.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #e2e8f0',
              background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#64748b',
            }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{
              flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
              background: loading ? '#94a3b8' : '#f26522', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            }}>
              {loading ? 'Creating…' : 'Create Partner'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const DeliveryPartners = () => {
  const [partners, setPartners]   = useState([]);
  const [vendors, setVendors]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showModal, setShowModal] = useState(false);
  const [toggling, setToggling]   = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch partners and all vendors in parallel
      const [partnersData, vendorsData] = await Promise.all([
        getDeliveryPartners(),
        getAllVendorsList().catch(() => []),
      ]);
      const list    = Array.isArray(partnersData) ? partnersData : (partnersData.partners || []);
      const vList   = Array.isArray(vendorsData)  ? vendorsData  : (vendorsData.vendors  || []);
      setPartners(list);
      // Map to { _id, kitchenName } for the dropdown
      setVendors(vList.map(v => ({ _id: v._id, kitchenName: v.kitchenName || v.name || '—' })));
    } catch (err) {
      setError(err.message || 'Failed to load delivery partners.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (partnerId) => {
    setToggling(t => ({ ...t, [partnerId]: true }));
    try {
      await toggleDeliveryPartner(partnerId);
      setPartners(ps => ps.map(p =>
        p._id === partnerId ? { ...p, isActive: !p.isActive } : p
      ));
    } catch (err) {
      alert(err.message || 'Toggle failed.');
    } finally {
      setToggling(t => ({ ...t, [partnerId]: false }));
    }
  };

  const thStyle = { padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '12px 14px', fontSize: 13, color: '#1e293b', borderBottom: '1px solid #f1f5f9' };

  return (
    <div style={{ padding: '0 0 40px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}> Delivery Partners</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Manage delivery partner accounts
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: '#f26522', color: '#fff', fontSize: 14,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Add Partner
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : partners.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🛵</div>
            <p style={{ color: '#64748b', fontSize: 14 }}>No delivery partners yet. Add one to get started.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Phone</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Vendor</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Deliveries</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {partners.map(p => (
                  <tr key={p._id} style={{ transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                    </td>
                    <td style={tdStyle}>{p.phone || '—'}</td>
                    <td style={tdStyle}>{p.email}</td>
                    <td style={tdStyle}>{p.vendorId?.kitchenName || p.vendorId?.name || '—'}</td>
                    <td style={tdStyle}><StatusBadge active={p.isActive} /></td>
                    <td style={tdStyle}>{p.totalDeliveries ?? 0}</td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => handleToggle(p._id)}
                        disabled={toggling[p._id]}
                        style={{
                          padding: '5px 14px', borderRadius: 8, border: 'none',
                          background: p.isActive ? '#fee2e2' : '#dcfce7',
                          color: p.isActive ? '#dc2626' : '#16a34a',
                          fontSize: 12, fontWeight: 600,
                          cursor: toggling[p._id] ? 'not-allowed' : 'pointer',
                          opacity: toggling[p._id] ? 0.6 : 1,
                        }}
                      >
                        {toggling[p._id] ? '…' : p.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <AddPartnerModal
          vendors={vendors}
          onClose={() => setShowModal(false)}
          onCreated={load}
        />
      )}
    </div>
  );
};

export default DeliveryPartners;
