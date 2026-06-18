/**
 * Shared settings loader for content scripts and the service worker.
 */
(function (global) {
  const DEFAULT_SETTINGS = {
    defaultHint: '',
    useSavedPassphrase: true,
    showFloatingButton: true,
    showSelectionPill: true,
    selectionUiMode: 'smart',   // 'quiet' | 'smart' | 'always'
    autoDetectRedacted: true,
    defaultSecureMode: 'team',
    copyOneTimeCodeAutomatically: true,
    clipboardClearSeconds: 30,
    passwordLength: 16,
    passwordLowercase: true,
    passwordUppercase: true,
    passwordDigits: true,
    passwordSymbols: true,
    securityProfile: 'personal',
    resecureAfterUnlock: true,
    resecureDelaySeconds: 60,
    publicUnlockUrl: '',
    passphraseFromVault: false,
    enforceStrongPassphrase: true,
    setupComplete: false,
    orgId: '',
    orgDisplayName: '',
    orgProvisionSource: '',
    orgPolicyVersion: 0,
    orgMemberEmail: '',
    orgTeamId: '',
    orgTeamName: '',
    teamDlpPolicy: null,
    /** Veil copilot — on by default; personal setup and org sync can override. */
    copilotEnabled: true,
    /** DLP mode: off | observe | enforce */
    dlpMode: 'off',
    /** Org-synced DLP policy (organizations.settings.dlp) */
    dlpPolicy: null,
  };

  const DLP_MODES = new Set(['off', 'observe', 'enforce']);

  function normalizeDlpMode(value) {
    const mode = String(value || 'off').toLowerCase();
    return DLP_MODES.has(mode) ? mode : 'off';
  }

  function isVeilActive(settings) {
    if (!settings) return false;
    if (settings.copilotEnabled === true) return true;
    return normalizeDlpMode(settings.dlpMode) !== 'off';
  }

  function migrate(settings) {
    return global.GoldspireSettingsMigrate?.migrateSettings?.(settings) || settings;
  }

  async function load() {
    try {
      const gst = global.GoldspireBrowser;
      let settings = gst?.storageGet
        ? await gst.storageGet('sync', DEFAULT_SETTINGS)
        : { ...DEFAULT_SETTINGS };

      settings = migrate(settings);

      if (settings.passphraseFromVault) {
        settings.passphrase = '';
      } else {
        try {
          settings.passphrase = await global.GoldspireSecrets?.loadPassphrase?.(
            settings.securityProfile || 'personal',
          );
        } catch {
          settings.passphrase = '';
        }
      }

      if (typeof settings.passphrase !== 'string') settings.passphrase = '';
      return settings;
    } catch {
      return { ...DEFAULT_SETTINGS, passphrase: '' };
    }
  }

  global.GoldspireSettings = {
    DEFAULT_SETTINGS,
    DLP_MODES,
    normalizeDlpMode,
    isVeilActive,
    load,
    migrate,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
