import { useEffect, useState } from 'react';
import { getAuthItem } from '../../../utils/authStorage';
import VendorGrid from './VendorGrid';

const ORANGE = '#f26522';

const apiFetch = async (url, opts = {}) => {
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: 'Bearer ' + getAuthItem('token'), 'Content-Type': 'application/json', ...opts.headers },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || 'Request failed');
  return data;
};

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
const fmtCurrency = n => '₹' + (n || 0).toLocaleString('en-IN');

const VendorUsersPanel = ({ vendor, onBack }) => {
  const [users,     setUsers]    = useState([]);
  const [stats,     setStats]    = useState({});
  const [loading,   setLoading]  = useState(true);
  const [search,    setSearch]   = useState('');
  const [filter,    setFilter]   = useState('all');
  const [toggling,  setToggling] = useState({});
  const [toast,     setToast]    = useState(null);
  const [exporting, setExporting] = useState(false);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handleExportSubscribers = async () => {
    setExporting(true);
    try {
      const safeName = (vendor.kitchenName || 'vendor').replace(/\s+/g, '-');
      await downloadCSV(
        `/admin/export/users?vendorId=${vendor._id}`,
        `subscribers-${safeName}-${new Date().toISOString().slice(0, 7)}.csv`
      );
    } catch (err) {
      showToast(err.message || 'Export failed', false);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => { load(); }, []);

  const load = () => {
    setLoading(true);
    apiFetch(`/api/admin/vendor-subscribers/${vendor._id}`)
      .then(d => {
        setUsers(d.users || []);
        setStats({ totalApp: d.totalAppUsers || 0, totalManual: d.totalManualCustomers || 0 });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleToggle = async (userId, isCurrentlyActive) => {
    if (!userId) return;
    const action = isCurrentlyActive ? 'suspend' : 'activate';
    if (!window.confirm(`${action === 'suspend' ? 'Suspend' : 'Activate'} this user?`)) return;
    setToggling(t => ({ ...t, [userId]: true }));
    try {
      await apiFetch(`/api/admin/users/${userId}/${action}`, { method: 'PATCH' });
      setUsers(us => us.map(u => u.userId === userId ? { ...u, accountActive: !isCurrentlyActive } : u));
      showToast(`User ${action === 'suspend' ? 'suspended' : 'activated'} successfully`);
    } catch (err) {
      showToast(err.message || `Failed to ${action} user`, false);
    } finally {
      setToggling(t => ({ ...t, [userId]: false }));
    }
  };

  const matchesSearch = (u) =>
    !search ||
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.phone?.includes(search);

  const filtered = users.filter(u => {
    if (filter === 'active'   && !u.isActive)  return false;
    if (filter === 'inactive' && u.isActive)   return false;
    if (filter === 'manual'   && !u.isManual)  return false;
    return matchesSearch(u);
  });

  const initials = name => (name || 'U').charAt(0).toUpperCase();

  return (
    <div style={{ position: 'relative' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          background: toast.ok ? '#16a34a' : '#dc2626', color: 'white',
          padding: '12px 20px', borderRadius: '10px', fontWeight: '600', fontSize: '14px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>{toast.msg}</div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', color: '#374151' }}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: '20px' }}>👥 {vendor.kitchenName} — Subscribers</h2>
          <div style={{ display: 'flex', gap: '16px', marginTop: '5px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}><strong style={{ color: '#1a1a2e' }}>{users.length}</strong> total subscribers</span>
            <span style={{ fontSize: '12px', color: '#64748b' }}><strong style={{ color: '#16a34a' }}>{stats.totalApp}</strong> app users</span>
            <span style={{ fontSize: '12px', color: '#64748b' }}><strong style={{ color: '#8b5cf6' }}>{stats.totalManual}</strong> offline customers</span>
          </div>
        </div>
        <button
          onClick={handleExportSubscribers}
          disabled={exporting}
          style={{ padding: '8px 16px', background: exporting ? '#f1f5f9' : ORANGE, color: exporting ? '#94a3b8' : 'white', border: 'none', borderRadius: '8px', cursor: exporting ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px', flexShrink: 0 }}
        >
          {exporting ? ' Downloading…' : ' Export CSV'}
        </button>
      </div>

      {/* Search + filter */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          placeholder="Search by name, email or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '200px', padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }}
        />
        {[['all', 'All'], ['active', ' Active'], ['inactive', ' Inactive'], ['manual', ' Offline']].map(([val, lbl]) => (
          <button key={val} onClick={() => setFilter(val)} style={{
            padding: '8px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontWeight: '600', fontSize: '12px',
            background: filter === val ? ORANGE : '#f1f5f9', color: filter === val ? 'white' : '#64748b',
          }}>{lbl}</button>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading subscribers…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>👥</div>
            <div style={{ fontWeight: '700', color: '#1a1a2e' }}>No subscribers found</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>
                  {['User', 'Contact', 'Orders', 'Spent', 'Sub Status', 'Last Active', 'Account', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '13px', opacity: u.accountActive === false ? 0.6 : 1 }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                          background: u.isManual ? '#f3f4f6' : ORANGE + '20',
                          color: u.isManual ? '#6b7280' : ORANGE,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '14px',
                        }}>{initials(u.name)}</div>
                        <div>
                          <div style={{ fontWeight: '600', color: '#1a1a2e' }}>{u.name || '—'}</div>
                          {u.isManual && <span style={{ fontSize: '10px', background: '#f3f4f6', color: '#6b7280', padding: '1px 5px', borderRadius: '4px', fontWeight: '600' }}>Offline</span>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px' }}>
                      <div style={{ color: '#374151' }}>{u.phone || '—'}</div>
                      <div style={{ color: '#94a3b8', fontSize: '11px' }}>{u.email !== '—' ? u.email : ''}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: '700', color: '#1a1a2e', textAlign: 'center' }}>{u.totalOrders}</td>
                    <td style={{ padding: '12px 16px', fontWeight: '600', color: '#16a34a' }}>{fmtCurrency(u.totalSpent)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {u.isActive ? (
                        <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>Active</span>
                      ) : (
                        <span style={{ background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>Inactive</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {u.lastActiveDate ? (
                        <>
                          <div>{fmtDate(u.lastActiveDate)}</div>
                          {u.daysSinceActive !== null && <div style={{ color: u.daysSinceActive <= 7 ? '#16a34a' : '#f59e0b' }}>{u.daysSinceActive}d ago</div>}
                        </>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {u.accountActive === false ? (
                        <span style={{ background: '#fef2f2', color: '#dc2626', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>Suspended</span>
                      ) : (
                        <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>Active</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {!u.isManual && u.userId && (
                        <button
                          onClick={() => handleToggle(u.userId, u.accountActive !== false)}
                          disabled={toggling[u.userId]}
                          style={{
                            padding: '5px 10px', borderRadius: '6px', border: 'none', cursor: toggling[u.userId] ? 'not-allowed' : 'pointer',
                            fontSize: '11px', fontWeight: '700', opacity: toggling[u.userId] ? 0.6 : 1,
                            background: u.accountActive === false ? '#f0fdf4' : '#fef2f2',
                            color:      u.accountActive === false ? '#16a34a' : '#dc2626',
                          }}
                        >
                          {toggling[u.userId] ? '…' : u.accountActive === false ? 'Activate' : 'Suspend'}
                        </button>
                      )}
                      {u.isManual && <span style={{ fontSize: '11px', color: '#94a3b8' }}>Offline</span>}
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

const AdminUsers = () => {
  const [selectedVendor, setSelectedVendor] = useState(null);

  if (selectedVendor) {
    return <VendorUsersPanel vendor={selectedVendor} onBack={() => setSelectedVendor(null)} />;
  }

  return <VendorGrid onSelectVendor={setSelectedVendor} statType="users" />;
};

export default AdminUsers;
