import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('veil token detector wires clickable buttons', () => {
  const g = {
    GoldspireVeilTokenFormat: {
      findAllInText(text) {
        const match = String(text).match(/\[veil:(vt_[A-Za-z0-9_-]+)\]/);
        if (!match) return [];
        return [{ tokenId: match[1], placeholder: match[0], index: match.index }];
      },
      parsePlaceholder(text) {
        const match = String(text).match(/\[veil:(vt_[A-Za-z0-9_-]+)\]/);
        return match ? { tokenId: match[1], placeholder: match[0], index: 0 } : null;
      },
    },
    GoldspireVeilTokens: {
      canUseTokens: async () => true,
    },
    GoldspireBrowser: { storage: { onChanged: { addListener() {} } } },
    document: {
      documentElement: {},
      createTreeWalker() {
        return { nextNode: () => null };
      },
      createElement(tag) {
        return {
          type: '',
          classList: { add() {} },
          dataset: {},
          addEventListener() {},
          textContent: '',
        };
      },
      createDocumentFragment() {
        return { appendChild() {} };
      },
      createTextNode() {
        return {};
      },
    },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    window: {
      requestAnimationFrame(fn) {
        fn();
      },
    },
    MutationObserver: class {
      observe() {}
    },
  };
  g.globalThis = g;
  g.self = g;
  g.window = g.window;

  vm.runInNewContext(readFileSync(join(root, 'extension/src/tokens/detector.js'), 'utf8'), g);

  let resolved = null;
  g.GoldspireVeilTokenDetector.scanDocument((tokenId) => {
    resolved = tokenId;
  });
  assert.equal(resolved, null);
});

test('isVeilToken matches placeholder selection', () => {
  const g = {};
  vm.runInNewContext(readFileSync(join(root, 'extension/src/tokens/format.js'), 'utf8'), { globalThis: g });
  assert.equal(g.GoldspireVeilTokenFormat.isVeilToken('[veil:vt_abc123]'), true);
  assert.equal(g.GoldspireVeilTokenFormat.isVeilToken('hello'), false);
});

test('padPlaceholder adds spacing around token text', () => {
  const g = {};
  vm.runInNewContext(readFileSync(join(root, 'extension/src/tokens/format.js'), 'utf8'), { globalThis: g });
  const ph = '[veil:vt_abc]';
  assert.equal(g.GoldspireVeilTokenFormat.padPlaceholder(ph, 'x', 'y'), ` ${ph} `);
  assert.equal(g.GoldspireVeilTokenFormat.padPlaceholder(ph, ' ', 'y'), `${ph} `);
  assert.equal(g.GoldspireVeilTokenFormat.padPlaceholder(ph, 'x', ' '), ` ${ph}`);
  assert.equal(
    g.GoldspireVeilTokenFormat.padPlaceholderForRequest(ph, {
      fieldState: { text: 'hellosecretworld' },
      match: { raw: 'secret', start: 5 },
    }),
    ` ${ph} `,
  );
});

test('tokenize action requires org when tokens unavailable', async () => {
  const g = {
    GoldspireSettings: {
      isVeilActive: (s) => s?.copilotEnabled === true,
    },
    GoldspireVeilEvents: { isEnabled: () => false },
    GoldspireScoring: { highestSeverity: () => 'low' },
    GoldspireVeilTokens: {
      createToken: async () => ({ ok: false, error: 'org_required' }),
    },
  };
  for (const relativePath of [
    'extension/src/detection/lib-bundle.js',
    'extension/src/actions/mask-text.js',
    'extension/src/actions/registry.js',
    'extension/src/actions/runner.js',
  ]) {
    vm.runInNewContext(readFileSync(join(root, relativePath), 'utf8'), { globalThis: g });
  }
  g.GoldspireVeilActions.registerDeps({});
  const result = await g.GoldspireVeilActions.execute('tokenize', {
    settings: { copilotEnabled: true, orgProvisionSource: 'cloud', orgId: 'org-1' },
    selectionContext: { selectedText: 'secret-key-12345' },
    context: { source: 'selection' },
    detections: [{ category: 'api_key', confidence: 95 }],
  });
  assert.equal(result.ok, false);
});
