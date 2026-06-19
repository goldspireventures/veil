/**
 * Build detection context from a paste/editable DOM target.
 */
(function (global) {
  function resolveElement(target) {
    if (!target) return null;
    if (typeof Element !== 'undefined' && target instanceof Element) return target;
    if (target.tagName) return target;
    if (target.parentElement) return target.parentElement;
    return null;
  }

  function fieldMeta(element) {
    if (!element) {
      return {
        fieldType: '',
        isPasswordField: false,
        isEmailField: false,
        isPhoneField: false,
        editorKind: '',
      };
    }

    if (
      (typeof HTMLInputElement !== 'undefined' && element instanceof HTMLInputElement)
      || String(element.tagName || '').toUpperCase() === 'INPUT'
    ) {
      const type = String(element.type || 'text').toLowerCase();
      return {
        fieldType: type,
        isPasswordField: type === 'password',
        isEmailField: type === 'email',
        isPhoneField: type === 'tel',
        editorKind: 'input',
      };
    }

    if (
      (typeof HTMLTextAreaElement !== 'undefined' && element instanceof HTMLTextAreaElement)
      || String(element.tagName || '').toUpperCase() === 'TEXTAREA'
    ) {
      return {
        fieldType: 'textarea',
        isPasswordField: false,
        isEmailField: false,
        isPhoneField: false,
        editorKind: 'textarea',
      };
    }

    const editor = global.GoldspireEditorHost?.closestEditable?.(element) || element;
    let editorKind = 'contenteditable';
    if (global.GoldspireEditorHost?.isCodeEditor?.(editor)) editorKind = 'code';
    else if (global.GoldspireEditorHost?.isStructuredEditor?.(editor)) editorKind = 'structured';

    return {
      fieldType: 'contenteditable',
      isPasswordField: false,
      isEmailField: false,
      isPhoneField: false,
      editorKind,
    };
  }

  function contextFromTarget(target, partial = {}) {
    const element = resolveElement(target);
    const meta = fieldMeta(element);
    const host = typeof location !== 'undefined' ? location.hostname || '' : '';
    const path = typeof location !== 'undefined' ? location.pathname || '' : '';

    const intentMeta = global.GoldspireDetectionIntent?.inferIntent?.(element, {
      host,
      path,
      source: partial.source || 'paste',
      ...meta,
      ...partial,
    }) || {
      intent: 'general',
      outboundRisk: 'medium',
      expectsPii: false,
      inForm: false,
      signals: [],
    };

    const hints = global.GoldspireDetectionIntent?.fieldHints?.(element) || {
      labelText: '', placeholder: '', name: '', id: '', autocomplete: '',
    };

    return global.GoldspireDetectionContext?.createContext?.({
      host,
      path,
      source: partial.source || 'paste',
      ...meta,
      ...partial,
      intent: intentMeta.intent,
      outboundRisk: intentMeta.outboundRisk,
      expectsPii: intentMeta.expectsPii,
      inForm: intentMeta.inForm,
      intentSignals: intentMeta.signals,
      isNameField: intentMeta.isNameField || global.GoldspireDetectionIntent?.isNameField?.(element),
      isGovernmentIdField: intentMeta.isGovernmentIdField || global.GoldspireDetectionIntent?.isGovernmentIdField?.(element),
      fieldLabel: hints.labelText,
      fieldPlaceholder: hints.placeholder,
      fieldName: hints.name,
      fieldId: hints.id,
      fieldAutocomplete: hints.autocomplete,
    }) || { host, path, source: partial.source || 'paste', ...meta, ...intentMeta };
  }

  function shouldLogDetection(hit, minConfidence = 50) {
    return Boolean(hit?.category) && Number(hit.confidence) >= minConfidence;
  }

  function pasteDedupeKey(text, host) {
    return `${host}:${String(text || '').trim().slice(0, 512)}`;
  }

  global.GoldspireObserveContext = {
    contextFromTarget,
    shouldLogDetection,
    pasteDedupeKey,
    fieldMeta,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
