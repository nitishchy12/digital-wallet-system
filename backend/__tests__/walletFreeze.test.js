// Purpose: Prove wallet freeze enforcement and KYC tier limits on the transfer endpoint
// Dependencies: supertest, mongoose
// Run: cd backend && npx jest __tests__/walletFreeze.test.js --runInBand --forceExit

require('dotenv').config();
const request = require('supertest');
const { app } = require('../server');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const { getRedisClient } = require('../utils/redis');

const TEST_PASS = 'Freeze@1234';
let sender, senderToken, receiver, adminUser, adminToken;

const flushLimits = async () => {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys('ratelimit:*');
    if (keys.length) await redis.del(...keys);
  } catch (_) {}
};

const createUser = async (suffix, role = 'user') => {
  const bcrypt = require('bcryptjs');
  const hashed = await bcrypt.hash(TEST_PASS, 10);
  const email = `freeze-${suffix}-${Date.now()}@test.com`;
  const user = await User.findOneAndUpdate(
    { email },
    {
      $setOnInsert: {
        name: `Freeze ${suffix}`, email,
        phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
        password: hashed, isVerified: true, isActive: true, role, kycTier: 0
      }
    },
    { upsert: true, new: true }
  );
  await Wallet.findOneAndUpdate(
    { userId: user._id },
    { $setOnInsert: { userId: user._id, balance: 50000, currency: 'INR', status: 'active' } },
    { upsert: true, new: true }
  );
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: TEST_PASS });
  return { user, token: loginRes.body.data?.accessToken };
};

beforeAll(async () => {
  await flushLimits();
  const s = await createUser('sender');
  sender = s.user; senderToken = s.token;
  const r = await createUser('receiver');
  receiver = r.user;
  const a = await createUser('admin', 'admin');
  adminUser = a.user; adminToken = a.token;
}, 30000);

afterAll(async () => {
  const ids = [sender?._id, receiver?._id, adminUser?._id].filter(Boolean);
  await User.deleteMany({ _id: { $in: ids } });
  await Wallet.deleteMany({ userId: { $in: ids } });
  await Transaction.deleteMany({ senderId: { $in: ids } });
  await AuditLog.deleteMany({ userId: { $in: ids } });
  await flushLimits();
});

// Reset wallet to active + fresh balance before each test
beforeEach(async () => {
  await Wallet.findOneAndUpdate(
    { userId: sender._id },
    { status: 'active', frozenAt: null, frozenReason: null, frozenBy: null, balance: 50000 }
  );
});

// ════════════════════════════════════════════════
// WALLET FREEZE TESTS
// ════════════════════════════════════════════════

describe('Wallet Freeze', () => {
  test('transfer from frozen wallet returns 403 WALLET_FROZEN with reason', async () => {
    await Wallet.findOneAndUpdate(
      { userId: sender._id },
      { status: 'frozen', frozenReason: 'Suspicious activity detected in account' }
    );

    const res = await request(app)
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ receiverEmail: receiver.email, amount: 100 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('WALLET_FROZEN');
    expect(res.body.reason).toBe('Suspicious activity detected in account');
  });

  test('admin can freeze wallet with reason >= 10 chars', async () => {
    const res = await request(app)
      .post('/api/admin/wallet/freeze')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: sender._id.toString(), reason: 'Multiple failed transfer attempts detected' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const wallet = await Wallet.findOne({ userId: sender._id });
    expect(wallet.status).toBe('frozen');
    expect(wallet.frozenReason).toBe('Multiple failed transfer attempts detected');
    expect(wallet.frozenAt).not.toBeNull();
  });

  test('admin can unfreeze a frozen wallet', async () => {
    // Freeze first
    await Wallet.findOneAndUpdate({ userId: sender._id }, { status: 'frozen', frozenReason: 'Test freeze reason here' });

    const res = await request(app)
      .post('/api/admin/wallet/unfreeze')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: sender._id.toString(), reason: 'Investigation complete, cleared' });

    expect(res.status).toBe(200);

    const wallet = await Wallet.findOne({ userId: sender._id });
    expect(wallet.status).toBe('active');
    expect(wallet.frozenReason).toBeNull();
  });

  test('freeze without reason returns 400 REASON_REQUIRED', async () => {
    const res = await request(app)
      .post('/api/admin/wallet/freeze')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: sender._id.toString(), reason: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REASON_REQUIRED');
  });

  test('non-admin cannot freeze a wallet', async () => {
    const res = await request(app)
      .post('/api/admin/wallet/freeze')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ userId: receiver._id.toString(), reason: 'Some valid reason here yes' });

    expect(res.status).toBe(403);
  });

  test('freeze writes WALLET_FROZEN audit log with severity critical', async () => {
    await request(app)
      .post('/api/admin/wallet/freeze')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: sender._id.toString(), reason: 'Audit log test freeze action' });

    const log = await AuditLog.findOne({
      action: 'WALLET_FROZEN',
      'metadata.targetUserId': sender._id.toString()
    }).sort({ createdAt: -1 });

    expect(log).not.toBeNull();
    expect(log.severity).toBe('critical');
    expect(log.metadata.reason).toBe('Audit log test freeze action');
  });
});

// ════════════════════════════════════════════════
// KYC TIER LIMIT TESTS
// ════════════════════════════════════════════════

describe('KYC Tier Limits', () => {
  beforeEach(async () => {
    // Reset to Tier 0 and clean balance before each KYC test
    await User.findByIdAndUpdate(sender._id, { kycTier: 0 });
    await Transaction.deleteMany({ senderId: sender._id, type: 'TRANSFER' });
  });

  test('Tier 0 user cannot send more than Rs 10,000 per transfer', async () => {
    const res = await request(app)
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ receiverEmail: receiver.email, amount: 15000 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('KYC_LIMIT_EXCEEDED');
    expect(res.body.currentLimit).toBe(10000);
    expect(res.body.requiredTier).toBe(1);
  });

  test('Tier 1 user can send up to Rs 50,000 per transfer', async () => {
    await User.findByIdAndUpdate(sender._id, { kycTier: 1 });

    const res = await request(app)
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ receiverEmail: receiver.email, amount: 45000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  }, 15000);

  test('Tier 2 user can send up to Rs 2,00,000 per transfer', async () => {
    await User.findByIdAndUpdate(sender._id, { kycTier: 2 });
    await Wallet.findOneAndUpdate({ userId: sender._id }, { balance: 250000 });

    const res = await request(app)
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ receiverEmail: receiver.email, amount: 150000 });

    expect(res.status).toBe(200);
  }, 15000);

  test('daily limit blocks transfer when cumulative spend exceeds Tier 0 limit', async () => {
    // First transfer: Rs 8,000 — should succeed (under 10,000 daily limit)
    const first = await request(app)
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ receiverEmail: receiver.email, amount: 8000 });
    expect(first.status).toBe(200);

    // Second transfer: Rs 5,000 — total 13,000 > 10,000 daily limit
    const res = await request(app)
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ receiverEmail: receiver.email, amount: 5000 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('DAILY_LIMIT_EXCEEDED');
    expect(res.body.alreadySpent).toBe(8000);
    expect(res.body.remainingToday).toBe(2000);
    expect(res.body.dailyLimit).toBe(10000);
  }, 20000);

  test('kycLimits.js returns correct limits per tier', () => {
    const { getLimitsForTier, checkPerTransferLimit, checkDailyLimit } = require('../utils/kycLimits');

    // Tier 0
    expect(getLimitsForTier(0).perTransferLimit).toBe(10000);
    expect(getLimitsForTier(1).perTransferLimit).toBe(50000);
    expect(getLimitsForTier(2).perTransferLimit).toBe(200000);

    // checkPerTransferLimit
    expect(checkPerTransferLimit(0, 5000).allowed).toBe(true);
    expect(checkPerTransferLimit(0, 15000).allowed).toBe(false);
    expect(checkPerTransferLimit(0, 15000).requiredTier).toBe(1);
    expect(checkPerTransferLimit(0, 100000).requiredTier).toBe(2);

    // checkDailyLimit
    expect(checkDailyLimit(0, 8000, 5000).allowed).toBe(false);
    expect(checkDailyLimit(0, 8000, 5000).remainingToday).toBe(2000);
    expect(checkDailyLimit(0, 2000, 5000).allowed).toBe(true);
  });
});
