/**
 * Team passphrase strength requirements (OWASP-aligned minimums).
 */
(function (global) {
  const WEAK_EXACT = new Set([
    'password',
    'password1',
    'password123',
    'letmein',
    'welcome',
    'admin123',
    'goldspire',
    'team pass',
    'passphrase',
  ]);

  const MIN_LENGTH = {
    personal: 16,
    organization: 16,
    oneTime: 10,
  };

  function charsetScore(value) {
    let score = 0;
    if (/[a-z]/.test(value)) score += 1;
    if (/[A-Z]/.test(value)) score += 1;
    if (/[0-9]/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    return score;
  }

  function assessPassphrase(passphrase, profile = 'personal', { mode } = {}) {
    const value = passphrase?.trim() || '';
    const effectiveProfile = mode === 'one-time' ? 'oneTime' : profile === 'organization' ? 'organization' : 'personal';
    const minLength = MIN_LENGTH[effectiveProfile] || MIN_LENGTH.personal;

    if (!value) {
      return { ok: false, score: 0, message: 'Passphrase is required.', minLength };
    }

    if (value.length < minLength) {
      return {
        ok: false,
        score: 1,
        message: `Use at least ${minLength} characters for this passphrase.`,
        minLength,
      };
    }

    const lower = value.toLowerCase();
    if (WEAK_EXACT.has(lower)) {
      return { ok: false, score: 1, message: 'This passphrase is too common. Use a random team secret from your password vault.', minLength };
    }

    const diversity = charsetScore(value);
    let score = 2;
    if (value.length >= minLength + 4) score += 1;
    if (diversity >= 3) score += 1;
    if (value.length >= 20 && diversity >= 3) score += 1;

    const needsDiversity = effectiveProfile !== 'oneTime';
    if (needsDiversity && diversity < 2) {
      return {
        ok: false,
        score,
        message: 'Mix upper, lower, digits, or symbols — or use a generated passphrase from your password manager.',
        minLength,
      };
    }

    if (effectiveProfile === 'organization' && value.length < 16) {
      return {
        ok: false,
        score,
        message: 'Organization profile requires at least 16 characters.',
        minLength,
      };
    }

    const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
    return {
      ok: true,
      score: Math.min(4, score),
      label: labels[Math.min(4, score)],
      message: '',
      minLength,
    };
  }

  function assertPassphrase(passphrase, profile, options) {
    const result = assessPassphrase(passphrase, profile, options);
    if (!result.ok) throw new Error(result.message);
    return result;
  }

  global.GoldspirePassphrasePolicy = {
    MIN_LENGTH,
    assessPassphrase,
    assertPassphrase,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
