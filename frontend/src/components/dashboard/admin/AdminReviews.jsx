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

const StarBar = ({ star, count, total }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '12px' }}>
      <span style={{ width: '40px', color: '#64748b', textAlign: 'right' }}>{star}★</span>
      <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#f59e0b', borderRadius: '4px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ width: '32px', color: '#94a3b8' }}>{count}</span>
    </div>
  );
};

const VendorReviewsPanel = ({ vendor, onBack }) => {
  const [reviews,   setReviews]   = useState([]);
  const [breakdown, setBreakdown] = useState({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  const [total,     setTotal]     = useState(0);
  const [pages,     setPages]     = useState(1);
  const [page,      setPage]      = useState(1);
  const [filter,    setFilter]    = useState('all');
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState(null);
  const [actioning, setActioning] = useState({});

  useEffect(() => { load(); }, [page, filter]);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const load = () => {
    setLoading(true);
    const p = new URLSearchParams({ page, limit: 20, filter });
    apiFetch(`/api/admin/vendors/${vendor._id}/reviews?${p}`)
      .then(d => {
        setReviews(d.reviews || []);
        setTotal(d.total || 0);
        setPages(d.pages || 1);
        if (d.starBreakdown) setBreakdown(d.starBreakdown);
      })
      .catch(err => showToast(err.message || 'Failed to load reviews', false))
      .finally(() => setLoading(false));
  };

  const handleAction = async (id, action) => {
    setActioning(prev => ({ ...prev, [id + action]: true }));
    const methods = { hide: 'PATCH', unhide: 'PATCH', delete: 'DELETE', unflag: 'PATCH' };
    const urls    = {
      hide:   `/api/admin/reviews/${id}/hide`,
      unhide: `/api/admin/reviews/${id}/unhide`,
      delete: `/api/admin/reviews/${id}`,
      unflag: `/api/admin/reviews/${id}/unflag`,
    };
    const labels  = { hide: 'hidden', unhide: 'unhidden', delete: 'deleted', unflag: 'unflagged' };
    try {
      await apiFetch(urls[action], { method: methods[action] });
      showToast(`Review ${labels[action]} successfully`);
      load();
    } catch (err) {
      showToast(err.message || `Failed to ${action} review`, false);
    } finally {
      setActioning(prev => ({ ...prev, [id + action]: false }));
    }
  };

  const totalReviews = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const avgRating = totalReviews > 0
    ? Object.entries(breakdown).reduce((sum, [star, cnt]) => sum + Number(star) * cnt, 0) / totalReviews
    : 0;

  return (
    <div style={{ position: 'relative' }}>
      {/* Toast */}
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
        <h2 style={{ margin: 0, fontSize: '20px', flex: 1 }}>⭐ {vendor.kitchenName} — Reviews</h2>
      </div>

      {/* Star breakdown card */}
      {totalReviews > 0 && (
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', marginBottom: '20px', display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center', minWidth: '80px' }}>
            <div style={{ fontSize: '36px', fontWeight: '800', color: '#1a1a2e', lineHeight: 1 }}>{avgRating.toFixed(1)}</div>
            <div style={{ fontSize: '20px', color: '#f59e0b', marginTop: '4px' }}>{'⭐'.repeat(Math.round(avgRating))}</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{totalReviews} reviews</div>
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            {[5, 4, 3, 2, 1].map(s => (
              <StarBar key={s} star={s} count={breakdown[s] || 0} total={totalReviews} />
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[['all', 'All Reviews'], ['flagged', ' Flagged'], ['hidden', '👁 Hidden']].map(([val, lbl]) => (
          <button key={val} onClick={() => { setFilter(val); setPage(1); }} style={{
            padding: '7px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontWeight: '600', fontSize: '13px',
            background: filter === val ? ORANGE : '#f1f5f9', color: filter === val ? 'white' : '#64748b',
          }}>{lbl}</button>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading reviews…</div>
        ) : reviews.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>✅</div>
            <div style={{ fontWeight: '700', color: '#1a1a2e' }}>No reviews in this category</div>
          </div>
        ) : (
          <div>
            {reviews.map((r, i) => (
              <div key={r._id || i} style={{
                padding: '16px 20px',
                borderBottom: '1px solid #f1f5f9',
                background: r.isFlagged ? '#fff5f5' : r.isHidden ? '#f8f8f8' : 'white',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: '700', fontSize: '14px' }}>{r.userId?.name || r.customerName || 'Anonymous'}</span>
                      <span style={{ color: '#f59e0b', fontSize: '14px' }}>{'⭐'.repeat(Math.min(r.rating, 5))}</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{r.rating}/5</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{fmtDate(r.createdAt)}</span>
                      {r.isFlagged && <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontWeight: '600' }}>🚩 Flagged</span>}
                      {r.isHidden  && <span style={{ background: '#f1f5f9', color: '#64748b',  padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontWeight: '600' }}>Hidden</span>}
                    </div>
                    <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.5' }}>{r.comment || <em style={{ color: '#94a3b8' }}>No comment</em>}</div>
                    {r.userId?.email && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{r.userId.email}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
                    {!r.isHidden ? (
                      <button
                        onClick={() => handleAction(r._id, 'hide')}
                        disabled={actioning[r._id + 'hide']}
                        style={{ padding: '5px 10px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#374151', opacity: actioning[r._id + 'hide'] ? 0.5 : 1 }}
                      >Hide</button>
                    ) : (
                      <button
                        onClick={() => handleAction(r._id, 'unhide')}
                        disabled={actioning[r._id + 'unhide']}
                        style={{ padding: '5px 10px', background: '#f0fdf4', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#16a34a', opacity: actioning[r._id + 'unhide'] ? 0.5 : 1 }}
                      >Unhide</button>
                    )}
                    {r.isFlagged && (
                      <button
                        onClick={() => handleAction(r._id, 'unflag')}
                        disabled={actioning[r._id + 'unflag']}
                        style={{ padding: '5px 10px', background: '#eff6ff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#2563eb', opacity: actioning[r._id + 'unflag'] ? 0.5 : 1 }}
                      >Unflag</button>
                    )}
                    <button
                      onClick={() => window.confirm('Delete this review permanently?') && handleAction(r._id, 'delete')}
                      disabled={actioning[r._id + 'delete']}
                      style={{ padding: '5px 10px', background: '#fef2f2', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#dc2626', opacity: actioning[r._id + 'delete'] ? 0.5 : 1 }}
                    >Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {pages > 1 && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', background: 'white' }}>← Prev</button>
            <span style={{ padding: '6px 14px', color: '#64748b', fontSize: '13px' }}>Page {page} of {pages} · {total} reviews</span>
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', background: 'white' }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
};

const AdminReviews = () => {
  const [selectedVendor, setSelectedVendor] = useState(null);

  if (selectedVendor) {
    return <VendorReviewsPanel vendor={selectedVendor} onBack={() => setSelectedVendor(null)} />;
  }

  return <VendorGrid onSelectVendor={setSelectedVendor} statType="reviews" />;
};

export default AdminReviews;
