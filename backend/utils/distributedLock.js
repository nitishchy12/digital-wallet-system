// Purpose: Redis-based distributed lock using SET NX PX with Lua-script safe release
// Dependencies: ioredis client (redis.js), crypto
// Used by: walletController.transferMoney

const crypto = require('crypto');
const logger = require('./logger');

const LOCK_TTL_MS = 5000;   // lock auto-expires after 5 seconds if never released
const RETRY_COUNT = 3;      // try 3 times before giving up
const RETRY_DELAY_MS = 50;  // 50 ms between retries

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Lua script: only delete the key if the stored value matches our token.
// This prevents a slow process from releasing a lock that expired and was
// re-acquired by a different request.
const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

/**
 * Acquire a lock for the given resource key.
 * Returns the lock token string on success.
 * Throws with statusCode 409 and code LOCK_CONTENTION after RETRY_COUNT failures.
 */
const acquireLock = async (redisClient, resourceKey, ttlMs = LOCK_TTL_MS) => {
  const token = crypto.randomBytes(16).toString('hex');
  const key = `lock:${resourceKey}`;

  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    // SET key token NX PX ttl — only sets if key does not exist
    const result = await redisClient.set(key, token, 'PX', ttlMs, 'NX');

    if (result === 'OK') {
      logger.info('Lock acquired key=%s attempt=%d', key, attempt);
      return token;
    }

    logger.warn('Lock busy key=%s attempt=%d/%d — retrying in %dms', key, attempt, RETRY_COUNT, RETRY_DELAY_MS);

    if (attempt < RETRY_COUNT) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  const err = new Error('Transfer in progress. Please wait a moment and try again.');
  err.statusCode = 409;
  err.code = 'LOCK_CONTENTION';
  throw err;
};

/**
 * Release the lock only if we still own it (token matches).
 * Safe to call even after TTL expiry or when token is null (no-op).
 */
const releaseLock = async (redisClient, resourceKey, token) => {
  if (!token) return; // lock was never acquired (e.g. Redis was unavailable)
  const key = `lock:${resourceKey}`;
  try {
    const released = await redisClient.eval(RELEASE_SCRIPT, 1, key, token);
    if (released === 1) {
      logger.info('Lock released key=%s', key);
    } else {
      logger.warn('Lock already expired or stolen — skipping release key=%s', key);
    }
  } catch (err) {
    // Never let a lock release error bubble up and mask the real result
    logger.error('Lock release error key=%s: %s', key, err.message);
  }
};

module.exports = { acquireLock, releaseLock };
