/**
 * OTP Attempt Model
 * Tracks OTP verification attempts for security
 */

const mongoose = require("mongoose");

const OTPAttemptSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastAttempt: {
      type: Date,
      default: Date.now,
    },
    resendCount: {
      type: Number,
      default: 0,
    },
    lastResend: {
      type: Date,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockedUntil: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Auto-delete old attempts after 24 hours
OTPAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model("OTPAttempt", OTPAttemptSchema);





