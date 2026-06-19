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

Set `OPS_ALERT_WEBHOOK_URL` to a **Microsoft Teams** incoming webhook (recommended) or Slack URL.

### Microsoft Teams (Power Automate workflow)

Your URL is a **Power Automate manual/HTTP trigger** (`…/triggers/manual/…`). The API sends:

```json
{ "text": "Alert title and body in one string" }
```

That matches [Microsoft’s Teams workflow webhook docs](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook).

**If you get HTTP 202 but no Teams message**, the webhook is fine — the **flow** is failing or not mapped:

1. Open [Power Automate](https://make.powerautomate.com) → **My flows** → your Veil flow → **Run history**.
2. Open the latest run — check for red **Failed** steps.
3. Edit the flow → **Post message in a chat or channel** step:
   - **Post in**: Chat (or the chat you chose)
   - **Message**: pick dynamic content **`text`** from the trigger body  
     (expression: `triggerBody()?['text']` or `body('When_a_HTTP_request_is_received')?['text']`)
4. Save and turn the flow **On**.

**Test from production** (after deploy):

```bash
curl -X POST "https://veil-api.goldspireventures.com/v1/ops/test-alert" \
  -H "Authorization: Bearer YOUR_PLATFORM_OPS_TOKEN"
```

Railway env:

```
OPS_ALERT_WEBHOOK_TYPE=powerautomate
OPS_ALERT_WEBHOOK_URL=<your Power Automate URL>
```

### Slack (alternative)

```
OPS_ALERT_WEBHOOK_TYPE=slack
OPS_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Alerts use a 30-minute cooldown per alert key to avoid spam.

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
