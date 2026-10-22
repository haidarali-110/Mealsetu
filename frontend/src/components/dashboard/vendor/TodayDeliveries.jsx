import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getTodayOrders, getVendorDeliveryPartners, assignDeliveryPartner } from '../../../utils/api';
import { onEvent, offEvent } from '../../../utils/socket';

// ── Delivery status badge ──────────────────────────────────────────────────
const DeliveryBadge = ({ status }) => {
  const map = {
    pending:    { label: 'Pending',    bg: '#f1f5f9', color: '#64748b' },
    assigned:   { label: 'Assigned',   bg: '#dbeafe', color: '#1d4ed8' },
    preparing:  { label: 'Preparing',  bg: '#fef3c7', color: '#b45309' },
    picked_up:  { label: 'Picked Up',  bg: '#ede9fe', color: '#6d28d9' },
    on_the_way: { label: 'On the Way', bg: '#ede9fe', color: '#6d28d9' },
    delivered:  { label: 'Delivered',  bg: '#dcfce7', color: '#16a34a' },
    failed:     { label: 'Failed',     bg: '#fee2e2', color: '#dc2626' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
};

// ── Order card ─────────────────────────────────────────────────────────────
const OrderCard = ({ order, partners, onAssigned }) => {
  const [selected, setSelected]   = useState('');
  const [assigning, setAssigning] = useState(false);
  const [err, setErr]             = useState('');

  const userId   = order.userId   || {};
  const vendorId = order.vendorId || {};
  const ds       = order.deliveryStatus || 'pending';
  const canAssign = ds === 'pending' || ds === 'assigned';

  const handleAssign = async () => {
    if (!selected) return;
    setAssigning(true);
    setErr('');
    try {
      await assignDeliveryPartner(order._id, selected);
      onAssigned(order._id, selected);
      setSelected('');
    } catch (e) {
      setErr(e.message || 'Assignment failed.');
    } finally {
      setAssigning(false);
    }
  };

  const availablePartners = partners.filter(p => p.isAvailable && p.isActive);

  return (
    <div style={{
      background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
      padding: 16, marginBottom: 12,
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
            {userId.name || 'Customer'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {userId.address || '—'}
          </div>
          <div style={{ fontSize: 12, color: '#f26522', fontWeight: 600, marginTop: 2 }}>
            {order.planType || ''}
          </div>
        </div>
        <DeliveryBadge status={ds} />
      </div>

      {/* Current partner info */}
      {order.deliveryPartnerId && (
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
          Partner: <strong>{order.deliveryPartnerId.name || '—'}</strong>
        </div>
      )}

      {/* Assign dropdown */}
      {canAssign && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 8,
              border: '1px solid #e2e8f0', fontSize: 13,
              background: '#f8fafc', outline: 'none',
            }}
          >
            <option value="">— Assign partner —</option>
            {availablePartners.map(p => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={handleAssign}
            disabled={!selected || assigning}
            style={{
              padding: '7px 16px', borderRadius: 8, border: 'none',
              background: selected && !assigning ? '#f26522' : '#cbd5e1',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: selected && !assigning ? 'pointer' : 'not-allowed',
            }}
          >
            {assigning ? '…' : 'Assign'}
          </button>
        </div>
      )}
      {err && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{err}</div>}
    </div>
  );
};

// ── Summary chip ───────────────────────────────────────────────────────────
const Chip = ({ label, count, color }) => (
  <div style={{
    background: `${color}1a`, border: `1px solid ${color}4d`,
    borderRadius: 20, padding: '6px 14px', display: 'flex',
    flexDirection: 'column', alignItems: 'center', minWidth: 70,
  }}>
    <span style={{ fontSize: 20, fontWeight: 800, color }}>{count}</span>
    <span style={{ fontSize: 11, fontWeight: 500, color }}>{label}</span>
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────
const TodayDeliveries = () => {
  const [orders,   setOrders]   = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const refreshTimerRef         = useRef(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [ordersRes, partnersRes] = await Promise.all([
        getTodayOrders(),
        getVendorDeliveryPartners(),
      ]);
      const oList = Array.isArray(ordersRes)  ? ordersRes  : (ordersRes.orders   || []);
      const pList = Array.isArray(partnersRes) ? partnersRes : (partnersRes.partners || []);
      setOrders(oList);
      setPartners(pList);
    } catch (err) {
      setError(err.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh every 30 seconds
    refreshTimerRef.current = setInterval(load, 30000);
    return () => clearInterval(refreshTimerRef.current);
  }, [load]);

  // Live status updates via Socket.IO
  useEffect(() => {
    const handler = (data) => {
      if (!data?.orderId) return;
      setOrders(prev => prev.map(o =>
        o._id === data.orderId
          ? { ...o, deliveryStatus: data.status }
          : o
      ));
    };
    onEvent('delivery_status_changed', handler);
    return () => offEvent('delivery_status_changed', handler);
  }, []);

  const handleAssigned = (orderId, partnerId) => {
    const partner = partners.find(p => p._id === partnerId);
    setOrders(prev => prev.map(o =>
      o._id === orderId
        ? { ...o, deliveryStatus: 'assigned', deliveryPartnerId: partner || { _id: partnerId } }
        : o
    ));
  };

  // Summary counts
  const pending   = orders.filter(o => !o.deliveryStatus || o.deliveryStatus === 'pending').length;
  const inProgress = orders.filter(o => ['assigned','preparing','picked_up','on_the_way'].includes(o.deliveryStatus)).length;
  const delivered = orders.filter(o => o.deliveryStatus === 'delivered').length;

  return (
    <div style={{ padding: '0 0 40px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}> Today's Deliveries</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Assign delivery partners to active orders
          </p>
        </div>
        <button
          onClick={load}
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', color: '#64748b',
          }}
        >
          ↺ Refresh
        </button>
      </div>

      {/* Summary chips */}
      {!loading && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <Chip label="Total"       count={orders.length} color="#f26522" />
          <Chip label="Pending"     count={pending}       color="#d97706" />
          <Chip label="In Progress" count={inProgress}    color="#7c3aed" />
          <Chip label="Delivered"   count={delivered}     color="#16a34a" />
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>📦</div>
          <p style={{ color: '#64748b', fontSize: 14 }}>No active orders today.</p>
        </div>
      ) : (
        <div>
          {orders.map(o => (
            <OrderCard
              key={o._id}
              order={o}
              partners={partners}
              onAssigned={handleAssigned}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TodayDeliveries;
