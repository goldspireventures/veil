# Goldspire Secure Text — Unlock Page

Public unlock page for **[redacted]** links in Gmail, Outlook, and other email clients.

Email clients only keep **https://** links. This site lets recipients click `[redacted]` in a message and unlock the secret with the team passphrase or one-time code.

## Live URL

```
https://goldspire-global.github.io/secure-text/unlock.html
```

Paste that URL in the extension: **Popup → Settings → Public unlock page URL** (or leave blank for the built-in default).

## How it works

1. Sender secures text with the Goldspire Secure Text extension.
2. Gmail stores a real hyperlink: `[redacted]` → `unlock.html#<encrypted-payload>`.
3. Recipient clicks the link, enters the passphrase, and sees the secret in the browser.
4. The payload stays in the URL hash — it is never sent to a server.

## Files

| File | Purpose |
|------|---------|
| `unlock.html` | Unlock UI |
| `unlock.js` | Reads hash / pasted text, decrypts client-side |
| `unlock.css` | Hosted unlock page styles |
| `crypto.js`, `marker.js`, `redacted.js`, `browser.js`, `constants.js` | Shared crypto + marker logic |
| `passphrase-policy.js`, `burn-list.js` | Passphrase validation + one-time burn list |

## Updating

Re-run `node scripts/package.mjs` in `apps/secure-text-extension`, then copy `dist/unlock-deploy/*` into this repo and push.
