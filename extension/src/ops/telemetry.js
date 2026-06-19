/**
 * Lightweight client ops telemetry — metadata only, batched to Veil API.
 */
(function (global) {
  const STORAGE_KEY = 'gstOpsTelemetryQueue';
  const CURSOR_KEY = 'gstOpsTelemetryCursor';
  const MAX_LOCAL = 80;
  const MAX_BATCH = 20;

  function apiBase() {
    return (global.GoldspireConstants?.ORG_API_BASE || '').replace(/\/$/, '');
  }

  function extensionVersion() {
    return global.GoldspireBrowser?.api?.runtime?.getManifest?.()?.version || '';
  }

  function detectBrowser() {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/Edg\//i.test(ua)) return 'edge';
    if (/Firefox\//i.test(ua)) return 'firefox';
    if (/Chrome\//i.test(ua)) return 'chrome';
    return 'unknown';
  }

  async function storageGet(defaults) {
    const gst = global.GoldspireBrowser;
    if (gst?.storageGet) return gst.storageGet('local', defaults);
    return { ...defaults };
  }

  async function storageSet(data) {
    const gst = global.GoldspireBrowser;
    if (!gst?.storage?.local?.set) return;
    await new Promise((resolve) => {
      gst.storage.local.set(data, resolve);
    });
  }

  function sanitizeEntry(entry = {}) {
    return {
      at: Number(entry.at) || Date.now(),
      kind: String(entry.kind || 'client_error').slice(0, 32),
      code: String(entry.code || '').slice(0, 64),
      message: String(entry.message || '').slice(0, 200),
      source: String(entry.source || '').slice(0, 32),
      extensionVersion: extensionVersion(),
      browser: detectBrowser(),
      host: String(entry.host || '').slice(0, 253),
      meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : {},
    };
  }

  async function report(entry = {}) {
    const row = sanitizeEntry(entry);
    const stored = await storageGet({ [STORAGE_KEY]: [] });
    const queue = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
    queue.push(row);
    await storageSet({ [STORAGE_KEY]: queue.slice(-MAX_LOCAL) });
    return row;
  }

  async function flush() {
    const base = apiBase();
    if (!base) return { ok: false, reason: 'no_api' };

    const stored = await storageGet({ [STORAGE_KEY]: [], [CURSOR_KEY]: 0 });
    const queue = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
    const cursor = Number(stored[CURSOR_KEY]) || 0;
    const pending = queue.filter((row) => Number(row.at) > cursor).slice(0, MAX_BATCH);
    if (pending.length === 0) return { ok: true, uploaded: 0 };

    let response;
    try {
      response = await fetch(`${base}/v1/ops/client-events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Extension-Version': extensionVersion(),
          'X-Ops-Ingest-Key': global.GoldspireConstants?.OPS_CLIENT_INGEST_KEY || '',
        },
        body: JSON.stringify({ events: pending }),
      });
    } catch (error) {
      return { ok: false, reason: 'network', error: String(error?.message || error) };
    }

    if (!response.ok) {
      return { ok: false, reason: 'api_error', status: response.status };
    }

    const maxAt = pending.reduce((max, row) => Math.max(max, Number(row.at) || 0), 0);
    await storageSet({ [CURSOR_KEY]: Math.max(cursor, maxAt) });
    const body = await response.json().catch(() => ({}));
    return { ok: true, uploaded: body.ingested ?? pending.length };
  }

  global.GoldspireOpsTelemetry = {
    report,
    flush,
    STORAGE_KEY,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
