# Goldspire Secure Text — Unlock Page

Public unlock page for **[redacted]** links in Gmail, Outlook, and other email clients.

Email clients only keep **https://** links. This site lets recipients click `[redacted]` in a message and unlock the secret with the team passphrase or one-time code.

## Live URL (after GitHub Pages is enabled)

```
https://goldspire-global.github.io/secure-text/unlock.html
```

Paste that URL in the extension: **Popup → Settings → Public unlock page URL**.

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
| `crypto.js`, `marker.js`, `redacted.js`, `browser.js` | Shared crypto + marker logic |

## Updating

Re-run `node scripts/package.mjs` in `apps/secure-text-extension`, then copy `dist/unlock-deploy/*` into this repo and push.
