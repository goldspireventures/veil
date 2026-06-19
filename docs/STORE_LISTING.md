# Veil — Chrome Web Store & Edge Add-ons listing

Draft copy for Veil extension store submissions.

## Name

**Veil by Goldspire**

## Short description (132 chars max)

Secure secrets in email & web before you send. Free personal use. Smart copilot, [redacted] links, team tokens.

## Full description

**Veil by Goldspire** protects sensitive text in Outlook, Gmail, and everyday web apps — before you hit send. **Free for personal use** — no account required.

**Personal (free)**
- Highlight or paste secrets → replace with `[redacted]`
- Smart copilot catches API keys; stays quiet on signup forms
- Recipients unlock on the same page with your passphrase

**For teams**
- Join with a code from your admin
- **Secure**, **Mask**, or **Tokenize** in compose
- Policy sync, metadata-only security events, optional SIEM export
- IT can deploy via Chrome or Edge managed policy

**Privacy first** — Encryption runs in your browser. Veil cloud stores org membership and encrypted token blobs — never your plaintext secrets.

## Category

Productivity

## Permissions justification

- **storage** — Save settings and encrypted passphrase locally
- **activeTab** — Act on text you select on the current page
- **clipboardWrite** — Copy generated passwords and unlock results
- **host_permissions (all_urls)** — Inject Veil UI in email and web compose surfaces you use

## Privacy policy URL

https://join-veil.goldspireventures.com/privacy.html

## Support URL

https://join-veil.goldspireventures.com/feedback.html

## Screenshots (capture before submit)

1. Popup home with setup checklist complete
2. Copilot modal on paste in Outlook compose
3. `[redacted]` unlock in reading pane
4. Token `[veil:vt_…]` revealed in Gmail
5. Admin portal members list (optional)

## Edge Add-ons

Use the same listing text. Edge package: `extension/store/veil-1.2.3.zip` from `npm run package:store`.
