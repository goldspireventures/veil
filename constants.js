/**
 * Built-in defaults shipped with the extension (no user setup required).
 */
(function (global) {
  global.GoldspireConstants = {
    /** Gmail/Outlook persist https links in sent mail; extension users unlock via in-page modal. */
    BUILT_IN_PUBLIC_UNLOCK_URL: 'https://goldspire-global.github.io/secure-text/unlock.html',
    /** One-time codes expire after this window (envelope `exp`). */
    ONE_TIME_TTL_MS: 72 * 60 * 60 * 1000,
    /** PBKDF2-SHA256 iterations (OWASP 2023 guidance for SHA-256). */
    CRYPTO_ITERATIONS: {
      personal: 600_000,
      organization: 600_000,
    },
    /** Suggested shared vault item title for IT documentation. */
    TEAM_VAULT_ITEM_LABEL: 'Goldspire Team Passphrase',
    /**
     * Cloud org API base (no trailing slash). Empty = join/sync disabled until backend is live.
     * Example: https://api.goldspire.studio
     */
    ORG_API_BASE: 'http://localhost:3015',
    /** SSO / admin portal for organization sign-in (dev). Production: https://goldspire.studio/secure-text/join */
    ORG_PORTAL_URL: 'http://localhost:3015/secure-text/join',
    /** Alarm interval for cloud policy sync (minutes). */
    ORG_SYNC_INTERVAL_MINUTES: 360,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
