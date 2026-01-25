const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const OTPAttempt = require("../models/OTPAttempt");
const { sendOTPEmail } = require("../utils/emailService");
const { generateQRCode } = require("../utils/qrService");

/* ================= TOKEN HELPERS ================= */

const generateAccessToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || "7d" }
  );
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
      isVerified: false,
    });

    await user.save();

    const qrData = user.generateQRData();
    user.qrCode = await generateQRCode(JSON.stringify(qrData));
    await user.save();

    await OTPAttempt.findOneAndUpdate(
      { email },
      {
        attempts: 0,
        resendCount: 1,
        lastResend: new Date(),
        isBlocked: false,
      },
      { upsert: true }
    );

    await sendOTPEmail(email, otp, name);

    res.status(201).json({
      success: true,
      message: "Registration successful. OTP sent.",
      data: { email },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ success: false, message: "Registration failed" });
  }
};

/* ================= VERIFY OTP ================= */

const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (user.isVerified)
      return res.status(400).json({ success: false, message: "Already verified" });

    if (hashOTP(otp) !== user.verificationOTP || user.otpExpiry < new Date()) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    user.isVerified = true;
    user.verificationOTP = null;
    user.otpExpiry = null;
    await user.save();

    await Wallet.findOneAndUpdate(
      { userId: user._id },
      { userId: user._id, balance: 0, currency: "INR" },
      { upsert: true }
    );

    await OTPAttempt.deleteOne({ email });

    const accessToken = generateAccessToken(user._id);

    res.json({
      success: true,
      message: "Account verified",
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
        },
        accessToken,
      },
    });
  } catch (err) {
    console.error("Verify OTP error:", err);
    res.status(500).json({ success: false, message: "OTP verification failed" });
  }
};

/* ================= RESEND OTP ================= */

const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user || user.isVerified)
      return res.status(400).json({ success: false, message: "Invalid request" });

    const otp = generateOTP();
    user.verificationOTP = hashOTP(otp);
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOTPEmail(email, otp, user.name);

    res.json({ success: true, message: "OTP resent" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Resend failed" });
  }
};

/* ================= LOGIN ================= */

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    if (!user.isVerified)
      return res.status(403).json({ success: false, message: "Verify OTP first" });

    const accessToken = generateAccessToken(user._id);
    user.lastLogin = new Date();
    await user.save();

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: { _id: user._id, name: user.name, email: user.email },
        accessToken,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Login failed" });
  }
};

/* ================= LOGOUT ================= */

const logout = async (req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
};

/* ================= EXPORTS ================= */

module.exports = {
  register,
  verifyOTP,
  resendOTP,
  login,
  logout,
};
