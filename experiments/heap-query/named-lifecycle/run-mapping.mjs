import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const hash = async name => createHash('sha256').update(await readFile(name)).digest('hex');
const sourceHashes = {};
for (const name of ['probe.mjs','base/src/context-names.js','base/src/browser.js','base/src/runtime.js']) sourceHashes[name] = await hash(`.cache/heap-query-named/${name}`);
// Sequential by design: only one owned lifecycle process is active at a time.
for (const [version, executable] of [['24','/workspace/shared/rea-tools/node_modules/node/bin/node'],['26','/workspace/shared/node26/node_modules/node/bin/node']]) {
  const started = Date.now();
  const child = spawn('/bin/bash', ['experiments/heap-query/run-probe.sh', executable, '--expose-gc', '.cache/heap-query-named/probe.mjs', 'mapping', '-', '6'], { stdio: ['ignore','pipe','pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
  const [status, signal] = await once(child,'exit'); clearTimeout(timer);
  const result = { version, executable, mode:'mapping', pid:child.pid, deadlineMs:60000, elapsedMs:Date.now()-started, status, signal, sourceHashes, stdout, stderr };
  await writeFile(`docs/reference/runtime-query-named-mapping-node${version}.json`, JSON.stringify(result,null,2)+'\n');
  const summary = stdout.trim() ? JSON.parse(stdout) : undefined;
  console.log({version,status,signal,elapsedMs:result.elapsedMs,cycles:summary?.cycles,selections:summary?.observations?.length,loadedHeapAddons:summary?.loadedHeapAddons,lastStages:stderr.trim().split('\n').slice(-3)});
  if(status!==0 || signal) break;
}
