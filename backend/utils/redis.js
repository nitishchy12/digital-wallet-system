// Purpose: Singleton ioredis client — one connection shared across the entire process
// Dependencies: ioredis
// Used by: distributedLock.js, rateLimiter.js, balanceCache.js (Days 2-3)

const Redis = require('ioredis');
const logger = require('./logger');

const REDIS_OPTS = {
  host: () => process.env.REDIS_HOST || 'localhost',
  port: () => Number(process.env.REDIS_PORT) || 6379,
  password: () => process.env.REDIS_PASSWORD || undefined
};

let client = null;

const createClient = () => {
  const c = new Redis({
    host: REDIS_OPTS.host(),
    port: REDIS_OPTS.port(),
    password: REDIS_OPTS.password(),
    commandTimeout: 3000,
    retryStrategy: (times) => {
      if (times > 5) {
        logger.warn('Redis: max retry attempts reached — giving up reconnect');
        return null;
      }
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true
  });

  c.on('connect',      () => logger.info('Redis connected'));
  c.on('ready',        () => logger.info('Redis ready'));
  c.on('error',        (err) => logger.error('Redis error: %s', err.message));
  c.on('reconnecting', () => logger.warn('Redis reconnecting...'));
  c.on('end', () => {
    logger.warn('Redis connection closed');
    client = null;
  });

  return c;
};

const getRedisClient = () => {
  if (!client) client = createClient();
  return client;
};

/**
 * BullMQ requires a dedicated connection with maxRetriesPerRequest: null.
 * Each call returns a NEW client (not the singleton) — BullMQ manages its lifecycle.
 */
const createBullMQConnection = () => {
  return new Redis({
    host: REDIS_OPTS.host(),
    port: REDIS_OPTS.port(),
    password: REDIS_OPTS.password(),
    maxRetriesPerRequest: null,   // required by BullMQ
    enableReadyCheck: false,      // recommended for BullMQ workers
    retryStrategy: (times) => Math.min(times * 200, 3000)
  });
};

module.exports = { getRedisClient, createBullMQConnection };
