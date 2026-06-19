# Veil platform operations (in-house)

Production observability without third-party APM. Metadata only — no secrets, no matched content.

## Dashboard URL

**API host only** (not on the public join portal):

```
https://veil-api.goldspireventures.com/ops.html
```

The join portal (`join-veil…`) returns 404 for `/ops.html` via the Cloudflare worker proxy.

## Environment variables (Railway)

| Variable | Purpose |
|----------|---------|
| `PLATFORM_OPS_TOKEN` | Bearer token for `/v1/ops/summary` and the ops dashboard |
| `OPS_CLIENT_INGEST_KEY` | Shared key for extension telemetry (`X-Ops-Ingest-Key` header) |
| `OPS_ALERT_WEBHOOK_URL` | Optional Slack/Discord/generic webhook for critical alerts |

Generate keys:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

After setting `OPS_CLIENT_INGEST_KEY` on Railway, add the same value to local `.env` and run `npm run env:apply` before packaging the extension.

## What is monitored

| Signal | Source |
|--------|--------|
| API + DB availability % | Health samples every 5 min |
| Portal synthetic checks | `join.html`, index, `/health` |
| API 5xx / latency by route | Request metrics (1-min buckets) |
| Extension failures | Batched client ops events |
| Org security events | Aggregate from `security_events` |
| Alerts | DB down, synthetic failure, API 5xx (30 min cooldown) |

Per-org detail remains in **admin.html** (security events, SIEM webhook).

## Alerts

Set `OPS_ALERT_WEBHOOK_URL` to a Slack incoming webhook or any endpoint that accepts JSON:

```json
{ "text": "...", "title": "...", "body": "...", "severity": "error", "service": "veil-api" }
```

Alerts are also stored in `platform_alert_log` and shown on the ops dashboard.

## Migrations

```bash
npm run db:migrate
```

Requires `010_ops_hardening.sql` applied on production.

## Local smoke

```bash
npm run env:apply
npm run api:dev
# Open http://localhost:3015/ops.html
```
