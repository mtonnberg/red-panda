import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser } from '../src/browser.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){const deadline=Date.now()+3000;while(!check()){if(Date.now()>deadline)throw new Error('Fresh frame test timed out');await tick();}}
async function fixture(t){const browser=new Browser(),page=browser.createPage(),errors=[];page.on('pageError',error=>errors.push(error.message));t.after(()=>browser.close());await page.navigate('data:text/html,<body><p id=parent>parent</p>');return{browser,page,errors};}
test('fresh blank frame writes execute real scripts synchronously in the actual child realm',async t=>{
 const{page,errors}=await fixture(t);const result=page.evaluate(`(()=>{const frame=document.createElement('iframe');document.body.append(frame);window.frame=frame;const child=frame.contentWindow,doc=frame.contentDocument;const initial=doc.readyState;doc.write('<!doctype html><body><script>window.ranHere=true;window.parentSelf=parent===self;<\/script></body>');doc.close();return {initial,sameWindow:frame.contentWindow===child,sameDocument:frame.contentDocument===doc,ran:child.ranHere,parentSelf:child.parentSelf,parentRan:window.ranHere===true};})()`);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{initial:'complete',sameWindow:true,sameDocument:true,ran:true,parentSelf:false,parentRan:false});await until(()=>page.dom.window.frame.contentDocument.readyState==='complete');assert.deepEqual(errors,[]);
});
test('fresh frame plaintext and split markup share a persistent actual parser until close',async t=>{
 const{page,errors}=await fixture(t);const result=page.evaluate(`(()=>{const frame=document.createElement('iframe');document.body.append(frame);window.frame=frame;const doc=frame.contentDocument;doc.write('WRITE HAPPENED');const first=doc.body.innerHTML;doc.write(' AGAIN');doc.write('<section id="spl');doc.write('it"><b>child</b></section>');const beforeClose=doc.readyState;doc.close();return {first,text:doc.body.textContent,child:doc.querySelector('#split b').textContent,beforeClose};})()`);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{first:'WRITE HAPPENED',text:'WRITE HAPPENED AGAINchild',child:'child',beforeClose:'loading'});await until(()=>page.dom.window.frame.contentDocument.readyState==='complete');assert.deepEqual(errors,[]);
});
test('fresh placeholder lifecycle cannot complete an open write parser and bridge emits once per close',async t=>{
 const{page,errors}=await fixture(t);page.evaluate(`window.frame=document.createElement('iframe');window.frameLoads=0;frame.onload=()=>frameLoads++;document.body.append(frame);window.doc=frame.contentDocument;doc.write('<p>fresh</p>');window.childLoads=0;frame.contentWindow.addEventListener('load',()=>childLoads++);`);
 await tick();await tick();assert.equal(page.dom.window.doc.readyState,'loading');assert.equal(page.dom.window.childLoads,0);assert.equal(page.dom.window.frameLoads,1);
 page.evaluate('doc.close();doc.close()');await until(()=>page.dom.window.doc.readyState==='complete');await tick();assert.equal(page.dom.window.childLoads,1);assert.equal(page.dom.window.frameLoads,2);
 page.evaluate(`doc.open();doc.write('<p>again</p>');frame.contentWindow.addEventListener('load',()=>parent.childLoads++);doc.close();`);await until(()=>page.dom.window.doc.readyState==='complete');await tick();assert.equal(page.dom.window.childLoads,2);assert.equal(page.dom.window.frameLoads,3);assert.deepEqual(errors,[]);
});
test('authored listeners created in the first child load callback remain public and are erased by reset',async t=>{
 const{page,errors}=await fixture(t);page.evaluate(`window.frame=document.createElement('iframe');document.body.append(frame);window.doc=frame.contentDocument;doc.write('<p>fresh</p>');window.called=0;frame.contentWindow.addEventListener('load',function(){this.addEventListener('probe',()=>parent.called++);},{once:true});doc.close();`);
 await until(()=>page.dom.window.doc.readyState==='complete');await tick();page.evaluate(`frame.contentWindow.dispatchEvent(new Event('probe'));doc.open();doc.write('<p>next</p>');doc.close();`);await until(()=>page.dom.window.doc.readyState==='complete');page.evaluate(`frame.contentWindow.dispatchEvent(new Event('probe'))`);assert.equal(page.dom.window.called,1);assert.deepEqual(errors,[]);
});
test('fresh frame modules begin at real close and use the actual child VM',async t=>{
 const{page,errors}=await fixture(t);page.evaluate(`window.frame=document.createElement('iframe');document.body.append(frame);window.doc=frame.contentDocument;doc.write('<script type="module">window.moduleRan=parent!==window;<\/script>');`);await tick();assert.equal(page.dom.window.frame.contentWindow.moduleRan,undefined);assert.equal(page.dom.window.doc.readyState,'loading');page.evaluate('doc.close()');await until(()=>page.dom.window.frame.contentWindow.moduleRan===true);assert.deepEqual(errors,[]);
});
