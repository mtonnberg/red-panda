import http from 'node:http';
import {once} from 'node:events';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startReference} from '../../../scripts/reference-server.mjs';
import {connect} from '../../../test/cdp-client.js';
const requests=[],worker=`let count=0;onconnect=e=>{const port=e.ports[0];port.onmessage=()=>port.postMessage(++count)}`;
const server=http.createServer((request,response)=>{requests.push(request.url);response.setHeader('content-type',request.url==='/worker.js'?'text/javascript':'text/html');response.end(request.url==='/worker.js'?worker:'<!doctype html><body>Utility shared worker')});
server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
try{
 for(const [name,binary]of[['native','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux'],['candidate','/workspace/red-panda/bin/red-panda.js']]){
  let browser,client;
  try{
   browser=await startReference(binary,{args:['--load-resources','worker']});client=await connect(browser.endpoint);
   const {targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true}),send=(m,p)=>client.send(m,p,sessionId);
   await send('Page.enable');await send('Runtime.enable');const navigation=await send('Page.navigate',{url:origin+'/doc'});
   const world=await send('Page.createIsolatedWorld',{frameId:navigation.frameId,worldName:'shared-utility-probe'});
   const expression=`(async()=>{const surface=[typeof SharedWorker,typeof MessageChannel,typeof MessagePort];if(typeof SharedWorker!=='function')return JSON.stringify({surface});const actor=new SharedWorker('/worker.js','utility');try{const message=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('owned utility deadline')),6000);actor.port.onmessage=e=>{clearTimeout(timer);resolve([e.data,e.isTrusted,e.target===actor.port,actor.port instanceof MessagePort])};actor.port.postMessage('actual')});return JSON.stringify({surface,message,constructor:Object.getPrototypeOf(SharedWorker)===EventTarget,portMethod:Object.getPrototypeOf(MessagePort.prototype.postMessage)===Function.prototype})}finally{actor.port.close()}})()`;
   const result=await send('Runtime.evaluate',{expression,contextId:world.executionContextId,returnByValue:true,awaitPromise:true});
   await writeFile(new URL(name+'.json',import.meta.url),JSON.stringify({name,binary,binarySHA256:createHash('sha256').update(await readFile(binary)).digest('hex'),worker,origin,navigation,world,expression,result,requests:[...requests],stderr:browser.stderr,boundary:'Authored ephemeral utility observation only; not a source fixture or physical creation-context proof.'},null,2)+'\n',{flag:'wx'});
   console.log(JSON.stringify({name,result}));
  }finally{await client?.close();await browser?.close()}
 }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
