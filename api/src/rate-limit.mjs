/**
 * In-memory sliding-window rate limiter (per IP + route bucket).
 */
const windows = new Map();

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function pruneBucket(bucket, now, windowMs) {
  const cutoff = now - windowMs;
  while (bucket.length && bucket[0] <= cutoff) bucket.shift();
}

export function checkRateLimit(req, routeKey, { limit = 60, windowMs = 60_000 } = {}) {
  const ip = clientIp(req);
  const key = `${ip}:${routeKey}`;
  const now = Date.now();
  let bucket = windows.get(key);
  if (!bucket) {
    bucket = [];
    windows.set(key, bucket);
  }
  pruneBucket(bucket, now, windowMs);
  if (bucket.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket[0] + windowMs - now) / 1000));
    return { allowed: false, retryAfterSec, remaining: 0 };
  }
  bucket.push(now);
  return { allowed: true, retryAfterSec: 0, remaining: Math.max(0, limit - bucket.length) };
}

export function rateLimitResponse(res, req, retryAfterSec) {
  const payload = JSON.stringify({
    error: 'Too many requests.',
    message: 'Rate limit exceeded. Try again later.',
    retryAfterSec,
  });
  res.writeHead(429, {
    ...((req && typeof req === 'object') ? {} : {}),
    'Content-Type': 'application/json; charset=utf-8',
    'Retry-After': String(retryAfterSec),
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}
