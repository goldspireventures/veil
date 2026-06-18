import { cpSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const unlockDeploy = join(repoRoot, 'extension', 'dist', 'unlock-deploy');

for (const file of readdirSync(unlockDeploy)) {
  const src = join(unlockDeploy, file);
  const dest = join(repoRoot, file);
  const recursive = statSync(src).isDirectory();
  cpSync(src, dest, { force: true, recursive });
}

console.log(`Deployed unlock page to repo root (GitHub Pages): ${repoRoot}`);
console.log(`Join portal is available at: ${join(repoRoot, 'join.html')}`);
