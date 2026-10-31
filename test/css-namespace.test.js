import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Browser,until} from '../src/browser.js';
import {serve} from '../src/cdp.js';
import {connect} from './cdp-client.js';
const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(t){const browser=new Browser({loadResources:['iframe']});t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,<body></body>');return {browser,page,w:page.dom.window};}
for(const [expression,oracle]of [['expression.js','native.json'],['shape-conditions-expression.js','native-shape-conditions.json'],['edges-expression.js','native-edges.json'],['properties-expression.js','native-properties.json'],['aliases-expression.js','native-aliases.json']])test(`CSS native controls: ${expression}`,async t=>{
 const {page}=await fixture(t),source=await readFile(new URL('../oracle/css/'+expression,import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL('../oracle/css/'+oracle,import.meta.url),'utf8')).result.result.value;
 assert.ok(expected.length>0);assert.deepEqual(plain(await page.evaluate(source)),expected);
});
test('escaped identifiers select the actual authored elements',async t=>{
 const {page}=await fixture(t);const actual=await page.evaluate(`(()=>{const escape=CSS.escape,rows=[];for(const id of ['3a','-','-1','a b','a#b','a[b]','a\\\\b','a"b','🐼']){const node=document.createElement('div');node.id=id;document.body.append(node);rows.push(document.querySelector('#'+escape.call({},id))===node);node.remove();}return rows})()`);assert.deepEqual(plain(actual),Array(9).fill(true));
});
test('CSS methods capture realm intrinsics and keep namespace getter brands',async t=>{
 const {page}=await fixture(t);const actual=await page.evaluate(`(()=>{const escape=CSS.escape,supports=CSS.supports,original=String.prototype.charCodeAt,convert=String.prototype.toWellFormed,desc=Object.getOwnPropertyDescriptor(window,'CSS');let result;try{String.prototype.charCodeAt=String.prototype.toWellFormed=()=>{throw Error('poison')};result=[escape('0 b'),supports(Symbol('display'),Symbol('block'))];}finally{String.prototype.charCodeAt=original;String.prototype.toWellFormed=convert;}try{desc.get.call({})}catch(e){result.push(e instanceof TypeError,e.message)}return result})()`);assert.deepEqual(plain(actual),['\\30 \\ b',true,true,'Illegal invocation']);
});
test('child and isolated worlds have genuine independent CSS methods and error realms',async t=>{
 const {w}=await fixture(t),frame=w.document.createElement('iframe');frame.srcdoc='<body>child';w.document.body.append(frame);await until(()=>frame.contentDocument?.readyState==='complete',{timeout:2000});const child=frame.contentWindow;assert.notEqual(child.CSS,w.CSS);assert.equal(Object.getPrototypeOf(child.CSS.escape),child.Function.prototype);assert.throws(()=>child.CSS.escape(),e=>e instanceof child.TypeError&&!(e instanceof w.TypeError));
 const service=await serve({port:0});t.after(()=>service.close());const client=await connect(`ws://127.0.0.1:${service.port}/`);t.after(()=>client.close());const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});const send=(method,params)=>client.send(method,params,sessionId);const{frameTree}=await send('Page.getFrameTree'),{executionContextId}=await send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'css-owned-world'});const value=await send('Runtime.evaluate',{contextId:executionContextId,expression:`({realm:Object.getPrototypeOf(CSS.escape)===Function.prototype,value:CSS.escape('1a'),supported:CSS.supports('selector(:has(a))')})`,returnByValue:true});assert.deepEqual(value.result.value,{realm:true,value:'\\31 a',supported:true});
});
