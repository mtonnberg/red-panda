import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { writeFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const hash = async name => createHash('sha256').update(await readFile(name)).digest('hex');
const sourceHashes = {};
for (const name of ['probe.mjs','base/src/context-names.js','base/src/browser.js','base/src/runtime.js','base/src/cdp.js']) sourceHashes[name] = await hash(`.cache/heap-query-named/${name}`);
for (const [version, executable, addon] of [
 ['24','/workspace/shared/rea-tools/node_modules/node/bin/node','heap-query.node'],
 ['26','/workspace/shared/node26/node_modules/node/bin/node','heap-query-node26.node']]) {
  const addonPath = `/workspace/red-panda/.cache/heap-query-probe/${addon}`;
  const manifest = JSON.parse(await readFile(`${addonPath}.json`));
  const binarySHA256 = await hash(addonPath);
  if (manifest.binarySHA256 !== binarySHA256) throw new Error('Snapshot binary digest mismatch');
  const started = Date.now(), logPath = `docs/reference/runtime-query-named-snapshot-node${version}.partial.log`;
  writeFileSync(logPath, '');
  const child = spawn('/bin/bash', ['experiments/heap-query/run-probe.sh', executable, '--expose-gc', '.cache/heap-query-named/probe.mjs', 'snapshot', addonPath, '4'], { stdio:['ignore','pipe','pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => stdout += data);
  child.stderr.on('data', data => { stderr += data; appendFileSync(logPath, data); });
  console.log({version,stage:'started-snapshot-lifecycle',pid:child.pid,deadlineMs:180000});
  const timer = setTimeout(() => child.kill('SIGKILL'), 180000);
  const [status, signal] = await once(child,'exit'); clearTimeout(timer);
  const result = {version,executable,mode:'snapshot',pid:child.pid,deadlineMs:180000,elapsedMs:Date.now()-started,status,signal,sourceHashes,manifest,binarySHA256,stdout,stderr};
  await writeFile(`docs/reference/runtime-query-named-snapshot-node${version}.json`,JSON.stringify(result,null,2)+'\n');
  const summary = stdout.trim() ? JSON.parse(stdout) : undefined;
  console.log({version,status,signal,elapsedMs:result.elapsedMs,cycles:summary?.cycles,selections:summary?.observations?.length,queries:summary?.heapQueryTimings?.length,objectGroups:summary?.objectGroupEvidence,lastStages:stderr.trim().split('\n').slice(-3)});
  if(status!==0 || signal) break;
}
