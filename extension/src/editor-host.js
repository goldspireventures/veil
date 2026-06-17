/**
 * Detect compose surfaces across web apps (Jira, Slack, Notion, Gmail, generic CE, etc.)
 * and insert plain text in a way structured editors accept.
 */
(function (global) {
  const STRUCTURED_EDITOR_SELECTORS = [
    '.ProseMirror',
    '[data-prosemirror-root]',
    '.ql-editor',
    '.tox-edit-area',
    '.cke_editable',
    '.ck-editor__editable',
    '.slate-editor',
    '[data-slate-editor]',
    '.tiptap',
    '.ProseMirror-focused',
    '[role="textbox"][contenteditable]',
    '[contenteditable="true"]',
    '[contenteditable=""]',
    '[contenteditable="plaintext-only"]',
  ].join(',');

  const CODE_EDITOR_SELECTORS = [
    '.monaco-editor',
    '.cm-editor',
    '.CodeMirror',
    '.ace_editor',
  ].join(',');

  function walkAncestors(node, visit) {
    let current = node;
    while (current) {
      if (visit(current) === false) return;
      if (current.parentElement) {
        current = current.parentElement;
        continue;
      }
      const root = current.getRootNode?.();
      if (root instanceof ShadowRoot && root.host) {
        current = root.host;
        continue;
      }
      break;
    }
  }

  function nodeFromRange(range) {
    const container = range?.commonAncestorContainer;
    if (!container) return null;
    return container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  }

  function closestEditable(node) {
    let found = null;
    walkAncestors(node, (el) => {
      if (!(el instanceof Element)) return;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (!el.disabled && !el.readOnly) found = el;
        return false;
      }
      if (el.isContentEditable) {
        found = el;
        return false;
      }
      if (el.getAttribute?.('role') === 'textbox' && el.getAttribute?.('contenteditable') != null) {
        found = el;
        return false;
      }
      if (el.matches?.(STRUCTURED_EDITOR_SELECTORS)) {
        found = el;
        return false;
      }
    });
    return found;
  }

  function isCodeEditor(el) {
    return Boolean(el?.closest?.(CODE_EDITOR_SELECTORS));
  }

  function isStructuredEditor(el) {
    if (!el) return false;
    if (isCodeEditor(el)) return true;
    return Boolean(
      el.closest?.('.ProseMirror, [data-prosemirror-root], .ql-editor, .tox-edit-area, .cke_editable, .ck-editor__editable, .slate-editor, [data-slate-editor], .tiptap')
      || el.classList?.contains('ProseMirror')
      || el.getAttribute?.('data-prosemirror-root') != null,
    );
  }

  function isEmailHost() {
    const host = location.hostname;
    return /mail\.google|outlook\.(live|office)|hotmail|yahoo/.test(host);
  }

  function findComposeRoot(context) {
    if (context?.editableRoot?.isConnected) return context.editableRoot;
    if (context?.element?.isConnected) return context.element;

    const fromRange = context?.range ? closestEditable(nodeFromRange(context.range)) : null;
    if (fromRange) return fromRange;

    const active = document.activeElement;
    if (active) {
      const fromActive = closestEditable(active);
      if (fromActive) return fromActive;
    }

    return (
      document.querySelector('div[contenteditable="true"][role="textbox"]')
      || document.querySelector('div[contenteditable="true"][g_editable="true"]')
      || document.querySelector('div.Am.Al.editable[contenteditable="true"]')
      || document.querySelector(STRUCTURED_EDITOR_SELECTORS)
    );
  }

  function prefersPlainInsertion(context) {
    if (context?.kind === 'input') return true;
    if (isEmailHost()) return false;
    const root = findComposeRoot(context);
    if (!root) return true;
    if (isCodeEditor(root)) return true;
    return true;
  }

  function notifyEditor(root) {
    if (!root) return;
    try {
      root.focus?.();
      root.dispatchEvent(
        new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertReplacementText' }),
      );
      root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
      root.dispatchEvent(new Event('input', { bubbles: true }));
      root.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {
      root.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  async function pastePlainText(text) {
    try {
      if (!navigator.clipboard?.writeText) return false;
      await navigator.clipboard.writeText(text);
      if (document.queryCommandSupported?.('paste')) {
        return document.execCommand('paste');
      }
    } catch {
      return false;
    }
    return false;
  }

  function insertPlainAtRange(resolved, plain) {
    const range = resolved.range.cloneRange();
    const selection = resolved.selection || window.getSelection();
    const root = findComposeRoot(resolved);

    if (root) root.focus?.();
    range.deleteContents();
    selection?.removeAllRanges?.();
    selection?.addRange?.(range);

    let inserted = false;
    let node = null;

    if (document.queryCommandSupported?.('insertText')) {
      inserted = document.execCommand('insertText', false, plain);
    }

    if (!inserted) {
      node = document.createTextNode(plain);
      range.insertNode(node);
      inserted = Boolean(node.parentNode);
    }

    try {
      const after = document.createRange();
      if (node?.parentNode) {
        after.setStartAfter(node);
        after.collapse(true);
      } else if (root) {
        after.selectNodeContents(root);
        after.collapse(false);
      } else {
        after.setStart(range.endContainer, range.endOffset);
        after.collapse(true);
      }
      selection?.removeAllRanges?.();
      selection?.addRange?.(after);
    } catch {
      // Non-critical.
    }

    notifyEditor(root);
    return { inserted, node, root };
  }

  async function insertPlainAtRangeWithFallbacks(resolved, plain) {
    const primary = insertPlainAtRange(resolved, plain);
    if (primary.inserted) return primary;

    const range = resolved.range.cloneRange();
    const selection = resolved.selection || window.getSelection();
    const root = findComposeRoot(resolved);
    if (root) root.focus?.();
    selection?.removeAllRanges?.();
    selection?.addRange?.(range);

    const pasted = await pastePlainText(plain);
    if (pasted) {
      notifyEditor(root);
      return { inserted: true, node: null, root };
    }

    return insertPlainAtRange(resolved, plain);
  }

  function collectShadowRoots(node, out = []) {
    if (!node) return out;
    if (node.shadowRoot) out.push(node.shadowRoot);
    const children = node.querySelectorAll?.('*') || [];
    for (const child of children) {
      if (child.shadowRoot) out.push(child.shadowRoot);
    }
    return out;
  }

  global.GoldspireEditorHost = {
    walkAncestors,
    closestEditable,
    findComposeRoot,
    prefersPlainInsertion,
    isStructuredEditor,
    isCodeEditor,
    isEmailHost,
    insertPlainAtRange,
    insertPlainAtRangeWithFallbacks,
    notifyEditor,
    collectShadowRoots,
    STRUCTURED_EDITOR_SELECTORS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
