import http from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {startReference} from '/workspace/red-panda/scripts/reference-server.mjs';
import {connect} from '/workspace/red-panda/test/cdp-client.js';

const target=process.argv[2],out=process.argv[3],binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const wire=[],counts=new Map();let sequence=0,originA,originB,service,client,failure;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function endpoint(label){return http.createServer(async(request,response)=>{
 const url=new URL(request.url,'http://127.0.0.1'),token=++sequence;
 let body='';for await(const chunk of request)body+=chunk;
 const record={label,url:request.url,method:request.method,body,headers:request.headers,token,started:Date.now()};wire.push(record);
 const send=(status,body,headers={})=>{record.status=status;record.completed=Date.now();response.writeHead(status,headers);response.end(body)};
 if(url.pathname==='/probe'){
  const allowed=[originA,originB].includes(request.headers.origin)?request.headers.origin:null;
  return send(200,JSON.stringify({label,origin:request.headers.origin??null,referer:request.headers.referer??null,method:request.method,body}),{'content-type':'application/json',...(allowed?{'access-control-allow-origin':allowed,'access-control-allow-credentials':'true','vary':'Origin'}:{})});
 }
 const key=label+request.url,count=(counts.get(key)??0)+1;counts.set(key,count);
 if(url.pathname==='/redirect-reload'&&count>1)return send(302,'',{'location':originA+'/reload-final?'+url.searchParams,'cache-control':'no-store'});
 if((url.pathname==='/reload'||url.pathname==='/redirect-reload')&&count>1)await delay(60);
 const cross=url.pathname==='/principal';
 const script=`globalThis.actualToken=${token};globalThis.actualLabel=${JSON.stringify(label)};globalThis.documentAtParse=document;globalThis.objectAtParse=Object;try{localStorage.setItem('principal-marker',${JSON.stringify(label)})}catch(e){globalThis.storageSeedError={name:e.name,message:e.message}}`;
 const children=cross?`<iframe name="same" src="${originA}/frame-a"></iframe><iframe name="foreign" src="${originB}/frame-b"></iframe>`:'';
 send(200,'<!doctype html><title>'+label+':'+url.pathname+'</title><script>'+script+'</script><body>'+children,{'content-type':'text/html','cache-control':'no-store'});
})}
const serverA=endpoint('A'),serverB=endpoint('B');serverA.listen(0,'127.0.0.1');serverB.listen(0,'127.0.0.1');await Promise.all([once(serverA,'listening'),once(serverB,'listening')]);originA='http://127.0.0.1:'+serverA.address().port;originB='http://127.0.0.1:'+serverB.address().port;
const observations=[];
const entry=`e=>e&&({url:e.url,key:e.key,id:e.id,index:e.index,sameDocument:e.sameDocument,state:(()=>{try{return{value:e.getState()}}catch(x){return{name:x.name,message:x.message}}})()})`;
const reloadExpression=(name,cancel,explicit)=>`(()=>{
 const rows=[],before=navigation.currentEntry,controller={committed:'pending',finished:'pending'};globalThis.actualReloadState=controller;
 const capture=fn=>{try{return{value:fn()}}catch(e){return{name:e.name,message:e.message,realm:e instanceof DOMException}}};
 let actualEvent;globalThis.savedDocument=document;globalThis.savedObject=Object;
 for(const type of['navigate','currententrychange','navigateerror','navigatesuccess'])navigation.addEventListener(type,e=>{
  if(type==='navigate'){actualEvent=e;rows.push({type,destination:{url:e.destination.url,key:e.destination.key,id:e.destination.id,index:e.destination.index,sameDocument:e.destination.sameDocument,state:capture(()=>e.destination.getState())},navigationType:e.navigationType,info:e.info,beforeState:capture(()=>history.state),beforeEntry:capture(()=>navigation.currentEntry.getState())});${cancel?'e.preventDefault();':''}}
  else rows.push({type,navigationType:e.navigationType,fromSame:e.from===before,state:capture(()=>history.state),entry:capture(()=>navigation.currentEntry.getState()),error:e.error&&{name:e.error.name,message:e.error.message,same:e.error===actualEvent.signal.reason}});
 });
 const options=${explicit==='none'?`{info:{case:${JSON.stringify(name)}}}`:explicit==='undefined'?`{state:undefined,info:{case:${JSON.stringify(name)}}}`:`{state:{actual:${JSON.stringify(name)}},info:{case:${JSON.stringify(name)}}}`};
 navigation.updateCurrentEntry({state:{initial:1}});rows.length=0;
 const result=navigation.reload(options);
 result.committed.then(()=>controller.committed='resolved',e=>controller.committed={name:e.name,message:e.message});
 result.finished.then(()=>controller.finished='resolved',e=>controller.finished={name:e.name,message:e.message});
 Promise.resolve().then(()=>controller.microtask={rows:rows.map(x=>x.type),state:capture(()=>history.state),entry:capture(()=>navigation.currentEntry.getState())});
 return{rows,url:location.href,state:capture(()=>history.state),entry:(${entry})(navigation.currentEntry),sameEntry:navigation.currentEntry===before,promises:{committed:result.committed instanceof Promise,finished:result.finished instanceof Promise,distinct:result.committed!==result.finished},aborted:actualEvent?.signal.aborted,controller};
})()`;
const stateExpression=`JSON.stringify({url:location.href,token:globalThis.actualToken,readyState:document?.readyState,oldState:globalThis.actualReloadState,sameDocument:document===globalThis.savedDocument,sameObject:Object===globalThis.savedObject})`;
const finalExpression=`JSON.stringify({url:location.href,token:globalThis.actualToken,label:globalThis.actualLabel,state:(()=>{try{return{value:history.state}}catch(e){return{name:e.name,message:e.message}}})(),entry:(${entry})(navigation.currentEntry),activation:navigation.activation&&{entry:(${entry})(navigation.activation.entry),from:(${entry})(navigation.activation.from),type:navigation.activation.navigationType},navigationType:performance.getEntriesByType('navigation')[0]?.type})`;
const principalExpression=mode=>`(async()=>{
 const same=document.querySelector('iframe[name=same]').contentWindow,foreign=document.querySelector('iframe[name=foreign]').contentWindow,doc=document,O=Object;
 const held=localStorage,heldSession=sessionStorage;heldSession.setItem('session-marker','A');
 const attempt=fn=>{try{return{value:fn()}}catch(e){return{name:e.name,message:e.message,realm:e instanceof DOMException}}};
 const snapshot=()=>({url:location.href,locationOrigin:location.origin,windowOrigin:globalThis.origin,documentOrigin:document.origin,documentURL:document.URL,baseURI:document.baseURI,referrer:document.referrer,sameDocument:document===doc,sameObject:Object===O,token:actualToken,storage:attempt(()=>localStorage.getItem('principal-marker')),session:attempt(()=>sessionStorage.getItem('session-marker')),held:attempt(()=>held.getItem('principal-marker')),storageSame:attempt(()=>localStorage===held),sessionSame:attempt(()=>sessionStorage===heldSession),sameFrame:attempt(()=>same.document.URL),foreignFrame:attempt(()=>foreign.document.URL)});
 const before=snapshot();history.${mode}State({actual:${JSON.stringify(mode)}},'',${JSON.stringify(originB+'/rewritten-'+mode)});const after=snapshot();
 const requests=[];for(const [name,url]of[['A',${JSON.stringify(originA+'/probe')}],['B',${JSON.stringify(originB+'/probe')}]]){try{requests.push({name,response:await(await fetch(url,{method:'POST',headers:{'content-type':'text/plain'},body:'principal-'+${JSON.stringify(mode)}+'-'+name,credentials:'include'})).json()})}catch(e){requests.push({name,error:{name:e.name,message:e.message,realm:e instanceof TypeError}})}}
 held.setItem('held-write','from-old-front');const write={held:attempt(()=>held.getItem('held-write')),fresh:attempt(()=>localStorage.getItem('held-write')),sameFrame:attempt(()=>same.localStorage.getItem('held-write')),foreignFrame:attempt(()=>foreign.localStorage.getItem('held-write'))};
 return{before,after,requests,write,entry:(${entry})(navigation.currentEntry)};
})()`;
async function evaluate(send,expression,awaitPromise=false){return send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise})}
function decoded(response){if(response?.result?.type==='string'){try{return JSON.parse(response.result.value)}catch{}}return undefined}
async function ownedCase(name,path,expression,{cancel=false,principal=false,initial=false}={}){
 const start=wire.length,row={name};let browserContextId;
 try{
  ({browserContextId}=await client.send('Target.createBrowserContext'));const{targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
  const send=(m,p={})=>client.send(m,p,sessionId);await send('Page.enable');await send('Runtime.enable');
  if(initial){row.before=await evaluate(send,`JSON.stringify({url:location.href,body:document?.body?.tagName,activation:navigation.activation,entries:navigation.entries().map(${entry}),canGoBack:navigation.canGoBack,canGoForward:navigation.canGoForward})`)}
  else{await send('Page.navigate',{url:originA+path+'?case='+encodeURIComponent(name)});for(let i=0;i<100;i++){
   const ready=await evaluate(send,principal?`Boolean(globalThis.actualToken)&&document.querySelectorAll('iframe').length===2&&document.querySelector('iframe[name=same]').contentDocument?.readyState==='complete'&&document.querySelector('iframe[name=foreign]').contentWindow.length===0&&document.readyState==='complete'`:`Boolean(globalThis.actualToken)&&document.readyState==='complete'`);
   if(ready.result?.value)break;if(i===99)throw Error('Actual initial document readiness deadline');await delay(10);
  }}
  const beforeToken=initial?undefined:(await evaluate(send,'globalThis.actualToken')).result?.value;
  row.oldGlobal=(await send('Runtime.evaluate',{expression:'globalThis',returnByValue:false})).result;
  row.result=await evaluate(send,'(async()=>JSON.stringify(await ('+expression+')))()',true);
  if(!principal&&!initial){await delay(10);row.mid=await evaluate(send,stateExpression);if(!cancel)for(let i=0;i<100;i++){
   const ready=await evaluate(send,`Boolean(globalThis.actualToken)&&globalThis.actualToken!==${JSON.stringify(beforeToken)}&&document.readyState==='complete'`);
   if(ready.result?.value)break;if(i===99){row.finalReadinessDeadline=true;break}await delay(10);
  }await delay(10);row.final=await evaluate(send,finalExpression)}
  if(name==='reload-twice'){
   const token=(await evaluate(send,'globalThis.actualToken')).result?.value;
   row.second=await evaluate(send,`JSON.stringify((()=>{navigation.reload();return{url:location.href,entry:navigation.currentEntry.url}})())`);
   for(let i=0;i<100;i++){const ready=await evaluate(send,`Boolean(globalThis.actualToken)&&globalThis.actualToken!==${JSON.stringify(token)}&&document.readyState==='complete'`);if(ready.result?.value)break;if(i===99){row.secondReadinessDeadline=true;break}await delay(10)}
   row.secondFinal=await evaluate(send,finalExpression);
  }
  row.tree=await send('Page.getFrameTree');
  if(row.oldGlobal?.objectId){try{row.retained=await send('Runtime.callFunctionOn',{objectId:row.oldGlobal.objectId,functionDeclaration:"function(){return JSON.stringify({url:this.location.href,token:this.actualToken,label:this.actualLabel,state:this.actualReloadState})}",returnByValue:true})}catch(e){row.retainedFailure={name:e.name,message:e.message}}}
 }catch(e){row.failure={name:e.name,message:e.message,stack:e.stack}}finally{
  row.wire=wire.slice(start);if(browserContextId)try{await client.send('Target.disposeBrowserContext',{browserContextId})}catch(e){row.disposeFailure=e.message}observations.push(row);
 }
}
try{
 if(target==='native')service=await startReference(binary,{args:['--load-resources','iframe']});
 else{const{serve}=await import(pathToFileURL(resolve(target,'src/cdp.js')));service=await serve({port:0,loadResources:['iframe']});service.endpoint='ws://127.0.0.1:'+service.port+'/'}
 client=await connect(service.endpoint);
 await ownedCase('reload-twice','/redirect-reload',"(()=>{navigation.updateCurrentEntry({state:{kept:1}});navigation.reload();return{url:location.href,entry:navigation.currentEntry.url}})()");
}catch(e){failure={name:e.name,message:e.message,stack:e.stack}}finally{
 await client?.close();await service?.close();for(const server of[serverA,serverB]){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
 const sha=x=>createHash('sha256').update(x).digest('hex');await writeFile(out,JSON.stringify({target,originA,originB,helperSHA256:sha(await readFile(new URL(import.meta.url))),binarySHA256:sha(await readFile(binary)),observations,failure},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({rows:observations.length,failure}));
}
