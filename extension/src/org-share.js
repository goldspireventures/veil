/**
 * Cloud org sharing — member directory, pending unlock inbox, key delivery.
 */
(function (global) {
  const PENDING_KEYS_STORAGE = 'gstPendingUnlockKeys';

  function browser() {
    return global.GoldspireBrowser;
  }

  function apiBase() {
    return (global.GoldspireConstants?.ORG_API_BASE || '').replace(/\/$/, '');
  }

  async function authHeaders() {
    const deviceId = await global.GoldspireOrgProvision.getDeviceId();
    const token = await loadProvisionToken();
    return {
      deviceId,
      token,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Device-Id': deviceId,
        'X-Extension-Version': browser()?.runtime?.getManifest?.()?.version || '',
      },
    };
  }

  async function loadProvisionToken() {
    return global.GoldspireOrgProvision.loadProvisionToken();
  }

  async function apiFetch(path, options = {}) {
    const base = apiBase();
    if (!base) throw new Error('Cloud sharing is not configured.');

    const auth = await authHeaders();
    if (!auth.token) throw new Error('Join your team to use sharing.');

    let response;
    try {
      response = await fetch(`${base}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...auth.headers,
          ...(options.headers || {}),
        },
      });
    } catch (error) {
      if (error?.message === 'Failed to fetch' || error?.name === 'TypeError') {
        throw new Error('Cannot reach the team server. Check your connection and try again.');
      }
      throw error;
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || body.error || `Request failed (${response.status}).`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  async function canLookupOrgShares() {
    const settings = await global.GoldspireSettings.load();
    if (global.GoldspireOrgCapability?.canUseCloudApi) {
      return global.GoldspireOrgCapability.canUseCloudApi(settings);
    }
    return Boolean(
      apiBase()
      && settings.orgProvisionSource === 'cloud'
      && settings.orgId,
    );
  }

  async function ensureMemberRegistered() {
    const settings = await global.GoldspireSettings.load();
    const email = String(settings.orgMemberEmail || '').trim();
    if (!email) return false;
    await registerMember(email);
    return true;
  }

  async function fetchUnlockKeyFromServer(fullMarker) {
    const fingerprints = global.GoldspireShareKeys.markerFingerprints
      ? await global.GoldspireShareKeys.markerFingerprints(fullMarker)
      : [await global.GoldspireShareKeys.markerFingerprint(fullMarker)];

    for (const fingerprint of fingerprints) {
      try {
        const result = await apiFetch(
          `/v1/extension/org/shares/unlock-key?fingerprint=${encodeURIComponent(fingerprint)}`,
        );
        if (!result?.unlockKey) continue;

        const map = await loadPendingKeyMap();
        map[fingerprint] = {
          key: result.unlockKey,
          shareId: result.shareId,
          expiresAt: new Date(result.expiresAt).getTime(),
        };
        await savePendingKeyMap(map);
        return result.unlockKey;
      } catch {
        // Try next fingerprint variant.
      }
    }
    return '';
  }

  async function isSharingAvailable() {
    const settings = await global.GoldspireSettings.load();
    return (await canLookupOrgShares()) && settings.setupComplete;
  }

  async function registerMember(email, displayName = '') {
    await global.GoldspireShareKeys.ensureKeyPair();
    const publicKeyJwk = await global.GoldspireShareKeys.getPublicJwk();
    const result = await apiFetch('/v1/extension/org/member', {
      method: 'PUT',
      body: JSON.stringify({
        email: String(email || '').trim(),
        displayName: String(displayName || '').trim(),
        publicKeyJwk,
      }),
    });

    await writeSyncSettings({
      orgMemberEmail: String(email || '').trim().toLowerCase(),
    });

    return result;
  }

  async function writeSyncSettings(patch) {
    const gst = browser();
    if (!gst?.storage?.sync?.get || !gst?.storage?.sync?.set) return;
    const defaults = global.GoldspireSettings?.DEFAULT_SETTINGS || {};
    const current = await gst.storageGet('sync', defaults);
    const merged = global.GoldspireSettings?.migrate?.({ ...current, ...patch }) || { ...current, ...patch };
    await new Promise((resolve) => gst.storage.sync.set(merged, () => resolve()));
  }

  async function listMembers(query = '') {
    const params = query ? `?q=${encodeURIComponent(query)}` : '';
    return apiFetch(`/v1/extension/org/members${params}`);
  }

  async function loadPendingKeyMap() {
    const stored = await browser()?.storageGet?.('local', { [PENDING_KEYS_STORAGE]: {} });
    return stored?.[PENDING_KEYS_STORAGE] && typeof stored[PENDING_KEYS_STORAGE] === 'object'
      ? stored[PENDING_KEYS_STORAGE]
      : {};
  }

  async function savePendingKeyMap(map) {
    await new Promise((resolve) => {
      browser()?.storage?.local?.set?.({ [PENDING_KEYS_STORAGE]: map }, resolve);
    });
  }

  async function syncPendingShares() {
    if (!(await canLookupOrgShares())) return { synced: false, reason: 'not_available' };

    const settings = await global.GoldspireSettings.load();
    if (!settings.orgMemberEmail) return { synced: false, reason: 'no_email' };

    await ensureMemberRegistered();

    const payload = await apiFetch('/v1/extension/org/shares/pending');
    const map = await loadPendingKeyMap();
    let added = 0;
    let failed = 0;

    for (const share of payload.shares || []) {
      try {
        let unlockKey = '';
        try {
          unlockKey = await global.GoldspireShareKeys.unwrapSecret(share.wrappedKey);
        } catch {
          unlockKey = String(share.unlockKey || '').trim();
        }
        if (!unlockKey) {
          failed += 1;
          continue;
        }
        const entry = {
          key: unlockKey,
          shareId: share.id,
          senderEmail: share.senderEmail,
          expiresAt: new Date(share.expiresAt).getTime(),
        };
        map[share.markerFingerprint] = entry;
        added += 1;
        await apiFetch(`/v1/extension/org/shares/${share.id}/claim`, { method: 'POST', body: '{}' });
      } catch (error) {
        failed += 1;
        console.warn('Goldspire: failed to sync pending share', error);
      }
    }

    const now = Date.now();
    for (const [fingerprint, entry] of Object.entries(map)) {
      if (!entry?.expiresAt || entry.expiresAt <= now) delete map[fingerprint];
    }

    await savePendingKeyMap(map);
    return { synced: true, added, failed, pending: Object.keys(map).length };
  }

  async function lookupKeyForMarker(fullMarker) {
    const fingerprints = global.GoldspireShareKeys.markerFingerprints
      ? await global.GoldspireShareKeys.markerFingerprints(fullMarker)
      : [await global.GoldspireShareKeys.markerFingerprint(fullMarker)];
    const map = await loadPendingKeyMap();
    const now = Date.now();

    for (const fingerprint of fingerprints) {
      const entry = map[fingerprint];
      if (!entry?.key) continue;
      if (entry.expiresAt && entry.expiresAt <= now) {
        delete map[fingerprint];
        continue;
      }
      return entry.key;
    }

    await savePendingKeyMap(map);

    if (!(await canLookupOrgShares())) return '';
    await ensureMemberRegistered();
    return fetchUnlockKeyFromServer(fullMarker);
  }

  async function createDeliveries({ recipients, recipientKeys, unlockSecret, markerFingerprint, expiresAt }) {
    const deliveries = [];
    for (const email of recipients) {
      const publicKeyJwk = recipientKeys[email];
      if (!publicKeyJwk) continue;
      const wrappedKey = await global.GoldspireShareKeys.wrapSecretForRecipient(unlockSecret, publicKeyJwk);
      deliveries.push({ recipientEmail: email, wrappedKey });
    }

    if (deliveries.length === 0) {
      throw new Error('No registered recipients could receive this share.');
    }

    return apiFetch('/v1/extension/org/shares', {
      method: 'POST',
      body: JSON.stringify({
        markerFingerprint,
        unlockSecret,
        expiresAt,
        deliveries,
      }),
    });
  }

  async function deliverSharesForMembers({ recipientEmails, unlockSecret, fullMarker }) {
    const membersPayload = await listMembers('');
    const byEmail = Object.fromEntries(
      (membersPayload.members || []).map((member) => [member.email.toLowerCase(), member]),
    );

    const recipients = recipientEmails.map((email) => email.trim().toLowerCase()).filter(Boolean);
    const recipientKeys = {};

    for (const email of recipients) {
      if (global.GoldspireShareRecipients?.isLikelyGroupMailbox?.(email)) {
        throw new Error(`${email} looks like a group or list. Name individual colleagues, or use Team mode.`);
      }
      const member = byEmail[email];
      if (!member) throw new Error(`${email} is not on your team.`);
      if (!member.publicKeyJwk) {
        throw new Error(`${email} has not registered for secure sharing yet (needs extension + work email).`);
      }
      recipientKeys[email] = member.publicKeyJwk;
    }

    const fingerprint = await global.GoldspireShareKeys.markerFingerprint(fullMarker);
    const expiresAt = new Date(Date.now() + (global.GoldspireConstants.ONE_TIME_TTL_MS || 72 * 3600000)).toISOString();

    return createDeliveries({
      recipients,
      recipientKeys,
      unlockSecret,
      markerFingerprint: fingerprint,
      expiresAt,
    });
  }

  global.GoldspireOrgShare = {
    isSharingAvailable,
    canLookupOrgShares,
    ensureMemberRegistered,
    registerMember,
    listMembers,
    syncPendingShares,
    lookupKeyForMarker,
    deliverSharesForMembers,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
