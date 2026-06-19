/**
 * Ops alert delivery — Microsoft Teams, Slack, or generic JSON webhook.
 */

const COOLDOWN_MS = 30 * 60 * 1000;
const lastSent = new Map();

function webhookType(env, url) {
  const explicit = String(env.OPS_ALERT_WEBHOOK_TYPE || process.env.OPS_ALERT_WEBHOOK_TYPE || '').trim().toLowerCase();
  const lower = String(url || '').toLowerCase();
  if (explicit === 'teams-webhook') return 'teams-webhook';
  if (lower.includes('powerautomate') || lower.includes('powerplatform.com')) return 'powerautomate';
  if (explicit === 'powerautomate' || explicit === 'teams' || explicit === 'slack' || explicit === 'generic') {
    return explicit === 'teams' && lower.includes('powerautomate') ? 'powerautomate' : explicit;
  }
  if (lower.includes('webhook.office.com') || lower.includes('outlook.office.com/webhook')) return 'teams';
  if (lower.includes('hooks.slack.com')) return 'slack';
  if (lower.includes('logic.azure.com')) return 'powerautomate';
  return 'generic';
}

function severityColor(severity) {
  if (severity === 'critical') return 'D13438';
  if (severity === 'error') return 'E74856';
  if (severity === 'warn') return 'F2C661';
  return '6DD58C';
}

function buildTeamsPayload({ title, body, severity, at }) {
  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: severityColor(severity),
    summary: title,
    sections: [
      {
        activityTitle: title,
        activitySubtitle: `Veil platform ops · ${severity.toUpperCase()}`,
        facts: [
          { name: 'Service', value: 'veil-api' },
          { name: 'Severity', value: severity },
          { name: 'Time (UTC)', value: at },
        ],
        text: body,
        markdown: true,
      },
    ],
  };
}

function buildSlackPayload({ title, body, severity, at }) {
  const emoji = severity === 'critical' || severity === 'error' ? ':rotating_light:' : ':warning:';
  return {
    text: `${emoji} *${title}*\n${body}\n_${at} UTC · veil-api · ${severity}_`,
  };
}

/** Power Automate / Teams Workflows — send {"text"} per Microsoft docs. */
function buildPowerAutomatePayload({ title, body, severity, at }) {
  const text = `${title}\n\n${body}\n\n— veil-api · ${severity} · ${at}`;
  return { text };
}

/** Teams connector webhook trigger (adaptive card path). */
function buildTeamsWebhookPayload({ title, body, severity, at }) {
  const text = `${title}\n\n${body}\n\n— veil-api · ${severity} · ${at}`;
  return {
    type: 'message',
    text,
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: title, weight: 'bolder', size: 'medium' },
          { type: 'TextBlock', text: body, wrap: true },
          { type: 'TextBlock', text: `veil-api · ${severity} · ${at}`, isSubtle: true, size: 'small' },
        ],
      },
    }],
  };
}

function buildGenericPayload({ title, body, severity, at }) {
  return {
    text: `${title}\n${body}`,
    title,
    body,
    severity,
    service: 'veil-api',
    at,
  };
}

export function buildWebhookPayload(type, alert) {
  if (type === 'teams-webhook') return buildTeamsWebhookPayload(alert);
  if (type === 'powerautomate') return buildPowerAutomatePayload(alert);
  if (type === 'teams') return buildTeamsPayload(alert);
  if (type === 'slack') return buildSlackPayload(alert);
  return buildGenericPayload(alert);
}

export async function sendOpsAlertTest(env = {}) {
  return raiseOpsAlert({
    key: `manual_test_${Date.now()}`,
    severity: 'warn',
    title: 'Veil ops test alert',
    body: 'If you see this in Teams chat, webhooks are working. Sent from veil-api test.',
    env,
  });
}

export async function raiseOpsAlert({ key, severity = 'warn', title, body, env = {} }) {
  const alertKey = String(key || title || 'alert').slice(0, 64);
  const now = Date.now();
  const last = lastSent.get(alertKey) || 0;
  if (now - last < COOLDOWN_MS) {
    return { skipped: true, reason: 'cooldown' };
  }
  lastSent.set(alertKey, now);

  const pool = (await import('./db.mjs')).getPool();
  let delivered = false;
  let channel = '';
  const webhook = String(env.OPS_ALERT_WEBHOOK_URL || process.env.OPS_ALERT_WEBHOOK_URL || '').trim();
  const at = new Date().toISOString();
  const alert = { title, body, severity, at };

  if (webhook) {
    const type = webhookType(env, webhook);
    channel = type;
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildWebhookPayload(type, alert)),
        signal: AbortSignal.timeout(10_000),
      });
      delivered = response.status >= 200 && response.status < 300;
      const responseText = await response.text().catch(() => '');
      if (!delivered) {
        console.error('ops alert webhook rejected', response.status, responseText.slice(0, 200));
      } else if (responseText) {
        console.log('ops alert webhook accepted', response.status, responseText.slice(0, 120));
      }
    } catch (error) {
      console.error('ops alert webhook failed', error);
    }
  }

  await pool.query(
    `INSERT INTO platform_alert_log (alert_key, severity, title, body, delivered)
     VALUES ($1, $2, $3, $4, $5)`,
    [alertKey, severity, String(title).slice(0, 200), String(body).slice(0, 2000), delivered],
  );

  console.error(`[OPS ALERT] ${severity.toUpperCase()}: ${title} — ${body}`);
  return { delivered, webhook: Boolean(webhook), channel };
}
