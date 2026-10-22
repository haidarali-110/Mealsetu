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
    planType: 'weekly',
    startDate: '',
    paymentMethod: 'Cash',
    amount: 0,
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
    if (formData.planType && formData.startDate) {
      handleCalculateAmount();
    }
  }, [formData.planType, formData.startDate]);

  const handleCalculateAmount = async () => {
    if (!formData.planType || !formData.startDate) {
      return;
    }

    try {
      setCalculateLoading(true);
      const result = await calculateManualOrderAmount(
        formData.planType,
        formData.startDate
      );
      setFormData(prev => ({ ...prev, amount: result.amount || 0 }));
    } catch (error) {
      console.error('Calculate error:', error);
      addToast('Failed to calculate amount: ' + error.message, 'error');
    } finally {
      setCalculateLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.amount || formData.amount <= 0) {
      addToast('Please fill all required fields and calculate amount', 'error');
      return;
    }

    try {
      setLoading(true);
      const res = await addManualCustomer(formData);
      const savedName = formData.name;
      setFormData({
        name: '',
        phone: '',
        planType: 'weekly',
        startDate: '',
        paymentMethod: 'Cash',
        amount: 0,
        mealPreference: 'Regular',
        address: { flatHouseNo: '', street: '', area: '', landmark: '', city: '', pincode: '' }
      });
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
    const pageWidth = doc.internal.pageSize.getWidth();

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
        <h3 style={{ margin: 0, color: '#2b3674' }}> Manual / Offline Customers</h3>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button 
            onClick={toggleForm} 
            style={{ 
              padding: '10px 20px', 
              borderRadius: '8px', 
              border: '1px solid #f26522', 
              background: showForm ? '#f26522' : '#fff', 
              color: showForm ? 'white' : '#f26522',
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
        <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '12px', marginBottom: '25px', border: '1px solid #e2e8f0' }}>
          <h4 style={{ color: '#2b3674', marginBottom: '20px' }}>Add Manual Customer</h4>
<form onSubmit={handleSubmit} className="flex flex-col gap-3 md:grid md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>Customer Name *</label>
              <input
                type="text"
                className="v-input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Full Name"
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>Phone *</label>
              <input
                type="tel"
                className="v-input"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="98XXXXXXXX"
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>Plan Type *</label>
              <select
                className="v-input"
                value={formData.planType}
                onChange={(e) => setFormData({ ...formData, planType: e.target.value })}
                required
              >
                <option value="trial">Trial</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>Start Date *</label>
              <input
                type="date"
                className="v-input"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                required
              />
            </div>
            {/* ── Address section (spans full row) ── */}
            <div style={{ gridColumn: '1 / -1', background: '#f1f5f9', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontWeight: '700', color: '#374151', fontSize: '14px' }}>📍 Delivery Address</label>
                {geocoding && <span style={{ fontSize: '12px', color: '#6b7280' }}>Detecting location...</span>}
              </div>
              <div className="flex flex-col gap-3 md:grid md:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#6b7280' }}>Flat / House No.</label>
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
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#6b7280' }}>Area / Locality *</label>
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
              {(formData.address.latitude) && (
                <p style={{ marginTop: '8px', fontSize: '11px', color: '#16a34a', fontWeight: '600' }}>
                   Location detected — delivery navigation & proximity alerts will work
                </p>
              )}
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>Meal Preference</label>
              <select
                className="v-input"
                value={formData.mealPreference}
                onChange={(e) => setFormData({ ...formData, mealPreference: e.target.value })}
              >
                <option value="Regular">Regular</option>
                <option value="Jain">Jain</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>Payment Method</label>
              <select
                className="v-input"
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '15px', alignItems: 'end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>Amount *</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="number"
                    className="v-input"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    style={{ flex: 1 }}
                    required
                  />
                  <span style={{ fontWeight: '600', color: '#f26522' }}>₹</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleCalculateAmount}
                  disabled={calculateLoading}
                  style={{
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    padding: '12px 20px',
                    borderRadius: '8px',
                    cursor: calculateLoading ? 'not-allowed' : 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {calculateLoading ? 'Calculating...' : 'Calculate'}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: loading ? '#9ca3af' : '#10b981',
                    color: 'white',
                    border: 'none',
                    padding: '12px 20px',
                    borderRadius: '8px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {loading ? 'Adding...' : 'Add Customer'}
                </button>
              </div>
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
