import{test}from'node:test';
import assert from'node:assert/strict';
import http from'node:http';
import{once}from'node:events';
import{Browser}from'../src/browser.js';
import{serve}from'../src/cdp.js';
import{WebSocket}from'ws';
import{initializeURLBlockConnection,registerURLBlockContext,urlBlockOwnerForConnection,registerURLBlockPage,setBlockedURLs,assertURLAllowed,urlBlockedError}from'../src/url-blocking.js';
class ProtocolError extends Error{constructor(message,code){super(message);this.code=code}}
function policyFixture(t){const browser=new Browser(),connection={browser};initializeURLBlockConnection(connection);const id=browser.createContext(),context=browser.contexts.get(id);registerURLBlockContext(connection,context);const page=browser.createPage(id,{urlBlockOwner:urlBlockOwnerForConnection(connection)});t.after(()=>browser.close());return{browser,connection,page,set:patterns=>setBlockedURLs(connection,page,{urlPatterns:patterns},ProtocolError)}}
const blocked=(page,url)=>{try{assertURLAllowed(page,url);return false}catch(error){assert.ok(urlBlockedError(error));assert.equal(error.message,'UrlBlocked');return true}};
test('URL admission uses anchored ASCII matching, literal punctuation and ordered decisions',t=>{
 const{page,set}=policyFixture(t),origin='https://heldout.example';
 for(const[patterns,url,result]of[
  [[{urlPattern:'*eXample/assets/**A*.jS?rev=*',block:true}],origin+'/assets/sub/AA.js?rev=3',true],
  [[{urlPattern:origin+'/x?y',block:true}],origin+'/xZy',false],
  [[{urlPattern:origin+'/exact',block:true}],origin+'/exact-tail',false],
  [[{urlPattern:'',block:true}],origin+'/',false],
  [[{urlPattern:'*/safe/*',block:false},{urlPattern:'*',block:true}],origin+'/safe/a',false],
  [[{urlPattern:'*',block:true},{urlPattern:'*/safe/*',block:false}],origin+'/safe/a',true],
  [[{urlPattern:'**/*literal*tail',block:true}],origin+'/*literal*tail',true]
 ]){set(patterns);assert.equal(blocked(page,url),result,url)}
});
test('URL program conversion is atomic and genuine denial authority ignores copied data and proxies',t=>{
 const{page,set,connection}=policyFixture(t);set([{urlPattern:'*/held/*',block:true}]);
 assert.throws(()=>setBlockedURLs(connection,page,{urlPatterns:[{urlPattern:'*',block:false},{urlPattern:'*',block:2}]},ProtocolError),{message:'UnexpectedToken',code:-31998});assert.equal(blocked(page,'https://actual.example/held/value'),true);
 assert.throws(()=>setBlockedURLs(connection,page,{},ProtocolError),{message:'MissingField'});
 let reads=0;const fake=new Proxy({message:'UrlBlocked',blockedReason:'inspector'},{get(){reads++;throw Error('authored')}});assert.equal(urlBlockedError(fake),false);assert.equal(reads,0);
 set([]);assert.equal(blocked(page,'https://actual.example/held/value'),false);
});
test('Connection rules persist through actual context replacement and isolate independent connections',t=>{
 const{browser,connection,page,set}=policyFixture(t);set([{urlPattern:'*/owned/*',block:true}]);const other={browser};initializeURLBlockConnection(other);const id=browser.createContext(),context=browser.contexts.get(id);registerURLBlockContext(other,context);const independent=browser.createPage(id,{urlBlockOwner:urlBlockOwnerForConnection(other)});
 assert.equal(blocked(independent,'https://actual.example/owned/a'),false);browser.disposeContext(page.context.id);const next=browser.createContext(),nextContext=browser.contexts.get(next);registerURLBlockContext(connection,nextContext);const replacement=browser.createPage(next,{urlBlockOwner:urlBlockOwnerForConnection(connection)});assert.equal(blocked(replacement,'https://actual.example/owned/a'),true);
});
async function fixture(t){
 const receipts=[],server=http.createServer((req,res)=>{receipts.push(req.url);res.setHeader('cache-control','no-store');if(req.url==='/redirect'){res.writeHead(302,{location:'/denied/destination'});res.end();return}if(req.url.startsWith('/worker.js')){res.setHeader('content-type','text/javascript');res.end('fetch("/denied/worker-fetch").then(r=>r.text()).then(value=>postMessage({ok:true,value}),e=>postMessage({ok:false,name:e.name,message:e.message}));');return}res.setHeader('content-type','text/html');res.end('<!doctype html><p>Actual response 🐼</p>')});
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const endpoint=await serve({port:0,timeout:1500,loadResources:['worker']});t.after(()=>endpoint.close());const socket=new WebSocket('ws://127.0.0.1:'+endpoint.port+'/');t.after(()=>socket.terminate());await once(socket,'open');let id=0;const pending=new Map(),events=[];socket.on('message',data=>{const value=JSON.parse(data);if(value.id===undefined)events.push(value);else{const entry=pending.get(value.id);if(entry){pending.delete(value.id);clearTimeout(entry.timer);entry.resolve(value)}}});
 const send=(method,params,sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('Actual RPC timeout '+method)),2500);pending.set(key,{resolve,timer});socket.send(JSON.stringify({id:key,method,params,...(sessionId?{sessionId}:{})}))});t.after(()=>{for(const value of pending.values())clearTimeout(value.timer)});
 const context=(await send('Target.createBrowserContext',{})).result.browserContextId,target=(await send('Target.createTarget',{browserContextId:context,url:'about:blank'})).result.targetId,session=(await send('Target.attachToTarget',{targetId:target,flatten:true})).result.sessionId;
 for(const method of['Page.enable','Runtime.enable','Network.enable'])assert.ok(!(await send(method,{},session)).error);
 const run=async expression=>{const reply=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);assert.ok(!reply.error,JSON.stringify(reply));assert.ok(!reply.result.exceptionDetails,JSON.stringify(reply));return reply.result.result.value};
 await send('Page.navigate',{url:origin+'/'},session);await run('new Promise(r=>document.readyState==="complete"?r(true):addEventListener("load",()=>r(true),{once:true}))');
 return{endpoint,origin,send,run,session,receipts,events};
}
test('Real CDP admission blocks Window fetch and sync XHR before HTTP and preserves VM errors',async t=>{
 const f=await fixture(t);assert.deepEqual((await f.send('Network.setBlockedURLs',{urlPatterns:[{urlPattern:'*/denied/*',block:true}]},f.session)).result,{});
 const out=await f.run(`(async()=>{let a,b;try{await fetch('/denied/fetch')}catch(e){a={name:e.name,message:e.message,realm:e instanceof TypeError}}const x=new XMLHttpRequest();x.open('GET','/denied/sync',false);try{x.send()}catch(e){b={name:e.name,message:e.message,status:x.status,realm:e instanceof DOMException}}return{a,b}})()`);
 assert.deepEqual(out,{a:{name:'TypeError',message:'fetch error',realm:true},b:{name:'NetworkError',message:'A network error occurred',status:0,realm:true}});assert.deepEqual(f.receipts,['/']);const failures=f.events.filter(e=>e.method==='Network.loadingFailed');assert.equal(failures.length,2);for(const event of failures){assert.equal(event.params.errorText,'UrlBlocked');assert.equal(event.params.blockedReason,'inspector');assert.equal(event.params.type,'Ping')}
});
test('Actual redirect source reaches HTTP while blocked destination does not; clearing restores bytes',async t=>{
 const f=await fixture(t);await f.send('Network.setBlockedURLs',{urlPatterns:[{urlPattern:'*/denied/*',block:true}]},f.session);const fail=await f.run('fetch("/redirect").then(()=>"accepted",e=>e.message)');assert.equal(fail,'fetch error');assert.deepEqual(f.receipts,['/','/redirect']);await f.send('Network.setBlockedURLs',{urlPatterns:[]},f.session);assert.equal(await f.run('fetch("/denied/real").then(r=>r.text())'),'<!doctype html><p>Actual response 🐼</p>');assert.deepEqual(f.receipts,['/','/redirect','/denied/real']);
});
test('Real dedicated Worker fetch and startup scripts use the same captured admission authority',async t=>{
 const f=await fixture(t);await f.send('Network.setBlockedURLs',{urlPatterns:[{urlPattern:'*/denied/*',block:true}]},f.session);const out=await f.run('new Promise(r=>{const w=new Worker("/worker.js");w.onmessage=e=>{r(e.data);w.terminate()};w.onerror=e=>{r({startupError:e.message});w.terminate()}})');assert.deepEqual(out,{ok:false,name:'TypeError',message:'fetch error'});assert.deepEqual(f.receipts,['/','/worker.js']);
 await f.send('Network.setBlockedURLs',{urlPatterns:[{urlPattern:'*/worker.js*',block:true}]},f.session);assert.equal(await f.run('new Promise(r=>{const w=new Worker("/worker.js?blocked");w.onerror=e=>{r(e.message);w.terminate()};w.onmessage=e=>{r("unexpected message");w.terminate()}})'),'UrlBlocked');assert.deepEqual(f.receipts,['/','/worker.js']);
});
test('A blocked real document commits a new empty document without manufacturing an HTTP response',async t=>{
 const f=await fixture(t);await f.send('Network.setBlockedURLs',{urlPatterns:[{urlPattern:'*/denied/*',block:true}]},f.session);await f.run('globalThis.actualOldDocumentMarker=42');const reply=await f.send('Page.navigate',{url:f.origin+'/denied/document'},f.session);assert.equal(reply.result.errorText,'UrlBlocked');const state=await f.run('new Promise(r=>setTimeout(()=>r({url:location.href,ready:document.readyState,text:document.body.textContent,old:typeof actualOldDocumentMarker}),0))');assert.deepEqual(state,{url:f.origin+'/denied/document',ready:'complete',text:'',old:'undefined'});assert.deepEqual(f.receipts,['/']);assert.equal(f.events.some(e=>e.method==='Runtime.exceptionThrown'),false);
});
test('Disposed genuine contexts remain usable as retained values but cannot authorize a command',t=>{
 const{browser,connection,page,set}=policyFixture(t),retained=page.context;
 set([{urlPattern:'*/retained-policy/*',block:true}]);browser.disposeContext(retained.id);
 assert.equal(retained.cookies.getCookieStringSync('https://actual.example/'),'');
 assert.throws(()=>setBlockedURLs(connection,undefined,{urlPatterns:[]},ProtocolError),{message:'BrowserContextNotLoaded',code:-31998});
 for(let i=0;i<12;i++){
  const id=browser.createContext(),context=browser.contexts.get(id);registerURLBlockContext(connection,context);
  const current=browser.createPage(id,{urlBlockOwner:urlBlockOwnerForConnection(connection)});
  assert.equal(blocked(current,'https://actual.example/retained-policy/check'),true);
  assert.equal(blocked(current,'https://actual.example/unrelated'),false);
  browser.disposeContext(id);
 }
 assert.throws(()=>setBlockedURLs(connection,undefined,{urlPatterns:[]},ProtocolError),{message:'BrowserContextNotLoaded'});
});
test('A foreign target argument never transfers connection command authority',t=>{
 const{browser,connection,page,set}=policyFixture(t);set([{urlPattern:'*/one/*',block:true}]);
 const other={browser};initializeURLBlockConnection(other);const id=browser.createContext(),context=browser.contexts.get(id);registerURLBlockContext(other,context);const foreign=browser.createPage(id,{urlBlockOwner:urlBlockOwnerForConnection(other)});
 setBlockedURLs(connection,foreign,{urlPatterns:[{urlPattern:'*/two/*',block:true}]},ProtocolError);
 assert.equal(blocked(page,'https://actual.example/two/value'),true);assert.equal(blocked(page,'https://actual.example/one/value'),false);assert.equal(blocked(foreign,'https://actual.example/two/value'),false);
});
