import React from 'react';
import './CustomerManagement.css';

const CustomerManagement = ({ activeSubscriptions }) => {
  return (
    <div className="customer-management">
      <div className="header">
        <h3>Active Subscriptions</h3>
        <div className="total-badge">
          Total: {activeSubscriptions.filter(s => s.status !== "Expired").length}
        </div>
      </div>
      <table className="customers-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Contact</th>
            <th>Plan</th>
            <th>Expiry</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {activeSubscriptions.map((sub) => (
            <tr key={sub.id}>
              <td>
                <div className="customer-name">{sub.name}</div>
                <div className="customer-pref">{sub.pref}</div>
              </td>
              <td>{sub.phone}</td>
              <td>
                <span className="plan-badge">{sub.plan}</span>
              </td>
              <td>{new Date(sub.expiry).toLocaleDateString('en-IN')}</td>
              <td>
                <span className={`status-badge ${sub.status.toLowerCase().replace(/\s+/g, '-')}`}>
                  {sub.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CustomerManagement;
