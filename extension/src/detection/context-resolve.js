/**
 * Context-aware disambiguation — suppress false positives and prefer field-appropriate IDs.
 */
(function (global) {
  const NAME_AUTOCOMPLETE = new Set(['name', 'given-name', 'family-name', 'nickname', 'additional-name']);
  const NAME_LABEL_RE = /\b(first|last|full|given|family|sur|middle|maiden)\s*name\b/i;
  const GOV_ID_LABEL_RE = /\b(pps|personal public service|national id|national insurance|nino|social security|ssn|tax id|student id)\b/i;

  function fieldText(context = {}) {
    return `${context.fieldLabel || ''} ${context.fieldPlaceholder || ''} ${context.fieldName || ''} ${context.fieldId || ''}`.trim();
  }

  function isNameFieldContext(context = {}) {
    if (context.isNameField) return true;
    const auto = String(context.autocomplete || context.fieldAutocomplete || '').toLowerCase();
    if (NAME_AUTOCOMPLETE.has(auto)) return true;
    return NAME_LABEL_RE.test(fieldText(context));
  }

  function isGovernmentIdFieldContext(context = {}) {
    if (context.isGovernmentIdField) return true;
    return GOV_ID_LABEL_RE.test(fieldText(context));
  }

  function isLowRiskFormField(context = {}) {
    return (
      context.intent === 'form_data_entry'
      || context.inForm
      || isNameFieldContext(context)
      || isGovernmentIdFieldContext(context)
    );
  }

  function originalSlice(text, hit) {
    const raw = String(hit?.matchedTextRaw || '');
    if (!raw) return '';
    const idx = typeof hit.index === 'number' ? hit.index : String(text || '').indexOf(raw);
    if (idx < 0) return raw;
    return String(text).slice(idx, idx + raw.length);
  }

  function isHighConfidenceSecret(hit) {
    const cat = hit?.category || '';
    const conf = Number(hit?.confidence) || 0;
    if (cat === 'api_key' && conf >= 90) return true;
    if (cat === 'jwt' && conf >= 85) return true;
    if (cat === 'credit_card' && conf >= 85) return true;
    return false;
  }

  function looksLikeTypedName(text, hit) {
    const slice = originalSlice(text, hit);
    if (!slice || /\d/.test(slice)) return false;
    return slice === slice.toLowerCase() && /^[a-z]+$/.test(slice);
  }

  function compactText(text) {
    return String(text || '').replace(/\s/g, '').toUpperCase();
  }

  function hasIbanLead(text) {
    return /^[A-Z]{2}\d{2}/.test(compactText(text));
  }

  function resolveDetections(text, detections = [], context = {}) {
    const input = String(text || '');
    if (!input || !detections.length) return detections;

    const nameField = isNameFieldContext(context);
    const govIdField = isGovernmentIdFieldContext(context);
    const formContext = isLowRiskFormField(context);
    const ibanLead = hasIbanLead(input);

    let out = detections.filter((hit) => {
      const cat = hit?.category || '';

      if (nameField && ['api_key', 'swift_bic', 'jwt', 'iban', 'credit_card', 'routing_number'].includes(cat)) {
        return isHighConfidenceSecret(hit);
      }

      if (formContext && nameField && ['phone', 'email', 'customer_id', 'internal_company_reference'].includes(cat)) {
        return false;
      }

      if (cat === 'swift_bic' && looksLikeTypedName(input, hit)) {
        return false;
      }

      if (cat === 'api_key' && looksLikeTypedName(input, hit) && (Number(hit.confidence) || 0) < 90) {
        return false;
      }

      if (cat === 'iban' && !ibanLead && govIdField) {
        return false;
      }

      if (cat === 'iban' && !ibanLead && /^\d{7}[A-W]/i.test(compactText(hit.matchedTextRaw || ''))) {
        return false;
      }

      if (cat === 'national_id' && ibanLead) {
        return false;
      }

      return true;
    });

    if (govIdField && !ibanLead) {
      out = out.filter((hit) => hit.category !== 'iban' && hit.category !== 'swift_bic');
    }

    return global.GoldspireDetectionLib?.sortDetections?.(out) || out;
  }

  global.GoldspireDetectionContextResolve = {
    resolveDetections,
    isNameFieldContext,
    isGovernmentIdFieldContext,
    isLowRiskFormField,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
