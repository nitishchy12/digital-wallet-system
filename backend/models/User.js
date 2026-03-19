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
    qrCode: String,
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
    lastLogin: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 });
UserSchema.index({ createdAt: -1 });

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
