// Purpose: Cache-aside pattern for wallet balances — avoids a MongoDB read on every dashboard load
// Dependencies: ioredis client (redis.js)
// Used by: walletController (getWalletBalance, transferMoney)

const { getRedisClient } = require('./redis');
const logger = require('./logger');

const TTL_SECONDS = 30;

const cacheKey = (userId) => `balance:${userId.toString()}`;

/**
 * Read balance from cache.
 * Returns { balance, fromCache: true } on hit, null on miss or Redis error.
 */
const getBalance = async (userId) => {
  try {
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey(userId));
    if (cached !== null) {
      return { balance: parseFloat(cached), fromCache: true };
    }
  } catch (err) {
    logger.warn('Balance cache read error userId=%s: %s', userId, err.message);
  }
  return null;
};

/**
 * Write balance to cache with TTL.
 * Silent on Redis error — cache is best-effort, never blocks the main flow.
 */
const setBalance = async (userId, balance) => {
  try {
    const redis = getRedisClient();
    await redis.set(cacheKey(userId), balance.toString(), 'EX', TTL_SECONDS);
  } catch (err) {
    logger.warn('Balance cache write error userId=%s: %s', userId, err.message);
  }
};

/**
 * Invalidate multiple wallet caches in a single pipeline.
 * Called after every debit/credit so next read always hits MongoDB.
 */
const invalidateMany = async (userIds) => {
  if (!userIds || userIds.length === 0) return;
  try {
    const redis = getRedisClient();
    const pipeline = redis.pipeline();
    userIds.forEach((id) => pipeline.del(cacheKey(id)));
    await pipeline.exec();
    logger.info('Balance cache invalidated userIds=%s', userIds.join(','));
  } catch (err) {
    logger.warn('Balance cache invalidation error: %s', err.message);
  }
};

module.exports = { getBalance, setBalance, invalidateMany };
