import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {serve} from '../src/cdp.js';
import {connect} from './cdp-client.js';

async function fixture(t){
 const held=new Set(),closures=[],requests=[];
 const server=http.createServer((req,res)=>{requests.push(req.url);res.setHeader('Connection','close');if(req.url==='/held'){held.add(res);res.on('close',()=>closures.push(res.writableEnded));return;}res.setHeader('Content-Type','text/html');res.end(req.url==='/child'?'<p id="p">Original</p><script>globalThis.mainMark=17</script>':'<iframe id="f" src="/child"></iframe>');});server.listen(0,'127.0.0.1');await once(server,'listening');
 const service=await serve({port:0,loadResources:['iframe'],timeout:1000}),client=await connect(`ws://127.0.0.1:${service.port}/`);
 t.after(async()=>{for(const res of held)res.destroy();await client.close();await service.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'});const{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});const send=(method,params={})=>client.send(method,params,sessionId);
 await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
 let frameId,main;for(let i=0;i<100;i++){frameId=(await send('Page.getFrameTree')).frameTree.childFrames?.[0]?.frame.id;main=client.events.find(e=>e.method==='Runtime.executionContextCreated'&&e.params.context.auxData?.frameId===frameId&&e.params.context.auxData.isDefault)?.params.context.id;if(frameId&&main)break;await new Promise(resolve=>setTimeout(resolve,5));}assert.ok(main);
 const{executionContextId:utility}=await send('Page.createIsolatedWorld',{frameId,worldName:'retired-test'});
 const evaluate=async(expression,contextId)=>{const result=await send('Runtime.evaluate',{expression,contextId,returnByValue:true});assert.equal(result.exceptionDetails,undefined,JSON.stringify(result));return result.result.value;};
 const root=service.browser.pages.get(targetId),page=root.frames.findFrame(frameId);
 return {client,send,evaluate,frameId,main,utility,root,page,targetId,sessionId,held,closures,requests};
}

test('retired main and utility IDs select the original VM, intrinsics and Document after frame authority is removed',async t=>{
 const{client,send,evaluate,frameId,main,utility,root,page}=await fixture(t),document=page.dom.window.document,context=page.dom.getInternalVMContext();
 for(const id of [main,utility])await evaluate('globalThis.savedDocument=document;globalThis.savedNode=document.getElementById("p");globalThis.savedArray=Array;globalThis.savedOwner=frameElement;true',id);
 const node=(await send('Runtime.evaluate',{contextId:utility,expression:'document.getElementById("p")'})).result;
 const start=client.events.length;await evaluate('document.getElementById("f").remove();true');
 assert.equal(root.frames.findFrame(frameId),undefined);assert.equal(root.frames.findContext(main).page,page);assert.equal(page.dom.getInternalVMContext(),context);assert.equal(page.dom.window.document,document);assert.equal(root.dom.window.closed,false);
 for(const id of [main,utility])assert.deepEqual(await evaluate('({closed,sameDocument:document===savedDocument,sameNode:document.getElementById("p")===savedNode,sameArray:Array===savedArray,owner:frameElement===savedOwner,view:document.defaultView,connected:document.isConnected})',id),{closed:true,sameDocument:true,sameNode:true,sameArray:true,owner:true,view:null,connected:true});
 assert.equal((await send('Runtime.callFunctionOn',{objectId:node.objectId,functionDeclaration:'function(){return this===document.getElementById("p")}',returnByValue:true})).result.value,true);
 await assert.rejects(send('Page.createIsolatedWorld',{frameId,worldName:'new'}),{code:-32000,message:'Frame with the given id does not belong to the target.'});
 assert.equal(client.events.slice(start).some(e=>e.method==='Runtime.executionContextDestroyed'),false);assert.equal((await send('Page.getFrameTree')).frameTree.childFrames,undefined);
 const attached=await client.send('Target.attachToTarget',{targetId:root.id,flatten:true});await client.send('Runtime.enable',{},attached.sessionId);
 assert.equal((await client.send('Runtime.evaluate',{contextId:utility,expression:'document===savedDocument',returnByValue:true},attached.sessionId)).result.value,true);
});

test('retirement cancels prior main tasks and fetch transport while new real tasks/requests and utility timers remain usable',async t=>{
 const{send,evaluate,main,utility,held,closures,requests}=await fixture(t);
 for(const id of [main,utility])await evaluate('globalThis.rootDocument=parent.document;true',id);
 await evaluate('document.addEventListener("retire-now",()=>{setTimeout(()=>rootDocument.documentElement.setAttribute("old-main","bad"),15);requestAnimationFrame(()=>rootDocument.documentElement.setAttribute("old-main-raf","bad"));});fetch("/held").then(()=>rootDocument.documentElement.setAttribute("old-fetch","bad"),()=>rootDocument.documentElement.setAttribute("old-fetch","bad"));true',main);
 await evaluate('document.addEventListener("retire-now",()=>setTimeout(()=>rootDocument.documentElement.setAttribute("old-utility","yes"),15));true',utility);
 for(let i=0;i<100&&!held.size;i++)await new Promise(resolve=>setTimeout(resolve,2));assert.equal(held.size,1);
 await evaluate('const f=document.getElementById("f");f.contentDocument.dispatchEvent(new Event("retire-now"));f.remove();true');
 for(const id of [main,utility])await evaluate(`setTimeout(()=>rootDocument.documentElement.setAttribute("new-${id}","yes"),10);true`,id);
 await evaluate('fetch("/new").then(r=>rootDocument.documentElement.setAttribute("new-fetch",String(r.status)));true',main);
 await new Promise(resolve=>setTimeout(resolve,45));
 const attrs=await evaluate('Object.fromEntries([...document.documentElement.attributes].map(a=>[a.name,a.value]))');
 assert.equal(attrs['old-main'],undefined);assert.equal(attrs['old-main-raf'],undefined);assert.equal(attrs['old-fetch'],undefined);assert.equal(attrs['old-utility'],'yes');assert.equal(attrs[`new-${main}`],'yes');assert.equal(attrs[`new-${utility}`],'yes');assert.equal(attrs['new-fetch'],'200');assert.deepEqual(closures,[false]);assert.ok(requests.includes('/new'));
 for(const res of held)res.destroy();
});

test('retired actual script/Promise handles continue and final owning-page teardown aborts both realms',async t=>{
 const{client,send,evaluate,main,utility,page,targetId}=await fixture(t);
 const compiled=[];for(const id of [main,utility])compiled.push({id,...await send('Runtime.compileScript',{expression:'globalThis.compiledRetained=41;compiledRetained+1',sourceURL:'retained.js',persistScript:true,executionContextId:id})});
 await evaluate('document.getElementById("f").remove();true');for(const entry of compiled)assert.equal((await send('Runtime.runScript',{scriptId:entry.scriptId,executionContextId:entry.id,returnByValue:true})).result.value,42);
 const value=await send('Runtime.evaluate',{contextId:main,expression:'new Promise(resolve=>setTimeout(()=>resolve(43),10))',awaitPromise:true,returnByValue:true});assert.equal(value.result.value,43);
 assert.equal(page.documentAbort.signal.aborted,false);await send('Target.closeTarget',{targetId});assert.equal(page.documentAbort.signal.aborted,true);assert.equal(page.closed,true);assert.throws(()=>page.evaluate('1'),/detached|current/);assert.equal(client.events.some(e=>e.method==='Runtime.executionContextDestroyed'),false);
});

test('heap queries retain genuine retired realm authority until actual owning-page teardown',async t=>{
 const{send,evaluate,main,utility,page}=await fixture(t),prototypes=[];
 for(const id of [main,utility]){
  await evaluate('globalThis.retiredPrototype={};globalThis.retiredObject=Object.create(retiredPrototype);true',id);
  const prototype=await send('Runtime.evaluate',{contextId:id,expression:'retiredPrototype'});
  prototypes.push({id,objectId:prototype.result.objectId});
 }
 await evaluate('document.getElementById("f").remove();true');
 for(const prototype of prototypes){
  const query=await send('Runtime.queryObjects',{prototypeObjectId:prototype.objectId,objectGroup:'retired-matches'});
  const actual=await send('Runtime.callFunctionOn',{objectId:query.objects.objectId,functionDeclaration:'function(){return {same:this.length===1&&this[0]===retiredObject,realm:Object.getPrototypeOf(this)===Array.prototype,closed,viewNull:document.defaultView===null}}',returnByValue:true});
  assert.deepEqual(actual.result.value,{same:true,realm:true,closed:true,viewNull:true});
 }
 await send('Runtime.releaseObjectGroup',{objectGroup:'retired-matches'});
 page.registry.page.documentAbort.abort();
 for(const prototype of prototypes)await assert.rejects(send('Runtime.queryObjects',{prototypeObjectId:prototype.objectId}),error=>error.code===-32000);
});
