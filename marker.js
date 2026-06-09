/**
 * Wire format: ⟦gs:v1⟧payload⟦/gs⟧ (stored invisibly after [redacted])
 */
(function (global) {
  const MARKER_PATTERN = /⟦gs:v([12])(?::([^⟧]*))?⟧([A-Za-z0-9_-]+)⟦\/gs⟧/g;
  const MARKER_TEST = /⟦gs:v([12])(?::([^⟧]*))?⟧[A-Za-z0-9_-]+⟦\/gs⟧/;
  const LEGACY_COMPACT_TEST = /⟦🔒:[A-Za-z0-9]{4}/;

  function wrapSecured(payload, hint, version = '1') {
    const safeHint = hint
      ? String(hint)
          .trim()
          .slice(0, 40)
          .replace(/[⟧⟦🔒]/g, '')
      : '';
    if (safeHint) return `⟦gs:v${version}:${safeHint}⟧${payload}⟦/gs⟧`;
    return `⟦gs:v${version}⟧${payload}⟦/gs⟧`;
  }

  function parseMarker(full) {
    const match = full.match(/⟦gs:v([12])(?::([^⟧]*))?⟧([A-Za-z0-9_-]+)⟦\/gs⟧/);
    if (!match) return null;
    return {
      full,
      fullMarker: full,
      version: match[1],
      hint: match[2] || '',
      payload: match[3],
      mode: match[1] === '2' ? 'one-time' : 'team',
    };
  }

  function findInText(text) {
    if (!text) return null;
    const match = text.match(MARKER_TEST);
    if (!match) return null;
    const parsed = parseMarker(match[0]);
    if (!parsed) return null;
    return { ...parsed, index: text.indexOf(match[0]) };
  }

  function findAllInText(text) {
    if (!text) return [];
    const results = [];
    let match;
    const pattern = new RegExp(MARKER_PATTERN.source, 'g');
    while ((match = pattern.exec(text)) !== null) {
      const parsed = parseMarker(match[0]);
      if (parsed) results.push({ ...parsed, index: match.index });
    }
    return results;
  }

  function isLegacyToken(text) {
    if (!text) return false;
    return MARKER_TEST.test(text) || LEGACY_COMPACT_TEST.test(text) || text.includes('──gs secured──');
  }

  function resolveSelectionMarker(context, selectedText) {
    return findInText(selectedText) || findInText(global.GoldspireRedacted?.getSourceText?.(context) || '');
  }

  function buildUnlockLink(markerFull) {
    const runtime = global.GoldspireBrowser?.runtime || global.chrome?.runtime || global.browser?.runtime;
    if (!runtime?.getURL) return '';
    return `${runtime.getURL('unlock/unlock.html')}#${encodeURIComponent(markerFull)}`;
  }

  global.GoldspireSecureMarker = {
    wrapSecured,
    parseMarker,
    findInText,
    findAllInText,
    isLegacyToken,
    resolveSelectionMarker,
    buildUnlockLink,
    MARKER_TEST,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
