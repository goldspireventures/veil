import { readFileSync, existsSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadDotEnv() {
  const envPath = join(repoRoot, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

export function hasDatabase() {
  loadDotEnv();
  return Boolean(process.env.DATABASE_URL || process.env.DIRECT_URL);
}

export function mockAdminReq(token) {
  return { headers: { authorization: `Bearer ${token}` } };
}

export function polyfillBrowserGlobals(target = {}) {
  const g = target;
  g.btoa = (value) => Buffer.from(value, 'binary').toString('base64');
  g.atob = (value) => Buffer.from(value, 'base64').toString('binary');
  g.crypto = globalThis.crypto;
  g.TextEncoder = TextEncoder;
  g.TextDecoder = TextDecoder;
  g.Event = globalThis.Event;
  g.globalThis = g;
  return g;
}

export function loadExtensionCrypto(iterations = 4_000) {
  const g = polyfillBrowserGlobals({
    GoldspireConstants: {
      CRYPTO_ITERATIONS: { personal: iterations, organization: iterations },
    },
    GoldspirePassphrasePolicy: {
      assertPassphrase(passphrase, profile) {
        const min = profile === 'organization' ? 16 : 12;
        if (!passphrase || passphrase.length < min) {
          throw new Error(`Passphrase must be at least ${min} characters.`);
        }
      },
    },
  });
  vm.runInNewContext(readFileSync(join(repoRoot, 'extension/src/crypto.js'), 'utf8'), g);
  return g.GoldspireSecureCrypto;
}

export function loadExtensionModule(relativePath, extra = {}) {
  const g = polyfillBrowserGlobals({ ...extra });
  vm.runInNewContext(readFileSync(join(repoRoot, relativePath), 'utf8'), g);
  return g;
}

export function loadVeilStack(extra = {}) {
  const g = polyfillBrowserGlobals({
    GoldspireSettings: {
      isVeilActive: (s) => s?.copilotEnabled === true || ['observe', 'enforce'].includes(s?.dlpMode),
      normalizeDlpMode: (v) => String(v || 'off').toLowerCase(),
      DEFAULT_SETTINGS: {},
    },
    GoldspireVeilEvents: {
      isEnabled: (s) => s?.copilotEnabled === true || ['observe', 'enforce'].includes(s?.dlpMode),
      emit: async () => {},
      sanitizeEntry: (e) => ({
        at: Date.now(),
        type: String(e.type || 'unknown'),
        category: String(e.category || ''),
        severity: String(e.severity || ''),
        host: String(e.host || ''),
        source: String(e.source || ''),
        action: String(e.action || ''),
        confidence: Number(e.confidence) || 0,
      }),
    },
    GoldspireScoring: {
      highestSeverity: (results) =>
        results.reduce((max, entry) => {
          const order = { low: 0, medium: 1, high: 2, critical: 3 };
          return order[entry.severity] > order[max] ? entry.severity : max;
        }, 'low'),
    },
    GoldspirePasteInsert: {
      insertAtCaret: (_caret, text) => ({ selectedText: text, kind: 'input' }),
    },
    GoldspireVeilCopilot: {
      MIN_CONFIDENCE: 50,
      showCopilotPrompt: () => {},
      applyPasteAction: async (actionId, req) => {
        if (actionId === 'mask') {
          const masked = g.GoldspireVeilMask?.maskSensitiveText?.(req.text, req.context) || req.text;
          return { ok: true, inserted: masked };
        }
        return { ok: true, inserted: req.text };
      },
    },
    GoldspireSecureUI: { showToast: () => {}, showCopilotPrompt: () => {} },
    GoldspireConstants: { ORG_API_BASE: 'https://api.scenario.test' },
    location: { hostname: 'mail.google.com' },
    ...extra,
  });

  for (const file of [
    'extension/src/detection/lib-bundle.js',
    'extension/src/detection/context.js',
    'extension/src/detection/intent-config.js',
    'extension/src/detection/intent.js',
    'extension/src/detection/context-resolve.js',
    'extension/src/detection/gating.js',
    'extension/src/detection/scoring.js',
    'extension/src/detection/engine.js',
    'extension/src/detection/detectors/credit-card.js',
    'extension/src/detection/detectors/jwt.js',
    'extension/src/detection/detectors/api-key.js',
    'extension/src/detection/detectors/email.js',
    'extension/src/detection/detectors/phone.js',
    'extension/src/detection/detectors/password.js',
    'extension/src/detection/detectors/extended.js',
    'extension/src/detection/bootstrap.js',
    'extension/src/policy/schema.js',
    'extension/src/policy/engine.js',
    'extension/src/actions/mask-text.js',
    'extension/src/actions/registry.js',
    'extension/src/actions/runner.js',
    'extension/src/tokens/format.js',
    'extension/src/tokens/client.js',
    'extension/src/org-capability.js',
    'extension/src/copy.js',
    'extension/src/status-notice.js',
    'extension/src/copilot/controller.js',
    'extension/src/copilot/snooze.js',
    'extension/src/copilot/explain.js',
    'extension/src/observe/context.js',
    'extension/src/copilot/prompt.js',
    'extension/src/observe/paste-insert.js',
    'extension/src/observe/paste-observe.js',
    'extension/src/ai/framework.js',
    'extension/src/ai/intercept.js',
    'extension/src/ai/chatgpt.js',
  ]) {
    vm.runInNewContext(readFileSync(join(repoRoot, file), 'utf8'), g);
  }

  return g;
}

export async function cleanupScenarioOrg(orgId) {
  const { getPool, closePool } = await import('../../api/src/db.mjs');
  const pool = getPool();
  await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
  await closePool();
}

export function demoPublicJwk() {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return publicKey.export({ format: 'jwk' });
}

/** Minimal textarea mock for paste-insert / observe tests in Node. */
export function mockTextarea(value = '', selectionStart, selectionEnd) {
  const start = selectionStart ?? value.length;
  const end = selectionEnd ?? start;
  return {
    tagName: 'TEXTAREA',
    value,
    selectionStart: start,
    selectionEnd: end,
    parentElement: null,
    focus() {},
    setSelectionRange(s, e) {
      this.selectionStart = s;
      this.selectionEnd = e;
    },
    dispatchEvent() {},
  };
}

export function attachCopilotSpy(g) {
  const calls = [];
  g.GoldspireVeilCopilotUI = {
    showVeilCopilot: (opts) => {
      calls.push(opts);
      opts.onDismiss?.();
    },
  };
  return calls;
}
