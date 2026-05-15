// Purpose: Redis sliding-window rate limiter — shared state across all pods
// Dependencies: ioredis client (redis.js)
// Used by: server.js (applied per route)

const { getRedisClient } = require('../utils/redis');
const logger = require('../utils/logger');

/**
 * Build a sliding-window rate-limit middleware.
 *
 * @param {string}   limitKey   - Redis key prefix (e.g. 'auth:login')
 * @param {number}   max        - Max requests allowed in the window
 * @param {number}   windowMs   - Window size in milliseconds
 * @param {Function} [getId]    - Extract the identifier from req (default: IP)
 */
const slidingWindowLimiter = (limitKey, max, windowMs, getId) => {
  return async (req, res, next) => {
    // Identifier: authenticated userId for wallet routes, IP for auth routes
    const identifier = getId ? getId(req) : (req.ip || 'unknown');
    const redisKey = `ratelimit:${limitKey}:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const resetAtSec = Math.ceil((now + windowMs) / 1000);

    try {
      const redis = getRedisClient();

      // Single pipeline: remove expired entries → add current → count → set TTL
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(redisKey, '-inf', windowStart);
      pipeline.zadd(redisKey, now, `${now}:${Math.random().toString(36).slice(2)}`);
      pipeline.zcard(redisKey);
      pipeline.expire(redisKey, Math.ceil(windowMs / 1000) + 1);

      const results = await pipeline.exec();
      // results[i] = [err, value]
      const pipelineErr = results.find(([err]) => err);
      if (pipelineErr) throw pipelineErr[0];

      const count = results[2][1];
      const remaining = Math.max(0, max - count);

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetAtSec);

      if (count > max) {
        const retryAfter = Math.ceil(windowMs / 1000);
        res.setHeader('Retry-After', retryAfter);
        logger.warn('Rate limit exceeded key=%s id=%s count=%d max=%d', redisKey, identifier, count, max);
        return res.status(429).json({
          success: false,
          error: 'RATE_LIMITED',
          message: 'Too many requests. Please slow down.',
          retryAfter
        });
      }

      return next();
    } catch (err) {
      // Redis unavailable — fail open so Redis downtime never blocks users
      logger.error('Rate limiter Redis error (failing open): %s', err.message);
      return next();
    }
  };
};

// ── Per-route limiters ───────────────────────────────────────────────────────

// POST /api/auth/login  → 5 per 15 min per IP
const loginLimiter = slidingWindowLimiter(
  'auth:login', 5, 15 * 60 * 1000
);

// POST /api/auth/register → 3 per hour per IP
const registerLimiter = slidingWindowLimiter(
  'auth:register', 3, 60 * 60 * 1000
);

// POST /api/wallet/transfer → 20 per minute per userId
const transferLimiter = slidingWindowLimiter(
  'wallet:transfer', 20, 60 * 1000,
  (req) => req.user?._id?.toString() || req.ip
);

// All /api/auth/* routes → 10 per 15 min per IP (catch-all)
const authLimiter = slidingWindowLimiter(
  'auth:global', 10, 15 * 60 * 1000
);

// Global fallback → 200 per 15 min per IP
const globalLimiter = slidingWindowLimiter(
  'global', 200, 15 * 60 * 1000
);

module.exports = {
  loginLimiter,
  registerLimiter,
  transferLimiter,
  authLimiter,
  globalLimiter
};
