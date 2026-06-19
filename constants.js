/**
 * Built-in defaults shipped with the extension (no user setup required).
 * Generated from repo-root .env via `npm run env:apply` — do not edit by hand.
 */
(function (global) {
  global.GoldspireConstants = {
    /** Gmail/Outlook persist https links in sent mail; extension users unlock via in-page modal. */
    BUILT_IN_PUBLIC_UNLOCK_URL: "https://goldspire-global.github.io/veil/unlock.html",
    /** One-time codes expire after this window (envelope `exp`). */
    ONE_TIME_TTL_MS: 72 * 60 * 60 * 1000,
    /** PBKDF2-SHA256 iterations (OWASP 2023 guidance for SHA-256). */
    CRYPTO_ITERATIONS: {
      personal: 600_000,
      organization: 600_000,
    },
    /** Suggested shared vault item title for IT documentation. */
    TEAM_VAULT_ITEM_LABEL: 'Veil Team Passphrase',
    /** Cloud org API base (no trailing slash). Empty = cloud join disabled. */
    ORG_API_BASE: "https://veil-api.goldspireventures.com",
    /** Organization sign-in / join portal. */
    ORG_PORTAL_URL: "https://join-veil.goldspireventures.com/join.html",
    /** Portal origin (scheme + host) for links and intent detection. */
    PORTAL_ORIGIN: "https://join-veil.goldspireventures.com",
    /** Portal hostname for intent detection. */
    PORTAL_HOST: "join-veil.goldspireventures.com",
    /** API hostname for intent detection. */
    API_HOST: "veil-api.goldspireventures.com",
    /** Alarm interval for cloud policy sync (minutes). */
    ORG_SYNC_INTERVAL_MINUTES: 360,
    /** Product support and feedback email. */
    SUPPORT_EMAIL: "support@goldspireventures.com",
    /** Security vulnerability reports. */
    SECURITY_EMAIL: "security@goldspireventures.com",
    /** Client ops telemetry ingest key (metadata events only). */
    OPS_CLIENT_INGEST_KEY: "da8a0cb6fd67e1c3c64ea0cbc7dd29fc8953c13aaf998cd0ec83a72da6e0cc38",
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
