/**
 * Batch upload Veil metadata events to org API (no matched content).
 */
(function (global) {
  const CURSOR_KEY = 'gstVeilEventsCursor';
  const STORAGE_KEY = 'gstVeilEvents';
  const MAX_BATCH = 100;

  function apiBase() {
    return (global.GoldspireConstants?.ORG_API_BASE || '').replace(/\/$/, '');
  }

  async function storageGet(area, defaults) {
    const gst = global.GoldspireBrowser;
    if (gst?.storageGet) return gst.storageGet(area, defaults);
    return { ...defaults };
  }

  async function storageSet(area, data) {
    const gst = global.GoldspireBrowser;
    if (!gst?.storage?.[area]?.set) return;
    await new Promise((resolve) => {
      gst.storage[area].set(data, resolve);
    });
  }

  async function collectPendingEvents() {
    const { [STORAGE_KEY]: events = [], [CURSOR_KEY]: cursor = 0 } = await storageGet('local', {
      [STORAGE_KEY]: [],
      [CURSOR_KEY]: 0,
    });
    const list = Array.isArray(events) ? events : [];
    const since = Number(cursor) || 0;
    return list.filter((entry) => Number(entry?.at) > since).slice(0, MAX_BATCH);
  }

  async function uploadPendingEvents() {
    const base = apiBase();
    if (!base) return { ok: false, reason: 'no_api' };

    const token = await global.GoldspireOrgProvision?.loadProvisionToken?.();
    const deviceId = await global.GoldspireOrgProvision?.getDeviceId?.();
    if (!token || !deviceId) return { ok: false, reason: 'not_provisioned' };

    const settings = await global.GoldspireSettings?.load?.();
    const canUpload = global.GoldspireOrgCapability?.canUseCloudApi?.(settings)
      ?? (settings?.orgId && settings.orgProvisionSource === 'cloud');
    if (!canUpload) {
      return { ok: false, reason: 'not_cloud' };
    }

    const pending = await collectPendingEvents();
    if (pending.length === 0) return { ok: true, uploaded: 0 };

    const sanitized = pending.map((entry) => global.GoldspireVeilEvents?.sanitizeEntry?.(entry) || entry);

    let response;
    try {
      response = await fetch(`${base}/v1/extension/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Device-Id': deviceId,
          'X-Extension-Version': global.GoldspireBrowser?.api?.runtime?.getManifest?.()?.version || '',
        },
        body: JSON.stringify({ events: sanitized }),
      });
    } catch (error) {
      return { ok: false, reason: 'network', error: String(error?.message || error) };
    }

    if (response.status === 401) {
      await global.GoldspireOrgProvision?.disconnectOrg?.({ reason: 'revoked' });
      return { ok: false, reason: 'revoked' };
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return {
        ok: false,
        reason: 'api_error',
        status: response.status,
        message: body.message || body.error || 'Upload failed',
      };
    }

    const maxAt = pending.reduce((max, entry) => Math.max(max, Number(entry.at) || 0), 0);
    const { [CURSOR_KEY]: cursor = 0 } = await storageGet('local', { [CURSOR_KEY]: 0 });
    await storageSet('local', { [CURSOR_KEY]: Math.max(Number(cursor) || 0, maxAt) });

    const result = await response.json().catch(() => ({}));
    return { ok: true, uploaded: result.ingested ?? pending.length };
  }

  global.GoldspireVeilIngest = {
    uploadPendingEvents,
    collectPendingEvents,
    CURSOR_KEY,
    MAX_BATCH,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
