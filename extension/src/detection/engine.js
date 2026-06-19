/**
 * Modular detection framework. Detectors register via register(); analyze() runs all.
 * Sprint 1 adds concrete detectors. No side effects when copilot/DLP flags are off.
 */
(function (global) {
  const detectors = [];

  function register(detector) {
    if (!detector?.id || typeof detector.detect !== 'function') return;
    detectors.push(detector);
  }

  function getDetectors() {
    return detectors.slice();
  }

  function isActive(settings) {
    if (!settings) return false;
    if (settings.copilotEnabled === true) return true;
    const mode = String(settings.dlpMode || 'off').toLowerCase();
    return mode === 'observe' || mode === 'enforce';
  }

  async function shouldRun() {
    if (!global.GoldspireSettings?.load) return false;
    try {
      const settings = await global.GoldspireSettings.load();
      return isActive(settings);
    } catch {
      return false;
    }
  }

  function analyze(text, context = {}) {
    if (!text || typeof text !== 'string') return [];

    const ctx =
      global.GoldspireDetectionContext?.createContext?.(context) || context;
    const results = [];

    for (const detector of detectors) {
      try {
        const matches = detector.detect(text, ctx);
        if (!matches) continue;
        const list = Array.isArray(matches) ? matches : [matches];
        for (const match of list) {
          if (match?.category) results.push(match);
        }
      } catch {
        // Detector failure must not break the page.
      }
    }

    const scored = global.GoldspireScoring?.scoreAll?.(results, ctx) || results;
    const deduped = dedupeResults(scored);
    return global.GoldspireDetectionContextResolve?.resolveDetections?.(text, deduped, ctx) || deduped;
  }

  function dedupeResults(results) {
    const seen = new Set();
    const out = [];
    for (const entry of results || []) {
      const key = `${entry.category}:${entry.matchedText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
    return global.GoldspireDetectionLib?.sortDetections?.(out) || out;
  }

  global.GoldspireDetection = {
    register,
    analyze,
    getDetectors,
    isActive,
    shouldRun,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
