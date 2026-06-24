const { body, param, query, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  return res.status(400).json({
    success: false,
    message: 'Invalid input',
    errors: errors.array().map((error) => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }))
  });
};

const passwordRule = body('password')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters long')
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
  .withMessage('Password must include uppercase, lowercase, number and special character');

const idempotencyKeyRule = body('idempotencyKey')
  .optional()
  .isLength({ min: 8, max: 128 })
  .withMessage('idempotencyKey must be between 8 and 128 characters');

const validateRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),

  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email address'),

  body('phone')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit Indian phone number'),

  passwordRule,
  handleValidationErrors
];

const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email address'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors
];

const validateTransfer = [
  body('receiverEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid receiver email address'),

  // Max is the Tier 2 ceiling — the KYC check in the controller
  // enforces per-tier limits (10k / 50k / 200k)
  body('amount')
    .isFloat({ gt: 0, max: 200000 })
    .withMessage('Amount must be greater than 0 (KYC tier limits apply)'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description cannot exceed 200 characters'),

  idempotencyKeyRule,
  handleValidationErrors
];

const validateAddMoney = [
  body('amount')
    .isFloat({ gt: 0, max: 100000 })
    .withMessage('Amount must be greater than 0 and up to 1,00,000'),

  body('paymentGateway')
    .optional()
    .isIn(['MOCK', 'RAZORPAY', 'STRIPE'])
    .withMessage('Invalid payment gateway'),

  idempotencyKeyRule,
  handleValidationErrors
];

const validatePaymentVerify = [
  body('transactionId').isMongoId().withMessage('transactionId must be a valid id'),
  body('razorpay_order_id').notEmpty().withMessage('razorpay_order_id is required'),
  body('razorpay_payment_id').notEmpty().withMessage('razorpay_payment_id is required'),
  body('razorpay_signature').notEmpty().withMessage('razorpay_signature is required'),
  handleValidationErrors
];

const validateVerifyOTP = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email address'),
  body('otp').isLength({ min: 6, max: 6 }).isNumeric().withMessage('OTP must be a 6-digit number'),
  handleValidationErrors
];

const validateResendOTP = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email address'),
  handleValidationErrors
];

const validateRefreshToken = [
  body('refreshToken').notEmpty().withMessage('Refresh token is required'),
  handleValidationErrors
];

const validateProfileUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),

  body('phone')
    .optional()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit Indian phone number'),

  handleValidationErrors
];

const validatePasswordChange = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),

  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
    .withMessage('New password must include uppercase, lowercase, number and special character'),

  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Password confirmation does not match new password');
    }

    return true;
  }),

  handleValidationErrors
];

const validateForgotPassword = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email address'),
  handleValidationErrors
];

const validateResetPassword = [body('token').notEmpty().withMessage('Reset token is required'), passwordRule, handleValidationErrors];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  handleValidationErrors
];

const validateDateRangeFilters = [
  query('startDate').optional().isISO8601().withMessage('startDate must be a valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('endDate must be a valid ISO date'),
  query('minAmount').optional().isFloat({ gt: 0 }).withMessage('minAmount must be greater than 0'),
  query('maxAmount').optional().isFloat({ gt: 0 }).withMessage('maxAmount must be greater than 0'),
  handleValidationErrors
];

const validateObjectId = (paramName) => [
  param(paramName).isMongoId().withMessage(`Invalid ${paramName} format`),
  handleValidationErrors
];

const validateKYCSubmit = [
  body('docType')
    .isIn(['aadhar', 'pan', 'passport', 'driving_license'])
    .withMessage('Invalid document type'),
  body('docNumber')
    .trim()
    .isLength({ min: 4, max: 50 })
    .withMessage('Document number must be between 4 and 50 characters'),
  handleValidationErrors
];

// Only event types with a real producer wired (see backend/workers/notificationWorker.js)
// are allowed here — accepting arbitrary keys would let the UI silently save
// preferences for events that never get sent.
const NOTIFICATION_EVENT_TYPES = ['TRANSFER_SENT', 'MONEY_RECEIVED', 'LOW_BALANCE_ALERT', 'DISPUTE_RAISED'];

const validateNotificationPreferences = [
  body().custom((value) => {
    const keys = Object.keys(value || {});
    if (keys.length === 0) {
      throw new Error('At least one notification preference is required');
    }
    for (const key of keys) {
      if (!NOTIFICATION_EVENT_TYPES.includes(key)) {
        throw new Error(`Unknown notification event type: ${key}`);
      }
      const pref = value[key];
      if (
        typeof pref !== 'object' ||
        pref === null ||
        typeof pref.email !== 'boolean' ||
        typeof pref.inApp !== 'boolean'
      ) {
        throw new Error(`${key} must have boolean "email" and "inApp" fields`);
      }
    }
    return true;
  }),
  handleValidationErrors
];

module.exports = {
  validateRegistration,
  validateLogin,
  validateTransfer,
  validateAddMoney,
  validatePaymentVerify,
  validateVerifyOTP,
  validateResendOTP,
  validateRefreshToken,
  validateProfileUpdate,
  validatePasswordChange,
  validatePagination,
  validateDateRangeFilters,
  validateObjectId,
  validateForgotPassword,
  validateResetPassword,
  validateKYCSubmit,
  validateNotificationPreferences,
  handleValidationErrors
};
