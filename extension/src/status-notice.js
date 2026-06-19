/**
 * Cross-context user notices (service worker → popup / content).
 */
(function (global) {
  const NOTICE_KEY = 'gstUserNotice';

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

  async function queueNotice({ level = 'info', message, id } = {}) {
    const text = String(message || '').trim();
    if (!text) return;
    await storageSet({
      [NOTICE_KEY]: {
        id: id || `notice-${Date.now()}`,
        level: ['info', 'warn', 'error'].includes(level) ? level : 'info',
        message: text.slice(0, 500),
        at: Date.now(),
      },
    });
  }

  async function peekNotice(maxAgeMs = 24 * 60 * 60 * 1000) {
    const stored = await storageGet({ [NOTICE_KEY]: null });
    const notice = stored[NOTICE_KEY];
    if (!notice?.message) return null;
    if (Date.now() - Number(notice.at || 0) > maxAgeMs) {
      await clearNotice();
      return null;
    }
    return notice;
  }

  async function consumeNotice(maxAgeMs = 24 * 60 * 60 * 1000) {
    const notice = await peekNotice(maxAgeMs);
    if (!notice) return null;
    await clearNotice();
    return notice;
  }

  async function clearNotice() {
    const gst = global.GoldspireBrowser;
    if (!gst?.storage?.local?.remove) return;
    await new Promise((resolve) => {
      gst.storage.local.remove(NOTICE_KEY, resolve);
    });
  }

  global.GoldspireStatusNotice = {
    NOTICE_KEY,
    queueNotice,
    peekNotice,
    consumeNotice,
    clearNotice,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
