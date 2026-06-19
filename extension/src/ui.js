(function (global) {
  const PROMPT_ID = 'goldspire-veil-prompt';
  const TOAST_ID = 'goldspire-veil-toast';
  let activePromptKeyHandler = null;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(message, type = 'info') {
    document.getElementById(TOAST_ID)?.remove();

    const toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.className = `gst-toast gst-toast--${type}`;
    toast.textContent = message;
    document.documentElement.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('gst-toast--visible');
    });

    window.setTimeout(() => dismissToast(toast), 3200);
  }

  function removePrompt() {
    if (activePromptKeyHandler) {
      document.removeEventListener('keydown', activePromptKeyHandler);
      activePromptKeyHandler = null;
    }
    const el = document.getElementById(PROMPT_ID);
    if (!el) return;
    el.classList.add('gst-ui--exit');
    window.setTimeout(() => el.remove(), 200);
  }

  function dismissToast(toast) {
    if (!toast) return;
    toast.classList.remove('gst-toast--visible');
    window.setTimeout(() => toast.remove(), 220);
  }

  function attachPromptKeyboard(onCancel) {
    if (activePromptKeyHandler) {
      document.removeEventListener('keydown', activePromptKeyHandler);
    }
    activePromptKeyHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        removePrompt();
        onCancel?.();
      }
    };
    document.addEventListener('keydown', activePromptKeyHandler);
  }

  function renderField(field) {
    if (field.type === 'radio-group') {
      const options = field.options
        .map(
          (option) => `
            <label class="gst-radio">
              <input type="radio" name="${field.name}" value="${escapeHtml(option.value)}" ${option.checked ? 'checked' : ''} />
              <span>${escapeHtml(option.label)}</span>
            </label>
          `,
        )
        .join('');
      return `
        <div class="gst-field">
          <span class="gst-field__label">${escapeHtml(field.label)}</span>
          <div class="gst-radio-group">${options}</div>
        </div>
      `;
    }

    if (field.type === 'checkbox') {
      return `
        <label class="gst-checkbox">
          <input name="${field.name}" type="checkbox" ${field.checked ? 'checked' : ''} />
          <span>${escapeHtml(field.label)}</span>
        </label>
      `;
    }

    if (field.type === 'note') {
      if (!field.label) return '';
      return `<p class="gst-note">${escapeHtml(field.label)}</p>`;
    }

    const autocomplete = field.autocomplete ?? (field.type === 'password' ? 'current-password' : 'off');
    const inputId = field.id || field.name;

    const hiddenAttr = field.hidden ? ' hidden' : '';

    return `
      <label class="gst-field${field.compact ? ' gst-field--compact' : ''}" for="${escapeHtml(inputId)}">
        <span class="gst-field__label">${escapeHtml(field.label)}</span>
        <input
          class="gst-field__input"
          id="${escapeHtml(inputId)}"
          name="${field.name}"
          type="${field.type || 'text'}"
          placeholder="${escapeHtml(field.placeholder || '')}"
          value="${escapeHtml(field.value || '')}"
          ${field.required ? 'required' : ''}
          ${field.readOnly ? 'readonly' : ''}
          ${hiddenAttr}
          autocomplete="${escapeHtml(autocomplete)}"
          ${field.inputMode ? `inputmode="${escapeHtml(field.inputMode)}"` : ''}
          spellcheck="false"
          data-lpignore="false"
          data-1p-ignore="false"
          data-op-ignore="false"
        />
      </label>
    `;
  }

  function showPrompt({
    title,
    fields,
    submitLabel,
    onSubmit,
    onCancel,
    extraActions = [],
    compactDialog = false,
  }) {
    removePrompt();

    const formAction = `${location.origin}${location.pathname}`;

    const overlay = document.createElement('div');
    overlay.id = PROMPT_ID;
    overlay.className = 'gst-overlay';
    overlay.innerHTML = `
      <div class="gst-dialog${compactDialog ? ' gst-dialog--compact' : ''}" role="dialog" aria-modal="true">
        <h2 class="gst-dialog__title">${escapeHtml(title)}</h2>
        <form class="gst-dialog__form" id="gst-form" method="post" action="${escapeHtml(formAction)}" autocomplete="on"></form>
        <div class="gst-dialog__actions">
          ${extraActions
            .map(
              (action) =>
                `<button type="button" class="gst-btn gst-btn--ghost" data-extra-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`,
            )
            .join('')}
          <button type="button" class="gst-btn gst-btn--ghost" data-action="cancel">Cancel</button>
          <button type="submit" form="gst-form" class="gst-btn gst-btn--primary">${escapeHtml(submitLabel)}</button>
        </div>
      </div>
    `;

    const form = overlay.querySelector('.gst-dialog__form');
    form.innerHTML = fields.map(renderField).join('');

    overlay.addEventListener('click', (event) => {
      const extra = event.target.closest('[data-extra-action]');
      if (extra) {
        const action = extraActions.find((item) => item.id === extra.dataset.extraAction);
        action?.onClick?.();
        return;
      }
      if (event.target === overlay || event.target.closest('[data-action="cancel"]')) {
        removePrompt();
        onCancel?.();
      }
    });

    form.addEventListener('change', (event) => {
      const modeInput = form.querySelector('input[name="mode"]:checked');
      if (!modeInput) return;
      const customField = form.querySelector('[name="customPassphrase"]')?.closest('.gst-field');
      const teamField = form.querySelector('[name="passphrase"]')?.closest('.gst-field');
      if (customField) customField.style.display = modeInput.value === 'custom' ? 'grid' : 'none';
      if (teamField) teamField.style.display = modeInput.value === 'team' ? 'grid' : 'none';
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      for (const field of fields) {
        if (field.type === 'checkbox') {
          data[field.name] = Boolean(form.querySelector(`[name="${field.name}"]`)?.checked);
        }
      }

      const submitButton = overlay.querySelector('.gst-btn--primary');
      submitButton.disabled = true;
      submitButton.textContent = 'Working...';

      try {
        await onSubmit(data);
        removePrompt();
      } catch (error) {
        submitButton.disabled = false;
        submitButton.textContent = submitLabel;
        showToast(error instanceof Error ? error.message : 'Something went wrong.', 'error');
      }
    });

    document.documentElement.appendChild(overlay);
    attachPromptKeyboard(onCancel);
    form.dispatchEvent(new Event('change'));
    form.querySelector('[name="passphrase"]')?.focus()
      || form.querySelector('input[type="password"]')?.focus()
      || form.querySelector('input:not([readonly])')?.focus();
  }

  function teamPassphraseFields({ label = 'Passphrase' } = {}) {
    return [
      {
        name: 'passphrase',
        id: 'goldspire-team-passphrase',
        label,
        type: 'password',
        required: true,
        autocomplete: 'current-password',
      },
    ];
  }

  function showTeamPassphrasePrompt({ title = 'Team passphrase', submitLabel = 'Secure', onSubmit, onCancel }) {
    showPrompt({
      title,
      submitLabel,
      compactDialog: true,
      fields: teamPassphraseFields(),
      onSubmit,
      onCancel,
    });
  }

  function showResultDialog({ title, lines, copyItems = [], extraActions = [] }) {
    removePrompt();

    const overlay = document.createElement('div');
    overlay.id = PROMPT_ID;
    overlay.className = 'gst-overlay gst-overlay--compact';
    const copyValues = new Map();
    overlay.innerHTML = `
      <div class="gst-dialog gst-dialog--compact" role="dialog" aria-modal="true">
        <h2 class="gst-dialog__title">${escapeHtml(title)}</h2>
        <div class="gst-result gst-result--compact">
          ${lines
            .map(
              (line, index) => `
                <div class="gst-result__row">
                  <span class="gst-result__label">${escapeHtml(line.label)}</span>
                  <code class="gst-result__value">${escapeHtml(line.value)}</code>
                </div>
              `,
            )
            .join('')}
        </div>
        <div class="gst-dialog__actions gst-dialog__actions--compact">
          ${copyItems
            .map(
              (item, index) =>
                `<button type="button" class="gst-btn gst-btn--ghost gst-btn--sm" data-copy-index="${index}">${escapeHtml(item.label)}</button>`,
            )
            .join('')}
          ${extraActions
            .map(
              (action) =>
                `<button type="button" class="gst-btn gst-btn--ghost gst-btn--sm" data-extra-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`,
            )
            .join('')}
          <button type="button" class="gst-btn gst-btn--primary gst-btn--sm" data-action="close">Done</button>
        </div>
      </div>
    `;

    copyItems.forEach((item, index) => {
      copyValues.set(String(index), item.value);
    });

    overlay.addEventListener('click', async (event) => {
      const copyButton = event.target.closest('[data-copy-index]');
      if (copyButton) {
        const value = copyValues.get(copyButton.dataset.copyIndex || '') || '';
        await navigator.clipboard.writeText(value);
        showToast('Copied.', 'success');
        return;
      }
      const extra = event.target.closest('[data-extra-action]');
      if (extra) {
        const action = extraActions.find((item) => item.id === extra.dataset.extraAction);
        await action?.onClick?.();
        return;
      }
      if (event.target === overlay || event.target.closest('[data-action="close"]')) {
        removePrompt();
      }
    });

    document.documentElement.appendChild(overlay);
  }

  function showSecureSheet({
    title = 'Secure selection',
    modes = [],
    defaultMode = 'team',
    onSubmit,
    onCancel,
  }) {
    removePrompt();
    document.getElementById('goldspire-veil-copilot')?.remove();

    const initialMode = modes.some((m) => m.value === defaultMode)
      ? defaultMode
      : (modes[0]?.value || 'team');

    const panelHtml = {
      team: '<p class="gst-veil-pop__hint">Uses your saved passphrase from Veil settings.</p>',
      direct: `
        <p class="gst-veil-pop__hint">Unlock keys go only to the people you name — not everyone on the email thread. Use Team for groups or lists.</p>
        <div class="gst-veil-pop__field">
          <span class="gst-veil-pop__field-label">Work email(s)</span>
          <input class="gst-veil-pop__field-input" name="recipients" type="email" placeholder="colleague@company.com" autocomplete="email" />
        </div>
      `,
      'one-time': '<p class="gst-veil-pop__hint">Recipient gets a one-time unlock code.</p>',
    };

    const pop = document.createElement('div');
    pop.id = PROMPT_ID;
    pop.className = 'gst-veil-pop gst-veil-pop--secure';
    pop.innerHTML = `
      <div class="gst-veil-pop__head">
        <span class="gst-veil-pop__brand">Veil</span>
        <span class="gst-veil-pop__detect">${escapeHtml(title)}</span>
        <button type="button" class="gst-veil-pop__close" data-action="cancel" title="Close">✕</button>
      </div>
      <div class="gst-veil-pop__chips" data-mode-chips></div>
      <div class="gst-veil-pop__panel" data-panel-slot></div>
      <div class="gst-veil-pop__actions">
        <button type="button" class="gst-veil-pop__chip gst-veil-pop__chip--pick" data-action="submit">Secure</button>
      </div>
    `;

    const chipsEl = pop.querySelector('[data-mode-chips]');
    for (const mode of modes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `gst-veil-pop__chip${mode.value === initialMode ? ' gst-veil-pop__chip--pick' : ''}`;
      btn.dataset.mode = mode.value;
      btn.textContent = mode.label;
      chipsEl.appendChild(btn);
    }

    let activeMode = initialMode;

    function setMode(mode) {
      activeMode = mode;
      chipsEl.querySelectorAll('[data-mode]').forEach((chip) => {
        chip.classList.toggle('gst-veil-pop__chip--pick', chip.dataset.mode === mode);
      });
      const slot = pop.querySelector('[data-panel-slot]');
      if (slot) slot.innerHTML = panelHtml[mode] || '';
      if (mode === 'direct') {
        slot?.querySelector('[name="recipients"]')?.focus();
      }
    }

    chipsEl.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-mode]');
      if (!chip) return;
      setMode(chip.dataset.mode);
    });

    pop.addEventListener('click', async (event) => {
      if (event.target.closest('[data-action="cancel"]')) {
        removePrompt();
        onCancel?.();
        return;
      }
      if (!event.target.closest('[data-action="submit"]')) return;
      const submitBtn = pop.querySelector('[data-action="submit"]');
      submitBtn.disabled = true;
      try {
        const recipients = pop.querySelector('[name="recipients"]')?.value || '';
        await onSubmit({ mode: activeMode, recipients });
        removePrompt();
      } catch (error) {
        submitBtn.disabled = false;
        showToast(error instanceof Error ? error.message : 'Something went wrong.', 'error');
      }
    });

    document.documentElement.appendChild(pop);
    attachPromptKeyboard(onCancel);
    setMode(initialMode);
  }

  function showConfirm({
    title,
    message,
    confirmLabel = 'Continue',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
  }) {
    removePrompt();

    const overlay = document.createElement('div');
    overlay.id = PROMPT_ID;
    overlay.className = 'gst-overlay gst-overlay--compact';
    overlay.innerHTML = `
      <div class="gst-dialog gst-dialog--compact" role="dialog" aria-modal="true">
        <h2 class="gst-dialog__title">${escapeHtml(title)}</h2>
        <p class="gst-note">${escapeHtml(message)}</p>
        <div class="gst-dialog__actions gst-dialog__actions--compact">
          <button type="button" class="gst-btn gst-btn--ghost gst-btn--sm" data-action="cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="gst-btn gst-btn--primary gst-btn--sm" data-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    overlay.addEventListener('click', async (event) => {
      if (event.target === overlay || event.target.closest('[data-action="cancel"]')) {
        removePrompt();
        onCancel?.();
        return;
      }
      const confirmBtn = event.target.closest('[data-action="confirm"]');
      if (!confirmBtn) return;
      confirmBtn.disabled = true;
      try {
        await onConfirm?.();
        removePrompt();
      } catch (error) {
        confirmBtn.disabled = false;
        showToast(error instanceof Error ? error.message : 'Something went wrong.', 'error');
      }
    });

    document.documentElement.appendChild(overlay);
    attachPromptKeyboard(onCancel);
  }

  global.GoldspireSecureUI = {
    showToast,
    showPrompt,
    showTeamPassphrasePrompt,
    showSecureSheet,
    showConfirm,
    teamPassphraseFields,
    showResultDialog,
    removePrompt,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
