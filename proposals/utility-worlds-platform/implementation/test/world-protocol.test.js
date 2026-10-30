import {test} from 'node:test';
import assert from 'node:assert/strict';

import vm from 'node:vm';
import {configureUtilityFactories} from '../src/world-sessions.js';
import {connect} from './cdp-client.js';
const {serve}=await import('../src/cdp.js');
async function setup(t,options={}){const service=await serve({host:'127.0.0.1',port:0,...options});const client=await connect(`ws://127.0.0.1:${service.port}/`);t.after(async()=>{await client.close();await service.close();});const{browserContextId}=await client.send('Target.createBrowserContext');const{targetId}=await client.send('Target.createTarget',{browserContextId,url:'about:blank'});const{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});const send=(method,params={})=>client.send(method,params,sessionId);await send('Runtime.enable');const evaluate=async(expression,contextId,extra={})=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,...(contextId?{contextId}:{}),...extra});assert.equal(r.exceptionDetails,undefined,JSON.stringify(r));return r.result.value;};return{service,client,send,evaluate,targetId,sessionId};}

test('raw CDP selects genuine utility node/literal realms, private node identity and stable unique contexts',async t=>{
 const{client,send,evaluate}=await setup(t);await send('Page.navigate',{url:'data:text/html,<button id="a">A</button>'});const{frameTree}=await send('Page.getFrameTree');const{id}=frameTree.frame;const{executionContextId:world}=await send('Page.createIsolatedWorld',{frameId:id,worldName:'actual-world'});const node=(await send('Runtime.evaluate',{contextId:world,expression:'globalThis.utilityOnly=42;document.getElementById("a").worldExpando=17;document.getElementById("a")'})).result;assert.equal(node.subtype,'node');assert.equal(node.className,'HTMLButtonElement');assert.equal(await evaluate('typeof utilityOnly'),'undefined');assert.equal(await evaluate('document.getElementById("a").worldExpando'),undefined);await evaluate('JSON.parse=()=>({poisoned:true});true',world);
 const called=await send('Runtime.callFunctionOn',{objectId:node.objectId,functionDeclaration:'function(arg){return {literal:arg instanceof Object,nested:arg.nested instanceof Array,node:this instanceof HTMLButtonElement,document:this.ownerDocument===document}}',arguments:[{value:{nested:[1]}}],returnByValue:true});assert.deepEqual(called.result.value,{literal:true,nested:true,node:true,document:true});
 const root=(await send('DOM.getDocument')).root;const selected=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#a'});const resolved=await send('DOM.resolveNode',{nodeId:selected.nodeId,executionContextId:world});assert.equal(resolved.object.subtype,'node');assert.equal((await send('DOM.requestNode',{objectId:node.objectId})).nodeId,selected.nodeId);assert.equal((await send('DOM.describeNode',{objectId:node.objectId})).node.backendNodeId,selected.nodeId);assert.equal((await send('Runtime.callFunctionOn',{objectId:resolved.object.objectId,functionDeclaration:'function(){return this===document.getElementById("a")}',returnByValue:true})).result.value,true);
 const context=client.events.find(e=>e.method==='Runtime.executionContextCreated'&&e.params.context.id===world).params.context;assert.equal(await evaluate('utilityOnly',undefined,{uniqueContextId:context.uniqueId}),42);const count=client.events.filter(e=>e.method==='Runtime.executionContextCreated').length;await send('Runtime.enable');assert.equal(client.events.filter(e=>e.method==='Runtime.executionContextCreated').length,count);
});

test('world-name cache is frame/document scoped across sessions and binding removal leaves inert real function',async t=>{
 const authorities=[];configureUtilityFactories({onRealm(global,context,metadata){assert.equal(vm.isContext(context),true);assert.equal(metadata.isActive(),true);authorities.push({global,context,metadata});return()=>{};}});t.after(()=>configureUtilityFactories({}));
 const{client,send,evaluate,targetId}=await setup(t);await send('Page.navigate',{url:'data:text/html,<p>cache</p>'});const{frameTree}=await send('Page.getFrameTree');const first=await send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'shared-world'});const other=await client.send('Target.attachToTarget',{targetId,flatten:true});const second=await client.send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'shared-world'},other.sessionId);assert.equal(first.executionContextId,second.executionContextId);assert.equal(authorities.length,1);assert.equal(authorities[0].metadata.contextId,first.executionContextId);await evaluate('globalThis.sameActualWorld=33',first.executionContextId);assert.equal((await client.send('Runtime.evaluate',{contextId:second.executionContextId,expression:'sameActualWorld',returnByValue:true},other.sessionId)).result.value,33);
 await send('Runtime.addBinding',{name:'report',executionContextId:first.executionContextId});assert.equal(await evaluate('typeof report'),'undefined');assert.equal(await evaluate('report instanceof Function',first.executionContextId),true);await evaluate('report("before");true',first.executionContextId);assert.equal(client.events.filter(e=>e.method==='Runtime.bindingCalled').length,1);await send('Runtime.removeBinding',{name:'report'});assert.equal(await evaluate('typeof report',first.executionContextId),'function');await evaluate('report("after");true',first.executionContextId);assert.equal(client.events.filter(e=>e.method==='Runtime.bindingCalled').length,1);
});

test('utility preload callbacks execute before main authored events and compiled/lexical APIs use the actual VM',async t=>{
 const{client,send,evaluate}=await setup(t);await send('Runtime.addBinding',{name:'preloadReport',executionContextName:'preload'});await send('Page.addScriptToEvaluateOnNewDocument',{worldName:'preload',source:'globalThis.utilityPreload=17;preloadReport("boot");document.addEventListener("author",()=>document.documentElement.setAttribute("seen","yes"));'});await send('Page.navigate',{url:'data:text/html,'+encodeURIComponent('<!doctype html><script>document.dispatchEvent(new Event("author"));globalThis.observed={hidden:typeof utilityPreload,shared:document.documentElement.getAttribute("seen")};</script>')});assert.deepEqual(await evaluate('observed'),{hidden:'undefined',shared:'yes'});const context=client.events.find(e=>e.method==='Runtime.executionContextCreated'&&e.params.context.name==='preload').params.context;assert.equal(await evaluate('utilityPreload',context.id),17);const binding=client.events.find(e=>e.method==='Runtime.bindingCalled'&&e.params.name==='preloadReport');assert.equal(binding.params.executionContextId,context.id);assert.equal(binding.params.payload,'boot');assert.ok(client.events.findIndex(e=>e.method==='Runtime.executionContextCreated'&&e.params.context.id===context.id)<client.events.indexOf(binding));assert.equal(await evaluate('typeof preloadReport'),'undefined');
 const compiled=await send('Runtime.compileScript',{expression:'let utilityLexical=33;utilityLexical+1',sourceURL:'utility-proof.js',persistScript:true,executionContextId:context.id});const result=await send('Runtime.runScript',{scriptId:compiled.scriptId,executionContextId:context.id,returnByValue:true});assert.equal(result.result.value,34);const names=await send('Runtime.globalLexicalScopeNames',{executionContextId:context.id});assert.ok(names.names.includes('utilityLexical'));assert.equal(await evaluate('typeof utilityLexical'),'undefined');
});


test('native required worldName validation and explicit empty-name worlds retain real isolation',async t=>{
 const{send,evaluate}=await setup(t);const{frameTree}=await send('Page.getFrameTree');for(const value of [undefined,7,null])await assert.rejects(send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,...(value===undefined?{}:{worldName:value})}),error=>error.code===-31998&&error.message===(value===undefined?'MissingField':'UnexpectedToken'));const world=await send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:''});const repeat=await send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:''});assert.equal(world.executionContextId,repeat.executionContextId);await evaluate('globalThis.emptyNameValue=42',world.executionContextId);assert.equal(await evaluate('typeof emptyNameValue'),'undefined');
});

test('actual unique-world selection preserves caller validation, receiver groups and bounded invocation',async t=>{
 const{client,send,evaluate}=await setup(t,{timeout:150});
 const frameId=(await send('Page.getFrameTree')).frameTree.frame.id;
 const{executionContextId}=await send('Page.createIsolatedWorld',{frameId,worldName:'caller-world'});
 const context=client.events.find(e=>e.method==='Runtime.executionContextCreated'&&e.params.context.id===executionContextId).params.context;
 await evaluate('globalThis.worldMark=71;Function.prototype.apply=()=>{throw new Error("authored apply")};true',executionContextId);
 const receiver=(await send('Runtime.evaluate',{uniqueContextId:context.uniqueId,expression:'({})',objectGroup:'actual-world-group'})).result.objectId;
 const mixed={objectId:receiver,uniqueContextId:'invalid-unique-context',functionDeclaration:'function(){return 1}'};
 await assert.rejects(send('Runtime.callFunctionOn',mixed),{code:-32602,message:'ObjectId, executionContextId and uniqueContextId must mutually exclude each other'});
 await assert.rejects(send('Runtime.callFunctionOn',{executionContextId,uniqueContextId:context.uniqueId,functionDeclaration:'function(){return 1}'}),{code:-32602,message:'ObjectId, executionContextId and uniqueContextId must mutually exclude each other'});
 const called=await send('Runtime.callFunctionOn',{uniqueContextId:context.uniqueId,functionDeclaration:'function(arg){return [this===globalThis,worldMark,arg instanceof Object,arg.a instanceof Array]}',arguments:[{value:{a:[]}}],returnByValue:true});
 assert.deepEqual(called.result.value,[true,71,true,true]);
 const child=await send('Runtime.callFunctionOn',{objectId:receiver,functionDeclaration:'function(){return {mark:worldMark}}'});
 const thrown=await send('Runtime.callFunctionOn',{objectId:receiver,functionDeclaration:'function(){throw {realm:worldMark}}'});
 assert.equal(thrown.exceptionDetails.executionContextId,executionContextId);
 assert.equal((await send('Runtime.callFunctionOn',{objectId:child.result.objectId,functionDeclaration:'function(){return this.mark}',returnByValue:true})).result.value,71);
 await send('Runtime.releaseObjectGroup',{objectGroup:'actual-world-group'});
 for(const objectId of [receiver,child.result.objectId,thrown.result.objectId,thrown.exceptionDetails.exception.objectId])await assert.rejects(send('Runtime.getProperties',{objectId}),{code:-32000,message:'Could not find object with given id'});
 const timeout=await send('Runtime.callFunctionOn',{uniqueContextId:context.uniqueId,functionDeclaration:'function(){while(true){}}'});
 assert.ok(timeout.exceptionDetails);
 assert.match(timeout.result.description,/timed out/);
 assert.equal(await evaluate('worldMark',undefined,{uniqueContextId:context.uniqueId}),71);
 assert.equal(await evaluate('typeof worldMark'),'undefined');
});

test('navigation creates a fresh actual named world and retires prior unique context authority',async t=>{
 const authorities=[];configureUtilityFactories({onRealm(global,context,metadata){const entry={context,metadata,disposed:false};authorities.push(entry);return()=>{entry.disposed=true};}});t.after(()=>configureUtilityFactories({}));
 const{client,send,evaluate}=await setup(t);
 const frameId=(await send('Page.getFrameTree')).frameTree.frame.id;
 const first=(await send('Page.createIsolatedWorld',{frameId,worldName:'document-life'})).executionContextId;
 const firstUnique=client.events.find(e=>e.method==='Runtime.executionContextCreated'&&e.params.context.id===first).params.context.uniqueId;
 await evaluate('globalThis.firstDocumentOnly=42',first);
 await send('Page.navigate',{url:'data:text/html,<p>next actual document</p>'});
 const second=(await send('Page.createIsolatedWorld',{frameId,worldName:'document-life'})).executionContextId;
 assert.notEqual(first,second);assert.equal(await evaluate('typeof firstDocumentOnly',second),'undefined');
 await assert.rejects(send('Runtime.evaluate',{uniqueContextId:firstUnique,expression:'1'}),{code:-32602,message:'Cannot find context with specified id'});
 assert.equal(authorities.length,2);assert.equal(authorities[0].metadata.isActive(),false);assert.equal(authorities[0].disposed,true);assert.equal(authorities[1].metadata.isActive(),true);assert.notEqual(authorities[0].context,authorities[1].context);
});
