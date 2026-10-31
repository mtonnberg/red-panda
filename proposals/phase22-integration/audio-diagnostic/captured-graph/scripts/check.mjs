import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

for (const directory of ['src', 'bin', 'scripts']) {
  for (const name of readdirSync(new URL(`../${directory}/`, import.meta.url))) {
    if (!/\.(?:m?js)$/.test(name)) continue;
    execFileSync(process.execPath, ['--check', new URL(`../${join(directory, name)}`, import.meta.url).pathname], { stdio: 'inherit' });
  }
}
