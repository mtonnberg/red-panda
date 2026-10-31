import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Browser} from '../src/browser.js';
import {getHeapBinding} from '../src/native-heap.js';
import {platformFactoryRecord} from '../src/platform-factories.js';
const binding=getHeapBinding();
function realm(value,w){const prototype=Object.getPrototypeOf(value),anchor=w.eval('[]');try{for(let n=0;n<2;n++){assert.equal(binding.sameRealm(value,anchor),true);assert.equal(binding.sameRealm(value,[]),false);Object.setPrototypeOf(value,null)}}finally{Object.setPrototypeOf(value,prototype)}}
async function fixture(t){const browser=new Browser({timeout:2500,loadResources:['iframe']}),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,<body><div id=owned>actual</div><iframe></iframe>');const w=page.dom.window;return{w,child:w.document.querySelector('iframe').contentWindow}}
for(const kind of ['Node','Element','Document'])test(kind+' conversion arguments remain private under authored numeric Array prototype properties',async t=>{
 const {w,child}=await fixture(t);
 for(const g of [w,child]){
  const element=g.document.body.appendChild(g.document.createElement('div'));element.id='private-owned';
  const method=kind==='Node'?g.Node.prototype.getRootNode:kind==='Element'?g.Element.prototype.getAttribute:g.Document.prototype.querySelectorAll;
  const receiver=kind==='Document'?g.document:element,args=kind==='Node'?[]:kind==='Element'?['id']:['#private-owned'];
  realm(method,g);const backend=platformFactoryRecord(element).implementation;
  for(const poison of ['throw','accept','readonly']){
   let calls=0,value;const authored=new g.Error('authored Array index setter');
   try{
    if(poison==='readonly')Object.defineProperty(g.Array.prototype,'0',{configurable:true,writable:false,value:'authored'});
    else Object.defineProperty(g.Array.prototype,'0',{configurable:true,set(){calls++;if(poison==='throw')throw authored}});
    value=Reflect.apply(method,receiver,args);
   }finally{delete g.Array.prototype[0]}
   assert.equal(calls,0);
   if(kind==='Node')assert.equal(value,g.document);else if(kind==='Element')assert.equal(value,'private-owned');else assert.equal(value.item(0),element);
   assert.equal(platformFactoryRecord(element).implementation,backend);assert.equal(element.ownerDocument,g.document);
  }
 }
});
test('borrowed Document factories retain real method VM, owner and conversion/error identities under Array poisoning',async t=>{
 const {w,child}=await fixture(t);
 for(const [methodOwner,documentOwner] of [[w,child],[child,w]]){
  const method=methodOwner.Document.prototype.createElement,sentinel=new methodOwner.Error('actual conversion');let calls=0,conversions=0,value;
  try{
   Object.defineProperty(methodOwner.Array.prototype,'0',{configurable:true,set(){calls++;throw new Error('private argument array escaped')}});
   value=method.call(documentOwner.document,{toString(){conversions++;return 'div'}});
   assert.equal(conversions,1);assert.equal(value.ownerDocument,documentOwner.document);realm(value,methodOwner);
   const argument={toString(){conversions++;throw sentinel}};
   assert.throws(()=>method.call({},argument),error=>error instanceof methodOwner.TypeError);assert.equal(conversions,1);
   assert.throws(()=>method.call(documentOwner.document,argument),error=>error===sentinel);assert.equal(conversions,2);assert.equal(calls,0);
  }finally{delete methodOwner.Array.prototype[0]}
 }
});
