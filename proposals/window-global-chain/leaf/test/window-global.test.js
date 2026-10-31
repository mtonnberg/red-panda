import{test}from'node:test';
import assert from'node:assert/strict';
import vm from'node:vm';
import{JSDOM}from'jsdom';
import{createRequire}from'node:module';
import{Browser}from'../src/browser.js';
import{originalGlobalPrototypeFor}from'../src/context-names.js';
import{restoreWindowGlobalInheritance}from'../src/window-global.js';
import{createIsolatedWorld}from'../src/isolated-world.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js'),tracker=require('jsdom/lib/jsdom/named-properties-tracker.js');

function assertChain(window,context){
 const intrinsic=Object.getPrototypeOf(window);
 if(originalGlobalPrototypeFor(context))assert.equal(intrinsic,originalGlobalPrototypeFor(context));
 assert.notEqual(intrinsic,window.Window.prototype);assert.equal(Object.getPrototypeOf(intrinsic),window.Window.prototype);
 assert.equal(Object.getPrototypeOf(window.Window.prototype),window.EventTarget.prototype);assert.equal(Object.getPrototypeOf(window.EventTarget.prototype),window.Object.prototype);
 assert.deepEqual(Object.getOwnPropertyNames(intrinsic),['constructor']);assert.notEqual(intrinsic.constructor,window.Window);assert.equal(intrinsic.constructor.name,'Window');assert.equal(intrinsic.constructor.prototype,intrinsic);
 assert.equal(Reflect.apply(intrinsic.constructor,undefined,[]),window);
 const constructed=new intrinsic.constructor();assert.equal(Object.getPrototypeOf(constructed),intrinsic);assert.equal(constructed instanceof window.Window,true);assert.equal(constructed instanceof window.EventTarget,true);
}

test('main and frame globals retain their actual intrinsic global prototype and real Window/EventTarget inheritance',async t=>{
 const browser=new Browser({loadResources:['iframe']}),page=browser.createPage();t.after(()=>browser.close());
 await page.navigate('data:text/html,<p>root</p><iframe id=f srcdoc="<p>child</p>"></iframe>');
 const main=page.dom.window,child=main.document.getElementById('f').contentWindow,frame=page.frames.findElement(main.document.getElementById('f'));
 for(const[w,context]of[[main,page.dom.getInternalVMContext()],[child,frame.dom.getInternalVMContext()]]){
  assertChain(w,context);let current;w.addEventListener('actual-global',function(){current=this});w.dispatchEvent(new w.Event('actual-global'));assert.equal(current,w);
 }
});

test('genuine utility globals use their original VM layer over real generated EventTarget wrappers',t=>{
 const dom=new JSDOM('<p id=p>text</p>',{runScripts:'dangerously'}),world=createIsolatedWorld(dom.window);t.after(()=>{world.dispose();dom.window.close()});
 assertChain(world.global,world.context);
 assert.equal(world.evaluate('globalThis.eventThis=false;addEventListener("actual-global",function(){eventThis=this===globalThis});dispatchEvent(new Event("actual-global"));eventThis'),true);
 assert.equal(world.evaluate('document.getElementById("p") instanceof HTMLParagraphElement'),true);
});

test('original prototype capture uses the actual global rather than supplied public Object/globalThis aliases',()=>{
 let calls=0;const context=vm.createContext({Object:{getPrototypeOf(){calls++;throw Error('authored')}},globalThis:{fake:true}});
 const actual=vm.runInContext('this',context);assert.equal(originalGlobalPrototypeFor(context),Object.getPrototypeOf(actual));assert.equal(calls,0);
});

test('restoring inheritance preserves the actual named-property tracker, duplicate live collections and lexical shadowing',t=>{
 let before,tracking,ctor;const dom=new JSDOM('<body>',{runScripts:'dangerously',beforeParse(window){before=window.document;ctor=window.Window;tracking=tracker.get(window._globalObject);restoreWindowGlobalInheritance(window,utils.implForWrapper(window.document)._globalObject)}});t.after(()=>dom.window.close());
 const w=dom.window,d=w.document;assert.equal(d,before);assert.equal(w.Window,ctor);assert.equal(tracker.get(w._globalObject),tracking);
 const a=d.createElement('div'),b=d.createElement('div');a.id=b.id='actualNamed';d.body.append(a);assert.equal(w.actualNamed,a);d.body.append(b);const collection=w.actualNamed;assert.equal(collection instanceof w.HTMLCollection,true);assert.deepEqual([...collection],[a,b]);a.remove();assert.equal(w.actualNamed,b);b.id='renamed';assert.equal(w.actualNamed,undefined);assert.equal(w.renamed,b);b.remove();assert.equal(w.renamed,undefined);
 const form=d.createElement('form');form.name='actualForm';d.body.append(form);assert.equal(w.actualForm,form);form.name='nextForm';assert.equal(w.actualForm,undefined);assert.equal(w.nextForm,form);w.nextForm=17;form.remove();assert.equal(w.nextForm,17);
 const context=utils.implForWrapper(d)._globalObject;vm.runInContext('let namedLexical=51',context);const element=d.createElement('i');element.id='namedLexical';d.body.append(element);assert.equal(vm.runInContext('namedLexical',context),51);assert.equal(w.namedLexical,element);
});

test('foreign and retired frames keep actual document-driven ID/name access after global prototype restoration',async t=>{
 const browser=new Browser({loadResources:['iframe']}),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,<iframe id=f name=actualFrame srcdoc="<p>child</p>"></iframe>');
 const w=page.dom.window,frame=w.document.getElementById('f'),child=frame.contentWindow,node=child.document.createElement('div');node.id='foreignNode';child.document.body.append(node);
 assert.equal(w.actualFrame,child);assert.equal(child.foreignNode,node);node.id='nextNode';assert.equal(child.foreignNode,undefined);assert.equal(child.nextNode,node);frame.name='nextFrame';assert.equal(w.actualFrame,undefined);assert.equal(w.nextFrame,child);
 frame.remove();assert.equal(child.closed,true);assert.equal(child.nextNode,node);
});
