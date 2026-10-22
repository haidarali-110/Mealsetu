const PDFDocument = require('pdfkit');

const generateSettlementInvoicePDF = (res, data) => {
  const {
    settlementId,
    vendorName,
    vendorAddress,
    weekStart,
    weekEnd,
    orders,
    grossEarnings,
    commissionRate,
    commissionAmount,
    netEarnings,
    commissionStatus,
    dueDate,
    generatedAt
  } = data;

  const doc = new PDFDocument({
    margin: 50,
    size: 'A4',
    info: {
      Title:   'MealSetu Settlement Invoice',
      Author:  'MealSetu Platform',
      Subject: `Commission Settlement for ${vendorName}`
    }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="MealSetu_Settlement_${settlementId || Date.now()}.pdf"`
  );
  doc.pipe(res);

  // ── HEADER ──────────────────────────────────────────────
  doc.rect(0, 0, 612, 80).fill('#f97316');
  doc.fillColor('white')
     .fontSize(24)
     .font('Helvetica-Bold')
     .text('MEALSETU', 50, 25);
  doc.fontSize(10)
     .font('Helvetica')
     .text('Settlement Invoice', 50, 52);
  doc.fillColor('white')
     .fontSize(10)
     .text(
       `Generated: ${new Date(generatedAt).toLocaleDateString('en-IN', {
         day: 'numeric', month: 'long', year: 'numeric'
       })}`,
       400, 35, { align: 'right', width: 162 }
     );

  doc.moveDown(3);

  // ── SETTLEMENT ID + STATUS ───────────────────────────────
  const statusColor = commissionStatus === 'paid'    ? '#16a34a'
                    : commissionStatus === 'overdue'  ? '#dc2626'
                    : '#d97706';

  doc.fillColor('#374151')
     .fontSize(11)
     .font('Helvetica-Bold')
     .text(`Settlement ID: ${settlementId || 'N/A'}`, 50, 100);

  doc.fillColor(statusColor)
     .fontSize(11)
     .font('Helvetica-Bold')
     .text(
       commissionStatus === 'paid'    ? 'PAID'
     : commissionStatus === 'overdue' ? 'OVERDUE'
     : 'PENDING PAYMENT',
       400, 100, { align: 'right', width: 162 }
     );

  // ── DIVIDER ──────────────────────────────────────────────
  doc.moveTo(50, 120).lineTo(562, 120).strokeColor('#e5e7eb').stroke();

  // ── VENDOR DETAILS ────────────────────────────────────────
  doc.fillColor('#374151')
     .fontSize(10)
     .font('Helvetica-Bold')
     .text('VENDOR DETAILS', 50, 135);

  doc.font('Helvetica')
     .fillColor('#374151')
     .fontSize(10)
     .text(vendorName, 50, 152)
     .fillColor('#6b7280')
     .text(vendorAddress || 'Address not available', 50, 167);

  // ── SETTLEMENT PERIOD ─────────────────────────────────────
  doc.fillColor('#374151')
     .font('Helvetica-Bold')
     .fontSize(10)
     .text('SETTLEMENT PERIOD', 350, 135);

  const periodStr = `${new Date(weekStart).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  })} — ${new Date(weekEnd).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  })}`;

  doc.font('Helvetica')
     .fillColor('#374151')
     .fontSize(10)
     .text(periodStr, 350, 152);

  if (dueDate) {
    doc.fillColor('#6b7280')
       .text(`Due Date: ${new Date(dueDate).toLocaleDateString('en-IN', {
         day: 'numeric', month: 'long', year: 'numeric'
       })}`, 350, 167);
  }

  // ── DIVIDER ──────────────────────────────────────────────
  doc.moveTo(50, 195).lineTo(562, 195).strokeColor('#e5e7eb').stroke();

  // ── ORDER BREAKDOWN TABLE ─────────────────────────────────
  doc.fillColor('#374151')
     .font('Helvetica-Bold')
     .fontSize(11)
     .text('ORDER BREAKDOWN', 50, 210);

  const tableTop = 230;
  doc.rect(50, tableTop, 512, 22).fill('#f9fafb');
  doc.fillColor('#6b7280')
     .font('Helvetica-Bold')
     .fontSize(9);

  const cols = { date: 50, customer: 130, plan: 260, gross: 330, cut: 410, net: 480 };

  doc.text('DATE',       cols.date,     tableTop + 7)
     .text('CUSTOMER',   cols.customer, tableTop + 7)
     .text('PLAN',       cols.plan,     tableTop + 7)
     .text('AMOUNT',     cols.gross,    tableTop + 7)
     .text('COMMISSION', cols.cut,      tableTop + 7)
     .text('YOUR SHARE', cols.net,      tableTop + 7);

  let y = tableTop + 22;
  doc.font('Helvetica').fontSize(9);

  orders.forEach((order, i) => {
    if (y > 700) { doc.addPage(); y = 50; }

    if (i % 2 === 0) doc.rect(50, y, 512, 20).fill('#fafafa');

    doc.fillColor('#374151')
       .text(
         new Date(order.orderDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
         cols.date, y + 6
       )
       .text((order.customerName || 'Customer').substring(0, 16), cols.customer, y + 6)
       .text(order.planType || '-', cols.plan, y + 6)
       .text(`Rs.${order.grossAmount}`, cols.gross, y + 6)
       .fillColor('#dc2626')
       .text(`-Rs.${order.commissionCut}`, cols.cut, y + 6)
       .fillColor('#16a34a')
       .text(`Rs.${order.netAmount}`, cols.net, y + 6);

    doc.moveTo(50, y + 20).lineTo(562, y + 20).strokeColor('#f3f4f6').stroke();
    y += 20;
  });

  // ── FINANCIAL SUMMARY BOX ────────────────────────────────
  y += 20;
  if (y > 650) { doc.addPage(); y = 50; }

  doc.rect(50, y, 512, 110).fill('#f9fafb').stroke('#e5e7eb');

  doc.fillColor('#374151')
     .font('Helvetica-Bold')
     .fontSize(10)
     .text('FINANCIAL SUMMARY', 70, y + 15);

  const summaryRows = [
    { label: 'Gross Earnings',                value: `Rs.${grossEarnings.toLocaleString('en-IN')}`,    color: '#374151' },
    { label: `Commission (${commissionRate}%)`, value: `-Rs.${commissionAmount.toLocaleString('en-IN')}`, color: '#dc2626' },
    { label: 'Net Earnings',                  value: `Rs.${netEarnings.toLocaleString('en-IN')}`,      color: '#16a34a' }
  ];

  summaryRows.forEach((row, i) => {
    const rowY = y + 35 + i * 22;
    doc.fillColor('#6b7280').font('Helvetica').fontSize(10).text(row.label, 70, rowY);
    doc.fillColor(row.color)
       .font(i === 2 ? 'Helvetica-Bold' : 'Helvetica')
       .fontSize(i === 2 ? 12 : 10)
       .text(row.value, 400, rowY, { align: 'right', width: 140 });
  });

  // ── FOOTER ───────────────────────────────────────────────
  const footerY = 760;
  doc.moveTo(50, footerY).lineTo(562, footerY).strokeColor('#e5e7eb').stroke();
  doc.fillColor('#9ca3af')
     .font('Helvetica')
     .fontSize(8)
     .text(
       'This is a computer-generated settlement invoice from MealSetu. No signature required.',
       50, footerY + 10, { align: 'center', width: 512 }
     )
     .text(
       'For disputes contact: support@mealsetu.com',
       50, footerY + 22, { align: 'center', width: 512 }
     );

  doc.end();
};

module.exports = { generateSettlementInvoicePDF };
