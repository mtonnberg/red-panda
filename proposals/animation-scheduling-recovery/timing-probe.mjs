// UNRUN preparation. Each engine is a separate process; no shared patched CJS.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createFixture} from '../../test/fixture.js';
import {startReference} from '../../scripts/reference-server.mjs';
import {connect} from '../../test/cdp-client.js';
const [mode,output]=process.argv.slice(2),began=performance.now(),hash=value=>createHash('sha256').update(value).digest('hex');
if(!['Root','baseline','Native'].includes(mode))throw Error('Root, baseline or Native engine required');
const template=await readFile(new URL('./timing-expression.js',import.meta.url),'utf8'),steps=[],rows=[];
let browser,reference,client,fixture,error;
for(const key of['NO_PROXY','no_proxy'])process.env[key]=[process.env[key],'127.0.0.1','localhost'].filter(Boolean).join(',');
const guard=setTimeout(()=>{client?.socket.terminate();reference?.process.kill('SIGKILL');fixture?.server.closeAllConnections()},15000);
try{
 fixture=await createFixture();
 if(mode==='Native'){
  reference=await startReference('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux',{args:['--load-resources','iframe','--load-resources','worker']});client=await connect(reference.endpoint,{timeout:10000});
 }else{
  const base=mode==='Root'?'/workspace/red-panda':'/workspace/shared/phase25-failure-baseline-ece1';steps.push({name:'before-engine-import',at:performance.now()-began});
  const{Browser}=await import(pathToFileURL(base+'/src/browser.js'));steps.push({name:'after-engine-import',at:performance.now()-began});browser=new Browser({timeout:10000,loadResources:['iframe','worker']});
 }
 for(const blockMS of[0,20]){
  const expression=template.replace('__BLOCK_MS__',String(blockMS)),start=performance.now();let result;
  if(client){
   const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});await client.send('Page.enable',{},sessionId);await client.send('Runtime.enable',{},sessionId);await client.send('Page.navigate',{url:fixture.url},sessionId);
   const end=Date.now()+10000;for(;;){const value=await client.send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true},sessionId);if(value.result.value==='complete')break;if(Date.now()>=end)throw Error('Original10s page-load deadline');await new Promise(r=>setTimeout(r,5));}
   result=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);await client.send('Target.closeTarget',{targetId});
  }else{
   const page=browser.createPage();await page.navigate('data:text/html,<body>animations</body>');await page.navigate(fixture.url);result={result:{value:JSON.parse(JSON.stringify(await page.evaluate(expression)))}};page.close();
  }
  rows.push({blockMS,expressionSHA256:hash(expression),milliseconds:performance.now()-start,result});
 }
}catch(e){error={name:e.name,message:e.message,stack:e.stack}}
finally{browser?.close();await client?.close();await reference?.close();await fixture?.close();clearTimeout(guard);await writeFile(output,JSON.stringify({scope:'Separate diagnostic timestamp/controlledblockedloop, not unchangedoracle acceptance',mode,nodePID:process.pid,referencePID:reference?.process.pid,childExit:reference?.process.exitCode,childSignal:reference?.process.signalCode,stderr:reference?.stderr,templateSHA256:hash(template),steps,rows,error,milliseconds:performance.now()-began,commandLoadBudgetsMS:10000,externalWatchdogMS:15000},null,2)+'\n',{flag:'wx'})}
if(error)process.exitCode=1;
