// 1. ALL imports MUST be at the very top
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { placeOrder } from '../utils/api';
import { getAuthItem } from '../utils/authStorage';

// 2. ONLY ONE export default per file
export default function OrderPage() {
  const navigate = useNavigate();
  const invoiceRef = useRef(); 
  
  // --- All States grouped together ---
  const [step, setStep] = useState(1);
  const [planType, setPlanType] = useState('monthly');
  const [startDate, setStartDate] = useState(''); 
  const [selectedSabji, setSelectedSabji] = useState('Paneer Butter Masala');
  const [mealPreference, setMealPreference] = useState('Regular');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [isOrdered, setIsOrdered] = useState(false); 
  const [address, setAddress] = useState({
    area: 'Auto-detecting...',
    pincode: '382010',
    phone: '9876543210'
  });

  // --- Data Objects ---
  const vendor = {
    name: "Annapurna Kitchen",
    address: "123, Food Street, Himatnagar, Gujarat",
    contact: "+91 98765 43210",
    fssai: "12345678901234",
    menu: {
      today: ["Paneer Butter Masala", "Dal Fry", "Jeera Rice", "3 Rotis", "Salad"],
      alternatives: ["Mix Veg", "Aloo Gobhi", "Sev Tameta", "Bhindi Fry"],
      special: "Gulab Jamun"
    }
  };

  const prices = { oneday: 80, weekly: 500, monthly: 2000 };

  // --- Functions ---
  const handleAutoLocation = () => {
    alert("Location Detected: Sector 21, Gandhinagar");
    setAddress({ ...address, area: "Sector 21, Gandhinagar" });
  };

  const handleDownloadPDF = async () => {
    const element = invoiceRef.current;
    const canvas = await html2canvas(element, { scale: 3 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`MealSetu_Bill_${Date.now()}.pdf`);
    alert("Official Bill Downloaded!");
  };

  return (
    <div className="page-bg">
      <div className="order-container">
        {/* Header */}
        <div className="order-header">
          <button 
            onClick={() => isOrdered ? setIsOrdered(false) : (step === 1 ? navigate('/user-dashboard') : setStep(step - 1))} 
            className="back-btn"
          >
            ← Back
          </button>
          <h2>{isOrdered ? "Order Confirmed" : `Order from ${vendor.name}`}</h2>
        </div>

        <div className="order-content">
          {isOrdered ? (
            /* SUCCESS VIEW */
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '60px', color: '#22c55e', marginBottom: '20px' }}>✅</div>
              <h2 style={{ marginBottom: '10px' }}>Payment Successful!</h2>
              <p style={{ color: '#64748b', marginBottom: '30px' }}>Your tiffin subscription is now active.</p>
              
              <button className="btn-primary full-width" onClick={handleDownloadPDF} style={{ marginBottom: '15px', fontWeight: 'bold' }}>
                📥 DOWNLOAD OFFICIAL BILL
              </button>
              
              <button className="tag" onClick={() => navigate('/user-dashboard')} style={{ width: '100%', border: '1px solid #ddd', padding: '12px', cursor: 'pointer' }}>
                Return to Dashboard
              </button>
            </div>
          ) : (
            /* STEPPER VIEW */
            <>
              <div className="progress-bar">
                <div className={`step ${step >= 1 ? 'active' : ''}`}>1. Plan</div>
                <div className={`step ${step >= 2 ? 'active' : ''}`}>2. Menu</div>
                <div className={`step ${step >= 3 ? 'active' : ''}`}>3. Payment</div>
              </div>

              {step === 1 && (
                <div className="step-content">
                  <h3>Select Your Plan</h3>
                  <div className="plan-options">
                    {['oneday', 'weekly', 'monthly'].map((p) => (
                      <button key={p} className={`plan-card ${planType === p ? 'selected' : ''}`} onClick={() => setPlanType(p)}>
                        <h4>{p.toUpperCase()}</h4><p>₹{prices[p]}</p>
                      </button>
                    ))}
                  </div>
                  <div className="input-group">
                    <label>Start Date</label>
                    <input type="date" className="form-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <button className="btn-primary full-width" onClick={() => setStep(2)}>Next: View Menu</button>
                </div>
              )}

              {step === 2 && (
                <div className="step-content">
                  <h3>Today's Menu</h3>
                  <div className="menu-card">
                    <ul>
                      {vendor.menu.today.map((item, i) => (
                        <li key={i}>{item.includes("Paneer") ? selectedSabji : item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="input-group">
                    <label>Alter Main Subji</label>
                    <select className="form-input" value={selectedSabji} onChange={(e) => setSelectedSabji(e.target.value)}>
                      <option value="Paneer Butter Masala">Paneer Butter Masala</option>
                      {vendor.menu.alternatives.map((alt, i) => <option key={i} value={alt}>{alt}</option>)}
                    </select>
                  </div>
                  <button className="btn-primary full-width" onClick={() => setStep(3)}>Next: Final Payment</button>
                </div>
              )}

              {step === 3 && (
                <div className="step-content">
                  <h3>Payment Method</h3>
                  <div className="payment-grid">
                    {['cash', 'card', 'upi'].map((m) => (
                      <label key={m} className={`pay-option ${paymentMethod === m ? 'active' : ''}`}>
                        <input type="radio" name="pay" value={m} checked={paymentMethod === m} onChange={(e) => setPaymentMethod(e.target.value)} />
                        {m === 'cash' ? '💵 Cash' : m === 'card' ? '💳 Card' : '📱 UPI'}
                      </label>
                    ))}
                  </div>
                  <div className="summary-box">
                    <div className="row"><span>Total Payable</span><span>₹{prices[planType]}</span></div>
                  </div>
                  <button 
                    className="btn-primary full-width" 
                    onClick={async () => {
                      try {
                        // Map payment method to backend format (Cash, UPI)
                        const paymentMethodMap = {
                          'cash': 'Cash',
                          'card': 'UPI', 
                          'upi': 'UPI'
                        };
                        const backendPaymentMethod = paymentMethodMap[paymentMethod] || 'Cash';
                        
                        // Map plan to backend format (ONEDAY, WEEKLY, MONTHLY)
                        const planMap = {
                          'oneday': 'ONEDAY',
                          'weekly': 'WEEKLY',
                          'monthly': 'MONTHLY'
                        };
                        const backendPlan = planMap[planType] || 'ONEDAY';
                        
                        // Get vendor ID from localStorage or use a default
                        const userData = JSON.parse(getAuthItem('user') || '{}');
                        
                        // For demo, we'll use a placeholder vendor ID since OrderPage doesn't have vendor selection
                        // In production, this should come from the vendor the user selected
                        const vendorId = '65f000000000000000000001';
                        
                        // Call the API to place order
                        await placeOrder(
                          vendorId,
                          [],
                          prices[planType],
                          'Lunch',
                          'Regular',
                          {
                            plan: backendPlan,
                            startDate: startDate || null,
                            altMainSubji: selectedSabji,
                            paymentMethod: backendPaymentMethod
                          }
                        );
                        
                        setIsOrdered(true);
                      } catch (error) {
                        console.error('Order error:', error);
                        alert('Failed to place order: ' + (error.message || 'Please try again'));
                      }
                    }}
                  >
                    Confirm & Pay
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* --- HIDDEN INVOICE TEMPLATE FOR PDF GENERATION --- */}
      <div style={{ position: 'absolute', left: '-9999px' }}>
        <div ref={invoiceRef} style={{ width: '210mm', minHeight: '297mm', padding: '20mm', background: 'white', position: 'relative', color: '#333', fontFamily: 'Arial' }}>
          
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-45deg)', fontSize: '90px', color: 'rgba(0, 0, 0, 0.12)', zIndex: 0, fontWeight: '900', pointerEvents: 'none', whiteSpace: 'nowrap', border: '10px solid rgba(0, 0, 0, 0.08)', padding: '20px' }}>
            MEALSETU OFFICIAL
          </div>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h1 style={{ color: '#f26522', margin: 0, fontSize: '40px' }}>MealSetu</h1>
                  <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>Quality Food, Delivered with Care</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <h2 style={{ margin: 0, color: '#444' }}>TAX INVOICE</h2>
                  <p style={{ margin: 0 }}><b>Invoice #:</b> MS-{Math.floor(1000 + Math.random()*9000)}</p>
                  <p style={{ margin: 0 }}><b>Date:</b> {new Date().toLocaleDateString()}</p>
                </div>
            </div>
            
            <hr style={{ margin: '20px 0', border: '0.5px solid #ddd' }} />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px' }}>
              <div>
                <h4 style={{ margin: '0 0 5px 0', color: '#f26522', textTransform: 'uppercase' }}>Vendor</h4>
                <p style={{ margin: 0 }}><b>{vendor.name}</b></p>
                <p style={{ margin: 0, fontSize: '14px' }}>{vendor.address}</p>
                <p style={{ margin: 0, fontSize: '14px' }}>Contact: {vendor.contact}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#f26522', textTransform: 'uppercase' }}>Customer</h4>
                <p style={{ margin: 0 }}><b>Mosin Ali</b></p>
                <p style={{ margin: 0, fontSize: '14px' }}>Payment Mode: {paymentMethod === 'upi' ? 'UPI' : paymentMethod === 'card' ? 'UPI' : 'Cash'}</p>
                <div style={{ marginTop: '10px', border: '2px solid #22c55e', color: '#22c55e', padding: '2px 8px', display: 'inline-block', fontWeight: 'bold', transform: 'rotate(-5deg)' }}>PAID</div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
              <thead>
                <tr style={{ background: '#444', color: 'white' }}>
                  <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #444' }}>Description</th>
                  <th style={{ padding: '12px', textAlign: 'right', border: '1px solid #444' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '15px 12px', border: '1px solid #eee' }}>
                    <b>Tiffin Subscription: {planType.toUpperCase()}</b><br/>
                    <span style={{ fontSize: '13px', color: '#555' }}>Start Date: {startDate || 'As per schedule'}</span><br/>
                    <span style={{ fontSize: '13px', color: '#555' }}>Meal Preference: {mealPreference}</span><br/>
                    <span style={{ fontSize: '13px', color: '#555' }}>Main Sabji: {selectedSabji}</span>
                  </td>
                  <td style={{ padding: '15px 12px', textAlign: 'right', border: '1px solid #eee' }}>₹{prices[planType]}.00</td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ width: '40%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                  <span>Subtotal:</span><span>₹{prices[planType]}.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', color: '#f26522', fontWeight: 'bold', fontSize: '20px' }}>
                  <span>Grand Total:</span><span>₹{prices[planType]}.00</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '100px', textAlign: 'center', fontSize: '12px', color: '#888', borderTop: '1px solid #eee', paddingTop: '20px' }}>
              <p>Thank you for using MealSetu. This is a computer-generated receipt.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}