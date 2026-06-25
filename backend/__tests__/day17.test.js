// Purpose: Prove Day 17 additions — effective balance/limit info on GET /wallet/balance,
// admin user/wallet lookup, and the new KYC approval queue (queue/approve/reject + dashboard counts)
// Dependencies: real MongoDB, real Redis
// Run: cd backend && npx jest __tests__/day17.test.js --runInBand --forceExit

require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../server');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const KYCDocument = require('../models/KYCDocument');
const Dispute = require('../models/Dispute');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const { getRedisClient } = require('../utils/redis');

const TEST_PASS = 'Day17@1234';
let sender, senderToken, receiver, adminUser, adminToken;

const flushLimits = async () => {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys('ratelimit:*');
    if (keys.length) await redis.del(...keys);
  } catch (_) {}
};

const createUser = async (suffix, role = 'user', extra = {}) => {
  const hashed = await bcrypt.hash(TEST_PASS, 10);
  const email = `day17-${suffix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.com`;
  const user = await User.create({
    name: `Day17 ${suffix}`,
    email,
    phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    password: TEST_PASS,
    isVerified: true,
    isActive: true,
    role,
    kycTier: 0,
    ...extra
  });
  await Wallet.create({ userId: user._id, balance: 50000, currency: 'INR' });
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
  await Dispute.deleteMany({ raisedBy: { $in: ids } });
  await KYCDocument.deleteMany({ userId: { $in: ids } });
  await AuditLog.deleteMany({ userId: { $in: ids } });
  await flushLimits();
});

describe('GET /wallet/balance — effective balance + limit info', () => {
  test('returns escrowHeld, effectiveBalance, and tier limit fields', async () => {
    await Wallet.findOneAndUpdate({ userId: sender._id }, { balance: 50000, escrowHeld: 2000 });

    const res = await request(app)
      .get('/api/wallet/balance')
      .set('Authorization', `Bearer ${senderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBe(50000);
    expect(res.body.data.escrowHeld).toBe(2000);
    expect(res.body.data.effectiveBalance).toBe(48000);
    expect(res.body.data.kycTier).toBe(0);
    expect(res.body.data.perTransferLimit).toBe(10000);
    expect(res.body.data.dailyLimit).toBe(10000);
    expect(res.body.data.remainingToday).toBe(10000);
  });

  test('remainingToday reflects real spend after a transfer', async () => {
    await Wallet.findOneAndUpdate({ userId: sender._id }, { balance: 50000, escrowHeld: 0 });
    await Transaction.deleteMany({ senderId: sender._id, type: 'TRANSFER' });

    const transfer = await request(app)
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ receiverEmail: receiver.email, amount: 3000 });
    expect(transfer.status).toBe(200);

    const res = await request(app)
      .get('/api/wallet/balance')
      .set('Authorization', `Bearer ${senderToken}`);

    expect(res.body.data.alreadySpentToday).toBe(3000);
    expect(res.body.data.remainingToday).toBe(7000);
  }, 15000);
});

describe('GET /admin/users/lookup', () => {
  test('admin can look up a user by email and sees wallet status', async () => {
    const res = await request(app)
      .get(`/api/admin/users/lookup?email=${encodeURIComponent(sender.email)}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(sender.email);
    expect(res.body.data.wallet.status).toBe('active');
    expect(res.body.data.wallet).toHaveProperty('escrowHeld');
  });

  test('returns 404 for unknown email', async () => {
    const res = await request(app)
      .get('/api/admin/users/lookup?email=nobody-day17@nowhere.com')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('USER_NOT_FOUND');
  });

  test('non-admin is rejected with 403', async () => {
    const res = await request(app)
      .get(`/api/admin/users/lookup?email=${encodeURIComponent(sender.email)}`)
      .set('Authorization', `Bearer ${senderToken}`);

    expect(res.status).toBe(403);
  });
});

describe('KYC approval queue', () => {
  let kycDoc;

  beforeEach(async () => {
    await KYCDocument.deleteMany({ userId: sender._id });
    kycDoc = await KYCDocument.create({
      userId: sender._id,
      docType: 'pan',
      docNumber: 'ABCDE1234F',
      targetTier: 1,
      status: 'pending'
    });
    await User.findByIdAndUpdate(sender._id, { kycTier: 0 });
  });

  test('GET /admin/kyc/queue lists the pending submission', async () => {
    const res = await request(app)
      .get('/api/admin/kyc/queue?status=pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((d) => d._id);
    expect(ids).toContain(kycDoc._id.toString());
    expect(res.body.data.find((d) => d._id === kycDoc._id.toString()).userId.email).toBe(sender.email);
  });

  test('PATCH approve sets status approved and upgrades user kycTier', async () => {
    const res = await request(app)
      .patch(`/api/admin/kyc/${kycDoc._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve' });

    expect(res.status).toBe(200);
    expect(res.body.data.newTier).toBe(1);

    const updatedDoc = await KYCDocument.findById(kycDoc._id);
    expect(updatedDoc.status).toBe('approved');

    const updatedUser = await User.findById(sender._id);
    expect(updatedUser.kycTier).toBe(1);

    const log = await AuditLog.findOne({ action: 'KYC_APPROVED', 'metadata.kycDocumentId': kycDoc._id.toString() });
    expect(log).not.toBeNull();
  });

  test('PATCH reject requires a reason >= 10 chars', async () => {
    const res = await request(app)
      .patch(`/api/admin/kyc/${kycDoc._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'reject', reason: 'too short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REASON_REQUIRED');
  });

  test('PATCH reject with a valid reason sets status rejected and does not change kycTier', async () => {
    const res = await request(app)
      .patch(`/api/admin/kyc/${kycDoc._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'reject', reason: 'Document image was unreadable, please resubmit' });

    expect(res.status).toBe(200);

    const updatedDoc = await KYCDocument.findById(kycDoc._id);
    expect(updatedDoc.status).toBe('rejected');
    expect(updatedDoc.rejectionReason).toBe('Document image was unreadable, please resubmit');

    const updatedUser = await User.findById(sender._id);
    expect(updatedUser.kycTier).toBe(0);
  });

  test('reviewing an already-decided submission returns 400 KYC_ALREADY_REVIEWED', async () => {
    await request(app)
      .patch(`/api/admin/kyc/${kycDoc._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve' });

    const res = await request(app)
      .patch(`/api/admin/kyc/${kycDoc._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('KYC_ALREADY_REVIEWED');
  });

  test('non-admin cannot review KYC submissions', async () => {
    const res = await request(app)
      .patch(`/api/admin/kyc/${kycDoc._id}`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ action: 'approve' });

    expect(res.status).toBe(403);
  });
});

describe('GET /admin/dashboard — pending counts', () => {
  test('includes pendingDisputes and pendingKYC reflecting real pending records', async () => {
    await KYCDocument.deleteMany({ userId: sender._id });
    await KYCDocument.create({ userId: sender._id, docType: 'pan', docNumber: 'XYZ123', targetTier: 1, status: 'pending' });

    const before = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(before.status).toBe(200);
    expect(before.body.data.stats.pendingKYC).toBeGreaterThanOrEqual(1);
    expect(typeof before.body.data.stats.pendingDisputes).toBe('number');
  });
});
