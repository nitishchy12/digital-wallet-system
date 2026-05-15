// Purpose: Prove audit log entries are created correctly and failures never break requests
// Dependencies: supertest, mongoose, jest
// Run: cd backend && npx jest __tests__/auditLog.test.js --runInBand --forceExit

require('dotenv').config();
const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../server');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const AuditLog = require('../models/AuditLog');
const { getRedisClient } = require('../utils/redis');

const flushRateLimits = async () => {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys('ratelimit:*');
    if (keys.length) await redis.del(...keys);
  } catch (_) {}
};

const TEST_EMAIL = `audit-test-${Date.now()}@example.com`;
const TEST_PASS  = 'Audit@1234';
let testUser, accessToken, receiverUser;

beforeAll(async () => {
  // Flush rate limit counters so previous test runs don't block login/register calls
  await flushRateLimits();

  // Create users directly via Mongoose — bypasses rate limits that apply to the API.
  // Tests should own their data setup, not depend on rate-limited endpoints.
  const bcrypt = require('bcryptjs');
  const hashed = await bcrypt.hash(TEST_PASS, 10);

  testUser = await User.findOneAndUpdate(
    { email: TEST_EMAIL },
    {
      $setOnInsert: {
        name: 'Audit Tester', email: TEST_EMAIL,
        phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
        password: hashed, isVerified: true, isActive: true, role: 'user'
      }
    },
    { upsert: true, new: true }
  );
  await Wallet.findOneAndUpdate(
    { userId: testUser._id },
    { $setOnInsert: { userId: testUser._id, balance: 5000, currency: 'INR' } },
    { upsert: true, new: true }
  );

  const rxEmail = `audit-rx-${Date.now()}@example.com`;
  receiverUser = await User.findOneAndUpdate(
    { email: rxEmail },
    {
      $setOnInsert: {
        name: 'Audit Receiver', email: rxEmail,
        phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
        password: hashed, isVerified: true, isActive: true, role: 'user'
      }
    },
    { upsert: true, new: true }
  );
  await Wallet.findOneAndUpdate(
    { userId: receiverUser._id },
    { $setOnInsert: { userId: receiverUser._id, balance: 0, currency: 'INR' } },
    { upsert: true, new: true }
  );

  // Login via API to get a real JWT (this uses loginLimiter: 5/15min — safe)
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_EMAIL, password: TEST_PASS });
  accessToken = loginRes.body.data?.accessToken;
}, 30000);

afterAll(async () => {
  await AuditLog.deleteMany({ userId: { $in: [testUser?._id, receiverUser?._id] } });
  await User.deleteOne({ _id: testUser?._id });
  await User.deleteOne({ _id: receiverUser?._id });
  await Wallet.deleteOne({ userId: testUser?._id });
  await Wallet.deleteOne({ userId: receiverUser?._id });
  await flushRateLimits();
});

// ── Test 1: Successful login creates USER_LOGIN entry ────────────────────────
test('successful login creates USER_LOGIN audit entry', async () => {
  const log = await AuditLog.findOne({
    action: 'USER_LOGIN',
    userId: testUser._id
  }).sort({ createdAt: -1 });

  expect(log).not.toBeNull();
  expect(log.ip).toBeDefined();
  expect(log.userAgent).toBeDefined();
  expect(log.severity).toBe('info');
  // Passwords must never be stored
  expect(log.metadata?.password).toBeUndefined();
});

// ── Test 2: Failed login creates USER_LOGIN_FAILED with warning severity ─────
test('failed login creates USER_LOGIN_FAILED with severity=warning', async () => {
  await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_EMAIL, password: 'WrongPass@99' });

  const log = await AuditLog.findOne({
    action: 'USER_LOGIN_FAILED',
    userId: testUser._id,
    'metadata.reason': 'invalid_password'
  }).sort({ createdAt: -1 });

  expect(log).not.toBeNull();
  expect(log.severity).toBe('warning');
  expect(log.metadata.reason).toBe('invalid_password');
  // userId is still logged on wrong password (user was found)
  expect(log.userId.toString()).toBe(testUser._id.toString());
  // Never logs the attempted password
  expect(log.metadata?.password).toBeUndefined();
}, 10000);

// ── Test 3: Login attempt with unknown email — userId is null ─────────────────
test('login with unknown email creates USER_LOGIN_FAILED with userId=null', async () => {
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'ghost@nobody.com', password: 'Whatever@1' });

  const log = await AuditLog.findOne({
    action: 'USER_LOGIN_FAILED',
    'metadata.email': 'ghost@nobody.com'
  }).sort({ createdAt: -1 });

  expect(log).not.toBeNull();
  expect(log.userId).toBeNull();
  expect(log.metadata.reason).toBe('user_not_found');
  expect(log.severity).toBe('warning');
});

// ── Test 4: Successful transfer creates TRANSFER_COMPLETED ────────────────────
test('successful transfer creates TRANSFER_COMPLETED audit entry', async () => {
  await request(app)
    .post('/api/wallet/transfer')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ receiverEmail: receiverUser.email, amount: 100 });

  const log = await AuditLog.findOne({
    action: 'TRANSFER_COMPLETED',
    userId: testUser._id
  }).sort({ createdAt: -1 });

  expect(log).not.toBeNull();
  expect(log.metadata.amount).toBe(100);
  expect(log.metadata.transactionId).toBeDefined();
  expect(log.metadata.receiverEmail).toBe(receiverUser.email);
}, 15000);

// ── Test 5: Failed transfer (insufficient funds) creates TRANSFER_FAILED ──────
test('insufficient funds transfer creates TRANSFER_FAILED with severity=warning', async () => {
  // 9000 is under Tier 0 KYC limit (10000) but well above ~4900 balance
  // So KYC passes, insufficient-funds fires, and TRANSFER_FAILED is logged
  await request(app)
    .post('/api/wallet/transfer')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ receiverEmail: receiverUser.email, amount: 9000 });

  const log = await AuditLog.findOne({
    action: 'TRANSFER_FAILED',
    userId: testUser._id,
    'metadata.reason': 'INSUFFICIENT_FUNDS'
  }).sort({ createdAt: -1 });

  expect(log).not.toBeNull();
  expect(log.severity).toBe('warning');
  expect(log.metadata.reason).toBe('INSUFFICIENT_FUNDS');
  expect(log.metadata.amount).toBe(9000);
}, 15000);

// ── Test 6: Audit failure does NOT break the main request ─────────────────────
test('audit log write failure does not affect login response', async () => {
  // Spy on AuditLog.create and make it throw once
  const spy = jest.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('DB unavailable'));

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_EMAIL, password: TEST_PASS });

  // Login must still succeed even if audit logging threw
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.data.accessToken).toBeDefined();

  spy.mockRestore();
});

// ── Test 7: Sanitization — metadata never contains passwords or tokens ────────
test('audit log sanitizes sensitive fields from metadata', async () => {
  const { writeAuditLog } = require('../utils/auditLogger');
  const mockReq = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } };

  await writeAuditLog({
    action: 'USER_LOGIN',
    userId: testUser._id,
    req: mockReq,
    metadata: {
      email: 'safe@test.com',
      password: 'should-be-stripped',
      token: 'should-be-stripped',
      otp: '123456'
    }
  });

  const log = await AuditLog.findOne({
    action: 'USER_LOGIN',
    userId: testUser._id,
    'metadata.email': 'safe@test.com'
  }).sort({ createdAt: -1 });

  expect(log).not.toBeNull();
  expect(log.metadata.password).toBeUndefined();
  expect(log.metadata.token).toBeUndefined();
  expect(log.metadata.otp).toBeUndefined();
  expect(log.metadata.email).toBe('safe@test.com');
});
