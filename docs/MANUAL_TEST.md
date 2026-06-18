# Veil manual test guide

Use this after `npm run package` and loading **`extension/dist`** in the browser.

See also: [MEMBER_GUIDE.md](MEMBER_GUIDE.md) · [ADMIN_GUIDE.md](ADMIN_GUIDE.md) · [MARKET_READY.md](MARKET_READY.md)

---

## Before you test (one time per browser)

1. **Load the extension**  
   Edge or Chrome → Extensions → Developer mode → **Load unpacked** → `extension/dist`

2. **Join your team**  
   - Open the Veil popup → **Team** → join code + work email  
   - Or use the portal join page linked from your admin  
   - Confirm popup **Home** checklist is green (connected, passphrase, copilot)

3. **Refresh the mail tab**  
   After joining, reload Outlook or Gmail (F5) so the content script picks up settings.

> **Team users:** Veil copilot is **on by default** after join. Personal users enable it in Settings.

---

## Important: paste vs highlight vs typing

| Action | Copilot appears? |
|--------|------------------|
| **Paste** (Ctrl+V) sensitive text | **Yes** — paste copilot modal |
| **Highlight** text | **Yes** — Veil bar above selection |
| **Type** then pause (~0.5s) in compose | **Yes** — if copilot enabled and text matches a detector |

---

## Test 1 — Paste copilot (Outlook new mail)

1. Open Outlook on the web → **New mail**
2. Click in the message body
3. Copy this to your clipboard:
   ```
   AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe
   ```
4. **Ctrl+V** in the body

**Expected:** Modal — *Sensitive data pasted* — with **Encrypt**, **Mask**, **Allow**, and **Tokenize** (cloud org).

---

## Test 2 — Selection copilot

1. In the mail body, paste or type an IBAN, e.g. `DE89370400440532013000`
2. **Highlight** the full IBAN

**Expected:** Veil bar near the selection with Encrypt / Mask / Tokenize.

---

## Test 3 — Classic secure (shortcut)

1. Highlight any secret in the mail body
2. **Ctrl+Shift+S** or right-click → Veil → **Secure selection**

**Expected:** Text becomes `[redacted]`; click to unlock with team passphrase.

---

## Test 4 — Tokenize cross-client

1. Tokenize a secret in **Outlook (Edge)**
2. Send to yourself
3. Open in **Gmail (Chrome)** with Veil installed and same org joined
4. Click `[veil:vt_…]`

**Expected:** Passphrase prompt → plaintext revealed.

---

## Test 5 — DLP enforce (org admin)

1. Admin portal → DLP → **Enforce** → Save
2. Member extension syncs → paste API key again

**Expected:** Block or auto-mask per org policy.

---

## Quick isolation checklist

| Check | How |
|-------|-----|
| Team joined? | Popup Home checklist |
| Copilot enabled? | Settings → Veil copilot (on by default for teams) |
| Tab refreshed? | F5 on Outlook/Gmail |
| Extension from `dist`? | Re-run `npm run package` after code changes |
| Both browsers joined? | Edge and Chrome need separate join |

---

## Sample values

| Type | Example |
|------|---------|
| Google API key | `AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe` |
| IBAN | `DE89370400440532013000` |
| Credit card | `4111111111111111` |
