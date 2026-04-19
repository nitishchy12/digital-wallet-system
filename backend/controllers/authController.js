const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { sendOTPEmail, sendResetPasswordEmail } = require('../utils/emailService');
const { generateQRCode } = require('../utils/qrService');
const { hashRefreshToken, safeTokenEqual } = require('../utils/tokenSecurity');
const logger = require('../utils/logger');

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'dev_jwt_secret_change_me_to_strong_random_string_at_least_32_chars';

const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  'dev_jwt_refresh_secret_change_me_to_strong_random_string_at_least_32_chars';

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '15m'
  });

  const refreshToken = jwt.sign({ userId }, JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d'
  });

  return { accessToken, refreshToken };
};

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const hashOTP = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

const issueVerificationOTP = async (user) => {
  const otp = generateOTP();
  user.verificationOTP = hashOTP(otp);
  user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();
  await sendOTPEmail(user.email, otp, user.name);
};

const register = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;

    const existingUser = await User.findOne({
      $or: [{ email }, { phone }]
    }).select('email phone');

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.email === email ? 'Email already registered' : 'Phone already registered'
      });
    }

    const user = new User({
      name,
      email,
      phone,
      password,
      verificationOTP: null,
      otpExpiry: null
    });

    await user.save();

    const qrData = user.generateQRData();
    user.qrCode = await generateQRCode(JSON.stringify(qrData));
    await user.save();

    await issueVerificationOTP(user);

    return res.status(201).json({
      success: true,
      message: 'Registration successful. OTP sent to email.',
      data: {
        email: user.email,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    logger.error('Register error: %s', error.message);
    return next(error);
  }
};

const verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Account already verified'
      });
    }

    if (!user.verificationOTP || user.otpExpiry < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired or invalid'
      });
    }

    if (hashOTP(otp) !== user.verificationOTP) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    user.isVerified = true;
    user.verificationOTP = null;
    user.otpExpiry = null;

    const existingWallet = await Wallet.findOne({ userId: user._id });
    if (!existingWallet) {
      await Wallet.create({ userId: user._id, balance: 0, currency: 'INR' });
    }

    const { accessToken, refreshToken } = generateTokens(user._id);
    user.refreshTokenHash = hashRefreshToken(refreshToken);
    user.refreshToken = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Account verified successfully',
      data: {
        user: user.toJSON(),
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    logger.error('Verify OTP error: %s', error.message);
    return next(error);
  }
};

const resendOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Account already verified'
      });
    }

    await issueVerificationOTP(user);

    return res.status(200).json({
      success: true,
      message: 'OTP resent successfully'
    });
  } catch (error) {
    logger.error('Resend OTP error: %s', error.message);
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account deactivated'
      });
    }

    // Unverified user: send a new OTP and return WITHOUT issuing wallet-capable tokens.
    // The frontend must redirect to /verify-otp where the user gets proper tokens.
    if (!user.isVerified) {
      await issueVerificationOTP(user);
      await user.save();

      return res.status(200).json({
        success: true,
        message: 'OTP sent to your email. Please verify your account.',
        data: {
          requiresVerification: true,
          user: { email: user.email, name: user.name, isVerified: false }
        }
      });
    }

    const { accessToken, refreshToken } = generateTokens(user._id);
    user.refreshTokenHash = hashRefreshToken(refreshToken);
    user.refreshToken = null;
    user.lastLogin = new Date();

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toJSON(),
        accessToken,
        refreshToken,
        requiresVerification: false
      }
    });
  } catch (error) {
    logger.error('Login error: %s', error.message);
    return next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpire = new Date(Date.now() + 15 * 60 * 1000);

    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    await sendResetPasswordEmail(user.email, user.name, resetLink);

    return res.status(200).json({
      success: true,
      message: 'Password reset link sent to your email'
    });
  } catch (error) {
    logger.error('Forgot password error: %s', error.message);
    return next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const hashedToken = crypto.createHash('sha256').update(String(token)).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: new Date() }
    }).select('+password');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    logger.error('Reset password error: %s', error.message);
    return next(error);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: incomingRefreshToken } = req.body;

    const decoded = jwt.verify(incomingRefreshToken, JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.userId).select('refreshTokenHash refreshToken isActive');

    const isLegacyMatch = Boolean(user?.refreshToken && user.refreshToken === incomingRefreshToken);
    const isHashMatch = Boolean(user?.refreshTokenHash && safeTokenEqual(incomingRefreshToken, user.refreshTokenHash));

    if (!user || !user.isActive || (!isHashMatch && !isLegacyMatch)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    const tokens = generateTokens(user._id);
    user.refreshTokenHash = hashRefreshToken(tokens.refreshToken);
    user.refreshToken = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Token refreshed',
      data: tokens
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token'
    });
  }
};

const logout = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('refreshToken refreshTokenHash');

    if (user) {
      user.refreshToken = null;
      user.refreshTokenHash = null;
      await user.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error: %s', error.message);
    return next(error);
  }
};

module.exports = {
  register,
  verifyOTP,
  resendOTP,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword
};
