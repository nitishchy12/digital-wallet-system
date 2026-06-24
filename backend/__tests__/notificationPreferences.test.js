// Purpose: Prove notification preferences are exposed via the User model's
// toJSON (not silently stripped) and that the GET/PUT API round-trips correctly.
// Dependencies: real MongoDB, real Redis
// Run: cd backend && npx jest __tests__/notificationPreferences.test.js --runInBand --forceExit

require('dotenv').config();
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../server');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { getRedisClient } = require('../utils/redis');

const TEST_PASS = 'NotifPrefs@1234';
let user, userToken;

const flushRateLimits = async () => {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys('ratelimit:*');
    if (keys.length) await redis.del(...keys);
  } catch (_) {}
};

beforeAll(async () => {
  await flushRateLimits();

  const hashed = await bcrypt.hash(TEST_PASS, 10);
  const ts = Date.now();

  user = await User.findOneAndUpdate(
    { email: `notif-prefs-${ts}@test.com` },
    {
      $setOnInsert: {
        name: 'Notif Prefs User',
        email: `notif-prefs-${ts}@test.com`,
        phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
        password: hashed,
        isVerified: true,
        isActive: true,
        role: 'user'
      }
    },
    { upsert: true, new: true }
  );

  await Wallet.findOneAndUpdate(
    { userId: user._id },
    { $setOnInsert: { userId: user._id, balance: 1000, currency: 'INR' } },
    { upsert: true, new: true }
  );

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: TEST_PASS });
  userToken = login.body.data?.accessToken;
}, 30000);

afterAll(async () => {
  await Wallet.deleteMany({ userId: user?._id });
  await User.deleteMany({ _id: user?._id });
  await flushRateLimits();
});

describe('Notification Preferences', () => {

  test('User.toJSON() does NOT strip notificationPreferences', async () => {
    const fresh = await User.findById(user._id);
    const json = fresh.toJSON();
    expect(json.notificationPreferences).toBeDefined();
    expect(json.notificationPreferences.TRANSFER_SENT).toEqual({ email: true, inApp: true });
  });

  test('GET /api/auth/notification-preferences returns the 4 wired defaults', async () => {
    const res = await request(app)
      .get('/api/auth/notification-preferences')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      TRANSFER_SENT: { email: true, inApp: true },
      MONEY_RECEIVED: { email: true, inApp: true },
      LOW_BALANCE_ALERT: { email: true, inApp: true },
      DISPUTE_RAISED: { email: true, inApp: true }
    });
  });

  test('PUT updates preferences and persists across a fresh GET', async () => {
    const putRes = await request(app)
      .put('/api/auth/notification-preferences')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        TRANSFER_SENT: { email: false, inApp: true },
        MONEY_RECEIVED: { email: true, inApp: true },
        LOW_BALANCE_ALERT: { email: true, inApp: true },
        DISPUTE_RAISED: { email: true, inApp: true }
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.data.TRANSFER_SENT).toEqual({ email: false, inApp: true });

    const getRes = await request(app)
      .get('/api/auth/notification-preferences')
      .set('Authorization', `Bearer ${userToken}`);

    expect(getRes.body.data.TRANSFER_SENT).toEqual({ email: false, inApp: true });
  });

  test('PUT rejects an unknown event type', async () => {
    const res = await request(app)
      .put('/api/auth/notification-preferences')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ NOT_A_REAL_EVENT: { email: true, inApp: true } });

    expect(res.status).toBe(400);
  });

  test('PUT rejects a malformed preference value', async () => {
    const res = await request(app)
      .put('/api/auth/notification-preferences')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ TRANSFER_SENT: { email: 'yes' } });

    expect(res.status).toBe(400);
  });

  test('unauthenticated requests are rejected', async () => {
    const res = await request(app).get('/api/auth/notification-preferences');
    expect(res.status).toBe(401);
  });

});
