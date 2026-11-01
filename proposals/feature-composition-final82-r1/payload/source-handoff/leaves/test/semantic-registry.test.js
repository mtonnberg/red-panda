import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Browser} from '../src/browser.js';
import {createIsolatedWorld} from '../src/isolated-world.js';
import {installNamespaceSerialization} from '../src/namespace-serialization.js';
import {getHeapBinding} from '../src/native-heap.js';
import {canonicalNodeImplementation,registerCDPNode,cdpNodeEntry,cdpNodeMap,cdpNodeOwner,registerCDPNodeRealm} from '../src/cdp-node-registry.js';
const binding=getHeapBinding(),proofs=[];
function physical(value,anchor,label){const original=Object.getPrototypeOf(value),before={selected:binding.sameRealm(value,anchor),host:binding.sameRealm(value,{}),global:binding.creationGlobal(value)===binding.creationGlobal(anchor)};let after;try{Object.setPrototypeOf(value,null);after={selected:binding.sameRealm(value,anchor),host:binding.sameRealm(value,{}),global:binding.creationGlobal(value)===binding.creationGlobal(anchor)}}finally{Object.setPrototypeOf(value,original)}assert.deepEqual(before,{selected:true,host:false,global:true});assert.deepEqual(after,before);proofs.push({label,before,after});console.log('SEMANTIC_CREATION_PROOF '+JSON.stringify({label,before,after}));}
async function fixture(t){const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,<main><button id="live">Actual</button><input id="file" type="file"></main>');return{browser,page,w:page.dom.window,context:page.context};}
test('registry preserves genuine canonical first frontend and actual VM birth before and after prototype null', {timeout:6000},async t=>{
 const{page,w,context}=await fixture(t),button=w.document.getElementById('live'),node=canonicalNodeImplementation(button),id=registerCDPNode(context,button);
 physical(button,w.Object.prototype,'main button');physical(w.document,w.Object.prototype,'main document');assert.equal(cdpNodeEntry(context,id).node,node);assert.equal(cdpNodeMap(context).get(id),button);assert.equal(registerCDPNode(context,button),id);
 const prototype=Object.getPrototypeOf(button);try{Object.setPrototypeOf(button,null);assert.equal(registerCDPNode(context,button),id);assert.equal(cdpNodeEntry(context,id).node,node);}finally{Object.setPrototypeOf(button,prototype);}
});
test('copied symbols, Proxy forwarding and lookalike public Node fields do not confer registry authority or invoke authored traps',{timeout:6000},async t=>{
 const{w,context}=await fixture(t),node=w.document.getElementById('live');let reads=0;const fake=Object.create(Object.getPrototypeOf(node));Object.defineProperties(fake,Object.getOwnPropertyDescriptors(node));
 const proxy=new Proxy(node,{get(){reads++;throw Error('public trap')},getOwnPropertyDescriptor(){reads++;throw Error('descriptor trap')},getPrototypeOf(){reads++;throw Error('prototype trap')}});
 for(const value of[fake,proxy,{nodeType:1,ownerDocument:w.document}]){assert.equal(canonicalNodeImplementation(value),undefined);assert.throws(()=>registerCDPNode(context,value),/genuine registered/);}
 assert.equal(reads,0);assert.ok(registerCDPNode(context,node)>0);
});
test('detachment retains actual IDs while navigation retires the true generation and never reuses its number',{timeout:6000},async t=>{
 const{page,w,context}=await fixture(t),node=w.document.getElementById('live'),id=registerCDPNode(context,node);node.remove();assert.equal(cdpNodeMap(context).get(id),node);assert.ok(cdpNodeOwner(canonicalNodeImplementation(node),context));
 await page.navigate('data:text/html,<button id="next">New actual</button>');assert.equal(cdpNodeMap(context).get(id),undefined);const next=registerCDPNode(context,page.dom.window.document.getElementById('next'));assert.ok(next>id);assert.throws(()=>registerCDPNode(context,node),/retired/);
});
test('genuine utility aliases retain the same backend ID while utility creation contexts and first frontends remain real',{timeout:6000},async t=>{
 const{page,w,context}=await fixture(t),world=createIsolatedWorld(w,{signal:page.documentAbort.signal,onRealm:(global,actual)=>registerCDPNodeRealm(page,global,actual)});t.after(()=>world.dispose());
 // Match production world-sessions' genuine utility DOMParser factory setup.
 installNamespaceSerialization(world.global,{context:world.context,createDocument:world.createDocument});
 const main=w.document.getElementById('live'),alias=world.evaluate('document.getElementById("live")');physical(alias,world.global.Object.prototype,'utility button');assert.notEqual(alias,main);assert.equal(canonicalNodeImplementation(alias),canonicalNodeImplementation(main));assert.equal(registerCDPNode(context,alias),registerCDPNode(context,main));assert.equal(cdpNodeMap(context).get(registerCDPNode(context,alias)),main);
 const inactive=world.evaluate('new DOMParser().parseFromString("<actual/>","application/xml").documentElement'),id=registerCDPNode(context,inactive);assert.ok(cdpNodeEntry(context,id));assert.equal(cdpNodeOwner(canonicalNodeImplementation(inactive),context),undefined);
});
test('genuine nodes from a different actual BrowserContext cannot enter the selected registry',{timeout:6000},async t=>{
 const{browser,context}=await fixture(t),other=browser.createPage(browser.createContext());await other.navigate('data:text/html,<button>Foreign</button>');const node=other.dom.window.document.querySelector('button');assert.throws(()=>registerCDPNode(context,node),/different/);const id=registerCDPNode(other.context,node);assert.equal(cdpNodeMap(context).get(id),undefined);
});
test('context-shared lookup outlives a session view and genuine Page.close removes its document identities',{timeout:6000},async t=>{
 const{page,w,context}=await fixture(t),a=cdpNodeMap(context),b=cdpNodeMap(context),node=w.document.getElementById('live'),id=registerCDPNode(context,node);assert.notEqual(a,b);assert.equal(a.get(id),b.get(id));assert.equal(typeof a.clear,'undefined');page.close();assert.equal(a.get(id),undefined);assert.equal(b.get(id),undefined);
});
