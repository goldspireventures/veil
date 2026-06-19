import { timingSafeEqual, createHash } from 'node:crypto';
import { getPool } from './db.mjs';
import { httpError } from './org-service.mjs';

const MAX_CLIENT_BATCH = 25;
const MAX_MESSAGE_LEN = 240;
const ALLOWED_KINDS = new Set([
  'client_error',
  'sync_failure',
  'org_revoked',
  'event_upload_failure',
  'health',
  'notice',
]);

const BLOCKED_META_KEYS = ['passphrase', 'secret', 'token_value', 'plaintext', 'matchedtext', 'payload'];

let lastHealthState = 'unknown';

function safeEqual(expected, provided) {
  const a = createHash('sha256').update(String(expected || '')).digest();
  const b = createHash('sha256').update(String(provided || '')).digest();
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyOpsToken(expected, provided) {
  const exp = String(expected || '').trim();
  const got = String(provided || '').trim();
  if (!exp || !got) return false;
  return safeEqual(exp, got);
}

export function verifyClientIngestKey(env, req) {
  const expected = String(env.OPS_CLIENT_INGEST_KEY || process.env.OPS_CLIENT_INGEST_KEY || '').trim();
  if (!expected) return true;
  const provided = String(req.headers['x-ops-ingest-key'] || '').trim();
  return safeEqual(expected, provided);
}

function sanitizeMeta(meta = {}) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    const k = String(key).slice(0, 32);
    if (BLOCKED_META_KEYS.some((blocked) => k.toLowerCase().includes(blocked))) continue;
    if (typeof value === 'string') out[k] = value.slice(0, 120);
    else if (typeof value === 'number' || typeof value === 'boolean') out[k] = value;
  }
  return out;
}

function sanitizeClientEvent(raw = {}) {
  const kind = String(raw.kind || raw.type || 'client_error').toLowerCase();
  return {
    eventAt: Number(raw.at) > 0 ? new Date(Number(raw.at)) : new Date(),
    kind: ALLOWED_KINDS.has(kind) ? kind : 'client_error',
    code: String(raw.code || '').slice(0, 64),
    message: String(raw.message || '').slice(0, MAX_MESSAGE_LEN),
    source: String(raw.source || '').slice(0, 32),
    extensionVersion: String(raw.extensionVersion || raw.version || '').slice(0, 24),
    browser: String(raw.browser || '').slice(0, 32),
    host: String(raw.host || '').slice(0, 253),
    meta: sanitizeMeta(raw.meta),
  };
}

async function logHealthTransition({ ok, dbOk, version }) {
  const state = ok && dbOk ? 'ok' : dbOk ? 'degraded' : 'db_down';
  if (state === lastHealthState) return;
  lastHealthState = state;
  const pool = getPool();
  await pool.query(
    `INSERT INTO platform_ops_events (event_at, kind, code, message, source, extension_version, browser, host, meta)
     VALUES (now(), 'health', $1, $2, 'api', $3, '', '', '{}'::jsonb)`,
    [state === 'ok' ? 'ok' : 'degraded', state, String(version || '').slice(0, 24)],
  );
}

export async function recordHealthCheck({ ok, dbOk, version, uptimeSec }) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO platform_health_checks (ok, db_ok, version, uptime_sec)
     VALUES ($1, $2, $3, $4)`,
    [Boolean(ok), Boolean(dbOk), String(version || '').slice(0, 24), Math.max(0, Number(uptimeSec) || 0)],
  );
  await logHealthTransition({ ok, dbOk, version });
}

export async function ingestClientEvents(events = []) {
  const list = Array.isArray(events) ? events.slice(0, MAX_CLIENT_BATCH) : [];
  if (list.length === 0) return { ingested: 0 };

  const pool = getPool();
  let ingested = 0;

  for (const raw of list) {
    const row = sanitizeClientEvent(raw);
    const blob = JSON.stringify({ ...row, meta: row.meta }).toLowerCase();
    if (BLOCKED_META_KEYS.some((key) => blob.includes(key))) {
      throw httpError(400, 'Ops events must not include secrets or matched content.');
    }
    await pool.query(
      `INSERT INTO platform_ops_events
        (event_at, kind, code, message, source, extension_version, browser, host, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        row.eventAt,
        row.kind,
        row.code,
        row.message,
        row.source,
        row.extensionVersion,
        row.browser,
        row.host,
        JSON.stringify(row.meta),
      ],
    );
    ingested += 1;
  }

  return { ingested };
}

export async function getOpsSummary(days = 7) {
  const windowDays = Math.min(30, Math.max(1, Number(days) || 7));
  const pool = getPool();
  const windowParam = String(windowDays);

  const [
    health,
    eventsByKind,
    recent,
    securityVolume,
    availability,
    extensionVersions,
    apiErrors,
    apiLatency,
    synthetic,
    alerts,
    orgStats,
  ] = await Promise.all([
    pool.query(
      `SELECT checked_at, ok, db_ok, version, uptime_sec
       FROM platform_health_checks
       ORDER BY checked_at DESC
       LIMIT 96`,
    ),
    pool.query(
      `SELECT kind, COUNT(*)::int AS count
       FROM platform_ops_events
       WHERE event_at >= now() - ($1::text || ' days')::interval
         AND kind <> 'health'
       GROUP BY kind
       ORDER BY count DESC`,
      [windowParam],
    ),
    pool.query(
      `SELECT event_at, kind, code, message, source, extension_version, browser, host
       FROM platform_ops_events
       WHERE event_at >= now() - ($1::text || ' days')::interval
       ORDER BY event_at DESC
       LIMIT 100`,
      [windowParam],
    ),
    pool.query(
      `SELECT date_trunc('day', event_at) AS day, COUNT(*)::int AS count
       FROM security_events
       WHERE event_at >= now() - ($1::text || ' days')::interval
       GROUP BY 1
       ORDER BY 1 DESC`,
      [windowParam],
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS samples,
         COUNT(*) FILTER (WHERE ok AND db_ok)::int AS healthy,
         ROUND(
           100.0 * COUNT(*) FILTER (WHERE ok AND db_ok) / NULLIF(COUNT(*), 0),
           2
         ) AS availability_pct
       FROM platform_health_checks
       WHERE checked_at >= now() - ($1::text || ' days')::interval`,
      [windowParam],
    ),
    pool.query(
      `SELECT extension_version, browser, COUNT(*)::int AS count
       FROM platform_ops_events
       WHERE event_at >= now() - ($1::text || ' days')::interval
         AND extension_version <> ''
       GROUP BY extension_version, browser
       ORDER BY count DESC
       LIMIT 20`,
      [windowParam],
    ),
    pool.query(
      `SELECT route, SUM(count_5xx)::int AS errors, SUM(request_count)::int AS requests
       FROM platform_api_metrics
       WHERE bucket_start >= now() - ($1::text || ' days')::interval
       GROUP BY route
       HAVING SUM(count_5xx) > 0
       ORDER BY errors DESC
       LIMIT 20`,
      [windowParam],
    ),
    pool.query(
      `SELECT route,
         SUM(request_count)::int AS requests,
         SUM(count_5xx)::int AS errors,
         ROUND(SUM(latency_total_ms)::numeric / NULLIF(SUM(request_count), 0), 1) AS avg_ms
       FROM platform_api_metrics
       WHERE bucket_start >= now() - ($1::text || ' days')::interval
       GROUP BY route
       ORDER BY requests DESC
       LIMIT 15`,
      [windowParam],
    ),
    pool.query(
      `SELECT DISTINCT ON (target_name)
         target_name, target_url, ok, status_code, latency_ms, message, checked_at
       FROM platform_synthetic_checks
       ORDER BY target_name, checked_at DESC`,
    ),
    pool.query(
      `SELECT alerted_at, alert_key, severity, title, body, delivered
       FROM platform_alert_log
       ORDER BY alerted_at DESC
       LIMIT 20`,
    ),
    pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM organizations) AS org_count,
         (SELECT COUNT(*)::int FROM device_provisions WHERE revoked_at IS NULL) AS active_devices,
         (SELECT COUNT(*)::int FROM org_members WHERE active = true) AS active_members`,
    ),
  ]);

  return {
    windowDays,
    availability: availability.rows[0] || { samples: 0, healthy: 0, availability_pct: null },
    orgStats: orgStats.rows[0] || { org_count: 0, active_devices: 0, active_members: 0 },
    health: health.rows,
    eventsByKind: eventsByKind.rows,
    recentEvents: recent.rows,
    securityEventsByDay: securityVolume.rows,
    extensionVersions: extensionVersions.rows,
    apiErrorsByRoute: apiErrors.rows,
    apiLatencyByRoute: apiLatency.rows,
    syntheticChecks: synthetic.rows,
    recentAlerts: alerts.rows,
  };
}

export async function pingDatabase() {
  const pool = getPool();
  await pool.query('SELECT 1');
  return true;
}

let lastHealthRecordedAt = 0;
const HEALTH_RECORD_INTERVAL_MS = 5 * 60 * 1000;

export async function maybeRecordHealthCheck(payload) {
  const now = Date.now();
  if (now - lastHealthRecordedAt < HEALTH_RECORD_INTERVAL_MS) return;
  lastHealthRecordedAt = now;
  await recordHealthCheck(payload);
}
