# Chrome Web Store & Edge Add-ons listing

Draft copy for Veil extension store submissions.

## Name

**Veil — secure text by Goldspire**

## Short description (132 chars max)

Encrypt secrets in email & web apps before you send. [redacted] links, team tokens, paste copilot. Client-side encryption.

## Full description

Veil by Goldspire helps you protect sensitive text in Outlook, Gmail, and everyday web apps — before you hit send.

**Secure inline** — Highlight an API key, password, or card number and replace it with `[redacted]`. Recipients unlock on the same page with your team passphrase.

**Tokenize for email** — Share `[veil:vt_…]` placeholders that teammates click to reveal. Works across email clients when your org uses Veil.

**Veil copilot** — Detects secrets when you paste or highlight text in compose fields and offers Encrypt, Mask, or Tokenize.

**Privacy first** — Encryption runs in your browser. Veil’s cloud service stores org membership and encrypted token blobs — never your plaintext secrets.

**For teams** — Admins create an organization, share a join code, and optionally deploy via Chrome or Edge managed policy.

Requires a team join code from your administrator for organization features.

## Category

Productivity

## Permissions justification

- **storage** — Save settings and encrypted passphrase locally
- **activeTab** — Act on text you select on the current page
- **clipboardWrite** — Copy generated passwords and unlock results
- **host_permissions (all_urls)** — Inject secure-text UI in email and web compose surfaces you use

## Privacy policy URL

`https://join-secure-text.goldspireventures.com/privacy.html` (update to your hosted URL)

## Support URL

`mailto:support@goldspireventures.com`

## Screenshots (capture before submit)

1. Popup home with setup checklist complete
2. Copilot modal on paste in Outlook compose
3. `[redacted]` unlock in reading pane
4. Token `[veil:vt_…]` revealed in Gmail
5. Admin portal members list (optional)

## Edge Add-ons

Use the same listing text. Edge package: load `extension/dist` as unpacked for review build, or submit zip from `npm run package`.
