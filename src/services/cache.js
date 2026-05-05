const PREFIX = 'finagent:';

export const TTL = {
  market: 90 * 1000,
  gemini: 12 * 60 * 1000
};

export const cacheKey = (kind, ...parts) => `${PREFIX}${kind}:${parts.join(':')}`;

export const cacheGet = (key, ttl) => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { ts, value } = JSON.parse(raw);
    if (Date.now() - ts > ttl) {
      sessionStorage.removeItem(key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
};

export const cacheSet = (key, value) => {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), value }));
  } catch {
    // sessionStorage full or unavailable — silently skip
  }
};

export const hashString = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
};
