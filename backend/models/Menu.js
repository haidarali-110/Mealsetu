const mongoose = require('mongoose');

const menuSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  date: { type: Date, required: true },
  
  // Menu Items
  mainSabji: { type: String, required: true }, // e.g. "Paneer Butter Masala"
  altSabji: { type: String },                  // e.g. "Mix Veg Fry"
  sweetItem: { type: String },
  
  // Categories
  dietaryCategory: { 
    type: String, 
    enum: ['Regular', 'Jain', 'Swaminarayan'], 
    default: 'Regular' 
  },
  cycleType: { 
    type: String, 
    enum: ['Daily', 'Weekly'] 
  }
  ,
  isLive: { type: Boolean, default: true }
});

module.exports = mongoose.model('Menu', menuSchema);