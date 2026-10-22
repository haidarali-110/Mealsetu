import React, { useState } from 'react';
import './OrderTracking.css';

const OrderTracking = ({ orders, onFilter }) => {
  const [filterDate, setFilterDate] = useState('');

  const handleFilter = () => {
    onFilter(filterDate);
  };

  return (
    <div className="order-tracking">
      <div className="tracking-header">
        <h3>Orders & Upcoming Deliveries</h3>
        <div className="filter-controls">
          <input
            type="date"
            className="date-filter"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
          <button className="filter-btn" onClick={handleFilter}>Filter</button>
        </div>
      </div>
      <table className="orders-table">
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Customer Name</th>
            <th>Meal Preference</th>
            <th>Delivery Slot</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order, index) => (
            <tr key={index}>
              <td>{order.id}</td>
              <td>{order.customer}</td>
              <td>{order.preference}</td>
              <td>{order.slot}</td>
              <td>
                <span className={`status-badge ${order.status.toLowerCase().replace(' ', '-')}`}>
                  {order.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default OrderTracking;
