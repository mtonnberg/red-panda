import{test}from'node:test';
import assert from'node:assert/strict';
import http from'node:http';
import{readFile}from'node:fs/promises';
import{createRequire}from'node:module';
import{serve}from'../src/cdp.js';
import{Browser,VERSION}from'../src/browser.js';
import{dumpMarkdownNode}from'../src/markdown-node.js';
import{connect}from'./cdp-client.js';
const native=JSON.parse(await readFile(new URL('../docs/reference/lp-aliases/native-r2.json',import.meta.url),'utf8'));
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
function expected(label,origin){const row=native.rows.find(value=>value.label===label);assert.ok(row,label);assert.equal(row.response.diagnosticTimeout,undefined);if(row.response.error)return row.response.error;const result=row.response.result;return typeof result?.markdown==='string'?{markdown:result.markdown.replaceAll(native.sourceURL,origin)}:result}
async function fixture(t){
 let service,client;const server=http.createServer((request,response)=>{response.setHeader('content-type','text/html; charset=utf-8');response.end(request.url==='/child'?native.documents.child:native.documents.main.replaceAll(native.sourceURL,origin))});
 t.after(async()=>{await client?.close();await service?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;service=await serve({port:0});client=await connect('ws://127.0.0.1:'+service.port+'/');
 const create=async()=>{const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});return{targetId,sessionId,send:(method,params)=>client.send(method,params,sessionId)}};
 const load=async()=>{const target=await create();await target.send('Page.navigate',{url:origin+'/'});await target.send('Runtime.evaluate',{expression:"new Promise(resolve=>{if(document.readyState==='complete')resolve(true);else addEventListener('load',()=>resolve(true),{once:true})})",awaitPromise:true,returnByValue:true});const{root}=await target.send('DOM.getDocument',{depth:-1,pierce:true});const{nodeId}=await target.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#scope'});const{node}=await target.send('DOM.describeNode',{nodeId,depth:1});return{...target,root,scope:node,text:node.children.find(child=>child.nodeType===3)}};
 return{origin,service,client,create,load};
}

test('LP.version uses Native payload shape with Red Panda own version before and after target creation',async t=>{
 const{client,service,create}=await fixture(t);assert.deepEqual(Object.keys(expected('root-version-before')),['version']);assert.deepEqual(await client.send('LP.version'),{version:VERSION});const{send}=await create();assert.deepEqual(await send('LP.version',{ignored:1}),{version:VERSION});assert.deepEqual(await send('LP.version',null),{version:VERSION});for(const method of['CSS.enable','Inspector.enable','Inspector.disable','Security.enable','Security.disable']){assert.deepEqual(await client.send(method,null),{});assert.deepEqual(await send(method,null),{})}const version=await client.send('Browser.getVersion'),discovery=await fetch('http://127.0.0.1:'+service.port+'/json/version').then(value=>value.json());assert.equal(version.product,'RedPanda/'+VERSION);assert.equal(discovery.Browser,'RedPanda/'+VERSION);assert.notEqual(VERSION,expected('root-version-before').version);
});

test('LP.getMarkdown preserves actual Native document Element Text and ignored-option scopes',async t=>{
 const f=await fixture(t),{send,root,scope,text}=await f.load();for(const[label,params]of[['document-markdown',{}],['document-node-markdown',{nodeId:root.nodeId}],['scoped-markdown',{nodeId:scope.nodeId}],['actual-text-node-markdown',{nodeId:text.nodeId}],['scoped-ignored-fields',{nodeId:scope.nodeId,selector:'[',maxBytes:1,format:'html',strip:{invisible:true}}],['null-params',null]])assert.deepEqual(await send('LP.getMarkdown',params),expected(label,f.origin),label);assert.deepEqual(await f.client.send('LP.getMarkdown',{nodeId:scope.nodeId}),expected('scoped-markdown',f.origin));const alias=await send('LP.getMarkdown'),dump=await send('LP.dump',{format:'markdown'});assert.equal(alias.markdown,dump.content);
});

test('LP.getMarkdown scopes genuine child-frame registry nodes and ignores frameId on a document request',async t=>{
 const f=await fixture(t),{send}=await f.load();const object=await send('Runtime.evaluate',{expression:"document.querySelector('iframe').contentDocument.querySelector('#child')"});assert.ok(object.result.objectId);const{node}=await send('DOM.describeNode',{objectId:object.result.objectId});assert.deepEqual(await send('LP.getMarkdown',{nodeId:node.nodeId}),expected('actual-child-node-description-markdown',f.origin));const{frameTree}=await send('Page.getFrameTree');assert.ok(frameTree.childFrames[0].frame.id);assert.deepEqual(await send('LP.getMarkdown',{frameId:frameTree.childFrames[0].frame.id}),expected('actual-child-frame-parameter',f.origin));
});

test('LP node conversion retains observed Native errors and current malformed-envelope rejection',async t=>{
 const f=await fixture(t),{send,root}=await f.load();for(const[label,nodeId]of[['unknown-node',4294967295],['negative-node',-1],['zero-node',0],['fractional-node',1.25]])await assert.rejects(send('LP.getMarkdown',{nodeId}),error=>{assert.deepEqual({code:error.code,message:error.message},expected(label,f.origin));return true});assert.deepEqual(await send('LP.getMarkdown',{nodeId:String(root.nodeId)}),expected('document-node-markdown',f.origin));for(const params of[[],3])await assert.rejects(send('LP.getMarkdown',params),error=>error.code===-32600&&error.message==='Invalid CDP request');
});

test('LP markdown reflects real document mutation while authored selector and clone methods cannot choose its source',async t=>{
 const f=await fixture(t),{send,scope}=await f.load();await send('Runtime.evaluate',{expression:"globalThis.cloneCalls=0;const real=document.querySelector('#scope'),fake=document.createElement('p');fake.textContent='forged clone';real.cloneNode=()=>{cloneCalls++;return fake};document.querySelector=()=>{throw Error('authored selector')};'poisoned'",returnByValue:true});assert.deepEqual(await send('LP.getMarkdown',{nodeId:scope.nodeId,selector:'anything'}),expected('scoped-markdown',f.origin));assert.equal((await send('Runtime.evaluate',{expression:'cloneCalls',returnByValue:true})).result.value,0);await send('Runtime.evaluate',{expression:"document.getElementsByTagName('h1')[0].textContent='Real mutation';'changed'",returnByValue:true});assert.deepEqual(await send('LP.getMarkdown'),expected('markdown-after-mutation',f.origin));
});

test('LP aliases retain actual root context target-close and detached-session lifetime errors',async t=>{
 const f=await fixture(t);await assert.rejects(f.client.send('LP.getMarkdown'),error=>{assert.deepEqual({code:error.code,message:error.message},expected('root-markdown-before',f.origin));return true});const target=await f.load();assert.deepEqual(await f.client.send('LP.getMarkdown'),expected('root-markdown-loaded',f.origin));await f.client.send('Target.detachFromTarget',{sessionId:target.sessionId});for(const[method,label]of[['LP.version','version-detached-session'],['LP.getMarkdown','markdown-detached-session']])await assert.rejects(target.send(method),error=>{assert.deepEqual({code:error.code,message:error.message},expected(label,f.origin));return true});await f.client.send('Target.closeTarget',{targetId:target.targetId});assert.deepEqual(await f.client.send('LP.version'),{version:VERSION});await assert.rejects(f.client.send('LP.getMarkdown'),error=>{assert.deepEqual({code:error.code,message:error.message},expected('markdown-after-close',f.origin));return true});
});

test('new scoped markdown producer rejects copied implementation symbols and proxies before authored reads',async t=>{
 const browser=new Browser();t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,<p>real node</p>');const node=page.dom.window.document.querySelector('p'),fake=Object.create(Object.getPrototypeOf(node));Object.defineProperty(fake,utils.implSymbol,{value:utils.implForWrapper(node)});let reads=0;const proxy=new Proxy(node,{get(){reads++;throw Error('authored read')},getOwnPropertyDescriptor(){reads++;throw Error('authored descriptor')}});for(const value of[fake,proxy,Object.create(node)])assert.throws(()=>dumpMarkdownNode(value),/genuine registered DOM node/);assert.equal(reads,0);assert.equal(dumpMarkdownNode(node),'\nreal node\n');
});

// These authored controls have independent actual Native counts and output.
test('LP canonical node reads create no custom-element reactions and invoke no poisoned Node or Element fronts',async t=>{
 const{send}=await(await fixture(t)).create();const controls=JSON.parse(await readFile(new URL('../docs/reference/lp-aliases/native-sideeffects.json',import.meta.url),'utf8'));let nodeId;
 for(const row of controls.rows){
  if(row.label==='document'){await send(row.method,row.params);const{root}=await send('DOM.getDocument',{depth:-1});nodeId=root.nodeId;assert.ok(Number.isInteger(nodeId));continue}
  const result=await send(row.method,row.method==='LP.getMarkdown'?{nodeId}:row.params);
  if(row.method==='LP.getMarkdown')assert.deepEqual(result,row.result,row.label);
  else{assert.equal(result.exceptionDetails,undefined,row.label);assert.deepEqual(result.result.value,row.result.result.value,row.label)}
 }
});
