const mockAbortTransaction = jest.fn();
const mockCommitTransaction = jest.fn();
const mockEndSession = jest.fn();

jest.mock('mongoose', () => ({
  startSession: jest.fn().mockResolvedValue({
    startTransaction: jest.fn(),
    abortTransaction: mockAbortTransaction,
    commitTransaction: mockCommitTransaction,
    endSession: mockEndSession
  })
}));

jest.mock('../models/User', () => ({
  findOne: jest.fn()
}));

jest.mock('../models/Wallet', () => ({
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn()
}));

jest.mock('../models/Transaction', () => ({
  create: jest.fn(),
  aggregate: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn()
}));

const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { getWalletBalance, transferMoney } = require('../controllers/walletController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('walletController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getWalletBalance returns wallet details', async () => {
    Wallet.findOneAndUpdate.mockResolvedValue({ balance: 1200, currency: 'INR' });

    const req = { user: { _id: 'user-1' } };
    const res = makeRes();
    const next = jest.fn();

    await getWalletBalance(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ balance: 1200, currency: 'INR' })
      })
    );
  });

  test('transferMoney aborts when sender balance is insufficient', async () => {
    User.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        session: jest.fn().mockResolvedValue({
          _id: 'receiver-1',
          name: 'Receiver',
          email: 'receiver@example.com',
          isVerified: true,
          isActive: true
        })
      })
    });

    Wallet.updateOne
      .mockResolvedValueOnce({ acknowledged: true })
      .mockResolvedValueOnce({ acknowledged: true })
      .mockResolvedValueOnce({ modifiedCount: 0 });

    const req = {
      user: { _id: 'sender-1' },
      body: { receiverEmail: 'receiver@example.com', amount: 500 }
    };
    const res = makeRes();
    const next = jest.fn();

    await transferMoney(req, res, next);

    expect(mockAbortTransaction).toHaveBeenCalled();
    expect(mockCommitTransaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Insufficient wallet balance'
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
