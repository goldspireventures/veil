const form = document.getElementById('unlock-form');
const securedText = document.getElementById('securedText');
const pasteField = document.getElementById('paste-field');
const secretInput = document.getElementById('secret');
const subtitle = document.getElementById('subtitle');
const result = document.getElementById('result');
const resultValue = document.getElementById('result-value');
const error = document.getElementById('error');
const copyButton = document.getElementById('copy-result');

let unlocked = '';
let linkMarker = null;

function showError(message) {
  error.hidden = false;
  error.textContent = message;
  result.hidden = true;
}

function resolveMarker(text) {
  const redacted = GoldspireRedacted.findInText(text);
  if (redacted) return redacted;
  return GoldspireSecureMarker.parseMarker(text) || GoldspireSecureMarker.findInText(text);
}

function markerFromHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return null;
  try {
    return resolveMarker(decodeURIComponent(raw));
  } catch {
    return resolveMarker(raw);
  }
}

function setupLinkMode() {
  pasteField.hidden = true;
  securedText.removeAttribute('required');
  subtitle.textContent = 'Enter the passphrase shared with you.';
  secretInput.focus();
}

function fullMarkerFor(marker) {
  return marker.fullMarker || marker.full || securedText.value || location.hash.slice(1) || '';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;

  const marker = linkMarker || resolveMarker(securedText.value);
  if (!marker) {
    showError(linkMarker ? 'Invalid secured link.' : 'No [redacted] text found. Paste the full message.');
    return;
  }

  const fullMarker = fullMarkerFor(marker);
  const isOneTime = marker.mode === 'one-time' || marker.version === '2';

  if (await GoldspireBurnList?.isBurned?.(fullMarker)) {
    showError('This one-time message was already unlocked on this device.');
    return;
  }

  const rateLimit = await GoldspireBurnList?.checkRateLimit?.(fullMarker);
  if (rateLimit && !rateLimit.allowed) {
    showError(rateLimit.message);
    return;
  }

  try {
    const profiles = ['personal', 'organization'];
    let decrypted = null;
    let lastError = null;

    for (const profile of profiles) {
      try {
        decrypted = await GoldspireSecureCrypto.decryptEnvelope(marker.payload, secretInput.value.trim(), {
          profile,
          mode: isOneTime ? 'one-time' : 'team',
        });
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!decrypted) {
      await GoldspireBurnList?.recordFailure?.(fullMarker);
      throw lastError || new Error('Wrong passphrase');
    }

    await GoldspireBurnList?.clearFailures?.(fullMarker);
    unlocked = decrypted.text;

    if (isOneTime || decrypted.envelope?.burn) {
      await GoldspireBurnList?.burn?.(fullMarker);
    }

    resultValue.textContent = unlocked;
    result.hidden = false;
    form.hidden = true;
    copyButton.focus();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Wrong passphrase or corrupted link.';
    showError(
      message.includes('expired') || message.includes('at least')
        ? message
        : 'Wrong passphrase or corrupted link.',
    );
  }
});

copyButton.addEventListener('click', async () => {
  if (!unlocked) return;
  await navigator.clipboard.writeText(unlocked);
  copyButton.textContent = 'Copied';
});

const fromLink = markerFromHash();
if (fromLink) {
  linkMarker = fromLink;
  securedText.value = fromLink.fullMarker || location.hash.slice(1);
  setupLinkMode();
} else {
  const hash = location.hash.replace(/^#/, '');
  if (hash) {
    try {
      securedText.value = decodeURIComponent(hash);
    } catch {
      securedText.value = hash;
    }
    const parsed = resolveMarker(securedText.value);
    if (parsed) {
      linkMarker = parsed;
      setupLinkMode();
    }
  }
}
