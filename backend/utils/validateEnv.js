// Purpose: Validate required environment variables on startup — fail fast with a clear error list
// Dependencies: none
// Used by: server.js (first thing called after dotenv.config())

const REQUIRED = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'MONGODB_URI'];

const RECOMMENDED = ['EMAIL_USER', 'EMAIL_PASS', 'REDIS_HOST'];

const validateEnv = () => {
  // Jest sets NODE_ENV=test. Skip validation so CI doesn't need a real .env file.
  if (process.env.NODE_ENV === 'test') return;

  const missing = REQUIRED.filter((k) => !process.env[k]);

  if (missing.length > 0) {
    console.error('\n❌ FATAL: Missing required environment variables:');
    missing.forEach((k) => console.error(`   - ${k}`));
    console.error('\nSet these in your backend/.env file and restart.\n');
    process.exit(1);
  }

  // In production, reject weak secrets
  if (process.env.NODE_ENV === 'production') {
    const weak = [];
    if (process.env.JWT_SECRET.length < 32) weak.push('JWT_SECRET (must be ≥ 32 chars)');
    if (process.env.JWT_REFRESH_SECRET.length < 32) weak.push('JWT_REFRESH_SECRET (must be ≥ 32 chars)');
    if (weak.length > 0) {
      console.error('\n❌ FATAL: Weak secrets detected in production:');
      weak.forEach((k) => console.error(`   - ${k}`));
      process.exit(1);
    }
  }

  // Warn about recommended vars (non-fatal)
  const absent = RECOMMENDED.filter((k) => !process.env[k]);
  if (absent.length > 0) {
    console.warn(`\n⚠️  WARNING: Recommended env vars not set: ${absent.join(', ')}`);
    console.warn('   Some features (email, caching, rate limiting) may be degraded.\n');
  }
};

module.exports = validateEnv;
