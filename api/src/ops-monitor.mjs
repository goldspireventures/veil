import { getPool } from './db.mjs';
import { pingDatabase, maybeRecordHealthCheck } from './ops-service.mjs';
import { raiseOpsAlert } from './ops-alerts.mjs';

function portalOrigin(env) {
  const raw = env.ORG_PORTAL_URL || '';
  try {
    return new URL(raw).origin;
  } catch {
    return String(env.PORTAL_ORIGIN || '').replace(/\/$/, '');
  }
}

function apiBase(env) {
  return String(env.ORG_API_BASE || env.API_PUBLIC_URL || '').replace(/\/$/, '');
}

async function probeUrl(name, url) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    const latencyMs = Date.now() - started;
    const ok = response.status >= 200 && response.status < 400;
    return {
      targetName: name,
      targetUrl: url,
      ok,
      statusCode: response.status,
      latencyMs,
      message: ok ? 'ok' : `http_${response.status}`,
    };
  } catch (error) {
    return {
      targetName: name,
      targetUrl: url,
      ok: false,
      statusCode: null,
      latencyMs: Date.now() - started,
      message: String(error?.message || error).slice(0, 200),
    };
  }
}

export async function recordSyntheticCheck(result) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO platform_synthetic_checks
      (target_name, target_url, ok, status_code, latency_ms, message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      result.targetName,
      result.targetUrl,
      Boolean(result.ok),
      result.statusCode,
      result.latencyMs,
      result.message,
    ],
  );
}

export async function runSyntheticChecks(env) {
  const origin = portalOrigin(env);
  const api = apiBase(env);
  const targets = [];
  if (origin) {
    targets.push(['portal_join', `${origin}/join.html`]);
    targets.push(['portal_index', `${origin}/`]);
  }
  if (api) {
    targets.push(['api_health', `${api}/health`]);
  }

  const results = [];
  for (const [name, url] of targets) {
    const result = await probeUrl(name, url);
    await recordSyntheticCheck(result);
    results.push(result);
    if (!result.ok) {
      await raiseOpsAlert({
        key: `synthetic_${name}`,
        severity: 'error',
        title: `Veil synthetic check failed: ${name}`,
        body: `${url} — ${result.message}`,
        env,
      });
    }
  }
  return results;
}

export async function runInternalHealthSample(env, { version, uptimeSec }) {
  let dbOk = false;
  try {
    await pingDatabase();
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const ok = dbOk;
  await maybeRecordHealthCheck({ ok, dbOk, version, uptimeSec });
  if (!dbOk) {
    await raiseOpsAlert({
      key: 'db_down',
      severity: 'critical',
      title: 'Veil API database unreachable',
      body: 'Internal health sample could not ping the database.',
      env,
    });
  }
  return { ok, dbOk };
}

export function startOpsMonitor(env, { version, uptimeSec }) {
  const intervalMs = 5 * 60 * 1000;
  const tick = async () => {
    const uptime = typeof uptimeSec === 'function' ? uptimeSec() : uptimeSec;
    await runInternalHealthSample(env, { version, uptimeSec: uptime }).catch((error) => {
      console.error('internal health sample failed', error);
    });
    await runSyntheticChecks(env).catch((error) => {
      console.error('synthetic checks failed', error);
    });
  };
  setTimeout(tick, 10_000).unref?.();
  setInterval(tick, intervalMs).unref?.();
}
