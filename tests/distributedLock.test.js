// Purpose: Prove the distributed lock prevents concurrent duplicate acquisition
// Dependencies: ioredis (real Redis required), distributedLock
// Run: npx jest tests/distributedLock.test.js --runInBand

const { acquireLock, releaseLock } = require('../backend/utils/distributedLock');
const { getRedisClient } = require('../backend/utils/redis');

let redis;

beforeAll(async () => {
  process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
  redis = getRedisClient();
  await redis.connect().catch(() => {}); // already connected if singleton
});

afterAll(async () => {
  await redis.quit();
});

test('acquireLock returns a token string', async () => {
  const token = await acquireLock(redis, 'test:lock-token');
  expect(typeof token).toBe('string');
  expect(token.length).toBe(32); // 16 bytes hex
  await releaseLock(redis, 'test:lock-token', token);
});

test('second acquireLock on same key throws LOCK_CONTENTION while first is held', async () => {
  const token = await acquireLock(redis, 'test:contention');

  // Second attempt must fail — key is held
  await expect(acquireLock(redis, 'test:contention')).rejects.toMatchObject({
    code: 'LOCK_CONTENTION',
    statusCode: 409
  });

  await releaseLock(redis, 'test:contention', token);
});

test('lock can be re-acquired after release', async () => {
  const token1 = await acquireLock(redis, 'test:reacquire');
  await releaseLock(redis, 'test:reacquire', token1);

  // After release, another caller can acquire it
  const token2 = await acquireLock(redis, 'test:reacquire');
  expect(token2).toBeTruthy();
  await releaseLock(redis, 'test:reacquire', token2);
});

test('releaseLock with wrong token does not release the key', async () => {
  const token = await acquireLock(redis, 'test:wrong-token');

  // Attempt to release with a fake token — should silently no-op
  await releaseLock(redis, 'test:wrong-token', 'wrong-token-value');

  // Original lock should still be held — another acquire should still fail
  await expect(acquireLock(redis, 'test:wrong-token')).rejects.toMatchObject({
    code: 'LOCK_CONTENTION'
  });

  await releaseLock(redis, 'test:wrong-token', token);
});

test('10 concurrent acquireLock calls — exactly 1 succeeds', async () => {
  const key = 'test:concurrent';
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => acquireLock(redis, key))
  );

  const successes = results.filter((r) => r.status === 'fulfilled');
  const failures  = results.filter((r) => r.status === 'rejected');

  expect(successes.length).toBe(1);
  expect(failures.length).toBe(9);
  failures.forEach((f) => expect(f.reason.code).toBe('LOCK_CONTENTION'));

  // Clean up — release the one that succeeded
  await releaseLock(redis, key, successes[0].value);
});
