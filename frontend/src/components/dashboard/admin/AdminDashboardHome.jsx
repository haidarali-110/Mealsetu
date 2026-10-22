import { useCallback, useEffect, useState } from 'react';
import { downloadCSV } from '../../../utils/api';
import { getAuthItem } from '../../../utils/authStorage';

const ORANGE = '#f26522';

const apiFetch = async (url, opts = {}) => {
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: 'Bearer ' + getAuthItem('token'), 'Content-Type': 'application/json', ...opts.headers },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || `Request failed (${r.status})`);
  return data;
};

const fmtCurrency = n => '₹' + (n || 0).toLocaleString('en-IN');

const statusColors = {
  active: '#16a34a', pending: '#f59e0b', trial: '#0ea5e9',
  expired: '#94a3b8', cancelled: '#dc2626', completed: '#16a34a',
};

const PLAN_COLORS = { Monthly: ORANGE, Weekly: '#0ea5e9', Trial: '#16a34a', Daily: '#8b5cf6' };

const AdminDashboardHome = ({ onTabChange }) => {
  const [dash, setDash]               = useState(null);
  const [alerts, setAlerts]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [refreshing, setRefreshing]   = useState(false);
  const [exporting, setExporting]     = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  // New state for leaderboard and pulse
  const [leaderboard, setLeaderboard] = useState([]);
  const [pulse, setPulse] = useState({});

  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e) => setShowExportMenu(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showExportMenu]);

  const handleExport = async (type, e) => {
    e.stopPropagation();
    setExporting(type);
    setShowExportMenu(false);
    const now = new Date().toISOString().slice(0, 7);
    try {
      const map = {
        orders:   ['/admin/export/orders',               `mealsetu-orders-${now}.csv`],
        users:    ['/admin/export/users',                `mealsetu-users-${now}.csv`],
        delivery: [`/admin/export/delivery?month=${now}`, `mealsetu-delivery-${now}.csv`],
        summary:  [`/admin/export/summary?month=${now}`,  `mealsetu-summary-${now}.csv`],
      };
      const [endpoint, filename] = map[type];
      await downloadCSV(endpoint, filename);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setExporting('');
    }
  };

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setError('');
    try {
      const [dashData, alertData] = await Promise.all([
        apiFetch('/api/admin/dashboard'),
        apiFetch('/api/admin/alerts'),
      ]);
      setDash(dashData);
      setAlerts(alertData.alerts || []);
    } catch (e) {
      setError(e.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Fetch leaderboard data
  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const token = getAuthItem('token');
        const res = await fetch(
          '/api/admin/dashboard/leaderboard',
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        const data = await res.json();
        setLeaderboard(data.leaderboard || []);
        setPulse(data.pulse || {});
      } catch (err) {
        console.error('Leaderboard fetch error:', err);
      }
    };
    fetchLeaderboard();
  }, []);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
      <div style={{ fontSize: '36px', marginBottom: '12px' }}> </div>
      <div style={{ fontSize: '14px' }}>Loading dashboard…</div>
    </div>
  );

  if (error) return (
    <div style={{ textAlign: 'center', padding: '80px' }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}></div>
      <div style={{ fontWeight: '700', color: '#1a1a2e', fontSize: '18px', marginBottom: '8px' }}>Dashboard unavailable</div>
      <div style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>{error}</div>
      <button onClick={() => { setLoading(true); load(); }} style={{ padding: '10px 28px', background: '#f26522', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
         Retry
      </button>
    </div>
  );

  const s            = dash?.stats     || {};
  const charts       = dash?.charts    || {};
  const recentOrders = dash?.recentOrders || [];
  const trend        = charts.last7DaysTrend || [];
  const critical     = alerts.filter(a => a.type === 'error');
  const maxRevenue   = Math.max(...trend.map(d => d.revenue), 1);

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', color: '#1a1a2e' }}>{greeting}, Admin </h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>Here's what's happening on MealSetu today</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            style={{ padding: '8px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: refreshing ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600', color: '#64748b', opacity: refreshing ? 0.6 : 1 }}
          >
            {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
          </button>

          {/* Export dropdown */}
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowExportMenu(m => !m)}
              disabled={!!exporting}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: exporting ? '#f1f5f9' : ORANGE, border: 'none', borderRadius: '8px', cursor: exporting ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600', color: exporting ? '#94a3b8' : 'white' }}
            >
              {exporting ? '⏳ Downloading…' : ' Export ▾'}
            </button>

            {showExportMenu && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, minWidth: '230px', overflow: 'hidden' }}>
                {[
                  { key: 'orders',   icon: '', label: 'All Orders CSV',        sub: 'All orders across all vendors' },
                  { key: 'users',    icon: '', label: 'All Users CSV',         sub: 'Platform user list' },
                  { key: 'delivery', icon: '', label: 'Delivery Report CSV',   sub: "This month's delivery data" },
                  { key: 'summary',  icon: '', label: 'Platform Summary CSV',  sub: 'Monthly business overview' },
                ].map(item => (
                  <div
                    key={item.key}
                    onClick={(e) => handleExport(item.key, e)}
                    style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}
                  >
                    <span style={{ fontSize: '20px' }}>{item.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e' }}>{exporting === item.key ? 'Downloading…' : item.label}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{item.sub}</div>
                    </div>
                    {exporting === item.key && (
                      <div style={{ width: '14px', height: '14px', border: '2px solid #f1f5f9', borderTop: `2px solid ${ORANGE}`, borderRadius: '50%', animation: 'spin 0.6s linear infinite', flexShrink: 0 }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CRITICAL ALERTS BANNER ── */}
      {critical.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '14px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '18px' }}></span>
          <span style={{ fontWeight: '700', color: '#dc2626', fontSize: '14px' }}>
            {critical.length} critical issue{critical.length > 1 ? 's' : ''} need attention
          </span>
          {critical.map((a, i) => (
            <span
              key={i}
              onClick={() => onTabChange(a.tab)}
              style={{ background: '#dc2626', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
            >
              {a.icon} {a.title}
            </span>
          ))}
        </div>
      )}

      {/* ── REVENUE STAT CARDS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        {[
          { icon: '', label: "Today's Revenue",      value: fmtCurrency(s.revenue?.today),    sub: `${s.orders?.today || 0} orders today`, color: ORANGE },
          { icon: '', label: 'This Month',            value: fmtCurrency(s.revenue?.thisMonth), color: '#0ea5e9' },
          { icon: '', label: 'All-Time Revenue',      value: fmtCurrency(s.revenue?.allTime),  color: '#8b5cf6' },
          { icon: '', label: 'Active Subscriptions',  value: s.orders?.active || 0,            sub: 'Currently running', color: '#16a34a' },
        ].map(c => (
          <div key={c.label} style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', borderTop: `4px solid ${c.color}` }}>
            <div style={{ fontSize: '26px', marginBottom: '8px' }}>{c.icon}</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#1a1a2e', lineHeight: 1.1 }}>{c.value}</div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginTop: '4px' }}>{c.label}</div>
            {c.sub && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── NEW INSIGHT CARDS (ROW 2) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        
        {/* CARD 1 — Commission Health */}
        {/* <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', borderLeft: `4px solid ${ORANGE}` }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a2e', marginBottom: '12px' }}>Commission This Month</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>Collected</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#16a34a' }}>₹{(pulse.commissionCollected || 0).toLocaleString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>Pending</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#dc2626' }}>₹{(pulse.commissionPending || 0).toLocaleString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Vendors Settled</span>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#1a1a2e' }}>{leaderboard.filter(v => v.commissionStatus === 'auto_deducted' || v.commissionStatus === 'paid').length} / {leaderboard.length}</span>
            </div>
          </div>
        </div> */}

        {/* CARD 2 — Vendor Performance */}
        {/* <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', borderLeft: `4px solid #0ea5e9` }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a2e', marginBottom: '12px' }}>Vendor Activity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>Active / Total</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a2e' }}>{s.vendors?.active || 0} / {s.vendors?.total || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>0 Orders (This Wk)</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#dc2626' }}>{pulse.vendorsWithNoOrders || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Top Earner</span>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#1a1a2e' }}>{leaderboard[0]?.kitchenName || 'N/A'} (₹{(leaderboard[0]?.totalRevenue || 0).toLocaleString('en-IN')})</span>
            </div>
          </div>
        </div> */}

        {/* CARD 3 — Subscription Health */}
        {/* <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', borderLeft: `4px solid #16a34a` }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a2e', marginBottom: '12px' }}>Subscription Status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>Active Subs</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a2e' }}>{s.orders?.active || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>Expiring This Week</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#f59e0b' }}>{s.orders?.expiring || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>New This Month</span>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#16a34a' }}>{s.orders?.newThisMonth || 0}</span>
            </div>
          </div>
        </div> */}

      </div>

      {/* ── MINI-STAT ROW ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total Customer',        value: s.users?.total || 0,                                        sub: `+${s.users?.newToday || 0} today`, color: '#0ea5e9' },
          { label: 'Active Vendors',     value: `${s.vendors?.active || 0}/${s.vendors?.total || 0}`,         color: '#16a34a' },
          { label: 'Pending Approvals',  value: s.vendors?.pending || 0, color: (s.vendors?.pending || 0) > 0 ? '#f59e0b' : '#16a34a', tab: 'requests' },
        ].map(m => (
          <div
            key={m.label}
            onClick={m.tab ? () => onTabChange(m.tab) : undefined}
            style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '14px 16px', cursor: m.tab ? 'pointer' : 'default' }}
          >
            <div style={{ fontSize: '18px', fontWeight: '800', color: m.color, lineHeight: 1.1 }}>{m.value}</div>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', marginTop: '3px' }}>{m.label}</div>
            {m.sub && <div style={{ fontSize: '10px', color: '#94a3b8' }}>{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── CHARTS ROW ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '20px' }}>

        {/* 7-day revenue bar chart */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px' }}> Revenue — Last 7 Days</div>
          {trend.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '32px 0' }}>No data yet</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '130px' }}>
              {trend.map((d, i) => {
                const barH = Math.max((d.revenue / maxRevenue) * 96, d.revenue > 0 ? 8 : 2);
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '4px' }}>
                    <div style={{ fontSize: '9px', color: '#64748b', fontWeight: '600', minHeight: '12px' }}>
                      {d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k` : d.revenue > 0 ? d.revenue : ''}
                    </div>
                    <div
                      title={`${d.date}: ₹${d.revenue} · ${d.orders} orders`}
                      style={{ width: '100%', borderRadius: '4px 4px 0 0', height: `${barH}px`, minHeight: '2px', background: i === 6 ? ORANGE : '#fed7aa', transition: 'height 0.3s ease' }}
                    />
                    <div style={{ fontSize: '9px', color: '#94a3b8', textAlign: 'center', lineHeight: 1.2 }}>{d.date}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Plan mix */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px' }}> Active Plan Mix</div>
          {(charts.planBreakdown || []).length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '32px 0' }}>No active plans</div>
          ) : (() => {
            const total = charts.planBreakdown.reduce((sum, p) => sum + p.count, 0);
            return charts.planBreakdown.map((p, i) => {
              const pct = total > 0 ? Math.round((p.count / total) * 100) : 0;
              const c   = PLAN_COLORS[p.plan] || `hsl(${i * 70}, 65%, 50%)`;
              return (
                <div key={p.plan} style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}>
                    <span style={{ fontWeight: '600', color: '#374151' }}>{p.plan}</span>
                    <span style={{ color: '#64748b' }}>{p.count} ({pct}%)</span>
                  </div>
                  <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* ── BOTTOM 2-COL: LEADERBOARD + PLATFORM PULSE ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', marginBottom: '20px' }}>

        {/* COMMENTED OUT - not needed
        <div className="recent-orders-section">
          ... entire recent orders block ...
        </div>
        */}

        {/* ── VENDOR LEADERBOARD ── */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h3 style={{ margin: 0, color: '#1a2240', fontSize: '16px' }}>
              🏆 Vendor Leaderboard — This Month
            </h3>
            <span style={{
              fontSize: '12px',
              color: '#64748b',
              background: '#f8fafc',
              padding: '4px 12px',
              borderRadius: '20px'
            }}>
              By gross revenue
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Rank</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Kitchen</th>
                <th style={{ padding: '10px', textAlign: 'right', fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Revenue</th>
                <th style={{ padding: '10px', textAlign: 'right', fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Orders</th>
                <th style={{ padding: '10px', textAlign: 'right', fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Commission</th>
                <th style={{ padding: '10px', textAlign: 'center', fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((v, i) => (
                <tr key={v._id} style={{
                  borderBottom: '1px solid #f8fafc',
                  background: i === 0 ? '#fffbeb' : 'white'
                }}>
                  <td style={{ padding: '14px 10px' }}>
                    <span style={{
                      fontSize: '18px',
                      fontWeight: '800',
                      color: i === 0 ? '#f59e0b' :
                             i === 1 ? '#94a3b8' :
                             i === 2 ? '#cd7c2f' : '#94a3b8'
                    }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' :
                       i === 2 ? '🥉' : `#${i + 1}`}
                    </span>
                  </td>
                  <td style={{ padding: '14px 10px' }}>
                    <div style={{
                      fontWeight: '700',
                      color: '#1a2240',
                      fontSize: '14px'
                    }}>
                      {v.kitchenName}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#64748b',
                      marginTop: '2px'
                    }}>
                      {v.ownerName}
                    </div>
                  </td>
                  <td style={{
                    padding: '14px 10px',
                    textAlign: 'right',
                    fontWeight: '700',
                    color: '#1a2240',
                    fontSize: '15px'
                  }}>
                    ₹{v.totalRevenue?.toLocaleString('en-IN')}
                  </td>
                  <td style={{
                    padding: '14px 10px',
                    textAlign: 'right',
                    color: '#64748b'
                  }}>
                    {v.totalOrders}
                  </td>
                  <td style={{
                    padding: '14px 10px',
                    textAlign: 'right',
                    color: '#f97316',
                    fontWeight: '600'
                  }}>
                    ₹{v.commissionDue?.toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '14px 10px', textAlign: 'center' }}>
                    <span style={{
                      padding: '3px 10px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: '700',
                      background: v.commissionStatus === 'auto_deducted'
                        ? '#dbeafe' : '#fef3c7',
                      color: v.commissionStatus === 'auto_deducted'
                        ? '#1d4ed8' : '#d97706'
                    }}>
                      {v.commissionStatus === 'auto_deducted'
                        ? '⚡ Settled' : '⏳ Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* COMMENTED OUT - not needed
        <div className="service-alerts-section">
          ... entire service alerts block ...
        </div>
        */}

        {/* ── PLATFORM PULSE ── */}
        {/* <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
        }}>
          <h3 style={{
            margin: '0 0 20px',
            color: '#1a2240',
            fontSize: '16px'
          }}>
            📊 Platform Pulse
          </h3>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>New vendors this month</span>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#0ea5e9' }}>{s.vendors?.newThisMonth || 0}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>Subscriptions expiring this week</span>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#f59e0b' }}>{s.orders?.expiring || 0}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>Vendors with no orders this week</span>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#dc2626' }}>{pulse.vendorsWithNoOrders || 0}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>Commission collected this month</span>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#16a34a' }}>₹{(pulse.commissionCollected || 0).toLocaleString('en-IN')}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>Commission pending</span>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#f97316' }}>₹{(pulse.commissionPending || 0).toLocaleString('en-IN')}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>Avg order value this month</span>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#0ea5e9' }}>₹{(pulse.avgOrderValue || 0).toLocaleString('en-IN')}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>Most popular plan</span>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a2e' }}>
              {charts.planBreakdown?.[0] ? `${charts.planBreakdown[0].plan} (${Math.round((charts.planBreakdown[0].count / charts.planBreakdown.reduce((a, b) => a + b.count, 0)) * 100)}%)` : 'N/A'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>Platform health</span>
            <span style={{ fontSize: '14px', fontWeight: '700', color: alerts.filter(a => a.type === 'error').length > 0 ? '#dc2626' : '#16a34a' }}>
              {alerts.filter(a => a.type === 'error').length > 0 ? `${alerts.filter(a => a.type === 'error').length} issues` : 'All systems normal'}
            </span>
          </div>
        </div> */}

      </div>

    </div>
  );
};

export default AdminDashboardHome;