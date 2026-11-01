// Owned localhost causal control. sourceRoot is a trusted Host harness argument,
// never a browser global, page-chosen realm or implementation fallback.
import http from'node:http';import{once}from'node:events';import{createHash}from'node:crypto';import{access}from'node:fs/promises';import{pathToFileURL}from'node:url';import{resolve}from'node:path';
const sha=value=>createHash('sha256').update(value).digest('hex');
function error(value,depth=0){const result={name:value?.name,message:value?.message,stack:value?.stack};if(depth<2){if(value?.detail)result.detail=error(value.detail,depth+1);if(value?.cause)result.cause=error(value.cause,depth+1)}return result}
async function bound(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Original2000ms '+label)),2000)})])}finally{clearTimeout(timer)}}
export async function runBlockingFrameProbe(sourceRoot,mode='normal'){
 const root=resolve(sourceRoot),{Browser}=await import(pathToFileURL(root+'/src/browser.js').href),{platformFactoryRecord}=await import(pathToFileURL(root+'/src/platform-factories.js').href);
 let inspect=null;try{await access(root+'/src/initial-network-load.js');inspect=(await import(pathToFileURL(root+'/src/initial-network-load.js').href)).inspectInitialNetworkLoad}catch(e){if(e.code!=='ENOENT')throw e}
 const source='globalThis.actualBlockingValue=42;globalThis.actualBlockingOrder.push("script");'+(mode==='extra-close'?'document.close();globalThis.actualBlockingOrder.push("actual parser-script close");':'');
 const child='<!doctype html><script>globalThis.actualBlockingOrder=[];</script><script src="/script.js"></script><p id=tail>real parser tail</p>';
 const httpTrace=[],pageErrors=[],frameErrors=[],requests=[],responses=[],failures=[];let held,arrive,loaded=false;const arrived=new Promise(r=>arrive=r);
 const server=http.createServer((request,response)=>{
  httpTrace.push({kind:'request',path:request.url});
  const send=(mime,bytes)=>{const body=Buffer.from(bytes);response.writeHead(200,{'content-type':mime});response.once('finish',()=>httpTrace.push({kind:'responseFinished',path:request.url,bytes:body.length,SHA256:sha(body)}));response.end(body)};
  if(request.url==='/script.js'){held={response,send};response.once('close',()=>httpTrace.push({kind:'heldSocketClosed'}));arrive();return}
  send('text/html; charset=utf-8',request.url==='/child'?child:'<!doctype html><body><p>real parent</p>');
 });server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port,origin='http://127.0.0.1:'+port;
 console.log('actual-blocking-fixture '+JSON.stringify({pid:process.pid,port,sourceRoot:root,mode}));
 let browser,page,result;
 try{
 browser=new Browser({timeout:1000,loadResources:['iframe']});page=browser.createPage();
 page.on('pageError',v=>pageErrors.push(error(v)));page.on('framePageError',v=>pageErrors.push({frameId:v.frameId,...error(v.error)}));page.on('frameNavigationError',v=>frameErrors.push({frameId:v.frameId,...error(v.error)}));
 page.on('request',v=>requests.push({id:v.id,type:v.type,url:v.url}));page.on('response',v=>responses.push({id:v.id,type:v.type,url:v.url,status:v.status}));page.on('requestFailed',v=>failures.push({id:v.id,message:v.message}));
 page.newDocumentScripts.set('owned-blocking-observer',{source:`globalThis.actualBlockingLifecycle=[];for(const type of ['readystatechange','DOMContentLoaded','load'])document.addEventListener(type,e=>actualBlockingLifecycle.push([type,e.isTrusted,document.readyState]));addEventListener('load',e=>actualBlockingLifecycle.push(['window',e.isTrusted,document.readyState]));addEventListener('pageshow',e=>actualBlockingLifecycle.push(['pageshow',e.isTrusted,document.readyState]));`});
  await page.navigate(origin+'/parent');const parent=page.dom.window,f=parent.document.createElement('iframe');f.src=origin+'/child';let done;const actualLoaded=new Promise(r=>done=r);f.addEventListener('load',()=>{loaded=true;done()});f.addEventListener('error',event=>frameErrors.push({kind:'actualFrameElementError',trusted:event.isTrusted,message:event.message??null}));parent.document.body.append(f);
  await bound(arrived,'actual blocking script request arrival');
  function snapshot(){const w=f.contentWindow,d=w.document,impl=platformFactoryRecord(d).implementation,owner=page.frames.findElement(f);return{documentState:d.readyState,tail:d.getElementById('tail')?.textContent??null,scriptValue:w.actualBlockingValue??null,actualOrder:w.actualBlockingOrder?Array.from(w.actualBlockingOrder):null,lifecycle:Array.from(w.actualBlockingLifecycle??[],x=>Array.from(x)),ownerCurrent:owner.record.document===d,ownerRetired:owner.retired,signalAborted:owner.documentAbort.signal.aborted,requestManagerSize:impl._requestManager.size(),queue:{paused:impl._queue.paused,tailPresent:!!impl._queue.tail},defer:{paused:impl._deferQueue.paused,tailPresent:!!impl._deferQueue.tail},asyncCount:impl._asyncQueue.count(),initial:inspect?inspect(impl):{supported:false,historical646:true}}}
  const beforeRelease=snapshot();held.send('text/javascript',source);let loadFailure=null;try{await bound(actualLoaded,'actual iframe load after real script release')}catch(e){loadFailure=error(e)}await new Promise(r=>setImmediate(r));
  result={mode,configuration:{BrowserTimeoutMs:1000,actualLoadBarrierMs:2000,originalCaseMs:8000},sourceRoot:root,port,sourceBytes:{child:Buffer.byteLength(child),childSHA256:sha(child),script:Buffer.byteLength(source),scriptSHA256:sha(source)},beforeRelease,afterRelease:snapshot(),loaded,loadFailure,pageErrors,frameErrors,httpTrace,requests,responses,failures,parentQuery:page.evaluate('6*7')};
 }finally{
  await browser?.close();held?.response.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));
 }
 result.actualOwnedClose=true;return result;
}
