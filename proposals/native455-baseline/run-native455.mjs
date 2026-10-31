// Evidence orchestration only. The copied browser driver and route graph stay unchanged.
import { spawn } from 'node:child_process';
import { readFile,writeFile,rename,readdir,realpath,mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join,relative } from 'node:path';
const root='/workspace/red-panda',snapshot='/workspace/shared/native455-20261031',out=join(root,'proposals/native455-baseline');
const binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const node='/workspace/shared/rea-tools/node_modules/node/bin/node';
const mapFile=join(out,'registration-map.json'),map=JSON.parse(await readFile(mapFile,'utf8'));
const sourceRoot=map.sourceRoot,fixtureRoot=join(sourceRoot,'src/browser/tests');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function filesUnder(path){const files=[];for(const e of await readdir(path,{withFileTypes:true})){const child=join(path,e.name);if(e.isDirectory())files.push(...await filesUnder(child));else if(e.isFile())files.push(child);}return files.sort();}
const startedAt=new Date().toISOString();let stop=false,current=null;
process.on('SIGTERM',()=>{stop=true;console.log('STOP requested; preserving current fixture then checkpointing.');});
process.on('SIGINT',()=>{stop=true;console.log('STOP requested; preserving current fixture then checkpointing.');});
const sourceHashes={...map.sourceSHA256,...map.fixtureAndSupportSHA256};
async function verifySource(){const failures=[];for(const[file,expected]of Object.entries(sourceHashes)){try{const actual=sha(await readFile(join(sourceRoot,file)));if(actual!==expected)failures.push({file,expected,actual});}catch(error){failures.push({file,error:error.message});}}return failures;}
const sourceBefore=await verifySource();if(sourceBefore.length)throw new Error('Pinned source verification failed: '+JSON.stringify(sourceBefore));
const graph={};for(const file of [...await filesUnder(join(snapshot,'scripts')),...await filesUnder(join(snapshot,'test')),join(snapshot,'package.json')])graph[relative(snapshot,file)]=sha(await readFile(file));
const wsRoot=await realpath(join(snapshot,'node_modules/ws'));const wsHashes={};for(const file of await filesUnder(wsRoot))if(!file.includes('/node_modules/'))wsHashes[relative(wsRoot,file)]=sha(await readFile(file));
// wsRoot may resolve beneath node_modules; hash all package-owned files explicitly.
if(!Object.keys(wsHashes).length)for(const file of await filesUnder(wsRoot))wsHashes[relative(wsRoot,file)]=sha(await readFile(file));
const provenance={schemaVersion:1,scope:'Serial actual Native registration/profile baseline; no candidate, WPT, or performance parity claim',startedAt,sourceCommit:map.upstreamCommit,sourceRoot,fixtureRoot,registrationMapSHA256:sha(await readFile(mapFile)),sourceHashCount:Object.keys(sourceHashes).length,sourceBefore:{verified:!sourceBefore.length,mismatches:sourceBefore},helperGraphSHA256:graph,helperSnapshot:snapshot,webSocketDependency:{root:wsRoot,filesSHA256:wsHashes},node:{path:node,version:(await new Promise(resolve=>{let value='';const p=spawn(node,['--version']);p.stdout.on('data',x=>value+=x);p.on('close',()=>resolve(value.trim()));})),sha256:sha(await readFile(node))},binary:{path:binary,sha256:sha(await readFile(binary))},canonicalPorts:[9582,9584],execution:{serial:true,freshFixtureServerPerFixture:true,freshNativeProcessPerFixture:true,profileSelection:'Exact source resource/experimental flags, injection, 2000/8000 ms fixture budgets; no timeout override or settle delay',ownedProcessDeadline:'source fixture budget + 15000 ms for readiness/teardown; separately classified if exceeded',nativeStderrCapture:'Driver keeps first65536 characters and reports truncation; runner stdout/stderr retained individually'},limits:['Literal source registration map is not a compiled Zig build/import-filter claim','External raw-CDP runner behavior may differ from in-process Zig runner; failures retained','No candidate run and no requested implementation changes']};
await writeFile(join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n',{flag:'wx'});
const matrix={schemaVersion:1,scope:provenance.scope,startedAt,provenance:'provenance.json',registrationMap:'registration-map.json',counts:{selected:map.fixtures.length,completed:0,passed:0,failed:0,timeout:0,unobserved:0,runnerError:0,verifiedHarnessPass:0},profileCounts:Object.fromEntries(map.profiles.map(p=>[p.id,{selected:p.fixtureCount,completed:0,passed:0,failed:0,timeout:0,unobserved:0,runnerError:0}])),results:[]};
const taxonomy=row=>{
 const r=row.result,tags=[];if(!r){tags.push(row.deadlineExceeded?'owned-driver-deadline':'runner-report-unavailable');return tags;}
 const b=r.ownedBrowser??{};
 if(b.exitCode!==null&&b.exitCode!==undefined&&b.exitCode!==0)tags.push('native-nonzero-exit');
 if(b.signal)tags.push(['SIGTERM','SIGKILL'].includes(b.signal)?'owned-process-termination-signal':'native-crash-signal');
 if(r.phase==='browser-setup')tags.push('browser-setup-failure');
 if(r.unavailableRoutes?.length)tags.push('fixture-route-unavailable');
 if(/CDP connection closed|session.*(?:detach|closed)|target.*closed/i.test(r.error??''))tags.push('cdp-closure-or-detach');
 if(r.status==='passed')tags.push(r.harnessObserved===true&&r.nativeHarnessBranch===true&&r.nonzeroObservationsEnforced===true?'verified-native-harness-pass':'pass-integrity-gap');
 else if(r.status==='timeout')tags.push(r.harnessObserved?'observed-harness-timeout':'harness-unobserved-timeout');
 else if(r.status==='unobserved')tags.push(/no test observations|no assertions/i.test(r.error??'')?'zero-observation-harness':'harness-unobserved');
 else if(r.status==='failed'&&r.harnessObserved)tags.push('observed-application-assertion-failure');
 else if(r.status==='failed')tags.push('failure-before-harness-observation');
 if(/unknown.*(?:option|feature)|invalid.*(?:option|feature)|unsupported.*(?:option|feature)/i.test((r.error??'')+'\n'+(b.stderr??'')))tags.push('option-or-feature-setup-mismatch');
 return tags;
};
async function checkpoint(){const temp=join(out,'matrix.partial.json');await writeFile(temp,JSON.stringify(matrix,null,2)+'\n');await rename(temp,join(out,'matrix.json'));}
await checkpoint();
for(let index=0;index<map.fixtures.length;index++){
 if(stop)break;
 const fixture=map.fixtures[index],profile=map.profiles.find(x=>x.id===fixture.profile),stem=String(index).padStart(3,'0')+'-'+fixture.path.replaceAll('/','__');
 const report=join(out,'reports',stem+'.json'),stdout=join(out,'logs',stem+'.stdout.json'),stderr=join(out,'logs',stem+'.stderr.log');
 const args=[join(snapshot,'scripts/conformance.mjs'),'--root',fixtureRoot,'--binary',binary,'--isolate','--fixture-profile','upstream','--websocket-port','9584','--registration-map',mapFile,'--port','9582','--test',fixture.path,'--report',report];
 const fixtureStarted=Date.now(),stdoutStream=createWriteStream(stdout,{flags:'wx'}),stderrStream=createWriteStream(stderr,{flags:'wx'});
 let deadlineExceeded=false;
 const child=spawn(node,args,{cwd:snapshot,detached:true,stdio:['ignore','pipe','pipe']});current=child;
 child.stdout.pipe(stdoutStream);child.stderr.pipe(stderrStream);
 const deadline=setTimeout(()=>{deadlineExceeded=true;try{process.kill(-child.pid,'SIGTERM');}catch{}const force=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},2000);force.unref();},profile.sourceTimeoutMs+15000);
 const exit=await new Promise(resolve=>{child.once('error',error=>resolve({exitCode:null,signal:null,spawnError:error.message}));child.once('close',(exitCode,signal)=>resolve({exitCode,signal}));});clearTimeout(deadline);current=null;
 let raw=null,reportError=null;try{raw=JSON.parse(await readFile(report,'utf8'));}catch(error){reportError=error.message;}
 const result=raw?.results?.[0]??null;
 const row={index,path:fixture.path,fixtureSHA256:fixture.sha256,profile:fixture.profile,sourceProfile:profile,fixtureStartedAt:new Date(fixtureStarted).toISOString(),wallDurationMs:Date.now()-fixtureStarted,driver:{pid:child.pid,...exit,deadlineExceeded,args,report:relative(out,report),stdout:relative(out,stdout),stderr:relative(out,stderr)},reportError,result};
 row.deadlineExceeded=deadlineExceeded;row.taxonomy=taxonomy(row);row.originalStatus=result?.status??'runnerError';
 row.reportIntegrity={singleResult:raw?.results?.length===1,fixtureHashMatches:result?.sha256===fixture.sha256,sourceProfileMatches:result?.sourceProfile?.id===profile.id,budgetMatches:result?.configuration?.fixtureBudgetMs===profile.sourceTimeoutMs&&result?.configuration?.budgetKind==='source-registration',nativeBinaryMatches:raw?.binary?.sha256===provenance.binary.sha256,harnessHashMatches:raw?.sourceHarnessSHA256===map.fixtureAndSupportSHA256['src/browser/tests/testing.js']};
 if(Object.values(row.reportIntegrity).some(x=>!x))row.taxonomy.push('report-integrity-gap');
 matrix.results.push(row);matrix.counts.completed++;matrix.counts[row.originalStatus]++;if(row.taxonomy.includes('verified-native-harness-pass'))matrix.counts.verifiedHarnessPass++;
 const pc=matrix.profileCounts[fixture.profile];pc.completed++;pc[row.originalStatus]++;
 await checkpoint();
 if((index+1)%10===0||row.originalStatus!=='passed')console.log(`${index+1}/${map.fixtures.length} ${row.originalStatus.toUpperCase()} ${fixture.path} [${row.taxonomy.join(',')}] counts=${JSON.stringify(matrix.counts)}`);
}
const graphAfter={};for(const file of [...await filesUnder(join(snapshot,'scripts')),...await filesUnder(join(snapshot,'test')),join(snapshot,'package.json')])graphAfter[relative(snapshot,file)]=sha(await readFile(file));
matrix.finishedAt=new Date().toISOString();matrix.complete=matrix.counts.completed===map.fixtures.length;matrix.stoppedByRequest=stop;matrix.sourceAfter={mismatches:await verifySource()};matrix.helperAfterUnchanged=JSON.stringify(graph)===JSON.stringify(graphAfter);matrix.binaryAfterUnchanged=sha(await readFile(binary))===provenance.binary.sha256;
matrix.taxonomyCounts={};for(const row of matrix.results)for(const tag of row.taxonomy)matrix.taxonomyCounts[tag]=(matrix.taxonomyCounts[tag]??0)+1;
await checkpoint();console.log('FINISHED '+JSON.stringify({complete:matrix.complete,counts:matrix.counts,taxonomy:matrix.taxonomyCounts,sourceMismatches:matrix.sourceAfter.mismatches.length,helperUnchanged:matrix.helperAfterUnchanged}));
if(!matrix.complete||matrix.sourceAfter.mismatches.length||!matrix.helperAfterUnchanged||!matrix.binaryAfterUnchanged)process.exitCode=2;
