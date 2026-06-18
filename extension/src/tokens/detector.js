/**
 * Veil secure token detector — clickable [veil:vt_…] placeholders in the page.
 */
(function (global) {
  const format = () => global.GoldspireVeilTokenFormat;

  function shouldSkipTextNode(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    if (parent.closest('script,style,textarea,input,option,noscript,code,#goldspire-secure-text-prompt')) {
      return true;
    }
    if (parent.closest('.gst-veil-token-btn, .gst-veil-revealed')) return true;
    if (parent.closest('a.gst-redacted, button.gst-redacted-btn')) return true;
    return false;
  }

  function shouldSkipElement(el) {
    if (!el?.closest) return true;
    if (el.closest('script,style,textarea,input,option,noscript,code,#goldspire-secure-text-prompt')) {
      return true;
    }
    if (el.closest('.gst-veil-token-btn, .gst-veil-revealed')) return true;
    if (el.classList?.contains('gst-veil-token-btn')) return true;
    return false;
  }

  function normalizeTokenText(text) {
    return String(text || '').replace(/\s+/g, '').trim();
  }

  function wireButton(button, tokenId, onResolve) {
    if (button.dataset.gstVeilWired === '1') return;
    button.dataset.gstVeilWired = '1';
    button.dataset.veilTokenId = tokenId;
    button.classList.add('gst-veil-token-btn');
    button.title = 'Click to reveal secure token';
    button.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        onResolve(tokenId, button);
      },
      true,
    );
  }

  function decoratePlainTextNode(node, match, onResolve) {
    const text = node.nodeValue || '';
    const { placeholder, tokenId, index } = match;
    const before = text.slice(0, index);
    const after = text.slice(index + placeholder.length);

    const fragment = document.createDocumentFragment();
    if (before) fragment.appendChild(document.createTextNode(before));

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = placeholder;
    wireButton(button, tokenId, onResolve);
    fragment.appendChild(button);

    if (after) fragment.appendChild(document.createTextNode(after));
    node.parentNode?.replaceChild(fragment, node);
  }

  function decorateElementHost(el, match, onResolve) {
    if (shouldSkipElement(el) || el.dataset.gstVeilHost === '1') return;
    el.dataset.gstVeilHost = '1';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = match.placeholder;
    wireButton(button, match.tokenId, onResolve);

    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(button);
  }

  function isLeafTokenHost(el) {
    const tokenFormat = format();
    if (!tokenFormat?.findAllInText || shouldSkipElement(el)) return null;

    const text = (el.innerText || el.textContent || '').trim();
    if (!text.includes('[veil:')) return null;

    const matches = tokenFormat.findAllInText(text);
    if (matches.length !== 1) return null;

    if (normalizeTokenText(text) !== normalizeTokenText(matches[0].placeholder)) return null;

    for (const child of el.children) {
      if (isLeafTokenHost(child)) return null;
    }

    return matches[0];
  }

  function scanElementHosts(treeRoot, onResolve) {
    if (!treeRoot?.querySelectorAll) return;

    const selector = 'div,p,span,td,th,li,font,b,i,em,strong,a,pre,blockquote';
    treeRoot.querySelectorAll(selector).forEach((el) => {
      const match = isLeafTokenHost(el);
      if (match) decorateElementHost(el, match, onResolve);
    });
  }

  function findTokenFromClickTarget(target, event) {
    const tokenFormat = format();
    if (!tokenFormat?.findAllInText || !target) return null;

    let el = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
    for (let depth = 0; depth < 12 && el; depth += 1) {
      if (shouldSkipElement(el)) break;

      const text = el.innerText || el.textContent || '';
      if (!text.includes('[veil:')) {
        el = el.parentElement;
        continue;
      }

      const matches = tokenFormat.findAllInText(text);
      if (!matches.length) {
        const compactMatch = tokenFormat.TOKEN_TEST?.exec(normalizeTokenText(text));
        if (compactMatch) {
          return {
            tokenId: compactMatch[1],
            placeholder: compactMatch[0],
            index: 0,
          };
        }
        el = el.parentElement;
        continue;
      }

      if (matches.length === 1) return matches[0];

      if (event && typeof document.caretRangeFromPoint === 'function') {
        const pointRange = document.caretRangeFromPoint(event.clientX, event.clientY);
        if (pointRange) {
          let offset = 0;
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let textNode;
          while ((textNode = walker.nextNode())) {
            if (textNode === pointRange.startContainer) {
              offset += pointRange.startOffset;
              break;
            }
            offset += (textNode.nodeValue || '').length;
          }
          const hit = matches.find((m) => offset >= m.index && offset <= m.index + m.placeholder.length);
          if (hit) return hit;
        }
      }

      return matches[0];
    }

    return null;
  }

  function collectRoots() {
    const roots = [document];
    const stack = [document.documentElement];
    while (stack.length) {
      const el = stack.pop();
      if (!el) continue;
      if (el.shadowRoot) {
        roots.push(el.shadowRoot);
        stack.push(...el.shadowRoot.querySelectorAll('*'));
      }
      if (el.children) {
        for (const child of el.children) stack.push(child);
      }
    }
    return roots;
  }

  function scanRoot(root, onResolve) {
    const tokenFormat = format();
    if (!tokenFormat?.findAllInText) return;

    const treeRoot = root === document ? document.body : root;
    if (!treeRoot) return;

    const walker = document.createTreeWalker(treeRoot, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const value = node.nodeValue || '';
        if (!value.includes('[veil:')) return NodeFilter.FILTER_REJECT;
        if (shouldSkipTextNode(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const matches = tokenFormat.findAllInText(node.nodeValue || '');
      if (!matches.length) continue;
      decoratePlainTextNode(node, matches[0], onResolve);
    }

    scanElementHosts(treeRoot, onResolve);

    const scope = root === document ? document : root;
    try {
      scope.querySelectorAll?.('.gst-veil-token-btn:not([data-gst-veil-wired])').forEach((button) => {
        const tokenId = button.dataset.veilTokenId
          || tokenFormat.parsePlaceholder(button.textContent || '')?.tokenId;
        if (tokenId) wireButton(button, tokenId, onResolve);
      });
    } catch {
      // Invalid selector in some frames.
    }
  }

  function scanDocument(onResolve) {
    for (const root of collectRoots()) {
      scanRoot(root, onResolve);
    }
  }

  function initClickToReveal(onResolve) {
    document.addEventListener('click', (event) => {
      if (event.target?.closest?.('.gst-veil-token-btn, .gst-veil-revealed, #goldspire-secure-text-prompt')) {
        return;
      }

      const hit = findTokenFromClickTarget(event.target, event);
      if (!hit) return;

      event.preventDefault();
      event.stopPropagation();
      onResolve(hit.tokenId);
    }, true);
  }

  function initVeilTokenDetector(getSettings, onResolve) {
    let enabled = true;
    let scheduled = false;

    async function refreshSettings() {
      const settings = await getSettings();
      enabled = settings.autoDetectVeilTokens !== false
        && global.GoldspireVeilTokens?.canUseTokens
        && (await global.GoldspireVeilTokens.canUseTokens(settings));
    }

    function scheduleScan() {
      if (!enabled || scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        if (enabled) scanDocument(onResolve);
      });
    }

    initClickToReveal(onResolve);
    refreshSettings().then(scheduleScan).catch(() => {});

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

    try {
      global.GoldspireBrowser?.storage?.onChanged?.addListener((changes, area) => {
        try {
          if (area !== 'sync') return;
          if (changes.orgId || changes.orgProvisionSource || changes.autoDetectVeilTokens) {
            refreshSettings().then(scheduleScan).catch(() => {});
          }
        } catch {
          // Stale content script.
        }
      });
    } catch {
      // Storage listener unavailable.
    }

    return { scheduleScan, refreshSettings, observer };
  }

  global.GoldspireVeilTokenDetector = {
    initVeilTokenDetector,
    scanDocument,
    findTokenFromClickTarget,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
