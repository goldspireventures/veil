/**
 * Extension journey scenarios — simulate user paths without a browser.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import {
  loadExtensionCrypto,
  loadExtensionModule,
  loadVeilStack,
  polyfillBrowserGlobals,
  repoRoot,
} from './helpers.mjs';

test('journey: user pastes API key → copilot offers mask → masked text inserted', async () => {
  const g = loadVeilStack();
  const apiKey = 'sk-live-abcdefghijklmnopqrstuvwxyz';
  const context = { source: 'paste', host: 'mail.google.com' };
  const detections = g.GoldspireDetection.analyze(apiKey, context);
  assert.ok(detections.some((d) => d.category === 'api_key'));

  const settings = { copilotEnabled: true, dlpMode: 'off' };
  const actions = g.GoldspireVeilCopilot.listCopilotActions(context, settings, detections);
  const ids = actions.map((a) => a.id);
  assert.ok(ids.includes('encrypt'));
  assert.ok(ids.includes('mask'));
  assert.ok(ids.includes('ignore'));

  const masked = await g.GoldspireVeilCopilot.applyPasteAction('mask', {
    text: apiKey,
    context,
    detections,
    settings,
    caret: {},
  });
  assert.ok(masked.inserted.includes('*'));
  assert.ok(!masked.inserted.includes(apiKey));
});

test('journey: AI prompt surface → sanitize-first, no encrypt', () => {
  const g = loadVeilStack();
  const context = { source: 'ai_prompt', isAiSurface: true, host: 'chatgpt.com' };
  const detections = [{ category: 'api_key', severity: 'critical', confidence: 95 }];
  const settings = { copilotEnabled: true };

  const actions = g.GoldspireVeilCopilot.listCopilotActions(context, settings, detections);
  const ids = actions.map((a) => a.id);
  assert.ok(!ids.includes('encrypt'));
  assert.ok(ids.includes('mask') || actions.some((a) => a.label === 'Sanitize'));

  const encryptGate = g.GoldspireVeilActionRegistry.availabilityFor('encrypt', context, settings);
  assert.equal(encryptGate.available, false);
});

test('journey: DLP enforce blocks API key on paste', () => {
  const g = loadVeilStack();
  const settings = {
    dlpMode: 'enforce',
    dlpPolicy: {
      enabled: true,
      defaultAction: 'warn',
      categories: { api_key: { action: 'block', minSeverity: 'high' } },
    },
  };
  const detections = [{ category: 'api_key', severity: 'critical', confidence: 95 }];
  const result = g.GoldspirePolicyEngine.evaluate(detections, { source: 'paste' }, settings);
  assert.equal(result.action, 'block');
  assert.equal(result.enforced, true);
});

test('journey: team DLP overlay blocks stricter than org default', () => {
  const g = loadVeilStack();
  const settings = {
    dlpMode: 'enforce',
    dlpPolicy: {
      enabled: true,
      categories: { api_key: { action: 'warn', minSeverity: 'high' } },
    },
    teamDlpPolicy: {
      enabled: true,
      categories: { api_key: { action: 'block', minSeverity: 'high' } },
    },
  };
  const detections = [{ category: 'api_key', severity: 'critical', confidence: 95 }];
  const result = g.GoldspirePolicyEngine.evaluate(detections, { source: 'paste' }, settings);
  assert.equal(result.action, 'block');
});

test('journey: tokenize encrypts locally and formats placeholder', async () => {
  const crypto = loadExtensionCrypto();
  const g = loadVeilStack({
    GoldspireSecureCrypto: crypto,
    GoldspireVeilTokenApi: {
      createTokenRecord: async () => ({ tokenId: 'vt_scenario_test', expiresAt: new Date().toISOString() }),
    },
  });

  const settings = {
    copilotEnabled: true,
    orgProvisionSource: 'cloud',
    orgId: 'scenario-org',
    securityProfile: 'organization',
    passphrase: 'Scenario-Team-Passphrase-2026!',
  };

  const created = await g.GoldspireVeilTokens.createToken('my-secret-password', settings, {
    category: 'password',
    unlockSecret: settings.passphrase,
  });
  assert.equal(created.ok, true);
  assert.equal(created.placeholder, '[veil:vt_scenario_test]');

  const ciphertext = await crypto.encryptText('my-secret-password', settings.passphrase, {
    mode: 'team',
    profile: 'organization',
  });
  assert.ok(ciphertext.length > 20);
});

test('journey: cloud sync payload carries team DLP into effective policy', () => {
  const g = loadVeilStack();
  const settings = {
    dlpMode: 'enforce',
    dlpPolicy: { enabled: true, categories: { api_key: { action: 'warn', minSeverity: 'high' } } },
    orgTeamId: 'team-eng',
    orgTeamName: 'Engineering',
    teamDlpPolicy: {
      enabled: true,
      categories: { api_key: { action: 'block', minSeverity: 'high' } },
    },
  };
  const policy = g.GoldspireDlpSchema.policyFromSettings(settings);
  assert.equal(policy.categories.api_key.action, 'block');
});

test('journey: events never include matched content keys', () => {
  const g = loadExtensionModule('extension/src/events/bus.js', {
    GoldspireBrowser: {
      storageGet: async () => ({}),
      storage: { local: { set: (_d, cb) => cb?.() } },
    },
    GoldspireSettings: { load: async () => ({ copilotEnabled: true }) },
  });

  const entry = g.GoldspireVeilEvents.sanitizeEntry({
    type: 'detection',
    category: 'credit_card',
    matchedText: '4111111111111111',
    plaintext: 'should-not-appear',
    confidence: 90,
  });
  const blob = JSON.stringify(entry);
  assert.ok(!blob.includes('matchedText'));
  assert.ok(!blob.includes('plaintext'));
  assert.ok(!blob.includes('4111'));
});

test('journey: AI intercept blocks when policy enforces on ChatGPT host', async () => {
  const g = loadVeilStack();
  const adapter = g.GoldspireAiFramework.matchAdapter({ hostname: 'chatgpt.com' });
  assert.equal(adapter?.id, 'chatgpt');

  const settings = {
    copilotEnabled: true,
    dlpMode: 'enforce',
    dlpPolicy: {
      enabled: true,
      aiSurfaces: {
        defaultAction: 'block',
        categories: { api_key: { action: 'block', minSeverity: 'high' } },
      },
      categories: {},
    },
  };

  const text = 'use key sk-live-abcdefghijklmnopqrst';
  const context = g.GoldspireAiFramework.buildAiContext(adapter);
  const detections = g.GoldspireDetection.analyze(text, context);
  const policy = g.GoldspirePolicyEngine.evaluate(detections, context, settings);
  assert.equal(policy.action, 'block');
});

test('journey: secure encrypt/decrypt roundtrip (team mode)', async () => {
  const crypto = loadExtensionCrypto();
  const passphrase = 'Scenario-Team-Passphrase-2026!';
  const plaintext = 'Customer SSN 078-05-1120';
  const payload = await crypto.encryptText(plaintext, passphrase, {
    mode: 'team',
    profile: 'organization',
  });
  const decrypted = await crypto.decryptText(payload, passphrase, {
    mode: 'team',
    profile: 'organization',
  });
  assert.equal(decrypted, plaintext);
});
