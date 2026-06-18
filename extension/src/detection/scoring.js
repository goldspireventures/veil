/**
 * Scoring engine — category severity, context boosts, recommendations.
 */
(function (global) {
  const SEVERITY_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };

  const BASE_SEVERITY = {
    credit_card: 'high',
    api_key: 'critical',
    jwt: 'critical',
    password: 'medium',
    email: 'medium',
    phone: 'medium',
    iban: 'high',
    routing_number: 'high',
    swift_bic: 'high',
    tax_id: 'high',
    nhs_number: 'critical',
    date_of_birth: 'high',
    bank_account: 'high',
    national_id: 'high',
    passport: 'high',
    driver_license: 'high',
    medical_record_number: 'critical',
    ssn: 'critical',
    customer_id: 'medium',
    internal_company_reference: 'medium',
    pii: 'medium',
  };

  const RECOMMENDATIONS = {
    credit_card: 'Mask or encrypt before sharing.',
    api_key: 'Remove or encrypt credentials before sending.',
    jwt: 'Do not share tokens in plain text.',
    password: 'Use encrypt or a password manager.',
    email: 'Confirm this recipient should receive personal data.',
    phone: 'Confirm this recipient should receive personal data.',
    iban: 'Mask or encrypt financial identifiers before sharing.',
    routing_number: 'Mask or encrypt bank routing details before sharing.',
    swift_bic: 'Mask or encrypt SWIFT/BIC codes before sharing.',
    tax_id: 'Mask or encrypt tax identifiers before sharing.',
    nhs_number: 'UK NHS numbers are personal health data — do not share in plain text.',
    date_of_birth: 'Dates of birth are personal data — mask or encrypt before sharing.',
    bank_account: 'Mask or encrypt bank account details before sharing.',
    national_id: 'Do not share government identifiers in plain text.',
    passport: 'Do not share passport numbers in plain text.',
    driver_license: 'Do not share license numbers in plain text.',
    medical_record_number: 'HIPAA-sensitive — do not share medical identifiers.',
    ssn: 'Do not share Social Security numbers in plain text.',
    customer_id: 'Verify whether this customer identifier should be shared.',
    internal_company_reference: 'Protect internal business references.',
    pii: 'Review personal data before sharing.',
  };

  function normalizeSeverity(value) {
    const key = String(value || 'low').toLowerCase();
    return SEVERITY_ORDER[key] != null ? key : 'low';
  }

  function maxSeverity(a, b) {
    return SEVERITY_ORDER[normalizeSeverity(a)] >= SEVERITY_ORDER[normalizeSeverity(b)] ? normalizeSeverity(a) : normalizeSeverity(b);
  }

  function recommendationFor(category) {
    return RECOMMENDATIONS[category] || 'Review sensitive content before sharing.';
  }

  function applyContextBoosts(category, severity, confidence, context = {}) {
    let next = normalizeSeverity(severity || BASE_SEVERITY[category] || 'low');

    if (context.isPasswordField && (category === 'password' || category === 'api_key') && confidence >= 50) {
      next = maxSeverity(next, 'high');
    }

    if (context.source === 'ai_prompt' || context.isAiSurface) {
      if (category === 'api_key' || category === 'jwt' || category === 'ssn' || category === 'credit_card') {
        next = maxSeverity(next, 'critical');
      } else if (category === 'email' || category === 'phone' || category === 'password') {
        next = maxSeverity(next, 'high');
      }
    }

    if (context.source === 'paste' && confidence >= 80) {
      next = maxSeverity(next, BASE_SEVERITY[category] || next);
    }

    return next;
  }

  function scoreOne(result, context = {}) {
    const category = result.category || 'unknown';
    const confidence = Math.min(100, Math.max(0, Number(result.confidence) || 0));
    const baseSeverity = result.severity || BASE_SEVERITY[category] || 'low';
    const severity = applyContextBoosts(category, baseSeverity, confidence, context);

    return {
      category,
      confidence,
      matchedText: result.matchedText || '',
      severity,
      recommendation: result.recommendation || recommendationFor(category),
    };
  }

  function scoreAll(results, context = {}) {
    if (!Array.isArray(results)) return [];
    const scored = results.map((entry) => scoreOne(entry, context));
    return global.GoldspireCompliance?.attachComplianceAll?.(scored) || scored;
  }

  function highestSeverity(results) {
    if (!results?.length) return 'low';
    return results.reduce((max, entry) => maxSeverity(max, entry.severity), 'low');
  }

  global.GoldspireScoring = {
    scoreAll,
    scoreOne,
    highestSeverity,
    SEVERITY_ORDER,
    BASE_SEVERITY,
    recommendationFor,
    applyContextBoosts,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
