import { useEffect, useState } from 'react';
import { getVendorCommissionDetail } from '../../../utils/api.js';
import { getAuthItem } from '../../../utils/authStorage';

const isSettled = (h) => h.status === 'paid' || h.status === 'auto_deducted';

const periodLabel = (h) => {
  if (h.weekStart && h.weekEnd) {
    return `${new Date(h.weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(h.weekEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
  }
  if (h.month) {
    return new Date(`${h.month}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
  return '—';
};

const VendorCommissionDetail = ({ vendorId, onClose }) => {
  const [history, setHistory]           = useState([]);
  const [vendor, setVendor]             = useState(null);
  const [loading, setLoading]           = useState(true);
  const [detailTab, setDetailTab]       = useState('settlements');
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getVendorCommissionDetail(vendorId);
        setVendor(data.vendor);
        setHistory(data.history || []);
      } catch (err) {
        console.error('Failed to load vendor commission detail:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [vendorId]);

  useEffect(() => {
    if (detailTab !== 'payments') return;
    const fetchPayments = async () => {
      setLoadingPayments(true);
      try {
        const token = getAuthItem('token');
        const res = await fetch(`/api/admin/commission/vendor/${vendorId}/payments`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setPaymentHistory(data.payments || []);
      } catch (err) {
        console.error('Failed to load payment history:', err);
      } finally {
        setLoadingPayments(false);
      }
    };
    fetchPayments();
  }, [detailTab, vendorId]);

  const handleDownload = () => {
    const token = getAuthItem('token');
    const url   = `/api/admin/commission/vendor/${vendorId}/report`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const objUrl = window.URL.createObjectURL(blob);
        const a      = document.createElement('a');
        a.href       = objUrl;
        a.download   = `commission_${vendor?.kitchenName || vendorId}.csv`;
        a.click();
        window.URL.revokeObjectURL(objUrl);
      });
  };

  // FIX: 'auto_deducted' commissions are already settled — they were never
  // wrong to begin with, and treating them as "pending" alarms admins for
  // no reason. Count anything settled (paid OR auto_deducted) together.
  const totalSettled = history.filter(isSettled)
    .reduce((s, h) => s + (h.commission_amount || 0), 0);
  const totalPending = history.filter(h => !isSettled(h))
    .reduce((s, h) => s + (h.commission_amount || 0), 0);

  const autoDeductedCount = history.filter(h => h.status === 'auto_deducted').length;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 12, padding: 24,
          width: '100%', maxWidth: 720, maxHeight: '85vh', overflowY: 'auto'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, color: '#1a2240' }}>
              {loading ? 'Loading...' : (vendor?.kitchenName || 'Vendor')}
            </h2>
            <p style={{ color: '#6b7280', margin: '4px 0 0', fontSize: 13 }}>
              Commission History — All Periods
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!loading && (
              <button
                onClick={handleDownload}
                style={{
                  background: '#f97316', color: 'white', border: 'none',
                  borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
                  fontWeight: 600, fontSize: 13
                }}
              >
                Download CSV
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: '#f3f4f6', border: 'none', borderRadius: 8,
                padding: '8px 16px', cursor: 'pointer', fontSize: 13
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        {!loading && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
            {[
              { key: 'settlements', label: 'Settlement History' },
              { key: 'payments',    label: 'Payment Records' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setDetailTab(tab.key)}
                style={{
                  background:   'none', border: 'none',
                  padding:      '8px 16px', cursor: 'pointer',
                  fontWeight:   detailTab === tab.key ? 700 : 400,
                  color:        detailTab === tab.key ? '#f97316' : '#6b7280',
                  borderBottom: detailTab === tab.key ? '2px solid #f97316' : '2px solid transparent',
                  marginBottom: -1
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', color: '#6b7280', padding: '40px 0' }}>
            Loading commission history...
          </p>
        ) : detailTab === 'payments' ? (
          loadingPayments ? (
            <p style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Loading payments...</p>
          ) : (
            <>
              {/* Auto-deducted months never create a CommissionPayment record —
                  there's no "payment event" since nothing was collected from
                  the vendor. Explain that instead of showing a confusing
                  empty table when there clearly IS commission history. */}
              {autoDeductedCount > 0 && (
                <div style={{
                  background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
                  padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#166534'
                }}>
                  ⚡ {autoDeductedCount} month{autoDeductedCount !== 1 ? 's' : ''} were auto-deducted — those don't
                  generate a payment record since nothing was collected from the vendor. See "Settlement History" for those.
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['DATE', 'AMOUNT', 'METHOD', 'REFERENCE', 'STATUS', 'ON TIME'].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: 'left',
                        fontSize: 10, fontWeight: 600, color: '#6b7280',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.map(p => (
                    <tr key={p._id} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 12px' }}>
                        {new Date(p.paidAt).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                        ₹{p.amountPaid?.toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#6b7280' }}>
                        {p.paymentMethod}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 11 }}>
                        {p.razorpayPaymentId || p.utrNumber || '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          background: p.status === 'confirmed' ? '#dcfce7' : '#fef3c7',
                          color:      p.status === 'confirmed' ? '#16a34a' : '#d97706'
                        }}>
                          {p.status === 'confirmed' ? '✓ Confirmed' : 'Pending'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ color: p.paidOnTime ? '#16a34a' : '#f97316', fontSize: 12 }}>
                          {p.paidOnTime === true ? '✓ On time' : p.paidOnTime === false ? '⚠ Late' : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {paymentHistory.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>
                        {autoDeductedCount > 0
                          ? 'No manual payment records — all settlements were auto-deducted.'
                          : 'No payment records found'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div style={{ background: '#f0fdf4', borderRadius: 8, padding: 12 }}>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Total Settled</p>
                <p style={{ margin: '4px 0 0', fontWeight: 700, color: '#16a34a', fontSize: 20 }}>
                  ₹{totalSettled.toLocaleString('en-IN')}
                </p>
                {autoDeductedCount > 0 && (
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: '#9ca3af' }}>
                    incl. {autoDeductedCount} auto-deducted
                  </p>
                )}
              </div>
              <div style={{ background: '#fef2f2', borderRadius: 8, padding: 12 }}>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Total Pending</p>
                <p style={{ margin: '4px 0 0', fontWeight: 700, color: '#dc2626', fontSize: 20 }}>
                  ₹{totalPending.toLocaleString('en-IN')}
                </p>
              </div>
              <div style={{ background: '#eff6ff', borderRadius: 8, padding: 12 }}>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Total Periods</p>
                <p style={{ margin: '4px 0 0', fontWeight: 700, color: '#2563eb', fontSize: 20 }}>
                  {history.length}
                </p>
              </div>
            </div>

            {/* Period-by-period table */}
            {history.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9ca3af', padding: '24px 0' }}>
                No commission records for this vendor.
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['PERIOD', 'RANGE', 'EARNINGS', 'RATE', 'COMMISSION', 'SETTLED / DUE', 'STATUS'].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px',
                        textAlign: ['EARNINGS', 'RATE', 'COMMISSION'].includes(h) ? 'right' : 'left',
                        fontSize: 11, fontWeight: 600, color: '#6b7280',
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const isAuto = h.status === 'auto_deducted';
                    return (
                      <tr key={h._id} style={{
                        borderBottom: '1px solid #f3f4f6',
                        background: h.status === 'overdue' ? '#fef2f2' : isAuto ? '#f0fdf4' : 'white'
                      }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, fontSize: 13 }}>
                          {h.week || h.month || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#6b7280' }}>
                          {periodLabel(h)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13 }}>
                          ₹{h.total_earning?.toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13 }}>
                          {h.commission_rate}%
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, fontSize: 13 }}>
                          ₹{h.commission_amount?.toLocaleString('en-IN')}
                        </td>
                        <td style={{
                          padding: '10px 12px', fontSize: 12,
                          color: h.status === 'overdue' ? '#dc2626' : '#374151'
                        }}>
                          {isAuto
                            ? (h.payment_date
                                ? new Date(h.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                : '—')
                            : (h.due_date
                                ? new Date(h.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                : '—')}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 10,
                            fontSize: 11, fontWeight: 600,
                            background: isAuto              ? '#dcfce7'
                                      : h.status === 'paid'    ? '#dcfce7'
                                      : h.status === 'overdue' ? '#fee2e2' : '#fef3c7',
                            color:      isAuto              ? '#16a34a'
                                      : h.status === 'paid'    ? '#16a34a'
                                      : h.status === 'overdue' ? '#dc2626' : '#d97706'
                          }}>
                            {isAuto ? '⚡ Auto-Deducted'
                              : h.status === 'paid' ? 'Paid'
                              : h.status === 'overdue' ? 'Overdue' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default VendorCommissionDetail;
