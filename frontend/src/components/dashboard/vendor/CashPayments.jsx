import React, { useState, useEffect, useCallback } from 'react';
import { getCashPayments, markCashPaymentPaid } from '../../../utils/api';
import { onEvent, offEvent } from '../../../utils/socket';

const fmt = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
};

const fmtDateTime = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

const planBadge = (planType) => {
  const styles = {
    Monthly: { background: '#dbeafe', color: '#1d4ed8' },
    Weekly:  { background: '#f3e8ff', color: '#7c3aed' },
    Trial:   { background: '#f1f5f9', color: '#64748b' },
    Tiffin:  { background: '#fef9c3', color: '#a16207' }
  };
  const s = styles[planType] || styles.Tiffin;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '20px', fontSize: '12px',
      fontWeight: '600', ...s
    }}>
      {planType || 'Tiffin'}
    </span>
  );
};

const CashPayments = () => {
  const [orders, setOrders] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [markingPaid, setMarkingPaid] = useState(new Set());
  const [filter, setFilter] = useState('all');
  const [successMessage, setSuccessMessage] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await getCashPayments();
      setOrders(data.orders || []);
      setPendingCount(data.pendingCount || 0);
      setError(null);
    } catch {
      setError('Failed to load cash payments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const handleCashUpdate = () => fetchData();
    onEvent('cash_payment_updated', handleCashUpdate);
    onEvent('new_order', handleCashUpdate);
    onEvent('newOrder', handleCashUpdate);
    return () => {
      offEvent('cash_payment_updated', handleCashUpdate);
      offEvent('new_order', handleCashUpdate);
      offEvent('newOrder', handleCashUpdate);
    };
  }, [fetchData]);

  const handleMarkPaid = async (orderId) => {
    setMarkingPaid(prev => new Set(prev).add(orderId));
    try {
      await markCashPaymentPaid(orderId);
      setOrders(prev => prev.map(o =>
        o.orderId === orderId
          ? { ...o, paymentStatus: 'Paid', cashPaymentConfirmedAt: new Date().toISOString() }
          : o
      ));
      setPendingCount(prev => Math.max(0, prev - 1));
      setSuccessMessage('Payment marked as collected!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError('Failed to mark payment: ' + (err.message || 'Unknown error'));
      setTimeout(() => setError(null), 4000);
    } finally {
      setMarkingPaid(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const filtered = orders.filter(o => {
    const isPaid = o.cashCollection?.collected === true || o.paymentStatus === 'Paid';
    if (filter === 'pending') return !isPaid && o.paymentStatus === 'Pending';
    if (filter === 'paid')    return isPaid;
    return true;
  });

  const totalPending = orders.filter(o => o.paymentStatus === 'Pending' && o.cashCollection?.collected !== true).length;
  const totalPaid    = orders.filter(o => o.paymentStatus === 'Paid' || o.cashCollection?.collected === true).length;
  const pendingAmount = orders
    .filter(o => o.paymentStatus === 'Pending')
    .reduce((s, o) => s + (Number(o.amount) || 0), 0);

  const emptyMsg =
    filter === 'pending' ? 'No pending cash payments 🎉' :
    filter === 'paid'    ? 'No collected payments yet' :
                           'No cash orders yet';

  if (loading) {
    return (
      <div className="v-card" style={{ textAlign: 'center', padding: '40px', color: '#a3aed0' }}>
        Loading cash payments...
      </div>
    );
  }

  return (
    <div className="v-card">
      <h3 style={{ color: '#2b3674', margin: '0 0 20px 0' }}>Cash Payments</h3>

      {/* Alerts */}
      {successMessage && (
        <div role="alert" style={{
          background: '#dcfce7', color: '#15803d', border: '1px solid #86efac',
          borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontWeight: '600'
        }}>
          ✓ {successMessage}
        </div>
      )}
      {error && (
        <div role="alert" style={{
          background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5',
          borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontWeight: '600'
        }}>
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '14px',
        marginBottom: '24px'
      }}>
        <div style={{ background: '#f4f7fe', borderRadius: '12px', padding: '16px' }}>
          <p style={{ color: '#a3aed0', margin: '0 0 6px 0', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>Total Cash Orders</p>
          <h3 style={{ color: '#2b3674', margin: 0, fontSize: '24px', fontWeight: '800' }}>{orders.length}</h3>
        </div>
        <div style={{ background: '#fff7ed', borderRadius: '12px', padding: '16px', border: '1px solid #fed7aa' }}>
          <p style={{ color: '#c2410c', margin: '0 0 6px 0', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>Pending Payment</p>
          <h3 style={{ color: '#ea580c', margin: 0, fontSize: '24px', fontWeight: '800' }}>{totalPending}</h3>
        </div>
        <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '16px', border: '1px solid #bbf7d0' }}>
          <p style={{ color: '#15803d', margin: '0 0 6px 0', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>Collected</p>
          <h3 style={{ color: '#16a34a', margin: 0, fontSize: '24px', fontWeight: '800' }}>{totalPaid}</h3>
        </div>
        <div style={{ background: '#fff7ed', borderRadius: '12px', padding: '16px', border: '1px solid #fed7aa' }}>
          <p style={{ color: '#c2410c', margin: '0 0 6px 0', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>Pending Amount</p>
          <h3 style={{ color: '#ea580c', margin: 0, fontSize: '24px', fontWeight: '800' }}>₹{pendingAmount.toLocaleString()}</h3>
        </div>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto' }}>
        {[
          { key: 'all',     label: 'All' },
          { key: 'pending', label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
          { key: 'paid',    label: 'Paid' }
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '7px 18px', borderRadius: '50px', border: 'none',
              cursor: 'pointer', fontWeight: '700', fontSize: '13px', whiteSpace: 'nowrap',
              background: filter === key ? '#f26522' : '#f4f7fe',
              color:      filter === key ? '#fff'    : '#64748b',
              transition: 'all 0.2s'
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="table-scroll">
        <table className="v-table">
          <thead>
            <tr>
              <th>Customer Name</th>
              <th className="hide-mobile">Phone</th>
              <th>Plan</th>
              <th>Start Date</th>
              <th>Amount</th>
              <th>Order Date</th>
              <th>Status</th>
              <th className="hide-mobile">Confirmed At</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#a3aed0' }}>
                  {emptyMsg}
                </td>
              </tr>
            ) : (
              filtered.map((order) => {
                const riderCollected = order.cashCollection?.collected === true;
                const isPending  = order.paymentStatus === 'Pending' && !riderCollected;
                const isMarking  = markingPaid.has(order.orderId);
                const collectedByRider = riderCollected &&
                  order.cashPaymentConfirmedByType === 'DeliveryPartner';
                const collectedAmount = riderCollected
                  ? Number(order.cashCollection.amount)
                  : Number(order.amount);
                const collectedAt = order.cashCollection?.collectedAt ||
                  order.cashPaymentConfirmedAt;
                return (
                  <tr key={order.orderId}>
                    <td style={{ fontWeight: '700', color: '#2b3674' }}>{order.customerName}</td>
                    <td className="hide-mobile" style={{ color: '#64748b' }}>{order.customerPhone}</td>
                    <td>{planBadge(order.planType)}</td>
                    <td style={{ color: '#64748b', fontSize: '13px' }}>{fmt(order.startDate)}</td>
                    <td style={{ fontWeight: '700', color: isPending ? '#ea580c' : '#2b3674' }}>
                      ₹{(Number.isFinite(collectedAmount) ? collectedAmount : 0).toLocaleString()}
                      {riderCollected && order.cashCollection.amountMismatch && (
                        <small style={{ display: 'block', color: '#b45309', fontWeight: 500 }}>
                          Expected ₹{Number(order.cashCollection.expectedAmount || 0).toLocaleString()}
                        </small>
                      )}
                    </td>
                    <td style={{ color: '#64748b', fontSize: '13px' }}>{fmtDateTime(order.orderDate)}</td>
                    <td>
                      <span style={{
                        padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700',
                        background: isPending ? '#fff7ed' : '#dcfce7',
                        color:      isPending ? '#ea580c' : '#16a34a'
                      }}>
                        {riderCollected ? 'Paid' : order.paymentStatus}
                      </span>
                        {riderCollected && (
                        <small style={{ display: 'block', marginTop: 3, color: '#166534', fontWeight: 600 }}>
                          (Collected by Rider)
                        </small>
                      )}
                    </td>
                    <td className="hide-mobile" style={{ color: '#64748b', fontSize: '13px' }}>
                      {fmtDateTime(collectedAt)}
                    </td>
                    <td>
                      {isPending ? (
                        <button
                          aria-label={`Mark payment as paid for ${order.customerName}`}
                          disabled={isMarking}
                          onClick={() => handleMarkPaid(order.orderId)}
                          style={{
                            background: isMarking ? '#86efac' : '#16a34a',
                            color: 'white', border: 'none', borderRadius: '8px',
                            padding: '8px 14px', cursor: isMarking ? 'not-allowed' : 'pointer',
                            fontWeight: '700', fontSize: '13px', minWidth: '110px',
                            transition: 'background 0.2s'
                          }}
                        >
                          {isMarking ? 'Marking...' : 'Mark as Paid'}
                        </button>
                      ) : (
                        <span style={{ color: '#16a34a', fontWeight: '700', fontSize: '13px' }}>
                          {collectedByRider ? '✓ Collected by Rider' : '✓ Collected'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default CashPayments;
