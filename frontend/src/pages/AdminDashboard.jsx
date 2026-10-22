import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminDashboardHome from '../components/dashboard/admin/AdminDashboardHome';
import AdminDelivery from '../components/dashboard/admin/AdminDelivery';
import AdminOrders from '../components/dashboard/admin/AdminOrders';
import AdminProfile from '../components/dashboard/admin/AdminProfile';
import AdminReviews from '../components/dashboard/admin/AdminReviews';
import AdminSidebar from '../components/dashboard/admin/AdminSidebar';
import AdminUsers from '../components/dashboard/admin/AdminUsers';
import Reports from '../components/dashboard/admin/Reports';
import VendorManagement from '../components/dashboard/admin/VendorManagement';
import { getAuthItem, removeAuthItem } from '../utils/authStorage';
import './AdminDashboard.css';

const ORANGE = '#f26522';

const getToken = () => getAuthItem('token');

const apiFetch = (url, opts = {}) =>
  fetch(url, {
    ...opts,
    headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json', ...opts.headers },
  }).then(r => r.json());

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

export default function AdminDashboard() {
  const [activeTab, setActiveTab]   = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [alerts, setAlerts]         = useState([]);
  const [alertCounts, setAlertCounts] = useState({});

  const navigate = useNavigate();

  // Auth check
  useEffect(() => {
    const token = getAuthItem('token');
    const user  = getAuthItem('user');
    if (!token || !user) { navigate('/login'); return; }
    try {
      const userData = JSON.parse(user);
      if (userData.role !== 'admin') { navigate('/'); return; }
      setLoading(false);
    } catch { navigate('/login'); }
  }, [navigate]);

  // Load alerts on mount to populate sidebar badges
  useEffect(() => { loadAlerts(); }, []);

  const loadAlerts = () => {
    apiFetch('/api/admin/alerts')
      .then(data => {
        const al = data.alerts || [];
        setAlerts(al);
        setAlertCounts({
          pendingVendors:      al.find(a => a.category === 'vendors')?.count    || 0,
          flaggedReviews:      al.find(a => a.category === 'reviews')?.count    || 0,
          overdueCommissions:  al.find(a => a.category === 'commission')?.count || 0,
          pendingTransactions: al.find(a => a.category === 'orders')?.count     || 0,
        });
      })
      .catch(e => console.error('alerts load:', e));
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const handleLogout = () => {
    removeAuthItem('token');
    removeAuthItem('user');
    navigate('/login');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':  return <AdminDashboardHome onTabChange={handleTabChange} />;
      case 'requests':   return <VendorManagement />;
      case 'users':      return <AdminUsers />;
      case 'orders':     return <AdminOrders />;
      case 'reviews':    return <AdminReviews />;
      case 'delivery':   return <AdminDelivery />;
      case 'commission': return <Reports />;
      case 'profile':    return <AdminProfile />;
      default:           return <AdminDashboardHome onTabChange={handleTabChange} />;
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #f1f5f9', borderTop: `4px solid ${ORANGE}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>Loading your dashboard…</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>⚙️</div>
          <h2 style={{ color: '#2b3674', margin: '0 0 8px 0', fontSize: '22px' }}>Admin Panel Unavailable</h2>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 24px 0', lineHeight: '1.6' }}>Could not connect to server.</p>
          <button onClick={() => { setError(''); setLoading(true); window.location.reload(); }} style={{ background: ORANGE, color: 'white', border: 'none', padding: '12px 28px', borderRadius: '10px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', width: '100%', marginBottom: '12px' }}>
            🔄 Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">

      {/* Mobile Topbar */}
      <div className="admin-topbar">
        <span className="admin-topbar-brand">MealSetu Admin</span>
        <button className="admin-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <span /><span /><span />
        </button>
      </div>

      {/* Backdrop */}
      <div className={`admin-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      <AdminSidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        alertCounts={alertCounts}
      />

      <div className="admin-content">
        {renderContent()}
      </div>

    </div>
  );
}
