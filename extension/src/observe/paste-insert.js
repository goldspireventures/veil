/**
 * Insert/replace text at paste caret for Veil copilot actions.
 */
(function (global) {
  function resolveElement(target) {
    if (!target) return null;
    if (typeof Element !== 'undefined' && target instanceof Element) return target;
    if (target.tagName) return target;
    return target.parentElement || null;
  }

  function getCaretState(target) {
    const element = resolveElement(target);
    if (!element) return null;

    if (
      (typeof HTMLInputElement !== 'undefined' && element instanceof HTMLInputElement)
      || String(element.tagName || '').toUpperCase() === 'INPUT'
    ) {
      const start = element.selectionStart ?? element.value.length;
      const end = element.selectionEnd ?? start;
      return { kind: 'input', element, start, end };
    }

    if (
      (typeof HTMLTextAreaElement !== 'undefined' && element instanceof HTMLTextAreaElement)
      || String(element.tagName || '').toUpperCase() === 'TEXTAREA'
    ) {
      const start = element.selectionStart ?? element.value.length;
      const end = element.selectionEnd ?? start;
      return { kind: 'input', element, start, end };
    }

    const sel = global.window?.getSelection?.() || global.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0).cloneRange();
    return { kind: 'range', range, selection: sel };
  }

  function insertAtCaret(caret, text) {
    if (!caret) return null;
    const replacement = String(text ?? '');

    if (caret.kind === 'input') {
      const { element, start, end } = caret;
      const before = element.value.slice(0, start);
      const after = element.value.slice(end);
      element.value = `${before}${replacement}${after}`;
      const cursorStart = before.length;
      const cursorEnd = cursorStart + replacement.length;
      element.focus();
      element.setSelectionRange(cursorStart, cursorEnd);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        kind: 'input',
        element,
        start: cursorStart,
        end: cursorEnd,
        selectedText: replacement,
      };
    }

    const range = caret.range;
    const selection = caret.selection || window.getSelection();
    range.deleteContents();
    const node = document.createTextNode(replacement);
    range.insertNode(node);
    const after = document.createRange();
    after.setStartBefore(node);
    after.setEndAfter(node);
    selection?.removeAllRanges?.();
    selection?.addRange?.(after);

    const root = global.GoldspireEditorHost?.findComposeRoot?.({ range: after })
      || node.parentElement?.closest?.('[contenteditable=""], [contenteditable="true"]');
    global.GoldspireEditorHost?.notifyEditor?.(root)
      || root?.dispatchEvent?.(new Event('input', { bubbles: true }));

    return {
      kind: 'range',
      selectedText: replacement,
      range: after,
      selection,
    };
  }

  function simulatePaste(target, text) {
    return insertAtCaret(getCaretState(target), text);
  }

  function readFieldState(target) {
    const element = resolveElement(target);
    if (!element) return null;

    if (
      (typeof HTMLInputElement !== 'undefined' && element instanceof HTMLInputElement)
      || String(element.tagName || '').toUpperCase() === 'INPUT'
      || (typeof HTMLTextAreaElement !== 'undefined' && element instanceof HTMLTextAreaElement)
      || String(element.tagName || '').toUpperCase() === 'TEXTAREA'
    ) {
      return {
        kind: 'input',
        element,
        text: element.value || '',
      };
    }

    const root = global.GoldspireEditorHost?.closestEditable?.(element) || element;
    if (!root) return null;
    return {
      kind: 'contenteditable',
      element: root,
      text: root.innerText || root.textContent || '',
    };
  }

  function findRawMatch(text, detections) {
    const input = String(text || '');
    if (!input || !detections?.length) return null;

    const lib = global.GoldspireDetectionLib;
    if (!lib) return null;

    const categories = [...new Set(detections.map((hit) => hit.category).filter(Boolean))];
    const finders = {
      api_key: () => lib.findApiKeys?.(input) || [],
      credit_card: () => lib.findCreditCards?.(input) || [],
      jwt: () => lib.findJwts?.(input) || [],
      email: () => lib.findEmails?.(input) || [],
      phone: () => lib.findPhones?.(input) || [],
      password: () => lib.findPasswords?.(input) || [],
      iban: () => lib.findIbans?.(input) || [],
      routing_number: () => lib.findRoutingNumbers?.(input) || [],
      swift_bic: () => lib.findSwiftBics?.(input) || [],
      tax_id: () => lib.findTaxIds?.(input) || [],
      nhs_number: () => lib.findNhsNumbers?.(input) || [],
      date_of_birth: () => lib.findDatesOfBirth?.(input) || [],
      ssn: () => lib.findSsns?.(input) || [],
      medical_record: () => lib.findMedicalRecordNumbers?.(input) || [],
      internal_ref: () => lib.findInternalCompanyRefs?.(input) || [],
    };

    let best = null;
    for (const category of categories) {
      const matches = finders[category]?.() || [];
      for (const match of matches) {
        const raw = match.matchedTextRaw || '';
        if (!raw) continue;
        const confidence = Number(match.confidence) || 0;
        if (!best || confidence > best.confidence || raw.length > best.raw.length) {
          best = {
            raw,
            start: typeof match.index === 'number' ? match.index : input.indexOf(raw),
            end: (typeof match.index === 'number' ? match.index : input.indexOf(raw)) + raw.length,
            category,
            confidence,
          };
        }
      }
    }

    if (!best || best.start < 0) return null;
    return best;
  }

  function buildSelectionForMatch(fieldState, match) {
    if (!fieldState || !match?.raw) return null;

    if (fieldState.kind === 'input') {
      const { element } = fieldState;
      const start = fieldState.text.indexOf(match.raw, Math.max(0, match.start - 4));
      const resolvedStart = start === -1 ? match.start : start;
      const end = resolvedStart + match.raw.length;
      element.focus();
      element.setSelectionRange(resolvedStart, end);
      return {
        kind: 'input',
        element,
        selectedText: match.raw,
        start: resolvedStart,
        end,
      };
    }

    const root = fieldState.element;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    let offset = 0;
    const targetStart = match.start;
    const targetEnd = match.end;

    while ((node = walker.nextNode())) {
      const len = node.textContent.length;
      const nodeStart = offset;
      const nodeEnd = offset + len;
      if (targetEnd <= nodeStart) break;
      if (targetStart < nodeEnd && targetEnd > nodeStart) {
        const range = document.createRange();
        const localStart = Math.max(0, targetStart - nodeStart);
        const localEnd = Math.min(len, targetEnd - nodeStart);
        range.setStart(node, localStart);
        range.setEnd(node, localEnd);
        const selection = window.getSelection();
        selection?.removeAllRanges?.();
        selection?.addRange?.(range);
        root.focus?.();
        return {
          kind: 'range',
          selectedText: match.raw,
          range,
          selection,
        };
      }
      offset += len;
    }

    return null;
  }

  function replaceFieldMatch(fieldState, searchText, replacement) {
    if (!fieldState || !searchText) return null;
    const needle = String(searchText);
    const value = String(replacement ?? '');

    if (fieldState.kind === 'input') {
      const { element } = fieldState;
      const start = element.value.indexOf(needle);
      if (start === -1) return null;
      const end = start + needle.length;
      const before = element.value.slice(0, start);
      const after = element.value.slice(end);
      element.value = `${before}${value}${after}`;
      const cursor = before.length + value.length;
      element.focus();
      element.setSelectionRange(cursor, cursor);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return buildSelectionForMatch(
        { kind: 'input', element, text: element.value },
        { raw: value, start: before.length, end: cursor },
      );
    }

    const root = fieldState.element;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(needle);
      if (idx === -1) continue;
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + needle.length);
      range.deleteContents();
      range.insertNode(document.createTextNode(value));
      global.GoldspireEditorHost?.notifyEditor?.(root);
      return buildSelectionForMatch(
        { kind: 'contenteditable', element: root, text: root.innerText || root.textContent || '' },
        { raw: value, start: 0, end: value.length },
      );
    }
    return null;
  }

  global.GoldspirePasteInsert = {
    getCaretState,
    insertAtCaret,
    simulatePaste,
    readFieldState,
    findRawMatch,
    buildSelectionForMatch,
    replaceFieldMatch,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
