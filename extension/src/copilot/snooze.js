/**
 * Per-site Veil copilot snooze (extracted from content.js).
 */
(function (global) {
  const STORAGE_KEY = 'gstSnoozedHosts';
  const hosts = new Set();
  let sessionUntil = 0;

  async function load() {
    try {
      const gst = global.GoldspireBrowser;
      if (!gst?.storageGet) return;
      const stored = await gst.storageGet('local', { [STORAGE_KEY]: [] });
      hosts.clear();
      for (const host of stored[STORAGE_KEY] || []) {
        if (host) hosts.add(host);
      }
    } catch {
      // Non-critical.
    }
  }

  function isSnoozed(host = '') {
    const key = String(host || '').trim();
    if (!key) return false;
    if (Date.now() < sessionUntil) return true;
    return hosts.has(key);
  }

  function snoozeSession(ms = 30 * 60 * 1000) {
    sessionUntil = Date.now() + ms;
  }

  async   function snoozeHost(host = '') {
    const key = String(host || '').trim();
    if (!key) return;
    hosts.add(key);
    try {
      const gst = global.GoldspireBrowser;
      if (!gst?.storageGet) return;
      const stored = await gst.storageGet('local', { [STORAGE_KEY]: [] });
      const updated = Array.from(new Set([...(stored[STORAGE_KEY] || []), key]));
      gst.storage?.local?.set?.({ [STORAGE_KEY]: updated });
    } catch {
      // Non-critical.
    }
  }

  const compositionAllowed = [];
  const allowedFieldSignatures = new Set();
  let allowEpoch = 0;
  const fieldAllowEpoch = new WeakMap();
  const categorySnooze = new Map();
  const CATEGORY_SNOOZE_MS = 24 * 60 * 60 * 1000;

  function fieldSignature(fieldState, host = '') {
    const el = fieldState?.element;
    if (!el) return '';
    const tag = String(el.tagName || '').toUpperCase();
    const id = el.id || '';
    const name = el.getAttribute?.('name') || '';
    const aria = el.getAttribute?.('aria-label') || '';
    return `${String(host || '').trim()}:${tag}:${id}:${name}:${aria}`;
  }

  function categoryKey(host, category) {
    return `${String(host || '').trim()}:${String(category || '').trim()}`;
  }

  function snoozeCategory(host, category, ms = CATEGORY_SNOOZE_MS) {
    const key = categoryKey(host, category);
    if (!key || key === ':') return;
    categorySnooze.set(key, Date.now() + ms);
    if (categorySnooze.size > 64) {
      const oldest = categorySnooze.keys().next().value;
      categorySnooze.delete(oldest);
    }
  }

  function isCategorySnoozed(host, category) {
    const key = categoryKey(host, category);
    const until = categorySnooze.get(key);
    if (!until) return false;
    if (Date.now() > until) {
      categorySnooze.delete(key);
      return false;
    }
    return true;
  }

  function allowComposition(host, text, match, fieldState, detections = []) {
    const key = String(host || '').trim();
    const sig = fieldSignature(fieldState, key);
    if (sig) allowedFieldSignatures.add(sig);
    if (fieldState?.element) {
      fieldAllowEpoch.set(fieldState.element, allowEpoch);
    }
    compositionAllowed.push({
      host: String(host || '').trim(),
      matchRaw: String(match?.raw || text || '').trim(),
      fieldSnapshot: String(fieldState?.text || text || ''),
    });
    if (compositionAllowed.length > 24) compositionAllowed.shift();

    for (const hit of detections || []) {
      if (hit?.category) snoozeCategory(key, hit.category);
    }
    if (match?.category) snoozeCategory(key, match.category);
  }

  function clearCompositionAllows() {
    compositionAllowed.length = 0;
    allowedFieldSignatures.clear();
    allowEpoch += 1;
  }

  function clearCategorySnoozes() {
    categorySnooze.clear();
  }

  function isCompositionAllowed(host, text, match, fieldState) {
    const key = String(host || '').trim();
    const sig = fieldSignature(fieldState, key);
    if (sig && allowedFieldSignatures.has(sig)) return true;
    if (fieldState?.element && fieldAllowEpoch.get(fieldState.element) === allowEpoch) {
      return true;
    }
    const matchRaw = String(match?.raw || text || '').trim();
    const fieldText = String(fieldState?.text || text || '');
    return compositionAllowed.some(
      (entry) => entry.host === key
        && entry.matchRaw === matchRaw
        && entry.fieldSnapshot === fieldText,
    );
  }

  global.GoldspireVeilSnooze = {
    load,
    isSnoozed,
    snoozeSession,
    snoozeHost,
    allowComposition,
    isCompositionAllowed,
    clearCompositionAllows,
    clearCategorySnoozes,
    snoozeCategory,
    isCategorySnoozed,
    STORAGE_KEY,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
