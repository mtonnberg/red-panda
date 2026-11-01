import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Browser} from '../src/browser.js';
import {getHeapBinding} from '../src/native-heap.js';
import {registerHeapWrapper,heapRegistryStatistics} from '../src/heap-registry.js';
import {queryHeapObjects} from '../src/heap-query.js';
import {platformFactoryRecord} from '../src/platform-factories.js';
import {canonicalNodeImplementation} from '../src/cdp-node-registry.js';
import {hasFirstHTMLDocument} from '../src/html-document-birth.js';
async function fixture(t){const browser=new Browser({timeout:2000,loadResources:['iframe']}),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,<!doctype html><body>actual factory controls');return{browser,page,w:page.dom.window};}
function nativeSpy(binding,watched){
 const descriptor=Object.getOwnPropertyDescriptor(binding,'proxyTargets'),original=descriptor.value,calls=[];
 Object.defineProperty(binding,'proxyTargets',{...descriptor,value:function(value){if(watched.has(value))calls.push(value);return Reflect.apply(original,binding,arguments);}});
 return{calls,restore(){Object.defineProperty(binding,'proxyTargets',descriptor);}};
}

test('plain canonical fronts and authored objects avoid unnecessary native target arrays while keeping registration',{timeout:5000},async t=>{
 const{w}=await fixture(t),binding=getHeapBinding(),node=w.document.createElement('div'),plain=w.eval('({})'),watched=new Set([node,plain]),spy=nativeSpy(binding,watched);let getterHits=0;
 Object.defineProperty(plain,Symbol.toStringTag,{get(){getterHits++;throw Error('authored tag');}});Object.defineProperty(plain,'constructor',{get(){getterHits++;throw Error('authored constructor');}});
 const original=platformFactoryRecord(node),before=heapRegistryStatistics().registrations;
 try{assert.equal(registerHeapWrapper(node,w),node);assert.equal(registerHeapWrapper(plain,w),plain);}finally{spy.restore();}
 assert.equal(spy.calls.length,0,'real nonProxy path creates no native proxyTargets result array');assert.equal(getterHits,0);assert.equal(heapRegistryStatistics().registrations,before+2);assert.equal(platformFactoryRecord(node),original);assert.equal(canonicalNodeImplementation(node),original.implementation);assert.equal(platformFactoryRecord(plain),undefined);
});

test('genuine nested Proxy targets preserve exact native extraction and the original32 depth boundary',{timeout:5000},async t=>{
 const{w}=await fixture(t),binding=getHeapBinding(),target=w.eval('({})');let depth32=target;for(let n=0;n<32;n++)depth32=new w.Proxy(depth32,{});const depth33=new w.Proxy(depth32,{}),spy=nativeSpy(binding,new Set([depth32,depth33]));
 try{assert.equal(registerHeapWrapper(depth32,w),depth32);assert.throws(()=>registerHeapWrapper(depth33,w),error=>error.code==='ERR_HEAP_QUERY_PROXY_DEPTH'&&error.message==='ERR_HEAP_QUERY_PROXY_DEPTH');}finally{spy.restore();}
 assert.deepEqual(spy.calls,[depth32,depth33]);const targets=Reflect.apply(Object.getOwnPropertyDescriptor(binding,'proxyTargets').value,binding,[depth32]);assert.equal(targets.length,32);assert.equal(targets[31],target);
});

test('revoked Proxies keep the genuine native error and never invoke authored access traps',{timeout:5000},async t=>{
 const{w}=await fixture(t),binding=getHeapBinding();let hits=0;const revocable=w.Proxy.revocable(w.eval('({})'),{get(){hits++;throw Error('authored get');},getPrototypeOf(){hits++;throw Error('authored prototype');},ownKeys(){hits++;throw Error('authored keys');}});revocable.revoke();const spy=nativeSpy(binding,new Set([revocable.proxy]));
 try{assert.throws(()=>registerHeapWrapper(revocable.proxy,w),error=>error.code==='ERR_HEAP_QUERY_REVOKED_FACTORY_PROXY'&&error.message==='ERR_HEAP_QUERY_REVOKED_FACTORY_PROXY');}finally{spy.restore();}
 assert.equal(spy.calls.length,1);assert.equal(hits,0);
});

test('actual heap query canonicalizes real nested Proxy targets into the published front and real selected Array',{timeout:15000},async t=>{
 const{page,w}=await fixture(t);w.eval('globalThis.factoryP={};globalThis.factoryTarget=Object.create(factoryP);globalThis.factoryInner=new Proxy(factoryTarget,{});globalThis.factoryOuter=new Proxy(factoryInner,{})');
 registerHeapWrapper(w.factoryOuter,w);const result=queryHeapObjects(w.factoryP,page.dom.getInternalVMContext());
 assert.equal(result.objects.length,1);assert.equal(result.objects[0],w.factoryOuter);assert.equal(Object.getPrototypeOf(result.objects),w.Array.prototype);assert.equal(result.objects.includes(w.factoryTarget),false);assert.equal(result.objects.includes(w.factoryInner),false);
});

test('public heap publication never grants a DOM backend brand to authored lookalikes',{timeout:5000},async t=>{
 const{w}=await fixture(t),real=w.document.createElement('div'),fake=w.eval('Object.create(HTMLDivElement.prototype)');registerHeapWrapper(fake,w);
 assert.equal(platformFactoryRecord(fake),undefined);assert.equal(canonicalNodeImplementation(fake),undefined);assert.throws(()=>w.document.body.appendChild(fake),w.TypeError);assert.equal(real.ownerDocument,w.document);w.document.body.appendChild(real);assert.equal(w.document.body.lastChild,real);
});

test('Document birth remains on the same real VM shells and nonDocument factories never gain the Document brand',{timeout:8000},async t=>{
 const{w}=await fixture(t),binding=getHeapBinding(),d=w.document,anchor=w.eval('[]'),inert=d.implementation.createHTMLDocument('actual'),xml=d.implementation.createDocument('urn:actual','a:root',null);
 for(const document of[d,inert]){assert.equal(hasFirstHTMLDocument(document),true);assert.equal(Object.getPrototypeOf(document),w.HTMLDocument.prototype);assert.equal(binding.sameRealm(document,anchor),true);const prototype=Object.getPrototypeOf(document);try{Object.setPrototypeOf(document,null);assert.equal(binding.sameRealm(document,anchor),true);}finally{Object.setPrototypeOf(document,prototype);}}
 assert.equal(hasFirstHTMLDocument(xml),false);assert.equal(xml instanceof w.XMLDocument,true);assert.equal(binding.sameRealm(xml,anchor),true);
 for(const value of[d.createElement('div'),d.createTextNode('actual'),d.createComment('actual'),new w.Event('actual')]){assert.equal(hasFirstHTMLDocument(value),false);assert.equal(binding.sameRealm(value,anchor),true);}
 const frame=d.createElement('iframe');d.body.append(frame);const child=frame.contentWindow,childDocument=child.document,childAnchor=child.eval('[]');assert.equal(hasFirstHTMLDocument(childDocument),true);assert.equal(Object.getPrototypeOf(childDocument),child.HTMLDocument.prototype);assert.equal(binding.sameRealm(childDocument,childAnchor),true);assert.equal(binding.sameRealm(childDocument,anchor),false);
});
