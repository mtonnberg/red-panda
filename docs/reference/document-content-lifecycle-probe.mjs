import http from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {startReference} from '../../scripts/reference-server.mjs';
import {connect} from '../../test/cdp-client.js';
const binary=process.argv[2],output=process.argv[3];if(!binary||!output)throw new Error('binary and fresh output path required');
const digest=b=>createHash('sha256').update(b).digest('hex');const binarySHA256=digest(await readFile(binary));
if(binary.includes('lightpanda')&&binarySHA256!=='9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f')throw new Error('Native digest mismatch');
const timeline=[],timers=new Set();let origin,reference,client,sequence=0;const started=performance.now();
const record=(kind,data={})=>timeline.push({sequence:++sequence,elapsedMs:Number((performance.now()-started).toFixed(3)),kind,...data});
const delay=ms=>new Promise(resolve=>{const timer=setTimeout(()=>{timers.delete(timer);resolve();},ms);timers.add(timer);});
const heldSource='console.log("audit-held-script",document.readyState);globalThis.__heldExecuted=42;';
const server=http.createServer((request,response)=>{
 record('http-request',{path:request.url});
 if(request.url==='/held.js'){
  record('held-script-waiting');const timer=setTimeout(()=>{timers.delete(timer);record('held-script-released');response.writeHead(200,{'Content-Type':'application/javascript'});response.end(heldSource);},300);timers.add(timer);return;
 }
 response.writeHead(200,{'Content-Type':'text/html'});response.end('<!doctype html><title>owned lifecycle control</title>');
});server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
const html=`<!doctype html><html><head><script>document.addEventListener('readystatechange',()=>console.log('audit-ready',document.readyState));document.addEventListener('DOMContentLoaded',()=>console.log('audit-domcontentloaded',document.readyState));window.addEventListener('load',()=>console.log('audit-load',document.readyState));console.log('audit-inline-start',document.readyState);</script><script src="${origin}/held.js"></script></head><body><p id="written">actual content</p><script>console.log('audit-inline-tail',document.readyState);</script></body></html>`;
let methodResult,finalState;
try{
 reference=await startReference(binary);client=await connect(reference.endpoint,{timeout:5000});
 const {browserContextId}=await client.send('Target.createBrowserContext');const{targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId});const{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 await client.send('Page.enable',{},sessionId);await client.send('Runtime.enable',{},sessionId);await client.send('Page.setLifecycleEventsEnabled',{enabled:true},sessionId);await client.send('Page.navigate',{url:origin+'/'},sessionId);await delay(150);
 const tree=await client.send('Page.getFrameTree',{},sessionId);const frameId=tree.frameTree.frame.id;
 client.socket.on('message',raw=>{const message=JSON.parse(raw);if(message.sessionId&&message.sessionId!==sessionId)return;if(message.method?.startsWith('Page.')||message.method==='Runtime.consoleAPICalled'||message.method==='Runtime.exceptionThrown'||message.id)record('cdp-message',{message});});
 record('setDocumentContent-send',{frameId});
 try{methodResult=await client.send('Page.setDocumentContent',{frameId,html},sessionId);record('setDocumentContent-response',{result:methodResult});}catch(error){methodResult={error:{code:error.code,message:error.message}};record('setDocumentContent-response',methodResult);}
 await delay(650);
 const state=await client.send('Runtime.evaluate',{expression:'JSON.stringify({readyState:document.readyState,held:globalThis.__heldExecuted??null,text:document.getElementById("written")?.textContent??null})',returnByValue:true},sessionId);
 finalState=state.result?.value?JSON.parse(state.result.value):state;record('final-state',{state:finalState});
 await client.send('Target.disposeBrowserContext',{browserContextId});
}finally{if(client)await client.close();if(reference)await reference.close();for(const timer of timers)clearTimeout(timer);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
await writeFile(output,JSON.stringify({scope:'Bounded non-heap native Page.setDocumentContent held-script lifecycle/response ordering; host timer releases script independently of CDP serialization',binary:{path:binary,sha256:binarySHA256},driverSHA256:digest(await readFile(new URL(import.meta.url))),htmlSHA256:digest(html),heldSourceSHA256:digest(heldSource),origin,methodResult,finalState,timeline},null,2)+'\n',{flag:'wx'});
