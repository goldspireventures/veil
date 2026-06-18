# Veil by Goldspire

Browser extension + cloud org API for securing sensitive text in email, forms, and web apps — before you send.

**New machine?** → **[SETUP.md](SETUP.md)** · **Pilot QA** → **[docs/MANUAL_TEST.md](docs/MANUAL_TEST.md)** · **Launch** → **[docs/MARKET_READY.md](docs/MARKET_READY.md)**

## Repository layout

| Path | Purpose |
|------|---------|
| [`extension/`](extension/) | Full extension source — load unpacked from here |
| `unlock.html` (+ siblings at repo root) | GitHub Pages unlock site |
| [`.env`](.env) | **Edit configuration here** → then `npm run env:apply` |
| [`scripts/`](scripts/) | Env apply + deploy helpers |

## Configuration

**Edit:** [`.env`](.env) (copy from [`.env.example`](.env.example) if missing)

```bash
npm run env:apply   # writes extension/src/constants.js from .env
```

**Windows PowerShell:** if `npm` is blocked by execution policy, use `npm.cmd run env:apply` or `node scripts/apply-env.mjs`.

Key variables:

| Variable | Purpose |
|----------|---------|
| `ORG_API_BASE` | Cloud org API (e.g. `http://localhost:3015` or production API URL) |
| `ORG_PORTAL_URL` | Join / sign-in portal |
| `BUILT_IN_PUBLIC_UNLOCK_URL` | Hosted unlock page URL |

## Install extension (dev)

1. `npm run env:apply` (after editing `.env`)
2. Chrome/Edge → `chrome://extensions` → Developer mode → **Load unpacked** → select **`extension/`** folder
3. Reload after code changes

## Build unlock page (GitHub Pages)

```bash
npm run build
```

Packages `extension/dist/` and copies the unlock bundle to this repo root. Commit and push to update:

**https://goldspire-global.github.io/secure-text/unlock.html**

## Docs

| Doc | Audience |
|-----|----------|
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) | IT / team admins |
| [docs/MEMBER_GUIDE.md](docs/MEMBER_GUIDE.md) | End users |
| [docs/MARKET_READY.md](docs/MARKET_READY.md) | Launch checklist |
| [docs/STORE_LISTING.md](docs/STORE_LISTING.md) | Chrome / Edge store copy |
| [extension/docs/](extension/docs/) | Enterprise, threat model, deployment |

Portal pages (create / join / admin / privacy / terms): repo root `index.html` and siblings, synced to `api/public` via `npm run env:apply`.
