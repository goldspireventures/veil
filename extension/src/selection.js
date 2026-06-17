/**
 * Reliable selection capture for inputs, textareas, and contenteditable editors.
 * Caches the last selection so popup / context-menu actions still work after focus changes.
 */
(function (global) {
  const CACHE_TTL_MS = 60_000;
  let cached = null;

  function editableRootForRange(range) {
    const node = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    if (global.GoldspireEditorHost?.closestEditable) {
      return global.GoldspireEditorHost.closestEditable(node);
    }
    return node?.closest?.('[contenteditable=""], [contenteditable="true"]') || null;
  }

  function isEditableElement(element) {
    if (!element) return false;
    if (element instanceof HTMLInputElement) {
      return !element.readOnly && !element.disabled && /^(?:text|password|search|email|url|tel)$/i.test(element.type || 'text');
    }
    if (element instanceof HTMLTextAreaElement) {
      return !element.readOnly && !element.disabled;
    }
    if (element.isContentEditable) return true;
    if (element.getAttribute?.('role') === 'textbox') return true;
    if (element.getAttribute?.('contenteditable') != null) return true;
    return false;
  }

  function readInputSelection(element) {
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    const selectedText = element.value.slice(start, end);
    if (!selectedText || start === end) return null;
    return {
      kind: 'input',
      element,
      selectedText,
      start,
      end,
    };
  }

  function readRangeSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

    const selectedText = selection.toString();
    if (!selectedText.trim()) return null;

    const ranges = [];
    for (let i = 0; i < selection.rangeCount; i += 1) {
      const range = selection.getRangeAt(i);
      const text = range.toString();
      if (!text.trim()) continue;
      ranges.push({
        range: range.cloneRange(),
        selectedText: text,
      });
    }
    if (ranges.length === 0) return null;

    const editableRoot = editableRootForRange(ranges[0].range);

    if (ranges.length === 1) {
      return {
        kind: 'range',
        selection,
        range: ranges[0].range,
        selectedText: ranges[0].selectedText,
        editableRoot,
      };
    }

    return {
      kind: 'multi-range',
      selection,
      ranges,
      rangeCount: ranges.length,
      selectedText,
      editableRoot,
    };
  }

  function buildSelectionContext() {
    const active = document.activeElement;

    if (active && isEditableElement(active)) {
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        const inputSelection = readInputSelection(active);
        if (inputSelection) return inputSelection;
      }
    }

    const rangeSelection = readRangeSelection();
    if (rangeSelection) return rangeSelection;

    if (active && isEditableElement(active) && active instanceof HTMLElement) {
      const nested = readRangeSelection();
      if (nested) return nested;
    }

    return null;
  }

  // Insertion context (caret) for contenteditable and inputs with no selection.
  function buildInsertionContext() {
    const active = document.activeElement;

    if (active && isEditableElement(active)) {
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        const start = active.selectionStart ?? active.value.length;
        const end = active.selectionEnd ?? start;
        return {
          kind: 'input',
          element: active,
          selectedText: active.value.slice(start, end) || '',
          start,
          end,
        };
      }
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    return {
      kind: 'range',
      selection,
      range: range.cloneRange(),
      selectedText: selection.toString() || '',
      editableRoot: editableRootForRange(range),
    };
  }

  function remember(context) {
    if (!context?.selectedText?.trim()) return null;

    if (context.kind === 'input') {
      cached = {
        at: Date.now(),
        context: {
          kind: 'input',
          selectedText: context.selectedText,
          start: context.start,
          end: context.end,
          element: context.element,
        },
      };
      return context;
    }

    if (context.kind === 'multi-range') {
      cached = {
        at: Date.now(),
        context: {
          kind: 'multi-range',
          selectedText: context.selectedText,
          rangeCount: context.rangeCount,
          ranges: context.ranges.map((entry) => ({
            selectedText: entry.selectedText,
            range: entry.range.cloneRange(),
          })),
        },
      };
      return context;
    }

    cached = {
      at: Date.now(),
      context: {
        kind: 'range',
        selectedText: context.selectedText,
        range: context.range.cloneRange(),
      },
    };
    return context;
  }

  function restoreCached() {
    if (!cached || Date.now() - cached.at > CACHE_TTL_MS) return null;

    const stored = cached.context;
    if (stored.kind === 'input') {
      const { element, start, end, selectedText } = stored;
      if (!element?.isConnected) return null;
      const current = element.value.slice(start, end);
      if (current !== selectedText) {
        const index = element.value.indexOf(selectedText);
        if (index === -1) return null;
        return {
          kind: 'input',
          element,
          selectedText,
          start: index,
          end: index + selectedText.length,
        };
      }
      element.focus();
      element.setSelectionRange(start, end);
      return { kind: 'input', element, selectedText, start, end };
    }

    if (stored.kind === 'multi-range') {
      if (!Array.isArray(stored.ranges) || stored.ranges.length === 0) return null;
      const selection = window.getSelection();
      if (!selection) return null;
      selection.removeAllRanges();
      for (const entry of stored.ranges) {
        selection.addRange(entry.range.cloneRange());
      }
      return {
        kind: 'multi-range',
        selection,
        ranges: stored.ranges.map((entry) => ({
          selectedText: entry.selectedText,
          range: entry.range.cloneRange(),
        })),
        rangeCount: stored.rangeCount,
        selectedText: stored.selectedText,
      };
    }

    return {
      kind: 'range',
      selectedText: stored.selectedText,
      range: stored.range.cloneRange(),
      selection: window.getSelection(),
    };
  }

  function clearCache() {
    cached = null;
  }

  function captureSelection() {
    const live = buildSelectionContext();
    if (live?.selectedText?.trim()) return remember(live);
    clearCache();
    return null;
  }

  function getSelectionSummary() {
    const context = buildSelectionContext();
    if (!context?.selectedText?.trim()) return null;

    if (context.kind === 'multi-range' && context.rangeCount > 1) {
      return {
        multi: true,
        count: context.rangeCount,
        chars: context.selectedText.length,
        preview: context.selectedText,
      };
    }

    const preview = context.selectedText.trim();
    return {
      multi: false,
      count: 1,
      chars: preview.length,
      preview,
    };
  }

  function getLivePreview() {
    const summary = getSelectionSummary();
    if (!summary) return '';

    if (summary.multi) {
      return `${summary.count} selections`;
    }

    return summary.preview;
  }

  function getActiveSelection(options = {}) {
    const live = buildSelectionContext();
    if (live?.selectedText?.trim()) return remember(live);

    if (options.allowCached !== false) {
      const restored = restoreCached();
      if (restored?.selectedText?.trim()) return restored;
    }

    if (options.fallbackText?.trim()) {
      return {
        kind: 'fallback',
        selectedText: options.fallbackText,
      };
    }

    return null;
  }

  function initSelectionTracking() {
    document.addEventListener('selectionchange', () => {
      captureSelection();
    });

    document.addEventListener('mouseup', () => {
      window.setTimeout(captureSelection, 0);
    });

    document.addEventListener('keyup', () => {
      captureSelection();
    });

    document.addEventListener(
      'contextmenu',
      () => {
        captureSelection();
      },
      true,
    );
  }

  global.GoldspireSelection = {
    captureSelection,
    getActiveSelection,
    buildSelectionContext,
    buildInsertionContext,
    initSelectionTracking,
    clearCache,
    getLivePreview,
    getSelectionSummary,
    expandSecureTargets(context) {
      if (!context) return [];
      let targets;
      if (context.kind === 'multi-range') {
        if (!Array.isArray(context.ranges) || context.ranges.length === 0) return [];
        targets = context.ranges.map((entry) => ({
          kind: 'range',
          range: entry.range,
          selectedText: entry.selectedText,
          selection: context.selection,
          editableRoot: context.editableRoot,
        }));
      } else {
        targets = [context];
      }

      if (targets.length <= 1) return targets;
      const sameText = targets.every((entry) => entry.selectedText === targets[0].selectedText);
      if (sameText) return [targets[0]];
      return targets;
    },
    getCachedPreview() {
      const stored = cached?.context;
      if (!stored?.selectedText?.trim()) return '';
      if (stored.kind === 'multi-range' && stored.rangeCount > 1) {
        return `${stored.rangeCount} selections`;
      }
      return stored.selectedText.trim();
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
