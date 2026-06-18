import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const unlockDeploy = join(dist, 'unlock-deploy');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const item of ['manifest.json', 'src', 'popup', 'styles', 'icons', 'unlock', 'bookmarklet', 'schemas']) {
  cpSync(join(root, item), join(dist, item), { recursive: true });
}

mkdirSync(unlockDeploy, { recursive: true });
cpSync(join(root, 'icons'), join(unlockDeploy, 'icons'), { recursive: true });
for (const file of ['unlock.css', 'unlock.js']) {
  cpSync(join(root, 'unlock', file), join(unlockDeploy, file));
}
const unlockSrcFiles = [
  'constants.js',
  'passphrase-policy.js',
  'burn-list.js',
  'browser.js',
  'crypto.js',
  'marker.js',
  'redacted.js',
];
for (const file of unlockSrcFiles) {
  cpSync(join(root, 'src', file), join(unlockDeploy, file));
}

function scriptTag(file) {
  const body = readFileSync(join(unlockDeploy, file), 'utf8');
  const hash = createHash('sha384').update(body).digest('base64');
  return `<script src="${file}" integrity="sha384-${hash}" crossorigin="anonymous"></script>`;
}

const hostedUnlockHtml = readFileSync(join(root, 'unlock', 'unlock.html'), 'utf8')
  .replace(/<script src="\.\.\/src\/[^"]+"><\/script>\n\s*/g, '')
  .replace(
    '<script src="unlock.js"></script>',
    `${unlockSrcFiles.map(scriptTag).join('\n    ')}\n    ${scriptTag('unlock.js')}`,
  );
writeFileSync(join(unlockDeploy, 'unlock.html'), hostedUnlockHtml);

console.log(`Extension packaged to ${dist}`);
console.log(`Hostable unlock site: ${unlockDeploy}`);
