import React from 'react';
import './Reports.css';




const Reports = ({ reportFilter, onFilterChange, onDownloadPDF, reports }) => {
  return (
    <div className="reports">
      <div className="reports-header">
        <h3>Earnings & Reports</h3>
        <button className="download-pdf-btn" onClick={onDownloadPDF}>
           Download PDF
        </button>
      </div>
      <div className="filter-section">
        <select
          className="filter-select"
          value={reportFilter}
          onChange={(e) => onFilterChange(e.target.value)}
        >
          <option>Daily Overview</option>
          <option>Weekly Analysis</option>
          <option>Monthly Statement</option>
        </select>
      </div>
      <div className="reports-table-container">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Transaction ID</th>
              <th>Date</th>
              <th>Orders</th>
              <th>Earning</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.date}</td>
                <td>{row.orders}</td>
                <td>₹ {row.earning}</td>
                <td>
                  <span className="status-settled">{row.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Reports;
