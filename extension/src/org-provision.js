/**
 * Cloud organization provisioning — join codes, SSO callback, policy sync.
 * Enterprise MDM uses managed-policy.js instead; this module is the self-serve lane.
 */
(function (global) {
  const DEVICE_ID_KEY = 'gstOrgDeviceId';
  const PROVISION_TOKEN_KEY = 'gstOrgProvisionToken';

  function browser() {
    return global.GoldspireBrowser;
  }

  function apiBase() {
    return (global.GoldspireConstants?.ORG_API_BASE || '').replace(/\/$/, '');
  }

  function portalUrl() {
    return global.GoldspireConstants?.ORG_PORTAL_URL || '';
  }

  async function storageGet(area, defaults) {
    const gst = browser();
    if (gst?.storageGet) return gst.storageGet(area, defaults);
    return { ...defaults };
  }

  async function getDeviceId() {
    const stored = await storageGet('local', { [DEVICE_ID_KEY]: '' });
    if (stored[DEVICE_ID_KEY]) return stored[DEVICE_ID_KEY];

    const id = crypto.randomUUID();
    await new Promise((resolve) => {
      browser()?.storage?.local?.set?.({ [DEVICE_ID_KEY]: id }, resolve);
    });
    return id;
  }

  async function saveProvisionToken(token) {
    if (!token?.trim()) {
      await new Promise((resolve) => {
        browser()?.storage?.local?.remove?.(PROVISION_TOKEN_KEY, resolve);
      });
      return;
    }
    const encrypted = await global.GoldspireSecrets?.encryptForStorage?.(token.trim());
    if (!encrypted) return;
    await new Promise((resolve) => {
      browser()?.storage?.local?.set?.({ [PROVISION_TOKEN_KEY]: encrypted }, resolve);
    });
  }

  async function loadProvisionToken() {
    const stored = await storageGet('local', { [PROVISION_TOKEN_KEY]: '' });
    if (!stored[PROVISION_TOKEN_KEY]) return '';
    try {
      return (await global.GoldspireSecrets?.decryptFromStorage?.(stored[PROVISION_TOKEN_KEY])) || '';
    } catch {
      return '';
    }
  }

  function normalizePolicyPayload(payload = {}) {
    const settings = payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
    return {
      orgId: String(payload.orgId || settings.orgId || '').trim(),
      orgDisplayName: String(payload.orgDisplayName || settings.orgDisplayName || '').trim(),
      teamPassphrase: String(payload.teamPassphrase || '').trim(),
      policyVersion: Number(payload.policyVersion) || 0,
      provisionToken: String(payload.provisionToken || '').trim(),
      passphraseFromVault: settings.passphraseFromVault === true,
      useSavedPassphrase: settings.useSavedPassphrase !== false,
      defaultSecureMode: settings.defaultSecureMode === 'one-time' ? 'one-time' : 'team',
      enforceStrongPassphrase: settings.enforceStrongPassphrase !== false,
      resecureDelaySeconds: settings.resecureDelaySeconds,
    };
  }

  async function writeSyncSettings(patch) {
    const gst = browser();
    if (!gst?.storage?.sync?.get || !gst?.storage?.sync?.set) return;

    const defaults = global.GoldspireSettings?.DEFAULT_SETTINGS || {};
    const current = await storageGet('sync', { ...defaults });
    const merged = global.GoldspireSettings?.migrate?.({ ...current, ...patch }) || { ...current, ...patch };
    await new Promise((resolve) => {
      gst.storage.sync.set(merged, () => resolve());
    });
  }

  async function applyProvisionPayload(rawPayload) {
    const payload = normalizePolicyPayload(rawPayload);
    if (!payload.orgId) {
      throw new Error('Invalid organization response.');
    }

    const patch = {
      securityProfile: 'organization',
      setupComplete: true,
      orgProvisionSource: 'cloud',
      orgId: payload.orgId,
      orgDisplayName: payload.orgDisplayName,
      orgPolicyVersion: payload.policyVersion,
      passphraseFromVault: payload.passphraseFromVault,
      useSavedPassphrase: payload.useSavedPassphrase,
      defaultSecureMode: payload.defaultSecureMode,
      enforceStrongPassphrase: payload.enforceStrongPassphrase,
    };

    if (payload.resecureDelaySeconds != null) {
      patch.resecureDelaySeconds = payload.resecureDelaySeconds;
    }

    if (payload.provisionToken) {
      await saveProvisionToken(payload.provisionToken);
    }

    if (payload.teamPassphrase) {
      await global.GoldspireSecrets?.savePassphrase?.(payload.teamPassphrase, 'organization');
      patch.useSavedPassphrase = true;
      patch.passphraseFromVault = false;
    }

    await writeSyncSettings(patch);
    return { ok: true, orgId: payload.orgId, orgDisplayName: payload.orgDisplayName };
  }

  function apiFetchError(base, error) {
    if (error?.message === 'Failed to fetch' || error?.name === 'TypeError') {
      return new Error(
        `Cannot reach organization server at ${base}. Start it with npm run api:dev, then try Connect again.`,
      );
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  async function joinWithCode(joinCode) {
    const code = String(joinCode || '').trim();
    if (!code) throw new Error('Enter your organization join code.');

    const base = apiBase();
    if (!base) {
      throw new Error('Cloud join is not live yet. Use a company-managed browser, or ask your admin for deployment instructions.');
    }

    const deviceId = await getDeviceId();
    let response;
    try {
      response = await fetch(`${base}/v1/extension/org/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': deviceId,
          'X-Extension-Version': browser()?.runtime?.getManifest?.()?.version || '',
        },
        body: JSON.stringify({ joinCode: code, deviceId }),
      });
    } catch (error) {
      throw apiFetchError(base, error);
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || body.error || `Join failed (${response.status}).`);
    }

    const data = await response.json();
    return applyProvisionPayload(data);
  }

  function buildSignInUrl() {
    const portal = portalUrl();
    if (!portal) return '';
    const url = new URL(portal);
    return url.toString();
  }

  async function openSignIn() {
    const deviceId = await getDeviceId();
    const portal = portalUrl();
    if (!portal) {
      throw new Error('Organization sign-in is not configured yet.');
    }

    const url = new URL(portal);
    url.searchParams.set('device_id', deviceId);
    const base = apiBase();
    if (base) url.searchParams.set('api', base);
    const extensionId = browser()?.runtime?.id;
    if (extensionId) url.searchParams.set('extension_id', extensionId);

    await browser()?.tabs?.create?.({ url: url.toString() });
    return { opened: true, url: url.toString() };
  }

  async function syncOrgPolicy() {
    const base = apiBase();
    const token = await loadProvisionToken();
    if (!base || !token) return { synced: false, reason: 'not_provisioned' };

    const settings = await storageGet('sync', {
      orgProvisionSource: '',
      orgPolicyVersion: 0,
      orgId: '',
    });

    if (settings.orgProvisionSource !== 'cloud' || !settings.orgId) {
      return { synced: false, reason: 'not_cloud' };
    }

    const deviceId = await getDeviceId();
    let response;
    try {
      response = await fetch(`${base}/v1/extension/org/sync`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Device-Id': deviceId,
          'X-Policy-Version': String(settings.orgPolicyVersion || 0),
          'X-Extension-Version': browser()?.runtime?.getManifest?.()?.version || '',
        },
      });
    } catch (error) {
      throw apiFetchError(base, error);
    }

    if (response.status === 304) return { synced: true, unchanged: true };
    if (response.status === 401) {
      await disconnectOrg();
      return { synced: false, reason: 'revoked' };
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || body.error || `Sync failed (${response.status}).`);
    }

    const data = await response.json();
    await applyProvisionPayload({
      ...data,
      orgId: data.orgId || settings.orgId,
      provisionToken: data.provisionToken || token,
    });
    return { synced: true, policyVersion: data.policyVersion };
  }

  async function disconnectOrg() {
    await saveProvisionToken('');
    await global.GoldspireSecrets?.savePassphrase?.('', 'organization');
    await writeSyncSettings({
      orgProvisionSource: '',
      orgId: '',
      orgDisplayName: '',
      orgPolicyVersion: 0,
      setupComplete: false,
      securityProfile: 'personal',
    });
    return { ok: true };
  }

  async function isCloudProvisioned() {
    const settings = await storageGet('sync', { orgProvisionSource: '', orgId: '' });
    return settings.orgProvisionSource === 'cloud' && Boolean(settings.orgId);
  }

  function handleExternalProvision(message, sender) {
    if (message?.type !== 'ORG_PROVISION' || !message?.payload) return false;
    const allowed = global.GoldspireConstants?.ORG_PORTAL_URL || '';
    if (allowed && sender?.url) {
      try {
        const origin = new URL(sender.url).origin;
        const allowedOrigin = new URL(allowed).origin;
        if (origin !== allowedOrigin) return false;
      } catch {
        return false;
      }
    }
    return applyProvisionPayload(message.payload);
  }

  global.GoldspireOrgProvision = {
    getDeviceId,
    loadProvisionToken,
    joinWithCode,
    openSignIn,
    buildSignInUrl,
    syncOrgPolicy,
    applyProvisionPayload,
    disconnectOrg,
    isCloudProvisioned,
    handleExternalProvision,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
