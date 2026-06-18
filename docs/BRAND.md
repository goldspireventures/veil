# Veil brand guide

## Name

**Veil** — product name  
**Veil by Goldspire** — full name in store listings and legal pages

## Colors

| Token | Hex | Use |
|-------|-----|-----|
| Navy | `#0d111b` | Backgrounds, extension icon base |
| Gold (start) | `#d4a017` | Logo gradient, accents |
| Gold (end) | `#f0c14b` | Logo gradient, hover |
| Blue accent | `#3b82f6` | Token UI, copilot highlights |
| Muted text | `#a8b0c2` | Secondary copy |

## Logo assets

| File | Use |
|------|-----|
| `extension/icons/icon-{16,48,128}.png` | Browser toolbar, store listing, manifest |
| `brand/veil-mark.svg` | Portal header, favicon source |
| `portal/veil-mark.svg` | Copied for static hosting |

## Usage

- **Extension popup** — use `icons/icon-48.png`, not emoji
- **Portal** — `veil-mark.svg` + wordmark “Veil” / “by Goldspire”
- **Store** — upload `icon-128.png` as primary; 1280×800 screenshots use same palette
- **Do not** stretch the icon; keep square with rounded corners as designed

## Regenerating icons

After updating `brand/veil-mark.svg` or source art:

```bash
# Replace extension/icons/icon-128.png, then:
powershell -Command "Add-Type -AssemblyName System.Drawing; ..."
npm run package
npm run package:store
```

Or replace PNGs manually and run `npm run package`.
