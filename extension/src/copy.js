/**
 * Profile-aware UI copy and platform shortcuts.
 */
(function (global) {
  function isOrgProfile(settings = {}) {
    return global.GoldspireOrgCapability?.isOrgProfile?.(settings)
      || settings.securityProfile === 'organization'
      || Boolean(settings.orgId);
  }

  function passphraseNoun(settings = {}, { titleCase = false } = {}) {
    const noun = isOrgProfile(settings) ? 'team passphrase' : 'passphrase';
    if (!titleCase) return noun;
    return noun.charAt(0).toUpperCase() + noun.slice(1);
  }

  function passphrasePromptTitle(settings = {}) {
    return `${passphraseNoun(settings, { titleCase: true })}`;
  }

  function passphraseMissingError(settings = {}) {
    if (isOrgProfile(settings) && settings.passphraseFromVault) {
      return `Open Veil and enter your ${passphraseNoun(settings)} for this session.`;
    }
    return `Set your ${passphraseNoun(settings)} in Veil settings first.`;
  }

  function quickSecureTitle(settings = {}) {
    return `Quick secure (${passphraseNoun(settings)})`;
  }

  function secureModeLabel(settings = {}, mode = 'team') {
    if (mode === 'one-time') return 'One-time';
    if (mode === 'direct') return 'Specific people';
    return isOrgProfile(settings) ? 'Team passphrase' : 'My passphrase';
  }

  function isMacPlatform() {
    if (typeof navigator === 'undefined') return false;
    return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
  }

  function modKey() {
    return isMacPlatform() ? '⌘' : 'Ctrl';
  }

  function shortcut(label) {
    const map = {
      secure: `${modKey()}+Shift+S`,
      options: `${modKey()}+Shift+O`,
      unlock: `${modKey()}+Shift+U`,
      generate: `${modKey()}+Shift+G`,
    };
    return map[label] || label;
  }

  function shortcutPair(label) {
    if (isMacPlatform()) return shortcut(label);
    const mac = { secure: '⌘+Shift+S', options: '⌘+Shift+O', unlock: '⌘+Shift+U', generate: '⌘+Shift+G' };
    return `${shortcut(label)} · ${mac[label] || ''}`.replace(/ · $/, '');
  }

  function refreshTabHint(settings = {}) {
    if (isOrgProfile(settings)) {
      return 'Refresh your mail tab (F5) if copilot or the Veil bar does not appear.';
    }
    return 'Refresh the page if copilot or the Veil bar does not appear.';
  }

  function homeEmptyHint(settings = {}) {
    if (isOrgProfile(settings)) {
      return 'Open Outlook or Gmail, paste or highlight a secret — or use Secure selection below.';
    }
    return 'Open any page, paste or highlight a secret — or use Secure selection below.';
  }

  global.GoldspireCopy = {
    isOrgProfile,
    passphraseNoun,
    passphrasePromptTitle,
    passphraseMissingError,
    quickSecureTitle,
    secureModeLabel,
    isMacPlatform,
    modKey,
    shortcut,
    shortcutPair,
    refreshTabHint,
    homeEmptyHint,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
