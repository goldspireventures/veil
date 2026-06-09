const form = document.getElementById('unlock-form');
const securedText = document.getElementById('securedText');
const secretInput = document.getElementById('secret');
const result = document.getElementById('result');
const resultValue = document.getElementById('result-value');
const error = document.getElementById('error');
const copyButton = document.getElementById('copy-result');

let unlocked = '';

function showError(message) {
  error.hidden = false;
  error.textContent = message;
  result.hidden = true;
}

function resolveMarker(text) {
  const redacted = GoldspireRedacted.findInText(text);
  if (redacted) return redacted;
  return GoldspireSecureMarker.findInText(text);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;

  const marker = resolveMarker(securedText.value);
  if (!marker) {
    showError('No [redacted] text found. Paste the full message.');
    return;
  }

  try {
    unlocked = await GoldspireSecureCrypto.decryptText(marker.payload, secretInput.value.trim());
    resultValue.textContent = unlocked;
    result.hidden = false;
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Unlock failed.');
  }
});

copyButton.addEventListener('click', async () => {
  if (!unlocked) return;
  await navigator.clipboard.writeText(unlocked);
  copyButton.textContent = 'Copied';
});

const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
if (hash) securedText.value = hash;
