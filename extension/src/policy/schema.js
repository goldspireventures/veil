/**
 * DLP policy schema — stored in organizations.settings.dlp
 */
(function (global) {
  const ENFORCEMENT_ACTIONS = Object.freeze(['allow', 'warn', 'block', 'auto_mask']);

  const DEFAULT_CATEGORY_RULES = Object.freeze({
    credit_card: { action: 'warn', minSeverity: 'medium' },
    api_key: { action: 'block', minSeverity: 'high' },
    jwt: { action: 'block', minSeverity: 'high' },
    password: { action: 'warn', minSeverity: 'medium' },
    email: { action: 'allow', minSeverity: 'high' },
    phone: { action: 'allow', minSeverity: 'high' },
    ssn: { action: 'block', minSeverity: 'high' },
    iban: { action: 'warn', minSeverity: 'high' },
    routing_number: { action: 'warn', minSeverity: 'high' },
    swift_bic: { action: 'warn', minSeverity: 'high' },
    tax_id: { action: 'warn', minSeverity: 'high' },
    nhs_number: { action: 'block', minSeverity: 'high' },
    date_of_birth: { action: 'warn', minSeverity: 'high' },
    bank_account: { action: 'warn', minSeverity: 'high' },
    national_id: { action: 'block', minSeverity: 'high' },
    passport: { action: 'block', minSeverity: 'high' },
    driver_license: { action: 'warn', minSeverity: 'high' },
    medical_record_number: { action: 'block', minSeverity: 'high' },
    customer_id: { action: 'allow', minSeverity: 'high' },
    internal_company_reference: { action: 'warn', minSeverity: 'medium' },
    pii: { action: 'warn', minSeverity: 'medium' },
  });

  const DEFAULT_DLP_POLICY = Object.freeze({
    version: 1,
    enabled: false,
    defaultAction: 'warn',
    categories: { ...DEFAULT_CATEGORY_RULES },
    aiSurfaces: {
      defaultAction: 'block',
      categories: {
        api_key: { action: 'block' },
        jwt: { action: 'block' },
        credit_card: { action: 'block' },
        ssn: { action: 'block' },
        password: { action: 'warn' },
      },
    },
  });

  function normalizeAction(value, fallback = 'warn') {
    const action = String(value || fallback).toLowerCase();
    return ENFORCEMENT_ACTIONS.includes(action) ? action : fallback;
  }

  function normalizeCategoryRule(rule = {}, fallbackAction = 'warn') {
    if (!rule || typeof rule !== 'object') {
      return { action: fallbackAction, minSeverity: 'medium' };
    }
    return {
      action: normalizeAction(rule.action, fallbackAction),
      minSeverity: String(rule.minSeverity || 'medium').toLowerCase(),
    };
  }

  function normalizePolicy(raw = {}) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const categories = {};
    for (const [key, rule] of Object.entries(DEFAULT_CATEGORY_RULES)) {
      categories[key] = normalizeCategoryRule(input.categories?.[key] || rule, rule.action);
    }
    for (const [key, rule] of Object.entries(input.categories || {})) {
      if (!categories[key]) {
        categories[key] = normalizeCategoryRule(rule, DEFAULT_DLP_POLICY.defaultAction);
      }
    }

    const aiCategories = {};
    for (const [key, rule] of Object.entries(DEFAULT_DLP_POLICY.aiSurfaces.categories)) {
      aiCategories[key] = normalizeCategoryRule(
        input.aiSurfaces?.categories?.[key] || rule,
        rule.action,
      );
    }
    for (const [key, rule] of Object.entries(input.aiSurfaces?.categories || {})) {
      if (!aiCategories[key]) {
        aiCategories[key] = normalizeCategoryRule(rule, 'block');
      }
    }

    return {
      version: Number(input.version) || DEFAULT_DLP_POLICY.version,
      enabled: input.enabled === true,
      defaultAction: normalizeAction(input.defaultAction, DEFAULT_DLP_POLICY.defaultAction),
      categories,
      aiSurfaces: {
        defaultAction: normalizeAction(
          input.aiSurfaces?.defaultAction,
          DEFAULT_DLP_POLICY.aiSurfaces.defaultAction,
        ),
        categories: aiCategories,
      },
    };
  }

  function policyFromSettings(settings = {}) {
    let policy;
    if (settings.dlpPolicy && typeof settings.dlpPolicy === 'object') {
      policy = normalizePolicy(settings.dlpPolicy);
    } else {
      policy = normalizePolicy({});
    }
    if (settings.teamDlpPolicy && typeof settings.teamDlpPolicy === 'object') {
      const teamPolicy = normalizePolicy(settings.teamDlpPolicy);
      policy = {
        ...policy,
        ...teamPolicy,
        enabled: teamPolicy.enabled || policy.enabled,
        categories: { ...policy.categories, ...teamPolicy.categories },
        aiSurfaces: {
          ...policy.aiSurfaces,
          ...teamPolicy.aiSurfaces,
          categories: {
            ...policy.aiSurfaces?.categories,
            ...teamPolicy.aiSurfaces?.categories,
          },
        },
      };
    }
    if (global.GoldspireSettings?.normalizeDlpMode?.(settings.dlpMode) === 'enforce') {
      policy = { ...policy, enabled: true };
    }
    return policy;
  }

  global.GoldspireDlpSchema = {
    ENFORCEMENT_ACTIONS,
    DEFAULT_DLP_POLICY,
    DEFAULT_CATEGORY_RULES,
    normalizePolicy,
    normalizeAction,
    policyFromSettings,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
