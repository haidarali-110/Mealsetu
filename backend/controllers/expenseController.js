const Expense = require('../models/Expense');
const Vendor  = require('../models/Vendor');
const Order   = require('../models/Order');
const EXPENSE_CATEGORIES = [
  'Rent', 'Ingredients', 'Staff Salaries', 'Gas/Fuel',
  'Packaging', 'Electricity', 'Marketing', 'Maintenance',
  'Transport', 'Platform Commission', 'Other',
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const toMonthStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const monthBounds = (monthStr) => {
  const [y, m] = monthStr.split('-').map(Number);
  return {
    start: new Date(y, m - 1, 1, 0, 0, 0, 0),
    end:   new Date(y, m, 0, 23, 59, 59, 999),
  };
};

const prevMonthStr = (monthStr) => {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return toMonthStr(d);
};

const revenueForPeriod = async (vendorId, start, end) => {
  const orders = await Order.find({
    vendorId,
    status:        { $nin: ['cancelled', 'on-hold'] },
    paymentStatus: 'Paid',
    $or: [
      { createdAt: { $gte: start, $lte: end } },
      { orderDate:  { $gte: start, $lte: end } },
    ],
  }).select('amount walletDeduction').lean();
  const gross            = orders.reduce((s, o) => s + (o.amount           || 0), 0);
  const walletDeductions = orders.reduce((s, o) => s + (o.walletDeduction  || 0), 0);
  return gross - walletDeductions;
};

const expenseTotalForMonth = async (vendorId, month) => {
  const result = await Expense.aggregate([
    { $match: { vendorId, month } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return result[0]?.total || 0;
};
// Commission for a given month — uses the finalized Commission record if
// the cron already generated it (auto_deducted/paid), otherwise gives a
// live estimate using the current tier table. Keeps this page in sync
// with what the Commission page actually charges.
const commissionForMonth = async (vendorId, month, netEarning) => {
  const existing = await Commission.findOne({ vendorId, month }).lean();
  if (existing) {
    return { amount: existing.commission_amount || 0, rate: existing.commission_rate || 0, isFinal: true };
  }
  if (netEarning <= 0) return { amount: 0, rate: 0, isFinal: false };

  const tiers = await CommissionSetting.find({ isActive: true }).sort({ minEarning: 1 });
  let rate = 3;
  for (const tier of tiers) {
    if (netEarning >= tier.minEarning && (tier.maxEarning === null || netEarning <= tier.maxEarning)) {
      rate = tier.ratePercent;
      break;
    }
  }
  return { amount: Math.round(netEarning * rate / 100), rate, isFinal: false };
};

// ── Controllers ────────────────────────────────────────────────────────────────

// @route POST /api/vendor/expenses
const addExpense = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const { amount, category, customCategory, description, date, isRecurring } = req.body;
    if (!amount || !category || !date) {
      return res.status(400).json({ message: 'amount, category and date are required' });
    }
    if (category === 'Other' && !customCategory?.trim()) {
      return res.status(400).json({ message: 'Expense name is required when category is Other' });
    }

    const dateObj = new Date(date);
    const expense = await Expense.create({
      vendorId:       vendor._id,
      amount:         Number(amount),
      category,
      customCategory: category === 'Other' ? customCategory.trim() : '',
      description:    description?.trim() || '',
      isRecurring:    Boolean(isRecurring),
      date:           dateObj,
      month:          toMonthStr(dateObj),
    });

    return res.status(201).json({ message: 'Expense added', expense });
  } catch (err) {
    console.error('addExpense:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @route GET /api/vendor/expenses?month=YYYY-MM
const getExpenses = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const month = req.query.month || toMonthStr(new Date());
    const expenses = await Expense.find({ vendorId: vendor._id, month })
      .sort({ date: 1 })
      .lean();

    return res.json({ expenses });
  } catch (err) {
    console.error('getExpenses:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @route PUT /api/vendor/expenses/:id
const updateExpense = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const expense = await Expense.findOne({ _id: req.params.id, vendorId: vendor._id });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    const { amount, category, customCategory, description, date, isRecurring } = req.body;
    if (amount      !== undefined) expense.amount      = Number(amount);
    if (category    !== undefined) {
      expense.category       = category;
      expense.customCategory = category === 'Other' ? (customCategory?.trim() || '') : '';
    }
    if (customCategory !== undefined && expense.category === 'Other') {
      expense.customCategory = customCategory.trim();
    }
    if (description  !== undefined) expense.description  = description.trim();
    if (isRecurring  !== undefined) expense.isRecurring   = Boolean(isRecurring);
    if (date !== undefined) {
      const d = new Date(date);
      expense.date  = d;
      expense.month = toMonthStr(d);
    }
    await expense.save();

    return res.json({ message: 'Expense updated', expense });
  } catch (err) {
    console.error('updateExpense:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @route DELETE /api/vendor/expenses/:id
const deleteExpense = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const expense = await Expense.findOneAndDelete({ _id: req.params.id, vendorId: vendor._id });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    return res.json({ message: 'Expense deleted' });
  } catch (err) {
    console.error('deleteExpense:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @route GET /api/vendor/expenses/summary?month=YYYY-MM
const getExpenseSummary = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const month = req.query.month || toMonthStr(new Date());
    const prev  = prevMonthStr(month);
    const { start, end }           = monthBounds(month);
    const { start: ps, end: pe }   = monthBounds(prev);

    const orderFilter = (s, e) => ({
      vendorId:      vendor._id,
      status:        { $nin: ['cancelled', 'on-hold'] },
      paymentStatus: 'Paid',
      $or: [{ createdAt: { $gte: s, $lte: e } }, { orderDate: { $gte: s, $lte: e } }],
    });

    const [revenue, totalExpenses, prevRevenue, prevTotalExpenses, orderCount] = await Promise.all([
      revenueForPeriod(vendor._id, start, end),
      expenseTotalForMonth(vendor._id, month),
      revenueForPeriod(vendor._id, ps, pe),
      expenseTotalForMonth(vendor._id, prev),
      Order.countDocuments(orderFilter(start, end)),
    ]);

    const netEarning = revenue - totalExpenses;
    const prevNetEarning = prevRevenue - prevTotalExpenses;

    const commission = await commissionForMonth(vendor._id, month, netEarning);
    const prevCommission = await commissionForMonth(vendor._id, prev, prevNetEarning);

    const profit = revenue - totalExpenses;                 // before commission
    const profitAfterCommission = profit - commission.amount;              // real take-home
    const prevProfit = prevRevenue - prevTotalExpenses;
    const prevProfitAfterCommission = prevProfit - prevCommission.amount;

    let growth = null;
    if (prevProfitAfterCommission !== 0) {
      growth = Math.round(((profitAfterCommission - prevProfitAfterCommission) / Math.abs(prevProfitAfterCommission)) * 1000) / 10;
    } else if (profitAfterCommission > 0) {
      growth = 100;
    }

    // Category breakdown for current month
    const [catBreakdown, prevCatBreakdown] = await Promise.all([
      Expense.aggregate([
        { $match: { vendorId: vendor._id, month } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
      ]),
      Expense.aggregate([
        { $match: { vendorId: vendor._id, month: prev } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
      ]),
    ]);

    const avgOrderValue = orderCount > 0 ? Math.round(revenue / orderCount) : 0;

    return res.json({
      month,
      revenue,
      totalExpenses,
      profit,
      prevProfit,
      prevRevenue,
      prevTotalExpenses,
      growth,
      orderCount,
      avgOrderValue,
      categoryBreakdown:     catBreakdown.map((c)     => ({ category: c._id, total: c.total })),
      prevCategoryBreakdown: prevCatBreakdown.map((c) => ({ category: c._id, total: c.total })),
    });
  } catch (err) {
    console.error('getExpenseSummary:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @route GET /api/vendor/expenses/export?month=YYYY-MM&type=monthly|yearly
const exportExpensesCSV = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const { month = toMonthStr(new Date()), type = 'monthly' } = req.query;

    if (type === 'yearly') {
      const year = month.split('-')[0];
      const rows = ['Month,Revenue (INR),Total Expenses (INR),Net Profit (INR),Growth %'];
      let prevProfit = null;

      for (let m = 1; m <= 12; m++) {
        const mStr = `${year}-${String(m).padStart(2, '0')}`;
        const { start, end } = monthBounds(mStr);
        const [rev, exp] = await Promise.all([
          revenueForPeriod(vendor._id, start, end),
          expenseTotalForMonth(vendor._id, mStr),
        ]);
        const profit = rev - exp;
        let growthStr = '-';
        if (prevProfit !== null && prevProfit !== 0) {
          growthStr = (((profit - prevProfit) / Math.abs(prevProfit)) * 100).toFixed(1) + '%';
        } else if (prevProfit === 0 && profit > 0) {
          growthStr = '+100%';
        }
        prevProfit = profit;
        const label = new Date(parseInt(year), m - 1, 1)
          .toLocaleString('en-IN', { month: 'long', year: 'numeric' });
        rows.push(`${label},${rev},${exp},${profit},${growthStr}`);
      }

      const csv = rows.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="expenses_${year}_yearly.csv"`);
      return res.send(csv);
    }

    // Monthly export
    const { start, end } = monthBounds(month);
    const [expenses, revenue] = await Promise.all([
      Expense.find({ vendorId: vendor._id, month }).sort({ date: 1 }).lean(),
      revenueForPeriod(vendor._id, start, end),
    ]);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

    const rows = ['Date,Category,Description,Amount (INR)'];
    expenses.forEach((e) => {
      const d = new Date(e.date).toLocaleDateString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      const desc = (e.description || '').replace(/"/g, '""');
      rows.push(`${d},${e.category},"${desc}",${e.amount}`);
    });
    rows.push('');
    rows.push(`,,Total Expenses,${totalExpenses}`);
    rows.push(`,,Revenue,${revenue}`);
    rows.push(`,,Net Profit,${revenue - totalExpenses}`);

    const csv = rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="expenses_${month}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error('exportExpensesCSV:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @route POST /api/vendor/expenses/recurring/apply
const applyRecurringExpenses = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const targetMonth = req.body.month || toMonthStr(new Date());
    const prevMonth   = prevMonthStr(targetMonth);

    // Templates = recurring entries from the previous month
    const templates = await Expense.find({
      vendorId:    vendor._id,
      month:       prevMonth,
      isRecurring: true,
    }).lean();

    if (!templates.length) {
      return res.json({ created: 0, expenses: [] });
    }

    // Dedup key: same category + description + amount in target month
    const existing  = await Expense.find({ vendorId: vendor._id, month: targetMonth, isRecurring: true }).lean();
    const existKeys = new Set(existing.map((e) => `${e.category}|${e.description}|${e.amount}`));

    const { start } = monthBounds(targetMonth);
    const toCreate  = templates.filter((t) => !existKeys.has(`${t.category}|${t.description}|${t.amount}`));

    if (!toCreate.length) {
      return res.json({ created: 0, expenses: [] });
    }

    const docs = toCreate.map((t) => ({
      vendorId:       vendor._id,
      amount:         t.amount,
      category:       t.category,
      customCategory: t.customCategory || '',
      description:    t.description,
      isRecurring:    true,
      date:           start,
      month:          targetMonth,
    }));

    const created = await Expense.insertMany(docs);
    return res.json({ created: created.length, expenses: created });
  } catch (err) {
    console.error('applyRecurringExpenses:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @route GET /api/vendor/expenses/trend?months=6
const getExpenseTrend = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const count = Math.min(Math.max(parseInt(req.query.months) || 6, 2), 12);
    const now   = new Date();
    const trend = [];

    for (let i = count - 1; i >= 0; i--) {
      const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStr  = toMonthStr(d);
      const { start, end } = monthBounds(mStr);

      const [revenue, totalExpenses] = await Promise.all([
        revenueForPeriod(vendor._id, start, end),
        expenseTotalForMonth(vendor._id, mStr),
      ]);

      const netEarningForMonth = revenue - totalExpenses;
      const commission = await commissionForMonth(vendor._id, mStr, netEarningForMonth);
      trend.push({
        month: mStr,
        monthLabel: d.toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
        revenue,
        totalExpenses,
        commissionAmount: commission.amount,
        profit: revenue - totalExpenses,
        profitAfterCommission: revenue - totalExpenses - commission.amount,
      });
    }

    return res.json({ trend });
  } catch (err) {
    console.error('getExpenseTrend:', err);
    return res.status(500).json({ message: err.message });
  }
};

// @route GET /api/vendor/expenses/budget
const getExpenseBudget = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id }).select('expenseBudgets');
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const budgets = {};
    (vendor.expenseBudgets || new Map()).forEach((val, key) => { budgets[key] = val; });
    return res.json({ budgets });
  } catch (err) {
    console.error('getExpenseBudget:', err);
    return res.status(500).json({ message: err.message });
  }
};
const CommissionSetting = require('../models/CommissionSetting');
const Commission = require('../models/Commission');
// @route PUT /api/vendor/expenses/budget
const saveExpenseBudget = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ ownerId: req.user._id });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const { budgets } = req.body; // { Rent: 8000, Ingredients: 15000, ... }
    if (!budgets || typeof budgets !== 'object') {
      return res.status(400).json({ message: 'budgets object is required' });
    }

    const cleaned = new Map();
    for (const cat of EXPENSE_CATEGORIES) {
      const val = Number(budgets[cat]);
      if (val > 0) cleaned.set(cat, val);
    }
    vendor.expenseBudgets = cleaned;
    await vendor.save();

    const out = {};
    cleaned.forEach((val, key) => { out[key] = val; });
    return res.json({ message: 'Budget saved', budgets: out });
  } catch (err) {
    console.error('saveExpenseBudget:', err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  addExpense,
  getExpenses,
  updateExpense,
  deleteExpense,
  getExpenseSummary,
  exportExpensesCSV,
  applyRecurringExpenses,
  getExpenseTrend,
  getExpenseBudget,
  saveExpenseBudget,
};
