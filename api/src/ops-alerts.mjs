import { getPool } from './db.mjs';

const COOLDOWN_MS = 30 * 60 * 1000;
const lastSent = new Map();

export async function raiseOpsAlert({ key, severity = 'warn', title, body, env = {} }) {
  const alertKey = String(key || title || 'alert').slice(0, 64);
  const now = Date.now();
  const last = lastSent.get(alertKey) || 0;
  if (now - last < COOLDOWN_MS) {
    return { skipped: true, reason: 'cooldown' };
  }
  lastSent.set(alertKey, now);

  const pool = getPool();
  let delivered = false;
  const webhook = String(env.OPS_ALERT_WEBHOOK_URL || process.env.OPS_ALERT_WEBHOOK_URL || '').trim();

  if (webhook) {
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${title}\n${body}`,
          title,
          body,
          severity,
          service: 'veil-api',
          at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      delivered = response.ok;
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
  return { delivered, webhook: Boolean(webhook) };
}
