/**
 * Zip extension/dist for Chrome Web Store / Edge Add-ons submission.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(repoRoot, 'extension', 'dist');
const outDir = join(repoRoot, 'extension', 'store');
const manifestPath = join(dist, 'manifest.json');

if (!existsSync(dist)) {
  console.error('Missing extension/dist — run: npm run package');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const version = manifest.version || '0.0.0';
const zipName = `veil-${version}.zip`;
const zipPath = join(outDir, zipName);

function zipDist() {
  if (process.platform === 'win32') {
    const ps = `$dist = ${JSON.stringify(dist)}; $zip = ${JSON.stringify(zipPath)}; if (Test-Path $zip) { Remove-Item $zip -Force }; Compress-Archive -Path (Join-Path $dist '*') -DestinationPath $zip -Force`;
    execSync(`powershell -NoProfile -Command ${JSON.stringify(ps)}`, { stdio: 'inherit' });
    return;
  }
  execSync(`cd ${JSON.stringify(dist)} && zip -r ${JSON.stringify(zipPath)} .`, { stdio: 'inherit' });
}

zipDist();

const listing = {
  name: 'Veil — secure text by Goldspire',
  version,
  zip: zipName,
  privacyPolicy: 'https://join-secure-text.goldspireventures.com/privacy.html',
  submit: {
    chrome: 'https://chrome.google.com/webstore/devconsole',
    edge: 'https://partner.microsoft.com/dashboard/microsoftedge/overview',
  },
};

writeFileSync(join(outDir, 'listing.json'), `${JSON.stringify(listing, null, 2)}\n`);
console.log(`Store package: ${zipPath}`);
console.log(`Listing meta: ${join(outDir, 'listing.json')}`);
