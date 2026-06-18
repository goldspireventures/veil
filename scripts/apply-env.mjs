import { readFileSync, writeFileSync, existsSync, cpSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(repoRoot, '.env');
const constantsPath = join(repoRoot, 'extension', 'src', 'constants.js');
const portalConfigPath = join(repoRoot, 'portal', 'config.js');
const apiPublicDir = join(repoRoot, 'api', 'public');

function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function jsString(value) {
  return JSON.stringify(value ?? '');
}

function portalOrigin(url) {
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

if (!existsSync(envPath)) {
  console.error(`Missing ${envPath} — copy .env.example to .env first.`);
  process.exit(1);
}

const env = parseEnv(readFileSync(envPath, 'utf8'));
const orgApiBase = env.ORG_API_BASE ?? '';
const orgPortalUrl = env.ORG_PORTAL_URL ?? '';
const unlockUrl = env.BUILT_IN_PUBLIC_UNLOCK_URL ?? 'https://goldspire-global.github.io/secure-text/unlock.html';
const syncMinutes = Number(env.ORG_SYNC_INTERVAL_MINUTES) || 360;
const portalOriginValue = portalOrigin(orgPortalUrl);

const constantsContents = `/**
 * Built-in defaults shipped with the extension (no user setup required).
 * Generated from repo-root .env via \`npm run env:apply\` — do not edit by hand.
 */
(function (global) {
  global.GoldspireConstants = {
    /** Gmail/Outlook persist https links in sent mail; extension users unlock via in-page modal. */
    BUILT_IN_PUBLIC_UNLOCK_URL: ${jsString(unlockUrl)},
    /** One-time codes expire after this window (envelope \`exp\`). */
    ONE_TIME_TTL_MS: 72 * 60 * 60 * 1000,
    /** PBKDF2-SHA256 iterations (OWASP 2023 guidance for SHA-256). */
    CRYPTO_ITERATIONS: {
      personal: 600_000,
      organization: 600_000,
    },
    /** Suggested shared vault item title for IT documentation. */
    TEAM_VAULT_ITEM_LABEL: 'Goldspire Team Passphrase',
    /** Cloud org API base (no trailing slash). Empty = cloud join disabled. */
    ORG_API_BASE: ${jsString(orgApiBase)},
    /** Organization sign-in / join portal. */
    ORG_PORTAL_URL: ${jsString(orgPortalUrl)},
    /** Alarm interval for cloud policy sync (minutes). */
    ORG_SYNC_INTERVAL_MINUTES: ${syncMinutes},
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
`;

const portalConfigContents = `/**
 * Portal pages (Cloudflare Pages) — generated from .env via npm run env:apply.
 */
(function (global) {
  global.GoldspirePortal = {
    API_BASE: ${jsString(orgApiBase)},
    PORTAL_URL: ${jsString(orgPortalUrl)},
    PORTAL_ORIGIN: ${jsString(portalOriginValue)},
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
`;

writeFileSync(constantsPath, constantsContents);
writeFileSync(portalConfigPath, portalConfigContents);

mkdirSync(join(apiPublicDir, 'portal'), { recursive: true });
for (const file of ['common.css', 'app.js', 'config.js', 'nav.js', 'veil-mark.svg', 'favicon.png']) {
  cpSync(join(repoRoot, 'portal', file), join(apiPublicDir, 'portal', file), { force: true });
}
for (const page of [
  'index.html',
  'create.html',
  'admin.html',
  'join.html',
  'install.html',
  'privacy.html',
  'terms.html',
]) {
  cpSync(join(repoRoot, page), join(apiPublicDir, page), { force: true });
}

console.log(`Applied .env → ${constantsPath}`);
console.log(`Applied .env → ${portalConfigPath}`);
console.log(`Synced portal pages → ${apiPublicDir}`);
