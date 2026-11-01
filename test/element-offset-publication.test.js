import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {JSDOM} from 'jsdom';
import {Browser} from '../src/browser.js';
import {installLayout} from '../src/layout.js';
import {platformFactoryRecord} from '../src/platform-factories.js';
import {getHeapBinding} from '../src/native-heap.js';
const offsets=['offsetWidth','offsetHeight','offsetTop','offsetLeft','offsetParent'];
const H='http://www.w3.org/1999/xhtml',S='http://www.w3.org/2000/svg',M='http://www.w3.org/1998/Math/MathML';
const heap=getHeapBinding();
async function fixture(t){
 let browser;
 const server=http.createServer((req,res)=>{const body=req.url==='/child'?'<body>child': '<body><iframe src="/child"></iframe>';res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(body)});
 t.after(async()=>{try{await browser?.close()}finally{server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve))}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 browser=new Browser({loadResources:['iframe']});const page=browser.createPage();await page.navigate('http://127.0.0.1:'+server.address().port+'/main');
 const w=page.dom.window,child=w.document.querySelector('iframe').contentWindow;
 assert.equal(child.document.readyState,'complete');assert.match(child.document.URL,/\/child$/);
 return{w,child,page};
}
function actualRealm(value,anchor){const proto=Object.getPrototypeOf(value);try{for(let i=0;i<2;i++){assert.equal(heap.sameRealm(value,anchor),true);assert.equal(heap.sameRealm(value,[]),false);assert.equal(heap.creationGlobal(value),heap.creationGlobal(anchor));Object.setPrototypeOf(value,null)}}finally{Object.setPrototypeOf(value,proto)}}
function getter(w,name){return Object.getOwnPropertyDescriptor(w.Element.prototype,name).get}
function element(doc,ns,name,parent,width=45.625,height=22.875){const n=doc.createElementNS(ns,name);n.setAttribute('style',`width:${width}px;height:${height}px;position:relative`);parent.append(n);return n}

test('all five offsets are genuine selected-VM Element accessors with no HTMLElement shadowing', {timeout:15000},async t=>{
 const{w,child}=await fixture(t);
 for(const realm of[w,child])for(const name of offsets){
  const d=Object.getOwnPropertyDescriptor(realm.Element.prototype,name);assert.ok(d);assert.equal(d.enumerable,true);assert.equal(d.configurable,true);assert.equal(d.set,undefined);assert.equal(d.get.name,'get '+name);assert.equal(d.get.length,0);assert.ok(d.get instanceof realm.Function);
  for(const C of[realm.HTMLElement,realm.SVGElement,realm.SVGSVGElement,realm.SVGGraphicsElement,realm.Node,realm.Object].filter(Boolean))assert.equal(Object.hasOwn(C.prototype,name),false);
  actualRealm(d.get,realm.eval('[]'));
 }
});

test('HTML SVG MathML and foreign elements share real fractional geometry through Element offsets', {timeout:15000},async t=>{
 const{w,page}=await fixture(t),d=w.document,parent=d.createElement('section');parent.style.cssText='width:521px;position:relative';d.body.append(parent);
 for(const[ns,name]of[[H,'div'],[H,'span'],[S,'svg'],[S,'rect'],[S,'unlisted-widget'],[S,'s:rect'],[M,'math'],[M,'mi'],[null,'item'],['urn:offset-test','item']]){
  const n=element(d,ns,name,parent),rect=n.getBoundingClientRect(),box=page.layout.absoluteRect(n);
  assert.equal(n.offsetWidth,45.625,name);assert.equal(n.offsetHeight,22.875,name);assert.equal(n.offsetWidth,rect.width,name);assert.equal(n.offsetHeight,rect.height,name);assert.equal(n.offsetTop,box.y,name);assert.equal(n.offsetLeft,box.x,name);assert.equal(n.offsetParent,parent,name);
 }
});

test('genuine inactive XML elements expose the same accessors and retain zero boxes and null parent', {timeout:15000},async t=>{
 const{w}=await fixture(t),xml=w.document.implementation.createDocument('urn:offset-test','root'),node=xml.createElementNS(null,'item');node.setAttribute('style','width:113.5px;height:71.25px');xml.documentElement.append(node);assert.equal(xml.defaultView,null);
 for(const n of[xml.documentElement,node]){assert.ok(platformFactoryRecord(n));for(const name of offsets)assert.equal(getter(w,name).call(n),name==='offsetParent'?null:0)}
});

test('offset brands reject fake copied-symbol and Proxy receivers without observing authored fields', {timeout:15000},async t=>{
 const{w}=await fixture(t),d=w.document,node=element(d,S,'rect',d.body);let reads=0,traps=0;
 const copied=Object.create(Object.getPrototypeOf(node),Object.getOwnPropertyDescriptors(node));Object.defineProperty(copied,'ownerDocument',{get(){reads++;throw Error('authored owner')}});Object.defineProperty(copied,'nodeType',{get(){reads++;throw Error('authored kind')}});
 const proxy=new Proxy(node,{get(){traps++;throw Error('authored get')},getPrototypeOf(){traps++;throw Error('authored prototype')},getOwnPropertyDescriptor(){traps++;throw Error('authored descriptor')}});
 for(const name of offsets)for(const value of[{},Object.create(Object.getPrototypeOf(node)),copied,proxy,d,d.createTextNode('text'),null,undefined])assert.throws(()=>getter(w,name).call(value),error=>error instanceof w.TypeError&&error.message==='Illegal invocation');
 assert.equal(reads,0);assert.equal(traps,0);assert.equal(node.offsetWidth,45.625);
});

test('borrowed offset getters accept genuine foreign elements and allocate brand errors in the definition VM', {timeout:15000},async t=>{
 const{w,child}=await fixture(t),mainNode=element(w.document,S,'rect',w.document.body),childNode=element(child.document,H,'div',child.document.body);
 for(const owner of[w,child])for(const name of offsets){
  const get=getter(owner,name);
  for(const node of[mainNode,childNode])assert.equal(get.call(node),node[name]);
  for(const invalid of[{},Object.create(w.Element.prototype),Object.create(child.Element.prototype)]){let error;try{get.call(invalid)}catch(value){error=value}assert.ok(error instanceof owner.TypeError);assert.equal(error.message,'Illegal invocation');actualRealm(error,owner.eval('[]'))}
 }
});

test('retained SVG identity and prototype use the current connected document layout after real adoption', {timeout:15000},async t=>{
 const{w,child}=await fixture(t),a=w.document.createElement('section'),b=child.document.createElement('section');a.style.cssText='width:354px;position:relative';b.style.cssText='width:128px;position:relative';w.document.body.append(a);child.document.body.append(b);
 const node=element(child.document,S,'unlisted-widget',b);node.style.width='50%';const prototype=Object.getPrototypeOf(node),implementation=platformFactoryRecord(node).implementation;
 const check=(owner,parent,width)=>{assert.equal(node.ownerDocument,owner);assert.equal(Object.getPrototypeOf(node),prototype);assert.equal(platformFactoryRecord(node).implementation,implementation);assert.equal(node.offsetWidth,width);assert.equal(node.offsetWidth,node.getBoundingClientRect().width);assert.equal(node.offsetParent,parent);for(const realm of[w,child])assert.equal(getter(realm,'offsetWidth').call(node),width)};
 check(child.document,b,64);assert.equal(w.document.adoptNode(node),node);assert.equal(node.ownerDocument,w.document);assert.equal(node.isConnected,false);assert.equal(Object.getPrototypeOf(node),prototype);
 // Native's separate detached percentage-layout behavior remains an explicit gap;
 // this publication test preserves identity and tests both real connected owners.
 a.append(node);check(w.document,a,177);child.document.adoptNode(node);b.append(node);check(child.document,b,64);
});

test('genuine Host JSDOM layout keeps Host accessors and the same canonical geometry implementation', {timeout:15000},t=>{
 const dom=new JSDOM('<body><section style="position:relative;width:209px"></section>');t.after(()=>dom.window.close());const w=dom.window,model=installLayout({},w),parent=w.document.querySelector('section'),node=element(w.document,S,'rect',parent,31.125,17.625);
 for(const name of offsets){const d=Object.getOwnPropertyDescriptor(w.Element.prototype,name);assert.equal(Object.hasOwn(w.HTMLElement.prototype,name),false);assert.equal(heap.sameRealm(d.get,[]),true)}
 assert.equal(node.offsetWidth,31.125);assert.equal(node.offsetHeight,17.625);assert.equal(node.offsetParent,parent);assert.equal(node.offsetTop,model.absoluteRect(node).y);
});
