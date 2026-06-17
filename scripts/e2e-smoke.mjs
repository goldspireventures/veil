#!/usr/bin/env node
/**
 * End-to-end smoke: unit tests, package build, API health, migrations check.
 */
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const envPath = join(repoRoot, '.env');
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ...options.env },
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`));
    });
  });
}

async function fetchHealth(base) {
  const url = `${base.replace(/\/+$/, '')}/health`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
  const body = await response.json().catch(() => ({}));
  if (body.ok !== true && body.status !== 'ok') {
    throw new Error(`Unexpected health payload: ${JSON.stringify(body)}`);
  }
  console.log(`API healthy at ${url}`);
}

async function main() {
  const env = loadEnv();
  const apiBase = process.env.ORG_API_BASE || env.ORG_API_BASE || 'http://localhost:3015';

  console.log('=== 1/5 Unit + scenario tests ===');
  await run('npm', ['test']);

  console.log('\n=== 2/4 Package extension ===');
  await run('npm', ['run', 'package']);

  console.log('\n=== 3/4 Database migrations ===');
  if (process.env.DATABASE_URL || env.DATABASE_URL) {
    await run('npm', ['run', 'db:migrate']);
    console.log('Migrations applied.');
  } else {
    console.log('Skipped (no DATABASE_URL).');
  }

  console.log('\n=== 4/4 API health ===');
  try {
    await fetchHealth(apiBase);
  } catch (error) {
    if (apiBase.includes('localhost')) {
      console.log('Local API not running — starting temporary server…');
      const server = spawn('node', ['api/src/server.mjs'], {
        cwd: repoRoot,
        stdio: 'pipe',
        env: { ...process.env, ...env, PORT: '3015' },
      });
      await new Promise((r) => setTimeout(r, 1500));
      try {
        await fetchHealth('http://localhost:3015');
      } finally {
        server.kill();
      }
    } else {
      await fetchHealth(apiBase);
    }
  }

  const distZip = join(repoRoot, 'extension', 'dist');
  if (!existsSync(distZip)) throw new Error('extension/dist missing after package.');
  console.log('\nE2E smoke passed.');
}

main().catch((error) => {
  console.error('\nE2E smoke failed:', error.message || error);
  process.exit(1);
});
