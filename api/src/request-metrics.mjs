import { getPool } from './db.mjs';

const pending = new Map();
const FLUSH_MS = 60_000;
let flushTimer = null;

export function normalizeRoute(pathname = '') {
  let route = String(pathname || '/').split('?')[0] || '/';
  route = route
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/[A-Za-z0-9_-]{21,}/g, '/:token')
    .replace(/\/\d+/g, '/:n');
  return route.slice(0, 120) || '/';
}

function bucketStart(date = new Date()) {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

export function recordRequestMetric({ method, route, status, durationMs }) {
  if (!method || !route) return;
  const bucket = bucketStart();
  const key = `${bucket}|${method} ${route}`;
  const row = pending.get(key) || {
    bucketStart: bucket,
    route: `${method} ${route}`,
    count2xx: 0,
    count4xx: 0,
    count5xx: 0,
    latencyTotalMs: 0,
    requestCount: 0,
  };
  const code = Number(status) || 500;
  if (code >= 500) row.count5xx += 1;
  else if (code >= 400) row.count4xx += 1;
  else row.count2xx += 1;
  row.latencyTotalMs += Math.max(0, Number(durationMs) || 0);
  row.requestCount += 1;
  pending.set(key, row);
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushRequestMetrics().catch((error) => {
      console.error('request-metrics flush failed', error);
    });
  }, FLUSH_MS);
  flushTimer.unref?.();
}

export async function flushRequestMetrics() {
  if (pending.size === 0) return;
  const batch = [...pending.values()];
  pending.clear();
  const pool = getPool();
  for (const row of batch) {
    await pool.query(
      `INSERT INTO platform_api_metrics
        (bucket_start, route, count_2xx, count_4xx, count_5xx, latency_total_ms, request_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (bucket_start, route) DO UPDATE SET
         count_2xx = platform_api_metrics.count_2xx + EXCLUDED.count_2xx,
         count_4xx = platform_api_metrics.count_4xx + EXCLUDED.count_4xx,
         count_5xx = platform_api_metrics.count_5xx + EXCLUDED.count_5xx,
         latency_total_ms = platform_api_metrics.latency_total_ms + EXCLUDED.latency_total_ms,
         request_count = platform_api_metrics.request_count + EXCLUDED.request_count`,
      [
        row.bucketStart,
        row.route,
        row.count2xx,
        row.count4xx,
        row.count5xx,
        row.latencyTotalMs,
        row.requestCount,
      ],
    );
  }
}
