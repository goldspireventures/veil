# Organization provisioning

How users join an organization and receive team policy **without manual passphrase entry**.

## Two lanes

| Lane | Who | Matching | Rotation |
|------|-----|----------|----------|
| **Enterprise (MDM)** | IT-managed Chrome/Edge | Device is in corp policy scope | IT updates GPO/Intune JSON |
| **Cloud (self-serve)** | Store install, BYOD | Join code or SSO sign-in | Admin rotates in Goldspire console → extension syncs |

Personal mode is unchanged — user owns their passphrase locally.

## Enterprise lane (live today)

IT deploys the extension + managed storage policy. See [ENTERPRISE.md](ENTERPRISE.md).

When policy includes `teamPassphrase`:

1. Extension applies policy on install, startup, and policy change
2. **Setup wizard is skipped** — user lands in Team mode
3. Team passphrase is encrypted on device — one-click secure
4. IT rotates by updating `teamPassphrase` in policy — **no user action**

Optional policy fields: `orgId`, `orgDisplayName` (banner branding).

## Cloud lane (self-serve)

For teams without MDM:

1. **Admin** creates org at `{ORG_PORTAL_URL}/../create.html` (or `/create.html` on portal host)
2. **Members** install extension → Team / Organization → join code + work email
3. Extension receives org policy + team passphrase; syncs rotations automatically

### Join code API

```http
POST /v1/extension/org/join
```

### Create organization API

```http
POST /v1/orgs
Content-Type: application/json

{
  "displayName": "Acme Corp",
  "teamPassphrase": "…",
  "adminEmail": "admin@acme.com"
}
```

Returns `joinCode`, `adminToken` (once), and `orgId`. Admin console uses `Authorization: Bearer {adminToken}`.

### Sync API

```http
GET /v1/extension/org/sync
Authorization: Bearer {provisionToken}
X-Device-Id: {uuid}
X-Policy-Version: 3
```

Returns `304` if unchanged, or new policy payload (same shape as join).

### SSO callback

After sign-in at `ORG_PORTAL_URL`, the portal calls the extension via `externally_connectable`:

```javascript
chrome.runtime.sendMessage(extensionId, {
  type: 'ORG_PROVISION',
  payload: { /* same as join response */ }
});
```

Configure `ORG_API_BASE` and `ORG_PORTAL_URL` in `src/constants.js` when deploying (defaults to `http://localhost:3015` for local dev).

### Production example (Goldspire Ventures)

- `ORG_API_BASE`: `https://secure-text-api.goldspireventures.com`
- `ORG_PORTAL_URL`: `https://join-secure-text.goldspireventures.com/join.html`
- API env `CORS_ALLOW_ORIGINS`: `https://join-secure-text.goldspireventures.com`

## Local dev

```bash
npm install
npm run env:apply
npm run db:migrate
npm run api:dev
```

Open `http://localhost:3015/create.html` to create an org, or `http://localhost:3015/join.html` to test member join.

Optional demo seed for local testing only: `npm run db:seed` (creates Nova Care + `DEMO-N0VA7`).

## External vault mode (optional)

For orgs that **refuse** to store the team passphrase on device or in cloud policy:

- Set `passphraseFromVault: true` in MDM policy or cloud settings
- Users enter from their password manager once per browser session

This is a security trade-off, not the default.

## What we removed as primary path

Manual “IT emails everyone a new passphrase → update Settings” is **not** a supported rollout model. Legacy manual fields remain hidden when an org is provisioned.
