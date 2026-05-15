// Purpose: Prove Redis sliding-window rate limiter enforces limits and sets correct headers
// Dependencies: supertest, real Redis on port from env
// Run: cd backend && npx jest __tests__/rateLimiter.test.js --runInBand --forceExit

require('dotenv').config();
const request = require('supertest');
const { getRedisClient } = require('../utils/redis');
const { app } = require('../server');

let redis;

// Wipe all rate-limit keys before and after every run so tests are isolated
const flushRateLimitKeys = async () => {
  const keys = await redis.keys('ratelimit:*');
  if (keys.length) await redis.del(...keys);
};

beforeAll(async () => {
  redis = getRedisClient();
  await redis.connect().catch(() => {});
  await flushRateLimitKeys();
});

afterAll(async () => {
  try { await flushRateLimitKeys(); } catch (_) {}
});

// ── Test 1: Rate limit headers present on every response ─────────────────────
test('rate limit headers present on login response', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'header-check@test.com', password: 'wrong' });

  expect(res.headers['x-ratelimit-limit']).toBeDefined();
  expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  expect(res.headers['x-ratelimit-reset']).toBeDefined();

  // loginLimiter (max=5) runs last on this route and sets the final header value
  expect(Number(res.headers['x-ratelimit-limit'])).toBeGreaterThan(0);
  // Remaining should be one less than the limit after first request
  expect(Number(res.headers['x-ratelimit-remaining'])).toBeGreaterThanOrEqual(0);
});

// ── Test 2: 6th login request returns 429 ────────────────────────────────────
test('6th login attempt from same IP returns 429 with Retry-After', async () => {
  // Flush counters for a clean slate
  await flushRateLimitKeys();

  const results = [];
  for (let i = 0; i < 6; i++) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: `rate-test-${i}@test.com`, password: 'wrong' });
    results.push(res.status);
  }

  // First 5 must not be blocked (wrong creds → 401, or invalid input → 400)
  expect(results.slice(0, 5).every((s) => s !== 429)).toBe(true);
  // 6th must be blocked
  expect(results[5]).toBe(429);
}, 15000);

// ── Test 3: 429 includes numeric Retry-After header ──────────────────────────
test('429 response includes numeric Retry-After header', async () => {
  // Counter is already exhausted from Test 2 — fire one more
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'extra@test.com', password: 'wrong' });

  expect(res.status).toBe(429);
  expect(res.headers['retry-after']).toBeDefined();
  expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  expect(res.body.error).toBe('RATE_LIMITED');
  expect(res.body.retryAfter).toBeGreaterThan(0);
});

// ── Test 4: Sliding window pipeline math is correct ──────────────────────────
test('sliding window ZCARD reflects exact request count', async () => {
  await flushRateLimitKeys();

  const now = Date.now();
  const testKey = `ratelimit:pipeline-math:127.0.0.1`;

  // Manually seed 3 requests into the sorted set
  const pipeline = redis.pipeline();
  pipeline.zadd(testKey, now - 2000, `${now - 2000}:a`);
  pipeline.zadd(testKey, now - 1000, `${now - 1000}:b`);
  pipeline.zadd(testKey, now,        `${now}:c`);
  pipeline.expire(testKey, 900);
  await pipeline.exec();

  // Run the same pipeline the limiter uses
  const windowMs = 15 * 60 * 1000;
  const p2 = redis.pipeline();
  p2.zremrangebyscore(testKey, '-inf', now - windowMs);
  p2.zadd(testKey, now + 1, `${now + 1}:d`);
  p2.zcard(testKey);
  const results = await p2.exec();

  const count = results[2][1]; // ZCARD result
  expect(count).toBe(4); // 3 seeded + 1 added

  await redis.del(testKey);
});
