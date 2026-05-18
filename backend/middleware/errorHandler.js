// Purpose: Global error handler — maps all error types to HTTP responses, never exposes stack traces
// Dependencies: logger
// Used by: server.js (registered last, after all routes)

const logger = require('../utils/logger');

const notFound = (req, res, next) => {
  const error = new Error(`Not found: ${req.originalUrl}`);
  error.statusCode = 404;
  error.code = 'NOT_FOUND';
  next(error);
};

const ERROR_MAP = {
  ValidationError:    { status: 422, code: 'VALIDATION_ERROR' },
  CastError:          { status: 400, code: 'INVALID_ID' },
  JsonWebTokenError:  { status: 401, code: 'INVALID_TOKEN' },
  TokenExpiredError:  { status: 401, code: 'TOKEN_EXPIRED' },
};

const errorHandler = (err, req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || 'none';

  // Express JSON body-parser sends SyntaxError with err.status = 400
  if (err.status === 400 && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'INVALID_JSON',
      message: 'Request body contains invalid JSON.',
      correlationId
    });
  }

  // Mongoose ValidationError → 422 with per-field detail
  if (err.name === 'ValidationError') {
    const details = Object.fromEntries(
      Object.entries(err.errors || {}).map(([f, e]) => [f, e.message])
    );
    return res.status(422).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid input data',
      details,
      correlationId
    });
  }

  // Named error types (CastError, JWT errors, etc.)
  const mapped = ERROR_MAP[err.name];
  if (mapped) {
    return res.status(mapped.status).json({
      success: false,
      error: mapped.code,
      message: err.message,
      correlationId
    });
  }

  // MongoDB duplicate key → 409
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      error: 'DUPLICATE_KEY',
      message: `${field} already exists.`,
      correlationId
    });
  }

  // Application errors passed via next(err) with explicit statusCode/code
  if (err.statusCode) {
    if (err.statusCode >= 500) {
      logger.error('App error %d %s %s: %s', err.statusCode, req.method, req.path, err.stack);
    }
    return res.status(err.statusCode).json({
      success: false,
      error: err.code || 'APP_ERROR',
      message: err.message,
      correlationId
    });
  }

  // Unknown — log full detail, send generic safe response
  logger.error('Unhandled error %s %s correlationId=%s: %s', req.method, req.path, correlationId, err.stack || err.message);

  return res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: 'Something went wrong. Please try again.',
    correlationId
  });
};

module.exports = { notFound, errorHandler };
