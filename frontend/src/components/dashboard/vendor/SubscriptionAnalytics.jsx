import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
  ResponsiveContainer,
} from 'recharts';
import { getSubscriptionAnalytics } from '../../../utils/api';
import { onEvent, offEvent } from '../../../utils/socket';

// ─── Constants ────────────────────────────────────────────────────────────────
const PRIMARY  = '#f26522';
const BLUE     = '#3b82f6';
const GREEN    = '#16a34a';
const AMBER    = '#f59e0b';
const PURPLE   = '#7c3aed';
const GREY     = '#64748b';

const PIE_COLORS = [GREY, PRIMARY, GREEN];   // Trial, Weekly, Monthly

const fmt = (n) => (n || 0).toLocaleString('en-IN');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const churnColor = (rate) => {
  if (rate < 20) return GREEN;
  if (rate < 40) return AMBER;
  return '#ef4444';
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const Card = ({ children, style = {} }) => (
  <div style={{
    background: '#fff', borderRadius: 14, padding: '20px 22px',
    border: '1px solid #e8ecf0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    ...style,
  }}>
    {children}
  </div>
);

const SectionTitle = ({ children, sub }) => (
  <div style={{ marginBottom: 18 }}>
    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1e2d5a' }}>{children}</h3>
    {sub && <p style={{ margin: '4px 0 0', fontSize: 12, color: GREY }}>{sub}</p>}
  </div>
);

const MetricCard = ({ icon, label, value, valueColor = PRIMARY, sub, extra }) => (
  <Card>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.7px', textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
    <div style={{ fontSize: 32, fontWeight: 800, color: valueColor, lineHeight: 1, marginBottom: 4 }}>
      {value}
    </div>
    {sub && <div style={{ fontSize: 12, color: GREY, marginTop: 5 }}>{sub}</div>}
    {extra}
  </Card>
);

const ProgressBar = ({ pct, color = BLUE }) => (
  <div style={{ background: '#e2e8f0', borderRadius: 4, height: 6, marginTop: 8, overflow: 'hidden' }}>
    <div style={{ width: `${Math.min(pct, 100)}%`, background: color, height: '100%', borderRadius: 4, transition: 'width .4s' }} />
  </div>
);

const PlanBadge = ({ plan }) => {
  const cfg = {
    Trial:   { bg: '#f1f5f9', color: GREY },
    Weekly:  { bg: '#fff7ed', color: PRIMARY },
    Monthly: { bg: '#f0fdf4', color: GREEN },
  }[plan] || { bg: '#f1f5f9', color: GREY };
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color }}>
      {plan}
    </span>
  );
};

const DaysLeftBadge = ({ days }) => {
  const color = days <= 2 ? '#ef4444' : days <= 5 ? AMBER : GREEN;
  const bg    = days <= 2 ? '#fef2f2' : days <= 5 ? '#fffbeb' : '#f0fdf4';
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color }}>
      {days}d left
    </span>
  );
};

// Custom Recharts tooltip
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
      <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 12, color: '#1e2d5a' }}>{label || ''}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: '2px 0', fontSize: 12, color: p.color }}>
          {p.name}: <strong>{typeof p.value === 'number' && p.name.toLowerCase().includes('revenue') ? `₹${fmt(p.value)}` : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const SubscriptionAnalytics = () => {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoTick,    setAutoTick]    = useState(false); // flashes green dot on auto-refresh

  // silent=true → background refresh, no spinner
  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const res = await getSubscriptionAnalytics();
      setData(res);
      setLastUpdated(new Date());
      if (silent) {
        setAutoTick(true);
        setTimeout(() => setAutoTick(false), 1000); // flash the dot for 1 s
      }
    } catch (e) {
      if (!silent) setError(e.message || 'Failed to load analytics');
      // silent errors are swallowed — keeps UX clean
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time: refresh silently whenever backend emits 'analytics_update'
  // (socket is already connected + joined vendor room by VendorDashboard)
  useEffect(() => {
    const handler = () => fetchData(true);
    onEvent('analytics_update', handler);
    return () => offEvent('analytics_update', handler); // cleanup on unmount
  }, [fetchData]);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16 }}>
      <div style={{ width: 48, height: 48, border: `4px solid #e2e8f0`, borderTop: `4px solid ${PRIMARY}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <p style={{ color: GREY, fontSize: 14 }}>Loading analytics…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
      <p style={{ color: '#dc2626', fontWeight: 600, margin: 0 }}>{error}</p>
      <button onClick={fetchData} style={{ marginTop: 14, padding: '8px 20px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
        Retry
      </button>
    </div>
  );

  const { summary, planBreakdown, weeklyTrend, monthlyTrend, expiringSoon, paymentBreakdown, trialConversion } = data;

  // Pie data
  const planPieData = [
    { name: 'Trial',   value: planBreakdown.Trial.count   },
    { name: 'Weekly',  value: planBreakdown.Weekly.count  },
    { name: 'Monthly', value: planBreakdown.Monthly.count },
  ];

  // Payment pie data
  const payPieData = Object.entries(paymentBreakdown).map(([method, count]) => ({ name: method, value: count }));
  const PAY_COLORS = { Cash: GREY, UPI: BLUE, Online: GREEN, Razorpay: PURPLE };

  const mostPop = summary.mostPopularPlan;

  return (
    <div style={{ padding: '0 0 40px', maxWidth: 1100 }}>
      {/* ── Responsive styles ────────────────────────────────────────────── */}
      <style>{`
        .sa-metric-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 14px; margin-bottom: 24px;
        }
        .sa-row2 { display: grid; grid-template-columns: 3fr 2fr; gap: 14px; margin-bottom: 24px; }
        .sa-row5 { display: grid; grid-template-columns: 1fr 1fr;  gap: 14px; margin-bottom: 24px; }
        .sa-chart-h-lg  { height: 280px; }
        .sa-chart-h-md  { height: 250px; }
        .sa-chart-h-sm  { height: 200px; }
        .sa-expiry-table { overflow-x: auto; }
        .sa-expiry-table table { min-width: 480px; }
        /* Mobile: stack columns, 2-col metric grid, shorter charts */
        @media (max-width: 640px) {
          .sa-metric-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .sa-row2        { grid-template-columns: 1fr; }
          .sa-row5        { grid-template-columns: 1fr; }
          .sa-chart-h-lg  { height: 200px; }
          .sa-chart-h-md  { height: 200px; }
          .sa-chart-h-sm  { height: 170px; }
        }
        /* Tablet */
        @media (min-width: 641px) and (max-width: 900px) {
          .sa-row2 { grid-template-columns: 1fr; }
          .sa-row5 { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e2d5a' }}>
             Subscription Analytics
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: GREY }}>
            Understand your subscriber behaviour and growth trends
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastUpdated && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94a3b8' }}>
              {/* Live dot — pulses orange when auto-refresh fires */}
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: autoTick ? PRIMARY : '#22c55e',
                display: 'inline-block',
                boxShadow: autoTick ? `0 0 0 3px rgba(242,101,34,0.25)` : `0 0 0 3px rgba(34,197,94,0.2)`,
                transition: 'background 0.3s, box-shadow 0.3s',
              }} />
              Auto · Updated {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={() => fetchData(false)} style={{ padding: '8px 16px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
             Refresh
          </button>
        </div>
      </div>

      {/* ══ ROW 1: KEY METRICS ══════════════════════════════════════════ */}
      <div className="sa-metric-grid">

        <MetricCard icon="" label="Total Subscriptions"
          value={summary.totalSubscriptions}
          sub="All time" />

        <MetricCard icon="" label="Active Now"
          value={summary.activeNow}
          valueColor={GREEN}
          sub="Active or upcoming plan" />

        <MetricCard icon="" label="Renewal Rate"
          value={`${summary.renewalRate}%`}
          valueColor={BLUE}
          sub="Last 30 days"
          extra={<ProgressBar pct={summary.renewalRate} color={BLUE} />} />

        <MetricCard icon="" label="Churn Rate"
          value={`${summary.churnRate}%`}
          valueColor={churnColor(summary.churnRate)}
          sub="Did not renew last 30 days" />

        <MetricCard icon="" label="Trial Conversion"
          value={`${summary.trialConversionRate}%`}
          valueColor={PURPLE}
          sub="Trials that became paid" />

      </div>

      {/* ══ ROW 2: LINE CHART + PIE ══════════════════════════════════════ */}
      <div className="sa-row2">

        {/* Monthly Growth Line Chart */}
        <Card>
          <SectionTitle sub="New subscriptions & revenue per month">Monthly Growth</SectionTitle>
          <ResponsiveContainer width="100%" className="sa-chart-h-lg" height={280}>
            <LineChart data={monthlyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: GREY }} />
              <YAxis yAxisId="left"  tick={{ fontSize: 11, fill: GREY }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: BLUE }}
                tickFormatter={(v) => `₹${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="left"  type="monotone" dataKey="newSubscriptions"
                name="New Subscriptions" stroke={PRIMARY} strokeWidth={2.5}
                dot={{ r: 4, fill: PRIMARY }} activeDot={{ r: 6 }} />
              <Line yAxisId="right" type="monotone" dataKey="revenue"
                name="Revenue (₹)" stroke={BLUE} strokeWidth={2}
                strokeDasharray="5 5" dot={{ r: 3, fill: BLUE }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Plan Popularity Pie */}
        <Card>
          <SectionTitle sub="Distribution of plan types">Plan Breakdown</SectionTitle>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={planPieData} cx="50%" cy="50%" outerRadius={90}
                dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false} fontSize={11}>
                {planPieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => [v, 'Subscriptions']} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            {planPieData.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: PIE_COLORS[i] }} />
                <span style={{ color: '#475569' }}>{p.name}: <strong>{p.value}</strong></span>
              </div>
            ))}
          </div>
        </Card>

      </div>

      {/* ══ ROW 3: PLAN PERFORMANCE TABLE ════════════════════════════════ */}
      <Card style={{ marginBottom: 24 }}>
        <SectionTitle sub="Revenue and count per subscription type">Plan Performance</SectionTitle>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                {['Plan Type', 'Subscriptions', 'Revenue', '% of Total', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['Trial', 'Weekly', 'Monthly'].map(plan => {
                const row = planBreakdown[plan];
                const isTop = plan === mostPop;
                return (
                  <tr key={plan} style={{ background: isTop ? '#fff7ed' : 'transparent', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <PlanBadge plan={plan} />
                        {isTop && <span style={{ fontSize: 10, fontWeight: 700, color: PRIMARY }}>★ POPULAR</span>}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#1e2d5a' }}>{row.count}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: GREEN }}>₹{fmt(row.revenue)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{row.percentage}%</span>
                        <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 4, height: 6, minWidth: 60 }}>
                          <div style={{ width: `${row.percentage}%`, background: plan === 'Trial' ? GREY : plan === 'Weekly' ? PRIMARY : GREEN, height: '100%', borderRadius: 4 }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {plan === 'Trial'   && <span style={{ background: '#f1f5f9', color: GREY,  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Entry Level</span>}
                      {plan === 'Weekly'  && <span style={{ background: '#fff7ed', color: PRIMARY, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Active</span>}
                      {plan === 'Monthly' && <span style={{ background: '#f0fdf4', color: GREEN,  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Best Value</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ══ ROW 4: WEEKLY BAR CHART ══════════════════════════════════════ */}
      <Card style={{ marginBottom: 24 }}>
        <SectionTitle sub="New subscriptions acquired each week">Weekly New Subscriptions (Last 8 Weeks)</SectionTitle>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={weeklyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="weekLabel" tick={{ fontSize: 11, fill: GREY }} />
            <YAxis yAxisId="left"  tick={{ fontSize: 11, fill: GREY }} allowDecimals={false} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: BLUE }} tickFormatter={(v) => `₹${v}`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left"  dataKey="newSubscriptions" name="New Subscriptions" fill={PRIMARY} radius={[4, 4, 0, 0]} />
            <Bar yAxisId="right" dataKey="revenue"          name="Revenue (₹)"       fill={BLUE}   radius={[4, 4, 0, 0]} opacity={0.75} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* ══ ROW 5: PAYMENT METHODS + TRIAL FUNNEL ════════════════════════ */}
      <div className="sa-row5">

        {/* Payment Methods */}
        <Card>
          <SectionTitle sub="How subscribers pay">Payment Methods</SectionTitle>
          {payPieData.length === 0 ? (
            <p style={{ color: GREY, fontSize: 13, textAlign: 'center', padding: '30px 0' }}>No payment data yet</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" className="sa-chart-h-sm" height={200}>
                <PieChart>
                  <Pie data={payPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                    dataKey="value" paddingAngle={3}>
                    {payPieData.map((entry, i) => (
                      <Cell key={i} fill={PAY_COLORS[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [v, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {payPieData.map((p, i) => {
                  const total = payPieData.reduce((s, x) => s + x.value, 0);
                  const pct   = total > 0 ? Math.round((p.value / total) * 100) : 0;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: PAY_COLORS[p.name] || '#94a3b8', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, flex: 1, color: '#475569' }}>{p.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1e2d5a' }}>{p.value}</span>
                      <span style={{ fontSize: 11, color: GREY, width: 36, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        {/* Trial Conversion Funnel */}
        <Card>
          <SectionTitle sub="Trial → Paid subscription journey">Trial → Paid Conversion</SectionTitle>

          {trialConversion.totalTrialUsers === 0 ? (
            <p style={{ color: GREY, fontSize: 13, textAlign: 'center', padding: '30px 0' }}>No trial data yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>

              {/* Step 1: Total trials */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e2d5a' }}>Total Trial Users</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: PRIMARY }}>{trialConversion.totalTrialUsers}</span>
                </div>
                <div style={{ height: 28, background: PRIMARY, borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>100%</span>
                </div>
              </div>

              {/* Arrow */}
              <div style={{ textAlign: 'center', fontSize: 20, color: GREY, lineHeight: 1 }}>↓</div>

              {/* Step 2: Converted */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e2d5a' }}>Converted to Paid</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: GREEN }}>{trialConversion.converted}</span>
                </div>
                <div style={{ height: 28, background: GREEN, borderRadius: 6, width: `${trialConversion.conversionRate}%`, minWidth: 40, display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{trialConversion.conversionRate}%</span>
                </div>
              </div>

              {/* Step 3: Not converted */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e2d5a' }}>Did Not Convert</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#ef4444' }}>{trialConversion.notConverted}</span>
                </div>
                <div style={{ height: 28, background: '#ef4444', borderRadius: 6, width: `${100 - trialConversion.conversionRate}%`, minWidth: 40, display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{100 - trialConversion.conversionRate}%</span>
                </div>
              </div>

              {/* Badge */}
              <div style={{ marginTop: 8 }}>
                <span style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                  background: trialConversion.conversionRate >= 50 ? '#f0fdf4' : trialConversion.conversionRate >= 30 ? '#fffbeb' : '#fef2f2',
                  color:      trialConversion.conversionRate >= 50 ? GREEN      : trialConversion.conversionRate >= 30 ? AMBER      : '#ef4444',
                  border: `1px solid ${trialConversion.conversionRate >= 50 ? '#bbf7d0' : trialConversion.conversionRate >= 30 ? '#fde68a' : '#fecaca'}`,
                }}>
                  {trialConversion.conversionRate >= 50 ? '' : trialConversion.conversionRate >= 30 ? '' : ''} {trialConversion.conversionRate}% Conversion Rate
                </span>
              </div>
            </div>
          )}
        </Card>

      </div>

      {/* ══ ROW 6: EXPIRING SOON ══════════════════════════════════════════ */}
      {expiringSoon.length === 0 ? (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}></span>
          <span style={{ fontWeight: 700, color: GREEN, fontSize: 14 }}>No subscriptions expiring in the next 7 days</span>
        </div>
      ) : (
        <Card>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: AMBER, display: 'flex', alignItems: 'center', gap: 8 }}>
               Expiring in Next 7 Days
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: GREY }}>
              {expiringSoon.length} subscriber{expiringSoon.length !== 1 ? 's' : ''} without an upcoming plan — email reminder sent automatically
            </p>
          </div>
          <div className="sa-expiry-table">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                  {['Customer', 'Plan', 'Expiry Date', 'Days Left'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expiringSoon.map((sub, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: '#1e2d5a' }}>{sub.customerName || 'Customer'}</div>
                      {sub.customerPhone && <div style={{ fontSize: 11, color: GREY, marginTop: 2 }}>{sub.customerPhone}</div>}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <PlanBadge plan={sub.planType} />
                    </td>
                    <td style={{ padding: '12px 14px', color: '#475569' }}>{fmtDate(sub.expiryDate)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <DaysLeftBadge days={sub.daysLeft} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

    </div>
  );
};

export default SubscriptionAnalytics;
