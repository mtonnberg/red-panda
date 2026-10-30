import { spawn } from 'node:child_process';
import { dirname, join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
if (!args.length) args.push('build');
// The checked-in lockfile pins all upstream commits, including local package-set contents.
if (['build', 'test', 'run'].includes(args[0]) && !args.includes('--pure')) args.push('--pure');
const child = spawn(process.execPath, [join(root, 'node_modules/spago/bin/bundle.js'), ...(args.length ? args : ['build'])], {
  cwd: join(root, 'automation'), stdio: 'inherit',
  env: { ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --experimental-vm-modules`.trim(),
    PATH: `${join(root, 'node_modules/.bin')}${delimiter}${process.env.PATH}`,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? join(root, '.cache'),
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? join(root, '.cache/config'),
    XDG_DATA_HOME: process.env.XDG_DATA_HOME ?? join(root, '.cache/data'),
  },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
