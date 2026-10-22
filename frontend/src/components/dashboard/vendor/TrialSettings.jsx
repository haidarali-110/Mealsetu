import React, { useState, useEffect } from 'react';
import { updateVendorTrialSettings, getVendorProfile } from '../../../utils/api';

const TrialSettings = ({ trialSettings, setTrialSettings, trialSettingsMessage, setTrialSettingsMessage }) => {
  const [localTrialSettings, setLocalTrialSettings] = useState({
    trialEnabled: false,
    trialFee: 0
  });
  const [loading, setLoading] = useState(true);
  const [savingTrialSettings, setSavingTrialSettings] = useState(false);

  // Load current trial settings on mount
  useEffect(() => {
    const loadTrialSettings = async () => {
      try {
        const vendorData = await getVendorProfile();
        if (vendorData) {
          setLocalTrialSettings({
            trialEnabled: vendorData.trialEnabled === true,
            trialFee: vendorData.trialFee || 0
          });
          setTrialSettings({
            trialEnabled: vendorData.trialEnabled === true,
            trialFee: vendorData.trialFee || 0
          });
        }
      } catch (error) {
        console.warn('Failed to load trial settings:', error);
      } finally {
        setLoading(false);
      }
    };
    loadTrialSettings();
  }, []);

  const handleToggleChange = (e) => {
    const enabled = e.target.checked;
    setLocalTrialSettings(prev => ({
      ...prev,
      trialEnabled: enabled,
      // Reset fee to 0 when enabling, keep current value when toggling off
      trialFee: enabled ? (prev.trialFee || 0) : prev.trialFee
    }));
  };

  const handleFeeChange = (e) => {
    const value = parseInt(e.target.value) || 0;
    setLocalTrialSettings(prev => ({
      ...prev,
      trialFee: value < 0 ? 0 : value
    }));
  };

  const handleSave = async () => {
    try {
      setSavingTrialSettings(true);
      setTrialSettingsMessage({ type: '', text: '' });

      await updateVendorTrialSettings(localTrialSettings.trialEnabled, localTrialSettings.trialFee);

      // Update parent state
      setTrialSettings(localTrialSettings);

      setTrialSettingsMessage({ type: 'success', text: 'Trial settings saved successfully!' });
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setTrialSettingsMessage({ type: '', text: '' });
      }, 3000);
    } catch (error) {
      console.error('Failed to save trial settings:', error);
      setTrialSettingsMessage({ type: 'error', text: 'Failed to save settings: ' + error.message });
    } finally {
      setSavingTrialSettings(false);
    }
  };

  if (loading) {
    return (
      <div className="v-card" style={{ textAlign: 'center', padding: '40px' }}>
        <p>Loading trial settings...</p>
      </div>
    );
  }

  return (
    <div className="v-card">
      <div style={{ marginBottom: '25px' }}>
        <h3 style={{ color: '#2b3674', margin: 0 }}>Trial Settings</h3>
        <p style={{ color: '#a3aed0', margin: '5px 0 0 0', fontSize: '14px' }}>
          Configure your 2-day free trial offer for new customers
        </p>
      </div>

      {/* Success/Error Message */}
      {trialSettingsMessage.text && (
        <div style={{ 
          padding: '12px 20px', 
          borderRadius: '8px', 
          marginBottom: '20px',
          background: trialSettingsMessage.type === 'success' ? '#dcfce7' : '#fef2f2',
          color: trialSettingsMessage.type === 'success' ? '#16a34a' : '#ef4444',
          fontWeight: '500'
        }}>
          {trialSettingsMessage.text}
        </div>
      )}

      {/* Trial Settings Card */}
      <div style={{ 
        background: '#f8fafc', 
        borderRadius: '12px', 
        padding: '25px',
        border: '1px solid #e2e8f0'
      }}>
        {/* Toggle Section */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px', marginBottom: '20px' }}>
          <div style={{ marginTop: '5px' }}>
            <label style={{ 
              position: 'relative',
              display: 'inline-block',
              width: '50px',
              height: '26px'
            }}>
              <input 
                type="checkbox" 
                checked={localTrialSettings.trialEnabled}
                onChange={handleToggleChange}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute',
                cursor: 'pointer',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: localTrialSettings.trialEnabled ? '#16a34a' : '#cbd5e1',
                transition: '0.3s',
                borderRadius: '26px',
                display: 'block'
              }}></span>
              <span style={{
                position: 'absolute',
                content: '""',
                height: '20px',
                width: '20px',
                left: localTrialSettings.trialEnabled ? '28px' : '3px',
                bottom: '3px',
                backgroundColor: 'white',
                transition: '0.3s',
                borderRadius: '50%',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}></span>
            </label>
          </div>
          <div>
            <label style={{ 
              fontSize: '16px', 
              fontWeight: '600', 
              color: '#2b3674',
              cursor: 'pointer',
              display: 'block'
            }}>
              Enable 2 Day Free Trial for your customers
            </label>
            <p style={{ 
              fontSize: '13px', 
              color: '#64748b', 
              margin: '5px 0 0 0' 
            }}>
              When this is on, your kitchen name will show a Free Trial button to new users on the Order Meals page
            </p>
          </div>
        </div>

        {/* Trial Fee Input - Only visible when toggle is on */}
        {localTrialSettings.trialEnabled && (
          <div style={{ 
            marginTop: '20px', 
            paddingTop: '20px', 
            borderTop: '1px solid #e2e8f0' 
          }}>
            <label style={{ 
              fontSize: '14px', 
              fontWeight: '600', 
              color: '#2b3674',
              display: 'block',
              marginBottom: '8px'
            }}>
              Trial Fee in Rupees
            </label>
            <input 
              type="number" 
              className="v-input"
              value={localTrialSettings.trialFee}
              onChange={handleFeeChange}
              min="0"
              max="1000"
              style={{ width: '150px' }}
            />
            <p style={{ 
              fontSize: '12px', 
              color: '#64748b', 
              margin: '8px 0 0 0' 
            }}>
              Enter 0 to offer it completely free, or enter an amount like 20 or 30 to charge a small fee
            </p>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div style={{ marginTop: '25px' }}>
        <button 
          onClick={handleSave}
          disabled={savingTrialSettings}
          style={{ 
            background: savingTrialSettings ? '#94a3b8' : '#f26522',
            color: 'white',
            border: 'none',
            padding: '12px 30px',
            borderRadius: '10px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: savingTrialSettings ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 14px rgba(242, 101, 34, 0.3)'
          }}
        >
          {savingTrialSettings ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};

export default TrialSettings;

