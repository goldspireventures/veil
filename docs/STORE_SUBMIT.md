# Submit Veil to Chrome Web Store & Edge Add-ons

## 1. Build packages

```bash
npm run package
npm run package:store
```

Output:

- `extension/store/veil-1.1.0.zip` — upload this
- `extension/store/listing.json` — version + URLs reference
- Copy from `docs/STORE_LISTING.md` for description text

## 2. Chrome Web Store

1. Open [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. **New item** → upload `extension/store/veil-*.zip`
3. Fill listing (see `STORE_LISTING.md`)
4. **Privacy**
   - Single purpose: secure sensitive text in web apps
   - Policy URL: `https://join-secure-text.goldspireventures.com/privacy.html`
5. **Permissions justification** — paste from `STORE_LISTING.md`
6. **Screenshots** (1280×800 or 640×400) — capture:
   - Popup with green setup checklist
   - Copilot modal on paste in Outlook
   - `[redacted]` unlock in email
   - Token reveal in Gmail
7. Submit for review (typically 1–7 days)

## 3. Microsoft Edge Add-ons

1. Open [Partner Center → Edge extensions](https://partner.microsoft.com/dashboard/microsoftedge/overview)
2. **Create new extension** → upload same ZIP
3. Use identical listing copy
4. Submit for certification

## 4. After approval

1. Update `install.html` with store links (replace “load unpacked” for public users)
2. Share store URLs in admin invite email template
3. Enterprise customers can still use Intune/GPO — see `extension/docs/ENTERPRISE.md`

## 5. Updates

Bump `extension/manifest.json` version → `npm run package:store` → upload new ZIP in each dashboard.
