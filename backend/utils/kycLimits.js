// Purpose: KYC tier limit definitions — single source of truth for all transfer limits
// Dependencies: none
// Used by: walletController.js, adminController.js, API responses to frontend

const KYC_LIMITS = {
  0: {
    label: 'Basic',
    description: 'Email verified only',
    perTransferLimit: 10000,
    dailyLimit: 10000,
    walletBalanceLimit: 10000
  },
  1: {
    label: 'Verified',
    description: 'Phone number verified',
    perTransferLimit: 50000,
    dailyLimit: 50000,
    walletBalanceLimit: 100000
  },
  2: {
    label: 'Full KYC',
    description: 'Documents approved',
    perTransferLimit: 200000,
    dailyLimit: 200000,
    walletBalanceLimit: 500000
  }
};

const getLimitsForTier = (tier) => KYC_LIMITS[tier] ?? KYC_LIMITS[0];

const checkPerTransferLimit = (tier, amount) => {
  const limits = getLimitsForTier(tier);
  if (amount > limits.perTransferLimit) {
    return {
      allowed: false,
      error: 'KYC_LIMIT_EXCEEDED',
      message: `Your KYC Tier ${tier} allows a maximum of Rs ${limits.perTransferLimit.toLocaleString('en-IN')} per transfer. Upgrade your KYC to send more.`,
      currentLimit: limits.perTransferLimit,
      currentTier: tier,
      // Determine the minimum tier that would allow this amount
      requiredTier: amount > KYC_LIMITS[1].perTransferLimit ? 2 : 1
    };
  }
  return { allowed: true };
};

const checkDailyLimit = (tier, alreadySpentToday, amount) => {
  const limits = getLimitsForTier(tier);
  if (alreadySpentToday + amount > limits.dailyLimit) {
    return {
      allowed: false,
      error: 'DAILY_LIMIT_EXCEEDED',
      message: `You have spent Rs ${alreadySpentToday.toLocaleString('en-IN')} today. Your daily limit is Rs ${limits.dailyLimit.toLocaleString('en-IN')}. Resets at midnight.`,
      dailyLimit: limits.dailyLimit,
      alreadySpent: alreadySpentToday,
      remainingToday: Math.max(0, limits.dailyLimit - alreadySpentToday)
    };
  }
  return { allowed: true };
};

module.exports = { KYC_LIMITS, getLimitsForTier, checkPerTransferLimit, checkDailyLimit };
