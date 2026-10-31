import {test}from'node:test';
import assert from'node:assert/strict';
import {setTimeout as delay}from'node:timers/promises';
import {JSDOM}from'jsdom';
import {Browser}from'../src/browser.js';
import {installCustomElements}from'../src/custom-elements.js';
async function fixture(action,html='<!doctype html><body>'){
 const browser=new Browser({timeout:2000,loadResources:['iframe','worker']}),page=browser.createPage();
 try{await page.navigate('data:text/html,'+encodeURIComponent(html));await action({browser,page,window:page.dom.window});}finally{browser.close();}
}

test('whenDefined stores one pending genuine realm Promise and resolves actual constructor identity',()=>fixture(async({window:w})=>{
 class X extends w.HTMLElement{};const a=w.customElements.whenDefined('test-pending'),b=w.customElements.whenDefined('test-pending');assert.equal(a,b);assert.equal(a instanceof w.Promise,true);w.customElements.define('test-pending',X);assert.equal(await a,X);const c=w.customElements.whenDefined('test-pending'),d=w.customElements.whenDefined('test-pending');assert.equal(c instanceof w.Promise,true);assert.notEqual(c,a);assert.notEqual(c,d);assert.equal(await c,X);assert.equal(w.customElements.getName(X),'test-pending');assert.equal(w.customElements.getName(class extends w.HTMLElement{}),null);assert.equal(w.customElements.getName(()=>{}),null);
}));

test('registry errors retain genuine realm brands and invalid names reject rather than throw',()=>fixture(async({window:w})=>{
 const p=w.customElements.whenDefined('invalid');assert.equal(p instanceof w.Promise,true);await assert.rejects(p,e=>e instanceof w.DOMException&&e.name==='SyntaxError');for(const args of [[],[1],[{}]])assert.throws(()=>w.customElements.getName(...args),w.TypeError);assert.throws(()=>w.customElements.getName.call({},class{}),w.TypeError);assert.throws(()=>w.customElements.define('no-hyphen',()=>{}));
}));

test('generic customized built-ins use a real tagged node with constructor-visible is and no invented initial reaction',()=>fixture(async({window:w})=>{
 const calls=[];class X extends w.HTMLElement{static observedAttributes=['is'];constructor(){super();calls.push(['ctor',this.getAttribute('is')]);this.marker=true;}attributeChangedCallback(...args){calls.push(['attr',...args.slice(0,3)])}}
 w.customElements.define('test-button',X,{extends:'button'});const button=w.document.createElement('button',{is:'test-button'});assert.equal(button instanceof X,true);assert.equal(button instanceof w.HTMLElement,true);assert.equal(button instanceof w.HTMLButtonElement,false);assert.equal(button.localName,'button');assert.equal(button.getAttribute('is'),'test-button');assert.equal(button.marker,true);assert.deepEqual(calls,[['ctor','test-button']]);button.setAttribute('is','changed');assert.deepEqual(calls[1],['attr','is','test-button','changed']);assert.throws(()=>new X(),e=>e instanceof w.Error&&e.name==='Error'&&e.message==='Illegal Constructor');
 const unknown=w.document.createElement('div',{is:'not-registered'});assert.equal(unknown.getAttribute('is'),'not-registered');assert.equal(unknown.outerHTML,'<div is="not-registered"></div>');
}));

test('typed customized classes retain their actual prototype and direct construction rejects in the realm',()=>fixture(async({window:w})=>{
 class Typed extends w.HTMLButtonElement{};w.customElements.define('test-typed',Typed,{extends:'button'});const e=w.document.createElement('button',{is:'test-typed'});assert.equal(e instanceof Typed,true);assert.equal(e instanceof w.HTMLButtonElement,true);assert.equal(e.localName,'button');assert.throws(()=>new Typed(),w.TypeError);assert.throws(()=>new w.HTMLDivElement(),w.TypeError);assert.throws(()=>new w.HTMLElement(),w.TypeError);assert.equal(Object.getPrototypeOf(w.HTMLButtonElement),w.HTMLElement);assert.equal(w.HTMLButtonElement.prototype.constructor,w.HTMLButtonElement);
}));

test('registered local tag and actual inherited custom prototype stay distinct when native permits a mismatched typed base',()=>fixture(async({window:w})=>{
 class Typed extends w.HTMLButtonElement{};w.customElements.define('test-div-button-base',Typed,{extends:'div'});const e=w.document.createElement('div',{is:'test-div-button-base'});assert.equal(e.localName,'div');assert.equal(e instanceof Typed,true);assert.equal(e instanceof w.HTMLButtonElement,true);assert.equal(e.getAttribute('is'),'test-div-button-base');
}));

test('main parser constructs autonomous elements before attributes and connects before children and next script',()=>fixture(async({window:w})=>{
 assert.deepEqual(JSON.parse(JSON.stringify(w.beforeNext)),[['ctor','',true],['attr','id',null,'a'],['connect','a',0],['buttonCtor','b'],['buttonConnect','b']]);
},`<!doctype html><body><script>globalThis.trace=[];class A extends HTMLElement{static observedAttributes=['id'];constructor(){super();trace.push(['ctor',this.id,this.parentNode===null])}attributeChangedCallback(n,o,v){trace.push(['attr',n,o,v])}connectedCallback(){trace.push(['connect',this.id,this.childNodes.length])}}customElements.define('parser-a',A);class B extends HTMLElement{constructor(){super();trace.push(['buttonCtor',this.id])}connectedCallback(){trace.push(['buttonConnect',this.id])}}customElements.define('parser-b',B,{extends:'button'});</script><parser-a id=a><i></i></parser-a><button is=parser-b id=b></button><script>globalThis.beforeNext=trace.slice();</script>`));

test('real persistent document.write parser uses the same custom-element insertion boundaries',()=>fixture(async({window:w})=>{
 w.eval(`globalThis.calls=[];class X extends HTMLElement{connectedCallback(){calls.push(this.id)}};customElements.define('write-element',X);`);const doc=w.document;doc.open();doc.write('<!doctype html><body><write-element id=a>');doc.write('</write-element><script>globalThis.inScript=calls.slice()</script>');doc.close();assert.deepEqual([...w.inScript],['a']);assert.equal(w.document,doc);
}));

test('fragment parsing upgrades after the real fragment is built and preserves constructor moves',()=>fixture(async({window:w})=>{
 const container=w.document.createElement('div');let n=0;class X extends w.HTMLElement{constructor(){super();n++;container.append(this)}}w.customElements.define('test-foster',X);container.innerHTML='<table><test-foster></test-foster></table>';assert.equal(n,1);assert.equal(container.firstElementChild instanceof w.HTMLTableElement,true);assert.equal(container.lastElementChild instanceof X,true);
}));

test('actual declaration writes deliver style attribute reactions synchronously and real MutationRecords later',()=>fixture(async({window:w})=>{
 const calls=[],records=[];class X extends w.HTMLElement{static observedAttributes=['style'];attributeChangedCallback(n,o,v){calls.push([o,v])}}w.customElements.define('test-style',X);const e=new X();new w.MutationObserver(values=>records.push(...values)).observe(e,{attributes:true,attributeOldValue:true});e.style.setProperty('color','red');assert.deepEqual(calls,[[null,'color: red;']]);assert.equal(records.length,0);e.style.cssText='width: 1px;';e.style.borderWidth='2px';e.style.cssFloat='left';e.style.removeProperty('width');e.style='color: green;';assert.equal(calls.length,6);assert.equal(calls[5][1],e.getAttribute('style'));await delay(5);assert.equal(records.length,6);assert.equal(records.every(r=>r.target===e&&r.attributeName==='style'),true);
}));

test('reentrant style reflection completes actual writes without stale deferred ping-pong',()=>fixture(async({window:w})=>{
 let n=0;class X extends w.HTMLElement{static observedAttributes=['style'];attributeChangedCallback(name,old,value){n++;if(n>20)throw Error('reaction loop');if(old!==value)this.style=value;}}w.customElements.define('test-reflect-style',X);const e=new X();e.setAttribute('style','transform: rotate(180deg);');e.style.opacity='0.3';assert.equal(n,4);assert.equal(e.getAttribute('style'),'transform: rotate(180deg); opacity: 0.3;');await delay(5);assert.equal(n,4);
}));

test('custom-element callback failures go through genuine Window error events and future reactions continue',()=>fixture(async({window:w})=>{
 const errors=[],calls=[];w.addEventListener('error',e=>{errors.push(e);e.preventDefault()});class X extends w.HTMLElement{static observedAttributes=['style'];attributeChangedCallback(n,o,v){calls.push(v);if(calls.length===1)throw new w.Error('attribute fail')}}w.customElements.define('test-callback-error',X);const e=new X();e.style.color='red';e.style.color='green';assert.deepEqual(calls,['color: red;','color: green;']);assert.equal(errors.length,1);assert.equal(errors[0] instanceof w.ErrorEvent,true);assert.equal(errors[0].isTrusted,true);assert.equal(errors[0].error instanceof w.Error,true);
}));

test('template owner is the actual shared complete inert HTMLDocument and stamping upgrades only the copy',()=>fixture(async({window:w})=>{
 const calls=[];class X extends w.HTMLElement{constructor(){super();calls.push('ctor')}connectedCallback(){calls.push('connected')}}w.customElements.define('test-inert-template',X);const t=w.document.createElement('template');t.innerHTML='<test-inert-template></test-inert-template>';const d=t.content.ownerDocument,e=t.content.firstChild;assert.notEqual(d,w.document);assert.equal(d instanceof w.HTMLDocument,true);assert.equal(d.defaultView,null);assert.equal(d.documentElement,null);assert.equal(d.URL,'about:blank');assert.equal(d.readyState,'complete');assert.equal(d,w.document.createElement('template').content.ownerDocument);w.customElements.upgrade(t.content);assert.equal(e instanceof X,false);assert.deepEqual(calls,[]);const stamped=w.document.importNode(t.content,true);assert.equal(stamped.firstChild instanceof X,true);w.document.body.append(stamped);assert.deepEqual(calls,['ctor','connected']);assert.equal(e instanceof X,false);
}));

test('cross-document ShadowRoot insertion moves actual children once, preserves its host ownership and batches removal',()=>fixture(async({window:w})=>{
 const calls=[],records=[];const old=w.document,next=old.implementation.createHTMLDocument('next');class X extends w.HTMLElement{disconnectedCallback(){calls.push(['disconnected',this.ownerDocument===next])}adoptedCallback(a,b){calls.push(['adopted',a===old,b===next])}connectedCallback(){calls.push(['connected',this.ownerDocument===next])}}w.customElements.define('test-shadow-move',X);const host=old.createElement('div'),root=host.attachShadow({mode:'closed'}),a=new X(),b=new X();root.append(a,b);old.body.append(host);calls.length=0;new w.MutationObserver(values=>records.push(...values)).observe(root,{childList:true});assert.equal(next.body.appendChild(root),root);assert.equal(root.ownerDocument,old);assert.equal(root.isConnected,true);assert.equal(root.childNodes.length,0);assert.equal(a.parentNode,next.body);assert.equal(b.parentNode,next.body);assert.deepEqual(calls,[['disconnected',true],['adopted',true,true],['connected',true],['disconnected',true],['adopted',true,true],['connected',true]]);await delay(5);assert.equal(records.length,1);assert.equal(records[0].target,root);assert.deepEqual([...records[0].removedNodes],[a,b]);assert.equal(records[0].addedNodes.length,0);
}));

test('failed cross-document insertion validates hierarchy before changing the source shadow tree',()=>fixture(async({window:w})=>{
 const host=w.document.createElement('div'),root=host.attachShadow({mode:'open'}),a=w.document.createElement('i'),b=w.document.createElement('b');root.append(a,b);w.document.body.append(host);const other=w.document.implementation.createHTMLDocument();assert.throws(()=>other.append(root),e=>e.name==='HierarchyRequestError');assert.deepEqual([...root.children],[a,b]);assert.equal(a.ownerDocument,w.document);
}));

test('frame registries and HTML constructors remain distinct genuine realm surfaces',()=>fixture(async({window:w})=>{
 const frame=w.document.createElement('iframe');w.document.body.append(frame);const child=frame.contentWindow;child.eval(`class FrameButton extends HTMLElement{};customElements.define('frame-custom-button',FrameButton,{extends:'button'});globalThis.Created=FrameButton;`);const el=child.document.createElement('button',{is:'frame-custom-button'});assert.equal(el instanceof child.Created,true);assert.equal(el instanceof child.HTMLElement,true);assert.equal(el instanceof w.HTMLElement,false);assert.equal(child.customElements.getName(child.Created),'frame-custom-button');assert.equal(w.customElements.getName(child.Created),null);assert.equal(child.customElements.whenDefined('frame-custom-button') instanceof child.Promise,true);frame.remove();
}));

test('private hooks leave an unrelated jsdom Window and host constructors untouched',async()=>{
 const outside=new JSDOM('',{runScripts:'outside-only'}),w=outside.window,C=w.HTMLElement,B=w.HTMLButtonElement,hostAbort=globalThis.AbortSignal;
 try{await fixture(async()=>{assert.equal(w.HTMLElement,C);assert.equal(w.HTMLButtonElement,B);assert.equal(w.HTMLElement.prototype.constructor,C);assert.equal(w.HTMLButtonElement.prototype.constructor,B);assert.equal(w.customElements.getName,undefined);assert.equal(globalThis.AbortSignal,hostAbort)});}finally{w.close();}
});

test('native-observed registry and constructor paths keep the actual realm intrinsics when public aliases/statics are overwritten',()=>fixture(async({window:w})=>{
 class X extends w.HTMLElement{};w.customElements.define('test-intrinsic-ctor',X);const PromiseConstructor=w.Promise,resolve=PromiseConstructor.resolve,reject=PromiseConstructor.reject,TypeErrorConstructor=w.TypeError,Exception=w.DOMException;let valid,invalid;
 try{PromiseConstructor.resolve=()=>{throw 'authored resolve'};PromiseConstructor.reject=()=>{throw 'authored reject'};w.Promise=class FakePromise{};w.TypeError=class FakeTypeError{};w.DOMException=class FakeDOMException{};valid=w.customElements.whenDefined('test-intrinsic-ctor');invalid=w.customElements.whenDefined('bad');assert.equal(valid instanceof PromiseConstructor,true);assert.equal(invalid instanceof PromiseConstructor,true);assert.throws(()=>new w.HTMLDivElement(),TypeErrorConstructor);assert.throws(()=>w.customElements.getName(1),TypeErrorConstructor);}finally{w.Promise=PromiseConstructor;PromiseConstructor.resolve=resolve;PromiseConstructor.reject=reject;w.TypeError=TypeErrorConstructor;w.DOMException=Exception;}assert.equal(await valid,X);await assert.rejects(invalid,e=>e instanceof Exception&&e.name==='SyntaxError');
}));

test('installation restores private generated constructors without modifying supplied host replacements',()=>{
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;class HostReplacement{}const prototype=HostReplacement.prototype,parent=Object.getPrototypeOf(HostReplacement),page={closed:false,documentAbort:new AbortController()};w.HTMLElement=HostReplacement;w.HTMLButtonElement=HostReplacement;const controller=installCustomElements(page,w);
 try{assert.notEqual(w.HTMLElement,HostReplacement);assert.notEqual(w.HTMLButtonElement,HostReplacement);assert.equal(HostReplacement.prototype,prototype);assert.equal(HostReplacement.prototype.constructor,HostReplacement);assert.equal(Object.getPrototypeOf(HostReplacement),parent);class X extends w.HTMLElement{}w.customElements.define('standalone-private-original',X,{extends:'button'});assert.equal(w.document.createElement('button',{is:'standalone-private-original'}) instanceof X,true);}finally{controller.dispose();page.documentAbort.abort();w.close();}
});
