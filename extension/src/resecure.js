(function (global) {
  const BANNER_ID = 'goldspire-secure-relock-banner';
  const sessions = new Map();
  let sessionCounter = 0;

  function removeBanner() {
    document.getElementById(BANNER_ID)?.remove();
  }

  function detachOutsideDismiss(session) {
    if (!session?.outsideClickHandler) return;
    document.removeEventListener('click', session.outsideClickHandler, true);
    session.outsideClickHandler = null;
  }

  function cancelSession(id) {
    const session = sessions.get(id);
    if (!session) return;
    window.clearInterval(session.intervalId);
    window.clearTimeout(session.timeoutId);
    detachOutsideDismiss(session);
    sessions.delete(id);
    if (sessions.size === 0) removeBanner();
  }

  function cancelAllSessions() {
    for (const id of [...sessions.keys()]) {
      cancelSession(id);
    }
    removeBanner();
  }

  function dismissBanner(sessionId, callback) {
    cancelSession(sessionId);
    removeBanner();
    callback?.();
  }

  function attachOutsideDismiss(banner, sessionId, onDismiss) {
    const session = sessions.get(sessionId);
    if (!session) return;

    const handler = (event) => {
      if (banner.contains(event.target)) return;
      dismissBanner(sessionId, onDismiss);
    };

    session.outsideClickHandler = handler;
    window.setTimeout(() => {
      if (!sessions.has(sessionId)) return;
      document.addEventListener('click', handler, true);
    }, 0);
  }

  function showBanner({ sessionId, seconds, onKeepUnlocked, onResecureNow }) {
    removeBanner();

    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'gst-relock-banner';
    banner.innerHTML = `
      <div class="gst-relock-banner__text">
        <strong>Secret visible</strong>
        <span data-countdown>Re-locking in ${seconds}s</span>
      </div>
      <div class="gst-relock-banner__actions">
        <button type="button" class="gst-btn gst-btn--ghost" data-action="keep">Keep visible</button>
        <button type="button" class="gst-btn gst-btn--primary" data-action="now">Re-lock</button>
      </div>
    `;

    banner.addEventListener('click', (event) => {
      event.stopPropagation();
      if (event.target.closest('[data-action="keep"]')) {
        dismissBanner(sessionId, onKeepUnlocked);
      }
      if (event.target.closest('[data-action="now"]')) {
        dismissBanner(sessionId, onResecureNow);
      }
    });

    document.documentElement.appendChild(banner);
    attachOutsideDismiss(banner, sessionId, onKeepUnlocked);
    return banner.querySelector('[data-countdown]');
  }

  async function buildRedacted(marker, plaintext, secret, profile, unlockBaseUrl) {
    const payload = await GoldspireSecureCrypto.encryptText(plaintext, secret, {
      mode: marker.mode === 'one-time' ? 'one-time' : marker.mode || 'team',
      profile,
    });
    const fullMarker = GoldspireSecureMarker.wrapSecured(payload, '', marker.version);
    const base = unlockBaseUrl || marker.unlockBaseUrl || '';
    return {
      fullMarker,
      plain: GoldspireRedacted.formatPlain(fullMarker),
      token: GoldspireRedacted.createLink(fullMarker, base),
    };
  }

  function scheduleResecure({
    target,
    marker,
    secret,
    plaintext,
    delaySeconds,
    profile = 'personal',
    unlockBaseUrl = '',
    onResecured,
    onKeptOpen,
  }) {
    cancelAllSessions();
    const id = `gst-session-${++sessionCounter}`;
    let remaining = Math.max(5, delaySeconds);

    sessions.set(id, { intervalId: null, timeoutId: null });

    const countdownEl = showBanner({
      sessionId: id,
      seconds: remaining,
      onKeepUnlocked: () => {
        GoldspireSecrets.clearMemoryString(secret);
        onKeptOpen?.();
        GoldspireSecureUI.showToast('Secret stays visible.', 'info');
      },
      onResecureNow: async () => {
        await performResecure();
      },
    });

    const intervalId = window.setInterval(() => {
      remaining -= 1;
      if (countdownEl) countdownEl.textContent = `Re-locking in ${remaining}s`;
      if (remaining <= 0) window.clearInterval(intervalId);
    }, 1000);

    async function performResecure() {
      try {
        const secured = await buildRedacted(marker, plaintext, secret, profile, unlockBaseUrl);

        if (target.kind === 'token') {
          if (!target.node?.isConnected) return;
          target.node.replaceWith(secured.token);
          onResecured?.(secured.token);
        } else if (target.kind === 'node') {
          if (!target.node?.isConnected) return;
          target.node.replaceWith(secured.token);
          onResecured?.(secured.token);
        } else if (target.kind === 'input') {
          const { element, start } = target;
          if (!element?.isConnected) return;
          const value = element.value;
          const end = start + plaintext.length;
          if (value.slice(start, end) !== plaintext) {
            GoldspireSecureUI.showToast('Text changed — re-lock skipped.', 'info');
            return;
          }
          element.value = `${value.slice(0, start)}${secured.plain}${value.slice(end)}`;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          onResecured?.(element);
        }

        GoldspireSecureUI.showToast('Re-locked as [redacted].', 'success');
      } catch {
        GoldspireSecureUI.showToast('Could not re-lock.', 'error');
      } finally {
        GoldspireSecrets.clearMemoryString(secret);
      }
    }

    const timeoutId = window.setTimeout(async () => {
      dismissBanner(id);
      await performResecure();
    }, remaining * 1000);

    const session = sessions.get(id);
    if (session) {
      session.intervalId = intervalId;
      session.timeoutId = timeoutId;
    }
    return id;
  }

  function scheduleVeilTokenRelock({ tokenId, placeholder, delaySeconds, onRelock, onKeptOpen }) {
    cancelAllSessions();
    const id = `gst-veil-session-${++sessionCounter}`;
    let remaining = Math.max(5, delaySeconds);

    sessions.set(id, { intervalId: null, timeoutId: null });

    const countdownEl = showBanner({
      sessionId: id,
      seconds: remaining,
      onKeepUnlocked: () => {
        onKeptOpen?.();
        GoldspireSecureUI.showToast('Token stays visible.', 'info');
      },
      onResecureNow: async () => {
        await onRelock?.();
      },
    });

    const intervalId = window.setInterval(() => {
      remaining -= 1;
      if (countdownEl) countdownEl.textContent = `Re-locking in ${remaining}s`;
      if (remaining <= 0) window.clearInterval(intervalId);
    }, 1000);

    const timeoutId = window.setTimeout(async () => {
      dismissBanner(id);
      await onRelock?.();
    }, remaining * 1000);

    const session = sessions.get(id);
    if (session) {
      session.intervalId = intervalId;
      session.timeoutId = timeoutId;
    }
    return id;
  }

  global.GoldspireResecure = {
    scheduleResecure,
    scheduleVeilTokenRelock,
    cancelSession,
    cancelAllSessions,
    removeBanner,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
