import React, { useState } from 'react';
import './MenuPlanner.css';

const MenuPlanner = ({ menuCycle, onMenuCycleChange, onUpdateMenu }) => {
  const [mainSabji, setMainSabji] = useState('');
  const [altSabji, setAltSabji] = useState('');
  const [sweet, setSweet] = useState('');
  const [dietary, setDietary] = useState('Regular');

  const handleUpdate = () => {
    onUpdateMenu({ mainSabji, altSabji, sweet, dietary });
  };

  return (
    <div className="menu-planner">
      <div className="menu-header">
        <h3>{menuCycle} Menu Planner</h3>
        <div className="cycle-buttons">
          {['Daily', 'Weekly', 'Monthly'].map(cycle => (
            <button
              key={cycle}
              className={`cycle-btn ${menuCycle === cycle ? 'active' : ''}`}
              onClick={() => onMenuCycleChange(cycle)}
            >
              {cycle}
            </button>
          ))}
        </div>
      </div>
      <div className="menu-form">
        <div className="form-row">
          <div className="form-group">
            <label>Main Sabji</label>
            <input
              type="text"
              className="menu-input"
              placeholder="e.g. Paneer Butter Masala"
              value={mainSabji}
              onChange={(e) => setMainSabji(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Alternative Sabji</label>
            <input
              type="text"
              className="menu-input"
              placeholder="e.g. Mix Veg Fry"
              value={altSabji}
              onChange={(e) => setAltSabji(e.target.value)}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Sweet Item</label>
            <input
              type="text"
              className="menu-input"
              placeholder="e.g. Gulab Jamun"
              value={sweet}
              onChange={(e) => setSweet(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Dietary Category</label>
            <select
              className="menu-input"
              value={dietary}
              onChange={(e) => setDietary(e.target.value)}
            >
              <option>Regular</option>
              <option>Jain</option>
            </select>
          </div>
        </div>
      </div>
      <button className="update-menu-btn" onClick={handleUpdate}>
        Update {menuCycle} Menu
      </button>
    </div>
  );
};

export default MenuPlanner;
