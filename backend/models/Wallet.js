const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    balance: {
      type: Number,
      default: 0,
      min: 0
    },
    currency: {
      type: String,
      default: 'INR'
    },
    status: {
      type: String,
      enum: ['active', 'frozen', 'suspended'],
      default: 'active'
    },
    frozenAt: { type: Date, default: null },
    frozenReason: { type: String, default: null },
    frozenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null   // null = auto-frozen by system
    }
  },
  { timestamps: true }
);

walletSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Wallet', walletSchema);
