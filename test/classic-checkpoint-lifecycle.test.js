import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { checkpointStatistics } from '../src/clear-hook.js';
import { Browser,until } from '../src/browser.js';
import { installClassicScripts } from '../src/classic-scripts.js';
const statistics=checkpointStatistics;
const require = createRequire(new URL('../package.json',import.meta.url));
const {implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
const {JSDOM}=require('jsdom');
async function fixture(handler){const server=http.createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');return {origin:`http://127.0.0.1:${server.address().port}`,async close(){server.closeAllConnections();await new Promise(r=>server.close(r))}}}
test('guarded evaluator hook permits real host promises, modules, fetch and MutationObserver',async()=>{
const service=await fixture((req,res)=>{if(req.url==='/reply'){res.end('real body');return}if(req.url==='/dependency.js'){res.setHeader('Content-Type','text/javascript');res.end('export const value=17');return}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><body><script id=setup>globalThis.records=[];new MutationObserver(()=>records.push('observer')).observe(document.body,{childList:true});document.body.append(document.createElement('p'));Promise.resolve().then(()=>records.push('promise'));fetch('/reply').then(r=>r.text()).then(t=>records.push(t));</script><script type=module>import {value} from '/dependency.js';await Promise.resolve();globalThis.moduleValue=value;await new Promise(r=>setTimeout(r,5));globalThis.moduleDone=true</script>`) });
const browser=new Browser();try{let host=false;Promise.resolve().then(()=>host=true);const page=browser.createPage();await page.navigate(service.origin);await until(()=>page.dom.window.moduleDone&&page.dom.window.records.includes('real body'),{timeout:2000});assert.equal(host,true);assert.equal(page.dom.window.moduleValue,17);assert.ok(page.dom.window.records.includes('observer'));assert.ok(page.dom.window.records.includes('promise'));assert.ok(statistics().calls>0)}finally{browser.close();await service.close()}});
test('document disposal suppresses late fetch callbacks and observer delivery',async()=>{
const service=await fixture((req,res)=>{if(req.url==='/slow'){setTimeout(()=>res.end('late'),80);return}res.setHeader('Content-Type','text/html');res.end(`<body><script>globalThis.effects=[];new MutationObserver(()=>effects.push('observer')).observe(document.body,{childList:true});fetch('/slow').then(r=>r.text()).then(x=>effects.push(x)).catch(()=>{});</script>`) });
const browser=new Browser();try{const page=browser.createPage();await page.navigate(service.origin);const effects=page.dom.window.effects;page.close();const count=effects.length;await new Promise(r=>setTimeout(r,120));assert.equal(effects.length,count);assert.equal(effects.includes('late'),false)}finally{browser.close();await service.close()}});

test('disposing an owned document restores its actual private slot without draining unrelated jobs',async()=>{
 const service=await fixture((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<script>globalThis.done=true</script>')});
 const browser=new Browser();try{const page=browser.createPage();await page.navigate(service.origin);const doc=implForWrapper(page.dom.window.document);assert.equal(typeof Object.getOwnPropertyDescriptor(doc,'_currentScript').get,'function');page.close();const descriptor=Object.getOwnPropertyDescriptor(doc,'_currentScript');assert.ok('value' in descriptor);assert.equal(descriptor.value,null);const before=statistics().calls;doc._currentScript=null;assert.equal(statistics().calls,before);assert.equal(statistics().activeScopes,0)}finally{browser.close();await service.close()}
});
test('disposal during the actual checkpoint clears the slot and restores its data descriptor',async()=>{
 let document,window,constructionError;const page={closed:false,documentAbort:new AbortController(),emit(){}};
 await new Promise(resolve=>setImmediate(()=>{try{new JSDOM('<script>Promise.resolve().then(()=>window.close())</script>',{runScripts:'dangerously',beforeParse(w){window=w;document=implForWrapper(w.document);installClassicScripts(page,w)}})}catch(error){constructionError=String(error)}finally{resolve()}}));
 assert.ok(document);const descriptor=Object.getOwnPropertyDescriptor(document,'_currentScript');assert.ok('value' in descriptor);assert.equal(descriptor.value,null);assert.equal(statistics().activeScopes,0);assert.equal(window.document,undefined);page.documentAbort.abort();
 // A closed document can cancel constructor completion; cleanup must hold
 // whether jsdom reports that close during construction or returns normally.
 assert.ok(constructionError===undefined||/document|close|undefined/i.test(constructionError));
});
