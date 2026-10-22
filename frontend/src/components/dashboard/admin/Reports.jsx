import { useEffect, useState } from 'react';
import { getAdminCommissionDisputes, getAdminCommissionTiers, getAdminCommissionVendors, getAdminMarkCommissionPaid, resolveAdminCommissionDispute, seedDefaultTiers, updateAdminCommissionTiers } from '../../../utils/api.js';
import { getAuthItem } from '../../../utils/authStorage';
import './Reports.css';
import VendorCommissionDetail from './VendorCommissionDetail';

const getTierName = (earning, tiers) => {
  const tier = tiers
    .filter(t => t.isActive !== false)
    .sort((a, b) => b.minEarning - a.minEarning)
    .find(t => earning >= t.minEarning);
  return tier?.tierName || 'Starter';
};

// A commission is "settled" whether the vendor paid manually (legacy weekly
// flow) or it was auto-deducted (new monthly flow) — treat both as closed.
const isSettled = (c) => c.status === 'paid' || c.status === 'auto_deducted';

const Reports = () => {
  const [tiers, setTiers]         = useState([]);
  const [vendors, setVendors]     = useState([]);
  const [disputes, setDisputes]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('commissions');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [searchQuery, setSearchQuery]     = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedWeek, setSelectedWeek]   = useState('');

  // Dispute resolve modal state
  const [resolveModal, setResolveModal]         = useState(null); // commission object
  const [resolveNote, setResolveNote]           = useState('');
  const [resolveAdjustedAmt, setResolveAdjustedAmt] = useState('');
  const [resolveSubmitting, setResolveSubmitting]   = useState(false);

  const [drillVendorId, setDrillVendorId] = useState(null);

  const now = new Date();

  // ── Derived summary stats (single source of truth — declared once) ──────
  const totalOutstanding = vendors
    .filter(c => !isSettled(c))
    .reduce((sum, c) => sum + (c.commission_amount || 0), 0);

  const overdueVendors = vendors.filter(c => c.status === 'overdue');
  const overdueCount   = overdueVendors.length;
  const overdueAmount  = overdueVendors.reduce((sum, c) => sum + (c.commission_amount || 0), 0);

  const thirtyDaysAgo  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const paidThisMonth  = vendors
    .filter(c => isSettled(c) && c.payment_date && new Date(c.payment_date) > thirtyDaysAgo)
    .reduce((sum, c) => sum + (c.commission_amount || 0), 0);

  const autoDeductedThisMonth = vendors
    .filter(c => c.status === 'auto_deducted' && c.payment_date && new Date(c.payment_date) > thirtyDaysAgo)
    .reduce((sum, c) => sum + (c.commission_amount || 0), 0);

  const totalVendors    = vendors.length;
  const paidOnTimeCount = vendors.filter(c => isSettled(c) && c.paidOnTime === true).length;
  const collectionRate  = totalVendors > 0 ? Math.round((paidOnTimeCount / totalVendors) * 100) : 0;
  // ──────────────────────────────────────────────────────────────────────

  const downloadCommissionCSV = async () => {
    try {
      const response = await fetch('/api/admin/commission/report/csv', {
        headers: { Authorization: `Bearer ${getAuthItem('token')}` }
      });
      const blob = await response.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'mealsetu-commissions.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Export failed: ' + error.message);
    }
  };

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tiersData, vendorsData, disputesData] = await Promise.all([
        getAdminCommissionTiers(),
        getAdminCommissionVendors(),
        getAdminCommissionDisputes()
      ]);
      setTiers(tiersData.tiers || []);
      setVendors(vendorsData.vendors || []);
      setDisputes(disputesData.disputes || []);
    } catch (error) {
      console.error('Admin commission load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveDispute = async () => {
    if (!resolveNote.trim()) { alert('Resolution note is required'); return; }
    setResolveSubmitting(true);
    try {
      await resolveAdminCommissionDispute(resolveModal._id, {
        resolutionNote: resolveNote.trim(),
        adjustedAmount: resolveAdjustedAmt !== '' ? Number(resolveAdjustedAmt) : undefined
      });
      setResolveModal(null);
      setResolveNote('');
      setResolveAdjustedAmt('');
      loadData();
    } catch (error) {
      alert('Resolve failed: ' + error.message);
    } finally {
      setResolveSubmitting(false);
    }
  };

  const monthOptions = () => {
    const months = [];
    const now    = new Date();
    for (let i = 0; i < 12; i++) {
      const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      months.push({ value, label });
    }
    return months;
  };

  const filteredVendors = vendors
    .filter(v => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (searchQuery && !v.vendor_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (selectedMonth) {
        // Monthly records already carry v.month as 'YYYY-MM'; legacy weekly
        // records only have weekStart, so derive the month from that.
        const cm = v.month || (v.weekStart
          ? `${new Date(v.weekStart).getFullYear()}-${String(new Date(v.weekStart).getMonth() + 1).padStart(2, '0')}`
          : null);
        if (!cm || cm !== selectedMonth) return false;
      }
      if (selectedWeek && selectedMonth && v.weekStart) {
        const ws          = new Date(v.weekStart);
        const weekInMonth = Math.ceil(ws.getDate() / 7);
        if (String(weekInMonth) !== selectedWeek) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const order = { overdue: 0, pending: 1, auto_deducted: 2, paid: 2 };
      return (order[a.status] ?? 1) - (order[b.status] ?? 1);
    });

  const handleSaveTiers = async () => {
    try {
      if (tiers.some(t => t.ratePercent < 0 || t.ratePercent > 100)) {
        alert('Rate must be between 0 and 100');
        return;
      }
      await updateAdminCommissionTiers(tiers);
      alert('All tiers saved successfully');
      loadData();
    } catch (error) {
      alert('Save failed: ' + error.message);
    }
  };

  const handleAdminMarkPaid = async (commissionId) => {
    if (!window.confirm('Mark this commission as paid?')) return;
    try {
      await getAdminMarkCommissionPaid(commissionId);
      loadData();
    } catch (error) {
      alert('Failed: ' + error.message);
    }
  };

  const handleSeedTiers = async () => {
    if (!window.confirm('Seed default tiers? (only if empty)')) return;
    try {
      await seedDefaultTiers();
      loadData();
    } catch (error) {
      alert('Seed failed: ' + error.message);
    }
  };

  if (loading) {
    return <div className="admin-loading">Loading commission dashboard...</div>;
  }

  return (
    <div className="admin-reports">

      {/* HEADER + TAB NAV */}
      <div style={{ marginBottom: 8 }}>
        <div className="admin-reports-header" style={{ marginBottom: 0 }}>
          <h1>Commission Management</h1>
          <div className="header-actions">
            {activeTab === 'commissions' && (
              <button onClick={downloadCommissionCSV} className="csv-btn">Export CSV</button>
            )}
            {activeTab === 'settings' && (
              <button onClick={handleSeedTiers} className="seed-btn">Seed Default Tiers</button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e5e7eb', marginTop: 12 }}>
          {[
            { key: 'commissions', label: 'Collections & Settlements' },
            { key: 'disputes',    label: 'Disputes', badge: disputes.length },
            { key: 'settings',    label: 'Tier Configuration' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background:   'none',
                border:       'none',
                padding:      '10px 20px',
                fontWeight:   activeTab === tab.key ? 700 : 400,
                fontSize:     14,
                cursor:       'pointer',
                color:        activeTab === tab.key ? '#f97316' : '#6b7280',
                borderBottom: activeTab === tab.key ? '2px solid #f97316' : '2px solid transparent',
                marginBottom: -2,
                transition:   'all 0.15s',
                display:      'flex',
                alignItems:   'center',
                gap:          6
              }}
            >
              {tab.label}
              {tab.badge > 0 && (
                <span style={{
                  background: '#dc2626', color: 'white',
                  borderRadius: '50%', width: 18, height: 18,
                  fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* SETTINGS TAB — tier configuration */}
      {activeTab === 'settings' && (
      <div className="reports-section">
        <h2>Tier Settings</h2>
        <div className="table-wrapper">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Tier Name</th>
                <th>Min Earning (₹)</th>
                <th>Max Earning (₹)</th>
                <th>Commission Rate</th>
                <th>Active</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {tiers.length === 0 ? (
                <tr><td colSpan="6" className="no-data">No tiers. Click Seed Default Tiers.</td></tr>
              ) : (
                tiers.map((tier, index) => (
                  <tr key={tier._id || index}>
                    <td>
                      <input type="text" value={tier.tierName} className="tier-input"
                        onChange={(e) => { const u = [...tiers]; u[index].tierName = e.target.value; setTiers(u); }} />
                    </td>
                    <td>
                      <input type="number" value={tier.minEarning} className="tier-input"
                        onChange={(e) => { const u = [...tiers]; u[index].minEarning = Number(e.target.value); setTiers(u); }} />
                    </td>
                    <td>
                      <input type="number" value={tier.maxEarning || ''} placeholder="No limit" className="tier-input"
                        onChange={(e) => { const u = [...tiers]; u[index].maxEarning = e.target.value ? Number(e.target.value) : null; setTiers(u); }} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="number" min="0" max="100" value={tier.ratePercent} className="tier-rate-input"
                          onChange={(e) => { const u = [...tiers]; u[index].ratePercent = Number(e.target.value); setTiers(u); }} />
                        <span style={{ fontWeight: 700, color: '#f97316' }}>%</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label className="switch">
                          <input type="checkbox" checked={tier.isActive !== false}
                            onChange={(e) => { const u = [...tiers]; u[index].isActive = e.target.checked; setTiers(u); }} />
                          <span className="slider"></span>
                        </label>
                        <span style={{ fontSize: 12, fontWeight: 700, color: tier.isActive !== false ? '#16a34a' : '#ef4444' }}>
                          {tier.isActive !== false ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <button onClick={handleSaveTiers} className="save-all-btn">Save All</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )} {/* end settings tab */}

      {/* COMMISSIONS TAB — daily operations */}
      {activeTab === 'commissions' && (
      <div className="reports-section">
        <h2>Vendor Commissions ({filteredVendors.length})</h2>

        {/* Summary bar — now 5 cards, includes Auto-Deducted */}
        {(totalOutstanding > 0 || autoDeductedThisMonth > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#fef2f2', borderRadius: 10, padding: '14px 18px', borderLeft: '4px solid #dc2626' }}>
              <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>TOTAL OUTSTANDING</p>
              <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700, color: '#dc2626' }}>
                ₹{totalOutstanding.toLocaleString('en-IN')}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>
                across {vendors.filter(c => !isSettled(c)).length} vendors
              </p>
            </div>
            <div style={{ background: '#fff7ed', borderRadius: 10, padding: '14px 18px', borderLeft: '4px solid #f97316' }}>
              <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>OVERDUE</p>
              <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700, color: '#f97316' }}>
                ₹{overdueAmount.toLocaleString('en-IN')}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>
                {overdueCount} vendor{overdueCount !== 1 ? 's' : ''}
              </p>
            </div>
            <div style={{ background: '#ecfdf5', borderRadius: 10, padding: '14px 18px', borderLeft: '4px solid #059669' }}>
              <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>AUTO-DEDUCTED THIS MONTH</p>
              <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700, color: '#059669' }}>
                ₹{autoDeductedThisMonth.toLocaleString('en-IN')}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>no vendor action needed</p>
            </div>
            <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '14px 18px', borderLeft: '4px solid #16a34a' }}>
              <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>COLLECTED THIS MONTH</p>
              <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700, color: '#16a34a' }}>
                ₹{paidThisMonth.toLocaleString('en-IN')}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>last 30 days</p>
            </div>
            <div style={{ background: '#eff6ff', borderRadius: 10, padding: '14px 18px', borderLeft: '4px solid #3b82f6' }}>
              <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>ON-TIME RATE</p>
              <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700, color: '#2563eb' }}>
                {collectionRate}%
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>
                {paidOnTimeCount} of {totalVendors} vendors
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="filter-select">
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
            <option value="auto_deducted">Auto-Deducted</option>
            <option value="paid">Paid</option>
          </select>

          <input
            placeholder="Search vendors..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="filter-input"
          />

          <select
            value={selectedMonth}
            onChange={e => { setSelectedMonth(e.target.value); setSelectedWeek(''); }}
            className="filter-select"
          >
            <option value="">All Months</option>
            {monthOptions().map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          {selectedMonth && (
            <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)} className="filter-select">
              <option value="">All Weeks</option>
              <option value="1">Week 1 (1st–7th)</option>
              <option value="2">Week 2 (8th–14th)</option>
              <option value="3">Week 3 (15th–21st)</option>
              <option value="4">Week 4 (22nd–28th)</option>
              <option value="5">Week 5 (29th+)</option>
            </select>
          )}

          {(selectedMonth || selectedWeek || statusFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => { setSelectedMonth(''); setSelectedWeek(''); setStatusFilter('all'); setSearchQuery(''); }}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', fontSize: 13, cursor: 'pointer', color: '#6b7280' }}
            >
              ✕ Clear
            </button>
          )}

          {overdueCount > 0 && (
            <button
              onClick={() => setStatusFilter(statusFilter === 'overdue' ? 'all' : 'overdue')}
              style={{
                background:   statusFilter === 'overdue' ? '#dc2626' : '#fee2e2',
                color:        statusFilter === 'overdue' ? 'white'   : '#dc2626',
                border:       '1.5px solid #dc2626',
                borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
              }}
            >
              ⚠ Overdue ({overdueCount})
            </button>
          )}
        </div>

        <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 12 }}>
          Showing {filteredVendors.length} of {vendors.length} records
          {selectedMonth && ` · ${monthOptions().find(m => m.value === selectedMonth)?.label}`}
          {selectedWeek && ` · Week ${selectedWeek}`}
        </p>

        <div className="table-wrapper">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Period</th>
                <th>Gross</th>
                <th title="Total wallet credit used by customers">Wallet Used</th>
                <th>Rate</th>
                <th>Due</th>
                <th>Settled Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVendors.length === 0 ? (
                <tr><td colSpan="9" className="no-data">No vendor commission records found.</td></tr>
              ) : (
                filteredVendors.map((v) => {
                  const isAuto     = v.status === 'auto_deducted';
                  const isOverdue  = v.status === 'overdue';
                  const isDueSoon  = v.status === 'pending' && v.due_date &&
                    new Date(v.due_date) < new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
                  const paidOnTime = v.payment_date && v.due_date &&
                    new Date(v.payment_date) <= new Date(v.due_date);

                  return (
                    <tr key={v._id} style={{
                      background: isOverdue ? '#fef2f2' : isDueSoon ? '#fffbeb' : isAuto ? '#f0fdf4' : 'white'
                    }}>

                      {/* Vendor name + tier badge */}
                      <td>
                        <button
                          onClick={() => setDrillVendorId(v.vendorId)}
                          style={{
                            background: 'none', border: 'none', color: '#f97316',
                            cursor: 'pointer', fontWeight: 600,
                            textDecoration: 'underline', padding: 0, fontSize: 14
                          }}
                        >
                          {v.vendor_name}
                        </button>
                        <div style={{ marginTop: 3 }}>
                          <span style={{
                            fontSize: 11, padding: '2px 7px', borderRadius: 8,
                            background: '#eff6ff', color: '#2563eb', fontWeight: 500
                          }}>
                            {getTierName(v.total_earning || 0, tiers)} tier
                          </span>
                        </div>
                        {v.disputeStatus === 'raised' && (
                          <div style={{ marginTop: 4, fontSize: 10, color: '#dc2626', fontWeight: 600 }}>
                            ⚑ Dispute raised
                          </div>
                        )}
                      </td>

                      {/* Period — shows month label for new records, week dates for legacy */}
                      <td>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>
                          {v.weekStart && v.weekEnd
                            ? `${new Date(v.weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(v.weekEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                            : v.month
                              ? new Date(`${v.month}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
                              : (v.week || '—')}
                        </span>
                        <br />
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>{v.week || v.month}</span>
                      </td>

                      <td>₹{v.total_earning?.toLocaleString('en-IN')}</td>
                      <td style={{ color: v.total_wallet_deductions > 0 ? '#f59e0b' : '#9ca3af', fontSize: 13 }}>
                        {v.total_wallet_deductions > 0
                          ? `-₹${v.total_wallet_deductions.toLocaleString('en-IN')}`
                          : '—'}
                      </td>
                      <td>{v.commission_rate}%</td>
                      <td style={{ fontWeight: 600 }}>₹{v.commission_amount?.toLocaleString('en-IN')}</td>

                      {/* Settled date — payment_date covers both manual-paid and auto-deducted */}
                      <td>
                        {!isAuto && (
                          <span style={{ color: isOverdue ? '#dc2626' : '#374151', fontSize: 13 }}>
                            {v.due_date
                              ? new Date(v.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                              : '—'}
                          </span>
                        )}
                        {v.payment_date && (
                          <div style={{ marginTop: 3 }}>
                            <span style={{
                              fontSize: 11,
                              color: isAuto ? '#059669' : (paidOnTime ? '#16a34a' : '#f97316')
                            }}>
                              {isAuto ? '⚡ Deducted' : (paidOnTime ? '✓ Paid on time' : 'Paid late')}
                              {' · '}
                              {new Date(v.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* STATUS — this is where the auto-deducted badge lives */}
                      <td>
                        <span style={{
                          padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                          background: isAuto      ? '#dcfce7'
                                    : isOverdue    ? '#fee2e2'
                                    : isDueSoon    ? '#fef3c7'
                                    : v.status === 'paid' ? '#dcfce7' : '#f3f4f6',
                          color:      isAuto      ? '#16a34a'
                                    : isOverdue    ? '#dc2626'
                                    : isDueSoon    ? '#d97706'
                                    : v.status === 'paid' ? '#16a34a' : '#374151'
                        }}>
                          {isAuto ? '⚡ Auto-Deducted'
                            : isOverdue ? 'Overdue'
                            : isDueSoon ? 'Due Soon'
                            : v.status === 'paid' ? 'Paid' : 'Pending'}
                        </span>
                        {isOverdue && v.due_date && (
                          <div style={{ marginTop: 3 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626' }}>
                              {Math.floor((new Date() - new Date(v.due_date)) / (1000 * 60 * 60 * 24))} days overdue
                            </span>
                          </div>
                        )}
                      </td>

                      {/* ACTIONS — Mark Paid hidden once settled (paid or auto-deducted) */}
                      <td>
                        {!isSettled(v) && (
                          <button className="confirm-btn" onClick={() => handleAdminMarkPaid(v._id)}>
                            Mark Paid
                          </button>
                        )}
                        {v.disputeStatus === 'raised' && (
                          <button
                            onClick={() => setDrillVendorId(v.vendorId || v._id)}
                            style={{
                              background: '#fef2f2', color: '#dc2626',
                              border: '1px solid #fecaca', borderRadius: 6,
                              padding: '4px 10px', fontSize: 11,
                              cursor: 'pointer', marginTop: !isSettled(v) ? 4 : 0,
                              display: 'block'
                            }}
                          >
                            Review Dispute
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      )} {/* end commissions tab */}

      {/* DISPUTES TAB */}
      {activeTab === 'disputes' && (
        <div className="reports-section">
          <h2>Open Disputes ({disputes.length})</h2>
          {disputes.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '48px 0',
              color: '#9ca3af', fontSize: 15
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}></div>
              No open disputes. All clear!
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Period</th>
                    <th>Commission</th>
                    <th>Raised On</th>
                    <th>Dispute Note</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {disputes.map((d) => (
                    <tr key={d._id} style={{ background: '#fef2f2' }}>
                      <td>
                        <strong>{d.vendorId?.kitchenName || 'Unknown Vendor'}</strong>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>
                          {d.vendorId?.ownerId?.email || ''}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>
                          {d.weekStart && d.weekEnd
                            ? `${new Date(d.weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(d.weekEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                            : (d.week || d.month || '—')}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>₹{d.commission_amount?.toLocaleString('en-IN')}</td>
                      <td style={{ fontSize: 12, color: '#6b7280' }}>
                        {d.disputeRaisedAt
                          ? new Date(d.disputeRaisedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '—'}
                      </td>
                      <td style={{ maxWidth: 200, fontSize: 13, color: '#374151' }}>
                        <span title={d.disputeNote}>{d.disputeNote || '—'}</span>
                      </td>
                      <td>
                        <span style={{
                          padding: '3px 9px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                          background: '#fef3c7', color: '#d97706'
                        }}>
                          {d.disputeStatus === 'under_review' ? 'Under Review' : 'Raised'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="confirm-btn"
                          onClick={() => {
                            setResolveModal(d);
                            setResolveNote('');
                            setResolveAdjustedAmt('');
                          }}
                        >
                          Resolve
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )} {/* end disputes tab */}

      {/* DISPUTE RESOLVE MODAL */}
      {resolveModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20
        }}
          onClick={() => { if (!resolveSubmitting) setResolveModal(null); }}
        >
          <div
            style={{
              background: 'white', borderRadius: 14,
              width: '100%', maxWidth: 500, padding: 28
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>Resolve Dispute</h2>
            <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: 13 }}>
              {resolveModal.vendorId?.kitchenName} · {resolveModal.week || resolveModal.weekStart
                ? (resolveModal.weekStart
                    ? `${new Date(resolveModal.weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(resolveModal.weekEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : resolveModal.week)
                : ''}
            </p>

            <div style={{ background: '#fef3c7', borderRadius: 8, padding: '12px 16px', marginBottom: 18 }}>
              <p style={{ margin: 0, fontSize: 12, color: '#92400e', fontWeight: 600 }}>VENDOR'S DISPUTE NOTE</p>
              <p style={{ margin: '6px 0 0', color: '#374151', fontSize: 13 }}>{resolveModal.disputeNote}</p>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Resolution Note <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <textarea
                value={resolveNote}
                onChange={e => setResolveNote(e.target.value)}
                placeholder="Explain your decision to the vendor (they will receive this by email)..."
                rows={4}
                style={{
                  width: '100%', padding: '10px 12px',
                  borderRadius: 8, border: '1.5px solid #e5e7eb',
                  fontSize: 13, resize: 'vertical', boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Adjust Commission Amount (optional)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#6b7280' }}>₹</span>
                <input
                  type="number"
                  min="0"
                  value={resolveAdjustedAmt}
                  onChange={e => setResolveAdjustedAmt(e.target.value)}
                  placeholder={`Current: ₹${resolveModal.commission_amount?.toLocaleString('en-IN')}`}
                  style={{
                    flex: 1, padding: '8px 12px',
                    borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13
                  }}
                />
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>
                Leave blank to keep the current amount. Vendor will be notified if changed.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setResolveModal(null)}
                disabled={resolveSubmitting}
                style={{
                  padding: '10px 20px', borderRadius: 8,
                  border: '1px solid #e5e7eb', background: 'white',
                  fontSize: 13, cursor: 'pointer', color: '#374151'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleResolveDispute}
                disabled={resolveSubmitting || !resolveNote.trim()}
                style={{
                  padding: '10px 24px', borderRadius: 8,
                  border: 'none',
                  background: resolveSubmitting || !resolveNote.trim() ? '#9ca3af' : '#2563eb',
                  color: 'white', fontSize: 13, fontWeight: 600,
                  cursor: resolveSubmitting || !resolveNote.trim() ? 'not-allowed' : 'pointer'
                }}
              >
                {resolveSubmitting ? 'Resolving...' : 'Resolve & Notify Vendor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VENDOR DRILL-DOWN MODAL — outside tabs so it overlays everything */}
      {drillVendorId && (
        <VendorCommissionDetail
          vendorId={drillVendorId}
          onClose={() => setDrillVendorId(null)}
        />
      )}

    </div>
  );
};

export default Reports;
