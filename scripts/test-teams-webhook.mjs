/**
 * Probe Power Automate Teams webhook with common payload shapes.
 * Usage: node scripts/test-teams-webhook.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(repoRoot, '.env');

function loadWebhookUrl() {
  if (!existsSync(envPath)) throw new Error('Missing .env');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (t.startsWith('OPS_ALERT_WEBHOOK_URL=')) {
      return t.slice('OPS_ALERT_WEBHOOK_URL='.length).trim();
    }
  }
  throw new Error('OPS_ALERT_WEBHOOK_URL not in .env');
}

const url = loadWebhookUrl();
const text = `Veil webhook probe ${new Date().toISOString()}`;

const payloads = [
  ['text-only', { text }],
  ['message-only', { message: text }],
  ['text+message', { text, message: text }],
  ['title+text+message', { title: 'Veil ops test', text, message: text, body: text }],
  ['adaptive-wrapper', {
    type: 'message',
    text,
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        type: 'AdaptiveCard',
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: 'Veil ops test', weight: 'bolder', size: 'medium' },
          { type: 'TextBlock', text, wrap: true },
        ],
      },
    }],
  }],
];

for (const [name, body] of payloads) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    console.log(`${name}: ${res.status} ${res.statusText}`);
    if (raw) console.log(`  body: ${raw.slice(0, 300)}`);
  } catch (error) {
    console.log(`${name}: ERROR ${error.message}`);
  }
  await new Promise((r) => setTimeout(r, 2000));
}

console.log('\nIf all return 202 but Teams is empty, open Power Automate → flow run history for failures.');
console.log('In the flow, map the Post message action to triggerBody() text or message.');
