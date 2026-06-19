import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const libPath = join(root, 'extension/src/detection/lib-bundle.js');

export function loadDetectionLib() {
  const sandbox = { globalThis: {} };
  vm.runInNewContext(readFileSync(libPath, 'utf8'), sandbox);
  vm.runInNewContext(readFileSync(join(root, 'extension/src/detection/context-resolve.js'), 'utf8'), sandbox);
  vm.runInNewContext(readFileSync(join(root, 'extension/src/detection/gating.js'), 'utf8'), sandbox);
  return sandbox.globalThis.GoldspireDetectionLib;
}

export function loadDetectionEngine() {
  const contextCode = readFileSync(join(root, 'extension/src/detection/context.js'), 'utf8');
  const scoringCode = readFileSync(join(root, 'extension/src/detection/scoring.js'), 'utf8');
  const engineCode = readFileSync(join(root, 'extension/src/detection/engine.js'), 'utf8');
  const sandbox = { globalThis: {} };
  vm.runInNewContext(contextCode, sandbox);
  vm.runInNewContext(scoringCode, sandbox);
  vm.runInNewContext(engineCode, sandbox);
  return sandbox.globalThis.GoldspireDetection;
}
