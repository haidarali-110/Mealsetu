import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  addExpense, getExpenses, updateExpense, deleteExpense,
  getExpenseSummary, downloadExpenseCSV,
  applyRecurringExpenses, getExpenseTrend,
  getExpenseBudget, saveExpenseBudget,
} from '../../../utils/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const C = {
  orange: '#F26522', orangeLight: '#FFF3EC',
  green:  '#16A34A', greenLight:  '#DCFCE7',
  blue:   '#2563EB', blueLight:   '#EFF6FF',
  red:    '#DC2626', redLight:    '#FEF2F2',
  slate:  '#64748B', slateLight:  '#F1F5F9',
  border: '#E5E7EB',
  purple: '#7C3AED', purpleLight: '#F5F3FF',
};

const CATEGORIES = [
  'Rent', 'Ingredients', 'Staff Salaries', 'Gas/Fuel',
  'Packaging', 'Electricity', 'Marketing', 'Maintenance',
  'Transport', 'Platform Commission', 'Other',
];

const CAT_ICON = {
  'Rent':                '',
  'Ingredients':         '',
  'Staff Salaries':      '',
  'Gas/Fuel':            '',
  'Packaging':           '',
  'Electricity':         '',
  'Marketing':           '',
  'Maintenance':         '',
  'Transport':           '',
  'Platform Commission': '',
  'Other':               '',
};

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const fmtCurrency = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const monthLabel = (m) =>
  new Date(m + '-01').toLocaleString('en-IN', { month: 'long', year: 'numeric' });

// ── Reusable primitives ───────────────────────────────────────────────────────

const Card = ({ children, style }) => (
  <div style={{
    background: '#fff', borderRadius: 14,
    border: `1px solid ${C.border}`,
    boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
    padding: 20, ...style,
  }}>
    {children}
  </div>
);

const Btn = ({ children, onClick, disabled, color, outline, small, style }) => {
  const bg     = outline ? '#fff'  : (color || C.orange);
  const border = outline ? `1px solid ${color || C.orange}` : 'none';
  const text   = outline ? (color || C.orange) : '#fff';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: bg, border, color: text,
        padding: small ? '6px 12px' : '9px 18px',
        borderRadius: 8, fontSize: small ? 12 : 13,
        fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1, ...style,
      }}
    >
      {children}
    </button>
  );
};

const inputSt = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: `1px solid ${C.border}`, fontSize: 13,
  boxSizing: 'border-box', outline: 'none',
  fontFamily: 'inherit',
};

const FormRow = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.slate, marginBottom: 5 }}>
      {label}
    </label>
    {children}
  </div>
);

const Overlay = ({ children, onClose }) => (
  <div
    style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}
    onClick={onClose}
  >
    <div
      style={{
        background: '#fff', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 460,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  </div>
);

const Spinner = () => (
  <div style={{ textAlign: 'center', padding: 40, color: C.slate, fontSize: 13 }}>
    Loading…
  </div>
);

// ── Summary card ──────────────────────────────────────────────────────────────

const SummaryCard = ({ label, value, sub, color, icon }) => (
  <div style={{
    flex: '1 1 160px', padding: '16px 18px',
    background: color + '10', borderRadius: 12,
    border: `1px solid ${color}30`,
  }}>
    <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 3, opacity: 0.75 }}>{label}</div>
    {sub && <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>{sub}</div>}
  </div>
);

// ── Category bar (budget-aware) ───────────────────────────────────────────────

const CategoryBar = ({ breakdown, total, budgets }) => {
  if (!breakdown?.length) return null;
  return (
    <div>
      {breakdown.map(({ category, total: amt }) => {
        const shareOfTotal = total > 0 ? Math.round((amt / total) * 100) : 0;
        const budget       = budgets?.[category] || 0;
        const budgetPct    = budget > 0 ? Math.min(Math.round((amt / budget) * 100), 100) : 0;
        const overBudget   = budget > 0 && amt > budget;
        const nearBudget   = budget > 0 && !overBudget && budgetPct >= 80;
        const barColor     = overBudget ? C.red : nearBudget ? '#F59E0B' : C.orange;

        return (
          <div key={category} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: '#1E293B' }}>
                {CAT_ICON[category] || '💼'} {category}
                {overBudget && (
                  <span style={{
                    marginLeft: 6, background: C.redLight, color: C.red,
                    padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                  }}>Over budget</span>
                )}
                {nearBudget && (
                  <span style={{
                    marginLeft: 6, background: '#FEF9C3', color: '#92400E',
                    padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                  }}>Near limit</span>
                )}
              </span>
              <span style={{ color: C.slate, fontWeight: 600 }}>
                {fmtCurrency(amt)}
                {budget > 0 && (
                  <span style={{ color: overBudget ? C.red : C.slate, fontWeight: 400 }}>
                    {' / '}{fmtCurrency(budget)}
                  </span>
                )}
                <span style={{ color: C.red, fontWeight: 700 }}> {shareOfTotal}%</span>
              </span>
            </div>
            <div style={{ height: 7, background: C.border, borderRadius: 4, overflow: 'hidden' }}>
              {budget > 0 ? (
                <div style={{
                  height: '100%', width: `${budgetPct}%`,
                  background: barColor, borderRadius: 4,
                  transition: 'width 0.5s ease',
                }} />
              ) : (
                <div style={{
                  height: '100%', width: `${shareOfTotal}%`,
                  background: C.orange, borderRadius: 4,
                  transition: 'width 0.5s ease',
                }} />
              )}
            </div>
            {budget > 0 && (
              <div style={{ fontSize: 10, color: C.slate, marginTop: 2, textAlign: 'right' }}>
                {budgetPct}% of budget used
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── 6-Month Trend Chart ───────────────────────────────────────────────────────

const TREND_SERIES = [
  { key: 'revenue',       label: 'Revenue',  color: '#3B82F6' },
  { key: 'totalExpenses', label: 'Expenses', color: '#EF4444' },
  { key: 'profit',        label: 'Profit',   color: null },   // color set per-bar
];

const fmtK = (v) => {
  const abs = Math.abs(v);
  if (abs >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (abs >= 1000)   return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
};

const TrendChart = ({ trend, trendMonths, onChangePeriod }) => {
  const [tooltip, setTooltip]     = useState(null);
  const [animated, setAnimated]   = useState(false);
  const containerRef              = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 60);
    return () => clearTimeout(t);
  }, [trend]);

  if (!trend?.length) return (
    <div style={{ textAlign: 'center', padding: '30px 0', color: C.slate, fontSize: 13 }}>
      No trend data yet — add expenses to see your P&L history.
    </div>
  );

  const PAD_L = 52, PAD_R = 12, PAD_T = 16, PAD_B = 36;
  const W     = 560;
  const H     = 220;
  const IW    = W - PAD_L - PAD_R;
  const IH    = H - PAD_T - PAD_B;

 const allVals = trend.flatMap((d) => [d.revenue, d.totalExpenses, Math.max(0, d.profitAfterCommission)]);
  const maxVal  = Math.max(...allVals, 1);
  const TICKS   = 4;
  const step    = Math.ceil(maxVal / TICKS / 1000) * 1000 || 1;
  const yMax    = step * TICKS;

  const yPx  = (v) => PAD_T + IH - Math.max(0, v) / yMax * IH;
  const hPx  = (v) => Math.max(2, Math.max(0, v) / yMax * IH);

  const n     = trend.length;
  const GW    = IW / n;
  const BW    = Math.min(GW * 0.2, 13);
  const GAP   = BW * 0.35;
  const GROUP = 3 * BW + 2 * GAP;

  return (
    <div ref={containerRef}>
      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, justifyContent: 'flex-end' }}>
        {[3, 6, 12].map((m) => (
          <button
            key={m}
            onClick={() => onChangePeriod(m)}
            style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', border: 'none',
              background: trendMonths === m ? C.orange : C.slateLight,
              color:      trendMonths === m ? '#fff'   : C.slate,
              transition: 'all 0.15s',
            }}
          >{m}M</button>
        ))}
      </div>

      {/* SVG chart */}
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: 'block', width: '100%', minWidth: 340, height: 'auto' }}
        >
          {/* Y grid + labels */}
          {Array.from({ length: TICKS + 1 }, (_, i) => {
            const v = step * i;
            const y = yPx(v);
            return (
              <g key={i}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
                  stroke={i === 0 ? '#CBD5E1' : '#F1F5F9'} strokeWidth={i === 0 ? 1.5 : 1} />
                <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#94A3B8"
                  fontFamily="system-ui,sans-serif">
                  {fmtK(v)}
                </text>
              </g>
            );
          })}

          {/* Bars per month */}
          {trend.map((d, gi) => {
            const cx     = PAD_L + gi * GW + GW / 2;
            const startX = cx - GROUP / 2;
    const profitPos = d.profitAfterCommission >= 0;

            return (
              <g key={d.month}>
                {/* Hover hit area */}
                <rect
                  x={PAD_L + gi * GW} y={PAD_T}
                  width={GW} height={IH}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, d })}
                  onMouseMove={(e)  => setTooltip({ x: e.clientX, y: e.clientY, d })}
                  onMouseLeave={() => setTooltip(null)}
                />

                {/* Revenue bar */}
                <rect
                  x={startX} y={animated ? yPx(d.revenue) : PAD_T + IH}
                  width={BW}
                  height={animated ? hPx(d.revenue) : 0}
                  fill="#3B82F6" rx={2}
                  style={{ transition: 'y 0.5s ease, height 0.5s ease' }}
                />

                {/* Expenses bar */}
                <rect
                  x={startX + BW + GAP} y={animated ? yPx(d.totalExpenses) : PAD_T + IH}
                  width={BW}
                  height={animated ? hPx(d.totalExpenses) : 0}
                  fill="#EF4444" rx={2}
                  style={{ transition: 'y 0.5s ease, height 0.5s ease' }}
                />

                {/* Profit bar */}
              <rect
  x={startX + 2 * (BW + GAP)} y={animated ? yPx(d.profitAfterCommission) : PAD_T + IH}
  width={BW}
  height={animated ? hPx(d.profitAfterCommission) : 0}
                  fill={profitPos ? '#22C55E' : '#EF4444'}
                  rx={2}
                  style={{ transition: 'y 0.5s ease, height 0.5s ease' }}
                />

                {/* Month label */}
                <text
                  x={cx} y={PAD_T + IH + 20}
                  textAnchor="middle" fontSize={9.5} fill="#64748B"
                  fontFamily="system-ui,sans-serif" fontWeight={600}
                >
                  {d.monthLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginTop: 10 }}>
        {[
          { color: '#3B82F6', label: 'Revenue' },
          { color: '#EF4444', label: 'Expenses' },
          { color: '#22C55E', label: 'Profit' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.slate }}>
            <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
            {label}
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x + 14, top: tooltip.y - 20,
          background: '#1E293B', color: '#fff',
          borderRadius: 10, padding: '10px 14px',
          fontSize: 12, zIndex: 9999, pointerEvents: 'none',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
          minWidth: 150,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 7, fontSize: 13 }}>{tooltip.d.monthLabel}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
            <span style={{ color: '#93C5FD' }}>Revenue</span>
            <span style={{ fontWeight: 600 }}>{fmtCurrency(tooltip.d.revenue)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
            <span style={{ color: '#FCA5A5' }}>Expenses</span>
            <span style={{ fontWeight: 600 }}>{fmtCurrency(tooltip.d.totalExpenses)}</span>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: 16,
            borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 6, marginTop: 4,
          }}>
           <span style={{ color: tooltip.d.profitAfterCommission >= 0 ? '#86EFAC' : '#FCA5A5' }}>Profit</span>
<span style={{ fontWeight: 700, color: tooltip.d.profitAfterCommission >= 0 ? '#86EFAC' : '#FCA5A5' }}>
  {tooltip.d.profitAfterCommission < 0 ? '−' : '+'}{fmtCurrency(Math.abs(tooltip.d.profitAfterCommission))}
</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Budget modal ──────────────────────────────────────────────────────────────

const BudgetModal = ({ budgets, onClose, onSaved }) => {
  const [form, setForm]     = useState(() => {
    const init = {};
    CATEGORIES.forEach((c) => { init[c] = budgets?.[c] ? String(budgets[c]) : ''; });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      const payload = {};
      CATEGORIES.forEach((c) => {
        const v = Number(form[c]);
        if (v > 0) payload[c] = v;
      });
      await saveExpenseBudget(payload);
      onSaved(payload);
    } catch (e) {
      setErr(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#254578' }}>
         Set Monthly Budget
      </h3>
      <p style={{ margin: '0 0 18px', fontSize: 12, color: C.slate }}>
        Leave blank to skip a category. Bars turn yellow at 80%, red when over.
      </p>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
          {CATEGORIES.map((cat) => (
            <div key={cat}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.slate, marginBottom: 4 }}>
                {CAT_ICON[cat]} {cat}
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 13, color: C.slate, pointerEvents: 'none',
                }}>₹</span>
                <input
                  type="number" min="0" step="1"
                  value={form[cat]}
                  onChange={(e) => setForm((p) => ({ ...p, [cat]: e.target.value }))}
                  placeholder="No limit"
                  style={{ ...inputSt, paddingLeft: 24 }}
                />
              </div>
            </div>
          ))}
        </div>
        {err && <p style={{ color: C.red, fontSize: 12, margin: '8px 0 0' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <Btn outline color={C.slate} onClick={onClose}>Cancel</Btn>
          <Btn disabled={saving} color={C.blue}>{saving ? 'Saving…' : ' Save Budget'}</Btn>
        </div>
      </form>
    </Overlay>
  );
};

// ── Expense form modal ────────────────────────────────────────────────────────

const EMPTY_FORM = { amount: '', category: 'Ingredients', customCategory: '', description: '', date: '', isRecurring: false };

const ExpenseModal = ({ expense, onClose, onSaved }) => {
  const isEdit = !!expense?._id;
  const todayISO = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(
    expense
      ? { ...expense, date: expense.date?.slice(0, 10) || todayISO, customCategory: expense.customCategory || '', isRecurring: expense.isRecurring || false }
      : { ...EMPTY_FORM, date: todayISO }
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      setErr('Enter a valid amount'); return;
    }
    if (form.category === 'Other' && !form.customCategory?.trim()) {
      setErr('Please enter the expense name'); return;
    }
    setSaving(true); setErr('');
    try {
      if (isEdit) {
        await updateExpense(expense._id, form);
      } else {
        await addExpense(form);
      }
      onSaved();
    } catch (e) {
      setErr(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 700, color: '#1E293B' }}>
        {isEdit ? ' Edit Expense' : ' Add Expense'}
      </h3>
      <form onSubmit={handleSubmit}>
        <FormRow label="Date">
          <input
            required type="date" value={form.date}
            max={todayISO}
            onChange={(e) => set('date', e.target.value)}
            style={inputSt}
          />
        </FormRow>
        <FormRow label="Category">
          <select
            required value={form.category}
            onChange={(e) => { set('category', e.target.value); set('customCategory', ''); }}
            style={inputSt}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CAT_ICON[c]} {c}</option>
            ))}
          </select>
        </FormRow>
        {form.category === 'Other' && (
          <FormRow label="Expense Name *">
            <input
              required
              value={form.customCategory}
              onChange={(e) => set('customCategory', e.target.value)}
              style={inputSt}
              placeholder="e.g. Water tanker, Pest control…"
              maxLength={60}
            />
          </FormRow>
        )}
        <FormRow label="Amount (₹)">
          <input
            required type="number" min="1" step="1"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            style={inputSt} placeholder="e.g. 5000"
          />
        </FormRow>
        <FormRow label="Description (optional)">
          <input
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            style={inputSt} placeholder="e.g. May rent for kitchen"
          />
        </FormRow>

        {/* Recurring toggle */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          padding: '10px 12px', borderRadius: 8, marginBottom: 4,
          background: form.isRecurring ? '#EFF6FF' : C.slateLight,
          border: `1px solid ${form.isRecurring ? '#BFDBFE' : C.border}`,
          transition: 'background 0.2s',
        }}>
          <input
            type="checkbox"
            checked={form.isRecurring}
            onChange={(e) => set('isRecurring', e.target.checked)}
            style={{ width: 15, height: 15, accentColor: C.blue, cursor: 'pointer' }}
          />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: form.isRecurring ? C.blue : '#1E293B' }}>
               Recurring monthly
            </div>
            <div style={{ fontSize: 10, color: C.slate, marginTop: 1 }}>
              Auto-adds this expense every month (Rent, Salaries, etc.)
            </div>
          </div>
        </label>

        {err && <p style={{ color: C.red, fontSize: 12, margin: '4px 0 8px' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <Btn outline color={C.slate} onClick={onClose}>Cancel</Btn>
          <Btn disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Update' : 'Add Expense'}</Btn>
        </div>
      </form>
    </Overlay>
  );
};

// ── Smart Insights ────────────────────────────────────────────────────────────

const generateInsights = (summary, budgets, trend) => {
  const list = [];
  if (!summary) return list;

  const {
    revenue, totalExpenses, prevRevenue, prevTotalExpenses,
    growth, orderCount, avgOrderValue,
    categoryBreakdown     = [],
    prevCategoryBreakdown = [],
  } = summary;

  // 0. Budget exceeded — highest priority
  if (budgets) {
    const exceeded = categoryBreakdown.filter(({ category, total }) =>
      (budgets[category] || 0) > 0 && total > budgets[category]
    );
    if (exceeded.length > 0) {
      const worst   = exceeded.reduce((a, b) =>
        (b.total - budgets[b.category]) > (a.total - budgets[a.category]) ? b : a
      );
      const excess  = worst.total - budgets[worst.category];
      list.push({
        icon: '', color: C.red, priority: 0,
        title: `${worst.category} budget exceeded`,
        detail: `Over by ${fmtCurrency(excess)} · Spent ${fmtCurrency(worst.total)} of ${fmtCurrency(budgets[worst.category])} budget`,
      });
    }
  }

  // 1. Category spike vs last month
  if (prevCategoryBreakdown.length > 0 && categoryBreakdown.length > 0) {
    const prevMap = Object.fromEntries(prevCategoryBreakdown.map(({ category, total }) => [category, total]));
    let spike = null;
    for (const { category, total } of categoryBreakdown) {
      const prev = prevMap[category] || 0;
      if (prev > 500) {
        const pct = Math.round(((total - prev) / prev) * 100);
        if (pct >= 20 && (!spike || pct > spike.pct)) spike = { category, total, prev, pct };
      }
    }
    if (spike) {
      list.push({
        icon: '', color: '#F59E0B', priority: 1,
        title: `${spike.category} jumped ${spike.pct}% vs last month`,
        detail: `${fmtCurrency(spike.prev)} → ${fmtCurrency(spike.total)} — check if this is expected`,
      });
    }
  }

  // 2. Expense ratio change
  if (revenue > 0) {
    const ratio     = Math.round((totalExpenses / revenue) * 100);
    const prevRatio = prevRevenue > 0 ? Math.round((prevTotalExpenses / prevRevenue) * 100) : null;
    const diff      = prevRatio !== null ? ratio - prevRatio : null;
    const improved  = diff !== null && diff <= -5;
    const worsened  = diff !== null && diff >= 5;
    const direction = improved ? 'Improved' : 'Worsened';
    list.push({
      icon: improved ? '' : worsened ? '' : '',
      color: ratio < 60 ? C.green : ratio < 80 ? '#F59E0B' : C.red,
      priority: worsened ? 2 : 5,
      title: `${ratio}% of revenue spent on expenses`,
      detail: diff !== null
        ? `${direction} by ${Math.abs(diff)}pp vs last month (was ${prevRatio}%)`
        : 'Healthy ratio is under 60%',
    });
  }

  // 3. Profitable streak
  if (trend && trend.length >= 3) {
    const last3 = trend.slice(-3);
    if (last3.every((m) => m.profitAfterCommission > 0)) {
      list.push({
        icon: '', color: C.green, priority: 6,
        title: `${last3.length} consecutive profitable months`,
        detail: last3.map((m) => m.monthLabel).join(' → ') + ' all in profit',
      });
    } else if (last3.every((m) => m.profitAfterCommission < 0)) {
      list.push({
        icon: '', color: C.red, priority: 1,
        title: `${last3.length} consecutive loss months`,
        detail: 'Consider raising prices or cutting your top expense category',
      });
    }
  }

  // 4. Top expense category dominance
  if (categoryBreakdown.length > 0 && totalExpenses > 0) {
    const top = categoryBreakdown[0];
    const pct = Math.round((top.total / totalExpenses) * 100);
    if (pct >= 40) {
      list.push({
        icon: CAT_ICON[top.category] || '', color: C.orange, priority: 4,
        title: `${top.category} is ${pct}% of all expenses`,
        detail: `${fmtCurrency(top.total)} out of ${fmtCurrency(totalExpenses)} total`,
      });
    }
  }

  // 5. Order pace vs break-even
  if (avgOrderValue > 0 && totalExpenses > 0 && orderCount > 0) {
    const needed = Math.ceil(totalExpenses / avgOrderValue);
    if (orderCount >= needed) {
      list.push({
        icon: '', color: C.green, priority: 3,
        title: 'Break-even already reached this month!',
        detail: `${orderCount} orders at avg ${fmtCurrency(avgOrderValue)} — target was ${needed} orders`,
      });
    }
  }

  // 6. No data nudge
  if (totalExpenses === 0 && revenue === 0) {
    list.push({
      icon: '', color: C.blue, priority: 10,
      title: 'Start adding expenses to unlock insights',
      detail: 'Smart analysis appears here once you record your first expense',
    });
  }

  return list.sort((a, b) => a.priority - b.priority).slice(0, 5);
};

const INSIGHT_BG = {
  [C.red]:    '#FEF2F2',
  [C.green]:  '#F0FDF4',
  [C.orange]: '#FFF7ED',
  ['#F59E0B']: '#FFFBEB',
  [C.blue]:   '#EFF6FF',
};

const SmartInsights = ({ summary, budgets, trend }) => {
  const insights = generateInsights(summary, budgets, trend);

  if (!insights.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {insights.map((ins, i) => {
        const bg = INSIGHT_BG[ins.color] || '#F8FAFC';
        return (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 16px', borderRadius: 10,
              background: bg,
              borderLeft: `4px solid ${ins.color}`,
              animation: `fadeInUp 0.3s ease ${i * 0.06}s both`,
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1.3, flexShrink: 0 }}>{ins.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1E293B', marginBottom: 2 }}>
                {ins.title}
              </div>
              <div style={{ fontSize: 11, color: C.slate, lineHeight: 1.5 }}>
                {ins.detail}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Recurring expenses panel ──────────────────────────────────────────────────

const RecurringPanel = ({ expenses, onStopRecurring }) => {
  const recurring = expenses.filter((e) => e.isRecurring);

  if (!recurring.length) return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}></div>
      <div style={{ fontSize: 12, color: C.slate }}>
        No recurring expenses yet.<br />
        Tick "Recurring monthly" when adding Rent, Salaries, etc.
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {recurring.map((exp) => (
        <div key={exp._id} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: C.slateLight, borderRadius: 8, padding: '9px 12px',
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>
              {CAT_ICON[exp.category] || ''}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: '#1E293B',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {exp.category === 'Other' && exp.customCategory ? exp.customCategory : exp.category}
              </div>
              <div style={{ fontSize: 11, color: C.slate }}>
                {fmtCurrency(exp.amount)}/month
                {exp.description && ` · ${exp.description}`}
              </div>
            </div>
          </div>
          <button
            onClick={() => onStopRecurring(exp._id)}
            title="Stop auto-adding next month"
            style={{
              background: C.redLight, color: C.red,
              border: 'none', borderRadius: 6,
              padding: '3px 8px', fontSize: 10,
              fontWeight: 700, cursor: 'pointer', flexShrink: 0, marginLeft: 8,
            }}
          >Stop</button>
        </div>
      ))}
      <div style={{ fontSize: 10, color: C.slate, textAlign: 'center', marginTop: 2 }}>
        These auto-copy to next month on the 1st
      </div>
    </div>
  );
};

// ── Break-Even Calculator ─────────────────────────────────────────────────────

const BreakEvenCard = ({ summary, month }) => {
  if (!summary) return (
    <div style={{ color: C.slate, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
      Loading…
    </div>
  );

  const { revenue, totalExpenses, orderCount = 0, avgOrderValue = 0 } = summary;

  // Days context
  const [y, m]       = month.split('-').map(Number);
  const today        = new Date();
  const isCurrent    = today.getFullYear() === y && (today.getMonth() + 1) === m;
  const daysInMonth  = new Date(y, m, 0).getDate();
  const dayOfMonth   = isCurrent ? today.getDate() : daysInMonth;
  const daysLeft     = isCurrent ? daysInMonth - dayOfMonth : 0;
  const daysPassed   = dayOfMonth;

  const reached         = totalExpenses === 0 || revenue >= totalExpenses;
  const pct             = totalExpenses > 0 ? Math.min(100, Math.round((revenue / totalExpenses) * 100)) : 100;
  const breakEvenOrders = avgOrderValue > 0 ? Math.ceil(totalExpenses / avgOrderValue) : 0;
  const ordersLeft      = Math.max(0, breakEvenOrders - orderCount);
  const dailyNeeded     = daysLeft > 0 ? Math.ceil(ordersLeft / daysLeft) : ordersLeft;
  const dailyCurrent    = daysPassed > 0 ? (orderCount / daysPassed).toFixed(1) : '0';
  const profitBuffer    = totalExpenses > 0 ? Math.round(((revenue - totalExpenses) / totalExpenses) * 100) : 0;

  const barColor = reached ? C.green : pct >= 80 ? '#F59E0B' : C.orange;

  return (
    <div>
      {/* Status headline */}
      <div style={{
        textAlign: 'center', padding: '14px 10px 10px',
        background: reached ? C.greenLight : pct >= 80 ? '#FFFBEB' : C.orangeLight,
        borderRadius: 10, marginBottom: 14,
        border: `1px solid ${reached ? '#86EFAC' : pct >= 80 ? '#FDE68A' : '#FDBA74'}`,
      }}>
        <div style={{ fontSize: 24, marginBottom: 4 }}>
          {reached ? '' : pct >= 80 ? '' : ''}
        </div>
        {reached ? (
          <>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.green }}>
              Break-even Reached!
            </div>
            <div style={{ fontSize: 11, color: C.slate, marginTop: 3 }}>
              {profitBuffer > 0
                ? `${profitBuffer}% profit buffer above expenses`
                : 'Revenue exactly covers expenses'}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 800, fontSize: 22, color: C.orange, lineHeight: 1 }}>
              {ordersLeft}
            </div>
            <div style={{ fontWeight: 600, fontSize: 12, color: '#92400E', marginTop: 2 }}>
              more orders to break even
            </div>
            {daysLeft > 0 && (
              <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>
                ≈ {dailyNeeded} order{dailyNeeded !== 1 ? 's' : ''}/day for {daysLeft} days left
              </div>
            )}
          </>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.slate, marginBottom: 4 }}>
          <span>Revenue {fmtCurrency(revenue)}</span>
          <span style={{ fontWeight: 700, color: barColor }}>{pct}%</span>
          <span>Target {fmtCurrency(totalExpenses)}</span>
        </div>
        <div style={{ height: 10, background: C.border, borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: `linear-gradient(90deg, ${barColor}99, ${barColor})`,
            borderRadius: 6, transition: 'width 0.6s ease',
            position: 'relative',
          }}>
            {pct > 15 && (
              <span style={{
                position: 'absolute', right: 6, top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 8, fontWeight: 700, color: '#fff',
              }}>{pct}%</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { icon: '', label: 'Orders this month', value: orderCount },
          { icon: '', label: 'Break-even target', value: breakEvenOrders > 0 ? `${breakEvenOrders} orders` : '—' },
          { icon: '', label: 'Avg order value',   value: avgOrderValue > 0 ? fmtCurrency(avgOrderValue) : '—' },
          { icon: '', label: 'Daily avg (so far)', value: `${dailyCurrent}/day` },
        ].map(({ icon, label, value }) => (
          <div key={label} style={{
            background: C.slateLight, borderRadius: 8, padding: '8px 10px',
          }}>
            <div style={{ fontSize: 14, marginBottom: 2 }}>{icon}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1E293B', lineHeight: 1.2 }}>{value}</div>
            <div style={{ fontSize: 10, color: C.slate, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Past-month note */}
      {!isCurrent && (
        <div style={{
          marginTop: 10, fontSize: 11, color: C.slate,
          textAlign: 'center', fontStyle: 'italic',
        }}>
          Showing completed month — all {daysInMonth} days included
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const ExpenseTracker = () => {
  const [month, setMonth]             = useState(currentMonth());
  const [summary, setSummary]         = useState(null);
  const [expenses, setExpenses]       = useState([]);
  const [budgets, setBudgets]         = useState({});
  const [trend, setTrend]             = useState([]);
  const [trendMonths, setTrendMonths] = useState(6);
  const [loadingT, setLoadingT]       = useState(false);
  const [loadingS, setLoadingS]       = useState(false);
  const [loadingE, setLoadingE]       = useState(false);
  const [showModal, setShowModal]     = useState(false);
  const [showBudget, setShowBudget]   = useState(false);
  const [editExp, setEditExp]         = useState(null);
  const [exporting, setExporting]     = useState({ monthly: false, yearly: false });
  const [deleteConf, setDeleteConf]   = useState(null);
  const [toast, setToast]             = useState(null);

  const fetchSummary = useCallback(async () => {
    setLoadingS(true);
    try { setSummary(await getExpenseSummary(month)); }
    catch { setSummary(null); }
    finally { setLoadingS(false); }
  }, [month]);

  const fetchExpenses = useCallback(async () => {
    setLoadingE(true);
    try { setExpenses((await getExpenses(month))?.expenses || []); }
    catch { setExpenses([]); }
    finally { setLoadingE(false); }
  }, [month]);

  useEffect(() => {
    fetchSummary();
    fetchExpenses();
  }, [fetchSummary, fetchExpenses]);

  useEffect(() => {
    getExpenseBudget()
      .then((r) => setBudgets(r?.budgets || {}))
      .catch(() => {});
  }, []);

  // Auto-apply recurring expenses for the current month on first load
  useEffect(() => {
    const cur = currentMonth();
    applyRecurringExpenses(cur)
      .then((r) => {
        if (r?.created > 0) {
          fetchSummary();
          fetchExpenses();
          const cats = r.expenses?.map((e) => e.category).join(', ') || '';
          showToast('success', ` ${r.created} recurring expense${r.created > 1 ? 's' : ''} auto-added for this month${cats ? ` (${cats})` : ''}`);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLoadingT(true);
    getExpenseTrend(trendMonths)
      .then((r) => setTrend(r?.trend || []))
      .catch(() => setTrend([]))
      .finally(() => setLoadingT(false));
  }, [trendMonths]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const handleSaved = () => {
    setShowModal(false); setEditExp(null);
    fetchSummary(); fetchExpenses();
  };

  const handleStopRecurring = async (id) => {
    try {
      await updateExpense(id, { isRecurring: false });
      setExpenses((prev) => prev.map((e) => e._id === id ? { ...e, isRecurring: false } : e));
      showToast('info', ' Recurring stopped — this expense won\'t auto-add next month');
    } catch (e) {
      alert('Failed: ' + e.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteExpense(id);
      setDeleteConf(null);
      fetchSummary(); fetchExpenses();
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
  };

  const handleExport = async (type) => {
    setExporting((p) => ({ ...p, [type]: true }));
    try { await downloadExpenseCSV(month, type); }
    catch (e) { alert('Export failed: ' + e.message); }
    finally { setExporting((p) => ({ ...p, [type]: false })); }
  };

   const profit    = summary?.profitAfterCommission ?? 0;   // real take-home, commission included
  const growth    = summary?.growth;
  const growthPos = growth === null ? null : growth >= 0;

  // Over-budget alerts
  const overBudgetCategories = (summary?.categoryBreakdown || []).filter(({ category, total: amt }) =>
    budgets[category] > 0 && amt > budgets[category]
  );
  const hasBudgets = Object.keys(budgets).length > 0;

  return (
    <div style={{ padding: '0 0 40px' }}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)',
        borderRadius: 16, padding: '20px 24px', marginBottom: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h2 style={{ margin: 0, color: '#fff', fontSize: 20, fontWeight: 800 }}>
             Expense Tracker
          </h2>
          <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
            Record expenses · set budgets · track profit · export reports
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="month" value={month}
            max={currentMonth()}
            onChange={(e) => setMonth(e.target.value)}
            style={{
              ...inputSt, width: 160, background: 'rgba(255,255,255,0.1)',
              color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
            }}
          />
          <Btn outline color="#fff" onClick={() => setShowBudget(true)}
            style={{ borderColor: 'rgba(255,255,255,0.4)', color: '#000000' }}
          >
             Set Budget
          </Btn>
          <Btn onClick={() => setShowModal(true)}>+ Add Expense</Btn>
        </div>
      </div>

      {/* ── Over-budget alert banner ── */}
      {overBudgetCategories.length > 0 && (
        <div style={{
          background: C.redLight, border: `1px solid #FCA5A5`,
          borderRadius: 12, padding: '12px 18px', marginBottom: 16,
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span style={{ fontSize: 20, lineHeight: 1.2 }}></span>
          <div>
            <div style={{ fontWeight: 700, color: C.red, fontSize: 13, marginBottom: 4 }}>
              Budget exceeded in {overBudgetCategories.length} categor{overBudgetCategories.length > 1 ? 'ies' : 'y'}
            </div>
            <div style={{ fontSize: 12, color: '#7F1D1D' }}>
              {overBudgetCategories.map(({ category, total: amt }) => (
                <span key={category} style={{ marginRight: 12 }}>
                  {CAT_ICON[category]} {category}: {fmtCurrency(amt)} / {fmtCurrency(budgets[category])}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── P&L Summary cards ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <SummaryCard
          icon="" label="Revenue"
          value={fmtCurrency(summary?.revenue)}
          sub="Paid orders this month"
          color={C.blue}
        />
        <SummaryCard
          icon="" label="Total Expenses"
          value={fmtCurrency(summary?.totalExpenses)}
          sub={`${expenses.length} entr${expenses.length !== 1 ? 'ies' : 'y'}`}
          color={C.red}
        />
        <SummaryCard
  icon="" label="Platform Commission"
  value={fmtCurrency(summary?.commissionAmount)}
  sub={summary?.commissionIsFinal
    ? `${summary?.commissionRate || 0}% · Auto-deducted`
    : `${summary?.commissionRate || 0}% · Estimate — finalizes on the 1st`}
  color={C.purple}
/>
       <SummaryCard
  icon={profit >= 0 ? '' : ''}
  label="Net Profit"
  value={fmtCurrency(profit)}
  sub={profit < 0 ? 'Running at loss' : 'After expenses & commission'}
  color={profit >= 0 ? C.green : C.red}
/>
<SummaryCard
  icon={growthPos === null ? '' : growthPos ? '' : ''}
  label="vs Last Month"
  value={growth === null ? '—' : `${growth > 0 ? '+' : ''}${growth}%`}
  sub={loadingS ? 'Loading…' : `Prev: ${fmtCurrency(summary?.prevProfitAfterCommission)}`}
  color={growthPos === null ? C.slate : growthPos ? C.green : C.red}
/>
      </div>

      {/* ── 6-Month Trend Chart ── */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 4,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1E293B' }}>
               Revenue vs Expenses Trend
            </div>
            <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
              Monthly P&amp;L over the last {trendMonths} months — hover bars for details
            </div>
          </div>
        </div>
        {loadingT ? <Spinner /> : (
          <TrendChart
            trend={trend}
            trendMonths={trendMonths}
            onChangePeriod={setTrendMonths}
          />
        )}
      </Card>

      {/* ── Smart Insights ── */}
      {summary && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1E293B' }}>
                 Smart Insights
              </div>
              <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
                Auto-generated from your P&amp;L data
              </div>
            </div>
            {(() => {
              const count = generateInsights(summary, budgets, trend)
                .filter((i) => i.priority <= 2).length;
              return count > 0 ? (
                <span style={{
                  background: C.redLight, color: C.red,
                  padding: '3px 10px', borderRadius: 20,
                  fontSize: 11, fontWeight: 700,
                }}>
                  {count} alert{count > 1 ? 's' : ''}
                </span>
              ) : (
                <span style={{
                  background: C.greenLight, color: C.green,
                  padding: '3px 10px', borderRadius: 20,
                  fontSize: 11, fontWeight: 700,
                }}>All good ✓</span>
              );
            })()}
          </div>
          <SmartInsights summary={summary} budgets={budgets} trend={trend} />
        </Card>
      )}

      {/* ── Main content row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>

        {/* ── Expense list ── */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 20px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1E293B' }}>
                Expense Entries — {monthLabel(month)}
              </div>
              <div style={{ fontSize: 12, color: C.slate }}>
                {expenses.length} record{expenses.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn small outline color={C.blue} disabled={exporting.monthly} onClick={() => handleExport('monthly')}>
                {exporting.monthly ? 'Exporting…' : ' Monthly CSV'}
              </Btn>
              <Btn small outline color={C.green} disabled={exporting.yearly} onClick={() => handleExport('yearly')}>
                {exporting.yearly ? 'Exporting…' : ' Yearly CSV'}
              </Btn>
            </div>
          </div>

          {loadingE ? <Spinner /> : expenses.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}></div>
              <div style={{ fontWeight: 600, color: '#1E293B', fontSize: 14 }}>No expenses recorded</div>
              <div style={{ color: C.slate, fontSize: 12, margin: '6px 0 14px' }}>
                Click "+ Add Expense" to start tracking
              </div>
              <Btn small onClick={() => setShowModal(true)}>+ Add First Expense</Btn>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.slateLight }}>
                    {['Date', 'Category', 'Description', 'Amount', ''].map((h) => (
                      <th key={h} style={{
                        padding: '10px 16px', textAlign: 'left',
                        fontSize: 11, fontWeight: 700, color: C.slate,
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                        whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp, i) => {
                    const catBudget  = budgets[exp.category] || 0;
                    const catSpent   = (summary?.categoryBreakdown || []).find((c) => c.category === exp.category)?.total || 0;
                    const isOverCat  = catBudget > 0 && catSpent > catBudget;
                    return (
                      <tr
                        key={exp._id}
                        style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}
                      >
                        <td style={{ padding: '11px 16px', color: C.slate, whiteSpace: 'nowrap' }}>
                          {fmtDate(exp.date)}
                        </td>
                        <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{
                              background: isOverCat ? C.redLight : C.orangeLight,
                              color: isOverCat ? C.red : C.orange,
                              padding: '3px 9px', borderRadius: 12, fontSize: 11,
                              fontWeight: 600,
                            }}>
                              {CAT_ICON[exp.category] || ''}{' '}
                              {exp.category === 'Other' && exp.customCategory
                                ? exp.customCategory
                                : exp.category}
                            </span>
                            {exp.isRecurring && (
                              <span title="Recurring monthly" style={{
                                background: '#EFF6FF', color: C.blue,
                                padding: '2px 6px', borderRadius: 8,
                                fontSize: 10, fontWeight: 700,
                              }}></span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '11px 16px', color: '#1E293B', maxWidth: 220 }}>
                          {exp.description || <span style={{ color: C.border }}>—</span>}
                        </td>
                        <td style={{ padding: '11px 16px', fontWeight: 700, color: C.red, whiteSpace: 'nowrap' }}>
                          {fmtCurrency(exp.amount)}
                        </td>
                        <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => { setEditExp(exp); setShowModal(true); }}
                              style={{
                                background: C.blueLight, color: C.blue,
                                border: 'none', borderRadius: 6, padding: '4px 10px',
                                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              }}
                            > Edit</button>
                            <button
                              onClick={() => setDeleteConf(exp._id)}
                              style={{
                                background: C.redLight, color: C.red,
                                border: 'none', borderRadius: 6, padding: '4px 10px',
                                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              }}
                            >🗑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: C.slateLight, borderTop: `2px solid ${C.border}` }}>
                    <td colSpan={3} style={{ padding: '10px 16px', fontWeight: 700, fontSize: 13, color: '#1E293B' }}>
                      Total
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: 800, fontSize: 14, color: C.red }}>
                      {fmtCurrency(summary?.totalExpenses)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Category breakdown */}
          <Card>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1E293B' }}> By Category</div>
              <button
                onClick={() => setShowBudget(true)}
                style={{
                  background: hasBudgets ? C.blueLight : C.slateLight,
                  color: hasBudgets ? C.blue : C.slate,
                  border: 'none', borderRadius: 8, padding: '4px 10px',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {hasBudgets ? ' Edit Budget' : ' Set Budget'}
              </button>
            </div>
            {!hasBudgets && (
              <div style={{
                background: '#FFFBEB', border: '1px solid #FDE68A',
                borderRadius: 8, padding: '8px 12px', marginBottom: 12,
                fontSize: 11, color: '#92400E',
              }}>
                💡 Set category budgets to see spending limits and alerts
              </div>
            )}
            {loadingS ? <Spinner /> : (
              summary?.categoryBreakdown?.length
                ? <CategoryBar
                    breakdown={summary.categoryBreakdown}
                    total={summary.totalExpenses}
                    budgets={budgets}
                  />
                : <div style={{ color: C.slate, fontSize: 13 }}>No expenses this month</div>
            )}
          </Card>

          {/* Recurring Expenses */}
          <Card>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1E293B', marginBottom: 14 }}>
               Recurring Expenses
            </div>
            <RecurringPanel expenses={expenses} onStopRecurring={handleStopRecurring} />
          </Card>

          {/* Break-Even Calculator */}
          <Card>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1E293B', marginBottom: 14 }}>
               Break-Even Calculator
            </div>
            <BreakEvenCard summary={summary} month={month} />
          </Card>

          {/* P&L mini summary */}
          <Card style={{
            background: profit >= 0 ? C.greenLight : C.redLight,
            border: `1px solid ${profit >= 0 ? '#86EFAC' : '#FCA5A5'}`,
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: profit >= 0 ? C.green : C.red, marginBottom: 10 }}>
              {profit >= 0 ? ' Profitable Month' : ' Loss This Month'}
            </div>
           {[
  { label: 'Revenue',    value: summary?.revenue,          color: C.blue },
  { label: 'Expenses',   value: summary?.totalExpenses,    color: C.red },
  { label: 'Commission', value: summary?.commissionAmount, color: C.purple },
  { label: 'Profit',     value: profit,                    color: profit >= 0 ? C.green : C.red, bold: true },
].map(({ label, value, color, bold }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '5px 0',
                borderTop: bold ? `1px solid ${C.border}` : 'none',
                marginTop: bold ? 6 : 0,
                paddingTop: bold ? 10 : 5,
              }}>
                <span style={{ fontSize: 12, color: C.slate, fontWeight: bold ? 700 : 400 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color }}>{fmtCurrency(value)}</span>
              </div>
            ))}
            {growth !== null && (
              <div style={{
                marginTop: 10, padding: '6px 10px',
                background: growthPos ? '#BBF7D0' : '#FCA5A5',
                borderRadius: 8, textAlign: 'center',
                fontSize: 12, fontWeight: 700,
                color: growthPos ? C.green : C.red,
              }}>
                {growthPos ? '' : ''} {growth > 0 ? '+' : ''}{growth}% vs last month
              </div>
            )}
          </Card>

        </div>
      </div>

      {/* ── Modals ── */}
      {showModal && (
        <ExpenseModal
          expense={editExp}
          onClose={() => { setShowModal(false); setEditExp(null); }}
          onSaved={handleSaved}
        />
      )}

      {showBudget && (
        <BudgetModal
          budgets={budgets}
          onClose={() => setShowBudget(false)}
          onSaved={(updated) => { setBudgets(updated); setShowBudget(false); }}
        />
      )}

      {deleteConf && (
        <Overlay onClose={() => setDeleteConf(null)}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗑️</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>Delete Expense?</h3>
            <p style={{ color: C.slate, fontSize: 13, marginBottom: 20 }}>
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Btn outline color={C.slate} onClick={() => setDeleteConf(null)}>Cancel</Btn>
              <Btn color={C.red} onClick={() => handleDelete(deleteConf)}>Yes, Delete</Btn>
            </div>
          </div>
        </Overlay>
      )}

      {/* ── Toast notification ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'success' ? '#1E293B' : toast.type === 'info' ? '#1E3A5F' : '#7F1D1D',
          color: '#fff', borderRadius: 12, padding: '12px 20px',
          fontSize: 13, fontWeight: 600, zIndex: 9999,
          boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: 10,
          maxWidth: '90vw', animation: 'fadeInUp 0.3s ease',
        }}>
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1,
            }}
          >✕</button>
        </div>
      )}
    </div>
  );
};

export default ExpenseTracker;
