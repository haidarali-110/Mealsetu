import React, { useState, useEffect } from 'react';
import { useToast } from '../../common/Toast';
import { addManualCustomer, getManualCustomers, calculateManualOrderAmount } from '../../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const AddManualCustomer = ({ vendorProfile }) => {
  const { addToast } = useToast();
  const [manualCustomers, setManualCustomers] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    planType: 'Daily',
    startDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'Cash',
    amount: 0,
    leavesAllowed: 0,
    mealPreference: 'Regular',
    address: {
      flatHouseNo: '',
      street: '',
      area: '',
      landmark: '',
      city: '',
      pincode: '',
    }
  });
  const [addressOpen, setAddressOpen] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [calculateLoading, setCalculateLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [confirmation, setConfirmation] = useState(null); // mealSlotInfo after add

  // Load manual customers on mount
  useEffect(() => {
    fetchManualCustomers();
  }, []);

  const handleAddressChange = (field, value) => {
    setFormData(prev => ({ ...prev, address: { ...prev.address, [field]: value } }));
  };

  const geocodeAddress = async (area, pincode) => {
    if (!area && !pincode) return;
    try {
      setGeocoding(true);
      const query = [area, pincode, 'India'].filter(Boolean).join(', ');
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=in`;
      const res = await fetch(url, { headers: { 'User-Agent': 'MealSetu/1.0' } });
      const data = await res.json();
      if (data?.[0]) {
        setFormData(prev => ({
          ...prev,
          address: {
            ...prev.address,
            latitude: parseFloat(data[0].lat),
            longitude: parseFloat(data[0].lon),
          }
        }));
      }
    } catch (_) {
      // silent — geocoding failure is non-critical
    } finally {
      setGeocoding(false);
    }
  };

  const fetchManualCustomers = async () => {
    try {
      const customers = await getManualCustomers();
      setManualCustomers(customers || []);
    } catch (error) {
      console.error('Failed to load manual customers:', error);
      addToast('Failed to load manual customers', 'error');
    }
  };

  // Auto-calculate on planType or startDate change
  useEffect(() => {
    if (formData.planType) {
      const dateToUse = formData.startDate || new Date().toISOString().split('T')[0];
      handleCalculateAmount(formData.planType, dateToUse);
    }
  }, [formData.planType, formData.startDate]);

  const handleCalculateAmount = async (plan = formData.planType, date = formData.startDate) => {
    const planToUse = plan || formData.planType;
    const dateToUse = date || formData.startDate || new Date().toISOString().split('T')[0];

    try {
      setCalculateLoading(true);
      const result = await calculateManualOrderAmount(
        planToUse,
        dateToUse
      );
      setFormData(prev => ({ ...prev, amount: result.amount || 0 }));
    } catch (error) {
      console.error('Calculate error:', error);
      addToast('Failed to calculate amount: ' + (error.message || 'Error'), 'error');
    } finally {
      setCalculateLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const pType = formData.planType.toLowerCase();

    if (!formData.name?.trim()) {
      addToast('Customer Name is required', 'error');
      return;
    }
    if (!formData.phone?.trim()) {
      addToast('Phone Number is required', 'error');
      return;
    }
    if (!formData.amount || formData.amount <= 0) {
      addToast('Please enter or calculate a valid amount', 'error');
      return;
    }

    if (pType === 'weekly' || pType === 'monthly') {
      if (!formData.startDate) {
        addToast('Start Date is required', 'error');
        return;
      }
      if (!formData.mealPreference) {
        addToast('Meal Preference is required', 'error');
        return;
      }
    }

    if (pType === 'monthly') {
      if (!formData.address?.area?.trim() || !formData.address?.pincode?.trim() || !formData.address?.city?.trim()) {
        addToast('Area, pincode, and city are required for Monthly plan', 'error');
        return;
      }
    }

    const payload = {
      ...formData,
      planType: formData.planType === 'Daily' ? 'Daily' : formData.planType === 'Weekly' ? 'Weekly' : 'Monthly',
      startDate: formData.startDate || new Date().toISOString().split('T')[0],
      leavesAllowed: pType === 'monthly' ? Number(formData.leavesAllowed ?? 2) : 0,
      mealPreference: formData.mealPreference || 'Regular',
      paymentMethod: formData.paymentMethod || 'Cash',
    };

    try {
      setLoading(true);
      const res = await addManualCustomer(payload);
      const savedName = formData.name;
      setFormData({
        name: '',
        phone: '',
        email: '',
        planType: 'Daily',
        startDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'Cash',
        amount: 0,
        leavesAllowed: 0,
        mealPreference: 'Regular',
        address: { flatHouseNo: '', street: '', area: '', landmark: '', city: '', pincode: '' }
      });
      setAddressOpen(false);
      fetchManualCustomers();
      setShowForm(false);
      // Show confirmation with meal slot info
      if (res?.mealSlotInfo) {
        setConfirmation({ ...res.mealSlotInfo, customerName: savedName });
      } else {
        addToast('Manual customer added successfully!', 'success');
      }
    } catch (error) {
      console.error('Submit error:', error);
      addToast('Failed to add customer: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    if (manualCustomers.length === 0) {
      addToast('No manual customers to export', 'warning');
      return;
    }

    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.text(`${vendorProfile?.kitchenName || 'Kitchen'} - Manual Customers Report`, 14, 22);
    doc.setFontSize(12);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 35);
    doc.text(`Total Customers: ${manualCustomers.length}`, 14, 45);

    // Table
    const tableColumn = ['Name', 'Phone', 'Plan', 'Start Date', 'Amount', 'Payment'];
    const tableRows = manualCustomers.map(cust => [
      cust.name || cust.manualCustomerName,
      cust.phone || cust.manualCustomerPhone,
      cust.planType,
      new Date(cust.startDate).toLocaleDateString('en-IN'),
      `₹${cust.amount?.toFixed(2) || '0.00'}`,
      cust.paymentMethod || 'Cash'
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 55,
      theme: 'grid',
      headStyles: { fillColor: [242, 101, 34], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [244, 247, 254] },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 35 },
        2: { cellWidth: 25 },
        3: { cellWidth: 30 },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 30 }
      }
    });

    // Total
    const finalY = doc.lastAutoTable.finalY + 10;
    const totalAmount = manualCustomers.reduce((sum, cust) => sum + (cust.amount || 0), 0);
    doc.setFontSize(14);
    doc.text(`Grand Total: ₹${totalAmount.toFixed(2)}`, 14, finalY);

    doc.save(`Manual_Customers_${vendorProfile?.kitchenName || 'Kitchen'}_${Date.now()}.pdf`);
  };

  const toggleForm = () => setShowForm(!showForm);

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';

  const isDaily   = formData.planType.toLowerCase() === 'daily';
  const isWeekly  = formData.planType.toLowerCase() === 'weekly';
  const isMonthly = formData.planType.toLowerCase() === 'monthly';

  return (
    <div className="v-card">

      {/* ── Confirmation modal ─────────────────────────────────────────────── */}
      {confirmation && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', maxWidth: '420px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>✅</div>
              <h3 style={{ margin: 0, color: '#1e293b', fontSize: '18px' }}>{confirmation.customerName} Added!</h3>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '13px' }}>Tell the customer:</p>
            </div>

            {/* Meal slot badge */}
            <div style={{ background: confirmation.color + '18', border: `1.5px solid ${confirmation.color}`, borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: confirmation.color }}>{confirmation.label}</div>
              <div style={{ fontSize: '13px', color: '#475569', marginTop: '6px', lineHeight: '1.5' }}>{confirmation.note}</div>
            </div>

            {/* Plan dates */}
            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Plan starts</span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{fmtDate(confirmation.startDate)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Plan ends</span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{fmtDate(confirmation.endDate)}</span>
              </div>
            </div>

            <button
              onClick={() => setConfirmation(null)}
              style={{ width: '100%', padding: '12px', background: '#f26522', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <h3 style={{ margin: 0, color: '#2b3674' }}>Manual / Offline Customers</h3>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button 
            onClick={toggleForm} 
            style={{ 
              padding: '10px 20px', 
              borderRadius: '8px', 
              border: '1px solid #f26522', 
              background: showForm ? '#f26522' : '#fff', 
              color: showForm ? 'white' : '#f26522',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            {showForm ? 'Cancel' : '➕ Add New'}
          </button>
          {manualCustomers.length > 0 && (
            <button 
              onClick={handleDownloadPDF}
              style={{ 
                background: '#16a34a', 
                color: 'white', 
                border: 'none', 
                padding: '10px 20px', 
                borderRadius: '8px', 
                fontWeight: '700',
                cursor: 'pointer' 
              }}
            >
              PDF Export
            </button>
          )}
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '14px', marginBottom: '25px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <h4 style={{ color: '#2b3674', margin: '0 0 16px 0', fontSize: '16px' }}>Add Manual Customer</h4>

          {/* ── STEP 1: PLAN SELECTOR FIRST ── */}
          <div style={{ marginBottom: '22px' }}>
            <label style={{ display: 'block', fontWeight: '700', fontSize: '14px', marginBottom: '10px', color: '#1e293b' }}>
              Select Plan Type
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              {[
                { id: 'Daily', label: 'Daily', sub: '(1 day)', desc: 'Single day meal' },
                { id: 'Weekly', label: 'Weekly', sub: '(7 days)', desc: '7 days subscription' },
                { id: 'Monthly', label: 'Monthly', sub: '(30 days)', desc: 'Full month plan' },
              ].map((plan) => {
                const isSelected = formData.planType.toLowerCase() === plan.id.toLowerCase();
                return (
                  <div
                    key={plan.id}
                    onClick={() => {
                      const newPlan = plan.id;
                      setFormData(prev => ({
                        ...prev,
                        planType: newPlan,
                        startDate: prev.startDate || new Date().toISOString().split('T')[0],
                        leavesAllowed: newPlan === 'Monthly' ? 2 : 0,
                      }));
                      if (newPlan === 'Monthly') {
                        setAddressOpen(true);
                      }
                    }}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '12px',
                      border: isSelected ? '2px solid #f26522' : '1.5px solid #cbd5e1',
                      background: isSelected ? '#fff7ed' : '#ffffff',
                      boxShadow: isSelected ? '0 4px 12px rgba(242,101,34,0.12)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        name="planTypeSelector"
                        checked={isSelected}
                        onChange={() => {}}
                        style={{ accentColor: '#f26522', cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: '700', fontSize: '15px', color: isSelected ? '#ea580c' : '#1e293b' }}>
                        {plan.label} {plan.sub}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                      {plan.desc}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── STEP 2: DYNAMIC FORM BASED ON SELECTED PLAN ── */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 md:grid md:grid-cols-2 lg:grid-cols-3">
            {/* Full Name * (All plans) */}
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                Full Name *
              </label>
              <input
                type="text"
                className="v-input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Customer Full Name"
                required
              />
            </div>

            {/* Phone Number * (All plans) */}
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                Phone Number *
              </label>
              <input
                type="tel"
                className="v-input"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="10-digit mobile number"
                maxLength={10}
                required
              />
            </div>

            {/* Email (Optional for Weekly & Monthly) */}
            {!isDaily && (
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                  Email (Optional)
                </label>
                <input
                  type="email"
                  className="v-input"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="customer@example.com"
                />
              </div>
            )}

            {/* Start Date * (Weekly & Monthly) */}
            {!isDaily && (
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                  Start Date *
                </label>
                <input
                  type="date"
                  className="v-input"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  required
                />
              </div>
            )}

            {/* Meal Preference * (Weekly & Monthly) */}
            {!isDaily && (
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                  Meal Preference *
                </label>
                <div style={{ display: 'flex', gap: '20px', height: '42px', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '600', color: '#374151' }}>
                    <input
                      type="radio"
                      name="mealPref"
                      value="Regular"
                      checked={formData.mealPreference === 'Regular'}
                      onChange={(e) => setFormData({ ...formData, mealPreference: e.target.value })}
                      style={{ accentColor: '#f26522' }}
                    />
                    Regular
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '600', color: '#374151' }}>
                    <input
                      type="radio"
                      name="mealPref"
                      value="Jain"
                      checked={formData.mealPreference === 'Jain'}
                      onChange={(e) => setFormData({ ...formData, mealPreference: e.target.value })}
                      style={{ accentColor: '#f26522' }}
                    />
                    Jain
                  </label>
                </div>
              </div>
            )}

            {/* Payment: [Cash] [Online] */}
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                Payment Method
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {['Cash', 'Online'].map((method) => {
                  const isSel = formData.paymentMethod === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setFormData({ ...formData, paymentMethod: method })}
                      style={{
                        flex: 1,
                        padding: '9px 14px',
                        borderRadius: '8px',
                        border: isSel ? '2px solid #f26522' : '1px solid #cbd5e1',
                        background: isSel ? '#fff7ed' : '#ffffff',
                        color: isSel ? '#ea580c' : '#475569',
                        fontWeight: '700',
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {method === 'Cash' ? '💰 Cash' : '💳 Online'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Leaves Allowed (Monthly only, default 2) */}
            {isMonthly && (
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                  Leaves Allowed
                </label>
                <input
                  type="number"
                  min={0}
                  className="v-input"
                  value={formData.leavesAllowed ?? 2}
                  onChange={(e) => setFormData({ ...formData, leavesAllowed: parseInt(e.target.value, 10) || 0 })}
                  placeholder="2"
                />
              </div>
            )}

            {/* Amount * */}
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                Amount *
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="number"
                    className="v-input"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    style={{ width: '100%', paddingLeft: '28px' }}
                    required
                  />
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: '700', color: '#f26522' }}>
                    ₹
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCalculateAmount()}
                  disabled={calculateLoading}
                  style={{
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    padding: '9px 14px',
                    borderRadius: '8px',
                    cursor: calculateLoading ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '12px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {calculateLoading ? '...' : 'Auto-Calc'}
                </button>
              </div>
            </div>

            {/* ── Address Section ── */}
            <div style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
              {isMonthly ? (
                /* Monthly: Address Required */
                <div style={{ background: '#f1f5f9', borderRadius: '12px', padding: '18px', border: '1px solid #cbd5e1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <label style={{ fontWeight: '700', color: '#1e293b', fontSize: '14px' }}>
                      📍 Delivery Address <span style={{ color: '#ea580c' }}>* (Required for monthly routing)</span>
                    </label>
                    {geocoding && <span style={{ fontSize: '12px', color: '#6b7280' }}>Detecting location...</span>}
                  </div>
                  <div className="flex flex-col gap-3 md:grid md:grid-cols-3">
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#374151' }}>
                        Area / Locality *
                      </label>
                      <input
                        type="text"
                        className="v-input"
                        value={formData.address.area}
                        onChange={e => handleAddressChange('area', e.target.value)}
                        onBlur={() => geocodeAddress(formData.address.area, formData.address.pincode)}
                        placeholder="e.g. Jalalpore"
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#374151' }}>
                        Pincode *
                      </label>
                      <input
                        type="text"
                        className="v-input"
                        value={formData.address.pincode}
                        onChange={e => handleAddressChange('pincode', e.target.value)}
                        onBlur={() => geocodeAddress(formData.address.area, formData.address.pincode)}
                        placeholder="396445"
                        maxLength={6}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#374151' }}>
                        City *
                      </label>
                      <input
                        type="text"
                        className="v-input"
                        value={formData.address.city}
                        onChange={e => handleAddressChange('city', e.target.value)}
                        placeholder="Navsari"
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#6b7280' }}>
                        Flat / House No (Optional)
                      </label>
                      <input
                        type="text"
                        className="v-input"
                        value={formData.address.flatHouseNo}
                        onChange={e => handleAddressChange('flatHouseNo', e.target.value)}
                        placeholder="B-12, Shanti Apt"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#6b7280' }}>
                        Street (Optional)
                      </label>
                      <input
                        type="text"
                        className="v-input"
                        value={formData.address.street}
                        onChange={e => handleAddressChange('street', e.target.value)}
                        placeholder="MG Road"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#6b7280' }}>
                        Landmark (Optional)
                      </label>
                      <input
                        type="text"
                        className="v-input"
                        value={formData.address.landmark}
                        onChange={e => handleAddressChange('landmark', e.target.value)}
                        placeholder="Near Bus Stand"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Daily & Weekly: Address is Optional and collapsed by default */
                <div>
                  <button
                    type="button"
                    onClick={() => setAddressOpen(!addressOpen)}
                    style={{
                      background: addressOpen ? '#fff7ed' : '#f8fafc',
                      border: addressOpen ? '1.5px solid #f26522' : '1px dashed #cbd5e1',
                      borderRadius: '8px',
                      padding: '10px 18px',
                      color: addressOpen ? '#ea580c' : '#475569',
                      fontWeight: '700',
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.15s'
                    }}
                  >
                    <span>{addressOpen ? '▼ Hide Address (Optional)' : '📍 + Add Address (Optional)'}</span>
                  </button>

                  {addressOpen && (
                    <div style={{ marginTop: '12px', background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <label style={{ fontWeight: '700', color: '#374151', fontSize: '13px' }}>
                          Delivery Address (Optional)
                        </label>
                        {geocoding && <span style={{ fontSize: '12px', color: '#6b7280' }}>Detecting location...</span>}
                      </div>
                      <div className="flex flex-col gap-3 md:grid md:grid-cols-3">
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#6b7280' }}>Flat / House No</label>
                          <input
                            type="text"
                            className="v-input"
                            value={formData.address.flatHouseNo}
                            onChange={e => handleAddressChange('flatHouseNo', e.target.value)}
                            placeholder="B-12, Shanti Apt"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#6b7280' }}>Street</label>
                          <input
                            type="text"
                            className="v-input"
                            value={formData.address.street}
                            onChange={e => handleAddressChange('street', e.target.value)}
                            placeholder="MG Road"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#6b7280' }}>Area / Locality</label>
                          <input
                            type="text"
                            className="v-input"
                            value={formData.address.area}
                            onChange={e => handleAddressChange('area', e.target.value)}
                            onBlur={() => geocodeAddress(formData.address.area, formData.address.pincode)}
                            placeholder="Jalalpore"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#6b7280' }}>Landmark</label>
                          <input
                            type="text"
                            className="v-input"
                            value={formData.address.landmark}
                            onChange={e => handleAddressChange('landmark', e.target.value)}
                            placeholder="Near Bus Stand"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#6b7280' }}>City</label>
                          <input
                            type="text"
                            className="v-input"
                            value={formData.address.city}
                            onChange={e => handleAddressChange('city', e.target.value)}
                            placeholder="Navsari"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#6b7280' }}>Pincode</label>
                          <input
                            type="text"
                            className="v-input"
                            value={formData.address.pincode}
                            onChange={e => handleAddressChange('pincode', e.target.value)}
                            onBlur={() => geocodeAddress(formData.address.area, formData.address.pincode)}
                            placeholder="396445"
                            maxLength={6}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Submit & Cancel buttons */}
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
              <button
                type="button"
                onClick={toggleForm}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1',
                  background: '#fff', color: '#64748b', fontWeight: '600', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: loading ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: '700',
                  boxShadow: '0 2px 4px rgba(16,185,129,0.2)'
                }}
              >
                {loading ? 'Adding Customer...' : 'Save Customer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manual Customers List */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h4 style={{ margin: 0, color: '#2b3674' }}>Manual Customers ({manualCustomers.length})</h4>
          {manualCustomers.length > 0 && (
            <button 
              onClick={handleDownloadPDF}
              style={{ 
                background: '#f26522', 
                color: 'white', 
                border: 'none', 
                padding: '10px 20px', 
                borderRadius: '8px', 
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
               Export PDF
            </button>
          )}
        </div>
        {manualCustomers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
            <p style={{ fontSize: '18px', marginBottom: '10px' }}>📝 No manual customers yet</p>
            <p>Click " Add New" above to add your first offline customer</p>
          </div>
        ) : (
<div className="w-full overflow-x-auto" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            <table className="v-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Plan</th>
                  <th>Start Date</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Address</th>
                  <th>Meal Pref</th>
                </tr>
              </thead>
              <tbody>
                {manualCustomers.map((customer, index) => (
                  <tr key={customer._id || index}>
                   
                    <td   style={{ fontWeight: '600' }}>{customer.name || customer.manualCustomerName}</td>
                    <td>{customer.phone || customer.manualCustomerPhone}</td>
                    <td>
                      <span style={{ 
                        padding: '4px 8px', 
                        borderRadius: '12px', 
                        background: customer.planType === 'trial' ? '#fef3c7' : customer.planType === 'weekly' ? '#dbeafe' : '#dcfce7',
                        color: customer.planType === 'trial' ? '#d97706' : customer.planType === 'weekly' ? '#1d4ed8' : '#16a34a',
                        fontSize: '12px', 
                        fontWeight: '600' 
                      }}>
                        {customer.planType?.toUpperCase()}
                      </span>
                    </td>
                    <td>{new Date(customer.startDate).toLocaleDateString('en-IN')}</td>
                    <td style={{ fontWeight: '600', color: '#f26522' }}>₹{customer.amount?.toFixed(2) || '0.00'}</td>
                    <td>
                      <span style={{ 
                        padding: '4px 8px', 
                        borderRadius: '12px', 
                        background: customer.paymentMethod === 'UPI' ? '#dbeafe' : '#fef3c7',
                        color: customer.paymentMethod === 'UPI' ? '#1d4ed8' : '#d97706',
                        fontSize: '12px' 
                      }}>
                        {customer.paymentMethod || 'Cash'}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      {customer.manualCustomerAddress && typeof customer.manualCustomerAddress === 'object'
                        ? [customer.manualCustomerAddress.area, customer.manualCustomerAddress.city, customer.manualCustomerAddress.pincode].filter(Boolean).join(', ') || '-'
                        : (customer.manualCustomerPincode || '-')
                      }
                    </td>
                    <td>
                      <span style={{ 
                        padding: '4px 6px', 
                        borderRadius: '8px', 
                        background: customer.mealPreference === 'Jain' ? '#fef3c7' : '#dcfce7',
                        color: customer.mealPreference === 'Jain' ? '#d97706' : '#16a34a',
                        fontSize: '11px',
                        fontWeight: '500'
                      }}>
                        {customer.mealPreference || 'Regular'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddManualCustomer;
