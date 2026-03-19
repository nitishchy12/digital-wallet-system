export const generateIdempotencyKey = (prefix = 'req') => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};
