import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadActionsStack() {
  const g = {
    GoldspireConstants: { ORG_API_BASE: 'https://api.test' },
    GoldspireSettings: {
      isVeilActive: (s) => s?.copilotEnabled === true || s?.dlpMode === 'observe',
    },
    GoldspireVeilEvents: {
      isEnabled: (s) => s?.copilotEnabled === true || s?.dlpMode === 'observe',
    },
    GoldspireScoring: {
      highestSeverity: (results) =>
        results.reduce((max, entry) => {
          const order = { low: 0, medium: 1, high: 2, critical: 3 };
          return order[entry.severity] > order[max] ? entry.severity : max;
        }, 'low'),
    },
  };

  for (const relativePath of [
    'extension/src/org-capability.js',
    'extension/src/detection/lib-bundle.js',
    'extension/src/actions/mask-text.js',
    'extension/src/actions/registry.js',
    'extension/src/actions/runner.js',
  ]) {
    vm.runInNewContext(readFileSync(join(root, relativePath), 'utf8'), { globalThis: g });
  }

  return g;
}

test('action registry lists encrypt and mask when Veil is active', () => {
  const g = loadActionsStack();
  const settings = { copilotEnabled: true, dlpMode: 'off' };
  const actions = g.GoldspireVeilActionRegistry.listAvailable(
    { source: 'paste', host: 'mail.google.com' },
    settings,
    [{ category: 'credit_card', confidence: 90 }],
  );
  const ids = actions.map((a) => a.id);
  assert.ok(ids.includes('encrypt'));
  assert.ok(ids.includes('mask'));
  assert.ok(ids.includes('ignore'));
});

test('encrypt is unavailable on AI surfaces (sanitize-first)', () => {
  const g = loadActionsStack();
  const gate = g.GoldspireVeilActionRegistry.availabilityFor(
    'encrypt',
    { source: 'ai_prompt', isAiSurface: true },
    { copilotEnabled: true },
  );
  assert.equal(gate.available, false);
  assert.equal(gate.reason, 'sanitize_first_on_ai');
});

test('recommendPrimary prefers mask on AI and encrypt on email paste', () => {
  const g = loadActionsStack();
  const detections = [{ category: 'api_key', severity: 'critical', confidence: 95 }];

  assert.equal(
    g.GoldspireVeilActionRegistry.recommendPrimary(detections, { source: 'ai_prompt' }),
    'block',
  );
  assert.equal(
    g.GoldspireVeilActionRegistry.recommendPrimary(detections, { source: 'paste' }),
    'encrypt',
  );
});

test('maskSensitiveText masks credit card numbers', () => {
  const g = loadActionsStack();
  const card = '4111111111111111';
  const masked = g.GoldspireVeilMask.maskSensitiveText(`pay ${card} now`, { source: 'paste' });
  assert.ok(!masked.includes(card));
  assert.ok(masked.includes('*'));
});

test('execute encrypt delegates to secureSelection', async () => {
  const g = loadActionsStack();
  let called = false;
  g.GoldspireVeilActions.registerDeps({
    secureSelection: async () => {
      called = true;
      return { handled: true };
    },
    getSelectionContext: () => ({ selectedText: 'secret', kind: 'input' }),
  });

  const result = await g.GoldspireVeilActions.execute('encrypt', {
    settings: { copilotEnabled: true },
    selectionContext: { selectedText: 'secret' },
    context: { source: 'selection' },
    detections: [{ category: 'password', confidence: 80 }],
  });

  assert.equal(called, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, 'encrypt');
});

test('tokenize returns coming soon stub', async () => {
  const g = loadActionsStack();
  g.GoldspireVeilTokens = {
    createToken: async () => ({ ok: false, error: 'org_required' }),
  };
  g.GoldspireVeilActions.registerDeps({});
  const result = await g.GoldspireVeilActions.execute('tokenize', {
    settings: { copilotEnabled: true, orgProvisionSource: 'cloud', orgId: 'test' },
    selectionContext: { selectedText: 'secret' },
    context: { source: 'selection' },
    detections: [{ category: 'password', confidence: 80 }],
  });
  assert.equal(result.ok, false);
});

test('tokenize replaces selection with veil placeholder', async () => {
  const g = loadActionsStack();
  let replaced = null;
  g.GoldspireVeilTokens = {
    createToken: async () => ({
      ok: true,
      tokenId: 'vt_test',
      placeholder: '[veil:vt_test]',
    }),
  };
  g.GoldspireVeilActions.registerDeps({
    replaceSelection: (_context, text) => {
      replaced = text;
    },
  });
  const result = await g.GoldspireVeilActions.execute('tokenize', {
    settings: {
      copilotEnabled: true,
      orgProvisionSource: 'cloud',
      orgId: 'test',
      passphrase: 'team-passphrase-ok-2026',
    },
    selectionContext: { kind: 'input', selectedText: 'sk-live-abc', start: 0, end: 11 },
    text: 'sk-live-abc',
    context: { source: 'paste' },
    detections: [{ category: 'api_key', confidence: 95 }],
  });
  assert.equal(result.ok, true);
  assert.equal(replaced, '[veil:vt_test]');
});
