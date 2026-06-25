// Purpose: Admin wallet management — freeze, unfreeze, user lookup, KYC review
// Dependencies: Wallet, User, KYCDocument models, auditLogger
// Used by: backend/routes/admin.js

const Wallet = require('../models/Wallet');
const User = require('../models/User');
const KYCDocument = require('../models/KYCDocument');
const { writeAuditLog } = require('../utils/auditLogger');
const logger = require('../utils/logger');

const freezeWallet = async (req, res, next) => {
  try {
    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'MISSING_USER_ID', message: 'userId is required' });
    }

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'REASON_REQUIRED',
        message: 'A reason of at least 10 characters is required to freeze a wallet.'
      });
    }

    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      {
        status: 'frozen',
        frozenAt: new Date(),
        frozenReason: reason.trim(),
        frozenBy: req.user._id
      },
      { new: true }
    );

    if (!wallet) {
      return res.status(404).json({ success: false, error: 'WALLET_NOT_FOUND', message: 'Wallet not found for this user' });
    }

    await writeAuditLog({
      action: 'WALLET_FROZEN',
      userId: req.user._id,
      req,
      metadata: {
        targetUserId: userId,
        reason: reason.trim(),
        adminId: req.user._id.toString()
      },
      severity: 'critical'
    });

    logger.info('Wallet frozen adminId=%s targetUserId=%s reason=%s', req.user._id, userId, reason.trim());

    return res.status(200).json({
      success: true,
      message: 'Wallet frozen successfully.',
      data: {
        userId,
        status: 'frozen',
        frozenAt: wallet.frozenAt,
        frozenReason: wallet.frozenReason
      }
    });
  } catch (err) {
    logger.error('Freeze wallet error: %s', err.message);
    return next(err);
  }
};

const unfreezeWallet = async (req, res, next) => {
  try {
    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'MISSING_USER_ID', message: 'userId is required' });
    }

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'REASON_REQUIRED',
        message: 'A reason of at least 10 characters is required to unfreeze a wallet.'
      });
    }

    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      {
        status: 'active',
        frozenAt: null,
        frozenReason: null,
        frozenBy: null
      },
      { new: true }
    );

    if (!wallet) {
      return res.status(404).json({ success: false, error: 'WALLET_NOT_FOUND', message: 'Wallet not found for this user' });
    }

    await writeAuditLog({
      action: 'WALLET_UNFROZEN',
      userId: req.user._id,
      req,
      metadata: {
        targetUserId: userId,
        reason: reason.trim(),
        adminId: req.user._id.toString()
      },
      severity: 'warning'
    });

    logger.info('Wallet unfrozen adminId=%s targetUserId=%s', req.user._id, userId);

    return res.status(200).json({
      success: true,
      message: 'Wallet unfrozen successfully.',
      data: { userId, status: 'active' }
    });
  } catch (err) {
    logger.error('Unfreeze wallet error: %s', err.message);
    return next(err);
  }
};

// ── User/wallet lookup by email ─────────────────────────────────────────────
const lookupUserWallet = async (req, res, next) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ success: false, error: 'MISSING_EMAIL', message: 'email query param is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select('name email phone isVerified isActive kycTier role createdAt');

    if (!user) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'No user found with this email' });
    }

    const wallet = await Wallet.findOne({ userId: user._id })
      .select('balance currency status frozenAt frozenReason escrowHeld');

    return res.status(200).json({
      success: true,
      data: {
        user,
        wallet: wallet || null
      }
    });
  } catch (err) {
    logger.error('lookupUserWallet error: %s', err.message);
    return next(err);
  }
};

// ── KYC review queue ─────────────────────────────────────────────────────────
const getKYCQueue = async (req, res, next) => {
  try {
    const { status = 'pending' } = req.query;
    const submissions = await KYCDocument.find({ status })
      .sort({ createdAt: 1 })
      .populate('userId', 'name email kycTier');

    return res.status(200).json({ success: true, data: submissions });
  } catch (err) {
    logger.error('getKYCQueue error: %s', err.message);
    return next(err);
  }
};

const reviewKYC = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'INVALID_ACTION', message: 'action must be "approve" or "reject"' });
    }

    if (action === 'reject' && (!reason || reason.trim().length < 10)) {
      return res.status(400).json({
        success: false,
        error: 'REASON_REQUIRED',
        message: 'A rejection reason of at least 10 characters is required.'
      });
    }

    const doc = await KYCDocument.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'KYC_DOCUMENT_NOT_FOUND', message: 'KYC submission not found' });
    }

    if (doc.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'KYC_ALREADY_REVIEWED',
        message: `This submission is already ${doc.status}`
      });
    }

    if (action === 'approve') {
      doc.status = 'approved';
      doc.reviewedAt = new Date();
      await doc.save();

      await User.findByIdAndUpdate(doc.userId, { kycTier: doc.targetTier });

      await writeAuditLog({
        action: 'KYC_APPROVED',
        userId: req.user._id,
        req,
        metadata: { targetUserId: doc.userId.toString(), kycDocumentId: doc._id.toString(), newTier: doc.targetTier },
        severity: 'info'
      });

      logger.info('KYC approved adminId=%s targetUserId=%s newTier=%s', req.user._id, doc.userId, doc.targetTier);

      return res.status(200).json({
        success: true,
        message: 'KYC approved. User tier upgraded.',
        data: { id: doc._id, status: 'approved', newTier: doc.targetTier }
      });
    }

    doc.status = 'rejected';
    doc.reviewedAt = new Date();
    doc.rejectionReason = reason.trim();
    await doc.save();

    await writeAuditLog({
      action: 'KYC_REJECTED',
      userId: req.user._id,
      req,
      metadata: { targetUserId: doc.userId.toString(), kycDocumentId: doc._id.toString(), reason: reason.trim() },
      severity: 'warning'
    });

    return res.status(200).json({
      success: true,
      message: 'KYC submission rejected.',
      data: { id: doc._id, status: 'rejected' }
    });
  } catch (err) {
    logger.error('reviewKYC error: %s', err.message);
    return next(err);
  }
};

module.exports = { freezeWallet, unfreezeWallet, lookupUserWallet, getKYCQueue, reviewKYC };
