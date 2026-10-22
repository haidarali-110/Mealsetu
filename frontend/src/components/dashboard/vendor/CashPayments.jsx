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
    Daily:   { background: '#fef3c7', color: '#b45309' },
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [markingPaid, setMarkingPaid] = useState(new Set());
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'collected'
  const [successMessage, setSuccessMessage] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await getCashPayments();
      setOrders(data.orders || []);
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
    onEvent('cash_collected', handleCashUpdate);
    onEvent('cash_payment_updated', handleCashUpdate);
    onEvent('new_order', handleCashUpdate);
    onEvent('newOrder', handleCashUpdate);
    return () => {
      offEvent('cash_collected', handleCashUpdate);
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
          ? {
              ...o,
              paymentStatus: 'Paid',
              cashCollectedByRole: 'vendor',
              cashCollectedAt: new Date().toISOString(),
              cashPaymentConfirmedAt: new Date().toISOString()
            }
          : o
      ));
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

  const pendingOrders = orders.filter(o => {
    const isPaid = o.paymentStatus === 'Paid' || o.cashCollection?.collected === true;
    return !isPaid;
  });

  const collectedOrders = orders.filter(o => {
    const isPaid = o.paymentStatus === 'Paid' || o.cashCollection?.collected === true;
    return isPaid;
  });

  const totalPending = pendingOrders.length;
  const totalPaid    = collectedOrders.length;
  const pendingAmount = pendingOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const collectedAmount = collectedOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0);

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
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px',
        marginBottom: '24px'
      }}>
        <div style={{ background: '#f4f7fe', borderRadius: '12px', padding: '16px' }}>
          <p style={{ color: '#a3aed0', margin: '0 0 6px 0', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>Total Cash Orders</p>
          <h3 style={{ color: '#2b3674', margin: 0, fontSize: '24px', fontWeight: '800' }}>{orders.length}</h3>
        </div>
        <div style={{ background: '#fff7ed', borderRadius: '12px', padding: '16px', border: '1px solid #fed7aa' }}>
          <p style={{ color: '#c2410c', margin: '0 0 6px 0', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>Pending Collection</p>
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

      {/* Two Tabs: Pending Collection | Collected */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            padding: '8px 20px', borderRadius: '8px', border: 'none',
            cursor: 'pointer', fontWeight: '700', fontSize: '14px',
            background: activeTab === 'pending' ? '#f26522' : '#f1f5f9',
            color:      activeTab === 'pending' ? '#fff'    : '#64748b',
            display: 'flex', alignItems: 'center', gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          <span>Pending Collection</span>
          {totalPending > 0 && (
            <span style={{
              background: activeTab === 'pending' ? 'rgba(255,255,255,0.3)' : '#ea580c',
              color: '#fff', borderRadius: '12px', padding: '2px 8px', fontSize: '11px', fontWeight: '800'
            }}>
              {totalPending}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('collected')}
          style={{
            padding: '8px 20px', borderRadius: '8px', border: 'none',
            cursor: 'pointer', fontWeight: '700', fontSize: '14px',
            background: activeTab === 'collected' ? '#16a34a' : '#f1f5f9',
            color:      activeTab === 'collected' ? '#fff'    : '#64748b',
            display: 'flex', alignItems: 'center', gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          <span>Collected</span>
          {totalPaid > 0 && (
            <span style={{
              background: activeTab === 'collected' ? 'rgba(255,255,255,0.3)' : '#16a34a',
              color: '#fff', borderRadius: '12px', padding: '2px 8px', fontSize: '11px', fontWeight: '800'
            }}>
              {totalPaid}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: PENDING COLLECTION */}
      {activeTab === 'pending' && (
        <div className="table-scroll">
          <table className="v-table">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingOrders.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#a3aed0' }}>
                    No pending cash payments 🎉
                  </td>
                </tr>
              ) : (
                pendingOrders.map((order) => {
                  const isOffline = order.isOfflineOrder || order.isManualOrder || order.source === 'manual';
                  const isMarking = markingPaid.has(order.orderId);
                  const orderDateDisplay = fmt(order.startDate || order.orderDate);

                  return (
                    <tr key={order.orderId}>
                      <td>
                        <div style={{ fontWeight: '700', color: '#2b3674' }}>{order.customerName}</div>
                        {order.customerPhone && (
                          <small style={{ color: '#64748b', fontSize: '12px' }}>📱 {order.customerPhone}</small>
                        )}
                        {isOffline && (
                          <span style={{
                            display: 'inline-block', marginLeft: '6px', padding: '1px 6px',
                            borderRadius: '4px', background: '#fef3c7', color: '#92400e',
                            fontSize: '10px', fontWeight: '700'
                          }}>
                            OFFLINE
                          </span>
                        )}
                      </td>
                      <td>{planBadge(order.planType)}</td>
                      <td style={{ fontWeight: '700', color: '#ea580c', fontSize: '14px' }}>
                        ₹{Number(order.amount || 0).toLocaleString()}
                      </td>
                      <td style={{ color: '#64748b', fontSize: '13px' }}>
                        {orderDateDisplay}
                      </td>
                      <td>
                        {isOffline ? (
                          <button
                            aria-label={`Mark as Paid for ${order.customerName}`}
                            disabled={isMarking}
                            onClick={() => handleMarkPaid(order.orderId)}
                            style={{
                              background: isMarking ? '#86efac' : '#16a34a',
                              color: 'white', border: 'none', borderRadius: '8px',
                              padding: '8px 14px', cursor: isMarking ? 'not-allowed' : 'pointer',
                              fontWeight: '700', fontSize: '13px', minWidth: '110px',
                              boxShadow: '0 2px 4px rgba(22,163,74,0.2)'
                            }}
                          >
                            {isMarking ? 'Marking...' : 'Mark as Paid'}
                          </button>
                        ) : (
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                            borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: '600'
                          }}>
                            <span>🛵</span>
                            <span>Rider will collect on delivery</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: COLLECTED */}
      {activeTab === 'collected' && (
        <div className="table-scroll">
          <table className="v-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Collected by</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {collectedOrders.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#a3aed0' }}>
                    No collected payments yet
                  </td>
                </tr>
              ) : (
                collectedOrders.map((order) => {
                  const riderCollected = order.cashCollectedByRole === 'rider' ||
                    order.cashPaymentConfirmedByType === 'DeliveryPartner' ||
                    order.cashCollection?.collected === true;
                  const collectorLabel = riderCollected ? 'Collected by Rider' : 'Collected by Vendor';

                  const collectedDate = order.cashCollectedAt ||
                    order.cashCollection?.collectedAt ||
                    order.cashPaymentConfirmedAt ||
                    order.orderDate;

                  return (
                    <tr key={order.orderId}>
                      <td>
                        <div style={{ fontWeight: '700', color: '#2b3674' }}>{order.customerName}</div>
                        {order.customerPhone && (
                          <small style={{ color: '#64748b', fontSize: '12px' }}>📱 {order.customerPhone}</small>
                        )}
                      </td>
                      <td>{planBadge(order.planType)}</td>
                      <td style={{ fontWeight: '700', color: '#16a34a', fontSize: '14px' }}>
                        ₹{Number(order.amount || 0).toLocaleString()}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700',
                          background: riderCollected ? '#e0f2fe' : '#f0fdf4',
                          color:      riderCollected ? '#0369a1' : '#15803d',
                          border:     riderCollected ? '1px solid #bae6fd' : '1px solid #bbf7d0'
                        }}>
                          <span>{riderCollected ? '🛵' : '🏪'}</span>
                          <span>{collectorLabel}</span>
                        </span>
                      </td>
                      <td style={{ color: '#64748b', fontSize: '13px' }}>
                        {fmtDateTime(collectedDate)}
                      </td>
                      <td>
                        <span style={{
                          padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700',
                          background: '#dcfce7', color: '#16a34a'
                        }}>
                          PAID ✅
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

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

