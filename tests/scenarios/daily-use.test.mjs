/**
 * Daily-use regression scenarios — copilot toggle, paste, type, Allow, detection.
 * Run without a browser: npm run test:daily-use
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import {
  attachCopilotSpy,
  loadExtensionModule,
  loadVeilStack,
  mockTextarea,
  repoRoot,
} from './helpers.mjs';
import { googleApiKeySample, stripeLiveSample, whsecSample } from './fixtures.mjs';

const STRIPE_SK = stripeLiveSample();
const GOOGLE_KEY = googleApiKeySample();
const WHSEC = whsecSample();

function pasteEvent(text, target) {
  return {
    clipboardData: { getData: () => text },
    target,
    preventDefault() {},
    stopPropagation() {},
  };
}

test('settings migrate coerces copilotEnabled to strict boolean', () => {
  const g = loadExtensionModule('extension/src/settings-migrate.js');
  assert.equal(g.GoldspireSettingsMigrate.migrateSettings({ copilotEnabled: 'on' }).copilotEnabled, true);
  assert.equal(g.GoldspireSettingsMigrate.migrateSettings({ copilotEnabled: true }).copilotEnabled, true);
});

test('copilot off: paste and type do not prompt', async () => {
  const g = loadVeilStack();
  const calls = attachCopilotSpy(g);
  const off = { copilotEnabled: false, dlpMode: 'off' };
  const textarea = mockTextarea('');

  await g.GoldspirePasteObserve.handlePaste(
    pasteEvent(GOOGLE_KEY, textarea),
    async () => off,
    () => off,
  );
  assert.equal(calls.length, 0);

  textarea.value = STRIPE_SK;
  await g.GoldspirePasteObserve.scanTypedField(
    textarea,
    async () => off,
    () => off,
    () => true,
  );
  assert.equal(calls.length, 0);
});

test('stale sync cache with copilot off still prompts after async settings refresh', async () => {
  const g = loadVeilStack();
  const calls = attachCopilotSpy(g);
  const stale = { copilotEnabled: false, dlpMode: 'off' };
  const fresh = { copilotEnabled: true, dlpMode: 'off' };
  const textarea = mockTextarea('');

  await g.GoldspirePasteObserve.handlePaste(
    pasteEvent(GOOGLE_KEY, textarea),
    async () => fresh,
    () => stale,
  );
  assert.equal(calls.length, 1);

  calls.length = 0;
  const input = mockTextarea(STRIPE_SK);
  await g.GoldspirePasteObserve.scanTypedField(
    input,
    async () => fresh,
    () => stale,
    () => true,
  );
  assert.equal(calls.length, 1);
});

test('typing short sk_live prefix alone does not prompt', async () => {
  const g = loadVeilStack();
  const calls = attachCopilotSpy(g);
  const on = { copilotEnabled: true, dlpMode: 'off' };

  await g.GoldspirePasteObserve.scanTypedField(
    mockTextarea('sk_live'),
    async () => on,
    () => on,
    () => true,
  );
  assert.equal(calls.length, 0);
});

test('typing full Stripe sk_live and whsec prompts', async () => {
  const g = loadVeilStack();
  const on = { copilotEnabled: true, dlpMode: 'off' };

  for (const secret of [STRIPE_SK, WHSEC]) {
    const calls = attachCopilotSpy(g);
    await g.GoldspirePasteObserve.scanTypedField(
      mockTextarea(secret),
      async () => on,
      () => on,
      () => true,
    );
    assert.equal(calls.length, 1, `expected prompt for ${secret.slice(0, 12)}…`);
  }
});

test('paste dedupes identical secret within 2 seconds', async () => {
  const g = loadVeilStack();
  const calls = attachCopilotSpy(g);
  const on = { copilotEnabled: true, dlpMode: 'off' };
  const textarea = mockTextarea('');

  await g.GoldspirePasteObserve.handlePaste(pasteEvent(GOOGLE_KEY, textarea), async () => on, () => on);
  await g.GoldspirePasteObserve.handlePaste(pasteEvent(GOOGLE_KEY, textarea), async () => on, () => on);
  assert.equal(calls.length, 1);
});

test('resetPromptState allows a second prompt after dedupe window logic', async () => {
  const g = loadVeilStack();
  const calls = attachCopilotSpy(g);
  const on = { copilotEnabled: true, dlpMode: 'off' };
  const textarea = mockTextarea('');

  await g.GoldspirePasteObserve.handlePaste(pasteEvent(GOOGLE_KEY, textarea), async () => on, () => on);
  g.GoldspirePasteObserve.resetPromptState();
  await g.GoldspirePasteObserve.handlePaste(pasteEvent(GOOGLE_KEY, textarea), async () => on, () => on);
  assert.equal(calls.length, 2);
});

test('snoozed host blocks copilot on paste', async () => {
  const g = loadVeilStack();
  const calls = attachCopilotSpy(g);
  const on = { copilotEnabled: true, dlpMode: 'off' };
  g.location = { hostname: 'partner.microsoft.com' };
  g.GoldspireVeilSnooze.snoozeHost('partner.microsoft.com');

  await g.GoldspirePasteObserve.handlePaste(
    pasteEvent(GOOGLE_KEY, mockTextarea('')),
    async () => on,
    () => on,
  );
  assert.equal(calls.length, 0);
});

test('Allow inserts into the compose target, not a stale caret element', async () => {
  const g = loadVeilStack();
  const compose = mockTextarea('Notes: ');
  const staleCaret = mockTextarea('wrong field');
  const secret = GOOGLE_KEY;
  const caret = { kind: 'input', element: staleCaret, start: 0, end: 0 };

  await g.GoldspireVeilCopilot.applyPasteAction('ignore', {
    text: secret,
    target: compose,
    context: { source: 'paste', host: 'partner.microsoft.com' },
    detections: [{ category: 'api_key', confidence: 92 }],
    settings: { copilotEnabled: true },
    caret,
    fieldState: { element: compose, text: compose.value },
    match: { raw: secret },
  });

  assert.ok(compose.value.includes(secret), 'secret should land in compose field');
  assert.ok(!staleCaret.value.includes(secret), 'stale caret field should stay unchanged');
});

test('insertIntoTarget appends at end when caret points at another element', () => {
  const g = loadVeilStack();
  const field = mockTextarea('Hello ');
  const other = mockTextarea('');
  const caret = { kind: 'input', element: other, start: 0, end: 0 };

  g.GoldspirePasteInsert.insertIntoTarget(field, 'world', caret, { collapseCaret: true });
  assert.equal(field.value, 'Hello world');
});

test('after Allow on a field, re-enabling copilot clears field snooze', async () => {
  const g = loadVeilStack();
  const field = mockTextarea(STRIPE_SK);
  const fieldState = { element: field, text: STRIPE_SK };
  const match = { raw: STRIPE_SK };
  const on = { copilotEnabled: true, dlpMode: 'off' };

  g.GoldspireVeilSnooze.allowComposition('mail.google.com', STRIPE_SK, match, fieldState);
  assert.equal(
    g.GoldspireVeilSnooze.isCompositionAllowed('mail.google.com', STRIPE_SK, match, fieldState),
    true,
  );

  g.GoldspireVeilSnooze.clearCompositionAllows();
  g.GoldspirePasteObserve.resetPromptState();

  const calls = attachCopilotSpy(g);
  await g.GoldspirePasteObserve.scanTypedField(
    field,
    async () => on,
    () => on,
    () => true,
  );
  assert.equal(calls.length, 1);
});

test('findApiKeys detects Stripe prefixes from lib-bundle', () => {
  const libPath = join(repoRoot, 'extension/src/detection/lib-bundle.js');
  const ctx = { globalThis: {} };
  vm.runInNewContext(readFileSync(libPath, 'utf8'), ctx);
  const lib = ctx.globalThis.GoldspireDetectionLib;

  for (const sample of [
    `token ${STRIPE_SK}`,
    WHSEC,
    'sk-test_openai_key_abcdefghijklmnop',
  ]) {
    const hits = lib.findApiKeys(sample);
    assert.ok(hits.length > 0, `expected detection in ${sample.slice(0, 20)}…`);
    assert.ok(hits[0].confidence >= 50);
  }
});
