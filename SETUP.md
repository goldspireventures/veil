# Setup on a new machine

Repo: **https://github.com/goldspire-global/secure-text**

## 1. Clone

```bash
git clone https://github.com/goldspire-global/secure-text.git
cd secure-text
```

## 2. Configure `.env`

```bash
copy .env.example .env    # Windows cmd
# cp .env.example .env    # macOS / Linux
```

Edit **`.env`** in the repo root:

| Variable | Dev value | Production |
|----------|-----------|------------|
| `ORG_API_BASE` | `http://localhost:3015` | Your deployed API URL |
| `ORG_PORTAL_URL` | `http://localhost:3015/secure-text/join` | Your join portal URL |
| `BUILT_IN_PUBLIC_UNLOCK_URL` | `https://goldspire-global.github.io/secure-text/unlock.html` | Same (GitHub Pages) |

## 3. Apply config to the extension

**Windows PowerShell** often blocks `npm` scripts. Use any of these:

```powershell
# Option A — bypass PowerShell script policy for npm
npm.cmd run env:apply

# Option B — call node directly (no npm needed)
node scripts/apply-env.mjs
```

```bash
# macOS / Linux / Git Bash
npm run env:apply
```

This writes `extension/src/constants.js` from your `.env`.

## 4. Load the extension

1. Chrome/Edge → `chrome://extensions`
2. Developer mode **on**
3. **Load unpacked** → select the **`extension/`** folder inside the clone
4. After code or `.env` changes: run `env:apply` again, then click **Reload** on the extension card

## 5. Cloud org join (optional — needs backend)

The extension can join teams via join code when a cloud API is running.

### Supabase `.env` (monorepo backend)

If you use the **Goldspire launch stack** monorepo for `apps/api`:

| Variable | Use |
|----------|-----|
| `DATABASE_URL` | **Transaction pooler** — port **6543** (`*.pooler.supabase.com`) |
| `DIRECT_URL` | **Session pooler** — port **5432** (same host) — for migrations only |

From monorepo root:

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm --filter @goldspire/api-app dev
```

Demo join code after seed: **`DEMO-N0VA7`** (Nova Care org).

### Quick test (extension only, no backend)

- **Enterprise / MDM:** push `teamPassphrase` via GPO/Intune — see `extension/docs/ENTERPRISE.md`
- **Personal mode:** no cloud API needed

## 6. Build & publish unlock page (optional)

Updates **https://goldspire-global.github.io/secure-text/unlock.html**

```bash
npm.cmd run build    # Windows
npm run build        # macOS / Linux
git add -A && git commit -m "Update unlock page" && git push
```

## 7. Reload checklist after pull

```text
git pull
node scripts/apply-env.mjs     # or npm.cmd run env:apply
chrome://extensions → Reload
```

## Docs index

| Doc | Topic |
|-----|-------|
| `extension/docs/ORG_PROVISIONING.md` | Cloud join + sync API |
| `extension/docs/ENTERPRISE.md` | GPO / Intune managed policy |
| `extension/docs/TEAM_VAULT.md` | External vault vs provisioned policy |
| `extension/docs/THREAT_MODEL.md` | Security model |
| `extension/SECURITY.md` | Crypto & storage |
