const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true, // ✅ only here
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true, // ✅ only here
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    verificationOTP: String,
    otpExpiry: Date,

    qrCode: String,

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    lastLogin: Date,
  },
  { timestamps: true }
);

/* 🔐 Hash password */
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

/* 🔑 Compare password */
UserSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.password);
};

/* 📱 QR Payload */
UserSchema.methods.generateQRData = function () {
  return {
    userId: this._id.toString(),
    name: this.name,
    phone: this.phone,
    email: this.email,
    type: 'PAYMENT_REQUEST'
  };
};

module.exports = mongoose.model("User", UserSchema);
