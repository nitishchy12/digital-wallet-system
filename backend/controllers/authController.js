const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const { sendOTPEmail, sendResetPasswordEmail } = require("../utils/emailService");
const { generateQRCode } = require("../utils/qrService");

/* ================= TOKEN HELPERS ================= */

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_jwt_secret_change_me_to_strong_random_string_at_least_32_chars";

const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  "dev_jwt_refresh_secret_change_me_to_strong_random_string_at_least_32_chars";

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || "15m" }
  );

  const refreshToken = jwt.sign(
    { userId },
    JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || "7d" }
  );

  return { accessToken, refreshToken };
};

/* ================= OTP HELPERS ================= */

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const hashOTP = (otp) =>
  crypto.createHash("sha256").update(String(otp)).digest("hex");

/* ================= REGISTER ================= */

const register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const existingUser = await User.findOne({
      $or: [{ email }, { phone }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message:
          existingUser.email === email
            ? "Email already registered"
            : "Phone already registered",
      });
    }

    const otp = generateOTP();

    const user = new User({
      name,
      email,
      phone,
      password,
      verificationOTP: hashOTP(otp),
      otpExpiry: new Date(Date.now() + 10 * 60 * 1000),
    });

    await user.save();

    // Generate QR Code
    const qrData = user.generateQRData();
    user.qrCode = await generateQRCode(JSON.stringify(qrData));
    await user.save();

    // Send OTP
    await sendOTPEmail(email, otp, name);

    res.status(201).json({
      success: true,
      message: "Registration successful. OTP sent to email.",
      data: {
        email: user.email,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
};

/* ================= VERIFY OTP ================= */

const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (!user)
      return res.status(404).json({
        success: false,
        message: "User not found",
      });

    if (user.isVerified)
      return res.status(400).json({
        success: false,
        message: "Account already verified",
      });

    if (!user.verificationOTP || user.otpExpiry < new Date())
      return res.status(400).json({
        success: false,
        message: "OTP expired or invalid",
      });

    if (hashOTP(otp) !== user.verificationOTP)
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });

    // ✅ MARK VERIFIED
    user.isVerified = true;
    user.verificationOTP = null;
    user.otpExpiry = null;

    // ================= AUTO CREATE WALLET =================
    const existingWallet = await Wallet.findOne({ userId: user._id });

    if (!existingWallet) {
      await Wallet.create({
        userId: user._id,
        balance: 0,
        currency: "INR",
      });
    }

    // ================= TOKENS =================
    const { accessToken, refreshToken } = generateTokens(user._id);
    user.refreshToken = refreshToken;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Account verified successfully",
      data: {
        user: user.toJSON(),
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
};

/* ================= RESEND OTP ================= */

const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user)
      return res.status(404).json({
        success: false,
        message: "User not found",
      });

    if (user.isVerified)
      return res.status(400).json({
        success: false,
        message: "Account already verified",
      });

    const otp = generateOTP();
    user.verificationOTP = hashOTP(otp);
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await user.save();
    await sendOTPEmail(email, otp, user.name);

    res.status(200).json({
      success: true,
      message: "OTP resent successfully",
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resend OTP",
    });
  }
};

/* ================= LOGIN ================= */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account deactivated",
      });
    }

    const { accessToken, refreshToken } = generateTokens(user._id);
    user.refreshToken = refreshToken;
    user.lastLogin = new Date();

    await user.save();

    // 🚫 Never send password back
    user.password = undefined;

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: user.toJSON(),
        accessToken,
        refreshToken,
        requiresVerification: !user.isVerified,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

/* ================= FORGOT PASSWORD ================= */

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpire = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    await sendResetPasswordEmail(user.email, user.name, resetLink);

    res.status(200).json({
      success: true,
      message: "Password reset link sent to your email",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process forgot password",
    });
  }
};

/* ================= RESET PASSWORD ================= */

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const hashedToken = crypto.createHash("sha256").update(String(token)).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: new Date() },
    }).select("+password");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset password",
    });
  }
};

/* ================= REFRESH TOKEN ================= */

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken)
      return res.status(401).json({
        success: false,
        message: "Refresh token required",
      });

    const decoded = jwt.verify(
      refreshToken,
      JWT_REFRESH_SECRET
    );

    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken)
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });

    const tokens = generateTokens(user._id);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Token refreshed",
      data: tokens,
    });
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired refresh token",
    });
  }
};

/* ================= LOGOUT ================= */

const logout = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.refreshToken = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
};

/* ================= EXPORTS ================= */

module.exports = {
  register,
  verifyOTP,
  resendOTP,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
};
