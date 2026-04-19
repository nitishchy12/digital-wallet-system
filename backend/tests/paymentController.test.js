const mockAbortTransaction = jest.fn();
const mockCommitTransaction = jest.fn();
const mockEndSession = jest.fn();

process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';

jest.mock('mongoose', () => ({
  startSession: jest.fn().mockResolvedValue({
    startTransaction: jest.fn(),
    abortTransaction: mockAbortTransaction,
    commitTransaction: mockCommitTransaction,
    endSession: mockEndSession
  })
}));

jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: jest.fn()
    }
  }));
});

jest.mock('../models/Wallet', () => ({
  findOne: jest.fn(),
  updateOne: jest.fn()
}));

jest.mock('../models/Transaction', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
  findById: jest.fn()
}));

jest.mock('../models/PaymentWebhookEvent', () => ({
  updateOne: jest.fn()
}));

const crypto = require('crypto');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { createPaymentOrder, verifyPayment } = require('../controllers/paymentController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('paymentController verifyPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('marks payment failed when signature is invalid', async () => {
    Transaction.findOne.mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: 'tx-1',
        status: 'PENDING',
        gatewayOrderId: 'order_123',
        gatewayMeta: {},
        amount: 1000
      })
    });

    const req = {
      user: { _id: 'user-1' },
      body: {
        transactionId: '65f001122334455667788990',
        razorpay_order_id: 'order_123',
        razorpay_payment_id: 'pay_123',
        razorpay_signature: 'invalid_sig'
      }
    };

    const res = makeRes();
    const next = jest.fn();

    await verifyPayment(req, res, next);

    expect(Transaction.updateOne).toHaveBeenCalledWith(
      { _id: 'tx-1' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'FAILED' })
      }),
      expect.any(Object)
    );
    expect(mockCommitTransaction).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('credits wallet when signature is valid', async () => {
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update('order_abc|pay_abc')
      .digest('hex');

    Transaction.findOne.mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: 'tx-2',
        status: 'PENDING',
        gatewayOrderId: 'order_abc',
        gatewayMeta: {},
        amount: 500
      })
    });

    Wallet.findOne.mockReturnValue({
      session: jest.fn().mockResolvedValue({ balance: 1500 })
    });

    Transaction.updateOne
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValueOnce({ modifiedCount: 1 });

    Transaction.findById.mockResolvedValue({
      toObject: () => ({ _id: 'tx-2', amount: 500, status: 'SUCCESS' })
    });

    const req = {
      user: { _id: 'user-1' },
      body: {
        transactionId: '65f001122334455667788991',
        razorpay_order_id: 'order_abc',
        razorpay_payment_id: 'pay_abc',
        razorpay_signature: signature
      }
    };

    const res = makeRes();
    const next = jest.fn();

    await verifyPayment(req, res, next);

    expect(Wallet.updateOne).toHaveBeenCalled();
    expect(mockCommitTransaction).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Payment verified and wallet updated successfully'
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe('paymentController createPaymentOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('retries mock add money without transaction when standalone MongoDB rejects session writes', async () => {
    Transaction.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      })
    });

    Wallet.updateOne
      .mockRejectedValueOnce(
        Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), {
          code: 20,
          codeName: 'IllegalOperation'
        })
      )
      .mockResolvedValueOnce({ acknowledged: true });

    Wallet.findOne.mockResolvedValue({ balance: 500 });

    Transaction.create.mockResolvedValue([
      {
        toObject: () => ({ _id: 'tx-mock-1', amount: 500, status: 'SUCCESS' })
      }
    ]);

    const req = {
      user: { _id: 'user-1' },
      body: {
        amount: 500,
        paymentGateway: 'MOCK',
        idempotencyKey: 'mock-key'
      },
      headers: {
        'x-idempotency-key': 'mock-key'
      }
    };

    const res = makeRes();
    const next = jest.fn();

    await createPaymentOrder(req, res, next);

    expect(Wallet.updateOne).toHaveBeenCalledTimes(3);
    expect(Transaction.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Rs 500 added to wallet successfully (Mock)'
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
