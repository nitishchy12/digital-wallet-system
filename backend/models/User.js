const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      unique: true
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    verificationOTP: String,
    otpExpiry: Date,
    refreshToken: String,
    refreshTokenHash: {
      type: String,
      select: false
    },
    qrCode: String,
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
    lastLogin: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    kycTier: {
      type: Number,
      enum: [0, 1, 2],
      default: 0
    },
    lowBalanceThreshold: {
      type: Number,
      default: 500,
      min: 0
    },
    // Only event types with a real producer get a default — see backend/workers/notificationWorker.js
    notificationPreferences: {
      type: Object,
      default: () => ({
        TRANSFER_SENT: { email: true, inApp: true },
        MONEY_RECEIVED: { email: true, inApp: true },
        LOW_BALANCE_ALERT: { email: true, inApp: true },
        DISPUTE_RAISED: { email: true, inApp: true }
      })
    }
  },
  { timestamps: true }
);

UserSchema.index({ createdAt: -1 });

// Strip sensitive fields from every API response automatically
UserSchema.set('toJSON', {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.refreshTokenHash;
    delete ret.verificationOTP;
    delete ret.otpExpiry;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpire;
    return ret;
  }
});

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.password);
};

UserSchema.methods.generateQRData = function () {
  return {
    type: 'WALLET_QR',
    userId: this._id,
    name: this.name,
    phone: this.phone,
    email: this.email,
    timestamp: Date.now()
  };
};

module.exports = mongoose.model('User', UserSchema);
