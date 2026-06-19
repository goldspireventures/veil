/**
 * Chrome / Edge enterprise policy (storage.managed) — IT pushes settings via GPO or Intune.
 */
(function (global) {
  const MANAGED_SETTING_KEYS = [
    'orgId',
    'orgDisplayName',
    'orgTeamId',
    'securityProfile',
    'passphraseFromVault',
    'useSavedPassphrase',
    'setupComplete',
    'defaultSecureMode',
    'enforceStrongPassphrase',
    'resecureDelaySeconds',
    'copilotEnabled',
    'dlpMode',
  ];

  const LEGACY_MANAGED_KEYS = ['passphraseIn1Password'];

  function browser() {
    return global.GoldspireBrowser;
  }

  function resolvePassphraseFromVault(policy) {
    if (policy.passphraseFromVault !== undefined) return policy.passphraseFromVault === true;
    if (policy.passphraseIn1Password !== undefined) return policy.passphraseIn1Password === true;
    return false;
  }

  function shouldSkipOnboarding(policy) {
    if (policy.teamPassphrase?.trim()) return true;
    if (policy.securityProfile === 'organization' && policy.setupComplete !== false) return true;
    if (policy.securityProfile === 'organization' && policy.setupComplete === true) return true;
    return false;
  }

  function isProfileLocked(policy) {
    return policy.securityProfile === 'personal' || policy.securityProfile === 'organization';
  }

  async function readManaged() {
    return browser()?.storageGet?.('managed', {}) || {};
  }

  function pickSettingsPatch(policy) {
    const patch = {};
    for (const key of MANAGED_SETTING_KEYS) {
      if (policy[key] !== undefined) patch[key] = policy[key];
    }
    if (policy.passphraseFromVault !== undefined || policy.passphraseIn1Password !== undefined) {
      patch.passphraseFromVault = resolvePassphraseFromVault(policy);
    }
    if (shouldSkipOnboarding(policy)) {
      patch.setupComplete = true;
      if (policy.teamPassphrase?.trim() || policy.securityProfile === 'organization') {
        patch.securityProfile = 'organization';
        patch.orgProvisionSource = 'managed';
      }
    }
    return patch;
  }

  async function writeSyncSettings(patch) {
    const gst = browser();
    if (!gst?.storage?.sync?.get || !gst?.storage?.sync?.set) return;

    const current = await gst.storageGet('sync', { ...(global.GoldspireSettings?.DEFAULT_SETTINGS || {}) });
    if (current.orgProvisionSource === 'cloud' && patch.orgProvisionSource === 'managed') {
      const { orgProvisionSource, ...rest } = patch;
      patch = rest;
    }
    const merged = global.GoldspireSettings?.migrate?.({ ...current, ...patch }) || { ...current, ...patch };
    await new Promise((resolve) => {
      gst.storage.sync.set(merged, () => resolve());
    });
  }

  function collectManagedKeys(policy) {
    return [
      ...MANAGED_SETTING_KEYS.filter((key) => policy[key] !== undefined),
      ...LEGACY_MANAGED_KEYS.filter((key) => policy[key] !== undefined),
      ...(policy.teamPassphrase?.trim() ? ['teamPassphrase'] : []),
    ];
  }

  function buildManagedState(policy, keys) {
    return {
      active: keys.length > 0,
      keys,
      hasTeamPassphrase: Boolean(policy.teamPassphrase?.trim()),
      orgId: policy.orgId?.trim() || '',
      orgDisplayName: policy.orgDisplayName?.trim() || '',
      skipOnboarding: shouldSkipOnboarding(policy),
      profileLocked: isProfileLocked(policy),
      forcedProfile: policy.securityProfile === 'organization' || policy.securityProfile === 'personal'
        ? policy.securityProfile
        : null,
    };
  }

  async function applyManagedPolicy() {
    const policy = await readManaged();
    const managedKeys = Object.keys(policy || {});
    if (!managedKeys.length) return { active: false, keys: [], skipOnboarding: false };

    const patch = pickSettingsPatch(policy);

    if (policy.teamPassphrase?.trim()) {
      patch.securityProfile = 'organization';
      patch.passphraseFromVault = resolvePassphraseFromVault(policy);
      patch.useSavedPassphrase = policy.useSavedPassphrase !== false;
      patch.setupComplete = true;
      patch.orgProvisionSource = 'managed';
      await global.GoldspireSecrets?.savePassphrase?.(policy.teamPassphrase.trim(), 'organization');
    } else if (policy.securityProfile === 'organization') {
      patch.setupComplete = policy.setupComplete !== false ? true : patch.setupComplete;
      patch.orgProvisionSource = 'managed';
    }

    if (Object.keys(patch).length) {
      await writeSyncSettings(patch);
    }

    const keys = collectManagedKeys(policy);
    return buildManagedState(policy, keys);
  }

  async function getManagedState() {
    const policy = await readManaged();
    const keys = collectManagedKeys(policy);
    return buildManagedState(policy, keys);
  }

  global.GoldspireManagedPolicy = {
    readManaged,
    applyManagedPolicy,
    getManagedState,
    shouldSkipOnboarding,
    isProfileLocked,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
