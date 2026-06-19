import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../../scripts/load-env.mjs';
import { closePool } from './db.mjs';
import { joinWithCode, syncPolicy, httpError } from './org-service.mjs';
import {
  registerMember,
  listMembers,
  createShares,
  listPendingShares,
  claimShare,
  lookupUnlockKey,
} from './share-service.mjs';
import { parseAuthHeaders } from './auth.mjs';
import {
  authenticateAdmin,
  createOrganization,
  getOrganization,
  updateOrganization,
  listJoinCodes,
  createJoinCode,
  setJoinCodeActive,
  listMembersAdmin,
  listDevices,
  revokeDevice,
  deactivateMember,
  addOrgMember,
} from './admin-service.mjs';
import { ingestExtensionEvents, getSecurityEventSummary, exportSecurityEvents } from './events-service.mjs';
import { createSecureToken } from './token-service.mjs';
import {
  listTeams,
  createTeam,
  updateTeam,
  assignMemberTeam,
} from './teams-service.mjs';
import { handleStripeWebhook } from './stripe-service.mjs';
import {
  ingestClientEvents,
  getOpsSummary,
  pingDatabase,
  verifyOpsToken,
  verifyClientIngestKey,
} from './ops-service.mjs';
import { checkRateLimit } from './rate-limit.mjs';
import { normalizeRoute, recordRequestMetric, flushRequestMetrics } from './request-metrics.mjs';
import { raiseOpsAlert } from './ops-alerts.mjs';
import { startOpsMonitor } from './ops-monitor.mjs';

const SERVER_STARTED_AT = Date.now();
const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(apiRoot, 'public');
const env = loadEnv();
// Railway (and most PaaS) expose the listening port via PORT.
const port = Number(process.env.PORT || env.PORT || env.API_PORT) || 3015;

function parseAllowedOrigins() {
  const raw = String(env.CORS_ALLOW_ORIGINS || '').trim();
  const values = raw
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  // IMPORTANT: If unset, CORS is effectively disabled (no Access-Control-Allow-Origin).
  return new Set(values);
}

const ALLOWED_ORIGINS = parseAllowedOrigins();

function getCorsOrigin(req) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return '';
  return ALLOWED_ORIGINS.has(origin) ? origin : '';
}

function corsHeaders(req) {
  const allowOrigin = getCorsOrigin(req);
  if (!allowOrigin) return {};
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function json(res, req, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...corsHeaders(req),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Id, X-Policy-Version, X-Extension-Version',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  });
  res.end(payload);
}

function text(res, req, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    ...corsHeaders(req),
    'Content-Type': contentType,
  });
  res.end(body);
}

async function readRawBody(req, maxBytes = 256 * 1024) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  if (body.length > maxBytes) {
    throw httpError(413, 'Request body too large.');
  }
  return body;
}

async function readBody(req) {
  const body = await readRawBody(req);
  if (body.length === 0) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw httpError(400, 'Invalid JSON body.');
  }
}

function serveStatic(pathname, res, extraHeaders = {}) {
  const safePath = pathname.replace(/\.\./g, '');
  const filePath = join(publicDir, safePath === '/' ? 'join.html' : safePath);
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) return false;

  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
  };
  const body = readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': types[extname(filePath)] || 'application/octet-stream',
    ...extraHeaders,
  });
  res.end(body);
  return true;
}

function rejectPortalOpsOnApi(req, res, pathname) {
  const host = String(req.headers.host || '').toLowerCase();
  const portalHost = (() => {
    try {
      return new URL(env.ORG_PORTAL_URL || '').hostname.toLowerCase();
    } catch {
      return '';
    }
  })();
  if (pathname === '/ops.html' && portalHost && host === portalHost) {
    json(res, req, 404, { error: 'Not found' });
    return true;
  }
  return false;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;
  const requestStarted = Date.now();
  const routeKey = normalizeRoute(pathname);

  res.on('finish', () => {
    recordRequestMetric({
      method: req.method || 'GET',
      route: routeKey,
      status: res.statusCode || 500,
      durationMs: Date.now() - requestStarted,
    });
  });

  if (rejectPortalOpsOnApi(req, res, pathname)) return;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...corsHeaders(req),
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Id, X-Policy-Version, X-Extension-Version',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    });
    res.end();
    return;
  }

  try {
    if (req.method === 'GET' && pathname === '/health') {
      const version = process.env.npm_package_version || '1.2.3';
      let dbOk = false;
      try {
        await pingDatabase();
        dbOk = true;
      } catch (error) {
        console.error('health: database ping failed', error);
      }
      const uptimeSec = Math.floor((Date.now() - SERVER_STARTED_AT) / 1000);
      json(res, req, dbOk ? 200 : 503, {
        ok: dbOk,
        db: dbOk ? 'ok' : 'down',
        service: 'veil-api',
        version,
        uptimeSec,
        at: new Date().toISOString(),
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/ops/client-events') {
      const rl = checkRateLimit(req, 'ops-client-events', { limit: 40, windowMs: 60_000 });
      if (!rl.allowed) {
        json(res, req, 429, {
          error: 'Too many requests.',
          message: 'Rate limit exceeded.',
          retryAfterSec: rl.retryAfterSec,
        });
        return;
      }
      if (!verifyClientIngestKey(env, req)) {
        throw httpError(401, 'Invalid ingest key.');
      }
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        throw httpError(415, 'Content-Type must be application/json.');
      }
      const body = await readBody(req);
      const result = await ingestClientEvents(body.events);
      json(res, req, 200, result);
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/ops/summary') {
      const rl = checkRateLimit(req, 'ops-summary', { limit: 30, windowMs: 60_000 });
      if (!rl.allowed) {
        json(res, req, 429, {
          error: 'Too many requests.',
          message: 'Rate limit exceeded.',
          retryAfterSec: rl.retryAfterSec,
        });
        return;
      }
      const expected = String(env.PLATFORM_OPS_TOKEN || process.env.PLATFORM_OPS_TOKEN || '').trim();
      if (!expected) {
        throw httpError(503, 'Platform ops is not configured.');
      }
      const auth = String(req.headers.authorization || '');
      const match = auth.match(/^Bearer\s+(.+)$/i);
      const provided = match ? match[1].trim() : '';
      if (!verifyOpsToken(expected, provided)) {
        throw httpError(401, 'Invalid ops token.');
      }
      const days = url.searchParams.get('days') || '7';
      const result = await getOpsSummary(days);
      json(res, req, 200, result);
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/webhooks/stripe') {
      const signature = req.headers['stripe-signature'];
      if (!signature) {
        throw httpError(400, 'Missing Stripe-Signature header.');
      }
      const rawBody = await readRawBody(req, 512 * 1024);
      const result = await handleStripeWebhook(rawBody, signature, env);
      json(res, req, 200, result);
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/extension/org/join') {
      const rl = checkRateLimit(req, 'org-join', { limit: 20, windowMs: 60_000 });
      if (!rl.allowed) {
        json(res, req, 429, { error: 'Too many requests.', retryAfterSec: rl.retryAfterSec });
        return;
      }
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        throw httpError(415, 'Content-Type must be application/json.');
      }
      const body = await readBody(req);
      const deviceId = req.headers['x-device-id'] || body.deviceId;
      const payload = await joinWithCode(body.joinCode, deviceId, body.email);
      json(res, req, 200, payload);
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/extension/org/sync') {
      const { token, deviceId } = parseAuthHeaders(req);
      const clientVersion = req.headers['x-policy-version'];
      const result = await syncPolicy(token, deviceId, clientVersion);
      if (result.unchanged) {
        res.writeHead(304, corsHeaders(req));
        res.end();
        return;
      }
      json(res, req, 200, result.payload);
      return;
    }

    if (req.method === 'PUT' && pathname === '/v1/extension/org/member') {
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        throw httpError(415, 'Content-Type must be application/json.');
      }
      const { token, deviceId } = parseAuthHeaders(req);
      const body = await readBody(req);
      const result = await registerMember(token, deviceId, body);
      json(res, req, 200, result);
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/extension/org/members') {
      const { token, deviceId } = parseAuthHeaders(req);
      const query = url.searchParams.get('q') || '';
      const result = await listMembers(token, deviceId, query);
      json(res, req, 200, result);
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/extension/org/shares') {
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        throw httpError(415, 'Content-Type must be application/json.');
      }
      const { token, deviceId } = parseAuthHeaders(req);
      const body = await readBody(req);
      const result = await createShares(token, deviceId, body);
      json(res, req, 201, result);
      return;
    }

    const claimMatch = pathname.match(/^\/v1\/extension\/org\/shares\/([^/]+)\/claim$/);
    if (req.method === 'POST' && claimMatch) {
      const { token, deviceId } = parseAuthHeaders(req);
      const result = await claimShare(token, deviceId, claimMatch[1]);
      json(res, req, 200, result);
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/extension/org/shares/pending') {
      const { token, deviceId } = parseAuthHeaders(req);
      const result = await listPendingShares(token, deviceId);
      json(res, req, 200, result);
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/extension/org/shares/unlock-key') {
      const { token, deviceId } = parseAuthHeaders(req);
      const fingerprint = url.searchParams.get('fingerprint') || '';
      const result = await lookupUnlockKey(token, deviceId, fingerprint);
      json(res, req, 200, result);
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/extension/events') {
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        throw httpError(415, 'Content-Type must be application/json.');
      }
      const { token, deviceId } = parseAuthHeaders(req);
      const body = await readBody(req);
      const result = await ingestExtensionEvents(token, deviceId, body);
      json(res, req, 200, result);
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/extension/tokens') {
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        throw httpError(415, 'Content-Type must be application/json.');
      }
      const { token, deviceId } = parseAuthHeaders(req);
      const body = await readBody(req);
      const result = await createSecureToken(token, deviceId, body);
      json(res, req, 201, result);
      return;
    }

    const tokenResolveMatch = pathname.match(/^\/v1\/extension\/tokens\/([^/]+)$/);
    if (req.method === 'GET' && tokenResolveMatch) {
      const { token, deviceId } = parseAuthHeaders(req);
      const { peekSecureToken } = await import('./token-service.mjs');
      const result = await peekSecureToken(token, deviceId, decodeURIComponent(tokenResolveMatch[1]));
      json(res, req, 200, result);
      return;
    }

    const tokenConsumeMatch = pathname.match(/^\/v1\/extension\/tokens\/([^/]+)\/consume$/);
    if (req.method === 'POST' && tokenConsumeMatch) {
      const { token, deviceId } = parseAuthHeaders(req);
      const { consumeSecureToken } = await import('./token-service.mjs');
      const result = await consumeSecureToken(token, deviceId, decodeURIComponent(tokenConsumeMatch[1]));
      json(res, req, 200, result);
      return;
    }

    // --- Organization admin (self-serve console) ---

    if (req.method === 'POST' && pathname === '/v1/orgs') {
      const rl = checkRateLimit(req, 'org-create', { limit: 10, windowMs: 60_000 });
      if (!rl.allowed) {
        json(res, req, 429, { error: 'Too many requests.', retryAfterSec: rl.retryAfterSec });
        return;
      }
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        throw httpError(415, 'Content-Type must be application/json.');
      }
      const body = await readBody(req);
      const result = await createOrganization(body);
      json(res, req, 201, result);
      return;
    }

    if (pathname.startsWith('/v1/orgs/me')) {
      const admin = await authenticateAdmin(req);

      if (req.method === 'GET' && pathname === '/v1/orgs/me') {
        json(res, req, 200, await getOrganization(admin));
        return;
      }

      if (req.method === 'PATCH' && pathname === '/v1/orgs/me') {
        if (!String(req.headers['content-type'] || '').includes('application/json')) {
          throw httpError(415, 'Content-Type must be application/json.');
        }
        const body = await readBody(req);
        json(res, req, 200, await updateOrganization(admin, body));
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/orgs/me/join-codes') {
        json(res, req, 200, await listJoinCodes(admin));
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/orgs/me/join-codes') {
        const body = await readBody(req);
        json(res, req, 201, await createJoinCode(admin, body));
        return;
      }

      const joinCodeMatch = pathname.match(/^\/v1\/orgs\/me\/join-codes\/([^/]+)$/);
      if (req.method === 'PATCH' && joinCodeMatch) {
        const body = await readBody(req);
        const code = decodeURIComponent(joinCodeMatch[1]);
        json(res, req, 200, await setJoinCodeActive(admin, code, body.active !== false));
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/orgs/me/members') {
        json(res, req, 200, await listMembersAdmin(admin));
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/orgs/me/members') {
        const body = await readBody(req);
        json(res, req, 201, await addOrgMember(admin, body));
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/orgs/me/members/deactivate') {
        const body = await readBody(req);
        json(res, req, 200, await deactivateMember(admin, body.email));
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/orgs/me/devices') {
        json(res, req, 200, await listDevices(admin));
        return;
      }

      const revokeMatch = pathname.match(/^\/v1\/orgs\/me\/devices\/([^/]+)\/revoke$/);
      if (req.method === 'POST' && revokeMatch) {
        const deviceId = decodeURIComponent(revokeMatch[1]);
        json(res, req, 200, await revokeDevice(admin, deviceId));
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/orgs/me/security-events/summary') {
        const days = url.searchParams.get('days') || '30';
        json(res, req, 200, await getSecurityEventSummary(admin, { days }));
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/orgs/me/security-events/export') {
        const days = url.searchParams.get('days') || '30';
        const format = url.searchParams.get('format') || 'json';
        const exported = await exportSecurityEvents(admin, { days, format });
        if (exported.format === 'csv') {
          text(res, req, 200, exported.content, 'text/csv; charset=utf-8');
          return;
        }
        json(res, req, 200, exported);
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/orgs/me/teams') {
        json(res, req, 200, await listTeams(admin));
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/orgs/me/teams') {
        const body = await readBody(req);
        json(res, req, 201, await createTeam(admin, body));
        return;
      }

      const teamMatch = pathname.match(/^\/v1\/orgs\/me\/teams\/([^/]+)$/);
      if (req.method === 'PATCH' && teamMatch) {
        const body = await readBody(req);
        const teamId = decodeURIComponent(teamMatch[1]);
        json(res, req, 200, await updateTeam(admin, teamId, body));
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/orgs/me/teams/assign') {
        const body = await readBody(req);
        json(res, req, 200, await assignMemberTeam(admin, body));
        return;
      }
    }

    const joinPaths = ['/veil/join', '/secure-text/join'];
    if (
      req.method === 'GET'
      && joinPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
    ) {
      if (serveStatic('join.html', res)) return;
    }

    const portalPages = {
      '/': 'index.html',
      '/index.html': 'index.html',
      '/create.html': 'create.html',
      '/admin.html': 'admin.html',
      '/join.html': 'join.html',
      '/install.html': 'install.html',
      '/privacy.html': 'privacy.html',
      '/terms.html': 'terms.html',
      '/feedback.html': 'feedback.html',
      '/unlock.html': 'unlock.html',
    };
    if (req.method === 'GET' && portalPages[pathname]) {
      if (serveStatic(portalPages[pathname], res)) return;
    }

    if (req.method === 'GET' && pathname === '/ops.html') {
      const opsHeaders = {
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'DENY',
      };
      if (serveStatic('ops.html', res, opsHeaders)) return;
    }

    if (req.method === 'GET' && pathname.startsWith('/portal/')) {
      if (serveStatic(pathname.slice(1), res)) return;
    }

    if (req.method === 'GET' && (pathname.startsWith('/icons/') || pathname === '/unlock.css' || pathname === '/unlock.js')) {
      if (serveStatic(pathname.slice(1), res)) return;
    }

    if (req.method === 'GET' && pathname.startsWith('/public/')) {
      if (serveStatic(pathname.slice('/public/'.length), res)) return;
    }

    json(res, req, 404, { error: 'Not found' });
  } catch (err) {
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    if (status >= 500) {
      console.error(err);
      raiseOpsAlert({
        key: `api_5xx_${routeKey}`,
        severity: 'error',
        title: `Veil API ${status} on ${req.method} ${routeKey}`,
        body: message,
        env,
      }).catch(() => {});
    }
    json(res, req, status, { error: message, message });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Goldspire org API listening on port ${port}`);
  console.log(`Join portal: http://localhost:${port}/veil/join`);
  console.log(`Platform ops: http://localhost:${port}/ops.html`);
});

const API_VERSION = process.env.npm_package_version || '1.2.3';
startOpsMonitor(env, {
  version: API_VERSION,
  uptimeSec: () => Math.floor((Date.now() - SERVER_STARTED_AT) / 1000),
});

setInterval(() => {
  flushRequestMetrics().catch((error) => {
    console.error('request-metrics periodic flush failed', error);
  });
}, 60_000).unref?.();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await closePool();
    process.exit(0);
  });
}
