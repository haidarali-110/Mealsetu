import React, { useState, useEffect } from 'react';
import { onEvent, offEvent } from '../../../utils/socket';
import styles from './CommissionHistory.module.css';
import { getVendorCommissionSummary, getVendorCommissionHistory } from '../../../utils/api.js';

// onGoToExpenses is optional — pass it from VendorDashboard as
// onGoToExpenses={() => setActiveTab('expenses')} to deep-link the button below.
const CommissionHistory = ({ onGoToExpenses }) => {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchCommissionData(); }, []);

  useEffect(() => {
    const handleUpdate = () => fetchCommissionData();
    onEvent('commission_updated', handleUpdate);
    return () => offEvent('commission_updated', handleUpdate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCommissionData = async () => {
    try {
      setLoading(true);
      const [summaryRes, historyRes] = await Promise.all([
        getVendorCommissionSummary(),
        getVendorCommissionHistory()
      ]);
      setSummary(summaryRes);
      setHistory(historyRes?.commissions || []);
    } catch (error) {
      console.error('Commission data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fmtDate = (d, opts) => d ? new Date(d).toLocaleDateString('en-IN', opts) : '—';
  const longDate = (d) => fmtDate(d, { day: 'numeric', month: 'long', year: 'numeric' });
  const inr = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

  if (loading) return <div className="loading">Loading commissions...</div>;

  return (
    <div className={styles.commissionContainer}>
      {/* HOW COMMISSION WORKS — always visible, so new vendors know upfront */}
<details style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
  <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#1e293b', fontSize: 14 }}>
    ℹ️ How commission works
  </summary>
  <div style={{ marginTop: 10, fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
    <p style={{ margin: '0 0 8px' }}>
      Every month, MealSetu takes a small commission on your <strong>net earnings</strong> (your revenue
      minus any expenses you've logged). The rate depends on your tier — the more you earn, the higher
      the rate. Your current rate is <strong>{summary?.commission_rate || 0}%</strong> ({summary?.tier_name || 'Starter'} tier).
    </p>
    <p style={{ margin: '0 0 8px' }}>
      Commission is <strong>deducted automatically</strong> on the 1st of every month — you never need to
      pay manually. Financial Year {summary?.financialYear || ''} runs April to March.
    </p>
    <p style={{ margin: 0 }}>
      <strong>Your first cycle is different:</strong> instead of a full calendar month, it runs from the
      day you joined to the end of that month. Every cycle after that covers a full calendar month.
    </p>
  </div>
</details>  

{summary?.isFirstCycle && summary?.status !== 'auto_deducted' && (
  <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', padding: '14px 18px', borderRadius: 12, marginBottom: 20 }}>
    <strong style={{ color: '#1d4ed8' }}> This is your first billing cycle</strong>
    <p style={{ margin: '4px 0 0', color: '#1e40af', fontSize: 13 }}>
      It covers {summary?.periodStart ? new Date(summary.periodStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }) : ''} –{' '}
      {summary?.periodEnd ? new Date(summary.periodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : ''} only
      (a partial month, since you joined mid-month). Every cycle after this runs a full calendar month.
    </p>
  </div>
)}

      {/* STATUS BANNER */}
      {summary?.status === 'auto_deducted' && (
        <div style={{
          background: '#dcfce7', border: '1px solid #16a34a',
          padding: '16px 20px', borderRadius: 12, marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 12
        }}>
          <span style={{ fontSize: 24 }}>✅</span>
          <div>
            <strong style={{ color: '#15803d' }}>Commission Auto-Deducted</strong>
            <p style={{ margin: '4px 0 0', color: '#166534', fontSize: 13 }}>
              {inr(summary?.commission_due)} was automatically deducted for {summary?.current_month} on{' '}
              {summary?.auto_deducted_at ? longDate(summary.auto_deducted_at) : 'month end'}. No action required.
            </p>
          </div>
        </div>
      )}

      {summary?.status === 'not_generated' && (
        <div style={{
          background: '#fff7ed', border: '1px solid #f97316',
          padding: '16px 20px', borderRadius: 12, marginBottom: 24
        }}>
          <strong style={{ color: '#c2410c' }}>⏳ Commission Calculation Pending</strong>
          <p style={{ margin: '4px 0 0', color: '#9a3412', fontSize: 13 }}>
            Commission for {summary?.current_month} will be automatically calculated and deducted on the 1st of next month.
            The numbers below update live as you take orders and log expenses.
          </p>
        </div>
      )}

      {/* SUMMARY CARDS — 4 cards, no duplicate value shown twice.
          Net Earnings is folded into the Commission card as context instead
          of being its own card (it was showing the exact same ₹ as Gross
          whenever expenses were ₹0, which just looked like a bug). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>

        <div className={`${styles.card} ${styles.cardGreen}`}>
          <h3>This Month's Revenue</h3>
          <div className="amount">{inr(summary?.gross_earning)}</div>
          <small>{summary?.orders_count || 0} orders · before expenses</small>
        </div>

        <div className={`${styles.card} ${styles.cardRed}`}>
          <h3>Expenses Logged</h3>
          <div className="amount">{inr(summary?.total_expenses)}</div>
          <small>{summary?.expenses_count || 0} expense entries this month</small>
        </div>

        {/* MERGED CARD — rate % and ₹ commission amount together */}
        <div className={`${styles.card} ${styles.cardAmber}`}>
          <h3>Commission</h3>
          <div className="amount" style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span>{summary?.commission_rate || 0}%</span>
            <span style={{ fontSize: 18, color: '#dc2626' }}>· {inr(summary?.commission_due)}</span>
          </div>
          <small>{summary?.tier_name || 'Starter'} tier · on {inr(summary?.net_earning)} net earnings</small>
        </div>

        <div className={`${styles.card} ${styles.cardGreen}`}>
          <h3>You Keep</h3>
          <div className="amount" style={{ fontSize: 22 }}>{inr(summary?.vendor_keeps)}</div>
          <small>Auto-settled monthly</small>
        </div>

      </div>

      {/* LIFETIME TOTALS */}
      {(summary?.lifetimeNetEarning > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 20 }}>
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px' }}>
            <p style={{ margin: 0, fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>LIFETIME NET EARNINGS</p>
            <p style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 700, color: '#374151' }}>{inr(summary.lifetimeNetEarning)}</p>
          </div>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 18px' }}>
            <p style={{ margin: 0, fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>LIFETIME COMMISSION DEDUCTED</p>
            <p style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{inr(summary.lifetimeCommission)}</p>
          </div>
        </div>
      )}

      {/* EXPENSES POINTER — reuses your existing Expenses tab, no duplicate UI here */}
      <div style={{
        marginTop: 24, background: 'white', border: '1px solid #e5e7eb',
        borderRadius: 12, padding: '16px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
      }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, color: '#1e293b' }}>Track your expenses</p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Ingredients, gas, packaging, staff costs, rent — anything you log this month is subtracted from
            gross revenue before commission is calculated.
          </p>
        </div>
        <button
          onClick={onGoToExpenses}
          style={{
            background: '#f97316', color: 'white', border: 'none',
            borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer'
          }}
        >
          Open Expenses →
        </button>
      </div>

      {/* HISTORY TABLE */}
      {history.length > 0 ? (
        <div className={styles.sectionCard} style={{ marginTop: 24 }}>
          <div className={styles.sectionHeader}>
            <h2>Commission History ({history.length})</h2>
            <button className={styles.refreshBtn} onClick={fetchCommissionData}>Refresh</button>
          </div>
          <div className="w-full overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['PERIOD', 'REVENUE', 'EXPENSES', 'COMMISSION', 'YOU KEPT', 'STATUS'].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px',
                      textAlign: ['REVENUE', 'EXPENSES', 'COMMISSION', 'YOU KEPT'].includes(h) ? 'right' : 'left',
                      fontSize: 11, fontWeight: 600, color: '#6b7280',
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((c) => {
                  const gross = c.gross_earning ?? c.total_earning ?? 0;
                  const net   = c.net_earning   ?? c.total_earning ?? 0;
                  const kept  = net - (c.commission_amount || 0);

                  const periodLabel = (() => {
                    if (c.periodStart && c.periodEnd) {
  const label = `${fmtDate(c.periodStart, { day: 'numeric', month: 'short' })} – ${fmtDate(c.periodEnd, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return c.isFirstCycle ? `${label} (First Cycle)` : label;
}
                    if (c.month && /^\d{4}-\d{2}$/.test(c.month)) {
                      const [year, month] = c.month.split('-');
                      return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
                    }
                    if (c.month && c.month.includes('-W')) {
                      if (c.notes && c.notes.includes('Week:')) {
                        return c.notes.split('Week:')[1]?.split('|')[0]?.trim();
                      }
                      return c.month;
                    }
                    if (c.weekStart && c.weekEnd) {
                      return `${fmtDate(c.weekStart, { day: 'numeric', month: 'short' })} – ${fmtDate(c.weekEnd, { day: 'numeric', month: 'short', year: 'numeric' })}`;
                    }
                    return c.month || c.week || 'N/A';
                  })();

                  const statusCfg = {
                    paid:                  { bg: '#dcfce7', color: '#16a34a', label: '✓ Paid' },
                    auto_deducted:         { bg: '#dbeafe', color: '#1d4ed8', label: '⚡ Auto Deducted' },
                    overdue:               { bg: '#fef2f2', color: '#ef4444', label: '⚠ Overdue' },
                    pending_verification:  { bg: '#fef3c7', color: '#d97706', label: '🕐 Verifying' },
                    pending:               { bg: '#fef3c7', color: '#d97706', label: '⏳ Pending' },
                  }[c.status] || { bg: '#f3f4f6', color: '#374151', label: c.status };

                  return (
                    <tr key={c._id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{periodLabel}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{inr(gross)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: (c.total_expenses || 0) > 0 ? '#f59e0b' : '#9ca3af' }}>
                        {(c.total_expenses || 0) > 0 ? `-${inr(c.total_expenses)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>
                        {inr(c.commission_amount)} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({c.commission_rate}%)</span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{inr(kept)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                          background: statusCfg.bg, color: statusCfg.color
                        }}>
                          {statusCfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className={styles.sectionCard} style={{ marginTop: 24 }}>
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: '32px 0' }}>
            No commission records yet. Your first one is generated on the 1st of next month and deducted automatically.
          </p>
        </div>
      )}

    </div>
  );
};

export default CommissionHistory;
