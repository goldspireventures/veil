/**
 * Veil org DLP policy packs — shared by admin portal.
 */
(function (global) {
  const PACKS = Object.freeze({
    observational: {
      id: 'observational',
      label: 'Observational',
      description: 'Copilot suggests actions; no automatic blocks. Good for rollout.',
      dlp: {
        version: 1,
        enabled: false,
        defaultAction: 'warn',
        categories: {},
        aiSurfaces: { defaultAction: 'block', categories: {} },
      },
    },
    finance: {
      id: 'finance',
      label: 'Finance',
      description: 'Block cards, IBANs, routing/SWIFT, tax IDs, and secrets in compose.',
      dlp: {
        version: 1,
        enabled: true,
        defaultAction: 'warn',
        categories: {
          credit_card: { action: 'block', minSeverity: 'medium' },
          bank_account: { action: 'block', minSeverity: 'high' },
          iban: { action: 'block', minSeverity: 'high' },
          routing_number: { action: 'block', minSeverity: 'high' },
          swift_bic: { action: 'block', minSeverity: 'high' },
          tax_id: { action: 'block', minSeverity: 'high' },
          ssn: { action: 'block', minSeverity: 'high' },
          national_id: { action: 'block', minSeverity: 'high' },
          api_key: { action: 'block', minSeverity: 'high' },
          jwt: { action: 'block', minSeverity: 'high' },
        },
        aiSurfaces: {
          defaultAction: 'block',
          categories: {
            credit_card: { action: 'block' },
            iban: { action: 'block' },
            tax_id: { action: 'block' },
            api_key: { action: 'block' },
            jwt: { action: 'block' },
          },
        },
      },
    },
    healthcare: {
      id: 'healthcare',
      label: 'Healthcare',
      description: 'HIPAA-oriented: block MRNs, NHS numbers, SSNs, DOB, and payment data.',
      dlp: {
        version: 1,
        enabled: true,
        defaultAction: 'warn',
        categories: {
          medical_record_number: { action: 'block', minSeverity: 'high' },
          nhs_number: { action: 'block', minSeverity: 'high' },
          ssn: { action: 'block', minSeverity: 'high' },
          date_of_birth: { action: 'block', minSeverity: 'high' },
          credit_card: { action: 'block', minSeverity: 'high' },
          national_id: { action: 'block', minSeverity: 'high' },
          passport: { action: 'block', minSeverity: 'high' },
          email: { action: 'warn', minSeverity: 'high' },
          phone: { action: 'warn', minSeverity: 'high' },
        },
        aiSurfaces: {
          defaultAction: 'block',
          categories: {
            medical_record_number: { action: 'block' },
            nhs_number: { action: 'block' },
            ssn: { action: 'block' },
            date_of_birth: { action: 'block' },
            credit_card: { action: 'block' },
          },
        },
      },
    },
    gdpr: {
      id: 'gdpr',
      label: 'GDPR / EU privacy',
      description: 'Warn or block personal and financial identifiers common in EU workflows.',
      dlp: {
        version: 1,
        enabled: true,
        defaultAction: 'warn',
        categories: {
          email: { action: 'warn', minSeverity: 'medium' },
          phone: { action: 'warn', minSeverity: 'medium' },
          national_id: { action: 'block', minSeverity: 'high' },
          iban: { action: 'block', minSeverity: 'high' },
          tax_id: { action: 'block', minSeverity: 'high' },
          swift_bic: { action: 'block', minSeverity: 'high' },
          date_of_birth: { action: 'block', minSeverity: 'high' },
          passport: { action: 'block', minSeverity: 'high' },
          api_key: { action: 'block', minSeverity: 'high' },
        },
        aiSurfaces: {
          defaultAction: 'block',
          categories: {
            email: { action: 'warn' },
            phone: { action: 'warn' },
            iban: { action: 'block' },
            national_id: { action: 'block' },
            api_key: { action: 'block' },
          },
        },
      },
    },
    engineering: {
      id: 'engineering',
      label: 'Engineering',
      description: 'Block secrets and tokens; warn on internal references.',
      dlp: {
        version: 1,
        enabled: true,
        defaultAction: 'warn',
        categories: {
          api_key: { action: 'block', minSeverity: 'high' },
          jwt: { action: 'block', minSeverity: 'high' },
          password: { action: 'warn', minSeverity: 'medium' },
          internal_company_reference: { action: 'warn', minSeverity: 'medium' },
        },
        aiSurfaces: {
          defaultAction: 'block',
          categories: {
            api_key: { action: 'block' },
            jwt: { action: 'block' },
            password: { action: 'warn' },
          },
        },
      },
    },
  });

  global.GoldspirePolicyPacks = {
    list() {
      return Object.values(PACKS);
    },
    get(id) {
      return PACKS[String(id || '').trim()] || null;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
