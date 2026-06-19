/**
 * Ctrl/Cmd + drag to accumulate non-contiguous word selections (contenteditable).
 */
(function (global) {
  const heldRanges = [];
  let chaining = false;
  let anchorEditable = null;

  function isEditableTarget(node) {
    if (!node) return null;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!el) return null;
    if (global.GoldspireEditorHost?.closestEditable) {
      return global.GoldspireEditorHost.closestEditable(el);
    }
    return el.closest?.('[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]') || null;
  }

  function sameEditable(a, b) {
    return Boolean(a && b && a === b);
  }

  function rangesEqual(a, b) {
    if (!a || !b) return false;
    return a.startContainer === b.startContainer
      && a.endContainer === b.endContainer
      && a.startOffset === b.startOffset
      && a.endOffset === b.endOffset;
  }

  function applyHeldRanges() {
    const selection = window.getSelection();
    if (!selection || heldRanges.length === 0) return;
    selection.removeAllRanges();
    for (const range of heldRanges) {
      selection.addRange(range.cloneRange());
    }
    global.GoldspireSelection?.captureSelection?.();
  }

  function resetChain() {
    chaining = false;
    anchorEditable = null;
    heldRanges.length = 0;
  }

  function initMultiWordSelection() {
    document.addEventListener('mousedown', (event) => {
      if (event.ctrlKey || event.metaKey) {
        chaining = true;
        return;
      }
      resetChain();
    }, true);

    document.addEventListener('mouseup', (event) => {
      if (!(event.ctrlKey || event.metaKey) || !chaining) return;

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

      const editable = isEditableTarget(selection.anchorNode);
      if (!editable) return;

      if (anchorEditable && !sameEditable(anchorEditable, editable)) {
        resetChain();
        anchorEditable = editable;
      } else if (!anchorEditable) {
        anchorEditable = editable;
      }

      const next = selection.getRangeAt(0).cloneRange();
      if (heldRanges.some((range) => rangesEqual(range, next))) {
        applyHeldRanges();
        return;
      }

      heldRanges.push(next);
      applyHeldRanges();
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') resetChain();
    }, true);
  }

  global.GoldspireMultiSelect = {
    initMultiWordSelection,
    resetChain,
    getHeldRangeCount: () => heldRanges.length,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
