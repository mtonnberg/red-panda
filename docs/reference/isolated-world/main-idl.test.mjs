import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {alignMainIDLPrototypes} from './main-idl-prototypes.mjs';

test('measured main IDL shapes use actual prototype links without changing canonical identities or shared CSS',t=>{
 let identities;const dom=new JSDOM('<p id=p x=one></p>',{runScripts:'dangerously',beforeParse(window){identities={Window:window.Window,EventTarget:window.EventTarget,document:window.document,objectBase:Object.getPrototypeOf(window.EventTarget.prototype),CSSStyleDeclaration:window.CSSStyleDeclaration,cssBase:Object.getPrototypeOf(window.CSSStyleDeclaration.prototype)};alignMainIDLPrototypes(window);}});t.after(()=>dom.window.close());const w=dom.window;assert.equal(w.Window,identities.Window);assert.equal(w.EventTarget,identities.EventTarget);assert.equal(w.document,identities.document);assert.equal(Object.getPrototypeOf(w.EventTarget.prototype),identities.objectBase);assert.equal(w.CSSStyleDeclaration,identities.CSSStyleDeclaration);assert.equal(Object.getPrototypeOf(w.CSSStyleDeclaration.prototype),identities.cssBase);
 assert.deepEqual(JSON.parse(w.eval('JSON.stringify({documentObject:document instanceof Object,queryFunction:document.querySelector instanceof Function,nodeConstructor:Node instanceof Function,listObject:document.querySelectorAll("p") instanceof Object,listConstructor:NodeList instanceof Function,namesArray:document.querySelector("p").getAttributeNames() instanceof Array,navigatorObject:navigator instanceof Object})')),{documentObject:true,queryFunction:true,nodeConstructor:true,listObject:true,listConstructor:true,namesArray:true,navigatorObject:true});
});

test('sequence method is nonconstructable, keeps descriptors and returns its creation realm when borrowed or globals are poisoned',t=>{
 const create=()=>new JSDOM('<p id=p x=one></p>',{runScripts:'dangerously',beforeParse:alignMainIDLPrototypes}),parent=create(),child=create();t.after(()=>{parent.window.close();child.window.close();});const pw=parent.window,cw=child.window,method=pw.Element.prototype.getAttributeNames,parentArray=pw.Array,childArray=cw.Array;
 assert.equal(method.name,'getAttributeNames');assert.equal(method.length,0);assert.equal(Object.hasOwn(method,'prototype'),false);assert.throws(()=>new method(),TypeError);assert.equal(Object.getOwnPropertyDescriptor(pw.Element.prototype,'getAttributeNames').enumerable,true);const borrowed=Reflect.apply(method,cw.document.getElementById('p'),[]);assert.equal(borrowed instanceof parentArray,true);assert.equal(borrowed instanceof childArray,false);
 pw.eval('Array={from(){throw new Error("poisoned from")}};Reflect.apply=()=>{throw new Error("poisoned apply")};');const names=Reflect.apply(method,pw.document.getElementById('p'),[]);assert.equal(names instanceof parentArray,true);assert.deepEqual(Array.from(names),['id','x']);
});
