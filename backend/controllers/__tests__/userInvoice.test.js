jest.mock('../../models/Order', () => ({
  findById: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const Order = require('../../models/Order');
const { getUserOrderInvoice } = require('../userController');

const extractPdfText = (pdf) => pdf.toString('latin1')
  .match(/<([0-9a-f]+)>/gi)
  .map((encodedText) => Buffer.from(encodedText.slice(1, -1), 'hex').toString('latin1'))
  .join('');

const parseBinary = (res, callback) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('GET order invoice', () => {
  beforeEach(() => jest.clearAllMocks());

  test('streams a pending cash invoice as a PDF when optional vendor/address/plan data is absent', async () => {
    const query = { populate: jest.fn() };
    query.populate.mockReturnValue(query);
    Order.findById.mockReturnValue(query);
    query.then = (resolve) => resolve({
      _id: '507f1f77bcf86cd799439011',
      userId: { _id: 'customer-1', name: 'Customer' },
      vendorId: null,
      paymentMethod: 'Cash',
      paymentStatus: 'Pending',
      amount: 45,
      orderDate: new Date('2026-10-20T00:00:00.000Z')
    });

    const app = express();
    app.get('/orders/:orderId/invoice', (req, res) =>
      getUserOrderInvoice({
        params: req.params,
        user: { _id: 'customer-1' }
      }, res)
    );

    const response = await request(app)
      .get('/orders/507f1f77bcf86cd799439011/invoice')
      .buffer(true)
      .parse(parseBinary);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/pdf/);
    expect(response.headers['content-disposition']).toMatch(/^attachment;/);
    expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(extractPdfText(response.body)).toContain('PAYMENT PENDING');
    expect(response.body.includes(Buffer.from('{"success"'))).toBe(false);
  });

  test('retains the invoice owner check', async () => {
    const query = { populate: jest.fn() };
    query.populate.mockReturnValue(query);
    Order.findById.mockReturnValue(query);
    query.then = (resolve) => resolve({
      _id: '507f1f77bcf86cd799439011',
      userId: { _id: 'another-customer' },
      vendorId: null
    });

    const app = express();
    app.get('/orders/:orderId/invoice', (req, res) =>
      getUserOrderInvoice({
        params: req.params,
        user: { _id: 'customer-1' }
      }, res)
    );

    const response = await request(app).get('/orders/507f1f77bcf86cd799439011/invoice');
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Not authorised');
  });
});
