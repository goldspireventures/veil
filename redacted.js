/**
 * [redacted] display — hyperlink for email/rich text, hidden encoding for plain fields.
 */
(function (global) {
  const LABEL = '[redacted]';
  const ZW0 = '\u200B';
  const ZW1 = '\u200C';
  const START = '\u2060';
  const END = '\u2061';
  const COMMENT_PREFIX = 'goldspire:';

  function markerToAttr(marker) {
    return btoa(unescape(encodeURIComponent(marker)));
  }

  function attrToMarker(attr) {
    return decodeURIComponent(escape(atob(attr)));
  }

  function escapeHtmlAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function isHttpsUrl(value) {
    return /^https:\/\/.+/i.test(String(value || '').trim());
  }

  function getUnlockBaseUrl(settings, { forEmail = false } = {}) {
    const custom = settings?.publicUnlockUrl?.trim();
    if (isHttpsUrl(custom)) return custom.replace(/#.*$/, '').replace(/\/$/, '');
    if (forEmail) return '';
    const runtime = global.GoldspireBrowser?.runtime || global.chrome?.runtime || global.browser?.runtime;
    if (runtime?.getURL) return runtime.getURL('unlock/unlock.html');
    return '';
  }

  function buildUnlockHref(fullMarker, unlockBaseUrl) {
    const base = (unlockBaseUrl || '').replace(/#.*$/, '').replace(/\/$/, '');
    if (!base) return '';
    return `${base}#${encodeURIComponent(fullMarker)}`;
  }

  function markerFromHref(href) {
    if (!href) return null;
    const hashIndex = href.indexOf('#');
    if (hashIndex === -1) return null;
    try {
      const decoded = decodeURIComponent(href.slice(hashIndex + 1));
      const parsed = GoldspireSecureMarker.parseMarker(decoded);
      if (!parsed) return null;
      return { ...parsed, fullMarker: decoded, display: LABEL };
    } catch {
      return null;
    }
  }

  function encodeHidden(value) {
    const bytes = new TextEncoder().encode(value);
    let bits = '';
    for (const byte of bytes) {
      bits += byte.toString(2).padStart(8, '0');
    }
    let out = START;
    for (const bit of bits) {
      out += bit === '0' ? ZW0 : ZW1;
    }
    return `${out}${END}`;
  }

  function decodeHidden(text, fromIndex = 0) {
    const slice = text.slice(fromIndex);
    const start = slice.indexOf(START);
    const end = slice.indexOf(END, start + 1);
    if (start === -1 || end === -1) return null;

    const encoded = slice.slice(start + 1, end);
    if (!encoded || !/^[ \u200B\u200C]+$/.test(encoded)) return null;

    const bits = Array.from(encoded, (char) => (char === ZW0 ? '0' : '1')).join('');
    if (bits.length % 8 !== 0) return null;

    const bytes = new Uint8Array(bits.length / 8);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    }
    return new TextDecoder().decode(bytes);
  }

  function formatPlain(fullMarker) {
    return `${LABEL}${encodeHidden(fullMarker)}`;
  }

  function plainTokenLength(text, index) {
    const hidden = decodeHidden(text, index + LABEL.length);
    if (!hidden) return LABEL.length;
    return LABEL.length + encodeHidden(hidden).length;
  }

  function createLink(fullMarker, unlockBaseUrl) {
    const a = document.createElement('a');
    const href = buildUnlockHref(fullMarker, unlockBaseUrl);
    if (href) a.href = href;
    a.textContent = LABEL;
    a.className = 'gst-redacted';
    a.setAttribute('data-gs', markerToAttr(fullMarker));
    a.title = 'Click to unlock';
    return a;
  }

  function createToken(fullMarker, unlockBaseUrl) {
    return createLink(fullMarker, unlockBaseUrl);
  }

  function buildAnchorHtml(fullMarker, unlockBaseUrl) {
    const href = buildUnlockHref(fullMarker, unlockBaseUrl);
    if (!href) return escapeHtmlAttr(LABEL);
    const attr = escapeHtmlAttr(markerToAttr(fullMarker));
    return `<a href="${escapeHtmlAttr(href)}" target="_blank" rel="noopener noreferrer" data-gs="${attr}">${LABEL}</a>&nbsp;`;
  }

  function findComposeRoot(context) {
    if (context?.editableRoot?.isConnected) return context.editableRoot;
    return (
      document.querySelector('div[contenteditable="true"][role="textbox"]')
      || document.querySelector('div[contenteditable="true"][g_editable="true"]')
      || document.querySelector('div.Am.Al.editable[contenteditable="true"]')
      || document.querySelector('[contenteditable="true"]')
    );
  }

  function notifyRichEditor(root) {
    if (!root) return;
    try {
      root.focus();
      root.dispatchEvent(
        new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertFromPaste' }),
      );
      root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
      root.dispatchEvent(new Event('input', { bubbles: true }));
    } catch {
      root.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function findInsertedLink(root, unlockBaseUrl) {
    if (!root) return null;
    const links = Array.from(root.querySelectorAll('a'));
    for (let i = links.length - 1; i >= 0; i -= 1) {
      const link = links[i];
      const text = (link.textContent || '').trim();
      if (text !== LABEL) continue;
      const href = link.getAttribute('href') || link.href || '';
      if (href.includes('#') || href.startsWith('http')) return link;
      if (unlockBaseUrl && href) return link;
    }
    return null;
  }

  async function pasteHtmlAtSelection(html, plainText) {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return document.execCommand('paste');
    } catch {
      return false;
    }
  }

  async function insertRichRedacted(resolved, fullMarker, settings) {
    const unlockBaseUrl = getUnlockBaseUrl(settings, { forEmail: true });
    if (!unlockBaseUrl) {
      throw new Error('PUBLIC_UNLOCK_URL_REQUIRED');
    }

    const href = buildUnlockHref(fullMarker, unlockBaseUrl);
    if (!href) throw new Error('PUBLIC_UNLOCK_URL_REQUIRED');

    const range = resolved.range.cloneRange();
    const editableRoot = findComposeRoot(resolved);
    const selection = resolved.selection || window.getSelection();
    const html = buildAnchorHtml(fullMarker, unlockBaseUrl);

    if (editableRoot) editableRoot.focus();

    range.deleteContents();
    selection.removeAllRanges();
    selection.addRange(range);

    let inserted = false;
    if (document.queryCommandSupported?.('insertHTML')) {
      inserted = document.execCommand('insertHTML', false, html);
    }

    if (!inserted) {
      inserted = await pasteHtmlAtSelection(html, LABEL);
    }

    if (!inserted) {
      const link = createLink(fullMarker, unlockBaseUrl);
      range.insertNode(link);
      link.after(document.createTextNode('\u00A0'));
      inserted = Boolean(link.isConnected);
    }

    notifyRichEditor(editableRoot);

    const linkNode = findInsertedLink(editableRoot || range.commonAncestorContainer?.parentElement, unlockBaseUrl);
    return {
      kind: 'token',
      node: linkNode,
      fullMarker,
      display: LABEL,
      unlockBaseUrl,
      href,
      persistedAsLink: Boolean(linkNode?.getAttribute?.('href')?.includes('#')),
    };
  }

  function markerFromElement(element) {
    if (!element) return null;
    const host = element.classList?.contains('gst-redacted') ? element : element.closest?.('.gst-redacted, a');
    if (!host) return null;

    if (host.tagName === 'A') {
      const fromHref = markerFromHref(host.getAttribute('href') || host.href);
      if (fromHref) return fromHref;
    }

    const attr = host.getAttribute('data-gs');
    if (!attr) return null;
    try {
      const full = attrToMarker(attr);
      const parsed = GoldspireSecureMarker.parseMarker(full);
      return parsed ? { ...parsed, fullMarker: full, display: LABEL } : null;
    } catch {
      return null;
    }
  }

  function markerFromComment(node) {
    if (node?.nodeType !== Node.COMMENT_NODE) return null;
    const value = node.nodeValue || '';
    if (!value.startsWith(COMMENT_PREFIX)) return null;
    try {
      const full = attrToMarker(value.slice(COMMENT_PREFIX.length));
      const parsed = GoldspireSecureMarker.parseMarker(full);
      return parsed ? { ...parsed, fullMarker: full, display: LABEL } : null;
    } catch {
      return null;
    }
  }

  function findCommentMarker(root = document.body) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    while (walker.nextNode()) {
      const marker = markerFromComment(walker.currentNode);
      if (marker) return marker;
    }
    return null;
  }

  function resolveAt(text, index) {
    if (!text || index < 0 || text.slice(index, index + LABEL.length) !== LABEL) return null;

    const hidden = decodeHidden(text, index + LABEL.length);
    if (!hidden) return null;

    const parsed = GoldspireSecureMarker.parseMarker(hidden);
    if (!parsed) return null;

    return {
      ...parsed,
      fullMarker: hidden,
      display: LABEL,
      plainToken: text.slice(index, index + plainTokenLength(text, index)),
      index,
    };
  }

  function findInText(text) {
    if (!text) return null;
    const index = text.indexOf(LABEL);
    if (index === -1) return null;
    return resolveAt(text, index);
  }

  function findAllInText(text) {
    if (!text) return [];
    const results = [];
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const index = text.indexOf(LABEL, searchFrom);
      if (index === -1) break;
      const resolved = resolveAt(text, index);
      if (resolved) results.push(resolved);
      searchFrom = index + LABEL.length;
    }
    return results;
  }

  function isRedactedToken(text) {
    if (!text) return false;
    if (text.includes(LABEL)) return true;
    return GoldspireSecureMarker.isLegacyToken(text);
  }

  function isEmailCompose() {
    const host = location.hostname;
    return /mail\.google|outlook\.(live|office)|hotmail|yahoo/.test(host);
  }

  function isRichEmailContext(context) {
    if (!isEmailCompose()) return false;
    if (context?.kind === 'range') return true;
    const root = findComposeRoot(context);
    return Boolean(root);
  }

  function resolveSelection(context, selectedText) {
    const trimmed = selectedText?.trim() || '';
    if (trimmed === LABEL || trimmed.startsWith(LABEL)) {
      const source = getSourceText(context);
      const local = findInText(selectedText) || findInText(source);
      if (local) return local;
    }

    if (context?.kind === 'range') {
      const el = context.range?.commonAncestorContainer;
      const fromEl = markerFromElement(el?.parentElement || el);
      if (fromEl) return fromEl;
    }

    return GoldspireSecureMarker.resolveSelectionMarker(context, selectedText);
  }

  function getSourceText(context) {
    if (context?.kind === 'input') return context.element?.value || '';
    const editable = findComposeRoot(context) || document.activeElement?.closest?.('[contenteditable=""], [contenteditable="true"]');
    if (editable) return editable.innerText || editable.textContent || '';
    return document.body?.innerText || '';
  }

  async function insertRedacted(context, fullMarker, settings = {}) {
    const resolved = context;
    if (!resolved) return null;

    if (resolved.kind === 'input') {
      const plain = formatPlain(fullMarker);
      const { element, start, end } = resolved;
      const before = element.value.slice(0, start);
      const after = element.value.slice(end);
      element.value = `${before}${plain}${after}`;
      const cursor = before.length + plain.length;
      element.focus();
      element.setSelectionRange(cursor, cursor);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { kind: 'input', element, start: before.length, plainToken: plain, fullMarker };
    }

    if (isRichEmailContext(resolved)) {
      return insertRichRedacted(resolved, fullMarker, settings);
    }

    const unlockBaseUrl = getUnlockBaseUrl(settings);
    const range = resolved.range.cloneRange();
    const selection = resolved.selection || window.getSelection();
    range.deleteContents();

    const link = createLink(fullMarker, unlockBaseUrl);
    range.insertNode(link);
    link.after(document.createTextNode(' '));

    range.setStartAfter(link);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    link.parentElement?.closest('[contenteditable=""], [contenteditable="true"]')?.dispatchEvent(new Event('input', { bubbles: true }));

    return { kind: 'token', node: link, fullMarker, display: LABEL, unlockBaseUrl };
  }

  function needsPublicUnlockUrl(settings) {
    return isEmailCompose() && !isHttpsUrl(settings?.publicUnlockUrl);
  }

  function publicUnlockUrlErrorMessage() {
    return 'Gmail and Outlook only keep https:// links in email. Set Public unlock page URL in extension settings (host the unlock/ folder on GitHub Pages or Netlify).';
  }

  global.GoldspireRedacted = {
    LABEL,
    formatPlain,
    createLink,
    createToken,
    getUnlockBaseUrl,
    buildUnlockHref,
    buildAnchorHtml,
    markerFromHref,
    markerFromElement,
    markerFromComment,
    findCommentMarker,
    resolveAt,
    findInText,
    findAllInText,
    isRedactedToken,
    isEmailCompose,
    isRichEmailContext,
    needsPublicUnlockUrl,
    publicUnlockUrlErrorMessage,
    resolveSelection,
    insertRedacted,
    markerToAttr,
    attrToMarker,
    findComposeRoot,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
