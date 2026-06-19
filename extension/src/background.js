importScripts('constants.js', 'browser.js', 'feedback.js', 'status-notice.js', 'ops/telemetry.js', 'crypto.js', 'marker.js', 'editor-host.js', 'redacted.js', 'secrets.js', 'settings-migrate.js', 'settings.js', 'managed-policy.js', 'share-keys.js', 'org-provision.js', 'share-recipients.js', 'org-share.js', 'events/bus.js', 'events/ingest.js', 'tokens/format.js', 'tokens/api.js');

const MENU_ROOT = 'goldspire-root';
const MENU_SECURE = 'goldspire-secure-selection';
const MENU_SECURE_OPTIONS = 'goldspire-secure-options';
const MENU_UNLOCK = 'goldspire-unlock-selection';
const MENU_RESOLVE_VEIL = 'goldspire-resolve-veil-token';
const MENU_GENERATE_SECURE = 'goldspire-generate-secure-password';
const MENU_SEND_FEEDBACK = 'goldspire-send-feedback';

const CONTENT_FILES = [
  'src/constants.js',
  'src/product.js',
  'src/passphrase-policy.js',
  'src/burn-list.js',
  'src/audit.js',
  'src/browser.js',
  'src/crypto.js',
  'src/marker.js',
  'src/editor-host.js',
  'src/redacted.js',
  'src/password.js',
  'src/selection.js',
  'src/multi-select.js',
  'src/secrets.js',
  'src/policy/schema.js',
  'src/policy/packs.js',
  'src/settings-migrate.js',
  'src/settings.js',
  'src/org-capability.js',
  'src/copy.js',
  'src/status-notice.js',
  'src/ops/telemetry.js',
  'src/resecure.js',
  'src/ui.js',
  'src/detector.js',
  'src/detection/context.js',
  'src/detection/intent-config.js',
  'src/detection/intent.js',
  'src/detection/context-resolve.js',
  'src/detection/gating.js',
  'src/detection/compliance.js',
  'src/detection/scoring.js',
  'src/detection/engine.js',
  'src/detection/lib-bundle.js',
  'src/detection/detectors/credit-card.js',
  'src/detection/detectors/jwt.js',
  'src/detection/detectors/api-key.js',
  'src/detection/detectors/email.js',
  'src/detection/detectors/phone.js',
  'src/detection/detectors/password.js',
  'src/detection/detectors/extended.js',
  'src/detection/bootstrap.js',
  'src/policy/engine.js',
  'src/events/bus.js',
  'src/tokens/format.js',
  'src/tokens/api.js',
  'src/tokens/client.js',
  'src/tokens/reveal.js',
  'src/tokens/detector.js',
  'src/actions/mask-text.js',
  'src/actions/registry.js',
  'src/actions/runner.js',
  'src/observe/context.js',
  'src/observe/paste-insert.js',
  'src/copilot/snooze.js',
  'src/copilot/explain.js',
  'src/copilot/prompt.js',
  'src/copilot/controller.js',
  'src/copilot/selection.js',
  'src/ai/framework.js',
  'src/ai/intercept.js',
  'src/ai/chatgpt.js',
  'src/ai/claude.js',
  'src/ai/gemini.js',
  'src/ai/copilot.js',
  'src/ai/perplexity.js',
  'src/ai/bootstrap.js',
  'src/observe/paste-observe.js',
  'src/content.js',
  'src/unlock-host.js',
];

const MENU_LOG = 'Veil';

const api = GoldspireBrowser.api;

async function reportOpsEvent(entry) {
  try {
    await GoldspireOpsTelemetry?.report?.(entry);
  } catch (error) {
    console.warn(`${MENU_LOG}: ops telemetry queue failed`, error);
  }
}

async function flushOpsTelemetry() {
  try {
    return await GoldspireOpsTelemetry?.flush?.();
  } catch (error) {
    console.warn(`${MENU_LOG}: ops telemetry flush failed`, error);
    return { ok: false, reason: 'error' };
  }
}

async function applyEnterprisePolicy() {
  try {
    await GoldspireManagedPolicy.applyManagedPolicy();
  } catch (error) {
    console.warn(`${MENU_LOG}: managed policy apply failed`, error);
  }
}

async function syncCloudOrgPolicy() {
  try {
    const result = await GoldspireOrgProvision.syncOrgPolicy();
    if (result?.reason === 'revoked') {
      await reportOpsEvent({
        kind: 'org_revoked',
        code: 'revoked',
        message: 'Org token revoked during sync',
        source: 'background',
      });
      return result;
    }
    if (result?.synced === false && result?.reason && result.reason !== 'not_provisioned' && result.reason !== 'not_cloud') {
      await GoldspireStatusNotice?.queueNotice?.({
        level: 'warn',
        id: 'org-sync-failed',
        message: 'Could not sync team settings. Veil will retry automatically.',
      });
      await reportOpsEvent({
        kind: 'sync_failure',
        code: result.reason,
        message: 'Org policy sync failed',
        source: 'background',
      });
    }
    return result;
  } catch (error) {
    console.warn(`${MENU_LOG}: cloud org sync failed`, error);
    await GoldspireStatusNotice?.queueNotice?.({
      level: 'warn',
      id: 'org-sync-error',
      message: 'Could not reach Veil to sync team settings. Check your connection.',
    });
    await reportOpsEvent({
      kind: 'sync_failure',
      code: 'network',
      message: String(error?.message || 'Org sync error').slice(0, 200),
      source: 'background',
    });
    return { synced: false, reason: 'error' };
  }
}

async function syncCloudOrgShares() {
  try {
    if (await GoldspireOrgShare.canLookupOrgShares?.()) {
      await GoldspireOrgShare.ensureMemberRegistered?.();
    }
    await GoldspireOrgShare.syncPendingShares();
  } catch (error) {
    console.warn(`${MENU_LOG}: share inbox sync failed`, error);
  }
}

async function uploadVeilSecurityEvents() {
  try {
    const result = await GoldspireVeilIngest?.uploadPendingEvents?.();
    if (result?.reason === 'revoked') return result;
    if (result?.ok === false && result?.reason === 'network') {
      console.warn(`${MENU_LOG}: veil event upload failed (network)`);
      await reportOpsEvent({
        kind: 'event_upload_failure',
        code: 'network',
        message: 'Security event upload failed',
        source: 'background',
      });
    }
    return result;
  } catch (error) {
    console.warn(`${MENU_LOG}: veil event upload failed`, error);
    return { ok: false, reason: 'error' };
  }
}

function scheduleOrgSyncAlarm() {
  const minutes = GoldspireConstants.ORG_SYNC_INTERVAL_MINUTES || 360;
  if (!api.alarms?.create) return;
  api.alarms.create('goldspire-org-sync', { periodInMinutes: minutes });
  api.alarms.create('goldspire-veil-events', { periodInMinutes: 15 });
  api.alarms.create('goldspire-ops-telemetry', { periodInMinutes: 15 });
}

async function bootstrapPolicies() {
  await applyEnterprisePolicy();
  await syncCloudOrgPolicy();
  await syncCloudOrgShares();
  await uploadVeilSecurityEvents();
  await flushOpsTelemetry();
}

function isVeilTokenText(text) {
  return Boolean(GoldspireVeilTokenFormat?.isVeilToken?.(text));
}

function updateContextMenus({ selectedText = '', editable = false } = {}) {
  const selected = String(selectedText || '').trim();
  const hasSelection = selected.length > 0;
  const isRedacted = hasSelection && GoldspireRedacted.isRedactedToken(selected);
  const isVeilToken = hasSelection && isVeilTokenText(selected);

  const updates = [
    [MENU_SECURE, { visible: hasSelection && !isRedacted && !isVeilToken }],
    [MENU_SECURE_OPTIONS, { visible: hasSelection && !isRedacted && !isVeilToken }],
    [MENU_UNLOCK, { visible: isRedacted }],
    [MENU_RESOLVE_VEIL, { visible: isVeilToken }],
    // Caret in a field, no highlight — generate & secure at cursor.
    [MENU_GENERATE_SECURE, { visible: editable && !hasSelection }],
  ];

  return Promise.all(
    updates.map(
      ([id, props]) =>
        new Promise((resolve) => {
          api.contextMenus.update(id, props, () => {
            if (api.runtime.lastError) {
              console.warn(`${MENU_LOG}: menu update failed`, api.runtime.lastError);
            }
            resolve();
          });
        }),
    ),
  ).then(() => {
    api.contextMenus.refresh?.();
  });
}

async function resolveMenuContext(info, tab) {
  let selectedText = String(info.selectionText || '').trim();
  let editable = Boolean(info.editable);

  if (tab?.id != null) {
    const result = await dispatchToTab(tab.id, info.frameId ?? null, { type: 'GET_SELECTION_STATUS' });
    if (result) {
      if (!selectedText) {
        selectedText = String(result.preview || '').trim();
      }
      if (result.inEditable) editable = true;
    }
  }

  return { selectedText, editable };
}

async function openFeedbackFromMenu(tab) {
  const settings = await GoldspireSettings.load();
  const version = api.runtime.getManifest().version;
  const meta = {
    version,
    browser: GoldspireFeedback.detectBrowser(),
    profile: settings.securityProfile || 'personal',
    copilot: settings.copilotEnabled === true,
    orgName: settings.orgDisplayName || '',
    pageUrl: GoldspireFeedback.sanitizePageUrl(tab?.url),
  };
  const diagnostics = GoldspireFeedback.buildDiagnostics(meta);
  const mailto = GoldspireFeedback.buildMailtoUrl('feedback', { diagnostics, meta });
  GoldspireFeedback.openMailto(api, mailto);
}

function createMenus() {
  api.contextMenus.removeAll(() => {
    if (api.runtime.lastError) {
      console.warn(`${MENU_LOG}: context menu reset failed`, api.runtime.lastError);
    }

    api.contextMenus.create({
      id: MENU_ROOT,
      title: 'Veil',
      // Always show so users can generate & secure at caret.
      contexts: ['all'],
    });

    api.contextMenus.create({
      id: MENU_SECURE,
      parentId: MENU_ROOT,
      title: 'Secure selection',
      contexts: ['selection', 'editable'],
    });

    api.contextMenus.create({
      id: MENU_SECURE_OPTIONS,
      parentId: MENU_ROOT,
      title: 'Secure with options…',
      contexts: ['selection', 'editable'],
    });

    api.contextMenus.create({
      id: MENU_UNLOCK,
      parentId: MENU_ROOT,
      title: 'Unlock [redacted]',
      contexts: ['selection'],
    });

    api.contextMenus.create({
      id: MENU_RESOLVE_VEIL,
      parentId: MENU_ROOT,
      title: 'Reveal Veil token',
      contexts: ['selection'],
    });

    api.contextMenus.create({
      id: MENU_GENERATE_SECURE,
      parentId: MENU_ROOT,
      title: 'Generate & secure password',
      contexts: ['all'],
    });

    api.contextMenus.create({
      id: MENU_SEND_FEEDBACK,
      parentId: MENU_ROOT,
      title: 'Send feedback…',
      contexts: ['all'],
    });
  });
}

async function ensureContentScript(tabId) {
  try {
    await api.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: CONTENT_FILES,
    });
  } catch (error) {
    console.warn(`${MENU_LOG}: could not inject content script`, error);
  }
}

async function resolveTargetFrame(tabId) {
  try {
    const results = await api.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        try {
          const preview = window.GoldspireSelection?.getLivePreview?.() || '';
          const inEditable = typeof window.__goldspireIsComposeContext === 'function'
            ? window.__goldspireIsComposeContext()
            : false;
          return { preview: preview.trim(), inEditable };
        } catch {
          return { preview: '', inEditable: false };
        }
      },
    });

    let fallback = null;
    for (const entry of results || []) {
      if (!entry.result?.preview) continue;
      if (entry.result.inEditable) return entry.frameId;
      if (fallback == null) fallback = entry.frameId;
    }
    return fallback;
  } catch {
    return null;
  }
}

async function dispatchToTab(tabId, frameId, message, retried = false) {
  const deliver = (targetFrameId) =>
    new Promise((resolve) => {
      const options = targetFrameId != null ? { frameId: targetFrameId } : undefined;
      api.tabs.sendMessage(tabId, message, options, (response) => {
        if (api.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    });

  if (frameId != null) {
    const direct = await deliver(frameId);
    if (direct) return direct;
  }

  const main = await deliver(undefined);
  if (main) return main;

  try {
    const results = await api.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (payload) => {
        if (typeof window.__goldspireHandleCommand === 'function') {
          return window.__goldspireHandleCommand({ ...payload, silent: true });
        }
        window.postMessage({ ...payload, source: 'goldspire-veil-extension', silent: true }, '*');
        return { ok: true, relayed: true };
      },
      args: [message],
    });

    for (const result of results || []) {
      if (result?.result?.handled) return result.result;
      if (result?.result?.preview || result?.result?.ok) return result.result;
    }
  } catch {
    if (!retried) {
      await ensureContentScript(tabId);
      return dispatchToTab(tabId, frameId, message, true);
    }
  }

  return { ok: false };
}

function sendToActiveTab(type, payload = {}, frameId = null) {
  api.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;
    const targetFrame = frameId ?? await resolveTargetFrame(tab.id);
    await dispatchToTab(tab.id, targetFrame, { type, ...payload });
  });
}

api.runtime.onInstalled.addListener(() => {
  createMenus();
  bootstrapPolicies();
  scheduleOrgSyncAlarm();
});

api.runtime.onStartup.addListener(() => {
  createMenus();
  bootstrapPolicies();
});

createMenus();
bootstrapPolicies();
scheduleOrgSyncAlarm();

if (api.tabs?.onActivated) {
  api.tabs.onActivated.addListener(() => {
    syncCloudOrgShares();
  });
}

if (api.tabs?.onUpdated) {
  api.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.status === 'complete') syncCloudOrgShares();
  });
}

if (api.alarms?.onAlarm) {
  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'goldspire-org-sync') {
      syncCloudOrgPolicy();
      syncCloudOrgShares();
    }
    if (alarm.name === 'goldspire-veil-events') {
      uploadVeilSecurityEvents();
    }
    if (alarm.name === 'goldspire-ops-telemetry') {
      flushOpsTelemetry();
    }
  });
}

if (api.storage?.onChanged) {
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'managed') bootstrapPolicies();
  });
}

if (api.contextMenus.onShown) {
  api.contextMenus.onShown.addListener(async (info, tab) => {
    const { selectedText, editable } = await resolveMenuContext(info, tab);
    await updateContextMenus({ selectedText, editable });
  });
}

api.contextMenus.onClicked.addListener((info, tab) => {
  const frameId = info.frameId;
  const selectionText = info.selectionText || '';

  if (info.menuItemId === MENU_SECURE) {
    sendToActiveTab('SECURE_SELECTION', { selectionText }, frameId);
  }

  if (info.menuItemId === MENU_SECURE_OPTIONS) {
    sendToActiveTab('SECURE_WITH_OPTIONS', { selectionText }, frameId);
  }

  if (info.menuItemId === MENU_UNLOCK) {
    sendToActiveTab('UNLOCK_SELECTION', { selectionText }, frameId);
  }

  if (info.menuItemId === MENU_RESOLVE_VEIL) {
    sendToActiveTab('RESOLVE_VEIL_TOKEN', { selectionText }, frameId);
  }

  if (info.menuItemId === MENU_GENERATE_SECURE) {
    sendToActiveTab('INSERT_GENERATED_SECURED_PASSWORD', {}, frameId);
  }

  if (info.menuItemId === MENU_SEND_FEEDBACK) {
    openFeedbackFromMenu(tab).catch((error) => {
      console.warn('[Veil] feedback failed', error);
    });
  }
});

api.commands.onCommand.addListener((command) => {
  if (command === 'secure-selection') sendToActiveTab('SECURE_SELECTION');
  if (command === 'secure-with-options') sendToActiveTab('SECURE_WITH_OPTIONS');
  if (command === 'unlock-selection') sendToActiveTab('UNLOCK_SELECTION');
  if (command === 'generate-password') sendToActiveTab('INSERT_GENERATED_PASSWORD');
});

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SEND_TO_ACTIVE_TAB') {
    sendToActiveTab(message.action, message.payload || {});
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === 'GET_SETTINGS') {
    GoldspireSettings.load()
      .then((settings) => sendResponse({ settings }))
      .catch(() => sendResponse({ settings: { ...GoldspireSettings.DEFAULT_SETTINGS, passphrase: '' } }));
    return true;
  }

  if (message?.type === 'GET_SELECTION_STATUS') {
    api.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        sendResponse({ preview: '' });
        return;
      }
      const result = await dispatchToTab(tab.id, null, { type: 'GET_SELECTION_STATUS' });
      sendResponse({ preview: result?.preview || '' });
    });
    return true;
  }

  if (message?.type === 'GET_MANAGED_STATE') {
    GoldspireManagedPolicy.getManagedState()
      .then((state) => sendResponse(state))
      .catch(() => sendResponse({ active: false, keys: [] }));
    return true;
  }

  if (message?.type === 'APPLY_MANAGED_POLICY') {
    GoldspireManagedPolicy.applyManagedPolicy()
      .then((state) => sendResponse(state))
      .catch(() => sendResponse({ active: false, keys: [] }));
    return true;
  }

  if (message?.type === 'ORG_JOIN') {
    GoldspireOrgProvision.joinWithCode(message.joinCode, message.email)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Join failed.' }));
    return true;
  }

  if (message?.type === 'ORG_SYNC') {
    GoldspireOrgProvision.syncOrgPolicy()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Sync failed.' }));
    return true;
  }

  if (message?.type === 'ORG_SIGN_IN') {
    GoldspireOrgProvision.openSignIn()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Sign-in failed.' }));
    return true;
  }

  if (message?.type === 'ORG_DISCONNECT') {
    GoldspireOrgProvision.disconnectOrg()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Disconnect failed.' }));
    return true;
  }

  if (message?.type === 'ORG_REGISTER_MEMBER') {
    GoldspireOrgShare.registerMember(message.email, message.displayName)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Registration failed.' }));
    return true;
  }

  if (message?.type === 'ORG_LIST_MEMBERS') {
    GoldspireOrgShare.listMembers(message.query || '')
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Could not load members.' }));
    return true;
  }

  if (message?.type === 'ORG_SYNC_SHARES') {
    GoldspireOrgShare.syncPendingShares()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Share sync failed.' }));
    return true;
  }

  if (message?.type === 'ORG_LOOKUP_SHARE_KEY') {
    GoldspireOrgShare.lookupKeyForMarker(message.fullMarker)
      .then((key) => sendResponse({ key }))
      .catch(() => sendResponse({ key: '' }));
    return true;
  }

  if (message?.type === 'ORG_DELIVER_SHARE') {
    GoldspireOrgShare.deliverSharesForMembers(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Share delivery failed.' }));
    return true;
  }

  if (message?.type === 'VEIL_TOKEN_API') {
    (async () => {
      try {
        let result;
        if (message.method === 'createTokenRecord') {
          result = await GoldspireVeilTokenApi.createTokenRecord(message.payload || {});
        } else if (message.method === 'resolveTokenRecord' || message.method === 'peekTokenRecord') {
          result = await GoldspireVeilTokenApi.resolveTokenRecord(message.payload?.tokenId);
        } else if (message.method === 'consumeTokenRecord') {
          result = await GoldspireVeilTokenApi.consumeTokenRecord(message.payload?.tokenId);
        } else {
          sendResponse({ ok: false, error: 'Unknown token API method.' });
          return;
        }
        sendResponse({ ok: true, result });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || 'Token API failed.' });
      }
    })();
    return true;
  }

  return false;
});

if (api.runtime.onMessageExternal) {
  api.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'ORG_PROVISION') return false;
    GoldspireOrgProvision.handleExternalProvision(message, sender)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Provision failed.' }));
    return true;
  });
}

self.addEventListener('unhandledrejection', (event) => {
  console.warn(`${MENU_LOG}: unhandled rejection`, event.reason);
  reportOpsEvent({
    kind: 'client_error',
    code: 'unhandled_rejection',
    message: String(event.reason?.message || event.reason || 'Unhandled rejection').slice(0, 200),
    source: 'background',
  });
});
