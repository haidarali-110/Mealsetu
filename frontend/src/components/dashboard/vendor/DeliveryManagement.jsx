import React, { useState, useEffect, useRef, useCallback } from 'react';
import { onEvent, offEvent } from '../../../utils/socket';
import { useToast } from '../../common/Toast';
import {
  toggleVendorDelivery,
  getVendorRiders,
  addRider,
  updateRider,
  deleteRider,
  markRiderSalaryPaid,
  createSalaryRazorpayOrder,
  verifySalaryRazorpayPayment,
  getDeliveryBatches,
  createDeliveryBatches,
  assignBatchToRider,
  reassignBatch,
  mergeBatches,
  getDeliveryFinancials,
  getDeliveryAnalytics,
  getDeliveryAttendance,
  getLiveRiderLocations,
  getRetryOrders,
  getFailedDeliveries,
  resolveFailedDeliveryOrder,
  getTodayOrders,
  getVendorProfile,
} from '../../../utils/api';

const loadRazorpayScript = () => new Promise((resolve) => {
  if (window.Razorpay) { resolve(true); return; }
  const s = document.createElement('script');
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  s.onload  = () => resolve(true);
  s.onerror = () => resolve(false);
  document.body.appendChild(s);
});

/* ─── Brand colors ──────────────────────────────────────────────────── */
const C = {
  orange: '#F26522', orangeLight: '#FFF3EC',
  green:  '#16A34A', greenLight:  '#F0FDF4',
  blue:   '#2563EB', blueLight:   '#EFF6FF',
  red:    '#DC2626', redLight:    '#FEF2F2',
  purple: '#7C3AED', purpleLight: '#F5F3FF',
  teal:   '#0891B2', tealLight:   '#ECFEFF',
  slate:  '#64748B', slateLight:  '#F8FAFC',
  border: '#E2E8F0',
};

/* ─── Helpers ────────────────────────────────────────────────────────── */
const todayStr = () => new Date().toISOString().slice(0, 10);

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const fmtCurrency = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

const capitalize = (s) =>
  (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const batchStatusStyle = (s) =>
  ({
    pending:     { bg: '#F1F5F9', color: C.slate  },
    assigned:    { bg: C.blueLight,   color: C.blue   },
    in_progress: { bg: C.orangeLight, color: C.orange  },
    completed:   { bg: C.greenLight,  color: C.green  },
    partial:     { bg: '#FFF7ED',     color: '#EA580C' },
  }[s] || { bg: '#F1F5F9', color: C.slate });

const orderStatusStyle = (s) =>
  ({
    pending:       { bg: '#F1F5F9',    color: C.slate  },
    assigned:      { bg: '#F1F5F9',    color: C.slate  },
    preparing:     { bg: C.purpleLight,color: C.purple },
    picked_up:     { bg: C.blueLight,  color: C.blue   },
    on_the_way:    { bg: C.orangeLight,color: C.orange },
    delivered:     { bg: C.greenLight, color: C.green  },
    failed:        { bg: C.redLight,   color: C.red    },
    retry_pending: { bg: '#FFF7ED',    color: '#EA580C' },
  }[s] || { bg: '#F1F5F9', color: C.slate });

/* ─── Shared UI atoms ────────────────────────────────────────────────── */
const Badge = ({ label, bg, color }) => (
  <span style={{
    background: bg, color, fontSize: 11, fontWeight: 700,
    padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap',
  }}>
    {capitalize(label)}
  </span>
);

const Spinner = () => (
  <div style={{ textAlign: 'center', padding: 40, color: C.slate }}>
    <div style={{
      width: 32, height: 32, border: `3px solid ${C.border}`,
      borderTopColor: C.orange, borderRadius: '50%',
      animation: 'spin 0.8s linear infinite', display: 'inline-block',
    }} />
    <p style={{ marginTop: 10, fontSize: 13 }}>Loading…</p>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulseAlert{0%,100%{opacity:1}50%{opacity:.6}}`}</style>
  </div>
);

const Card = ({ children, style = {} }) => (
  <div style={{
    background: '#fff', borderRadius: 14, padding: 20,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)', ...style,
  }}>
    {children}
  </div>
);

const Btn = ({ children, onClick, color = C.orange, outline = false, small = false, disabled = false, style = {}, type = 'submit' }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    style={{
      background: outline ? 'transparent' : color,
      color: outline ? color : '#fff',
      border: `1.5px solid ${color}`,
      borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
      padding: small ? '5px 12px' : '9px 18px',
      fontSize: small ? 12 : 13, fontWeight: 600,
      opacity: disabled ? 0.5 : 1,
      transition: 'opacity 0.15s',
      ...style,
    }}
  >
    {children}
  </button>
);

/* ─── Google Maps live map ───────────────────────────────────────────── */
const BATCH_COLORS = [C.orange, '#8B5CF6', '#059669', '#DC2626', '#0EA5E9'];

const VendorLiveMap = ({ batches = [], riderLocations = {} }) => {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markersRef   = useRef([]);

  useEffect(() => {
    import('../../../utils/googleMaps').then(({ loadGoogleMaps }) => {
      loadGoogleMaps().then(() => {
        if (!containerRef.current || mapRef.current) return;
        mapRef.current = new window.google.maps.Map(containerRef.current, {
          center: { lat: 20.5937, lng: 78.9629 },
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        updateMarkers();
      });
    });
    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // Rider location markers (live — orange scooter dot)
    Object.entries(riderLocations).forEach(([riderId, loc]) => {
      if (!loc?.lat || !loc?.lng) return;
      const marker = new window.google.maps.Marker({
        position: { lat: loc.lat, lng: loc.lng },
        map,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: C.orange,
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
        title: loc.name || riderId,
        zIndex: 10,
      });
      const info = new window.google.maps.InfoWindow({
        content: `<b>🛵 Rider</b><br/>${loc.name || riderId}`,
      });
      marker.addListener('click', () => info.open(map, marker));
      markersRef.current.push(marker);
    });

    // Customer order markers per batch
    const bounds = new window.google.maps.LatLngBounds();
    let hasBounds = false;

    batches.forEach((batch, bi) => {
      const color = BATCH_COLORS[bi % BATCH_COLORS.length];
      (batch.orders || []).forEach((order) => {
        if (order.status === 'delivered') return;
        const addr = order.address || {};
        const lat = parseFloat(addr.latitude);
        const lng = parseFloat(addr.longitude);
        if (!lat || !lng) return;
        const marker = new window.google.maps.Marker({
          position: { lat, lng },
          map,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
          title: order.customerName || 'Customer',
        });
        const info = new window.google.maps.InfoWindow({
          content: `<b>${order.customerName || 'Customer'}</b><br/>${addr.area || ''}`,
        });
        marker.addListener('click', () => info.open(map, marker));
        markersRef.current.push(marker);
        bounds.extend({ lat, lng });
        hasBounds = true;
      });
    });

    if (hasBounds) map.fitBounds(bounds);
  }, [batches, riderLocations]);

  useEffect(() => { updateMarkers(); }, [updateMarkers]);

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
      <div ref={containerRef} style={{ height: 380, width: '100%' }} />
    </div>
  );
};

/* ─── Batch summary card (overview) ─────────────────────────────────── */
const BatchSummaryCard = ({ batch, riders = [], onAssign }) => {
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const { bg, color } = batchStatusStyle(batch.batchStatus);
  const done   = (batch.orders || []).filter((o) => o.status === 'delivered').length;
  const total  = (batch.orders || []).length;
  const pct    = total ? Math.round((done / total) * 100) : 0;
  const riderName = batch.riderId
    ? (riders.find((r) => r._id === batch.riderId || r._id === batch.riderId?._id)?.name || 'Assigned')
    : null;

  return (
    <Card style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1E293B' }}>
            {batch.area || `Batch #${(batch._id || '').slice(-5)}`}
          </div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>
            {total} orders · {done} delivered
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge label={batch.batchStatus} bg={bg} color={color} />
          {riderName && (
            <span style={{ fontSize: 12, color: C.blue }}>🛵 {riderName}</span>
          )}
        </div>
      </div>
      <div style={{ marginTop: 10, background: '#F1F5F9', borderRadius: 6, height: 6 }}>
        <div style={{ width: `${pct}%`, background: C.green, borderRadius: 6, height: '100%', transition: 'width 0.3s' }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: C.slate, textAlign: 'right' }}>{pct}%</div>
      {!['completed', 'in_progress'].includes(batch.batchStatus) && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={selectedRiderId}
            disabled={assigning}
            style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}
            onChange={(e) => setSelectedRiderId(e.target.value)}
          >
            <option value="" disabled>{assigning ? 'Assigning…' : (batch.riderId ? 'Reassign rider…' : 'Assign rider…')}</option>
            {riders.filter((r) => r.isActive !== false && r.isAvailable !== false).map((r) => (
              <option key={r._id} value={r._id}>{r.name}</option>
            ))}
          </select>
          <Btn
            small
            disabled={!selectedRiderId || assigning}
            onClick={async () => {
              setAssigning(true);
              try {
                await onAssign(batch._id, selectedRiderId);
                setSelectedRiderId('');
              } finally {
                setAssigning(false);
              }
            }}
          >
            {assigning ? 'Assigning…' : (batch.riderId ? 'Reassign' : 'Assign')}
          </Btn>
        </div>
      )}
    </Card>
  );
};

/* ─── Rider form modal ───────────────────────────────────────────────── */
const EMPTY_RIDER = {
  name: '', email: '', phone: '', password: '',
  monthlySalary: '', upiId: '',
};

const RiderFormModal = ({ rider, onClose, onSave }) => {
  const isEdit = !!rider?._id;
  const [form, setForm] = useState(
    rider
      ? {
          ...rider,
          password: '',
        }
      : { ...EMPTY_RIDER }
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        monthlySalary: Number(form.monthlySalary) || 0,
        upiId: form.upiId?.trim() || '',
      };
      if (!isEdit) payload.password = form.password;
      if (isEdit && form.newPassword?.trim()) payload.newPassword = form.newPassword.trim();
      if (isEdit) {
        await updateRider(rider._id, payload);
      } else {
        await addRider(payload);
      }
      onSave();
    } catch (e) {
      setErr(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
        {isEdit ? 'Edit Rider' : 'Add New Rider'}
      </h3>
      <form onSubmit={handleSubmit}>
        <FormRow label="Full Name">
          <input required value={form.name} onChange={(e) => set('name', e.target.value)} style={inputSt} placeholder="Rider name" />
        </FormRow>
        <FormRow label="Email">
          <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} style={inputSt} placeholder="rider@example.com" />
        </FormRow>
        <FormRow label="Phone">
          <input required value={form.phone} onChange={(e) => set('phone', e.target.value)} style={inputSt} placeholder="10-digit mobile" />
        </FormRow>
        {!isEdit && (
          <FormRow label="Password">
            <input required type="password" value={form.password} onChange={(e) => set('password', e.target.value)} style={inputSt} placeholder="Login password" />
          </FormRow>
        )}
        {isEdit && (
          <FormRow label="New Password">
            <input
              type="password"
              value={form.newPassword || ''}
              onChange={(e) => set('newPassword', e.target.value)}
              style={inputSt}
              placeholder="Leave blank to keep unchanged"
              minLength={6}
            />
            <p style={{ margin: '3px 0 0', fontSize: 11, color: C.slate }}>
              Min 6 characters · only fill if rider forgot their password
            </p>
          </FormRow>
        )}
        <FormRow label="Monthly Salary (₹)">
          <input required type="number" min="0" value={form.monthlySalary} onChange={(e) => set('monthlySalary', e.target.value)} style={inputSt} placeholder="e.g. 12000" />
        </FormRow>
        <FormRow label="UPI ID (for salary transfer)">
          <input value={form.upiId || ''} onChange={(e) => set('upiId', e.target.value)} style={inputSt} placeholder="e.g. 9925100001@ybl" />
        </FormRow>
        {err && <p style={{ color: C.red, fontSize: 12, margin: '4px 0 8px' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <Btn outline color={C.slate} onClick={onClose}>Cancel</Btn>
          <Btn disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Update Rider' : 'Add Rider'}</Btn>
        </div>
      </form>
    </Overlay>
  );
};

/* ─── Salary modal ───────────────────────────────────────────────────── */
const SalaryModal = ({ rider, onClose, onSave }) => {
  const [month,         setMonth]         = useState(currentMonth());
  const [amount,        setAmount]        = useState(rider?.monthlySalary || '');
  const [paymentMethod, setPaymentMethod] = useState('Razorpay');
  const [saving,        setSaving]        = useState(false);
  const [err,           setErr]           = useState('');

  const handleRazorpayPay = async () => {
    if (!month || !amount) { setErr('Month and amount are required.'); return; }
    setSaving(true); setErr('');
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) { setErr('Failed to load Razorpay checkout. Check your internet connection.'); setSaving(false); return; }

      const orderData = await createSalaryRazorpayOrder(rider._id, { month, amount: Number(amount) });

      const options = {
        key:         orderData.keyId,
        amount:      orderData.amount,
        currency:    orderData.currency,
        name:        'MealSetu',
        description: `Salary — ${orderData.riderName} (${month})`,
        order_id:    orderData.orderId,
        handler: async (response) => {
          try {
            await verifySalaryRazorpayPayment(rider._id, {
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              month,
              amount: orderData.amount,
            });
            onSave();
          } catch (e) {
            setErr('Payment verification failed: ' + (e.message || 'Unknown error'));
            setSaving(false);
          }
        },
        modal: { ondismiss: () => setSaving(false) },
        theme: { color: C.orange },
      };
      new window.Razorpay(options).open();
    } catch (e) {
      setErr(e.message || 'Failed to create payment order');
      setSaving(false);
    }
  };

  const handleCashSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      await markRiderSalaryPaid(rider._id, {
        month,
        amount:        Number(amount),
        paymentMethod: 'Cash',
        transactionRef: '',
      });
      onSave();
    } catch (e) {
      setErr(e.message || 'Failed to mark salary paid');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Mark Salary Paid</h3>
      <p style={{ color: C.slate, fontSize: 13, margin: '0 0 16px' }}>
        Salary payment for <strong>{rider.name}</strong>
      </p>
      <form onSubmit={paymentMethod === 'Cash' ? handleCashSubmit : (e) => e.preventDefault()}>
        <FormRow label="Month">
          <input required type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={inputSt} />
        </FormRow>
        <FormRow label="Amount (₹)">
          <input required type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputSt} />
        </FormRow>

        {/* Payment method toggle */}
        <FormRow label="Payment Method">
          <div style={{ display: 'flex', gap: 10 }}>
            {['Razorpay', 'Cash'].map(m => (
              <button key={m} type="button"
                onClick={() => { setPaymentMethod(m); setErr(''); }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  border: `2px solid ${paymentMethod === m ? (m === 'Razorpay' ? C.blue : C.green) : C.border}`,
                  background: paymentMethod === m ? (m === 'Razorpay' ? C.blueLight : C.greenLight) : '#fff',
                  color: paymentMethod === m ? (m === 'Razorpay' ? C.blue : C.green) : C.slate,
                }}
              >
                {m === 'Razorpay' ? '💳 Razorpay' : '💵 Cash'}
              </button>
            ))}
          </div>
        </FormRow>

        {/* Razorpay info */}
        {paymentMethod === 'Razorpay' && (
          <div style={{ background: C.blueLight, border: `1px solid #BFDBFE`, borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13, color: C.blue }}>
             Opens secure Razorpay popup — pay via card, UPI, netbanking, or wallet.
          </div>
        )}

        {err && <p style={{ color: C.red, fontSize: 12, margin: '4px 0 8px' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <Btn outline color={C.slate} onClick={onClose} type="button">Cancel</Btn>
          {paymentMethod === 'Razorpay' ? (
            <button type="button" onClick={handleRazorpayPay} disabled={saving} style={{
              background: saving ? '#93C5FD' : C.blue, color: '#fff',
              border: 'none', borderRadius: 8, padding: '9px 18px',
              fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            }}>
              {saving ? 'Opening…' : ` Pay ₹${amount} via Razorpay`}
            </button>
          ) : (
            <Btn color={C.green} disabled={saving}>{saving ? 'Processing…' : '✓ Mark as Paid (Cash)'}</Btn>
          )}
        </div>
      </form>
    </Overlay>
  );
};

/* ─── Rider card ─────────────────────────────────────────────────────── */
const RiderCard = ({ rider, onEdit, onDelete, onMarkPaid }) => {
  const initial    = rider.name?.[0]?.toUpperCase() || 'R';
  const isAvail    = rider.isAvailable !== false;
  const salaryPaid = rider.salaryStatus === 'paid';

  return (
    <Card style={{ overflow: 'hidden', padding: 0 }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${C.orange}, #FF8C42)`,
        padding: '20px 16px 16px',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700, color: '#fff', position: 'relative',
          }}>
            {initial}
            <div style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 14, height: 14, borderRadius: '50%',
              background: isAvail ? C.green : C.slate,
              border: '2px solid #fff',
            }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>{rider.name}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
               Delivery Rider
            </div>
          </div>
        </div>
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <span style={{
            background: salaryPaid ? C.greenLight : '#FFF7ED',
            color: salaryPaid ? C.green : '#EA580C',
            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
          }}>
            {salaryPaid ? '✓ Paid' : '⏳ Pending'}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: 16 }}>
        {rider.phone && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: C.blue }}>📞</span>
            <span style={{ fontSize: 13, color: '#1E293B' }}>{rider.phone}</span>
          </div>
        )}
        {rider.email && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13 }}>✉️</span>
            <span style={{ fontSize: 12, color: C.slate, wordBreak: 'break-all' }}>{rider.email}</span>
          </div>
        )}

        {/* Salary */}
        <div style={{
          background: C.greenLight, borderRadius: 10, padding: '10px 12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 10,
        }}>
          <div>
            <div style={{ fontSize: 11, color: C.slate }}>Monthly Salary</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1E293B' }}>
              {fmtCurrency(rider.monthlySalary)}
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.green }}>Fixed</span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Btn small outline color={C.blue} onClick={() => onEdit(rider)}>Edit</Btn>
          {!salaryPaid && (
            <Btn small color={C.green} onClick={() => onMarkPaid(rider)}>Mark Paid</Btn>
          )}
          <Btn small outline color={C.red} onClick={() => onDelete(rider)}>Remove</Btn>
        </div>
      </div>
    </Card>
  );
};

/* ─── Detailed batch card ────────────────────────────────────────────── */
const DetailedBatchCard = ({ batch, riders = [], onAssign }) => {
  const [expanded,   setExpanded]   = useState(false);
  const [assigning,  setAssigning]  = useState(false);
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [photoModal, setPhotoModal] = useState(null);
  const { bg, color } = batchStatusStyle(batch.batchStatus);
  const done       = (batch.orders || []).filter((o) => o.status === 'delivered').length;
  const retryCount = (batch.orders || []).filter((o) => o.status === 'retry_pending').length;
  const total      = (batch.orders || []).length;
  const pct        = total ? Math.round((done / total) * 100) : 0;

  const riderName = (() => {
    if (!batch.riderId) return null;
    if (typeof batch.riderId === 'object' && batch.riderId.name) return batch.riderId.name;
    const id = typeof batch.riderId === 'object' ? batch.riderId._id : batch.riderId;
    return riders.find((r) => String(r._id) === String(id))?.name || 'Assigned';
  })();

  const handleAssign = async (riderId) => {
    if (!riderId) return;
    setAssigning(true);
    try { await onAssign(batch._id, riderId); }
    finally { setAssigning(false); }
  };

  return (
    <Card style={{ marginBottom: 12 }}>
      {/* Header row */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer', flexWrap: 'wrap', gap: 8 }}
        onClick={() => setExpanded((p) => !p)}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1E293B' }}>
            {batch.area || `Batch #${(batch._id || '').slice(-5)}`}
          </div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>
            {total} orders · {done} delivered
            {retryCount > 0 && (
              <span style={{ color: '#EA580C', marginLeft: 8, fontWeight: 700 }}>
                ·  {retryCount} retry pending
              </span>
            )}
            {riderName && <span style={{ color: C.blue, marginLeft: 8 }}>·  {riderName}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge label={batch.batchStatus} bg={bg} color={color} />
          <span style={{ fontSize: 14, color: C.slate }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 10, background: '#F1F5F9', borderRadius: 6, height: 6 }}>
        <div style={{ width: `${pct}%`, background: C.green, borderRadius: 6, height: '100%', transition: 'width 0.3s' }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: C.slate, textAlign: 'right' }}>{pct}% complete</div>

      {/* Assign rider (if unassigned or reassignable before delivery start) */}
      {!['completed', 'in_progress'].includes(batch.batchStatus) && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={selectedRiderId}
            disabled={assigning}
            style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}
            onChange={(e) => setSelectedRiderId(e.target.value)}
          >
            <option value="" disabled>{assigning ? 'Assigning…' : (batch.riderId ? 'Reassign rider…' : 'Assign rider…')}</option>
            {riders.filter((r) => r.isActive !== false && r.isAvailable !== false).map((r) => (
              <option key={r._id} value={r._id}>{r.name}</option>
            ))}
          </select>
          <Btn
            small
            disabled={!selectedRiderId || assigning}
            onClick={async () => {
              await handleAssign(selectedRiderId);
              setSelectedRiderId('');
            }}
          >
            {assigning ? 'Assigning…' : (batch.riderId ? 'Reassign' : 'Assign')}
          </Btn>
        </div>
      )}

      {/* Expanded order list */}
      {expanded && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          {(batch.orders || []).length === 0 ? (
            <p style={{ color: C.slate, fontSize: 13, textAlign: 'center', padding: 12 }}>No orders in this batch.</p>
          ) : (
            (batch.orders || []).map((order, idx) => {
              const { bg: oBg, color: oColor } = orderStatusStyle(order.status);
              const addr = order.address || {};
              return (
                <div key={order.orderId || idx} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  padding: '10px 0', borderBottom: idx < batch.orders.length - 1 ? `1px solid ${C.border}` : 'none',
                }}>
                  {/* Sequence circle */}
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: order.status === 'delivered' ? C.green
                      : order.status === 'retry_pending' ? '#EA580C'
                      : order.status === 'on_the_way' ? C.orange
                      : order.status === 'picked_up' ? C.blue
                      : order.status === 'failed' ? C.red : '#CBD5E1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: '#fff',
                  }}>
                    {order.status === 'retry_pending' ? '↺' : (order.sequence || idx + 1)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
                      {order.customerName || `Customer #${idx + 1}`}
                    </div>
                    <div style={{ fontSize: 12, color: C.slate, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {[addr.flatHouseNo, addr.street, addr.area].filter(Boolean).join(', ') || addr.fullAddress || 'Address not available'}
                    </div>
                    {order.phone && (
                      <a href={`tel:${order.phone}`} style={{ fontSize: 12, color: C.blue, textDecoration: 'none' }}>
                        📞 {order.phone}
                      </a>
                    )}
                    {order.status === 'retry_pending' && order.failReason && (
                      <div style={{ fontSize: 11, color: '#EA580C', marginTop: 3 }}>
                         {order.failReason} · attempt {order.retryCount || 1}/2
                      </div>
                    )}
                  </div>
                  <Badge label={order.status === 'retry_pending' ? '🔄 Retry' : (order.status || 'pending')} bg={oBg} color={oColor} />
                  {order.proofPhotoUrl && (
                    <button
                      title="View delivery proof photo"
                      onClick={(e) => { e.stopPropagation(); setPhotoModal(order.proofPhotoUrl); }}
                      style={{
                        background: 'none', border: '1px solid #e2e8f0', borderRadius: 6,
                        cursor: 'pointer', padding: 2, flexShrink: 0,
                        width: 32, height: 32, overflow: 'hidden',
                      }}
                    >
                      <img
                        src={order.proofPhotoUrl}
                        alt="Proof"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                      />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Proof photo lightbox */}
      {photoModal && (
        <div
          onClick={() => setPhotoModal(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 16,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', textAlign: 'center' }}>
            <img
              src={photoModal}
              alt="Delivery proof"
              style={{ maxWidth: '90vw', maxHeight: '78vh', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            />
            <button
              onClick={() => setPhotoModal(null)}
              style={{
                position: 'absolute', top: -14, right: -14,
                width: 32, height: 32, borderRadius: '50%',
                background: 'white', border: 'none', cursor: 'pointer',
                fontSize: 16, fontWeight: 700, lineHeight: '32px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              }}
            >✕</button>
            <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
              📷 Delivery Proof · Click outside or ✕ to close
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

/* ─── Overlay / modal wrapper ────────────────────────────────────────── */
const Overlay = ({ children, onClose }) => (
  <div
    onClick={onClose}
    style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: '#fff', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 460,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        maxHeight: '90vh', overflowY: 'auto',
      }}
    >
      {children}
    </div>
  </div>
);

/* ─── Form helpers ───────────────────────────────────────────────────── */
const inputSt = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: `1px solid ${C.border}`, fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
};
const FormRow = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
      {label}
    </label>
    {children}
  </div>
);

/* ─── Stat chip ──────────────────────────────────────────────────────── */
const StatChip = ({ label, value, bg, color }) => (
  <div style={{
    background: bg, borderRadius: 12, padding: '14px 18px',
    display: 'flex', flexDirection: 'column', gap: 4,
    minWidth: 100,
  }}>
    <span style={{ fontSize: 22, fontWeight: 800, color }}>{value}</span>
    <span style={{ fontSize: 12, color: C.slate }}>{label}</span>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════
   TAB: Overview
═══════════════════════════════════════════════════════════════════════ */
const OverviewTab = ({ riders = [] }) => {
  const { addToast } = useToast();
  const [mealSlot, setMealSlot]     = useState('lunch');
  const [batches, setBatches]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [todayStats, setTodayStats] = useState(null);
  const [riderLocs, setRiderLocs]   = useState({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [batchRes, ordersRes] = await Promise.allSettled([
        getDeliveryBatches(todayStr(), mealSlot),
        getTodayOrders(),
      ]);
      if (batchRes.status === 'fulfilled') setBatches(Array.isArray(batchRes.value) ? batchRes.value : (batchRes.value?.batches || []));
      if (ordersRes.status === 'fulfilled') setTodayStats(ordersRes.value);
    } finally {
      setLoading(false);
    }
  }, [mealSlot]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Pre-load last known rider positions on mount, then keep live via socket
  useEffect(() => {
    getLiveRiderLocations().then((list) => {
      if (!Array.isArray(list)) return;
      const seed = {};
      for (const r of list) {
        if (r.location?.latitude && r.location?.longitude) {
          seed[r.riderId] = { lat: r.location.latitude, lng: r.location.longitude, name: r.name };
        }
      }
      setRiderLocs(seed);
    }).catch(() => {});
  }, []);

  // Live rider locations via socket
  useEffect(() => {
    const handler = (data) => {
      if (data?.riderId && data?.latitude && data?.longitude) {
        setRiderLocs((prev) => ({
          ...prev,
          [data.riderId]: { lat: data.latitude, lng: data.longitude, name: data.riderName },
        }));
      }
    };
    onEvent('rider_location_update', handler);
    return () => offEvent('rider_location_update', handler);
  }, []);

  const handleAssign = async (batchId, riderId) => {
    try {
      await assignBatchToRider(batchId, riderId);
      await fetchData();
      addToast('Rider assigned successfully.', 'success');
    } catch (e) {
      addToast('Assign failed: ' + e.message, 'error');
    }
  };

  const totalOrders    = batches.reduce((s, b) => s + (b.orders?.length || 0), 0);
  const deliveredOrders = batches.reduce((s, b) => s + (b.orders || []).filter((o) => o.status === 'delivered').length, 0);
  const activeBatches  = batches.filter((b) => b.batchStatus === 'in_progress').length;
  const pendingBatches = batches.filter((b) => b.batchStatus === 'pending' || b.batchStatus === 'assigned').length;

  return (
    <div>
      {/* Meal slot selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['lunch', 'dinner'].map((slot) => (
          <button
            key={slot}
            onClick={() => setMealSlot(slot)}
            style={{
              padding: '7px 20px', borderRadius: 20, border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: mealSlot === slot ? C.orange : '#F1F5F9',
              color: mealSlot === slot ? '#fff' : C.slate,
              transition: 'all 0.2s',
            }}
          >
            {slot === 'lunch' ? ' Lunch' : ' Dinner'}
          </button>
        ))}
        <Btn small outline color={C.blue} onClick={fetchData} style={{ marginLeft: 'auto' }}>↺ Refresh</Btn>
      </div>

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatChip label="Total Orders"  value={totalOrders}     bg={C.blueLight}   color={C.blue}   />
        <StatChip label="Delivered"     value={deliveredOrders} bg={C.greenLight}  color={C.green}  />
        <StatChip label="Active Batches" value={activeBatches}  bg={C.orangeLight} color={C.orange} />
        <StatChip label="Pending"        value={pendingBatches} bg='#F1F5F9'       color={C.slate}  />
        <StatChip label="Riders"         value={riders.length}  bg={C.purpleLight} color={C.purple} />
      </div>

      {/* Map + batch list side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
            📍 Live Delivery Map
          </h4>
          <VendorLiveMap batches={batches} riderLocations={riderLocs} />
        </div>
        <div>
          <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
            📦 Today's Batches
          </h4>
          {loading ? <Spinner /> : batches.length === 0 ? (
            <Card>
              <p style={{ color: C.slate, textAlign: 'center', fontSize: 13, margin: 0 }}>
                No batches for {mealSlot} today. Create them in the Batches tab.
              </p>
            </Card>
          ) : (
            batches.map((b) => (
              <BatchSummaryCard key={b._id} batch={b} riders={riders} onAssign={handleAssign} />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   TAB: Riders
═══════════════════════════════════════════════════════════════════════ */
const RidersTab = ({ riders, loading, onRefresh }) => {
  const [showForm,   setShowForm]   = useState(false);
  const [editRider,  setEditRider]  = useState(null);
  const [salaryRider, setSalaryRider] = useState(null);

  const handleDelete = async (rider) => {
    if (!window.confirm(`Remove ${rider.name} from your team?`)) return;
    try {
      await deleteRider(rider._id);
      onRefresh();
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1E293B' }}>My Riders</h3>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: C.slate }}>{riders.length} team member{riders.length !== 1 ? 's' : ''}</p>
        </div>
        <Btn onClick={() => { setEditRider(null); setShowForm(true); }}>+ Add Rider</Btn>
      </div>

      {loading ? <Spinner /> : riders.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🛵</div>
          <p style={{ color: C.slate, fontSize: 14 }}>No riders yet. Add your first rider to get started.</p>
          <Btn onClick={() => { setEditRider(null); setShowForm(true); }}>Add First Rider</Btn>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {riders.map((r) => (
            <RiderCard
              key={r._id}
              rider={r}
              onEdit={(rider) => { setEditRider(rider); setShowForm(true); }}
              onDelete={handleDelete}
              onMarkPaid={(rider) => setSalaryRider(rider)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <RiderFormModal
          rider={editRider}
          onClose={() => { setShowForm(false); setEditRider(null); }}
          onSave={() => { setShowForm(false); setEditRider(null); onRefresh(); }}
        />
      )}
      {salaryRider && (
        <SalaryModal
          rider={salaryRider}
          onClose={() => setSalaryRider(null)}
          onSave={() => { setSalaryRider(null); onRefresh(); }}
        />
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   TAB: Batches
═══════════════════════════════════════════════════════════════════════ */
const BatchesTab = ({ riders = [] }) => {
  const { addToast } = useToast();
  const [date, setDate]             = useState(todayStr());
  const [mealSlot, setMealSlot]     = useState('lunch');
  const [batches, setBatches]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [creating, setCreating]     = useState(false);
  const [msg, setMsg]               = useState({ text: '', ok: true });
  const [pendingOrders, setPending]     = useState(null);
  const [newOrderAlert, setNewOrderAlert] = useState(0); // new orders arrived since last batch
  const [retryOrders, setRetryOrders]   = useState([]);
  const [retryExpanded, setRetryExpanded] = useState(false);
  const [failedOrders, setFailedOrders]   = useState([]);
  const [failedExpanded, setFailedExpanded] = useState(false);
  const [resolvingOrder, setResolvingOrder] = useState({}); // { [orderId]: true }

  const fetchBatches = useCallback(async () => {
    setLoading(true); setMsg({ text: '', ok: true });
    try {
      const res = await getDeliveryBatches(date, mealSlot);
      setBatches(Array.isArray(res) ? res : (res?.batches || []));
    } catch (e) {
      setMsg({ text: 'Failed to load batches: ' + e.message, ok: false });
    } finally {
      setLoading(false);
    }
  }, [date, mealSlot]);

  // Also fetch today's orders count to show preview
  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await getTodayOrders();
      const count = Array.isArray(res) ? res.length : (res?.total ?? res?.orders?.length ?? null);
      setPending(count);
    } catch {
      setPending(null);
    }
  }, []);

  useEffect(() => {
    fetchBatches();
    if (date === todayStr()) fetchPendingCount();
    else setPending(null);
  }, [fetchBatches, fetchPendingCount, date]);

  useEffect(() => {
    getRetryOrders().then((res) => {
      setRetryOrders(Array.isArray(res?.retryOrders) ? res.retryOrders : []);
    }).catch(() => {});
    getFailedDeliveries().then((res) => {
      setFailedOrders(Array.isArray(res?.failedOrders) ? res.failedOrders : []);
    }).catch(() => {});
  }, [batches]); // re-check whenever batches refresh

  // Real-time: vendor gets notified when a new order arrives
  useEffect(() => {
    const handler = () => {
      if (date === todayStr()) {
        setNewOrderAlert((n) => n + 1);
        fetchPendingCount();
      }
    };
    onEvent('new_order_placed', handler);
    return () => offEvent('new_order_placed', handler);
  }, [date, fetchPendingCount]);

  const handleAutoCreate = async () => {
    setCreating(true); setMsg({ text: '', ok: true });
    try {
      // Send batchDate (what backend expects) alongside legacy `date` key
      const res = await createDeliveryBatches({ batchDate: date, date, mealSlot });
      const count = res?.batches?.length ?? res?.batchCount ?? 0;
      if (count === 0) {
        setMsg({ text: ' No active orders found for this date. Make sure orders exist and are not already batched.', ok: false });
      } else {
        setMsg({ text: ` ${count} batch${count !== 1 ? 'es' : ''} created successfully!`, ok: true });
        setNewOrderAlert(0);
        fetchBatches();
        fetchPendingCount();
      }
    } catch (e) {
      setMsg({ text: ' ' + (e.message || 'Create failed'), ok: false });
    } finally {
      setCreating(false);
    }
  };

  const handleAssign = async (batchId, riderId) => {
    try {
      await assignBatchToRider(batchId, riderId);
      await fetchBatches();
      addToast('Rider assigned successfully.', 'success');
    } catch (e) {
      addToast('Assign failed: ' + e.message, 'error');
    }
  };

  const handleResolveFailure = async (orderId, action) => {
    setResolvingOrder((prev) => ({ ...prev, [orderId]: true }));
    try {
      await resolveFailedDeliveryOrder(orderId, action);
      setFailedOrders((prev) =>
        prev.map((o) =>
          o._id === orderId
            ? { ...o, failureResolution: { action, resolvedAt: new Date().toISOString() } }
            : o
        )
      );
    } catch (e) {
      alert('Could not resolve: ' + e.message);
    } finally {
      setResolvingOrder((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const isToday = date === todayStr();

  return (
    <div>
      {/* Controls */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.slate, display: 'block', marginBottom: 4 }}>
              Date {date !== todayStr() && <span style={{ color: C.blue, fontWeight: 700 }}>📋 View only</span>}
            </label>
            <input
              type="date"
              value={date}
              max={todayStr()}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...inputSt, width: 160 }}
            />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.slate, display: 'block', marginBottom: 4 }}>Meal Slot</label>
            <select value={mealSlot} onChange={(e) => setMealSlot(e.target.value)} style={{ ...inputSt, width: 130 }}>
              <option value="lunch"> Lunch</option>
              <option value="dinner"> Dinner</option>
            </select>
          </div>
          <Btn onClick={fetchBatches} outline color={C.blue}> Fetch</Btn>
          <Btn onClick={handleAutoCreate} disabled={creating || date !== todayStr()} color={C.orange}
            title={date !== todayStr() ? 'Batches can only be created for today' : ''}>
            {creating ? 'Creating…' : ' Auto-Create Batches'}
          </Btn>
        </div>

        {/* Past date notice */}
        {!isToday && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8,
            background: '#FFF7ED', border: `1px solid #FED7AA`, fontSize: 13, color: '#C2410C',
          }}>
             Viewing past batches — Auto-Create is only available for today's date.
          </div>
        )}

        {/* New order arrived alert — pulsing orange banner */}
        {isToday && newOrderAlert > 0 && (
          <div style={{
            marginTop: 12, padding: '12px 16px', borderRadius: 8,
            background: C.orangeLight, border: `2px solid ${C.orange}`,
            fontSize: 13, color: C.orange, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 10,
            animation: 'pulseAlert 1.5s ease-in-out infinite',
          }}>
            <span style={{ fontSize: 18 }}></span>
            <span>
              {newOrderAlert} new order{newOrderAlert !== 1 ? 's' : ''} arrived since last batch!
              {' '}Click <strong> Auto-Create Batches</strong> to include {newOrderAlert !== 1 ? 'them' : 'it'}.
            </span>
            <button onClick={() => setNewOrderAlert(0)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: C.orange }}>
              ✕
            </button>
          </div>
        )}

        {/* Today's unbatched orders count — always visible when on today's view */}
        {isToday && pendingOrders !== null && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8,
            background: pendingOrders > 0 ? C.blueLight : C.slateLight,
            border: `1px solid ${pendingOrders > 0 ? '#BFDBFE' : C.border}`,
            fontSize: 13,
            color: pendingOrders > 0 ? C.blue : C.slate,
          }}>
            {pendingOrders > 0
              ? ` ${pendingOrders} active order${pendingOrders !== 1 ? 's' : ''} for today (${batches.length > 0 ? 'some may already be batched' : 'not yet batched'}).`
              : ' No active orders found for today yet.'}
          </div>
        )}

        {msg.text && (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: msg.ok ? C.green : C.red }}>
            {msg.text}
          </p>
        )}
      </Card>

      {/* Retry queue banner */}
      {retryOrders.length > 0 && (
        <Card style={{ marginBottom: 16, border: `2px solid #EA580C`, background: '#FFF7ED' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            onClick={() => setRetryExpanded((p) => !p)}
          >
            <span style={{ fontSize: 20 }}></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#9A3412' }}>
                {retryOrders.length} order{retryOrders.length !== 1 ? 's' : ''} awaiting re-attempt
              </div>
              <div style={{ fontSize: 12, color: '#EA580C' }}>
                Riders marked these as failed — re-attempt in progress or pending
              </div>
            </div>
            <span style={{ fontSize: 14, color: '#EA580C' }}>{retryExpanded ? '▲' : '▼'}</span>
          </div>
          {retryExpanded && (
            <div style={{ marginTop: 12, borderTop: '1px solid #FED7AA', paddingTop: 10 }}>
              {retryOrders.map((o, i) => {
                const u = o.userId || {};
                return (
                  <div key={o._id || i} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '8px 0', borderBottom: i < retryOrders.length - 1 ? '1px solid #FED7AA' : 'none',
                  }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      background: '#EA580C', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 700,
                    }}>
                      {o.retryCount || 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#9A3412' }}>
                        {o.customerName || u.name || 'Customer'}
                      </div>
                      {o.deliveryRiderId?.name && (
                        <div style={{ fontSize: 11, color: C.slate }}>
                           {o.deliveryRiderId.name}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#EA580C', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      Attempt {o.retryCount || 1}/2
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Failed deliveries — needs vendor action */}
      {failedOrders.length > 0 && (
        <Card style={{ marginBottom: 16, border: `2px solid #DC2626`, background: '#FEF2F2' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            onClick={() => setFailedExpanded((p) => !p)}
          >
            <span style={{ fontSize: 20 }}></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#991B1B' }}>
                {failedOrders.filter((o) => !o.failureResolution?.action).length} failed deliver{failedOrders.filter((o) => !o.failureResolution?.action).length !== 1 ? 'ies' : 'y'} need{failedOrders.filter((o) => !o.failureResolution?.action).length === 1 ? 's' : ''} your action
              </div>
              <div style={{ fontSize: 12, color: '#DC2626' }}>
                2 attempts failed — decide whether to compensate the customer
              </div>
            </div>
            <span style={{ fontSize: 14, color: '#DC2626' }}>{failedExpanded ? '▲' : '▼'}</span>
          </div>
          {failedExpanded && (
            <div style={{ marginTop: 12, borderTop: '1px solid #FECACA', paddingTop: 10 }}>
              {failedOrders.map((o, i) => {
                const u = o.userId || {};
                const resolved = o.failureResolution?.action;
                const isResolving = resolvingOrder[o._id];
                return (
                  <div key={o._id || i} style={{
                    padding: '10px 0',
                    borderBottom: i < failedOrders.length - 1 ? '1px solid #FECACA' : 'none',
                  }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                        background: '#DC2626', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 700,
                      }}>
                        2
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#991B1B' }}>
                          {o.customerName || u.name || 'Customer'}
                        </div>
                        <div style={{ fontSize: 11, color: '#DC2626', marginTop: 2 }}>
                          {u.address?.fullAddress || u.address?.area || (typeof o.deliveryAddress === 'string' ? o.deliveryAddress : '') || ''}
                        </div>
                        {o.deliveryRiderId?.name && (
                          <div style={{ fontSize: 11, color: C.slate, marginTop: 1 }}>
                             Rider: {o.deliveryRiderId.name}
                          </div>
                        )}
                        {o.lastFailureReason && (
                          <div style={{ fontSize: 11, color: C.slate, marginTop: 1 }}>
                            Reason: {o.lastFailureReason}
                          </div>
                        )}
                      </div>
                    </div>
                    {resolved ? (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                        background: resolved === 'compensated' ? '#D1FAE5' : '#F1F5F9',
                        color: resolved === 'compensated' ? '#065F46' : C.slate,
                      }}>
                        {resolved === 'compensated' ? ' +1 Meal Compensated' : ' Customer Absent — No Action'}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          disabled={isResolving}
                          onClick={() => handleResolveFailure(o._id, 'compensated')}
                          style={{
                            padding: '6px 14px', borderRadius: 8, border: 'none', cursor: isResolving ? 'not-allowed' : 'pointer',
                            background: '#059669', color: '#fff', fontSize: 12, fontWeight: 600,
                            opacity: isResolving ? 0.6 : 1,
                          }}
                        >
                          Rider's Mistake — Give +1 Meal
                        </button>
                        <button
                          disabled={isResolving}
                          onClick={() => handleResolveFailure(o._id, 'no_action')}
                          style={{
                            padding: '6px 14px', borderRadius: 8, border: '1px solid #CBD5E1', cursor: isResolving ? 'not-allowed' : 'pointer',
                            background: '#fff', color: C.slate, fontSize: 12, fontWeight: 600,
                            opacity: isResolving ? 0.6 : 1,
                          }}
                        >
                           Customer Absent — No Action
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Batch list */}
      {loading ? <Spinner /> : batches.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📦</div>
          <p style={{ color: C.slate, fontSize: 14, marginBottom: 8 }}>
            No batches created yet for this date.
          </p>
          <p style={{ color: C.slate, fontSize: 12 }}>
            Click <strong style={{ color: C.orange }}> Auto-Create Batches</strong> above to group today's active orders by area.
          </p>
        </Card>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: C.slate, marginBottom: 12 }}>
            {batches.length} batch{batches.length !== 1 ? 'es' : ''} · {batches.reduce((s, b) => s + (b.orders?.length || 0), 0)} total orders
          </p>
          {batches.map((b) => (
            <DetailedBatchCard key={b._id} batch={b} riders={riders} onAssign={handleAssign} />
          ))}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   TAB: Financials
═══════════════════════════════════════════════════════════════════════ */
const FinancialsTab = ({ riders = [] }) => {
  const [month, setMonth]         = useState(currentMonth());
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [salaryRider, setSalaryRider] = useState(null);
  const [refreshKey, setRefreshKey]   = useState(0);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await getDeliveryFinancials(month);
        setData(res);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [month, refreshKey]);

  const totalBudget   = riders.reduce((s, r) => s + (r.monthlySalary || 0), 0);
  const salaryRecords = data?.salaryRecords || [];
  const totalPaid     = salaryRecords.reduce((a, s) => a + (s.amount || 0), 0);
  const totalPending  = Math.max(0, totalBudget - totalPaid);

  return (
    <div>
      {/* Month picker */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.slate, display: 'block', marginBottom: 4 }}>Month</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inputSt, width: 180 }} />
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Card style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>Total Budget</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1E293B' }}>{fmtCurrency(totalBudget)}</div>
        </Card>
        <Card style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>Total Paid</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.green }}>{fmtCurrency(totalPaid)}</div>
        </Card>
        <Card style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>Pending</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: totalPending > 0 ? '#EA580C' : C.green }}>
            {fmtCurrency(totalPending > 0 ? totalPending : 0)}
          </div>
        </Card>
        <Card style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>Riders</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.purple }}>{riders.length}</div>
        </Card>
      </div>

      {/* Rider salary table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1E293B' }}>Rider Salary Status</h4>
        </div>
        {loading ? <Spinner /> : riders.length === 0 ? (
          <p style={{ padding: 24, color: C.slate, textAlign: 'center', fontSize: 13 }}>
            No riders added yet.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.slateLight }}>
                  {['Rider', 'Phone', 'Monthly Salary', 'Status', 'Paid Amount', 'Method', 'Action'].map((h) => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: C.slate, whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {riders.map((rider, idx) => {
                  const record    = salaryRecords.find((s) =>
                    s.riderId?.toString() === rider._id?.toString()
                  );
                  const riderUpiId = record?.upiId || rider.upiId || '';
                  const paid   = record?.status === 'paid';
                  return (
                    <tr key={rider._id} style={{ borderBottom: `1px solid ${C.border}`, background: idx % 2 === 0 ? '#fff' : C.slateLight }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#1E293B' }}>{rider.name}</div>
                        <div style={{ fontSize: 11, color: C.slate }}>Delivery Rider</div>
                      </td>
                      <td style={{ padding: '12px 16px', color: C.slate }}>{rider.phone || '—'}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1E293B' }}>{fmtCurrency(rider.monthlySalary)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          background: paid ? C.greenLight : '#FFF7ED',
                          color: paid ? C.green : '#EA580C',
                          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 12,
                        }}>
                          {paid ? '✓ Paid' : ' Pending'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: paid ? C.green : C.slate }}>
                        {paid ? fmtCurrency(record?.amount) : '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {paid ? (() => {
                          const m = record?.paymentMethod;
                          const badge = m === 'UPI'
                            ? { bg: '#EDE9FE', color: '#7C3AED', label: '📲 UPI' }
                            : m === 'Razorpay'
                            ? { bg: C.blueLight, color: C.blue, label: '💳 Razorpay' }
                            : { bg: '#F0FDF4', color: C.green, label: '💵 Cash' };
                          return (
                            <div>
                              <span style={{ background: badge.bg, color: badge.color, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 10 }}>
                                {badge.label}
                              </span>
                              {record?.transactionRef && (
                                <div style={{ fontSize: 10, color: C.slate, marginTop: 3 }}>
                                  Txn: {record.transactionRef}
                                </div>
                              )}
                            </div>
                          );
                        })() : '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {!paid && (
                          <Btn small color={C.green} onClick={() => setSalaryRider({ ...rider, upiId: riderUpiId })}>Mark Paid</Btn>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {salaryRider && (
        <SalaryModal
          rider={salaryRider}
          onClose={() => setSalaryRider(null)}
          onSave={() => { setSalaryRider(null); setRefreshKey((k) => k + 1); }}
        />
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   TAB: Analytics
═══════════════════════════════════════════════════════════════════════ */

const RateBar = ({ label, rate, color }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
      <span style={{ color: C.slate }}>{label}</span>
      <span style={{ fontWeight: 700, color }}>{rate}%</span>
    </div>
    <div style={{ height: 8, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(rate, 100)}%`, background: color, borderRadius: 4, transition: 'width 0.6s' }} />
    </div>
  </div>
);

const DailyTrendChart = ({ trend = [] }) => {
  if (!trend.length) return null;
  const maxVal = Math.max(...trend.map((d) => d.total || 0), 1);
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = todayStr();

  return (
    <Card style={{ padding: 20, marginBottom: 16 }}>
      <h4 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
         7-Day Delivery Trend
      </h4>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 150 }}>
        {trend.map((day, i) => {
          const d           = new Date(day.date + 'T00:00:00');
          const isToday     = day.date === today;
          const deliveredPct = (day.delivered / maxVal) * 100;
          const failedPct    = (day.failed    / maxVal) * 100;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
              {/* Delivered count */}
              <span style={{ fontSize: 10, fontWeight: 700, color: isToday ? C.orange : C.blue, marginBottom: 2 }}>
                {day.delivered || 0}
              </span>
              {/* Bar container */}
              <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: '#F1F5F9', borderRadius: '4px 4px 0 0', overflow: 'hidden', position: 'relative' }}>
                {failedPct > 0 && (
                  <div style={{ width: '100%', height: `${failedPct}%`, background: C.red, opacity: 0.75 }} />
                )}
                <div style={{
                  width: '100%',
                  height: `${deliveredPct}%`,
                  background: isToday ? C.orange : C.green,
                  transition: 'height 0.5s',
                }} />
              </div>
              {/* Day label */}
              <div style={{ textAlign: 'center', marginTop: 4 }}>
                <div style={{ fontSize: 10, fontWeight: isToday ? 700 : 500, color: isToday ? C.orange : C.slate }}>
                  {DAY_LABELS[d.getDay()]}
                </div>
                <div style={{ fontSize: 9, color: '#94A3B8' }}>
                  {d.getDate()}/{d.getMonth() + 1}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        {[
          { bg: C.green,  label: 'Delivered' },
          { bg: C.red,    label: 'Failed'    },
          { bg: C.orange, label: 'Today'     },
        ].map(({ bg, label }) => (
          <span key={label} style={{ fontSize: 11, color: C.slate, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, background: bg, borderRadius: 2 }} />
            {label}
          </span>
        ))}
      </div>
    </Card>
  );
};

const AttendanceCalendar = ({ riderData, monthStr }) => {
  if (!riderData || !monthStr) return null;
  const [year, mon] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const firstDay    = new Date(year, mon - 1, 1).getDay();
  const today       = todayStr();

  const statusMap = {};
  for (const rec of riderData.attendance || []) {
    statusMap[rec.date] = rec.status;
  }

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const cells = [];

  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`pad-${i}`} />);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr  = `${monthStr}-${String(d).padStart(2, '0')}`;
    const status   = statusMap[dateStr];
    const isFuture = dateStr > today;
    const isToday  = dateStr === today;

    let bg = '#F1F5F9'; let textColor = C.slate; let icon = '';
    if (isFuture)              { bg = '#F8FAFC';  textColor = '#CBD5E1'; }
    else if (status === 'present')  { bg = '#D1FAE5'; textColor = C.green;   icon = '✓'; }
    else if (status === 'half_day') { bg = '#FEF3C7'; textColor = '#D97706'; icon = '½'; }
    else if (status === 'absent')   { bg = '#FEE2E2'; textColor = C.red;     icon = '✕'; }

    cells.push(
      <div key={d} title={dateStr} style={{
        background:    bg,
        borderRadius:  6,
        padding:       '4px 2px',
        textAlign:     'center',
        border:        isToday ? `2px solid ${C.orange}` : '2px solid transparent',
        minHeight:     38,
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        justifyContent:'center',
        gap:           1,
      }}>
        <span style={{ fontSize: 10, fontWeight: 500, color: isFuture ? '#CBD5E1' : '#64748B', lineHeight: 1 }}>{d}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: textColor, lineHeight: 1 }}>{icon}</span>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 4 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: C.slate, padding: '2px 0' }}>{w}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
        {cells}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        {[
          { bg: '#D1FAE5', color: C.green,   label: 'Present'   },
          { bg: '#FEF3C7', color: '#D97706', label: 'Half Day'  },
          { bg: '#FEE2E2', color: C.red,     label: 'Absent'    },
          { bg: '#F1F5F9', color: C.slate,   label: 'No Record' },
        ].map(({ bg, color, label }) => (
          <span key={label} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, background: bg, borderRadius: 3, border: `1px solid ${C.border}` }} />
            <span style={{ color: C.slate }}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

const AnalyticsTab = ({ riders = [] }) => {
  const [month, setMonth]       = useState(currentMonth());
  const [data, setData]         = useState(null);
  const [attend, setAttend]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [calRider, setCalRider] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [analyticsRes, attendRes] = await Promise.allSettled([
          getDeliveryAnalytics(month),
          getDeliveryAttendance(month),
        ]);
        if (analyticsRes.status === 'fulfilled') setData(analyticsRes.value);
        if (attendRes.status === 'fulfilled') {
          const a = attendRes.value;
          setAttend(a);
          if (a?.riders?.length > 0 && !calRider) setCalRider(a.riders[0].riderId);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRiderData = attend?.riders?.find((r) => r.riderId === calRider);

  return (
    <div>
      {/* Month selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: C.slate, display: 'block', marginBottom: 4 }}>Month</label>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inputSt, width: 180 }} />
      </div>

      {loading ? <Spinner /> : !data ? (
        <p style={{ color: C.slate, textAlign: 'center', padding: 32 }}>No delivery data found.</p>
      ) : (
        <>
          {/* Summary chips */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10, marginBottom: 20 }}>
            <StatChip label="Total Orders" value={data.totalOrders} bg={C.blueLight}   color={C.blue}   />
            <StatChip label="Delivered"    value={data.delivered}   bg={C.greenLight}  color={C.green}  />
            <StatChip label="Failed"       value={data.failed}      bg={C.redLight}    color={C.red}    />
            <StatChip label="Pending"      value={data.pending}     bg="#FFF7ED"       color="#EA580C"  />
          </div>

          {/* 7-day daily trend bar chart */}
          {data.dailyTrend?.length > 0 && <DailyTrendChart trend={data.dailyTrend} />}

          {/* Rate bars */}
          <Card style={{ padding: 20, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#1E293B' }}>Performance Rates</h4>
            <RateBar label="Overall Success Rate"  rate={data.successRate} color={C.green} />
            <RateBar label="On-Time Delivery Rate" rate={data.onTimeRate}  color={C.blue}  />
          </Card>

          {/* Lunch vs Dinner */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              { slot: 'lunch',  icon: '', stats: data.lunch  },
              { slot: 'dinner', icon: '', stats: data.dinner },
            ].map(({ slot, icon, stats }) => stats && (
              <Card key={slot} style={{ padding: 16 }}>
                <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{icon} {capitalize(slot)}</h4>
                <div style={{ fontSize: 12, color: C.slate, display: 'grid', gap: 4 }}>
                  <span>Total: <strong>{stats.total}</strong></span>
                  <span>Delivered: <strong style={{ color: C.green }}>{stats.delivered}</strong></span>
                  <span>Success: <strong>{stats.successRate}%</strong></span>
                </div>
              </Card>
            ))}
          </div>

          {/* Rider performance table */}
          {data.riders?.length > 0 && (
            <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1E293B' }}>Rider Performance</h4>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.slateLight }}>
                      {['Rider', 'Deliveries', 'Rating', 'Present Days', 'Hours'].map((h) => (
                        <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, color: C.slate, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.riders.map((r, i) => (
                      <tr key={r.riderId} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 ? C.slateLight : '#fff' }}>
                        <td style={{ padding: '11px 14px', fontWeight: 600, color: '#1E293B' }}>{r.name}</td>
                        <td style={{ padding: '11px 14px', color: C.blue,    fontWeight: 700 }}>{r.totalDeliveries}</td>
                        <td style={{ padding: '11px 14px', color: '#F59E0B', fontWeight: 700 }}>★ {r.rating?.toFixed(1) ?? '—'}</td>
                        <td style={{ padding: '11px 14px', color: C.green,   fontWeight: 700 }}>{r.presentDays ?? 0}d</td>
                        <td style={{ padding: '11px 14px', color: C.slate }}>{r.totalHours ?? 0}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Attendance calendar */}
          {attend?.riders?.length > 0 && (
            <Card style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
                  🗓 Attendance Calendar — {attend.month}
                </h4>
                {attend.riders.length > 1 && (
                  <select
                    value={calRider || ''}
                    onChange={(e) => setCalRider(e.target.value)}
                    style={{ ...inputSt, width: 'auto', minWidth: 150 }}
                  >
                    {attend.riders.map((r) => (
                      <option key={r.riderId} value={r.riderId}>{r.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Rider summary chips */}
              {selectedRiderData && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  {[
                    { label: 'Present',  value: selectedRiderData.summary.present,            bg: '#D1FAE5', color: C.green   },
                    { label: 'Half Day', value: selectedRiderData.summary.halfDay,             bg: '#FEF3C7', color: '#D97706' },
                    { label: 'Absent',   value: selectedRiderData.summary.absent,              bg: '#FEE2E2', color: C.red     },
                    { label: 'Hours',    value: `${selectedRiderData.summary.totalHours ?? 0}h`, bg: C.blueLight, color: C.blue },
                  ].map(({ label, value, bg, color }) => (
                    <div key={label} style={{ background: bg, borderRadius: 10, padding: '8px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 64 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
                      <span style={{ fontSize: 10, color: C.slate }}>{label}</span>
                    </div>
                  ))}
                </div>
              )}

              <AttendanceCalendar riderData={selectedRiderData} monthStr={month} />
            </Card>
          )}
        </>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   ROOT: DeliveryManagement
═══════════════════════════════════════════════════════════════════════ */
const TABS = [
  { id: 'overview',    label: ' Overview'   },
  { id: 'riders',      label: ' My Riders'  },
  { id: 'batches',     label: ' Batches'    },
  { id: 'financials',  label: ' Financials' },
  { id: 'analytics',   label: ' Analytics'  },
];

export default function DeliveryManagement() {
  const [activeTab,       setActiveTab]       = useState('overview');
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [toggling,        setToggling]        = useState(false);
  const [riders,          setRiders]          = useState([]);
  const [ridersLoading,   setRidersLoading]   = useState(true);

  // Load initial state: delivery enabled flag + riders
  useEffect(() => {
    const init = async () => {
      try {
        const [profileRes, ridersRes] = await Promise.allSettled([
          getVendorProfile(),
          getVendorRiders(),
        ]);
        if (profileRes.status === 'fulfilled') {
          setDeliveryEnabled(profileRes.value?.deliveryEnabled ?? false);
        }
        if (ridersRes.status === 'fulfilled') {
          setRiders(Array.isArray(ridersRes.value) ? ridersRes.value : (ridersRes.value?.riders || []));
        }
      } finally {
        setRidersLoading(false);
      }
    };
    init();
  }, []);

  const refreshRiders = async () => {
    setRidersLoading(true);
    try {
      const res = await getVendorRiders();
      setRiders(Array.isArray(res) ? res : (res?.riders || []));
    } finally {
      setRidersLoading(false);
    }
  };

  const handleToggleDelivery = async () => {
    setToggling(true);
    try {
      await toggleVendorDelivery(!deliveryEnabled);
      setDeliveryEnabled((v) => !v);
    } catch (e) {
      alert('Toggle failed: ' + e.message);
    } finally {
      setToggling(false);
    }
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':   return <OverviewTab riders={riders} />;
      case 'riders':     return <RidersTab riders={riders} loading={ridersLoading} onRefresh={refreshRiders} />;
      case 'batches':    return <BatchesTab riders={riders} />;
      case 'financials': return <FinancialsTab riders={riders} />;
      case 'analytics':  return <AnalyticsTab riders={riders} />;
      default:           return null;
    }
  };

  return (
    <div style={{ padding: 4 }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, #1E2A3A, #2D3F52)`,
        borderRadius: 16, padding: '20px 24px', marginBottom: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#fff' }}> Delivery Management</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
            Manage your riders, batches, and delivery operations
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: deliveryEnabled ? '#4ADE80' : 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
            {deliveryEnabled ? '● Delivery Active' : '○ Delivery Inactive'}
          </span>
          <button
            onClick={handleToggleDelivery}
            disabled={toggling}
            style={{
              background: deliveryEnabled ? '#DC2626' : C.green,
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 18px', fontSize: 13, fontWeight: 600,
              cursor: toggling ? 'not-allowed' : 'pointer', opacity: toggling ? 0.7 : 1,
            }}
          >
            {toggling ? '…' : deliveryEnabled ? 'Disable Delivery' : 'Enable Delivery'}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4, background: '#F1F5F9',
        borderRadius: 12, padding: 4, marginBottom: 20,
        flexWrap: 'wrap',
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: '1 1 auto', padding: '9px 16px', border: 'none', borderRadius: 10,
              cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
              background: activeTab === tab.id ? '#fff' : 'transparent',
              color: activeTab === tab.id ? C.orange : C.slate,
              boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {renderTab()}
    </div>
  );
}
