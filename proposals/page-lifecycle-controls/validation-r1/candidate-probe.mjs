// Native-first calibration only. No candidate engine imports or fixed answers.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {connect} from '../../test/cdp-client.js';

const [binary,output]=process.argv.slice(2);
if(!binary||!output)throw new Error('Usage: native-probe.mjs BINARY NEW_OUTPUT_JSON');
const began=Date.now(),ADMIN_MS=20000,COMMAND_MS=2000,LOAD_MS=2000;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(const key of ['NO_PROXY','no_proxy'])process.env[key]=[process.env[key],'127.0.0.1','localhost'].filter(Boolean).join(',');
let child,client,stderr='',failure,childExit,childSignal,origin,caseName='setup';
const wire=[],http=[],rows=[],held=new Map();
const stamp=()=>Date.now()-began;
const errorJSON=error=>({name:error.name,message:error.message,...(error.code!==undefined?{code:error.code}:{}),stack:error.stack});
const setup=(result,label)=>{if(result.error)throw new Error(label+': '+JSON.stringify(result.error));return result.result;};
const command=async(method,params={},sessionId)=>{
 try{return{result:await client.send(method,params,sessionId,{timeout:COMMAND_MS})};}
 catch(error){return{error:errorJSON(error)};}
};
const required=async(...args)=>setup(await command(...args),args[0]);
async function until(predicate,label,ms=LOAD_MS){
 const end=Date.now()+ms;
 while(!predicate()){
  if(Date.now()>=end)throw new Error(label+' original '+ms+'ms control deadline');
  await delay(5);
 }
}
const requestSeen=path=>http.some(row=>row.kind==='request'&&row.path===path);
const release=prefix=>{
 for(const[path,response]of held){
  if(!path.startsWith(prefix))continue;
  held.delete(path);http.push({kind:'release',path,at:stamp(),destroyed:response.destroyed});
  if(response.destroyed)continue;
  if(path.endsWith('/stream'))response.end('<script>globalThis.streamSuffix=true</script><p id=suffix>suffix</p></body></html>');
  else if(path.endsWith('.js'))response.end('globalThis.lateScript=(globalThis.lateScript||0)+1;');
  else response.end('<!doctype html><body>released real response</body>');
 }
};
const boot=name=>`globalThis.probeName=${JSON.stringify(name)};globalThis.probeEvents=[];globalThis.ticks=0;setInterval(()=>ticks++,25);for(const type of ['load','beforeunload','unload','pagehide'])addEventListener(type,()=>{probeEvents.push(type);console.log('lifecycle:'+probeName+':'+type)});document.addEventListener('readystatechange',()=>probeEvents.push('ready:'+document.readyState));globalThis.armTask=()=>setTimeout(()=>{probeEvents.push('task');fetch(${JSON.stringify('/'+name+'/task')}).catch(()=>{})},125);`;
const server=createServer((request,response)=>{
 const path=new URL(request.url,'http://fixture.invalid').pathname;
 http.push({kind:'request',path,at:stamp(),method:request.method});
 response.on('finish',()=>http.push({kind:'finish',path,at:stamp()}));
 response.on('close',()=>http.push({kind:'close',path,at:stamp(),finished:response.writableFinished}));
 request.on('aborted',()=>http.push({kind:'request-aborted',path,at:stamp()}));
 const name=path.split('/')[1];
 response.setHeader('content-type',path.endsWith('.js')?'text/javascript':'text/html');
 if(path.endsWith('/stable'))response.end('<!doctype html><html><head><script>'+boot(name)+'</script></head><body id=stable>stable '+name+'</body></html>');
 else if(path.endsWith('/resources'))response.end('<!doctype html><html><head><script>'+boot(name)+`globalThis.fetchResult='pending';fetch('/${name}/fetch').then(r=>r.text()).then(v=>fetchResult=v,e=>fetchResult=e.name+':'+e.message);globalThis.xhrEvents=[];globalThis.xhr=new XMLHttpRequest();for(const type of ['load','abort','error','loadend'])xhr.addEventListener(type,()=>xhrEvents.push(type));xhr.open('GET','/${name}/xhr');xhr.send();</script><script defer src="/${name}/defer.js"></script></head><body><iframe src="/${name}/frame"></iframe><p id=resources>resources</p></body></html>`);
 else if(path.endsWith('/stream')){
  response.flushHeaders();response.write('<!doctype html><html><head><script>'+boot(name)+`globalThis.streamPrefix=true;fetch('/${name}/prefix').catch(()=>{});</script></head><body><p id=prefix>prefix</p>`);held.set(path,response);
 }else if(['/pending','/fetch','/xhr','/frame','/defer.js'].some(suffix=>path.endsWith(suffix)))held.set(path,response);
 else response.end('observed');
});
const snapshotExpression=`JSON.stringify({href:location.href,ready:document.readyState,title:document.title,body:document.body?.textContent??null,name:globalThis.probeName??null,events:globalThis.probeEvents??[],ticks:globalThis.ticks??null,streamPrefix:globalThis.streamPrefix??false,streamSuffix:globalThis.streamSuffix??false,lateScript:globalThis.lateScript??0,fetchResult:globalThis.fetchResult??null,xhrEvents:globalThis.xhrEvents??[],xhrReady:globalThis.xhr?.readyState??null})`;
async function snapshot(page){
 const raw=await command('Runtime.evaluate',{expression:snapshotExpression,returnByValue:true},page.sessionId);
 let value;if(raw.result?.result?.value!==undefined)try{value=JSON.parse(raw.result.result.value);}catch{}
 return{raw,...(value!==undefined?{value}:{})};
}
async function createPage({enable=true}={}){
 const{targetId}=await required('Target.createTarget',{url:'about:blank'});
 const{sessionId}=await required('Target.attachToTarget',{targetId,flatten:true});
 if(enable){await required('Page.enable',{},sessionId);await required('Page.setLifecycleEventsEnabled',{enabled:true},sessionId);}
 await required('Runtime.enable',{},sessionId);await required('Network.enable',{},sessionId);
 return{targetId,sessionId};
}
async function stable(page,name){
 await required('Page.navigate',{url:origin+'/'+name+'/stable'},page.sessionId);
 const end=Date.now()+LOAD_MS;
 for(;;){const result=await snapshot(page);if(result.value?.ready==='complete'&&result.value?.name===name)return result;
  if(Date.now()>=end)throw new Error('Stable document original '+LOAD_MS+'ms load deadline');await delay(5);}
}
async function closeByTarget(page){return await command('Target.closeTarget',{targetId:page.targetId});}
async function run(name,fn){
 caseName=name;const begin=stamp(),wireStart=wire.length,httpStart=http.length;
 try{const observations=await fn();rows.push({name,begin,elapsedMS:stamp()-begin,observations,wire:wire.slice(wireStart),http:http.slice(httpStart)});}
 catch(error){rows.push({name,begin,elapsedMS:stamp()-begin,failure:errorJSON(error),wire:wire.slice(wireStart),http:http.slice(httpStart)});throw error;}
}
async function stopPending(name,{stream=false}={}){
 const page=await createPage(),before=await stable(page,name);
 let navigation;const navigating=command('Page.navigate',{url:origin+'/'+name+(stream?'/stream':'/pending')},page.sessionId).then(result=>{navigation=result;return result;});
 await until(()=>requestSeen('/'+name+(stream?'/stream':'/pending')),'real pending Document reached owned HTTP server');
 if(stream)await delay(40);
 const during=await snapshot(page),stop=await command('Page.stopLoading',{},page.sessionId);
 await delay(60);const afterStop=await snapshot(page),settledBeforeRelease=navigation!==undefined;
 release('/'+name+'/');await navigating;await delay(60);
 const afterRelease=await snapshot(page),recovery=await stable(page,name+'-recovery'),closed=await closeByTarget(page);
 return{before,during,stop,afterStop,settledBeforeRelease,navigation,afterRelease,recovery,closed};
}
async function resourcePage(name){
 const page=await createPage();let navigation;
 const navigating=command('Page.navigate',{url:origin+'/'+name+'/resources'},page.sessionId).then(result=>{navigation=result;return result;});
 await until(()=>['/fetch','/xhr','/defer.js','/frame'].every(suffix=>requestSeen('/'+name+suffix)),'actual fetch/XHR/defer/iframe requests');
 return{page,navigating,get navigation(){return navigation;}};
}
const guard=setTimeout(()=>{failure??={name:'AdministrativeDeadline',message:'Owned20s process watchdog'};client?.socket.terminate();child?.kill('SIGKILL');server.closeAllConnections();},ADMIN_MS);
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 child=spawn(binary,['serve','--host','127.0.0.1','--port',String(port),'--load-resources','iframe'],{stdio:['ignore','ignore','pipe']});
 child.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString()).slice(0,131072)});child.on('error',error=>{failure=errorJSON(error)});child.on('exit',(code,signal)=>{childExit=code;childSignal=signal;});
 const readinessEnd=Date.now()+10000;
 for(;;){if(failure||child.exitCode!==null||child.signalCode!==null)throw new Error('Native exited before readiness');try{if((await fetch('http://127.0.0.1:'+port+'/json/version',{signal:AbortSignal.timeout(200)})).ok)break;}catch{}if(Date.now()>=readinessEnd)throw new Error('Original10s Native readiness deadline');await delay(5);}
 client=await connect('ws://127.0.0.1:'+port+'/',{timeout:COMMAND_MS});
 client.socket.on('message',bytes=>wire.push({at:stamp(),case:caseName,raw:JSON.parse(bytes.toString())}));
 await run('root-close-before-context',()=>command('Page.close'));
 await run('root-stop-before-context',()=>command('Page.stopLoading'));
 await run('unknown-session-close',()=>command('Page.close',{},'not-an-owned-session'));
 await required('Target.setDiscoverTargets',{discover:true});
 await run('unknown-target-close',async()=>{const page=await createPage();const result=await command('Target.closeTarget',{targetId:'not-an-owned-target'});return{result,live:await snapshot(page),cleanup:await closeByTarget(page)};});
 await run('idle-stop-keeps-document-and-tasks',async()=>{
  const page=await createPage(),before=await stable(page,'idle-stop');await required('Runtime.evaluate',{expression:'globalThis.retainedDocument=document;armTask();true'},page.sessionId);
  const first=await command('Page.stopLoading',{},page.sessionId),second=await command('Page.stopLoading',{},page.sessionId);
  await delay(180);return{before,first,second,after:await snapshot(page),identity:await command('Runtime.evaluate',{expression:'retainedDocument===document',returnByValue:true},page.sessionId),taskHTTP:requestSeen('/idle-stop/task'),cleanup:await closeByTarget(page)};
 });
 await run('stop-pending-navigation-before-headers',()=>stopPending('pending-stop'));
 await run('stop-partial-document-stream',()=>stopPending('stream-stop',{stream:true}));
 await run('stop-real-defer-frame-fetch-xhr-cohort',async()=>{
  const pending=await resourcePage('resource-stop'),{page}=pending;const before=await snapshot(page);
  await required('Runtime.evaluate',{expression:'armTask();true'},page.sessionId);
  const stop=await command('Page.stopLoading',{},page.sessionId);await delay(180);const afterStop=await snapshot(page);
  const settledBeforeRelease=pending.navigation!==undefined;release('/resource-stop/');await pending.navigating;await delay(60);
  const afterRelease=await snapshot(page),taskHTTP=requestSeen('/resource-stop/task'),recovery=await stable(page,'resource-stop-recovery');
  return{before,stop,afterStop,settledBeforeRelease,navigation:pending.navigation,afterRelease,taskHTTP,recovery,cleanup:await closeByTarget(page)};
 });
 await run('close-idle-primary-and-auxiliary-sessions',async()=>{
  const page=await createPage();await stable(page,'close-idle');const auxiliary=await required('Target.attachToTarget',{targetId:page.targetId,flatten:true});
  await required('Runtime.enable',{},auxiliary.sessionId);await required('Runtime.evaluate',{expression:'armTask();true'},page.sessionId);
  const close=await command('Page.close',{},page.sessionId);await delay(180);
  return{close,primary:await snapshot(page),auxiliary:await command('Runtime.evaluate',{expression:'1',returnByValue:true},auxiliary.sessionId),repeat:await command('Page.close',{},page.sessionId),rootRepeat:await command('Page.close'),targetRepeat:await closeByTarget(page),targets:await command('Target.getTargets'),taskHTTP:requestSeen('/close-idle/task')};
 });
 await run('close-pending-navigation-before-headers',async()=>{
  const page=await createPage();await stable(page,'close-pending');let navigation;const navigating=command('Page.navigate',{url:origin+'/close-pending/pending'},page.sessionId).then(result=>{navigation=result;return result;});
  await until(()=>requestSeen('/close-pending/pending'),'close pending real Document request');const close=await command('Page.close',{},page.sessionId);await delay(60);const settledBeforeRelease=navigation!==undefined;
  release('/close-pending/');await navigating;return{close,settledBeforeRelease,navigation,oldSession:await snapshot(page),targets:await command('Target.getTargets')};
 });
 await run('close-real-resource-cohort-and-pending-task',async()=>{
  const pending=await resourcePage('resource-close'),{page}=pending;await required('Runtime.evaluate',{expression:'armTask();true'},page.sessionId);
  const close=await command('Page.close',{},page.sessionId);await delay(180);const settledBeforeRelease=pending.navigation!==undefined;
  release('/resource-close/');await pending.navigating;return{close,settledBeforeRelease,navigation:pending.navigation,taskHTTP:requestSeen('/resource-close/task'),oldSession:await snapshot(page),targets:await command('Target.getTargets')};
 });
 await run('close-without-page-enable',async()=>{const page=await createPage({enable:false});return{close:await command('Page.close',{},page.sessionId),oldSession:await snapshot(page),targets:await command('Target.getTargets')};});
}catch(error){failure??=errorJSON(error);}
finally{
 client?.socket.terminate();
 if(child?.pid&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}
 server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve));clearTimeout(guard);
 await writeFile(output,JSON.stringify({scope:'Candidate replay of exact Native12 lifecycle observations; no parity assertions',binary,binarySHA256:sha(await readFile(binary)),driverSHA256:sha(await readFile(new URL(import.meta.url))),clientSHA256:sha(await readFile(new URL('../../test/cdp-client.js',import.meta.url))),profile:['serve','--host','127.0.0.1','--port','ephemeral','--load-resources','iframe'],budgets:{administrative:ADMIN_MS,command:COMMAND_MS,load:LOAD_MS,readiness:10000},elapsedMS:stamp(),expectedScenarios:12,rows,wire,http,failure,childExit,childSignal,stderr},null,2)+'\n',{flag:'wx'});
}
if(failure||rows.length!==12||rows.some(row=>row.failure))process.exitCode=1;
