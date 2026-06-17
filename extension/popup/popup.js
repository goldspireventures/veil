const api = typeof browser !== 'undefined' ? browser : chrome;

const builtInUnlockUrl = GoldspireConstants.BUILT_IN_PUBLIC_UNLOCK_URL;
const extensionVersion = api.runtime.getManifest().version;

const PROFILE_DEFAULTS = {
  personal: {
    securityProfile: 'personal',
    passphraseFromVault: false,
    useSavedPassphrase: true,
    enforceStrongPassphrase: true,
    resecureDelaySeconds: 60,
    defaultSecureMode: 'team',
  },
  organization: {
    securityProfile: 'organization',
    passphraseFromVault: false,
    useSavedPassphrase: true,
    enforceStrongPassphrase: true,
    resecureDelaySeconds: 45,
    defaultSecureMode: 'team',
  },
};

const defaults = {
  useSavedPassphrase: true,
  showFloatingButton: true,
  showSelectionPill: true,
  selectionUiMode: 'smart',
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
};

const SETTINGS_KEYS = [
  'securityProfile',
  'publicUnlockUrl',
  'defaultSecureMode',
  'useSavedPassphrase',
  'autoDetectRedacted',
  'resecureAfterUnlock',
  'resecureDelaySeconds',
  'passphraseFromVault',
  'showFloatingButton',
  'showSelectionPill',
  'selectionUiMode',
  'copyOneTimeCodeAutomatically',
  'clipboardClearSeconds',
  'passwordLength',
  'passwordLowercase',
  'passwordUppercase',
  'passwordDigits',
  'passwordSymbols',
  'enforceStrongPassphrase',
  'setupComplete',
  'orgId',
  'orgDisplayName',
  'orgProvisionSource',
  'orgPolicyVersion',
  'orgMemberEmail',
];

// ── DOM refs ────────────────────────────────────────────────────────────────
const viewSetup = document.getElementById('view-setup');
const viewMain = document.getElementById('view-main');
const form = document.getElementById('settings-form');
const status = document.getElementById('status');
const generatedPassword = document.getElementById('generated-password');
const passphraseInput = document.getElementById('passphrase');
const useSavedPassphraseInput = document.getElementById('useSavedPassphrase');
const passphraseFromVaultInput = document.getElementById('passphraseFromVault');
const passphraseStrength = document.getElementById('passphrase-strength');
const resecureDelayInput = document.getElementById('resecureDelaySeconds');
const profileChip = document.getElementById('profile-chip');
const versionLabel = document.getElementById('version-label');

const passwordLengthInput = document.getElementById('passwordLength');
const passwordLowercaseInput = document.getElementById('passwordLowercase');
const passwordUppercaseInput = document.getElementById('passwordUppercase');
const passwordDigitsInput = document.getElementById('passwordDigits');
const passwordSymbolsInput = document.getElementById('passwordSymbols');

let passphraseDirty = false;
let orgPassphraseDirty = false;
let hasStoredPassphrase = false;
let hasStoredOrgPassphrase = false;
let managedState = {
  active: false,
  keys: [],
  hasTeamPassphrase: false,
  orgDisplayName: '',
  skipOnboarding: false,
  profileLocked: false,
};
let currentProfile = 'personal';

function migrateSettings(settings) {
  return GoldspireSettingsMigrate?.migrateSettings?.(settings) || settings;
}

function orgMessage(type, payload = {}) {
  return new Promise((resolve) => {
    api.runtime.sendMessage({ type, ...payload }, (response) => {
      resolve(response || { ok: false });
    });
  });
}

function isOrgProvisioned(settings = {}) {
  return Boolean(
    settings.orgProvisionSource === 'managed'
    || settings.orgProvisionSource === 'cloud'
    || managedState.hasTeamPassphrase
    || managedState.skipOnboarding,
  );
}

async function refreshManagedPolicy() {
  try {
    if (typeof GoldspireManagedPolicy !== 'undefined') {
      managedState = await GoldspireManagedPolicy.applyManagedPolicy();
    } else {
      managedState = await new Promise((resolve) => {
        api.runtime.sendMessage({ type: 'APPLY_MANAGED_POLICY' }, (response) => {
          resolve(response || { active: false, keys: [] });
        });
      });
    }
  } catch {
    managedState = { active: false, keys: [], hasTeamPassphrase: false, orgDisplayName: '', skipOnboarding: false };
  }
  applyManagedChrome({});
}

function applyManagedChrome(settings = {}) {
  const banner = document.getElementById('managed-banner');
  if (banner) {
    if (!managedState.active) {
      banner.hidden = true;
    } else {
      banner.hidden = false;
      const orgName = managedState.orgDisplayName?.trim() || settings.orgDisplayName?.trim();
      banner.textContent = orgName
        ? `Managed by ${orgName}`
        : 'Managed by your organization';
    }
  }

  const policyLocksPassphrase =
    managedState.hasTeamPassphrase || managedState.keys?.includes('teamPassphrase');
  const orgInput = document.getElementById('org-passphrase');
  const vaultCheckbox = passphraseFromVaultInput;

  if (policyLocksPassphrase) {
    orgInput?.setAttribute('readonly', 'readonly');
    vaultCheckbox?.setAttribute('disabled', 'disabled');
  } else if (!isOrgProvisioned(settings)) {
    orgInput?.removeAttribute('readonly');
    if (!managedState.keys?.includes('passphraseFromVault')
      && !managedState.keys?.includes('passphraseIn1Password')) {
      vaultCheckbox?.removeAttribute('disabled');
    }
  }

  if (managedState.keys?.includes('passphraseFromVault')
    || managedState.keys?.includes('passphraseIn1Password')) {
    vaultCheckbox?.setAttribute('disabled', 'disabled');
  }

  const resetBtn = document.getElementById('reset-setup');
  const lockProfile = managedState.active || isOrgProvisioned(settings);
  if (lockProfile) resetBtn?.setAttribute('disabled', 'disabled');
  else resetBtn?.removeAttribute('disabled');
}

function applyProvisionChrome(settings) {
  const provisioned = isOrgProvisioned(settings);
  const manual = document.getElementById('org-manual-settings');
  const connected = document.getElementById('org-connected-card');
  const disconnect = document.getElementById('disconnect-org');
  const resetBtn = document.getElementById('reset-setup');
  const modeEl = document.getElementById('defaultSecureMode');
  const orgEmailEl = document.getElementById('orgMemberEmail');
  const orgName = settings.orgDisplayName || managedState.orgDisplayName || 'Your organization';
  const source = settings.orgProvisionSource === 'managed' || managedState.hasTeamPassphrase
    ? 'managed'
    : settings.orgProvisionSource;

  if (provisioned && source) {
    manual?.setAttribute('hidden', '');
    if (connected) connected.hidden = false;
    const nameEl = document.getElementById('org-connected-name');
    const sourceEl = document.getElementById('org-connected-source');
    if (nameEl) nameEl.textContent = orgName;
    if (sourceEl) sourceEl.textContent = source === 'managed' ? 'IT policy' : 'Cloud';
    // Leaving org is an IT/admin action in real deployments.
    if (disconnect) disconnect.hidden = true;
    if (resetBtn) resetBtn.hidden = true;
    if (modeEl) modeEl.setAttribute('disabled', 'disabled');
    const emailRow = document.getElementById('org-member-email-row');
    if (emailRow) emailRow.hidden = source !== 'cloud';
    if (orgEmailEl) orgEmailEl.setAttribute('readonly', 'readonly');
  } else {
    manual?.removeAttribute('hidden');
    if (connected) connected.hidden = true;
    if (disconnect) disconnect.hidden = true;
    if (resetBtn) resetBtn.hidden = false;
    if (modeEl) modeEl.removeAttribute('disabled');
    if (orgEmailEl) orgEmailEl.removeAttribute('readonly');
  }
}

// ── Storage helpers ─────────────────────────────────────────────────────────
function parseDelaySeconds(value, fallback = 60, max = 600) {
  const parsed = parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(5, parsed));
}

function readSyncSettings() {
  return new Promise((resolve) => {
    api.storage.sync.get(SETTINGS_KEYS, (result) => {
      if (api.runtime.lastError) { resolve({ ...defaults }); return; }
      resolve(migrateSettings({ ...defaults, ...(result || {}) }));
    });
  });
}

function writeSyncSettings(patch) {
  return new Promise((resolve, reject) => {
    const migrated = migrateSettings(patch);
    api.storage.sync.set(migrated, () => {
      if (api.runtime.lastError) { reject(new Error(api.runtime.lastError.message)); return; }
      resolve();
    });
  });
}

function showStatus(message) {
  status.hidden = false;
  status.textContent = message;
  window.setTimeout(() => { status.hidden = true; }, 2400);
}

function sendToActiveTab(action, payload = {}) {
  api.runtime.sendMessage({ type: 'SEND_TO_ACTIVE_TAB', action, payload });
}

// ── View switching ──────────────────────────────────────────────────────────
function showSetup() {
  viewSetup.hidden = false;
  viewMain.hidden = true;
  document.getElementById('setup-step-pick').hidden = false;
  document.getElementById('setup-step-personal').hidden = true;
  document.getElementById('setup-step-organization').hidden = true;
}

function showMain(profile) {
  viewSetup.hidden = true;
  viewMain.hidden = false;
  applyProfileChrome(profile);
}

function applyProfileChrome(profile) {
  currentProfile = profile;
  const isOrg = profile === 'organization';
  profileChip.textContent = isOrg ? 'Team' : 'Personal';
  profileChip.className = `profile-chip profile-chip--${profile}`;
  versionLabel.textContent = `v${extensionVersion}`;

  document.getElementById('settings-personal').hidden = isOrg;
  document.getElementById('settings-organization').hidden = !isOrg;
  document.getElementById('advanced-org-only').hidden = !isOrg;
  document.getElementById('help-personal').hidden = isOrg;
  document.getElementById('help-organization').hidden = !isOrg;
  document.querySelectorAll('.profile-org-only').forEach((el) => {
    el.hidden = !isOrg;
  });

  if (resecureDelayInput) {
    // Security posture: org members shouldn't be able to keep secrets unlocked for ages.
    resecureDelayInput.max = String(isOrg ? 120 : 600);
  }
}

function refreshOrgPassphraseStatus(fromVault, settings = {}) {
  const statusEl = document.getElementById('org-passphrase-status');
  const fieldEl = document.getElementById('org-passphrase-field');
  const vaultRow = document.getElementById('passphrase-from-vault-row');
  if (isOrgProvisioned(settings)) {
    if (statusEl) statusEl.textContent = 'Provisioned automatically';
    if (fieldEl) fieldEl.hidden = true;
    if (vaultRow) vaultRow.hidden = true;
    return;
  }
  if (statusEl) {
    statusEl.textContent = fromVault ? 'External vault' : 'Stored on browser';
  }
  if (fieldEl) fieldEl.hidden = fromVault;
  if (vaultRow) vaultRow.hidden = false;
}

function getResecureChecked() {
  if (currentProfile === 'organization') {
    return document.getElementById('resecureAfterUnlock-org')?.checked !== false;
  }
  return document.getElementById('resecureAfterUnlock')?.checked !== false;
}

// ── Setup flow ──────────────────────────────────────────────────────────────
document.querySelectorAll('.profile-card').forEach((card) => {
  card.addEventListener('click', () => {
    const profile = card.dataset.profile;
    document.getElementById('setup-step-pick').hidden = true;
    document.getElementById(`setup-step-${profile}`).hidden = false;
  });
});

document.querySelectorAll('[data-back]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById('setup-step-pick').hidden = false;
    document.getElementById('setup-step-personal').hidden = true;
    document.getElementById('setup-step-organization').hidden = true;
  });
});

document.getElementById('setup-personal-passphrase')?.addEventListener('input', () => {
  const el = document.getElementById('setup-personal-strength');
  const val = document.getElementById('setup-personal-passphrase').value;
  if (!el || !GoldspirePassphrasePolicy) return;
  if (!val) { el.textContent = ''; return; }
  const a = GoldspirePassphrasePolicy.assessPassphrase(val, 'personal');
  el.textContent = a.ok ? `Strength: ${a.label}` : a.message;
  el.classList.toggle('hint--warn', !a.ok);
});

async function finishSetup(profile, extraSettings = {}, passphrase = '') {
  const profileDefaults = PROFILE_DEFAULTS[profile] || PROFILE_DEFAULTS.personal;
  // Preserve any org provisioning fields already written by ORG_JOIN / managed policy.
  const current = await readSyncSettings();
  const patch = migrateSettings({
    ...current,
    ...profileDefaults,
    ...extraSettings,
    setupComplete: true,
    securityProfile: profile,
  });

  await writeSyncSettings(patch);

  if (profile === 'personal' && passphrase) {
    await GoldspireSecrets.savePassphrase(passphrase, 'personal');
  }

  showMain(profile);
  await loadSettings();
  showStatus('Setup complete — highlight text and press Ctrl+Shift+S.');
}

document.getElementById('setup-finish-personal')?.addEventListener('click', async () => {
  const passphrase = document.getElementById('setup-personal-passphrase').value.trim();
  const oneClick = document.getElementById('setup-personal-oneclick').checked;

  if (passphrase) {
    const a = GoldspirePassphrasePolicy?.assessPassphrase?.(passphrase, 'personal');
    if (a && !a.ok) { showStatus(a.message); return; }
  }

  try {
    await finishSetup('personal', { useSavedPassphrase: oneClick }, passphrase);
  } catch (e) {
    showStatus(e?.message || 'Setup failed.');
  }
});

document.getElementById('setup-org-connect')?.addEventListener('click', async () => {
  const joinCode = document.getElementById('setup-org-join-code')?.value.trim() || '';
  const email = document.getElementById('setup-org-email')?.value.trim().toLowerCase() || '';
  if (!email) {
    showStatus('Enter your work email for secure sharing.');
    return;
  }
  if (!joinCode && !document.getElementById('setup-org-join-code')?.hidden) {
    showStatus('Enter your organization join code.');
    return;
  }

  try {
    await completeOrgMembership({ joinCode, email });
  } catch (error) {
    showStatus(error?.message || 'Could not join organization.');
  }
});

async function completeOrgMembership({ joinCode, email }) {
  const settings = await readSyncSettings();
  const needsJoin = Boolean(joinCode) && !settings.orgId;

  if (needsJoin) {
    const result = await orgMessage('ORG_JOIN', { joinCode, email });
    if (!result?.ok) {
      throw new Error(result?.error || 'Could not join organization.');
    }
  } else if (!settings.orgId) {
    throw new Error('Enter your organization join code.');
  }

  const registered = await orgMessage('ORG_REGISTER_MEMBER', { email });
  if (registered?.error) {
    await orgMessage('ORG_DISCONNECT');
    throw new Error(registered.error);
  }

  const joined = await readSyncSettings();
  await finishSetup('organization', { orgMemberEmail: email });
  showStatus(`Joined ${joined.orgDisplayName || 'your organization'}.`);
}

function showPendingOrgSetup(settings = {}) {
  showSetup();
  document.getElementById('setup-step-pick').hidden = true;
  document.getElementById('setup-step-organization').hidden = false;
  document.getElementById('setup-org-join-code').closest('.field').hidden = true;
  document.getElementById('setup-org-connect').textContent = 'Complete setup';
  const emailEl = document.getElementById('setup-org-email');
  if (emailEl && settings.orgMemberEmail) emailEl.value = settings.orgMemberEmail;
  const title = document.querySelector('#setup-step-organization .setup-step__title');
  if (title) title.textContent = 'Confirm your work email';
  const blurb = document.querySelector('#setup-step-organization .card__text');
  if (blurb) {
    blurb.textContent = settings.orgDisplayName
      ? `Connected to ${settings.orgDisplayName}. Enter your work email to finish joining.`
      : 'Enter your work email to finish joining your organization.';
  }
}

document.getElementById('setup-org-signin')?.addEventListener('click', async () => {
  const result = await orgMessage('ORG_SIGN_IN');
  if (result?.error) {
    showStatus(result.error);
    return;
  }
  showStatus('Complete sign-in in the browser tab, then return here.');
});

document.getElementById('disconnect-org')?.addEventListener('click', async () => {
  // Real deployments: only IT/admin can remove a device from an org.
  showStatus('Ask your admin to remove this device.');
  return;
  if (!confirm('Leave this organization? You will need to join again to use team secure.')) return;
  const result = await orgMessage('ORG_DISCONNECT');
  if (!result?.ok) {
    showStatus(result?.error || 'Could not disconnect.');
    return;
  }
  showSetup();
  showStatus('Left organization.');
});

document.getElementById('reset-setup')?.addEventListener('click', async () => {
  if (!confirm('Reset setup? Your passphrase stays saved but you\'ll re-choose personal vs team.')) return;
  await writeSyncSettings({ setupComplete: false });
  showSetup();
});

// ── Settings load / save ────────────────────────────────────────────────────
function refreshPassphraseStrength() {
  if (!passphraseStrength || !GoldspirePassphrasePolicy || currentProfile !== 'personal') return;
  if (!passphraseInput?.value) { passphraseStrength.textContent = ''; return; }
  const a = GoldspirePassphrasePolicy.assessPassphrase(passphraseInput.value, 'personal');
  passphraseStrength.textContent = a.ok ? `Strength: ${a.label}` : a.message;
  passphraseStrength.classList.toggle('hint--warn', !a.ok);
}

function applySettingsToForm(settings) {
  const profile = settings.securityProfile || 'personal';
  applyProfileChrome(profile);
  wirePasswordGeneratorSettings(settings);

  const customUrl = settings.publicUnlockUrl?.trim() || '';
  const urlEl = document.getElementById('publicUnlockUrl');
  if (urlEl) urlEl.value = customUrl && customUrl !== builtInUnlockUrl ? customUrl : '';

  const modeEl = document.getElementById('defaultSecureMode');
  if (modeEl) modeEl.value = settings.defaultSecureMode === 'one-time' ? 'one-time' : 'team';

  if (useSavedPassphraseInput) useSavedPassphraseInput.checked = settings.useSavedPassphrase !== false;

  const fromVault = settings.passphraseFromVault === true;
  if (passphraseFromVaultInput) passphraseFromVaultInput.checked = fromVault;
  refreshOrgPassphraseStatus(fromVault, settings);
  applyProvisionChrome(settings);

  const resecure = settings.resecureAfterUnlock !== false;
  const resecurePersonal = document.getElementById('resecureAfterUnlock');
  const resecureOrg = document.getElementById('resecureAfterUnlock-org');
  if (resecurePersonal) resecurePersonal.checked = resecure;
  if (resecureOrg) resecureOrg.checked = resecure;
  const delayMax = profile === 'organization' ? 120 : 600;
  resecureDelayInput.value = String(parseDelaySeconds(settings.resecureDelaySeconds, 60, delayMax));

  const selModeEl = document.getElementById('selectionUiMode');
  if (selModeEl) selModeEl.value = settings.selectionUiMode || defaults.selectionUiMode;

  const orgEmailEl = document.getElementById('orgMemberEmail');
  if (orgEmailEl) orgEmailEl.value = settings.orgMemberEmail || '';

  return profile;
}

async function loadSettings() {
  await refreshManagedPolicy();

  if (managedState.skipOnboarding) {
    await writeSyncSettings({
      setupComplete: true,
      securityProfile: 'organization',
      orgProvisionSource: 'managed',
    });
    await orgMessage('ORG_SYNC');
    const settings = await readSyncSettings();
    showMain('organization');
    applySettingsToForm(settings);
  applyProvisionChrome(settings);
  applyManagedChrome(settings);
    return;
  }

  let settings = await readSyncSettings();

  if (settings.orgProvisionSource === 'cloud') {
    await orgMessage('ORG_SYNC');
    await orgMessage('ORG_SYNC_SHARES');
    settings = await readSyncSettings();
  }

  if (!settings.setupComplete) {
    if (settings.orgId && settings.orgProvisionSource === 'cloud') {
      showPendingOrgSetup(settings);
      return;
    }
    showSetup();
    return;
  }

  showMain(settings.securityProfile || 'personal');
  const profile = applySettingsToForm(settings);

  if (profile === 'personal' && passphraseInput) {
    const stored = await GoldspireSecrets.loadPassphrase('personal');
    hasStoredPassphrase = Boolean(stored?.trim());
    passphraseInput.value = stored || '';
    passphraseInput.placeholder = hasStoredPassphrase
      ? 'Saved — leave blank to keep, or type to replace'
      : 'Choose a strong passphrase (16+ chars)';
  }

  if (profile === 'organization') {
    const orgInput = document.getElementById('org-passphrase');
    const stored = await GoldspireSecrets.loadPassphrase('organization');
    hasStoredOrgPassphrase = Boolean(stored?.trim());
    if (orgInput && !isOrgProvisioned(settings)) {
      orgInput.value = stored || '';
      orgInput.placeholder = hasStoredOrgPassphrase
        ? 'Saved — leave blank to keep, or type to replace'
        : 'Shared team passphrase (16+ chars)';
    } else if (orgInput) {
      orgInput.value = '';
      orgInput.placeholder = 'Provisioned by your organization';
    }
  }

  passphraseDirty = false;
  orgPassphraseDirty = false;
  refreshPassphraseStrength();
  applyProvisionChrome(settings);
  applyManagedChrome(settings);
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profile = currentProfile;
  const fromVault = profile === 'organization' && passphraseFromVaultInput?.checked;
  const newPassphrase = passphraseInput?.value.trim() || '';
  const orgPassphrase = document.getElementById('org-passphrase')?.value.trim() || '';
  const delayMax = profile === 'organization' ? 120 : 600;
  const resecureDelaySeconds = parseDelaySeconds(resecureDelayInput.value, 60, delayMax);

  if (profile === 'personal' && newPassphrase) {
    const a = GoldspirePassphrasePolicy?.assessPassphrase?.(newPassphrase, 'personal');
    if (a && !a.ok) { showStatus(a.message); return; }
  }

  if (profile === 'organization' && !fromVault && orgPassphrase && !isOrgProvisioned(await readSyncSettings())) {
    const a = GoldspirePassphrasePolicy?.assessPassphrase?.(orgPassphrase, 'organization');
    if (a && !a.ok) { showStatus(a.message); return; }
  }

  const selectionUiMode = document.getElementById('selectionUiMode')?.value || defaults.selectionUiMode;
  const showOnPageUi = selectionUiMode !== 'quiet';

  const savedSettings = migrateSettings({
    securityProfile: profile,
    publicUnlockUrl: document.getElementById('publicUnlockUrl')?.value.trim() || '',
    defaultSecureMode: document.getElementById('defaultSecureMode')?.value || 'team',
    useSavedPassphrase: profile === 'personal'
      ? useSavedPassphraseInput?.checked !== false
      : !fromVault,
    autoDetectRedacted: true,
    resecureAfterUnlock: getResecureChecked(),
    resecureDelaySeconds,
    passphraseFromVault: fromVault,
    selectionUiMode,
    showFloatingButton: showOnPageUi,
    showSelectionPill: showOnPageUi,
    setupComplete: true,
    orgMemberEmail: document.getElementById('orgMemberEmail')?.value.trim().toLowerCase() || '',
    passwordLength: parseInt(String(passwordLengthInput?.value || 16), 10) || 16,
    passwordLowercase: passwordLowercaseInput?.checked !== false,
    passwordUppercase: passwordUppercaseInput?.checked !== false,
    passwordDigits: passwordDigitsInput?.checked !== false,
    passwordSymbols: passwordSymbolsInput?.checked !== false,
  });

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    const current = await readSyncSettings();
    await writeSyncSettings({ ...current, ...savedSettings });

    if (profile === 'organization' && savedSettings.orgMemberEmail && isOrgProvisioned({ ...current, ...savedSettings })) {
      await orgMessage('ORG_REGISTER_MEMBER', { email: savedSettings.orgMemberEmail });
    }

    if (profile === 'organization' && fromVault && !isOrgProvisioned({ ...current, ...savedSettings })) {
      await GoldspireSecrets.savePassphrase('', 'organization');
      await GoldspireSecrets.clearSessionTeamPassphrase?.();
    } else if (profile === 'organization' && orgPassphrase && !isOrgProvisioned({ ...current, ...savedSettings })) {
      await GoldspireSecrets.savePassphrase(orgPassphrase, 'organization');
    } else if (profile === 'personal' && (passphraseDirty || newPassphrase)) {
      await GoldspireSecrets.savePassphrase(newPassphrase, 'personal');
    }

    applySettingsToForm({ ...current, ...savedSettings });
    passphraseDirty = false;
    orgPassphraseDirty = false;
    if (profile === 'personal') {
      const stored = await GoldspireSecrets.loadPassphrase('personal');
      hasStoredPassphrase = Boolean(stored?.trim());
      if (stored && passphraseInput) passphraseInput.value = stored;
    }
    if (profile === 'organization' && !fromVault) {
      const stored = await GoldspireSecrets.loadPassphrase('organization');
      hasStoredOrgPassphrase = Boolean(stored?.trim());
      const orgInput = document.getElementById('org-passphrase');
      if (stored && orgInput) orgInput.value = stored;
    }
    refreshPassphraseStrength();
    showStatus('Settings saved.');
  } catch (error) {
    showStatus(error?.message || 'Could not save settings.');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

passphraseInput?.addEventListener('input', () => {
  passphraseDirty = true;
  refreshPassphraseStrength();
});

passphraseFromVaultInput?.addEventListener('change', async () => {
  refreshOrgPassphraseStatus(passphraseFromVaultInput.checked, await readSyncSettings());
});

document.getElementById('org-passphrase')?.addEventListener('input', () => {
  orgPassphraseDirty = true;
});

// ── Tabs ────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tabs__btn').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tabs__btn').forEach((b) => b.classList.remove('tabs__btn--active'));
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('tab--active'));
    button.classList.add('tabs__btn--active');
    document.getElementById(`tab-${button.dataset.tab}`).classList.add('tab--active');
    if (button.dataset.tab === 'settings') loadSnoozedSites();
  });
});

// ── Home actions ──────────────────────────────────────────────────────────
function generateLocalPassword(options = {}) {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%&*-_+=?';

  const pools = [];
  if (options.lowercase) pools.push(lower);
  if (options.uppercase) pools.push(upper);
  if (options.digits) pools.push(digits);
  if (options.symbols) pools.push(symbols);

  const length = Math.min(64, Math.max(8, Number(options.length) || 16));
  if (pools.length === 0) throw new Error('Choose at least one character set.');

  // Ensure at least one char from each selected pool.
  const required = pools.map((pool) => {
    const b = crypto.getRandomValues(new Uint8Array(1))[0];
    return pool[b % pool.length];
  });

  const all = pools.join('');
  const remaining = Math.max(0, length - required.length);
  const bytes = crypto.getRandomValues(new Uint32Array(remaining));
  const rest = Array.from(bytes, (b) => all[b % all.length]);

  const out = [...required, ...rest];
  // Shuffle output.
  const shuffleBytes = crypto.getRandomValues(new Uint32Array(out.length));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = shuffleBytes[i] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

function passwordUiRoot() {
  if (currentProfile === 'personal') {
    return {
      output: document.getElementById('generated-password-personal'),
      length: document.getElementById('passwordLength-personal'),
      lowercase: document.getElementById('passwordLowercase-personal'),
      uppercase: document.getElementById('passwordUppercase-personal'),
      digits: document.getElementById('passwordDigits-personal'),
      symbols: document.getElementById('passwordSymbols-personal'),
    };
  }
  return {
    output: generatedPassword,
    length: passwordLengthInput,
    lowercase: passwordLowercaseInput,
    uppercase: passwordUppercaseInput,
    digits: passwordDigitsInput,
    symbols: passwordSymbolsInput,
  };
}

function getPasswordOptionsFromUi() {
  const ui = passwordUiRoot();
  return {
    length: parseInt(String(ui.length?.value || 16), 10) || 16,
    lowercase: ui.lowercase?.checked !== false,
    uppercase: ui.uppercase?.checked !== false,
    digits: ui.digits?.checked !== false,
    symbols: ui.symbols?.checked !== false,
  };
}

function writeGeneratedPassword(value) {
  const ui = passwordUiRoot();
  if (ui.output) ui.output.textContent = value;
}

document.getElementById('generate-password')?.addEventListener('click', () => {
  try {
    writeGeneratedPassword(generateLocalPassword(getPasswordOptionsFromUi()));
  } catch (e) {
    showStatus(e?.message || 'Could not generate password.');
  }
});

document.getElementById('settings-form')?.addEventListener('click', (event) => {
  const target = event.target;
  if (target.closest('.js-generate-password')) {
    try {
      writeGeneratedPassword(generateLocalPassword(getPasswordOptionsFromUi()));
    } catch (e) {
      showStatus(e?.message || 'Could not generate password.');
    }
    return;
  }
  if (target.closest('.js-copy-password')) {
    const ui = passwordUiRoot();
    let value = ui.output?.textContent || '—';
    if (value === '—') value = generateLocalPassword(getPasswordOptionsFromUi());
    writeGeneratedPassword(value);
    navigator.clipboard.writeText(value).then(() => showStatus('Copied.'));
    return;
  }
  if (target.closest('.js-insert-password')) {
    const ui = passwordUiRoot();
    let value = ui.output?.textContent || '—';
    if (value === '—') value = generateLocalPassword(getPasswordOptionsFromUi());
    writeGeneratedPassword(value);
    sendToActiveTab('INSERT_TEXT', { text: value });
    showStatus('Inserted.');
  }
});

document.getElementById('copy-password')?.addEventListener('click', async () => {
  const ui = passwordUiRoot();
  let value = ui.output?.textContent || '—';
  if (value === '—') value = generateLocalPassword(getPasswordOptionsFromUi());
  writeGeneratedPassword(value);
  await navigator.clipboard.writeText(value);
  showStatus('Copied.');
});

document.getElementById('insert-password')?.addEventListener('click', () => {
  const ui = passwordUiRoot();
  let value = ui.output?.textContent || '—';
  if (value === '—') value = generateLocalPassword(getPasswordOptionsFromUi());
  writeGeneratedPassword(value);
  sendToActiveTab('INSERT_TEXT', { text: value });
  showStatus('Inserted.');
});

function wirePasswordGeneratorSettings(settings) {
  const panels = [
    {
      length: passwordLengthInput,
      lowercase: passwordLowercaseInput,
      uppercase: passwordUppercaseInput,
      digits: passwordDigitsInput,
      symbols: passwordSymbolsInput,
    },
    {
      length: document.getElementById('passwordLength-personal'),
      lowercase: document.getElementById('passwordLowercase-personal'),
      uppercase: document.getElementById('passwordUppercase-personal'),
      digits: document.getElementById('passwordDigits-personal'),
      symbols: document.getElementById('passwordSymbols-personal'),
    },
  ];
  for (const ui of panels) {
    if (!ui.length) continue;
    ui.length.value = String(settings.passwordLength || 16);
    if (ui.lowercase) ui.lowercase.checked = settings.passwordLowercase !== false;
    if (ui.uppercase) ui.uppercase.checked = settings.passwordUppercase !== false;
    if (ui.digits) ui.digits.checked = settings.passwordDigits !== false;
    if (ui.symbols) ui.symbols.checked = settings.passwordSymbols !== false;
  }
}

async function persistPasswordGeneratorSettings() {
  try {
    const ui = passwordUiRoot();
    const current = await readSyncSettings();
    await writeSyncSettings({
      ...current,
      passwordLength: parseInt(String(ui.length?.value || 16), 10) || 16,
      passwordLowercase: ui.lowercase?.checked !== false,
      passwordUppercase: ui.uppercase?.checked !== false,
      passwordDigits: ui.digits?.checked !== false,
      passwordSymbols: ui.symbols?.checked !== false,
    });
  } catch {
    // ignore
  }
}

[passwordLengthInput, passwordLowercaseInput, passwordUppercaseInput, passwordDigitsInput, passwordSymbolsInput]
  .filter(Boolean)
  .forEach((el) => el.addEventListener('change', () => { persistPasswordGeneratorSettings(); }));

document.getElementById('action-secure')?.addEventListener('click', () => sendToActiveTab('SECURE_SELECTION'));
document.getElementById('action-secure-options')?.addEventListener('click', () => sendToActiveTab('SECURE_WITH_OPTIONS'));
document.getElementById('action-unlock')?.addEventListener('click', () => sendToActiveTab('UNLOCK_SELECTION'));

function refreshSelectionPreview() {
  const preview = document.getElementById('selection-preview');
  if (!preview) return;
  api.runtime.sendMessage({ type: 'GET_SELECTION_STATUS' }, (response) => {
    const text = response?.preview?.trim() || '';
    preview.textContent = text
      ? `"${text.slice(0, 48)}${text.length > 48 ? '…' : ''}"`
      : 'Highlight text on the page.';
    preview.classList.toggle('selection-preview--ready', Boolean(text));
  });
}

// ── Snoozed sites ───────────────────────────────────────────────────────────
function loadSnoozedSites() {
  const card = document.getElementById('snoozed-sites-card');
  const list = document.getElementById('snoozed-sites-list');
  if (!card || !list) return;

  api.storage.local.get({ gstSnoozedHosts: [] }, (result) => {
    if (api.runtime.lastError) return;
    const hosts = result.gstSnoozedHosts || [];
    card.hidden = hosts.length === 0;
    list.innerHTML = hosts.map((h) =>
      `<li class="snoozed-row"><span>${h}</span><button type="button" class="btn btn--ghost btn--sm" data-unsnooze="${h}">Remove</button></li>`,
    ).join('');

    list.querySelectorAll('[data-unsnooze]').forEach((btn) => {
      btn.addEventListener('click', () => {
        api.storage.local.get({ gstSnoozedHosts: [] }, (r) => {
          const updated = (r.gstSnoozedHosts || []).filter((x) => x !== btn.dataset.unsnooze);
          api.storage.local.set({ gstSnoozedHosts: updated }, loadSnoozedSites);
        });
      });
    });
  });
}

document.getElementById('clear-snoozed')?.addEventListener('click', () => {
  api.storage.local.set({ gstSnoozedHosts: [] }, loadSnoozedSites);
});

// ── Boot ──────────────────────────────────────────────────────────────────
if (api.storage?.onChanged) {
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.orgProvisionSource || changes.setupComplete || changes.orgDisplayName) {
      loadSettings().catch(() => {});
    }
  });
}

loadSettings().catch(() => showStatus('Could not load settings.'));
refreshSelectionPreview();
