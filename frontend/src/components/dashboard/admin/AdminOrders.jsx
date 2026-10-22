import { useEffect, useState } from 'react';
import { downloadCSV } from '../../../utils/api';
import { getAuthItem } from '../../../utils/authStorage';
import VendorGrid from './VendorGrid';

const ORANGE = '#f26522';

const apiFetch = async (url, opts = {}) => {
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: 'Bearer ' + getAuthItem('token'), 'Content-Type': 'application/json', ...opts.headers },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || 'Request failed');
  return data;
};

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
const fmtCurrency = n => '₹' + (n || 0).toLocaleString('en-IN');

const statusColors = { active: '#16a34a', pending: '#f59e0b', trial: '#0ea5e9', expired: '#94a3b8', cancelled: '#dc2626', completed: '#16a34a' };
const payColors    = { Paid: '#16a34a', Pending: '#f59e0b', Failed: '#dc2626', 'Refund Pending': '#8b5cf6' };

const Badge = ({ status, colorMap }) => {
  const c = colorMap[status] || '#94a3b8';
  return (
    <span style={{ color: c, background: c + '20', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>
      {status}
    </span>
  );
};

const VendorOrdersPanel = ({ vendor, onBack }) => {
  const [orders,        setOrders]       = useState([]);
  const [total,         setTotal]        = useState(0);
  const [pages,         setPages]        = useState(1);
  const [page,          setPage]         = useState(1);
  const [status,        setStatus]       = useState('');
  const [detail,        setDetail]       = useState(null);
  const [loading,       setLoading]      = useState(true);
  const [toast,         setToast]        = useState(null);
  const [cancellingId,  setCancellingId] = useState(null);
  const [exporting,     setExporting]    = useState(false);

  const handleExportOrders = async () => {
    setExporting(true);
    try {
      const safeName = (vendor.kitchenName || 'vendor').replace(/\s+/g, '-');
      await downloadCSV(
        `/admin/export/orders?vendorId=${vendor._id}`,
        `orders-${safeName}-${new Date().toISOString().slice(0, 7)}.csv`
      );
    } catch (err) {
      showToast(err.message || 'Export failed', false);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => { load(); }, [page, status, vendor._id]);
  useEffect(() => {
    apiFetch(`/api/admin/vendors/${vendor._id}/detail`)
      .then(d => setDetail(d))
      .catch(() => {});
  }, [vendor._id]);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const load = () => {
    setLoading(true);
    const p = new URLSearchParams({ page, limit: 20, ...(status && { status }) });
    apiFetch(`/api/admin/vendors/${vendor._id}/orders?${p}`)
      .then(d => { setOrders(d.orders || []); setTotal(d.total || 0); setPages(d.pages || 1); })
      .catch(err => showToast(err.message || 'Failed to load orders', false))
      .finally(() => setLoading(false));
  };

  const handleCancel = async (orderId) => {
    if (!window.confirm('Cancel this order?')) return;
    setCancellingId(orderId);
    try {
      await apiFetch(`/api/admin/vendors/${vendor._id}/orders/${orderId}/cancel`, { method: 'PATCH' });
      showToast('Order cancelled successfully');
      load();
    } catch (err) {
      showToast(err.message || 'Failed to cancel order', false);
    } finally {
      setCancellingId(null);
    }
  };

  const handleSuspend = async () => {
    if (!window.confirm(`Suspend vendor "${vendor.kitchenName}"? This will revoke their approval.`)) return;
    try {
      await apiFetch(`/api/admin/vendors/${vendor._id}/suspend`, { method: 'PATCH' });
      showToast('Vendor suspended');
      setTimeout(onBack, 1200);
    } catch (err) {
      showToast(err.message || 'Failed to suspend vendor', false);
    }
  };

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
          <h2 style={{ margin: 0, fontSize: '20px' }}>📦 {vendor.kitchenName} — Orders</h2>
          {detail?.stats && (
            <div style={{ display: 'flex', gap: '16px', marginTop: '6px', flexWrap: 'wrap' }}>
              {[
                { l: 'Total Orders',    v: detail.stats.totalOrders },
                { l: 'Active',          v: detail.stats.activeOrders },
                { l: 'Revenue',         v: fmtCurrency(detail.stats.revenue) },
              ].map(s => (
                <span key={s.l} style={{ fontSize: '12px', color: '#64748b' }}>
                  <strong style={{ color: '#1a1a2e' }}>{s.v}</strong> {s.l}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleExportOrders}
          disabled={exporting}
          style={{ padding: '8px 16px', background: exporting ? '#f1f5f9' : ORANGE, color: exporting ? '#94a3b8' : 'white', border: 'none', borderRadius: '8px', cursor: exporting ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px' }}
        >
          {exporting ? '⏳ Downloading…' : '📥 Export CSV'}
        </button>
        <button onClick={handleSuspend} style={{ padding: '8px 16px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
          Suspend Vendor
        </button>
      </div>

      {/* Status filter pills */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[['', 'All'], ['active', 'Active'], ['trial', 'Trial'], ['pending', 'Pending'], ['expired', 'Expired'], ['cancelled', 'Cancelled']].map(([val, lbl]) => (
          <button key={val} onClick={() => { setStatus(val); setPage(1); }} style={{
            padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontWeight: '600', fontSize: '12px',
            background: status === val ? ORANGE : '#f1f5f9', color: status === val ? 'white' : '#64748b',
          }}>{lbl}</button>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : orders.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>No orders found</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>
                  {['Customer', 'Plan', 'Amount', 'Payment', 'Status', 'Dates', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: '600', color: '#1a1a2e' }}>{o.userId?.name || o.customerName || '—'}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{o.userId?.phone || ''}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: '#fff7ed', color: ORANGE, padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>{o.planType}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: '700' }}>{fmtCurrency(o.amount)}</td>
                    <td style={{ padding: '12px 16px' }}><Badge status={o.paymentStatus} colorMap={payColors} /></td>
                    <td style={{ padding: '12px 16px' }}><Badge status={o.status} colorMap={statusColors} /></td>
                    <td style={{ padding: '12px 16px', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      <div>{fmtDate(o.startDate)}</div>
                      <div>→ {fmtDate(o.endDate)}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {!['cancelled', 'expired', 'completed'].includes(o.status) && (
                        <button
                          onClick={() => handleCancel(o._id)}
                          disabled={cancellingId === o._id}
                          style={{ padding: '4px 10px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', opacity: cancellingId === o._id ? 0.5 : 1 }}
                        >
                          {cancellingId === o._id ? '...' : 'Cancel'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', background: 'white' }}>← Prev</button>
            <span style={{ padding: '6px 14px', color: '#64748b', fontSize: '13px' }}>Page {page} of {pages} · {total} orders</span>
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', background: 'white' }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
};

const AdminOrders = () => {
  const [selectedVendor, setSelectedVendor] = useState(null);

  if (selectedVendor) {
    return <VendorOrdersPanel vendor={selectedVendor} onBack={() => setSelectedVendor(null)} />;
  }

  return <VendorGrid onSelectVendor={setSelectedVendor} statType="orders" />;
};

export default AdminOrders;
