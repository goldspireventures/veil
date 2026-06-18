/**
 * Veil secure token placeholder format — [veil:vt_…]
 */
(function (global) {
  const TOKEN_PATTERN = /\[veil:(vt_[A-Za-z0-9_-]+)\]/g;
  const TOKEN_TEST = /\[veil:(vt_[A-Za-z0-9_-]+)\]/;

  function formatPlaceholder(tokenId) {
    return `[veil:${String(tokenId || '').trim()}]`;
  }

  function parsePlaceholder(text) {
    const input = String(text || '');
    const match = input.match(TOKEN_TEST);
    if (!match) return null;
    return {
      tokenId: match[1],
      placeholder: match[0],
      index: input.indexOf(match[0]),
    };
  }

  function findAllInText(text) {
    const input = String(text || '');
    const results = [];
    let match;
    const pattern = new RegExp(TOKEN_PATTERN.source, 'g');
    while ((match = pattern.exec(input)) !== null) {
      results.push({
        tokenId: match[1],
        placeholder: match[0],
        index: match.index,
      });
    }
    return results;
  }

  function isVeilToken(text) {
    return TOKEN_TEST.test(String(text || ''));
  }

  function padPlaceholder(placeholder, beforeChar, afterChar) {
    let out = String(placeholder || '');
    const before = String(beforeChar || '');
    const after = String(afterChar || '');
    if (before && !/\s/.test(before)) out = ` ${out}`;
    if (after && !/\s/.test(after)) out = `${out} `;
    return out;
  }

  function padPlaceholderForRequest(placeholder, request = {}) {
    let before = '';
    let after = '';

    if (request.fieldState?.text && request.match?.raw) {
      const hay = request.fieldState.text;
      const idx = typeof request.match.start === 'number'
        ? request.match.start
        : hay.indexOf(request.match.raw);
      if (idx >= 0) {
        before = hay.charAt(idx - 1);
        after = hay.charAt(idx + request.match.raw.length);
      }
    } else if (request.selectionContext?.kind === 'input') {
      const { element, start, end } = request.selectionContext;
      before = element.value.charAt(start - 1);
      after = element.value.charAt(end);
    } else if (request.selectionContext?.range) {
      try {
        const range = request.selectionContext.range;
        const beforeRange = range.cloneRange();
        beforeRange.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
        beforeRange.setEnd(range.startContainer, range.startOffset);
        before = beforeRange.toString();
        const afterRange = range.cloneRange();
        afterRange.setStart(range.endContainer, range.endOffset);
        afterRange.setEnd(range.endContainer, range.endOffset + 1);
        after = afterRange.toString();
      } catch {
        // Range may be stale in some editors.
      }
    }

    return padPlaceholder(placeholder, before, after);
  }

  global.GoldspireVeilTokenFormat = {
    formatPlaceholder,
    parsePlaceholder,
    findAllInText,
    isVeilToken,
    padPlaceholder,
    padPlaceholderForRequest,
    TOKEN_TEST,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
