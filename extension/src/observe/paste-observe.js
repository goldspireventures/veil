/**
 * Compose observer — paste, beforeinput, and typing; copilot prompt + DLP.
 */
(function (global) {
  const DEDUPE_MS = 2000;
  const TYPE_DEBOUNCE_MS = 450;
  const MIN_CONFIDENCE = 50;
  const MIN_PROBE_CHARS = 4;
  const PASTE_INPUT_TYPES = new Set(['insertFromPaste', 'insertFromDrop', 'insertFromYank']);
  const TEXT_INPUT_TYPES = new Set([
    'insertText',
    'insertReplacementText',
    'insertCompositionText',
  ]);

  let lastPrompt = { key: '', at: 0 };
  let typeTimer = null;
  let lastTypeTarget = null;

  function isVeilObserveEnabled(settings) {
    if (global.GoldspireVeilEvents?.isEnabled?.(settings)) return true;
    return global.GoldspireSettings?.isVeilActive?.(settings) === true;
  }

  function resolveSettings(getSettingsSync, getSettings) {
    // Async paths must prefer fresh settings — sync cache can lag after popup toggles.
    return Promise.resolve()
      .then(() => getSettings?.())
      .then((fresh) => fresh || getSettingsSync?.() || null);
  }

  function buildContext(target, source) {
    return global.GoldspireObserveContext?.contextFromTarget?.(target, { source })
      || { source, host: location.hostname || '' };
  }

  function analyzeSensitive(text, context) {
    const trimmed = String(text || '').trim();
    if (!trimmed || trimmed.length < MIN_PROBE_CHARS) return null;

    const source = context?.source || 'paste';
    const raw = global.GoldspireDetection?.analyze?.(trimmed, context) || [];
    const floor = global.GoldspireDetectionGating?.minConfidence?.(context, source) ?? MIN_CONFIDENCE;
    const detections = global.GoldspireDetectionGating?.filterForPrompt?.(raw, context, source)
      || raw.filter((hit) => hit.confidence >= floor);

    if (!detections.length) return null;

    return { text: trimmed, detections };
  }

  function shouldDedupe(key) {
    const now = Date.now();
    if (key === lastPrompt.key && now - lastPrompt.at < DEDUPE_MS) return true;
    lastPrompt = { key, at: now };
    return false;
  }

  function resetPromptState() {
    lastPrompt = { key: '', at: 0 };
  }

  function syncProbe({ text, target, source, settings }) {
    if (!settings || !isVeilObserveEnabled(settings)) return null;
    if (!global.GoldspireVeilCopilot?.shouldIntercept?.(settings)) return null;

    const context = buildContext(target, source);
    if (global.GoldspireVeilSnooze?.isSnoozed?.(context.host)) return null;

    const analyzed = analyzeSensitive(text, context);
    if (!analyzed) return null;

    const host = context.host || '';
    analyzed.detections = analyzed.detections.filter(
      (hit) => !global.GoldspireVeilSnooze?.isCategorySnoozed?.(host, hit.category),
    );
    if (!analyzed.detections.length) return null;

    const dedupeKey = global.GoldspireObserveContext?.pasteDedupeKey?.(analyzed.text, context.host)
      || analyzed.text;
    if (shouldDedupe(dedupeKey)) return null;

    return {
      settings,
      context,
      ...analyzed,
      dedupeKey,
    };
  }

  async function logDetections(results, context) {
    if (!global.GoldspireVeilEvents?.emit) return;
    for (const hit of results || []) {
      if (!global.GoldspireObserveContext?.shouldLogDetection?.(hit, MIN_CONFIDENCE)) continue;
      await global.GoldspireVeilEvents.emit({
        type: 'detection',
        category: hit.category,
        severity: hit.severity,
        host: context.host || '',
        source: context.source || 'paste',
        action: 'observe',
        confidence: hit.confidence,
      });
    }
  }

  async function showComposeCopilot({
    title,
    text,
    target,
    caret,
    context,
    detections,
    settings,
    subtitle,
    alreadyInserted,
    fieldState,
    match,
  }) {
    return new Promise((resolve) => {
      global.GoldspireVeilCopilot?.showCopilotPrompt?.({
        title: title || global.GoldspireVeilExplain?.buildTriggerLabel?.(context, alreadyInserted),
        subtitle,
        detections,
        context,
        settings,
        alreadyInserted,
        onDismiss: () => resolve({ dismissed: true }),
        onAction: async (actionId) => {
          const needsSelection = actionId !== 'ignore' && alreadyInserted && match;
          const selectionContext = needsSelection
            ? global.GoldspirePasteInsert?.buildSelectionForMatch?.(fieldState, match)
            : null;
          const result = await global.GoldspireVeilCopilot?.applyPasteAction?.(actionId, {
            text,
            target,
            caret,
            context,
            detections,
            settings,
            alreadyInserted,
            fieldState,
            match,
            selectionContext,
          });
          resolve({ actionId, ...result });
        },
      });
    });
  }

  async function processSensitiveInsert({
    text,
    target,
    context,
    detections,
    settings,
    alreadyInserted = false,
    fieldState = null,
    match = null,
  }) {
    const policyResult = global.GoldspirePolicyEngine?.evaluate?.(detections, context, settings) || {
      action: 'allow',
    };

    const caret = alreadyInserted
      ? null
      : global.GoldspirePasteInsert?.getCaretState?.(target);

    const enforcement = await global.GoldspireVeilCopilot?.handlePolicyEnforcement?.({
      policyResult,
      text,
      target,
      context,
      detections,
      settings,
      caret,
      alreadyInserted,
      fieldState,
      match,
    });

    if (enforcement?.handled) {
      if (!enforcement.blocked) await logDetections(detections, context);
      return;
    }

    if (enforcement?.showCopilot || (settings.copilotEnabled && detections.length)) {
      await showComposeCopilot({
        text,
        target,
        caret,
        context,
        detections,
        settings,
        subtitle: enforcement?.subtitle || policyResult.message || '',
        alreadyInserted,
        fieldState,
        match,
      });
      return;
    }

    await logDetections(detections, context);
    if (!alreadyInserted && target) {
      global.GoldspirePasteInsert?.insertIntoTarget?.(target, text, caret, { collapseCaret: true })
        || global.GoldspirePasteInsert?.insertAtCaret?.(caret, text);
    } else if (!alreadyInserted) {
      global.GoldspirePasteInsert?.insertAtCaret?.(caret, text);
    }
  }

  async function continueFromProbe(probe, target, options = {}) {
    await processSensitiveInsert({
      text: probe.text,
      target,
      context: probe.context,
      detections: probe.detections,
      settings: probe.settings,
      ...options,
    });
  }

  function extractInsertText(event) {
    if (event.clipboardData) {
      const fromClipboard = event.clipboardData.getData?.('text/plain') || '';
      if (fromClipboard.trim()) return fromClipboard;
    }
    if (event.data != null && String(event.data).trim()) return String(event.data);
    if (event.dataTransfer) {
      const fromTransfer = event.dataTransfer.getData?.('text/plain') || '';
      if (fromTransfer.trim()) return fromTransfer;
    }
    return '';
  }

  function handleBeforeInput(event, getSettingsSync, getSettings, runSafe) {
    const inputType = event.inputType || '';
    const isPaste = PASTE_INPUT_TYPES.has(inputType);
    const isText = TEXT_INPUT_TYPES.has(inputType);
    if (!isPaste && !isText) return;

    const text = extractInsertText(event);
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < MIN_PROBE_CHARS) return;

    const source = isPaste ? 'paste' : 'type';
    const settings = getSettingsSync?.();
    const probe = settings
      ? syncProbe({ text: trimmed, target: event.target, source, settings })
      : null;

    if (probe) {
      event.preventDefault();
      event.stopPropagation();
      runSafe(continueFromProbe(probe, event.target));
      return;
    }

    if (!settings) {
      runSafe((async () => {
        const loaded = await resolveSettings(getSettingsSync, getSettings);
        const asyncProbe = loaded
          ? syncProbe({ text: trimmed, target: event.target, source, settings: loaded })
          : null;
        if (!asyncProbe) return;

        const fieldState = global.GoldspirePasteInsert?.readFieldState?.(event.target);
        const match = global.GoldspirePasteInsert?.findRawMatch?.(trimmed, asyncProbe.detections)
          || { raw: trimmed, start: 0, end: trimmed.length };
        await processSensitiveInsert({
          text: asyncProbe.text,
          target: event.target,
          context: asyncProbe.context,
          detections: asyncProbe.detections,
          settings: asyncProbe.settings,
          alreadyInserted: source === 'type' || Boolean(fieldState?.text?.includes(trimmed)),
          fieldState,
          match,
        });
      })());
    }
  }

  async function handlePaste(event, getSettings, getSettingsSync) {
    const text = extractInsertText(event);
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < MIN_PROBE_CHARS) return;

    let settings = getSettingsSync?.();
    let probe = settings
      ? syncProbe({ text: trimmed, target: event.target, source: 'paste', settings })
      : null;

    if (!probe && getSettings) {
      const fresh = await getSettings();
      if (fresh && fresh !== settings) {
        settings = fresh;
        probe = syncProbe({ text: trimmed, target: event.target, source: 'paste', settings: fresh });
      } else if (!settings && fresh) {
        settings = fresh;
        probe = syncProbe({ text: trimmed, target: event.target, source: 'paste', settings: fresh });
      }
    }

    if (probe) {
      event.preventDefault();
      event.stopPropagation();
      await continueFromProbe(probe, event.target);
      return;
    }
  }

  async function scanTypedField(target, getSettings, getSettingsSync, isComposeContext) {
    if (isComposeContext && !isComposeContext()) {
      global.GoldspireVeilCopilotUI?.removePrompt?.();
      return;
    }

    const fieldState = global.GoldspirePasteInsert?.readFieldState?.(target);
    if (!fieldState?.text) {
      global.GoldspireVeilCopilotUI?.removePrompt?.();
      return;
    }

    const text = fieldState.text.trim();
    if (text.length < MIN_PROBE_CHARS) {
      global.GoldspireVeilCopilotUI?.removePrompt?.();
      return;
    }

    const settings = await resolveSettings(getSettingsSync, getSettings);
    if (!settings || !isVeilObserveEnabled(settings)) {
      global.GoldspireVeilCopilotUI?.removePrompt?.();
      return;
    }
    if (!global.GoldspireVeilCopilot?.shouldIntercept?.(settings)) {
      global.GoldspireVeilCopilotUI?.removePrompt?.();
      return;
    }
    if (!settings.copilotEnabled) {
      global.GoldspireVeilCopilotUI?.removePrompt?.();
      return;
    }

    const context = buildContext(target, 'type');
    if (global.GoldspireVeilSnooze?.isSnoozed?.(context.host)) {
      global.GoldspireVeilCopilotUI?.removePrompt?.();
      return;
    }

    const analyzed = analyzeSensitive(text, context);
    if (!analyzed) {
      global.GoldspireVeilCopilotUI?.removePrompt?.();
      return;
    }

    const match = global.GoldspirePasteInsert?.findRawMatch?.(text, analyzed.detections);
    if (!match?.raw) {
      global.GoldspireVeilCopilotUI?.removePrompt?.();
      return;
    }

    if (global.GoldspireVeilSnooze?.isCompositionAllowed?.(context.host, text, match, fieldState)) return;

    const dedupeKey = global.GoldspireObserveContext?.pasteDedupeKey?.(match.raw, context.host) || match.raw;
    if (shouldDedupe(dedupeKey)) return;

    await processSensitiveInsert({
      text: match.raw,
      target,
      context,
      detections: analyzed.detections,
      settings,
      alreadyInserted: true,
      fieldState,
      match,
    });
  }

  function scheduleTypeScan(target, getSettings, getSettingsSync, isComposeContext, runSafe) {
    lastTypeTarget = target;
    window.clearTimeout(typeTimer);
    typeTimer = window.setTimeout(() => {
      runSafe(scanTypedField(lastTypeTarget, getSettings, getSettingsSync, isComposeContext));
    }, TYPE_DEBOUNCE_MS);
  }

  function initPasteObserve({ getSettings, getSettingsSync, runSafe, isComposeContext }) {
    if (!getSettings || !runSafe) return;

    document.addEventListener(
      'beforeinput',
      (event) => {
        handleBeforeInput(event, getSettingsSync, getSettings, runSafe);
      },
      true,
    );

    document.addEventListener(
      'paste',
      (event) => {
        const settings = getSettingsSync?.();
        if (settings && isVeilObserveEnabled(settings) && global.GoldspireVeilCopilot?.shouldIntercept?.(settings)) {
          const text = extractInsertText(event).trim();
          if (text.length >= MIN_PROBE_CHARS) {
            const probe = syncProbe({ text, target: event.target, source: 'paste', settings });
            if (probe) {
              event.preventDefault();
              event.stopPropagation();
              runSafe(continueFromProbe(probe, event.target));
              return;
            }
          }
        }
        runSafe(handlePaste(event, getSettings, getSettingsSync));
      },
      true,
    );

    document.addEventListener(
      'input',
      (event) => {
        scheduleTypeScan(event.target, getSettings, getSettingsSync, isComposeContext, runSafe);
      },
      true,
    );
  }

  global.GoldspirePasteObserve = {
    initPasteObserve,
    handlePaste,
    handleBeforeInput,
    scanTypedField,
    syncProbe,
    isVeilObserveEnabled,
    resetPromptState,
    MIN_CONFIDENCE,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
