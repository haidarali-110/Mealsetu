const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    vendorId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Vendor',
      required: true,
      index:    true,
    },
    amount:   { type: Number, required: true, min: 0 },
    category: {
      type:     String,
      required: true,
      enum: [
        'Rent',
        'Ingredients',
        'Staff Salaries',
        'Gas/Fuel',
        'Packaging',
        'Electricity',
        'Marketing',
        'Maintenance',
        'Transport',
        'Platform Commission',
        'Other',
      ],
    },
    customCategory: { type: String, default: '' }, // used when category = 'Other'
    description:    { type: String, default: '' },
    isRecurring:    { type: Boolean, default: false },
    date:  { type: Date, required: true },
    month: { type: String, required: true }, // YYYY-MM — set by controller
  },
  { timestamps: true }
);

expenseSchema.index({ vendorId: 1, month: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
