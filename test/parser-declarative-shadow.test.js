import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Browser} from '../src/browser.js';
import {platformFactoryRecord} from '../src/platform-factories.js';
import {implementationForWrapper} from '../src/dom-event-state.js';
import {getHeapBinding} from '../src/native-heap.js';
import {staticResourceServer} from './static-resource-server.js';
const require=createRequire(import.meta.url);
const {wrapperForImpl}=require('jsdom/lib/jsdom/living/generated/utils.js');
const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(t,html,routes={}) {
  const server=await staticResourceServer(t,{html,routes});
  let browser;
  t.after(()=>browser?.close());
  browser=new Browser({timeout:2500,loadResources:['iframe']});
  const page=browser.createPage(),errors=[];
  page.on('pageError',error=>errors.push(error.message));
  await page.navigate(server.origin+'/page.html');
  return {page,window:page.dom.window,errors,...server};
}

test('owned incremental parsing creates the real declarative root before the following parser script',{timeout:15000},async t=>{
  const f=await fixture(t,'<!doctype html><body><!--'+'p'.repeat(17000)+'--><div id="host"><template shadowrootmode="open" shadowrootserializable><p id="inside">actual shadow</p></template><span>actual light</span></div><script>const host=document.getElementById("host");globalThis.atParserBoundary={root:host.shadowRoot!==null,text:host.shadowRoot?.getElementById("inside").textContent,template:host.querySelector("template")!==null,privateId:document.getElementById("inside")!==null,current:document.currentScript.tagName};</script>');
  assert.deepEqual(plain(f.window.atParserBoundary),{root:true,text:'actual shadow',template:false,privateId:false,current:'SCRIPT'});
  const host=f.window.document.getElementById('host');
  assert.equal(host.shadowRoot.ownerDocument,f.window.document);
  assert.equal(host.shadowRoot.serializable,true);
  assert.equal(host.querySelector('span').textContent,'actual light');
  assert.deepEqual(f.errors,[]);
});

test('streamed nested closed roots preserve genuine backing, flags and declarative reattachment',{timeout:15000},async t=>{
  const f=await fixture(t,'<!doctype html><div id="host"><template shadowrootmode="open"><section id="closed"><template shadowrootmode="closed" shadowrootdelegatesfocus shadowrootclonable shadowrootserializable><b>actual nested</b></template></section></template></div>');
  const host=f.window.document.getElementById('host'),nested=host.shadowRoot.getElementById('closed');
  assert.equal(nested.shadowRoot,null);
  const root=wrapperForImpl(implementationForWrapper(nested)._shadowRoot);
  assert.equal(root.host,nested);assert.equal(root.ownerDocument,f.window.document);
  assert.equal(root.mode,'closed');assert.equal(root.textContent,'actual nested');
  assert.equal(root.delegatesFocus,true);assert.equal(root.clonable,true);assert.equal(root.serializable,true);
  assert.equal(platformFactoryRecord(root).implementation,implementationForWrapper(root));
  assert.throws(()=>nested.attachShadow({mode:'open'}),error=>error.name==='NotSupportedError');
  assert.equal(nested.attachShadow({mode:'closed'}),root);
  assert.equal(root.childNodes.length,0);assert.equal(root.serializable,true);
  assert.throws(()=>nested.attachShadow({mode:'closed'}),error=>error.name==='NotSupportedError');
  assert.deepEqual(f.errors,[]);
});

test('real shadow parser scripts execute once in order and blocking external source resumes the same parser',{timeout:15000},async t=>{
  const html='<!doctype html><script>globalThis.seen=[]</script><div id="host"><template shadowrootmode="open"><script>seen.push(["inline",document.currentScript.getRootNode()===document.getElementById("host").shadowRoot])</script><script src="/shadow.js"></script><p id="tail">shadow tail</p></template></div><script>seen.push(["after",document.getElementById("host").shadowRoot.getElementById("tail").textContent])</script>';
  const f=await fixture(t,html,{'/shadow.js':{delay:20,body:'seen.push(["external",document.currentScript.getRootNode()===document.getElementById("host").shadowRoot]);'}});
  assert.deepEqual(plain(f.window.seen),[['inline',true],['external',true],['after','shadow tail']]);
  assert.equal(f.requests.filter(path=>path==='/shadow.js').length,1);
  assert.equal(f.window.document.currentScript,null);assert.deepEqual(f.errors,[]);
});

test('parser host validation preserves foreign templates, inactive root owners, disabled features and duplicate roots',{timeout:15000},async t=>{
  const f=await fixture(t,'<!doctype html><script>customElements.define("no-shadow-host",class extends HTMLElement{static get disabledFeatures(){return ["shadow"]}})</script><div id="valid"><template shadowrootmode="open"><b>first</b></template><template shadowrootmode="closed"><i>second</i></template></div><button id="invalid"><template shadowrootmode="open"><b>unsupported host</b></template></button><template id="inert"><div><template shadowrootmode="open"><b>inert</b></template></div></template><no-shadow-host id="disabled"><template shadowrootmode="open"><b>disabled</b></template></no-shadow-host><svg><g id="foreign"><template shadowrootmode="open"><text>foreign</text></template></g></svg>');
  const d=f.window.document,valid=d.getElementById('valid');
  assert.equal(valid.shadowRoot.textContent,'first');assert.equal(valid.querySelector('template').content.textContent,'second');
  assert.equal(d.getElementById('invalid').shadowRoot,null);assert.ok(d.getElementById('invalid').querySelector('template'));
  const content=d.getElementById('inert').content,inert=content.querySelector('div'),inertRoot=inert.shadowRoot;
  assert.ok(inertRoot instanceof f.window.ShadowRoot);assert.equal(inertRoot.nodeType,11);assert.equal(inertRoot.mode,'open');
  assert.equal(inertRoot.textContent,'inert');assert.equal(inertRoot.host,inert);assert.equal(inertRoot.getRootNode(),inertRoot);
  assert.equal(inertRoot.ownerDocument,inert.ownerDocument);assert.equal(inertRoot.ownerDocument,content.ownerDocument);
  assert.notEqual(inertRoot.ownerDocument,d);assert.equal(inertRoot.ownerDocument.defaultView,null);
  assert.equal(inert.isConnected,false);assert.equal(inertRoot.isConnected,false);assert.equal(inert.querySelector('template'),null);
  assert.equal(d.getElementById('disabled').shadowRoot,null);assert.ok(d.getElementById('disabled').querySelector('template'));
  assert.equal(d.getElementById('foreign').shadowRoot,null);assert.ok(d.getElementById('foreign').querySelector('template'));
  assert.deepEqual(f.errors,[]);
});

test('real HTTP child parser roots retain the child Document, exact backend and actual VM creation context',{timeout:15000},async t=>{
  const f=await fixture(t,'<!doctype html><iframe id="child" src="/child"></iframe>',{'/child':{type:'text/html',body:'<!doctype html><div id="host"><template shadowrootmode="open"><p>child shadow</p></template></div><script>globalThis.beforeChildEOF=document.getElementById("host").shadowRoot?.textContent</script>'}});
  const child=f.window.document.getElementById('child'),w=child.contentWindow,host=w.document.getElementById('host'),root=host.shadowRoot;
  assert.equal(w.beforeChildEOF,'child shadow');assert.equal(root.ownerDocument,w.document);assert.notEqual(root.ownerDocument,f.window.document);
  assert.equal(platformFactoryRecord(root).implementation,implementationForWrapper(root));
  const binding=getHeapBinding(),anchor=new w.Array();
  for(const value of [root,root.firstElementChild]) {
    assert.equal(binding.sameRealm(value,anchor),true);assert.equal(binding.sameRealm(value,new f.window.Array()),false);
    const prototype=Object.getPrototypeOf(value);
    try{Object.setPrototypeOf(value,null);assert.equal(binding.sameRealm(value,anchor),true);assert.equal(binding.sameRealm(value,{}),false);}finally{Object.setPrototypeOf(value,prototype);}
  }
  let reads=0;const counterfeit=Object.create(w.ShadowRoot.prototype);Object.defineProperty(counterfeit,Symbol('impl'),{get(){reads++;throw Error('authored implementation')}});
  assert.equal(platformFactoryRecord(counterfeit),undefined);assert.equal(reads,0);
  assert.deepEqual(f.errors,[]);
});

test('document-open write-created parsing admits roots in each actual reset generation',{timeout:15000},async t=>{
  const f=await fixture(t,'<!doctype html><p>initial</p>'),document=f.window.document;
  for(const text of ['first real write','second real write']) {
    f.page.evaluate(`document.open();document.write(${JSON.stringify('<!doctype html><div id="host"><template shadowrootmode="open"><p>'+text+'</p></template></div><script>globalThis.atWrittenParserBoundary=document.getElementById("host").shadowRoot?.textContent</script>')});document.close()`);
    assert.equal(f.window.document,document);assert.equal(f.window.atWrittenParserBoundary,text);
    assert.equal(document.getElementById('host').shadowRoot.textContent,text);
    assert.equal(document.getElementById('host').shadowRoot.ownerDocument,document);
  }
  assert.deepEqual(f.errors,[]);
});

test('ordinary fragment parsing stays inert while an explicitly unsafe entry retains real declarative behavior',{timeout:15000},async t=>{
  const f=await fixture(t,'<!doctype html><body></body>'),d=f.window.document;
  const markup='<div><template shadowrootmode="open"><b>actual</b><script>globalThis.fragmentExecuted=true</script></template></div>';
  const normal=d.createElement('section');normal.innerHTML=markup;d.body.append(normal);
  assert.equal(normal.firstElementChild.shadowRoot,null);assert.ok(normal.querySelector('template'));
  const detached=new f.window.DOMParser().parseFromString(markup,'text/html');
  assert.equal(detached.querySelector('div').shadowRoot,null);
  const unsafe=d.createElement('section');unsafe.setHTMLUnsafe(markup);d.body.append(unsafe);
  assert.equal(unsafe.firstElementChild.shadowRoot.querySelector('b').textContent,'actual');
  assert.equal(f.window.fragmentExecuted,undefined);assert.deepEqual(f.errors,[]);
});
