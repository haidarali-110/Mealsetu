import { useEffect, useState } from 'react';
import { getAuthItem } from '../../../utils/authStorage';
import VendorGrid from './VendorGrid';

const ORANGE = '#f26522';

const apiFetch = async (url, opts = {}) => {
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: 'Bearer ' + getAuthItem('token'), 'Content-Type': 'application/json', ...opts.headers },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || `Request failed (${r.status})`);
  return data;
};

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
const fmtTime = d => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

const CLOSE_REASONS = [
  'App crash — rider app stopped working',
  'Rider unresponsive — not reachable',
  'Test batch — created for testing',
  'All orders completed manually',
  'Other',
];

// ── Add Rider Modal ────────────────────────────────────────────────────────────
const AddRiderModal = ({ vendorId, onClose, onCreated }) => {
  const [form, setForm]       = useState({ name: '', email: '', phone: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

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
      await apiFetch('/api/admin/delivery-partners', {
        method: 'POST',
        body: JSON.stringify({ ...form, vendorId }),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create rider.');
    } finally {
      setLoading(false);
    }
  };

  const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, background: '#f8fafc', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Add Delivery Rider</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>×</button>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[['name', 'Full Name', 'text', 'Rider name'], ['email', 'Email', 'email', 'rider@email.com'], ['phone', 'Phone', 'tel', '10-digit mobile'], ['password', 'Password', 'password', 'Set login password']].map(([k, label, type, ph]) => (
            <div key={k}>
              <label style={lbl}>{label}</label>
              <input style={inp} type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={ph} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#64748b' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: loading ? '#94a3b8' : ORANGE, color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Creating…' : 'Add Rider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Force Close Modal ──────────────────────────────────────────────────────────
const ForceCloseModal = ({ batch, onClose, onClosed }) => {
  const [reason, setReason]   = useState('');
  const [note, setNote]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) { setError('Please select a reason.'); return; }
    setLoading(true);
    setError('');
    try {
      await apiFetch(`/api/admin/batches/${batch._id}/force-close`, {
        method: 'PATCH',
        body: JSON.stringify({ reason, note }),
      });
      onClosed();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to close batch.');
    } finally {
      setLoading(false);
    }
  };

  const slotEmoji = batch.mealSlot === 'lunch' ? '' : '';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>Force Close Batch</h3>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>This will mark all pending orders as failed.</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b', lineHeight: 1 }}>×</button>
        </div>

        {/* Batch summary card */}
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: 28 }}>{slotEmoji}</span>
            <div>
              <div style={{ fontWeight: '700', fontSize: '14px', color: '#1a1a2e' }}>
                {batch.mealSlot.charAt(0).toUpperCase() + batch.mealSlot.slice(1)} — {fmtDate(batch.batchDate)}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                 {batch.riderName}  ·  Started {fmtTime(batch.startedAt)}  ·  Stuck for <strong style={{ color: '#dc2626' }}>{batch.stuckFor}</strong>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                {batch.deliveredOrders}/{batch.totalOrders} delivered · <span style={{ color: '#f59e0b' }}>{batch.pendingOrders} pending</span>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Reason select */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
              Reason for closing <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, background: '#f8fafc', boxSizing: 'border-box', color: reason ? '#1a1a2e' : '#94a3b8' }}
            >
              <option value="">Select a reason…</option>
              {CLOSE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Optional note */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
              Additional note <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Rider called and confirmed app crashed at 2pm…"
              rows={3}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#f8fafc', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Warning notice */}
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 14 }}></span>
            <span><strong>{batch.pendingOrders} pending order{batch.pendingOrders !== 1 ? 's' : ''}</strong> will be marked as failed. This cannot be undone.</span>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#64748b' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading || !reason} style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: loading || !reason ? '#94a3b8' : '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, cursor: loading || !reason ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Closing…' : ' Force Close Batch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Vendor Riders Panel ────────────────────────────────────────────────────────
const VendorRidersPanel = ({ vendor, onBack }) => {
  const [riders,           setRiders]           = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [toggling,         setToggling]         = useState({});
  const [showAddModal,     setShowAddModal]     = useState(false);
  const [stuckBatches,     setStuckBatches]     = useState([]);
  const [loadingBatches,   setLoadingBatches]   = useState(true);
  const [forceCloseTarget, setForceCloseTarget] = useState(null);
  const [toast,            setToast]            = useState(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    loadRiders();
    loadStuckBatches();
  }, []);

  const loadRiders = () => {
    setLoading(true);
    apiFetch(`/api/admin/vendors/${vendor._id}/riders`)
      .then(d => setRiders(d.riders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const loadStuckBatches = () => {
    setLoadingBatches(true);
    apiFetch(`/api/admin/vendors/${vendor._id}/stuck-batches`)
      .then(d => setStuckBatches(d.batches || []))
      .catch(() => {})
      .finally(() => setLoadingBatches(false));
  };

  const handleToggle = async (riderId) => {
    setToggling(t => ({ ...t, [riderId]: true }));
    try {
      const res = await apiFetch(`/api/admin/vendors/${vendor._id}/riders/${riderId}/toggle`, { method: 'PATCH' });
      setRiders(rs => rs.map(r => r._id === riderId ? { ...r, isActive: res.isActive } : r));
      showToast(`Rider ${res.isActive ? 'activated' : 'deactivated'} successfully`);
    } catch (err) {
      showToast(err.message || 'Failed to update rider status', false);
    } finally {
      setToggling(t => ({ ...t, [riderId]: false }));
    }
  };

  const slotEmoji = slot => slot === 'lunch' ? '' : '';

  return (
    <div style={{ position: 'relative' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          background: toast.ok ? '#16a34a' : '#dc2626', color: 'white',
          padding: '12px 20px', borderRadius: '10px', fontWeight: '600', fontSize: '14px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>{toast.msg}</div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', color: '#374151' }}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: '20px' }}> {vendor.kitchenName} — Riders</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>{riders.length} delivery riders · today's stats shown</p>
        </div>
        <button onClick={() => setShowAddModal(true)} style={{ padding: '9px 18px', background: ORANGE, color: 'white', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>
          + Add Rider
        </button>
      </div>

      {/* ── STUCK BATCHES SECTION ── */}
      {!loadingBatches && stuckBatches.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '14px', padding: '16px 20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <span style={{ fontSize: '20px' }}></span>
            <div>
              <div style={{ fontWeight: '700', fontSize: '15px', color: '#dc2626' }}>
                {stuckBatches.length} Stuck Batch{stuckBatches.length > 1 ? 'es' : ''} Detected
              </div>
              <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '2px' }}>
                These delivery batches have been running for more than 4 hours and need to be closed.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {stuckBatches.map(b => (
              <div key={b._id} style={{ background: 'white', borderRadius: '10px', border: '1px solid #fecaca', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>

                {/* Slot + date */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '160px' }}>
                  <span style={{ fontSize: '28px' }}>{slotEmoji(b.mealSlot)}</span>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '14px', color: '#1a1a2e' }}>
                      {b.mealSlot.charAt(0).toUpperCase() + b.mealSlot.slice(1)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{fmtDate(b.batchDate)}</div>
                  </div>
                </div>

                {/* Stuck duration */}
                <div style={{ background: '#fef2f2', borderRadius: '8px', padding: '8px 14px', textAlign: 'center', minWidth: '90px' }}>
                  <div style={{ fontWeight: '800', fontSize: '18px', color: '#dc2626', lineHeight: 1 }}>{b.stuckFor}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', marginTop: '2px' }}>Stuck For</div>
                </div>

                {/* Rider */}
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '2px' }}>Rider</div>
                  <div style={{ fontWeight: '600', fontSize: '13px', color: '#374151' }}> {b.riderName}</div>
                  {b.riderPhone && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{b.riderPhone}</div>}
                </div>

                {/* Order counts */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '8px 12px', textAlign: 'center', minWidth: '56px' }}>
                    <div style={{ fontWeight: '800', fontSize: '16px', color: '#16a34a' }}>{b.deliveredOrders}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>Done</div>
                  </div>
                  <div style={{ background: '#fffbeb', borderRadius: '8px', padding: '8px 12px', textAlign: 'center', minWidth: '56px' }}>
                    <div style={{ fontWeight: '800', fontSize: '16px', color: '#f59e0b' }}>{b.pendingOrders}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>Pending</div>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '8px 12px', textAlign: 'center', minWidth: '56px' }}>
                    <div style={{ fontWeight: '800', fontSize: '16px', color: '#374151' }}>{b.totalOrders}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>Total</div>
                  </div>
                </div>

                {/* Force close button */}
                <button
                  onClick={() => setForceCloseTarget(b)}
                  style={{ padding: '9px 18px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                   Force Close
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── RIDERS GRID ── */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading riders…</div>
      ) : riders.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}></div>
          <div style={{ color: '#64748b' }}>No riders assigned to this vendor.</div>
          <button onClick={() => setShowAddModal(true)} style={{ marginTop: '16px', padding: '10px 20px', background: ORANGE, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
            + Add First Rider
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {riders.map(r => (
            <div key={r._id} style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '18px', opacity: r.isActive ? 1 : 0.7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: ORANGE + '20', color: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '18px' }}>
                    {(r.name || 'R').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '15px', color: '#1a1a2e' }}>{r.name || '—'}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{r.phone || r.email || '—'}</div>
                  </div>
                </div>
                <span style={{ background: r.isActive ? '#f0fdf4' : '#fef2f2', color: r.isActive ? '#16a34a' : '#dc2626', padding: '3px 9px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>
                  {r.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Today's stats */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <div style={{ flex: 1, background: '#f8fafc', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#1a1a2e' }}>{r.todayAssigned || 0}</div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>Assigned</div>
                </div>
                <div style={{ flex: 1, background: '#f0fdf4', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#16a34a' }}>{r.todayDelivered || 0}</div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>Delivered</div>
                </div>
                <div style={{ flex: 1, background: '#fff7ed', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: ORANGE }}>{r.totalDeliveries || 0}</div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>All-Time</div>
                </div>
              </div>

              <button
                onClick={() => handleToggle(r._id)}
                disabled={toggling[r._id]}
                style={{
                  width: '100%', padding: '8px 0', borderRadius: '8px', border: 'none', cursor: toggling[r._id] ? 'not-allowed' : 'pointer',
                  background: r.isActive ? '#fef2f2' : '#f0fdf4', color: r.isActive ? '#dc2626' : '#16a34a',
                  fontSize: '13px', fontWeight: '700', opacity: toggling[r._id] ? 0.6 : 1,
                }}
              >
                {toggling[r._id] ? '…' : r.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddRiderModal
          vendorId={vendor._id}
          onClose={() => setShowAddModal(false)}
          onCreated={loadRiders}
        />
      )}

      {forceCloseTarget && (
        <ForceCloseModal
          batch={forceCloseTarget}
          onClose={() => setForceCloseTarget(null)}
          onClosed={() => {
            setForceCloseTarget(null);
            loadStuckBatches();
          }}
        />
      )}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const AdminDelivery = () => {
  const [selectedVendor, setSelectedVendor] = useState(null);

  if (selectedVendor) {
    return <VendorRidersPanel vendor={selectedVendor} onBack={() => setSelectedVendor(null)} />;
  }

  return <VendorGrid onSelectVendor={setSelectedVendor} statType="riders" />;
};

export default AdminDelivery;
