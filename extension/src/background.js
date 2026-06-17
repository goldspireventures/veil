importScripts('constants.js', 'browser.js', 'crypto.js', 'marker.js', 'editor-host.js', 'redacted.js', 'secrets.js', 'settings-migrate.js', 'settings.js', 'managed-policy.js', 'share-keys.js', 'org-provision.js', 'org-share.js');

const MENU_ROOT = 'goldspire-root';
const MENU_SECURE = 'goldspire-secure-selection';
const MENU_SECURE_OPTIONS = 'goldspire-secure-options';
const MENU_UNLOCK = 'goldspire-unlock-selection';
const MENU_GENERATE_SECURE = 'goldspire-generate-secure-password';

const CONTENT_FILES = [
  'src/constants.js',
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
  'src/secrets.js',
  'src/settings-migrate.js',
  'src/settings.js',
  'src/resecure.js',
  'src/ui.js',
  'src/detector.js',
  'src/content.js',
  'src/unlock-host.js',
];

const api = GoldspireBrowser.api;

async function applyEnterprisePolicy() {
  try {
    await GoldspireManagedPolicy.applyManagedPolicy();
  } catch (error) {
    console.warn('Goldspire Secure Text: managed policy apply failed', error);
  }
}

async function syncCloudOrgPolicy() {
  try {
    await GoldspireOrgProvision.syncOrgPolicy();
  } catch (error) {
    console.warn('Goldspire Secure Text: cloud org sync failed', error);
  }
}

async function syncCloudOrgShares() {
  try {
    if (await GoldspireOrgShare.canLookupOrgShares?.()) {
      await GoldspireOrgShare.ensureMemberRegistered?.();
    }
    await GoldspireOrgShare.syncPendingShares();
  } catch (error) {
    console.warn('Goldspire Secure Text: share inbox sync failed', error);
  }
}

function scheduleOrgSyncAlarm() {
  const minutes = GoldspireConstants.ORG_SYNC_INTERVAL_MINUTES || 360;
  if (!api.alarms?.create) return;
  api.alarms.create('goldspire-org-sync', { periodInMinutes: minutes });
}

async function bootstrapPolicies() {
  await applyEnterprisePolicy();
  await syncCloudOrgPolicy();
  await syncCloudOrgShares();
}

function updateContextMenus({ selectedText = '', editable = false } = {}) {
  const selected = String(selectedText || '').trim();
  const hasSelection = selected.length > 0;
  const isRedacted = hasSelection && GoldspireRedacted.isRedactedToken(selected);

  const updates = [
    [MENU_SECURE, { visible: hasSelection && !isRedacted }],
    [MENU_SECURE_OPTIONS, { visible: hasSelection && !isRedacted }],
    [MENU_UNLOCK, { visible: isRedacted }],
    // Caret in a field, no highlight — generate & secure at cursor.
    [MENU_GENERATE_SECURE, { visible: editable && !hasSelection }],
  ];

  return Promise.all(
    updates.map(
      ([id, props]) =>
        new Promise((resolve) => {
          api.contextMenus.update(id, props, () => {
            if (api.runtime.lastError) {
              console.warn('Goldspire Secure Text: menu update failed', api.runtime.lastError);
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

function createMenus() {
  api.contextMenus.removeAll(() => {
    if (api.runtime.lastError) {
      console.warn('Goldspire Secure Text: context menu reset failed', api.runtime.lastError);
    }

    api.contextMenus.create({
      id: MENU_ROOT,
      title: 'Goldspire Secure Text',
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
      id: MENU_GENERATE_SECURE,
      parentId: MENU_ROOT,
      title: 'Generate & secure password',
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
    console.warn('Goldspire Secure Text: could not inject content script', error);
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
        window.postMessage({ ...payload, source: 'goldspire-secure-text-extension', silent: true }, '*');
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

  if (info.menuItemId === MENU_GENERATE_SECURE) {
    sendToActiveTab('INSERT_GENERATED_SECURED_PASSWORD', {}, frameId);
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
