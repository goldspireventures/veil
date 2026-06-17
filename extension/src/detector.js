(function (global) {
  function shouldSkipTextNode(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    if (parent.closest('script,style,textarea,input,option,noscript,code,#goldspire-secure-text-prompt')) {
      return true;
    }
    if (parent.closest('a.gst-redacted, button.gst-redacted-btn')) return true;
    return false;
  }

  function wireLink(link, marker, onUnlock) {
    if (link.dataset.gstWired === '1') return;
    link.dataset.gstWired = '1';
    link.classList.add('gst-redacted');
    link.title = 'Click to unlock';
    link.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        onUnlock(marker, link);
      },
      true,
    );
  }

  function decoratePlainTextNode(node, startIndex, onUnlock) {
    const text = node.nodeValue || '';
    const resolved = GoldspireRedacted.resolveAt(text, startIndex);
    if (!resolved) return;

    const before = text.slice(0, startIndex);
    const tokenLength = resolved.plainToken?.length || GoldspireRedacted.LABEL.length;
    const after = text.slice(startIndex + tokenLength);

    const fragment = document.createDocumentFragment();
    if (before) fragment.appendChild(document.createTextNode(before));

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gst-redacted-btn';
    button.textContent = GoldspireRedacted.LABEL;
    button.title = 'Click to unlock';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onUnlock(resolved, button);
    });
    fragment.appendChild(button);

    if (after) fragment.appendChild(document.createTextNode(after));
    node.parentNode?.replaceChild(fragment, node);
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

  function scanRoot(root, onUnlock) {
    const scope = root === document ? document : root;
    const query = (selector) => {
      try {
        return Array.from(scope.querySelectorAll?.(selector) || []);
      } catch {
        return [];
      }
    };

    query('a.gst-redacted').forEach((link) => {
      const text = (link.textContent || '').trim();
      if (text !== GoldspireRedacted.LABEL && !text.includes(GoldspireRedacted.LABEL)) return;
      const marker = GoldspireRedacted.markerFromHref(link.href) || GoldspireRedacted.markerFromElement(link);
      if (marker) wireLink(link, marker, onUnlock);
    });

    query('a:not([data-gst-wired])').forEach((link) => {
      const text = (link.textContent || '').trim();
      if (text !== GoldspireRedacted.LABEL) return;
      const marker = GoldspireRedacted.markerFromHref(link.href);
      if (marker) wireLink(link, marker, onUnlock);
    });

    const treeRoot = root === document ? document.body : root;
    if (!treeRoot) return;

    const walker = document.createTreeWalker(treeRoot, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const value = node.nodeValue || '';
        if (!value.includes(GoldspireRedacted.LABEL)) return NodeFilter.FILTER_REJECT;
        if (shouldSkipTextNode(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const index = node.nodeValue.indexOf(GoldspireRedacted.LABEL);
      if (index >= 0) decoratePlainTextNode(node, index, onUnlock);
    }
  }

  function scanDocument(onUnlock) {
    for (const root of collectRoots()) {
      scanRoot(root, onUnlock);
    }
  }

  function initDetector(getSettings, onUnlock) {
    let enabled = true;
    let scheduled = false;

    async function refreshSettings() {
      const settings = await getSettings();
      enabled = settings.autoDetectRedacted !== false;
    }

    function scheduleScan() {
      if (!enabled || scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        if (enabled) scanDocument(onUnlock);
      });
    }

    refreshSettings().then(scheduleScan).catch(() => {});

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    try {
      global.GoldspireBrowser?.storage?.onChanged?.addListener((changes, area) => {
        try {
          if (area === 'sync' && changes.autoDetectRedacted) {
            enabled = changes.autoDetectRedacted.newValue !== false;
            if (enabled) scheduleScan();
          }
        } catch {
          // Stale content script after extension reload.
        }
      });
    } catch {
      // Storage listener unavailable in this frame.
    }

    return { scheduleScan, refreshSettings, observer };
  }

  global.GoldspireSecureDetector = { initDetector, scanDocument };
})(typeof globalThis !== 'undefined' ? globalThis : window);
