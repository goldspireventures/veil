/**
 * Infer user intent from URL, form structure, and field semantics.
 * Product heuristics: GoldspireIntentConfig. Deployment hosts: GoldspireConstants.
 */
(function (global) {
  const compiled = {};

  function intentCfg() {
    return global.GoldspireIntentConfig || {};
  }

  function pattern(name, fallback) {
    if (!compiled[name]) {
      const source = intentCfg()[`${name}Pattern`] || fallback || '$^';
      compiled[name] = new RegExp(source, 'i');
    }
    return compiled[name];
  }

  function piiAutocomplete() {
    if (!compiled.piiAutocomplete) {
      compiled.piiAutocomplete = new Set(intentCfg().piiAutocomplete || []);
    }
    return compiled.piiAutocomplete;
  }

  function deployment() {
    return global.GoldspireConstants || {};
  }

  function isOwnPortalHost(host) {
    const portalHost = deployment().PORTAL_HOST || '';
    return Boolean(portalHost && host === portalHost);
  }

  function isOwnApiHost(host) {
    const apiHost = deployment().API_HOST || '';
    return Boolean(apiHost && host === apiHost);
  }

  function isAdminSurface(host, path) {
    if (pattern('partnerAdminHost').test(host || '')) return true;
    if (isOwnPortalHost(host) || isOwnApiHost(host)) return true;
    if (pattern('adminPath').test(path || '')) return true;
    return false;
  }

  function resolveElement(target) {
    if (!target) return null;
    if (typeof Element !== 'undefined' && target instanceof Element) return target;
    if (target.tagName) return target;
    return target.parentElement || null;
  }

  function closestForm(element) {
    if (!element) return null;
    if (typeof element.closest === 'function') {
      return element.closest('form');
    }
    let node = element;
    while (node) {
      if (String(node.tagName || '').toUpperCase() === 'FORM') return node;
      node = node.parentElement;
    }
    return null;
  }

  function fieldHints(element) {
    if (!element) {
      return { autocomplete: '', labelText: '', placeholder: '', name: '', id: '' };
    }
    const autocomplete = String(element.getAttribute?.('autocomplete') || element.autocomplete || '').toLowerCase();
    const placeholder = String(element.placeholder || element.getAttribute?.('placeholder') || '');
    const name = String(element.name || element.getAttribute?.('name') || '');
    const id = String(element.id || element.getAttribute?.('id') || '');

    let labelText = String(element.getAttribute?.('aria-label') || '');
    if (!labelText && id && typeof document !== 'undefined') {
      const safeId = id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const label = document.querySelector(`label[for="${safeId}"]`);
      if (label) labelText = label.textContent || '';
    }
    if (!labelText && typeof document !== 'undefined') {
      let node = element.parentElement;
      for (let depth = 0; depth < 5 && node; depth += 1) {
        const nearby = node.querySelector?.('.form-label, .form-label-top, label, [class*="label"]');
        if (nearby?.textContent?.trim()) {
          labelText = nearby.textContent;
          break;
        }
        node = node.parentElement;
      }
    }

    return { autocomplete, labelText, placeholder, name, id };
  }

  function isNameField(element) {
    const hints = fieldHints(element);
    const auto = piiAutocomplete();
    if (auto.has(hints.autocomplete) && ['given-name', 'family-name', 'name', 'nickname', 'additional-name'].includes(hints.autocomplete)) {
      return true;
    }
    const combined = `${hints.labelText} ${hints.placeholder} ${hints.name} ${hints.id}`;
    return /\b(first|last|full|given|family|sur|middle|maiden)\s*name\b/i.test(combined)
      || /\bstudent\s*name\b/i.test(combined);
  }

  function isGovernmentIdField(element) {
    const hints = fieldHints(element);
    const combined = `${hints.labelText} ${hints.placeholder} ${hints.name} ${hints.id}`;
    return /\b(pps|personal public service|national id|national insurance|nino|social security|ssn|tax id|student id)\b/i.test(combined);
  }

  function fieldExpectsPii(element) {
    if (!element) return false;
    const hints = fieldHints(element);
    const auto = piiAutocomplete();
    const labelRe = pattern('piiLabel');
    if (auto.has(hints.autocomplete)) return true;
    const combined = `${hints.labelText} ${hints.placeholder} ${hints.name} ${hints.id}`;
    return labelRe.test(combined);
  }

  function isFormHost(host = '') {
    return pattern('formHost').test(host || '');
  }

  function formExpectsPii(form, element) {
    if (fieldExpectsPii(element)) return true;
    if (!form && !element) return false;

    const hints = fieldHints(element);
    const auto = piiAutocomplete();
    const labelRe = pattern('piiLabel');
    if (auto.has(hints.autocomplete)) return true;
    const combined = `${hints.labelText} ${hints.placeholder} ${hints.name} ${hints.id}`;
    if (labelRe.test(combined)) return true;

    if (!form || typeof form.querySelectorAll !== 'function') return false;

    let piiFields = 0;
    const fields = form.querySelectorAll('input, textarea, select');
    for (const field of fields) {
      const h = fieldHints(field);
      if (auto.has(h.autocomplete)) piiFields += 1;
      else if (labelRe.test(`${h.labelText} ${h.placeholder} ${h.name}`)) piiFields += 1;
    }
    return piiFields >= 2;
  }

  function isSearchField(element, meta = {}) {
    if (!element) return false;
    const type = String(element.type || meta.fieldType || '').toLowerCase();
    if (type === 'search') return true;
    const role = String(element.getAttribute?.('role') || '').toLowerCase();
    return role === 'searchbox';
  }

  function isMailCompose(host, path, meta) {
    if (!pattern('mailHost').test(host || '')) return false;
    if (pattern('composePath').test(path || '')) return true;
    if (meta.editorKind === 'contenteditable' || meta.editorKind === 'textarea') return true;
    return meta.fieldType === 'textarea' || meta.editorKind === 'structured';
  }

  function inferIntent(target, partial = {}) {
    const element = resolveElement(target);
    const host = partial.host || (typeof location !== 'undefined' ? location.hostname || '' : '');
    const path = partial.path || (typeof location !== 'undefined' ? location.pathname || '' : '');
    const meta = {
      fieldType: partial.fieldType || '',
      editorKind: partial.editorKind || '',
      isPasswordField: Boolean(partial.isPasswordField),
      isEmailField: Boolean(partial.isEmailField),
      isPhoneField: Boolean(partial.isPhoneField),
    };

    const form = closestForm(element);
    const expectsPii = formExpectsPii(form, element);
    const signals = [];

    if (partial.source === 'ai_prompt' || partial.isAiSurface) {
      return {
        intent: 'ai_prompt',
        outboundRisk: 'high',
        expectsPii: false,
        inForm: Boolean(form),
        signals: ['ai_surface'],
      };
    }

    if (isSearchField(element, meta)) {
      signals.push('search_field');
      return {
        intent: 'search',
        outboundRisk: 'low',
        expectsPii: false,
        inForm: Boolean(form),
        signals,
      };
    }

    if (isAdminSurface(host, path)) {
      signals.push('admin_surface');
      return {
        intent: 'admin_portal',
        outboundRisk: 'low',
        expectsPii: expectsPii,
        inForm: Boolean(form),
        signals,
      };
    }

    if (isMailCompose(host, path, meta) && partial.source !== 'type') {
      signals.push('mail_compose');
      return {
        intent: 'compose_outbound',
        outboundRisk: 'high',
        expectsPii: false,
        inForm: false,
        signals,
      };
    }

    if (isMailCompose(host, path, meta) && meta.editorKind === 'textarea') {
      signals.push('mail_body');
      return {
        intent: 'compose_outbound',
        outboundRisk: 'high',
        expectsPii: false,
        inForm: Boolean(form),
        signals,
      };
    }

    if (pattern('formPath').test(path)) {
      signals.push('form_url');
    }
    if (form) signals.push('html_form');
    if (expectsPii) signals.push('expected_pii');

    if (form || pattern('formPath').test(path) || expectsPii || isFormHost(host)) {
      return {
        intent: 'form_data_entry',
        outboundRisk: 'low',
        expectsPii: expectsPii || pattern('formPath').test(path) || isFormHost(host),
        inForm: Boolean(form) || isFormHost(host),
        signals,
        isNameField: isNameField(element),
        isGovernmentIdField: isGovernmentIdField(element),
      };
    }

    if (meta.editorKind === 'contenteditable' || meta.editorKind === 'textarea') {
      signals.push('editable_surface');
      return {
        intent: 'compose_outbound',
        outboundRisk: 'medium',
        expectsPii: false,
        inForm: Boolean(form),
        signals,
      };
    }

    return {
      intent: 'general',
      outboundRisk: 'medium',
      expectsPii: false,
      inForm: Boolean(form),
      signals,
    };
  }

  global.GoldspireDetectionIntent = {
    inferIntent,
    formExpectsPii,
    fieldExpectsPii,
    fieldHints,
    isNameField,
    isGovernmentIdField,
    isAdminSurface,
    isOwnPortalHost,
    mailHostPattern: () => pattern('mailHost'),
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
