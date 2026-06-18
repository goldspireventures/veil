import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';
import { loadDetectionEngine, loadDetectionLib } from './load-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function registerBuiltinDetectors(sandbox) {
  const detectorFiles = [
    'extension/src/detection/detectors/credit-card.js',
    'extension/src/detection/detectors/jwt.js',
    'extension/src/detection/detectors/api-key.js',
    'extension/src/detection/detectors/email.js',
    'extension/src/detection/detectors/phone.js',
    'extension/src/detection/detectors/password.js',
    'extension/src/detection/detectors/extended.js',
  ];
  for (const file of detectorFiles) {
    vm.runInNewContext(readFileSync(join(root, file), 'utf8'), sandbox);
  }
}

test('detection engine registers and analyzes credit cards', () => {
  const sandbox = { globalThis: {} };
  sandbox.globalThis.GoldspireDetectionLib = loadDetectionLib();
  vm.runInNewContext(readFileSync(join(root, 'extension/src/detection/context.js'), 'utf8'), sandbox);
  vm.runInNewContext(readFileSync(join(root, 'extension/src/detection/scoring.js'), 'utf8'), sandbox);
  vm.runInNewContext(readFileSync(join(root, 'extension/src/detection/engine.js'), 'utf8'), sandbox);
  registerBuiltinDetectors(sandbox);

  const engine = sandbox.globalThis.GoldspireDetection;
  assert.equal(engine.getDetectors().length, 20);

  const results = engine.analyze('4111111111111111', { source: 'selection' });
  assert.ok(results.length >= 1);
  assert.equal(results[0].category, 'credit_card');
  assert.equal('matchedTextRaw' in results[0], false);
});
