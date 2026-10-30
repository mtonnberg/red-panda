import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { writeFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const hash = async name => createHash('sha256').update(await readFile(name)).digest('hex');
const sourceHashes = {};
for (const name of ['probe.mjs','direct-profiler.cc','base/src/context-names.js','base/src/browser.js','base/src/runtime.js','base/src/cdp.js']) sourceHashes[name] = await hash(`.cache/heap-query-named/${name}`);
if (sourceHashes['direct-profiler.cc'] !== 'ac681b83c94d342de1590ec10cf626bd6f3041898aee2fd27cc00af59555991d') throw new Error('Direct source no longer matches original isolated crash experiment');
const provenance = JSON.parse(await readFile('docs/reference/runtime-query-provenance.json'));
for (const [version, executable, addon] of [
 ['24','/workspace/shared/rea-tools/node_modules/node/bin/node','direct.node'],
 ['26','/workspace/shared/node26/node_modules/node/bin/node','direct-node26.node']]) {
  const addonPath = `/workspace/red-panda/.cache/heap-query-probe/${addon}`;
  const binarySHA256 = await hash(addonPath), pinned = provenance.directBuilds.find(build => build.path.endsWith('/'+addon));
  if (pinned?.sha256 !== binarySHA256) throw new Error('Direct binary no longer matches pinned isolated experiment');
  const started = Date.now(), logPath = `docs/reference/runtime-query-named-direct-node${version}.partial.log`;
  writeFileSync(logPath, '');
  const child = spawn('/bin/bash', ['experiments/heap-query/run-probe.sh', executable, '--expose-gc', '.cache/heap-query-named/probe.mjs', 'direct', addonPath, '4'], { stdio:['ignore','pipe','pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => stdout += data);
  child.stderr.on('data', data => { stderr += data; appendFileSync(logPath, data); });
  console.log({version,stage:'started-direct-lifecycle',pid:child.pid,deadlineMs:120000});
  const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
  const [status, signal] = await once(child,'exit'); clearTimeout(timer);
  const result = {version,executable,mode:'direct',pid:child.pid,deadlineMs:120000,elapsedMs:Date.now()-started,status,signal,sourceHashes,binarySHA256,stdout,stderr};
  await writeFile(`docs/reference/runtime-query-named-direct-node${version}.json`,JSON.stringify(result,null,2)+'\n');
  const summary = stdout.trim() ? JSON.parse(stdout) : undefined;
  console.log({version,status,signal,elapsedMs:result.elapsedMs,cycles:summary?.cycles,selections:summary?.observations?.length,queries:summary?.heapQueryTimings?.length,objectGroups:summary?.objectGroupEvidence,lastStages:stderr.trim().split('\n').slice(-3)});
  if(status!==0 || signal) break;
}
