/**
 * Veil token reveal — sync all on-page placeholders and support re-lock.
 */
(function (global) {
  const format = () => global.GoldspireVeilTokenFormat;

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

  function createRevealedSpan(tokenId, plaintext) {
    const span = document.createElement('span');
    span.className = 'gst-veil-revealed';
    span.dataset.veilTokenId = tokenId;
    span.textContent = plaintext;
    span.title = 'Veil token revealed — re-locking soon';
    return span;
  }

  function createTokenButton(tokenId, placeholder, onResolve) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = placeholder;
    button.dataset.gstVeilWired = '1';
    button.dataset.veilTokenId = tokenId;
    button.className = 'gst-veil-token-btn';
    button.title = 'Click to reveal secure token';
    button.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        onResolve?.(tokenId, button);
      },
      true,
    );
    return button;
  }

  function replaceWithRevealed(node, tokenId, plaintext) {
    const span = createRevealedSpan(tokenId, plaintext);
    node?.replaceWith?.(span);
    return span;
  }

  function revealEverywhere(tokenId, plaintext, placeholder) {
    const id = String(tokenId || '').trim();
    const text = String(plaintext ?? '');
    const label = placeholder || format()?.formatPlaceholder?.(id) || `[veil:${id}]`;
    const revealed = [];

    for (const root of collectRoots()) {
      const scope = root === document ? document : root;
      try {
        scope.querySelectorAll?.(`.gst-veil-token-btn[data-veil-token-id="${id}"]`).forEach((button) => {
          if (!button.isConnected) return;
          revealed.push(replaceWithRevealed(button, id, text));
        });

        scope.querySelectorAll?.(`.gst-veil-revealed[data-veil-token-id="${id}"]`).forEach((span) => {
          if (!span.isConnected) return;
          span.textContent = text;
          revealed.push(span);
        });
      } catch {
        // Invalid selector in some frames.
      }

      const treeRoot = root === document ? document.body : root;
      if (!treeRoot) continue;

      const walker = document.createTreeWalker(treeRoot, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const value = node.nodeValue || '';
          if (!value.includes(label)) return NodeFilter.FILTER_REJECT;
          if (shouldSkipTextNode(node)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);

      for (const node of textNodes) {
        const value = node.nodeValue || '';
        const index = value.indexOf(label);
        if (index === -1) continue;

        const before = value.slice(0, index);
        const after = value.slice(index + label.length);
        const fragment = document.createDocumentFragment();
        if (before) fragment.appendChild(document.createTextNode(before));
        const span = createRevealedSpan(id, text);
        fragment.appendChild(span);
        if (after) fragment.appendChild(document.createTextNode(after));
        node.parentNode?.replaceChild(fragment, node);
        revealed.push(span);
      }
    }

    return revealed;
  }

  function relockEverywhere(tokenId, placeholder, onResolve) {
    const id = String(tokenId || '').trim();
    const label = placeholder || format()?.formatPlaceholder?.(id) || `[veil:${id}]`;
    let count = 0;

    for (const root of collectRoots()) {
      const scope = root === document ? document : root;
      try {
        scope.querySelectorAll?.(`.gst-veil-revealed[data-veil-token-id="${id}"]`).forEach((span) => {
          if (!span.isConnected) return;
          span.replaceWith(createTokenButton(id, label, onResolve));
          count += 1;
        });
      } catch {
        // Invalid selector in some frames.
      }
    }

    return count;
  }

  global.GoldspireVeilTokenReveal = {
    revealEverywhere,
    relockEverywhere,
    createTokenButton,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
