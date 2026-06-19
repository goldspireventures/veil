/**
 * Pure detection helpers (no DOM). Tested via Node vm in tests/detection/.
 */
(function (global) {
  const API_KEY_PREFIXES = [
    { prefix: 'sk-', label: 'OpenAI-style secret key' },
    { prefix: 'sk_live_', label: 'Stripe secret key (live)' },
    { prefix: 'sk_test_', label: 'Stripe secret key (test)' },
    { prefix: 'rk_live_', label: 'Stripe restricted key (live)' },
    { prefix: 'rk_test_', label: 'Stripe restricted key (test)' },
    { prefix: 'whsec_', label: 'Stripe webhook signing secret' },
    { prefix: 'sk-proj-', label: 'OpenAI project key' },
    { prefix: 'ghp_', label: 'GitHub personal access token' },
    { prefix: 'ghs_', label: 'GitHub secret' },
    { prefix: 'glpat-', label: 'GitLab personal access token' },
    { prefix: 'xoxb-', label: 'Slack bot token' },
    { prefix: 'xoxp-', label: 'Slack user token' },
    { prefix: 'xoxa-', label: 'Slack app token' },
    { prefix: 'xoxr-', label: 'Slack refresh token' },
    { prefix: 'xoxs-', label: 'Slack session token' },
    { prefix: 'AIza', label: 'Google API key' },
    { prefix: 'AKIA', label: 'AWS access key id' },
    { prefix: 'ya29.', label: 'Google OAuth token' },
  ];

  function redactPreview(value, { showLast = 4 } = {}) {
    const text = String(value || '');
    if (!text) return '';
    if (text.length <= showLast) return '*'.repeat(text.length);
    const maskLen = Math.max(4, text.length - showLast);
    return `${'*'.repeat(maskLen)}${text.slice(-showLast)}`;
  }

  function normalizeDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function luhnCheck(digits) {
    const normalized = normalizeDigits(digits);
    if (normalized.length < 13 || normalized.length > 19) return false;
    let sum = 0;
    let alternate = false;
    for (let i = normalized.length - 1; i >= 0; i -= 1) {
      let n = normalized.charCodeAt(i) - 48;
      if (n < 0 || n > 9) return false;
      if (alternate) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alternate = !alternate;
    }
    return sum % 10 === 0;
  }

  function findCreditCards(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?:\d{4}(?:[ \-]?\d{4}){2}[ \-]?\d{1,4}|\d{13,19})\b/g;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[0];
      const digits = normalizeDigits(raw);
      if (digits.length < 13 || digits.length > 19) continue;
      if (!luhnCheck(digits)) continue;
      let confidence = 85;
      if (digits.length === 16) confidence += 8;
      if (/^4|^5[1-5]|^3[47]/.test(digits)) confidence += 5;
      results.push({
        category: 'credit_card',
        matchedText: redactPreview(digits, { showLast: 4 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: Math.min(98, confidence),
        severity: 'high',
        recommendation: 'Mask or encrypt before sharing.',
      });
    }
    return results;
  }

  function looksLikeJwtSegment(segment) {
    return /^[A-Za-z0-9_-]+$/.test(segment) && segment.length >= 8;
  }

  function findJwts(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\b/g;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const [raw, header, payload, signature] = match;
      if (!looksLikeJwtSegment(header) || !looksLikeJwtSegment(payload)) continue;
      if (!looksLikeJwtSegment(signature) || signature.length < 8) continue;

      let confidence = 80;
      if (header.startsWith('eyJ')) confidence += 12;
      if (payload.startsWith('eyJ')) confidence += 5;

      results.push({
        category: 'jwt',
        matchedText: redactPreview(raw, { showLast: 8 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: Math.min(98, confidence),
        severity: 'critical',
        recommendation: 'Do not share tokens in plain text.',
      });
    }
    return results;
  }

  function findApiKeys(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();

    for (const { prefix, label } of API_KEY_PREFIXES) {
      const pattern = new RegExp(
        `\\b${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[A-Za-z0-9_\\-./+=]{4,}\\b`,
        'gi',
      );
      let match;
      while ((match = pattern.exec(input)) !== null) {
        const raw = match[0];
        const key = raw.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          category: 'api_key',
          matchedText: redactPreview(raw, { showLast: 4 }),
          matchedTextRaw: raw,
          index: match.index,
          confidence: 92,
          severity: 'critical',
          recommendation: `Remove or encrypt credentials (${label}).`,
        });
      }
    }

    const trimmed = input.trim();
    if (
      trimmed.length >= 10
      && trimmed.length <= 256
      && /^[A-Za-z0-9_\-./+]+$/.test(trimmed)
      && !/^\d+$/.test(trimmed)
      && !fieldLooksLikeIban(trimmed)
      && !shouldSkipGenericSecretGuess(trimmed)
      && !findJwts(trimmed).some((entry) => entry.matchedTextRaw === trimmed)
    ) {
      const key = `generic:${trimmed}`;
      if (!seen.has(key)) {
        let confidence = 55;
        if (trimmed.length >= 20) confidence += 10;
        if (/[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed) && /\d/.test(trimmed)) confidence += 10;
        results.push({
          category: 'api_key',
          matchedText: redactPreview(trimmed, { showLast: 4 }),
          matchedTextRaw: trimmed,
          index: input.indexOf(trimmed),
          confidence: Math.min(75, confidence),
          severity: 'medium',
          recommendation: 'This may be a secret or API token — verify before sharing.',
        });
      }
    }

    return results;
  }

  const EXAMPLE_EMAIL_DOMAINS = new Set(['example.com', 'example.org', 'test.com', 'localhost']);

  function findEmails(text, context = {}) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const results = [];
    const seen = new Set();
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[0];
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const domain = key.slice(key.indexOf('@') + 1);
      if (EXAMPLE_EMAIL_DOMAINS.has(domain)) continue;

      let confidence = 78;
      if (context.fieldType === 'email' || context.isEmailField) confidence -= 50;
      if (confidence < 35) continue;

      const local = key.split('@')[0];
      results.push({
        category: 'email',
        matchedText: `${redactPreview(local, { showLast: 1 })}@${domain}`,
        matchedTextRaw: raw,
        index: match.index,
        confidence: Math.min(95, confidence),
        severity: 'medium',
        recommendation: 'Confirm this recipient should receive personal data.',
      });
    }
    return results;
  }

  function findPhones(text, context = {}) {
    const input = String(text || '');
    if (!input) return [];
    if (fieldLooksLikeIban(input)) return [];
    const patterns = [
      /\b\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g,
      /\b\(\d{3}\)\s*\d{3}[-.\s]?\d{4}\b/g,
      /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
    ];
    const results = [];
    const seen = new Set();

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(input)) !== null) {
        const raw = match[0];
        const digits = normalizeDigits(raw);
        if (digits.length < 10 || digits.length > 15) continue;
        if (seen.has(digits)) continue;
        seen.add(digits);

        let confidence = 72;
        if (digits.length === 10 || digits.length === 11) confidence += 10;
        if (context.fieldType === 'tel' || context.isPhoneField) confidence -= 20;
        if (confidence < 45) continue;

        results.push({
          category: 'phone',
          matchedText: redactPreview(digits, { showLast: 4 }),
          matchedTextRaw: raw,
          index: match.index,
          confidence: Math.min(92, confidence),
          severity: 'medium',
          recommendation: 'Confirm this recipient should receive personal data.',
        });
      }
    }
    return results;
  }

  function ibanMod97(iban) {
    const rearranged = `${String(iban).slice(4)}${String(iban).slice(0, 4)}`.toUpperCase();
    let remainder = '';
    for (const ch of rearranged) {
      const token = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
      remainder += token;
      if (remainder.length > 9) {
        remainder = String(Number(remainder) % 97);
      }
    }
    return Number(remainder) % 97 === 1;
  }

  const IBAN_LENGTH_BY_COUNTRY = {
    AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22,
    BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28,
    EE: 20, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18,
    GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IS: 26, IT: 27, JO: 30,
    KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27,
    MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24,
    PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SE: 24, SI: 19,
    SK: 24, SM: 27, TN: 24, TR: 26, UA: 29, VG: 24, XK: 20,
  };

  function isKnownIbanCountry(code) {
    return Object.prototype.hasOwnProperty.call(
      IBAN_LENGTH_BY_COUNTRY,
      String(code || '').toUpperCase(),
    );
  }

  function compactIbanToken(value) {
    return String(value || '').replace(/\s/g, '').toUpperCase();
  }

  function looksLikeIbanPrefix(value) {
    const compact = compactIbanToken(value);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]*$/i.test(compact)) return false;
    if (compact.length < 4) return false;
    const country = compact.slice(0, 2).toUpperCase();
    if (!isKnownIbanCountry(country)) return false;
    const expected = IBAN_LENGTH_BY_COUNTRY[country];
    return compact.length <= Math.min(34, expected + 2);
  }

  function fieldLooksLikeIban(text) {
    const compact = compactIbanToken(text);
    if (compact.length < 4) return false;
    return looksLikeIbanPrefix(compact);
  }

  function suppressIbanConflicts(text, results) {
    if (!fieldLooksLikeIban(text)) return results;
    return (results || []).filter((hit) => hit.category !== 'api_key' && hit.category !== 'phone');
  }

  const VALID_BIC_COUNTRY = new Set([
    'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
    'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ',
    'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ',
    'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
    'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY',
    'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP',
    'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
    'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
    'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
    'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ',
    'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
    'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
  ]);

  function looksLikeSwiftBic(value) {
    const compact = compactIbanToken(value).toUpperCase();
    if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(compact)) return false;
    return VALID_BIC_COUNTRY.has(compact.slice(4, 6));
  }

  function looksLikeUuid(value) {
    const compact = String(value || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(compact);
  }

  function shouldSkipGenericSecretGuess(value) {
    const compact = compactIbanToken(value);
    return (
      looksLikeIbanPrefix(compact)
      || looksLikeSwiftBic(compact)
      || looksLikeUuid(compact)
      || /^[A-Z]{2}\d{6,}$/.test(compact)
    );
  }

  function findIbanPrefixes(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();
    const pattern = /\b([A-Z]{2}\d{2}(?:[ \t]?[A-Z0-9]{1,4}){0,8})\b/gi;

    let match;
    while ((match = pattern.exec(input)) !== null) {
      const compact = compactIbanToken(match[1]);
      if (!looksLikeIbanPrefix(compact)) continue;
      const country = compact.slice(0, 2);
      const expectedLen = IBAN_LENGTH_BY_COUNTRY[country];
      if (compact.length >= expectedLen && ibanMod97(compact)) continue;

      if (seen.has(compact)) continue;
      seen.add(compact);

      const progress = compact.length / expectedLen;
      let confidence = 58 + Math.round(progress * 22);
      if (compact.length >= 8) confidence += 8;
      if (compact.length >= 12) confidence += 4;

      results.push({
        category: 'iban',
        matchedText: redactPreview(compact, { showLast: 4 }),
        matchedTextRaw: compact,
        index: match.index,
        confidence: Math.min(86, confidence),
        severity: 'high',
        recommendation: 'Mask or encrypt financial identifiers before sharing.',
      });
    }

    return results;
  }

  function findIbans(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();

    function pushPrefixHits(source) {
      for (const prefixHit of findIbanPrefixes(source)) {
        const key = compactIbanToken(prefixHit.matchedTextRaw);
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(prefixHit);
      }
    }

    if (fieldLooksLikeIban(input)) {
      pushPrefixHits(input);
      const compactOnly = compactIbanToken(input);
      if (compactOnly !== input) pushPrefixHits(compactOnly);
    }

    function tryPushCompact(compact, index) {
      const value = String(compact || '').toUpperCase();
      if (value.length < 15 || value.length > 34) return;
      if (!ibanMod97(value)) return;
      if (seen.has(value)) return;
      seen.add(value);
      results.push({
        category: 'iban',
        matchedText: redactPreview(value, { showLast: 4 }),
        matchedTextRaw: value,
        index,
        confidence: 88,
        severity: 'high',
        recommendation: 'Mask or encrypt financial identifiers before sharing.',
      });
    }

    const compactInput = input.replace(/\s/g, '');
    const pattern = /[A-Z]{2}\d{2}[A-Z0-9]{11,30}/gi;
    let match;
    while ((match = pattern.exec(compactInput)) !== null) {
      const chunk = match[0].toUpperCase();
      for (let end = Math.min(34, chunk.length); end >= 15; end -= 1) {
        const candidate = chunk.slice(0, end);
        if (ibanMod97(candidate)) {
          tryPushCompact(candidate, match.index);
          break;
        }
      }
    }

    return results;
  }

  function findSsns(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?!000|666|9\d{2})\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b/g;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[0];
      results.push({
        category: 'ssn',
        matchedText: redactPreview(normalizeDigits(raw), { showLast: 4 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 82,
        severity: 'critical',
        recommendation: 'Do not share Social Security numbers in plain text.',
      });
    }
    return results;
  }

  function findBankAccounts(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?:account|acct|a\/c)[#:\s-]*(\d{6,17})\b/gi;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      results.push({
        category: 'bank_account',
        matchedText: redactPreview(raw, { showLast: 4 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 75,
        severity: 'high',
        recommendation: 'Mask or encrypt bank account details before sharing.',
      });
    }
    return results;
  }

  function routingNumberCheck(digits) {
    const normalized = normalizeDigits(digits);
    if (!/^\d{9}$/.test(normalized)) return false;
    const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += Number(normalized[i]) * weights[i];
    return sum % 10 === 0;
  }

  function findRoutingNumbers(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();
    const patterns = [
      /\b(?:routing|ABA|RTN|sort code)[#:\s-]*(\d{3})[\s-]?(\d{3})[\s-]?(\d{3})\b/gi,
      /\b(?:routing|ABA|RTN|sort code)[#:\s-]*(\d{9})\b/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(input)) !== null) {
        const raw = match[3] ? `${match[1]}${match[2]}${match[3]}` : match[1];
        if (!routingNumberCheck(raw)) continue;
        const key = raw;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          category: 'routing_number',
          matchedText: redactPreview(raw, { showLast: 3 }),
          matchedTextRaw: match[0].trim(),
          index: match.index,
          confidence: 84,
          severity: 'high',
          recommendation: 'Mask or encrypt bank routing details before sharing.',
        });
      }
    }
    return results;
  }

  function findSwiftBics(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();
    const pattern = /\b([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/gi;

    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      const original = match[0];
      const upper = raw.toUpperCase();
      if (!looksLikeSwiftBic(upper)) continue;
      if (original === original.toLowerCase() && !/\d/.test(original)) continue;
      if (seen.has(upper)) continue;
      seen.add(upper);
      results.push({
        category: 'swift_bic',
        matchedText: redactPreview(upper, { showLast: 3 }),
        matchedTextRaw: upper,
        index: match.index,
        confidence: 86,
        severity: 'high',
        recommendation: 'Mask or encrypt SWIFT/BIC codes before sharing.',
      });
    }
    return results;
  }

  function findTaxIds(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();

    const labeled = /\b(?:EIN|TIN|VAT|GST|tax(?:\s+ID)?)[#:\s-]*([A-Z0-9][A-Z0-9\s./-]{6,18}[A-Z0-9])\b/gi;
    let match;
    while ((match = labeled.exec(input)) !== null) {
      const raw = match[1].trim();
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        category: 'tax_id',
        matchedText: redactPreview(raw.replace(/\s/g, ''), { showLast: 3 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 82,
        severity: 'high',
        recommendation: 'Mask or encrypt tax identifiers before sharing.',
      });
    }

    const einPattern = /\b\d{2}-\d{7}\b/g;
    while ((match = einPattern.exec(input)) !== null) {
      const raw = match[0];
      const key = `ein:${raw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        category: 'tax_id',
        matchedText: redactPreview(raw, { showLast: 4 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 78,
        severity: 'high',
        recommendation: 'This may be a US EIN — verify before sharing.',
      });
    }

    const vatPattern = /\b(?:ATU\d{8}|DE\d{9}|FR[A-Z0-9]{2}\d{9}|GB(?:\d{9}|\d{12})|IE\d[A-Z0-9]{7}|NL\d{9}B\d{2})\b/gi;
    while ((match = vatPattern.exec(input)) !== null) {
      const raw = match[0].toUpperCase();
      const key = `vat:${raw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        category: 'tax_id',
        matchedText: redactPreview(raw, { showLast: 3 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 85,
        severity: 'high',
        recommendation: 'Mask or encrypt VAT/tax numbers before sharing.',
      });
    }

    return results;
  }

  function nhsCheck(digits) {
    const normalized = normalizeDigits(digits);
    if (!/^\d{10}$/.test(normalized)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += Number(normalized[i]) * (10 - i);
    const remainder = sum % 11;
    const check = remainder === 0 ? 0 : 11 - remainder;
    if (check === 11) return false;
    return Number(normalized[9]) === check;
  }

  function findNhsNumbers(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();
    const pattern = /\b(?:NHS(?:\s+number)?)[#:\s-]*(\d{3}[\s-]?\d{3}[\s-]?\d{4})\b/gi;

    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      if (!nhsCheck(raw)) continue;
      const key = normalizeDigits(raw);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        category: 'nhs_number',
        matchedText: redactPreview(key, { showLast: 3 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 86,
        severity: 'critical',
        recommendation: 'UK NHS numbers are personal health data — do not share in plain text.',
      });
    }
    return results;
  }

  function findDatesOfBirth(text) {
    const input = String(text || '');
    if (!input) return [];
    const results = [];
    const seen = new Set();
    const pattern = /\b(?:DOB|D\.O\.B\.|date of birth|born on|birth\s*date)[#:\s-]*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}[/.-]\d{1,2}[/.-]\d{1,2})\b/gi;

    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        category: 'date_of_birth',
        matchedText: redactPreview(raw, { showLast: 0 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 80,
        severity: 'high',
        recommendation: 'Dates of birth are personal data — mask or encrypt before sharing.',
      });
    }
    return results;
  }

  function findPpsNumbers(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(\d{7})([A-W])\b/gi;
    const results = [];
    const seen = new Set();
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = `${match[1]}${match[2].toUpperCase()}`;
      const key = raw.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        category: 'national_id',
        matchedText: redactPreview(raw, { showLast: 1 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 82,
        severity: 'high',
        recommendation: 'Do not share PPS or national identifiers in plain text.',
        tags: ['pps', 'ie'],
      });
    }
    return results;
  }

  function findNationalIds(text) {
    const input = String(text || '');
    if (!input) return [];
    const patterns = [
      /\b\d{3}-\d{3}-\d{3}\b/g,
      /\b[A-Z]{2}\d{6}[A-Z]?\b/g,
      /\bNINO[:\s-]?[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]?\b/gi,
    ];
    const results = [...findPpsNumbers(input)];
    const seen = new Set(results.map((hit) => String(hit.matchedTextRaw || '').toUpperCase()));
    for (const re of patterns) {
      let match;
      while ((match = re.exec(input)) !== null) {
        const raw = match[0];
        const key = raw.toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          category: 'national_id',
          matchedText: redactPreview(raw, { showLast: 2 }),
          matchedTextRaw: raw,
          index: match.index,
          confidence: 70,
          severity: 'high',
          recommendation: 'Do not share government identifiers in plain text.',
        });
      }
    }
    return results;
  }

  function findPassports(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?:passport|travel doc)[#:\s-]*([A-Z0-9]{6,9})\b/gi;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      results.push({
        category: 'passport',
        matchedText: redactPreview(raw, { showLast: 2 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 78,
        severity: 'high',
        recommendation: 'Do not share passport numbers in plain text.',
      });
    }
    return results;
  }

  function findDriverLicenses(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?:DL|driver(?:'s)? licen[cs]e)[#:\s-]*([A-Z0-9-]{5,16})\b/gi;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      results.push({
        category: 'driver_license',
        matchedText: redactPreview(raw, { showLast: 3 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 72,
        severity: 'high',
        recommendation: 'Do not share license numbers in plain text.',
      });
    }
    return results;
  }

  function findMedicalRecordNumbers(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?:MRN|medical record)[#:\s-]*(\d{6,12})\b/gi;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      results.push({
        category: 'medical_record_number',
        matchedText: redactPreview(raw, { showLast: 2 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 80,
        severity: 'critical',
        recommendation: 'HIPAA-sensitive — do not share medical identifiers.',
      });
    }
    return results;
  }

  function findCustomerIds(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?:customer|cust|client)[#:\s-]*([A-Z0-9-]{4,20})\b/gi;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[1];
      if (/^\d{4,6}$/.test(raw)) continue;
      results.push({
        category: 'customer_id',
        matchedText: redactPreview(raw, { showLast: 3 }),
        matchedTextRaw: raw,
        index: match.index + match[0].indexOf(raw),
        confidence: 62,
        severity: 'medium',
        recommendation: 'Verify whether this customer identifier should be shared.',
      });
    }
    return results;
  }

  function findInternalCompanyRefs(text) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?:INTERNAL|INT|PROJ|PROJECT|TICKET|INC|CASE)[-_][A-Z0-9]{3,20}\b/gi;
    const results = [];
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[0];
      results.push({
        category: 'internal_company_reference',
        matchedText: redactPreview(raw, { showLast: 4 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: 68,
        severity: 'medium',
        recommendation: 'Protect internal business references.',
      });
    }
    return results;
  }

  function findPasswords(text, context = {}) {
    const input = String(text || '');
    if (!input) return [];
    const pattern = /\b(?=[^\s]*[A-Z])(?=[^\s]*[a-z])(?=[^\s]*\d)[A-Za-z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]{8,64}\b/g;
    const results = [];
    const seen = new Set();
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[0];
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      let confidence = 58;
      if (/[^A-Za-z0-9]/.test(raw)) confidence += 12;
      if (raw.length >= 12) confidence += 8;
      if (context.isPasswordField) confidence += 28;
      if (context.fieldType === 'password') confidence += 28;

      results.push({
        category: 'password',
        matchedText: redactPreview(raw, { showLast: 0 }),
        matchedTextRaw: raw,
        index: match.index,
        confidence: Math.min(96, confidence),
        severity: context.isPasswordField || context.fieldType === 'password' ? 'high' : 'medium',
        recommendation: 'Use encrypt or a password manager.',
      });
    }
    return results;
  }

  const DETECTION_CATEGORY_PRIORITY = {
    iban: 95,
    credit_card: 94,
    ssn: 93,
    medical_record_number: 92,
    nhs_number: 92,
    jwt: 91,
    bank_account: 90,
    routing_number: 90,
    swift_bic: 89,
    tax_id: 89,
    passport: 89,
    driver_license: 88,
    national_id: 87,
    date_of_birth: 86,
    api_key: 70,
    password: 65,
    email: 60,
    phone: 60,
    customer_id: 55,
    internal_company_reference: 50,
  };

  function sortDetections(results) {
    return [...results].sort((a, b) => {
      const confDiff = (Number(b.confidence) || 0) - (Number(a.confidence) || 0);
      if (confDiff !== 0) return confDiff;
      const priA = DETECTION_CATEGORY_PRIORITY[a.category] || 0;
      const priB = DETECTION_CATEGORY_PRIORITY[b.category] || 0;
      return priB - priA;
    });
  }

  function analyzeAll(text, context = {}) {
    const ctx = context || {};
    const resolved = suppressIbanConflicts(text, sortDetections([
      ...findCreditCards(text),
      ...findJwts(text),
      ...findApiKeys(text),
      ...findEmails(text, context),
      ...findPhones(text, context),
      ...findIbans(text),
      ...findRoutingNumbers(text),
      ...findSwiftBics(text),
      ...findTaxIds(text),
      ...findNhsNumbers(text),
      ...findDatesOfBirth(text),
      ...findSsns(text),
      ...findBankAccounts(text),
      ...findNationalIds(text),
      ...findPassports(text),
      ...findDriverLicenses(text),
      ...findMedicalRecordNumbers(text),
      ...findCustomerIds(text),
      ...findInternalCompanyRefs(text),
      ...findPasswords(text, context),
    ]));
    return global.GoldspireDetectionContextResolve?.resolveDetections?.(text, resolved, ctx) || resolved;
  }

  function isSensitiveSelectionText(text, context = {}) {
    if (!text || text.length < 4) return false;
    const trimmed = String(text).trim();
    const hits = analyzeAll(trimmed, { ...context, source: context.source || 'selection' });
    const filtered = global.GoldspireDetectionGating?.filterForPrompt?.(
      hits,
      { ...context, source: context.source || 'selection' },
      context.source || 'selection',
    ) || hits.filter((hit) => hit.confidence >= 50);
    return filtered.length > 0;
  }

  global.GoldspireDetectionLib = {
    redactPreview,
    normalizeDigits,
    luhnCheck,
    findCreditCards,
    findJwts,
    findApiKeys,
    findEmails,
    findPhones,
    findIbans,
    findIbanPrefixes,
    findRoutingNumbers,
    findSwiftBics,
    findTaxIds,
    findNhsNumbers,
    findDatesOfBirth,
    looksLikeIbanPrefix,
    fieldLooksLikeIban,
    shouldSkipGenericSecretGuess,
    sortDetections,
    findSsns,
    findBankAccounts,
    findNationalIds,
    findPassports,
    findDriverLicenses,
    findMedicalRecordNumbers,
    findCustomerIds,
    findInternalCompanyRefs,
    findPasswords,
    analyzeAll,
    isSensitiveSelectionText,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
