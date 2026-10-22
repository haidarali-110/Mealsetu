import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiCall } from '../../../utils/api';

// ─── Helpers ────────────────────────────────────────────────────────────────
const daysAgo = (d) => {
  if (!d) return '—';
  const n = Math.floor((Date.now() - new Date(d)) / 86400000);
  return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n}d ago`;
};

// Light-theme level badge colours
const LEVEL_STYLES = {
  Starter:  { bg: '#f1f5f9', color: '#475569',  border: '#cbd5e1' },
  Bronze:   { bg: '#fef3e2', color: '#92400e',  border: '#fcd34d' },
  Silver:   { bg: '#f0f4f8', color: '#475569',  border: '#94a3b8' },
  Gold:     { bg: '#fef9c3', color: '#92400e',  border: '#fde047' },
  Platinum: { bg: '#e0f2fe', color: '#0369a1',  border: '#7dd3fc' },
};

const LevelBadge = ({ level }) => {
  const s = LEVEL_STYLES[level?.name] || LEVEL_STYLES.Starter;
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      {level?.icon} {level?.name || 'Starter'}
    </span>
  );
};

const PlanChip = ({ type }) => {
  const s = {
    Monthly: { bg: '#ede9fe', color: '#6d28d9' },
    Weekly:  { bg: '#dbeafe', color: '#1d4ed8' },
    Trial:   { bg: '#f1f5f9', color: '#475569' },
    Tiffin:  { bg: '#fef9c3', color: '#92400e' },
  };
  const c = s[type] || s.Trial;
  return (
    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
      marginRight: 4, display: 'inline-block', background: c.bg, color: c.color }}>
      {type}
    </span>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────
const CustomerLoyalty = () => {
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [data,        setData]        = useState({ totalCustomers: 0, customers: [] });
  const [search,      setSearch]      = useState('');
  const [levelFilter, setLevelFilter] = useState('All');
  const [sortBy,      setSortBy]      = useState('totalSpent');
  const [hoveredRow,  setHoveredRow]  = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const res = await apiCall('/vendor/customer-loyalty');
      setData(res);
    } catch (e) {
      setError('Failed to load customer loyalty data. ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let list = [...data.customers];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
      );
    }
    if (levelFilter !== 'All') {
      list = list.filter(c => c.loyaltyLevel?.name === levelFilter);
    }
    list.sort((a, b) => {
      if (sortBy === 'totalSpent') return b.totalSpent - a.totalSpent;
      if (sortBy === 'orders')     return b.totalOrders - a.totalOrders;
      if (sortBy === 'points')     return (b.loyaltyPoints || 0) - (a.loyaltyPoints || 0);
      if (sortBy === 'recent')     return new Date(b.lastOrder) - new Date(a.lastOrder);
      return 0;
    });
    return list;
  }, [data.customers, search, levelFilter, sortBy]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const repeatCount  = data.customers.filter(c => c.totalOrders > 1).length;
  const repeatPct    = data.totalCustomers > 0
    ? ((repeatCount / data.totalCustomers) * 100).toFixed(0) : 0;
  const totalSpentAll = data.customers.reduce((s, c) => s + c.totalSpent, 0);
  const avgLtv        = data.totalCustomers > 0
    ? Math.round(totalSpentAll / data.totalCustomers) : 0;

  const exportCSV = () => {
    const hdrs = ['Name', 'Email', 'Phone', 'Total Orders', 'Total Spent (₹)',
      'Loyalty Level', 'Points', 'Total Subscriptions', 'Last Order'];
    const rows = filtered.map(c => [
      `"${c.name || ''}"`, `"${c.email || ''}"`, c.phone || '',
      c.totalOrders, (c.totalSpent || 0).toFixed(2),
      `"${c.loyaltyLevel?.name || 'Starter'}"`, c.loyaltyPoints || 0,
      c.totalSubscriptions || 0,
      c.lastOrder ? new Date(c.lastOrder).toLocaleDateString('en-IN') : ''
    ]);
    const csv  = [hdrs, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `loyalty-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Shared input style (light theme) ──────────────────────────────────────
  const inputStyle = {
    background: '#fff', border: '1px solid #e8ecf0', color: '#1a202c',
    padding: '9px 14px', borderRadius: 8, fontSize: 13, outline: 'none',
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center',
      height: 300, background: '#f0f4f8' }}>
      <div style={{ textAlign: 'center', color: '#64748b' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #e8ecf0',
          borderTop: '3px solid #f26522', borderRadius: '50%',
          animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
        Loading customers…
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) return (
    <div style={{ padding: 24, background: '#f0f4f8' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 20,
        border: '1px solid #fecaca', color: '#ef4444' }}>
        ❌ {error}
        <button onClick={fetchData} style={{ marginLeft: 12, background: '#f26522', color: '#fff',
          border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    </div>
  );

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, background: '#f0f4f8', minHeight: '100vh' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e2d5a' }}>
             Customer Loyalty Insights
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Loyalty levels, points, and spending behaviour
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={fetchData} style={{ ...inputStyle, cursor: 'pointer',
            color: '#64748b', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
             Refresh
          </button>
          <button onClick={exportCSV} style={{
            background: '#f26522', color: '#fff', border: 'none',
            padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
            fontWeight: 700, fontSize: 13,
            boxShadow: '0 2px 8px rgba(242,101,34,0.25)'
          }}>
             Export CSV
          </button>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 20 }}>
        {[
          { icon: '', label: 'Total Customers',   value: data.totalCustomers,           sub: 'All-time unique customers' },
          { icon: '', label: 'Repeat Customers',  value: `${repeatCount} (${repeatPct}%)`, sub: 'Ordered more than once' },
          { icon: '', label: 'Avg Lifetime Value', value: `₹${(avgLtv || 0).toLocaleString('en-IN')}`, sub: 'Revenue per customer' },
        ].map(card => (
          <div key={card.label} style={{ background: '#fff', borderRadius: 14,
            padding: '20px 22px', border: '1px solid #e8ecf0',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>{card.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8',
                letterSpacing: '0.7px', textTransform: 'uppercase' }}>{card.label}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#f26522',
              lineHeight: 1, marginBottom: 4 }}>{card.value}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          style={{ ...inputStyle, flex: '1 1 200px', minWidth: 180,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          placeholder="🔍  Search name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={{ ...inputStyle, cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          value={levelFilter} onChange={e => setLevelFilter(e.target.value)}>
          {['All', 'Starter', 'Bronze', 'Silver', 'Gold', 'Platinum'].map(l => (
            <option key={l} value={l}>{l === 'All' ? '🏅 All Levels' : l}</option>
          ))}
        </select>
        <select style={{ ...inputStyle, cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="totalSpent">Sort: Total Spent</option>
          <option value="orders">Sort: Most Orders</option>
          <option value="points">Sort: Most Points</option>
          <option value="recent">Sort: Most Recent</option>
        </select>
      </div>

      {/* ── Table ── */}
      <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden',
        border: '1px solid #e8ecf0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

        {filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
            No customers found matching your filters
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e8ecf0' }}>
                  {['Customer', 'Plans', 'Orders', 'Total Spent', 'Level', 'Points', 'Last Order'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11,
                      color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px',
                      whiteSpace: 'nowrap', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.userId}
                    style={{ borderBottom: '1px solid #f1f5f9',
                      background: hoveredRow === c.userId ? '#fafbfc' : '#fff',
                      transition: 'background 0.15s' }}
                    onMouseEnter={() => setHoveredRow(c.userId)}
                    onMouseLeave={() => setHoveredRow(null)}>

                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#1a202c', fontSize: 14 }}>{c.name || '—'}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{c.email || ''}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {(c.planTypes || []).map(t => <PlanChip key={t} type={t} />)}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#1a202c', fontSize: 14,
                      fontWeight: 600, textAlign: 'center' }}>
                      {c.totalOrders}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#f26522',
                      fontWeight: 700, fontSize: 14 }}>
                      ₹{(c.totalSpent || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <LevelBadge level={c.loyaltyLevel} />
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 14,
                      color: (c.loyaltyPoints || 0) >= 300 ? '#d97706'
                           : (c.loyaltyPoints || 0) >= 100 ? '#f26522' : '#94a3b8' }}>
                      {c.loyaltyPoints || 0} pts
                    </td>
                    <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 13 }}>
                      {daysAgo(c.lastOrder)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8',
              fontSize: 12, borderTop: '1px solid #f1f5f9', background: '#fafbfc' }}>
              Showing {filtered.length} of {data.totalCustomers} customer{data.totalCustomers !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerLoyalty;
