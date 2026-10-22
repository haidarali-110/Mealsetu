jest.mock('../../models/Transaction', () => ({
  findOneAndUpdate: jest.fn()
}));

const Transaction = require('../../models/Transaction');
const recordOrderTransaction = require('../orderTransaction');

describe('recordOrderTransaction', () => {
  beforeEach(() => jest.clearAllMocks());

  test('upserts one verified transaction by order ID', async () => {
    Transaction.findOneAndUpdate.mockResolvedValue({ _id: 'transaction-1' });
    await recordOrderTransaction({
      _id: 'order-1',
      userId: 'user-1',
      vendorId: 'vendor-1',
      amount: 75,
      paymentMethod: 'Cash'
    }, 'Verified', 70);

    expect(Transaction.findOneAndUpdate).toHaveBeenCalledWith(
      { orderId: 'order-1' },
      expect.objectContaining({
        $set: expect.objectContaining({ amount: 70, status: 'Verified' })
      }),
      expect.objectContaining({ upsert: true })
    );
  });

  test('recovers an upsert race after the unique order index rejects a duplicate', async () => {
    Transaction.findOneAndUpdate
      .mockRejectedValueOnce({ code: 11000 })
      .mockResolvedValueOnce({ _id: 'transaction-existing' });
    const result = await recordOrderTransaction({
      _id: 'order-1',
      userId: 'user-1',
      vendorId: 'vendor-1',
      amount: 75,
      paymentMethod: 'Cash'
    }, 'Verified');

    expect(result._id).toBe('transaction-existing');
    expect(Transaction.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(Transaction.findOneAndUpdate.mock.calls[1][2]).not.toHaveProperty('upsert');
  });
});
