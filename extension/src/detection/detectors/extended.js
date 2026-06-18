/**
 * Extended detectors (Sprint 14) — IBAN, SSN, national ID, etc.
 */
(function (global) {
  if (!global.GoldspireDetection?.register || !global.GoldspireDetectionLib) return;

  const DETECTORS = [
    ['iban', 'findIbans'],
    ['routing_number', 'findRoutingNumbers'],
    ['swift_bic', 'findSwiftBics'],
    ['tax_id', 'findTaxIds'],
    ['nhs_number', 'findNhsNumbers'],
    ['date_of_birth', 'findDatesOfBirth'],
    ['ssn', 'findSsns'],
    ['bank_account', 'findBankAccounts'],
    ['national_id', 'findNationalIds'],
    ['passport', 'findPassports'],
    ['driver_license', 'findDriverLicenses'],
    ['medical_record_number', 'findMedicalRecordNumbers'],
    ['customer_id', 'findCustomerIds'],
    ['internal_company_reference', 'findInternalCompanyRefs'],
  ];

  for (const [category, fn] of DETECTORS) {
    global.GoldspireDetection.register({
      id: category,
      category,
      detect(text, context) {
        const finder = global.GoldspireDetectionLib[fn];
        return typeof finder === 'function' ? finder(text, context) : [];
      },
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self);
