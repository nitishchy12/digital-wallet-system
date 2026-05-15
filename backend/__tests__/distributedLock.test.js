// Purpose: Prove the distributed lock prevents concurrent duplicate acquisition
// Dependencies: ioredis (real Redis on port from env), distributedLock
// Run: cd backend && npx jest __tests__/distributedLock.test.js --runInBand --forceExit

require('dotenv').config();
const { acquireLock, releaseLock } = require('../utils/distributedLock');
const { getRedisClient } = require('../utils/redis');

let redis;

beforeAll(async () => {
  redis = getRedisClient();
  // lazyConnect — explicitly connect before tests
  await redis.connect().catch(() => {}); // no-op if already connected
});

afterAll(async () => {
  // Don't quit — shared singleton used by other test suites in the same run.
  // --forceExit cleans up the process after all suites complete.
});

test('acquireLock returns a 32-char hex token', async () => {
  const token = await acquireLock(redis, 'test:token');
  expect(typeof token).toBe('string');
  expect(token.length).toBe(32);
  await releaseLock(redis, 'test:token', token);
});

test('second acquireLock on same key throws LOCK_CONTENTION while first is held', async () => {
  const token = await acquireLock(redis, 'test:contention');

  await expect(acquireLock(redis, 'test:contention')).rejects.toMatchObject({
    code: 'LOCK_CONTENTION',
    statusCode: 409
  });

  await releaseLock(redis, 'test:contention', token);
});

test('lock can be re-acquired after release', async () => {
  const token1 = await acquireLock(redis, 'test:reacquire');
  await releaseLock(redis, 'test:reacquire', token1);

  const token2 = await acquireLock(redis, 'test:reacquire');
  expect(token2).toBeTruthy();
  await releaseLock(redis, 'test:reacquire', token2);
});

test('releaseLock with wrong token does not release the key', async () => {
  const token = await acquireLock(redis, 'test:wrongtoken');

  // Wrong token — should silently no-op
  await releaseLock(redis, 'test:wrongtoken', 'not-the-real-token');

  // Lock still held — new acquire must fail
  await expect(acquireLock(redis, 'test:wrongtoken')).rejects.toMatchObject({
    code: 'LOCK_CONTENTION'
  });

  await releaseLock(redis, 'test:wrongtoken', token);
});

test('releaseLock with null token is a safe no-op', async () => {
  // Simulates Redis being unavailable at acquire time
  await expect(releaseLock(redis, 'test:nulltoken', null)).resolves.toBeUndefined();
});

test('10 concurrent acquireLock calls — exactly 1 succeeds, 9 get LOCK_CONTENTION', async () => {
  const key = 'test:concurrent';
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => acquireLock(redis, key))
  );

  const successes = results.filter((r) => r.status === 'fulfilled');
  const failures  = results.filter((r) => r.status === 'rejected');

  expect(successes.length).toBe(1);
  expect(failures.length).toBe(9);
  failures.forEach((f) => expect(f.reason.code).toBe('LOCK_CONTENTION'));

  // Release the one that won
  await releaseLock(redis, key, successes[0].value);
});
