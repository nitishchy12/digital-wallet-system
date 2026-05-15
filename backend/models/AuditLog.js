// Purpose: Immutable record of every sensitive action in the system
// Dependencies: mongoose
// Used by: backend/utils/auditLogger.js

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'USER_REGISTERED',
        'USER_LOGIN',
        'USER_LOGIN_FAILED',
        'USER_LOGOUT',
        'PASSWORD_CHANGED',
        'PASSWORD_RESET_REQUESTED',
        'PASSWORD_RESET_COMPLETED',
        'OTP_VERIFIED',
        'OTP_FAILED',
        'WALLET_CREATED',
        'TRANSFER_INITIATED',
        'TRANSFER_COMPLETED',
        'TRANSFER_FAILED',
        'WALLET_FROZEN',
        'WALLET_UNFROZEN',
        'ADMIN_ACTION',
        'KYC_SUBMITTED',
        'KYC_APPROVED',
        'KYC_REJECTED',
        'DISPUTE_RAISED',
        'DISPUTE_RESOLVED'
      ]
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null   // null for failed login attempts on unknown emails
    },
    ip: {
      type: String,
      required: true
    },
    userAgent: {
      type: String,
      default: 'unknown'
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
      // Store: transactionId, amount, receiverId, reason, adminId
      // Never store: passwords, tokens, card numbers
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'info'
    }
  },
  {
    timestamps: true
    // No update or delete indexes — this collection is append-only
  }
);

// Query user's own audit history
auditLogSchema.index({ userId: 1, createdAt: -1 });

// Admin queries by action type
auditLogSchema.index({ action: 1, createdAt: -1 });

// Security monitoring — find all failed logins by IP
auditLogSchema.index({ ip: 1, action: 1, createdAt: -1 });

// TTL — auto-delete logs older than 2 years (63,072,000 seconds)
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
