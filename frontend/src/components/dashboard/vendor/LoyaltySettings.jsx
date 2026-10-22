import React, { useState, useEffect } from 'react';
import { getVendorLoyaltySettings, updateVendorLoyaltySettings } from '../../../utils/api';

// Reusable toggle switch styled identically to TrialSettings
const Toggle = ({ checked, onChange }) => (
  <label style={{ position: 'relative', display: 'inline-block', width: 50, height: 26 }}>
    <input type="checkbox" checked={checked} onChange={onChange} style={{ opacity: 0, width: 0, height: 0 }} />
    <span style={{
      position: 'absolute', cursor: 'pointer',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: checked ? '#16a34a' : '#cbd5e1',
      transition: '0.3s', borderRadius: 26, display: 'block'
    }} />
    <span style={{
      position: 'absolute',
      height: 20, width: 20,
      left: checked ? 27 : 3, bottom: 3,
      backgroundColor: 'white',
      transition: '0.3s', borderRadius: '50%',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
    }} />
  </label>
);

const LoyaltySettings = () => {
  const [loyaltyEnabled, setLoyaltyEnabled]     = useState(true);
  const [walletCap, setWalletCap]               = useState(20);
  const [loading, setLoading]                   = useState(true);
  const [saving, setSaving]                     = useState(false);
  const [message, setMessage]                   = useState({ type: '', text: '' });

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getVendorLoyaltySettings();
        setLoyaltyEnabled(data.loyaltyDiscountsEnabled ?? true);
        setWalletCap(data.walletCapPercent ?? 20);
      } catch (err) {
        console.warn('Failed to load loyalty settings:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    const cap = Number(walletCap);
    if (isNaN(cap) || cap < 1 || cap > 100) {
      setMessage({ type: 'error', text: 'Wallet cap must be between 1% and 100%.' });
      return;
    }
    try {
      setSaving(true);
      setMessage({ type: '', text: '' });
      await updateVendorLoyaltySettings({
        loyaltyDiscountsEnabled: loyaltyEnabled,
        walletCapPercent:        cap
      });
      setMessage({ type: 'success', text: 'Loyalty settings saved successfully!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="v-card" style={{ textAlign: 'center', padding: 40 }}>
        <p>Loading loyalty settings...</p>
      </div>
    );
  }

  return (
    <div className="v-card">
      {/* Header */}
      <div style={{ marginBottom: 25 }}>
        <h3 style={{ color: '#2b3674', margin: 0 }}>Loyalty Discount Settings</h3>
        <p style={{ color: '#a3aed0', margin: '5px 0 0', fontSize: 14 }}>
          Control how customer loyalty wallet credits apply to your orders
        </p>
      </div>

      {/* Alert message */}
      {message.text && (
        <div style={{
          padding: '12px 20px', borderRadius: 8, marginBottom: 20,
          background: message.type === 'success' ? '#dcfce7' : '#fef2f2',
          color:      message.type === 'success' ? '#16a34a' : '#ef4444',
          fontWeight: 500
        }}>
          {message.text}
        </div>
      )}

      <div style={{ background: '#f8fafc', borderRadius: 12, padding: 25, border: '1px solid #e2e8f0' }}>

        {/* Toggle: accept wallet discounts */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 15, marginBottom: 20 }}>
          <div style={{ marginTop: 5 }}>
            <Toggle checked={loyaltyEnabled} onChange={e => setLoyaltyEnabled(e.target.checked)} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#2b3674' }}>
              Accept loyalty wallet discounts from customers
            </p>
            <p style={{ margin: '5px 0 0', fontSize: 13, color: '#64748b' }}>
              When <strong>ON</strong>: customers can use wallet credit earned from loyalty points when renewing at
              your kitchen. You receive the net amount and commission is calculated on the net amount too —
              so the program is cost-neutral for you.<br />
              When <strong>OFF</strong>: wallet credit is never applied at your kitchen; customers pay full price.
            </p>
          </div>
        </div>

        {/* Wallet cap — only shown when loyalty enabled */}
        {loyaltyEnabled && (
          <div style={{ paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: '#2b3674', display: 'block', marginBottom: 8 }}>
              Maximum wallet discount per order (% of order value)
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number"
                className="v-input"
                value={walletCap}
                onChange={e => setWalletCap(e.target.value)}
                min="1"
                max="100"
                style={{ width: 80 }}
              />
              <span style={{ color: '#374151', fontWeight: 600 }}>%</span>
            </div>

            <p style={{ fontSize: 12, color: '#64748b', margin: '8px 0 0' }}>
              Default is 20%. A customer with ₹200 wallet credit on a ₹500 order can use at most ₹{Math.floor(500 * walletCap / 100)} (with your current cap).
              Set lower to limit the maximum discount per order.
            </p>

            {/* Info box */}
            <div style={{
              background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: 8, padding: '12px 16px', marginTop: 16
            }}>
              <p style={{ margin: 0, fontSize: 13, color: '#1d4ed8' }}>
                💡 <strong>How it works:</strong> When a customer uses ₹{Math.floor(500 * walletCap / 100)} wallet on a ₹500 order,
                you receive ₹{500 - Math.floor(500 * walletCap / 100)} (net). Commission is
                calculated on ₹{500 - Math.floor(500 * walletCap / 100)} — not the full ₹500 — so you're not
                double-charged.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      <div style={{ marginTop: 25 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: saving ? '#94a3b8' : '#f26522',
            color: 'white', border: 'none',
            padding: '12px 30px', borderRadius: 10,
            fontSize: 15, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 14px rgba(242, 101, 34, 0.3)'
          }}
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};

export default LoyaltySettings;
