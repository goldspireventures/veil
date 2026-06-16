/**
 * Burn-after-read tracking for one-time secured text (per browser).
 */
(function (global) {
  const STORAGE_KEY = 'gstBurnedMarkerHashes';
  const UNLOCK_ATTEMPTS_KEY = 'gstUnlockAttempts';

  async function hashMarker(fullMarker) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fullMarker || ''));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function readBurnList() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  async function writeBurnList(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 500)));
    } catch {
      // Storage full or unavailable.
    }
  }

  async function isBurned(fullMarker) {
    if (!fullMarker) return false;
    const id = await hashMarker(fullMarker);
    const list = await readBurnList();
    return list.includes(id);
  }

  async function burn(fullMarker) {
    if (!fullMarker) return;
    const id = await hashMarker(fullMarker);
    const list = await readBurnList();
    if (!list.includes(id)) {
      list.unshift(id);
      await writeBurnList(list);
    }
  }

  function readAttempts() {
    try {
      const raw = sessionStorage.getItem(UNLOCK_ATTEMPTS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function writeAttempts(map) {
    try {
      sessionStorage.setItem(UNLOCK_ATTEMPTS_KEY, JSON.stringify(map));
    } catch {
      // ignore
    }
  }

  async function checkRateLimit(fullMarker, { maxFailures = 8, lockMs = 60_000 } = {}) {
    const id = await hashMarker(fullMarker);
    const map = readAttempts();
    const entry = map[id];
    if (!entry) return { allowed: true };

    if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
      const seconds = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
      return { allowed: false, message: `Too many attempts. Wait ${seconds}s and try again.` };
    }

    if (entry.failures >= maxFailures) {
      entry.lockedUntil = Date.now() + lockMs;
      entry.failures = 0;
      map[id] = entry;
      writeAttempts(map);
      return { allowed: false, message: `Too many attempts. Wait ${Math.ceil(lockMs / 1000)}s and try again.` };
    }

    return { allowed: true };
  }

  async function recordFailure(fullMarker) {
    const id = await hashMarker(fullMarker);
    const map = readAttempts();
    const entry = map[id] || { failures: 0 };
    entry.failures += 1;
    map[id] = entry;
    writeAttempts(map);
  }

  async function clearFailures(fullMarker) {
    const id = await hashMarker(fullMarker);
    const map = readAttempts();
    delete map[id];
    writeAttempts(map);
  }

  global.GoldspireBurnList = {
    isBurned,
    burn,
    checkRateLimit,
    recordFailure,
    clearFailures,
    hashMarker,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
