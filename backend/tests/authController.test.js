jest.mock('../models/User', () => ({
  findOne: jest.fn(),
  findById: jest.fn()
}));

jest.mock('../models/Wallet', () => ({
  findOne: jest.fn(),
  create: jest.fn()
}));

jest.mock('../utils/emailService', () => ({
  sendOTPEmail: jest.fn(),
  sendResetPasswordEmail: jest.fn()
}));

jest.mock('../utils/qrService', () => ({
  generateQRCode: jest.fn()
}));

const User = require('../models/User');
const { login, refreshToken } = require('../controllers/authController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('authController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('login returns 401 on invalid credentials', async () => {
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null)
    });

    const req = { body: { email: 'demo@example.com', password: 'Password@1' } };
    const res = makeRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Invalid email or password'
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('refreshToken returns 401 when missing/invalid token', async () => {
    const req = { body: { refreshToken: 'bad-token' } };
    const res = makeRes();
    const next = jest.fn();

    await refreshToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Invalid or expired refresh token'
      })
    );
  });
});
