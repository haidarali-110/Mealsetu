import React from 'react';
import './History.css';

const History = ({ paymentHistory, onDownloadInvoice }) => {
  return (
    <div className="history-card">
      <h3>Payment History</h3>
      <div className="history-table-wrapper">
        <table className="history-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {paymentHistory.length === 0 ? (
              <tr>
                <td colSpan="5" className="history-empty">
                  No payment history found.
                </td>
              </tr>
            ) : (
              paymentHistory.map((h, i) => (
                <tr key={i}>
                  <td>{h.id}</td>
                  <td>{h.date}</td>
                  <td>₹{h.amount}</td>
                  <td>
                    <div>
                      <span className={
                        h.status === 'Paid' || h.status === 'Free'
                          ? 'status-paid'
                          : h.status === 'Pending'
                            ? 'status-pending'
                            : 'status-failed'
                      }>
                        {h.status}
                      </span>
                      {h.paymentMethod === 'Cash' && h.status === 'Paid' && h.cashPaymentConfirmedAt && (
                        <small style={{ display: 'block', marginTop: '3px', color: '#166534', fontSize: '11px' }}>
                          Confirmed {new Date(h.cashPaymentConfirmedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </small>
                      )}
                      {h.paymentMethod === 'Cash' && h.status === 'Pending' && (
                        <small style={{ display: 'block', marginTop: '3px', color: '#9a3412', fontSize: '11px' }}>
                          Pay at pickup
                        </small>
                      )}
                    </div>
                  </td>
                  <td>
                    <button
                      className="download-btn"
                      onClick={() => onDownloadInvoice(h)}
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default History;