/**
 * Compliance framework mapping per detection category.
 */
(function (global) {
  const FRAMEWORKS = Object.freeze({
    credit_card: ['PCI DSS', 'GDPR'],
    iban: ['GDPR', 'PCI DSS', 'SOC 2'],
    routing_number: ['PCI DSS', 'GLBA', 'SOC 2', 'GDPR'],
    swift_bic: ['PCI DSS', 'GLBA', 'SOC 2', 'GDPR'],
    tax_id: ['GDPR', 'SOC 2', 'GLBA'],
    nhs_number: ['GDPR', 'HIPAA'],
    date_of_birth: ['GDPR', 'HIPAA'],
    bank_account: ['PCI DSS', 'GDPR', 'SOC 2', 'GLBA'],
    api_key: ['SOC 2', 'ISO 27001'],
    jwt: ['SOC 2', 'ISO 27001'],
    password: ['SOC 2', 'ISO 27001'],
    email: ['GDPR'],
    phone: ['GDPR'],
    ssn: ['GDPR', 'SOC 2', 'ISO 27001'],
    national_id: ['GDPR', 'SOC 2'],
    passport: ['GDPR', 'SOC 2'],
    driver_license: ['GDPR'],
    medical_record_number: ['HIPAA', 'GDPR'],
    customer_id: ['GDPR', 'SOC 2'],
    internal_company_reference: ['SOC 2', 'ISO 27001'],
    pii: ['GDPR'],
  });

  const DEFAULT = ['GDPR'];

  function frameworksFor(category) {
    const key = String(category || '').toLowerCase();
    return FRAMEWORKS[key] ? [...FRAMEWORKS[key]] : [...DEFAULT];
  }

  function attachCompliance(result) {
    if (!result || typeof result !== 'object') return result;
    return {
      ...result,
      compliance: frameworksFor(result.category),
    };
  }

  function attachComplianceAll(results) {
    if (!Array.isArray(results)) return [];
    return results.map(attachCompliance);
  }

  function primaryFramework(category) {
    return frameworksFor(category)[0] || 'GDPR';
  }

  global.GoldspireCompliance = {
    FRAMEWORKS,
    frameworksFor,
    attachCompliance,
    attachComplianceAll,
    primaryFramework,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
