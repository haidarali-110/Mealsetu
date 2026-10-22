import React from 'react';
import './AdminSidebar.css';

const AdminSidebar = ({ activeTab, onTabChange, onLogout, isOpen, onClose, alertCounts = {} }) => {

  const menuItems = [
    { key: 'dashboard',  label: ' Dashboard' },
    { key: 'requests',   label: ' Vendor Requests' },
    { key: 'users',      label: ' Vendors' },
    { key: 'orders',     label: ' Orders' },
    { key: 'reviews',    label: ' Reviews' },
    { key: 'delivery',   label: ' Delivery' },
    { key: 'commission', label: ' Commission' },
    { key: 'profile',    label: ' Profile' },
  ];

  const badgeFor = (key) => {
    const counts = {
      requests:   alertCounts.pendingVendors   || 0,
      reviews:    alertCounts.flaggedReviews    || 0,
      commission: alertCounts.overdueCommissions|| 0,
      orders:     alertCounts.pendingTransactions|| 0,
    };
    return counts[key] || 0;
  };

  return (
    <aside className={`admin-sidebar ${isOpen ? 'open' : ''}`}>

      <div className="admin-sidebar-logo">MealSetu Admin</div>

      <nav className="admin-nav">
        {menuItems.map((item) => {
          const badge = badgeFor(item.key);
          return (
            <div
              key={item.key}
              className={`admin-nav-item ${activeTab === item.key ? 'active' : ''}`}
              onClick={() => { onTabChange(item.key); if (onClose) onClose(); }}
            >
              <span style={{ flex: 1 }}>{item.label}</span>
              {badge > 0 && (
                <span style={{
                  background: '#dc2626',
                  color: 'white',
                  borderRadius: '50%',
                  minWidth: '20px',
                  height: '20px',
                  fontSize: '11px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                }}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="admin-sidebar-logout" onClick={onLogout}>
         Logout
      </div>

    </aside>
  );
};

export default AdminSidebar;
