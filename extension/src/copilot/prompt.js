/**
 * Veil copilot prompt — small floating card, not a full-screen modal.
 */
(function (global) {
  const PROMPT_ID = 'goldspire-veil-copilot';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatCategoryLabel(category) {
    return String(category || 'sensitive data').replace(/_/g, ' ');
  }

  function removePrompt() {
    const el = document.getElementById(PROMPT_ID);
    if (!el) return;
    el.classList.add('gst-ui--exit');
    window.setTimeout(() => el.remove(), 180);
  }

  function showVeilCopilot({
    detections = [],
    actions = [],
    recommendedId = '',
    onAction,
    onDismiss,
    variant = 'default',
    context = {},
    title = '',
    subtitle = '',
    alreadyInserted = false,
  }) {
    removePrompt();

    const categories = [...new Set(detections.map((d) => d.category).filter(Boolean))];
    const summary = categories.length
      ? categories.map(formatCategoryLabel).join(', ')
      : 'sensitive data';

    const recommended = actions.find((a) => a.id === recommendedId && a.id !== 'ignore');
    const hint = recommended
      ? global.GoldspireVeilActionRegistry?.recommendHint?.(recommended.id, context) || ''
      : '';
    const triggerLabel = title
      || global.GoldspireVeilExplain?.buildTriggerLabel?.(context, alreadyInserted)
      || 'Sensitive content';
    const explainLines = global.GoldspireVeilExplain?.buildExplainSummary?.(detections, {
      policyMessage: subtitle,
      recommendedId,
      context,
    }) || [];
    const primaryActions = actions.filter((a) => a.id !== 'ignore');
    const allowAction = actions.find((a) => a.id === 'ignore');
    const typingClass = context.source === 'type' ? ' gst-veil-pop--typing' : '';

    const pop = document.createElement('div');
    pop.id = PROMPT_ID;
    pop.className = `gst-veil-pop${variant === 'ai' ? ' gst-veil-pop--ai' : ''}${typingClass}`;
    pop.innerHTML = `
      <div class="gst-veil-pop__head">
        <span class="gst-veil-pop__brand">Veil</span>
        <span class="gst-veil-pop__detect">${escapeHtml(summary)}</span>
        <button type="button" class="gst-veil-pop__close" data-action="dismiss" title="Dismiss">✕</button>
      </div>
      <p class="gst-veil-pop__trigger">${escapeHtml(triggerLabel)}</p>
      ${explainLines.length ? `<ul class="gst-veil-pop__why">${explainLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : ''}
      <div class="gst-veil-pop__chips" data-veil-actions></div>
      ${allowAction ? '<button type="button" class="gst-veil-pop__allow" data-action-id="ignore">Allow</button>' : ''}
    `;

    const container = pop.querySelector('[data-veil-actions]');
    for (const action of primaryActions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `gst-veil-pop__chip${action.id === recommendedId ? ' gst-veil-pop__chip--pick' : ''}`;
      btn.dataset.actionId = action.id;
      btn.disabled = action.stub || action.available === false;
      btn.textContent = action.label.replace(/…$/, '');
      const title = action.available === false && action.hint
        ? action.hint
        : action.id === recommendedId && hint
          ? `${action.label} — ${hint}`
          : (action.description || action.label);
      btn.title = title;
      container.appendChild(btn);
    }

    pop.addEventListener('click', async (event) => {
      if (event.target.closest('[data-action="dismiss"]')) {
        removePrompt();
        onDismiss?.();
        return;
      }
      const actionBtn = event.target.closest('[data-action-id]');
      if (!actionBtn) return;
      const actionId = actionBtn.dataset.actionId;
      actionBtn.disabled = true;
      try {
        await onAction?.(actionId);
        removePrompt();
      } catch (error) {
        actionBtn.disabled = false;
        global.GoldspireSecureUI?.showToast?.(
          error instanceof Error ? error.message : 'Action failed.',
          'error',
        );
      }
    });

    document.documentElement.appendChild(pop);

    const primary = container.querySelector(`[data-action-id="${recommendedId}"]`)
      || container.querySelector('.gst-veil-pop__chip:not([disabled])');
    primary?.focus?.();
  }

  global.GoldspireVeilCopilotUI = {
    showVeilCopilot,
    removePrompt,
    formatCategoryLabel,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
