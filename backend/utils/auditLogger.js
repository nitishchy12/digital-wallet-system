// Purpose: Write audit log entries — never throws, never blocks the request
// Dependencies: AuditLog model
// Used by: authController, walletController

const AuditLog = require('../models/AuditLog');
const logger = require('./logger');

/**
 * Write one audit log entry.
 * NEVER throws — audit failure must never affect the main request flow.
 */
const writeAuditLog = async ({
  action,
  userId = null,
  req,
  metadata = {},
  severity = 'info'
}) => {
  try {
    // Sanitize — strip sensitive fields before storing
    const sanitized = { ...metadata };
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.otp;
    delete sanitized.cardNumber;
    delete sanitized.cvv;

    await AuditLog.create({
      action,
      userId: userId || null,
      ip: req?.ip || req?.connection?.remoteAddress || 'unknown',
      userAgent: req?.headers?.['user-agent'] || 'unknown',
      metadata: sanitized,
      severity
    });
  } catch (err) {
    // Log to winston but never rethrow
    logger.error('Audit log write failed action=%s userId=%s: %s', action, userId, err.message);
  }
};

module.exports = { writeAuditLog };
