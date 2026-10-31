import{test}from'node:test';import assert from'node:assert/strict';import{JSDOM}from'jsdom';import{EventEmitter}from'node:events';
import{installDocumentXML}from'../src/document-xml.js';import{Browser}from'../src/browser.js';
import{createIsolatedWorld,canonicalUtilityValue}from'../src/isolated-world.js';import{installAttributeNames}from'../src/attribute-names.js';
function fixture(t){const dom=new JSDOM('<!doctype html><body>',{url:'http://owned.test/',runScripts:'dangerously',beforeParse(window){installDocumentXML(new EventEmitter(),window)}});t.after(()=>dom.window.close());return dom.window;}
const XLINK='http://www.w3.org/1999/xlink',XML='http://www.w3.org/XML/1998/namespace',XMLNS='http://www.w3.org/2000/xmlns/';
test('owned HTML and XML attribute names accept measured non-XML names and reject only actual invalid delimiters',t=>{
 const w=fixture(t),xml=new w.DOMParser().parseFromString('<r/>','application/xml');
 for(const d of[w.document,xml]){
  for(const name of['0abc','123','-invalid','.foo','my@attr','attr!','~','<x','::x','a\vb','é','a"b',"a'b",'a`b','a\\b','a\u0001b','a\u0008b','a\u001fb','a\u007fb','a\u0085b','a\u00a0b','a\u2028b','a\u2029b','a\uffffb']){
   const e=d.createElement('r');e.setAttribute(name,'value');assert.equal(e.getAttribute(name),'value');assert.equal(e.getAttributeNode(name).ownerElement,e);
   const a=d.createAttribute(name);assert.equal(a.name,name);assert.equal(a.ownerDocument,d);a.value='attr';assert.equal(e.setAttributeNode(a).value,'value');assert.equal(e.getAttributeNode(name),a);assert.equal(e.getAttribute(name),'attr');
   assert.equal(e.toggleAttribute(name),false);assert.equal(a.ownerElement,null);assert.equal(a.value,'attr');assert.equal(e.toggleAttribute(name),true);assert.notEqual(e.getAttributeNode(name),a);
  }
  for(const name of['','a b','a\tb','a\nb','a\fb','a\rb','a\0b','a=b','a/b','a>b'])for(const op of[()=>d.createAttribute(name),()=>d.createElement('r').setAttribute(name,'v'),()=>d.createElement('r').toggleAttribute(name)])assert.throws(op,error=>error instanceof w.DOMException&&error.name==='InvalidCharacterError'&&error.code===5);
  assert.equal(d.createAttribute('UPPER').name,'UPPER');
 }
 assert.equal(Object.getOwnPropertyDescriptor(w.Attr.prototype,'prefix'),undefined);
});
test('namespace methods mutate and select actual flat qualified attributes with measured known-prefix fallback',t=>{
 const w=fixture(t);for(const d of[w.document,new w.DOMParser().parseFromString('<r/>','application/xml')]){
  const e=d.createElement('r');e.setAttributeNS(null,'p:name','stripped');assert.equal(e.getAttribute('name'),'stripped');assert.equal(e.getAttribute('p:name'),null);
  for(const ns of['','urn:unknown',XLINK,XML,XMLNS]){e.setAttributeNS(ns,'p:name','literal');assert.equal(e.getAttribute('p:name'),'literal');assert.equal(e.getAttributeNode('p:name').namespaceURI,null);const a=d.createAttributeNS(ns,'a:b:c');assert.equal(a.name,'a:b:c');assert.equal(a.localName,'a:b:c');assert.equal(a.namespaceURI,null);}
  for(const name of[':a','a:','a:b:c'])assert.throws(()=>e.setAttributeNS('urn:any',name,'v'),{name:'InvalidCharacterError'});
  for(const[ns,prefix,local]of[[XLINK,'xlink','href'],[XML,'xml','lang'],[XMLNS,'xmlns','p']]){
   const qualified=prefix+':'+local;e.setAttribute(local,'plain');e.setAttribute(qualified,'qualified');const held=e.getAttributeNode(qualified);
   assert.equal(e.getAttributeNS(ns,local),'qualified');assert.equal(e.getAttributeNodeNS(ns,local),held);assert.equal(e.attributes.getNamedItemNS(ns,local),held);
   assert.equal(e.attributes.removeNamedItemNS(ns,local),held);assert.equal(held.ownerElement,null);assert.equal(e.getAttributeNS(ns,local),'plain');e.removeAttributeNS(ns,local);assert.equal(e.hasAttribute(local),false);
   e.setAttribute(qualified,'again');e.removeAttributeNS(ns,local);assert.equal(e.hasAttribute(qualified),false);
  }
  e.setAttribute('other','fallback');assert.equal(e.getAttributeNS('urn:unknown','other'),'fallback');assert.equal(e.getAttributeNS(XLINK,'other'),'fallback');assert.equal(e.getAttributeNodeNS(null,'nope'),null);assert.throws(()=>e.attributes.removeNamedItemNS(XML,'nope'),error=>error instanceof w.DOMException&&error.name==='NotFoundError'&&error.code===8);
 }
});
test('original generated conversion order and argument requirements survive Native primitive Symbol descriptions',t=>{
 const w=fixture(t),d=w.document,e=d.createElement('div'),trace=[],arg=(name,value,throws=false)=>({toString(){trace.push(name);if(throws)throw new w.Error(name);return value}});
 e.setAttribute(arg('name','valid'),arg('value','data'));assert.deepEqual(trace,['name','value']);trace.length=0;
 assert.throws(()=>e.setAttributeNS(arg('namespace','urn:any'),arg('name','a b'),arg('value','v')),error=>error instanceof w.DOMException);assert.deepEqual(trace,['namespace','name','value']);trace.length=0;
 assert.throws(()=>e.setAttribute(arg('name','bad',true),arg('value','data')),error=>error instanceof w.Error&&error.message==='name');assert.deepEqual(trace,['name']);
 for(const[receiver,method,args]of[[e,'setAttribute',[]],[e,'setAttribute',['x']],[e,'toggleAttribute',[]],[e,'setAttributeNS',[null,'x']],[d,'createAttribute',[]],[d,'createAttributeNS',[null]]])assert.throws(()=>receiver[method](...args),error=>error instanceof w.TypeError);
 e.setAttribute(Symbol('name'),Symbol('value'));assert.equal(e.getAttribute(Symbol('name')),'value');assert.equal(e.hasAttribute(Symbol('name')),true);e.removeAttribute(Symbol('name'));assert.equal(e.hasAttribute('name'),false);
 assert.equal(d.createAttribute(Symbol()).name,'undefined');assert.equal(d.createAttributeNS(Symbol('ns'),Symbol('NAME')).name,'NAME');assert.equal(e.toggleAttribute(Symbol('toggle')),true);
 for(const value of[Object(w.Symbol('x')),{[w.Symbol.toPrimitive](){return w.Symbol('x')}}])assert.throws(()=>e.setAttribute(value,'v'),error=>error instanceof w.TypeError);
 e.setAttribute('a\ud800b','v\ud800x');assert.equal(e.getAttribute('a\ufffdb'),'v\ufffdx');assert.equal(e.getAttribute('a\ud800b'),'v\ufffdx');
});
test('real Attr identity, owner changes, reflection, selectors and mutation records follow backend mutations',async t=>{
 const w=fixture(t),d=w.document,e=d.createElement('p');d.body.append(e);const changes=[];new w.MutationObserver(batch=>changes.push(...batch)).observe(e,{attributes:true,attributeOldValue:true});
 const a=d.createAttribute('data-value');a.value='one';e.setAttributeNode(a);e.setAttribute('data-value','two');assert.equal(e.getAttributeNode('data-value'),a);assert.equal(a.value,'two');
 const b=d.createAttribute('data-value');b.value='three';assert.equal(e.setAttributeNode(b),a);assert.equal(a.ownerElement,null);assert.equal(a.value,'two');assert.equal(e.getAttributeNode('data-value'),b);
 e.id='identified';const id=e.getAttributeNode('id');e.setAttribute('id','updated');assert.equal(d.getElementById('updated'),e);assert.equal(id.value,'updated');assert.equal(d.querySelector('[data-value="three"]'),e);e.removeAttribute('data-value');assert.equal(b.ownerElement,null);assert.equal(b.value,'three');
 await Promise.resolve();assert.deepEqual(changes.map(x=>[x.attributeName,x.attributeNamespace,x.oldValue]),[['data-value',null,null],['data-value',null,'one'],['data-value',null,'two'],['id',null,null],['id',null,'identified'],['data-value',null,'three']]);
 const other=d.createElement('b');other.setAttribute('occupied','x');assert.throws(()=>e.setAttributeNode(other.getAttributeNode('occupied')),error=>error instanceof w.DOMException&&error.name==='InUseAttributeError');
});
test('uppercase Attr declarations retain their name while HTML attachment, adoption and clones use actual document state',t=>{
 const w=fixture(t),d=w.document,xml=new w.DOMParser().parseFromString('<r/>','application/xml'),e=d.createElement('p'),x=xml.createElement('r'),a=xml.createAttribute('UPPER');a.value='one';
 e.setAttributeNode(a);assert.equal(a.ownerDocument,d);assert.equal(a.name,'UPPER');assert.equal(a.localName,'UPPER');assert.equal(a.nodeName,'UPPER');assert.deepEqual([...e.getAttributeNames()],['upper']);assert.equal(e.getAttributeNode('upper'),a);assert.equal(e.getAttribute('UPPER'),'one');e.setAttribute('upper','two');assert.equal(a.value,'two');
 const clone=a.cloneNode();assert.equal(clone.name,'UPPER');assert.equal(clone.ownerElement,null);assert.equal(clone.ownerDocument,d);assert.equal(clone.value,'two');const copied=e.cloneNode();assert.equal(copied.attributes[0].name,'upper');assert.deepEqual([...copied.getAttributeNames()],['upper']);
 const imported=xml.importNode(a);assert.equal(imported.name,'UPPER');assert.equal(imported.ownerDocument,xml);assert.equal(imported.ownerElement,null);
 e.removeAttribute('upper');x.setAttributeNode(a);assert.equal(a.ownerDocument,xml);assert.deepEqual([...x.getAttributeNames()],['UPPER']);assert.equal(x.getAttribute('UPPER'),'two');assert.equal(x.getAttribute('upper'),null);x.removeAttributeNode(a);e.attributes.setNamedItem(a);assert.equal(a.ownerDocument,d);assert.equal(e.getAttributeNode('upper'),a);
});
test('owned methods reject copied and inherited implementation lookalikes before authored coercion',t=>{
 const w=fixture(t),d=w.document,e=d.createElement('p');let reads=0;const value={toString(){reads++;return'value'}};
 for(const fake of[{},Object.create(e),Object.defineProperties({},Object.getOwnPropertyDescriptors(e))])assert.throws(()=>w.Element.prototype.setAttribute.call(fake,value,value),error=>error instanceof w.TypeError);
 for(const fake of[{},Object.create(d),Object.defineProperties({},Object.getOwnPropertyDescriptors(d))])assert.throws(()=>w.Document.prototype.createAttribute.call(fake,value),error=>error instanceof w.TypeError);
 assert.equal(reads,0);assert.equal(e.attributes.length,0);
});
test('unowned jsdom retains its original XML validation, namespace graph and public Attr prefix',t=>{
 const plain=new JSDOM('<body>',{runScripts:'dangerously'});t.after(()=>plain.window.close());const d=plain.window.document,e=d.createElement('p');assert.throws(()=>e.setAttribute('0abc','v'),{name:'InvalidCharacterError'});assert.throws(()=>d.createAttribute('0abc'),{name:'InvalidCharacterError'});assert.equal(d.createAttribute('UPPER').name,'upper');
 e.setAttributeNS('urn:plain','p:x','value');const a=e.getAttributeNodeNS('urn:plain','x');assert.equal(a.namespaceURI,'urn:plain');assert.equal(a.prefix,'p');assert.equal(e.getAttributeNS(null,'x'),null);assert.throws(()=>e.setAttribute(Symbol('x'),'v'),{name:'TypeError'});
});
test('real Browser documents and retained documents keep actual Attr owner identity after navigation',async t=>{
 const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,<body>old');const old=page.dom.window.document,Attr=page.dom.window.Attr;await page.navigate('data:text/html,<body>new');const a=old.createAttribute('0ABC');assert.equal(a.ownerDocument,old);assert.ok(a instanceof Attr);const e=old.createElement('div');a.value='retained';e.setAttributeNode(a);assert.equal(e.getAttribute('0ABC'),'retained');assert.equal(page.dom.window.document.contains(e),false);
});
test('genuine utility methods mutate the canonical DOM and return utility Attr identities without accepting lookalikes',async t=>{
 const browser=new Browser(),page=browser.createPage();await page.navigate('data:text/html,<body><p id="shared"></p>');const world=createIsolatedWorld(page.dom.window,{name:'attribute-names',signal:page.documentAbort.signal});installAttributeNames(world.global,{context:world.context});t.after(()=>{world.dispose();browser.close()});
 const value=world.evaluate(`(()=>{const e=document.getElementById('shared');e.setAttribute(Symbol('0abc'),Symbol('value'));const a=document.createAttribute('a\\vb');a.value='utility';e.setAttributeNode(a);globalThis.held=a;return{name:a.name,owner:a.ownerDocument===document,element:a.ownerElement===e,attr:a instanceof Attr,method:Element.prototype.setAttribute instanceof Function,value:e.getAttribute('0abc'),prefix:typeof a.prefix}})()`);
 assert.deepEqual(JSON.parse(JSON.stringify(value)),{name:'a\vb',owner:true,element:true,attr:true,method:true,value:'value',prefix:'undefined'});assert.equal(page.dom.window.document.getElementById('shared').getAttribute('a\vb'),'utility');assert.equal(canonicalUtilityValue(world.evaluate('held')),page.dom.window.document.getElementById('shared').getAttributeNode('a\vb'));assert.equal(world.evaluate('(()=>{try{Element.prototype.setAttribute.call({},"x","y")}catch(e){return e instanceof TypeError}})()'),true);
});
