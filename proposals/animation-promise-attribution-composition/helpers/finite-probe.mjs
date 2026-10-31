import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createFixture} from '../test/fixture.js';
import {startReference} from '../scripts/reference-server.mjs';
import {connect} from '../test/cdp-client.js';
const[mode,workload,output]=process.argv.slice(2),began=performance.now(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(!['candidate','Native'].includes(mode)||!['timing','events','reactions'].includes(workload))throw Error('candidate|Native timing|events NEW_OUTPUT_JSON');
const template=await readFile(new URL(workload==='timing'?'./timing-expression.js':workload==='events'?'./event-order-expression.js':'./reaction-boundary-expression.js',import.meta.url),'utf8'),rows=[],checkpointCalls=[];
let browser,client,reference,fixture,error;
for(const key of['NO_PROXY','no_proxy'])process.env[key]=[process.env[key],'127.0.0.1','localhost'].filter(Boolean).join(',');
const guard=setTimeout(()=>{client?.socket.terminate();reference?.process.kill('SIGKILL');fixture?.server.closeAllConnections()},15000);
try{
 fixture=await createFixture();
 if(mode==='Native'){reference=await startReference('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux',{args:['--load-resources','iframe','--load-resources','worker']});client=await connect(reference.endpoint,{timeout:10000});}
 else{const{Browser}=await import(new URL('../src/browser.js',import.meta.url));const{getRuntimeBinding}=await import(new URL('../src/native-runtime.js',import.meta.url));const actual=getRuntimeBinding(),binding={...actual,checkpoint(){const result=actual.checkpoint();checkpointCalls.push(result);return result}};browser=new Browser({timeout:10000,loadResources:['iframe','worker'],runtimeBinding:binding});}
 for(const blockMS of workload==='timing'?[0,20]:[null]){
  const expression=blockMS===null?template:template.replace('__BLOCK_MS__',String(blockMS));let result;
  if(client){
   const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});await client.send('Page.enable',{},sessionId);await client.send('Runtime.enable',{},sessionId);await client.send('Page.navigate',{url:fixture.url},sessionId);
   const end=Date.now()+10000;for(;;){const ready=await client.send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true},sessionId);if(ready.result.value==='complete')break;if(Date.now()>=end)throw Error('Original10s page-load deadline');await new Promise(r=>setTimeout(r,5))}
   result=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);await client.send('Target.closeTarget',{targetId});
  }else{const page=browser.createPage();await page.navigate('data:text/html,<body>animations</body>');await page.navigate(fixture.url);result={result:{value:JSON.parse(JSON.stringify(await page.evaluate(expression)))}};page.close();}
  rows.push({blockMS,sourceSHA256:sha(expression),result});
 }
}catch(e){error={name:e.name,message:e.message,stack:e.stack}}
finally{browser?.close();await client?.close();await reference?.close();await fixture?.close();clearTimeout(guard);await writeFile(output,JSON.stringify({scope:'R2 attribution plus R3 checkpoint composition diagnostic; originaloracle unchanged',mode,workload,nodePID:process.pid,referencePID:reference?.process.pid,childExit:reference?.process.exitCode,childSignal:reference?.process.signalCode,stderr:reference?.stderr,templateSHA256:sha(template),checkpointCalls,rows,error,milliseconds:performance.now()-began,commandLoadBudgetsMS:10000,outerWatchdogMS:15000},null,2)+'\n',{flag:'wx'})}
if(error||rows.some(row=>row.result.exceptionDetails))process.exitCode=1;
