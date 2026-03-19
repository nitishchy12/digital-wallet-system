const crypto = require('crypto');

const hashRefreshToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

const safeTokenEqual = (input, storedHash) => {
  const inputHash = hashRefreshToken(input);

  if (!storedHash || inputHash.length !== storedHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(storedHash));
};

module.exports = {
  hashRefreshToken,
  safeTokenEqual
};
