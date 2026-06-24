// Purpose: KYC document submissions for tier upgrade requests
// Dependencies: mongoose
// Used by: backend/controllers/authController.js

const mongoose = require('mongoose');

const kycDocumentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    docType: {
      type: String,
      enum: ['aadhar', 'pan', 'passport', 'driving_license'],
      required: true
    },
    docNumber: {
      type: String,
      required: true
    },
    targetTier: {
      type: Number,
      enum: [1, 2],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    reviewedAt: Date,
    rejectionReason: String
  },
  { timestamps: true }
);

kycDocumentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('KYCDocument', kycDocumentSchema);
