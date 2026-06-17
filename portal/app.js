/**
 * Shared portal helpers. API_BASE is injected by portal/config.js (from repo .env).
 */
(function (global) {
  const SESSION_KEY = 'gstOrgAdminSession';

  function portalConfig() {
    return global.GoldspirePortal || {};
  }

  function normalizeBase(value) {
    const v = String(value || '').trim().replace(/\/+$/, '');
    if (!v) return '';
    try {
      return new URL(v).toString().replace(/\/+$/, '');
    } catch {
      return '';
    }
  }

  function apiBase() {
    const params = new URLSearchParams(global.location?.search || '');
    const fromQuery = normalizeBase(params.get('api') || params.get('api_base') || '');
    if (fromQuery) return fromQuery;
    return normalizeBase(portalConfig().API_BASE || '');
  }

  function portalOrigin() {
    return normalizeBase(portalConfig().PORTAL_ORIGIN || global.location?.origin || '');
  }

  function setStatus(el, message, kind) {
    if (!el) return;
    el.textContent = message || '';
    el.className = 'status' + (kind ? ` ${kind}` : '');
  }

  async function readJson(response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || body.error || `Request failed (${response.status}).`);
    }
    return body;
  }

  async function apiRequest(path, options = {}) {
    const base = apiBase();
    if (!base) throw new Error('Organization server URL is not configured.');

    const headers = {
      Accept: 'application/json',
      ...(options.headers || {}),
    };

    const response = await fetch(`${base}${path}`, {
      ...options,
      headers,
    });

    return readJson(response);
  }

  async function apiPublic(path, options = {}) {
    return apiRequest(path, options);
  }

  async function apiAdmin(path, options = {}) {
    const session = loadAdminSession();
    if (!session?.adminToken) throw new Error('Sign in to the admin console first.');
    return apiRequest(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${session.adminToken}`,
        ...(options.headers || {}),
      },
    });
  }

  function loadAdminSession() {
    try {
      const raw = global.sessionStorage?.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveAdminSession(session) {
    global.sessionStorage?.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearAdminSession() {
    global.sessionStorage?.removeItem(SESSION_KEY);
  }

  async function copyText(text) {
    await global.navigator.clipboard.writeText(String(text || ''));
  }

  function formatWhen(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  }

  function generatePassphrase(length = 20) {
    const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => chars[b % chars.length]).join('');
  }

  global.GoldspirePortalApp = {
    apiBase,
    portalOrigin,
    apiPublic,
    apiAdmin,
    setStatus,
    loadAdminSession,
    saveAdminSession,
    clearAdminSession,
    copyText,
    formatWhen,
    generatePassphrase,
  };
})(typeof window !== 'undefined' ? window : globalThis);
