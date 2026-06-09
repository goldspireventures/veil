/**
 * Built-in defaults shipped with the extension (no user setup required).
 */
(function (global) {
  global.GoldspireConstants = {
    /** Gmail/Outlook persist https links in sent mail; extension users unlock via in-page modal. */
    BUILT_IN_PUBLIC_UNLOCK_URL: 'https://goldspire-global.github.io/secure-text/unlock.html',
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
