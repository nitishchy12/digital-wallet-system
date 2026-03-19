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
    }
  },
  { timestamps: true }
);

walletSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Wallet', walletSchema);
