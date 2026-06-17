# Deploy (Goldspire Ventures) — Cloudflare Pages + Railway

Target hostnames:

- Organization portal: `https://join-secure-text.goldspireventures.com` (Cloudflare Pages)
- Org API: `https://secure-text-api.goldspireventures.com` (Railway)

Portal pages (static, repo root):

| Page | URL |
|------|-----|
| Home | `/index.html` |
| Create organization | `/create.html` |
| Member join | `/join.html` |
| Admin console | `/admin.html` |

Run `npm run env:apply` before deploy so `portal/config.js` and `extension/src/constants.js` match your `.env`.

## 1) Deploy the organization portal (Cloudflare Pages)

### A. Create Pages project

1. Cloudflare Dashboard → **Pages** → **Create a project**
2. Connect this Git repo
3. **Build settings**
   - Framework preset: **None**
   - Build command: `npm run env:apply` *(writes portal/config.js from repo secrets / env)*
   - Build output directory: `/` (root)

### B. Custom domain

Pages → your project → **Custom domains** → add:

- `join-secure-text.goldspireventures.com`

## 2) Deploy the org API (Railway)

### A. Create the service

1. Railway → **New Project** → **Deploy from GitHub repo**
2. Start command (in `railway.json`): `node api/src/server.mjs`
3. Health check: `/health`

### B. Environment variables

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | Supabase transaction pooler (`:6543`) |
| `DIRECT_URL` | Supabase session pooler (`:5432`) — migrations |
| `CORS_ALLOW_ORIGINS` | `https://join-secure-text.goldspireventures.com` |

### C. Database migrations

From your machine (`.env` with prod `DIRECT_URL`):

```bash
npm run db:migrate
```

No seed required for production — orgs are created via `/create.html`.

### D. Custom domain

Railway → **Networking** → add `secure-text-api.goldspireventures.com`

## 3) Configure the extension

In repo root `.env`:

```env
ORG_API_BASE=https://secure-text-api.goldspireventures.com
ORG_PORTAL_URL=https://join-secure-text.goldspireventures.com/join.html
```

Then:

```bash
npm run env:apply
npm run build
```

Reload the unpacked extension in Chrome/Edge.

## 4) Production E2E walkthrough

### Admin — create organization

1. Open `https://join-secure-text.goldspireventures.com/create.html`
2. Enter organization name, optional admin email, team passphrase (or generate)
3. Click **Create organization**
4. **Save** the join code and admin token (shown once)
5. Open **Admin console** to manage members, codes, and devices

### Member — join (extension)

1. Install / reload extension (production build)
2. Setup → **Team / Organization**
3. Enter join code + work email → **Connect**
4. Redact text in Gmail/Outlook to verify team mode

### Member — join (portal)

1. Extension → **Sign in with organization** (opens join page with API URL prefilled)
2. Enter join code → **Connect extension**
3. Return to extension popup → enter work email if setup not complete

### Admin — monitor

`https://join-secure-text.goldspireventures.com/admin.html` — sign in with admin token to view members, devices, and join codes.

## 5) API reference (admin)

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/v1/orgs` | Public — create org |
| `GET` | `/v1/orgs/me` | Bearer admin token |
| `PATCH` | `/v1/orgs/me` | Bearer admin token |
| `GET/POST` | `/v1/orgs/me/join-codes` | Bearer admin token |
| `GET` | `/v1/orgs/me/members` | Bearer admin token |
| `GET` | `/v1/orgs/me/devices` | Bearer admin token |

Extension endpoints unchanged under `/v1/extension/org/*`.
