import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {Browser} from '../src/browser.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

// STATIC/UNRUN heldouts. Native controls must calibrate the added boundary
// cases before this draft can be accepted; no Source212 result is claimed.
const HTML='http://www.w3.org/1999/xhtml',SVG='http://www.w3.org/2000/svg',MATH='http://www.w3.org/1998/Math/MathML';
async function fixture(t,source='<body></body>',mime='text/html'){
 const browser=new Browser({loadResources:['iframe']});t.after(()=>browser.close());
 const page=browser.createPage();await page.navigate('data:'+mime+','+encodeURIComponent(source));
 return {page,w:page.dom.window,d:page.dom.window.document};
}
const pair=(method,node)=>[method.call(node,':required'),method.call(node,':optional')];

test('required/optional retain actual eligible HTML controls and Native optional button/inapplicable input states',async t=>{
 const {w,d}=await fixture(t);const box=d.createElement('section');d.body.append(box);
 box.innerHTML='<input id=text required><input id=plain><input type=checkbox id=check required><select id=select required></select><textarea id=textarea></textarea><button id=button required></button><p id=p required></p>';
 const text=box.querySelector('#text'),plain=box.querySelector('#plain'),check=box.querySelector('#check'),select=box.querySelector('#select'),textarea=box.querySelector('#textarea'),button=box.querySelector('#button');
 assert.deepEqual([...box.querySelectorAll(':required')],[text,check,select]);
 assert.deepEqual([...box.querySelectorAll(':optional')],[plain,textarea,button]);
 const matches=w.Element.prototype.matches;
 for(const type of ['hidden','range','color','button','submit','reset','image']){
  const input=d.createElement('input');input.type=type;input.required=true;box.append(input);
  assert.equal(input.hasAttribute('required'),true);assert.deepEqual(pair(matches,input),[false,true],type);
 }
 assert.deepEqual(pair(matches,box.querySelector('#p')),[false,false]);
});

test('foreign namespaces with real control local names are neither required nor optional',async t=>{
 const {w,d}=await fixture(t);const box=d.createElement('div');d.body.append(box);const matches=w.Element.prototype.matches;
 for(const namespace of [SVG,MATH,null])for(const name of ['input','select','textarea','button']){
  const node=d.createElementNS(namespace,name);node.setAttribute('required','');box.append(node);
  assert.deepEqual(pair(matches,node),[false,false],String(namespace)+' '+name);
 }
 assert.deepEqual([...box.querySelectorAll(':required,:optional')],[]);
 const input=d.createElement('INPUT');input.setAttribute('REQUIRED','');box.append(input);
 assert.equal(input.localName,'input');assert.deepEqual(pair(matches,input),[true,false]);
 assert.deepEqual([...box.querySelectorAll(':required')],[input]);
});

test('registered XHTML uses actual interface and case-sensitive content attributes',async t=>{
 const {w,d}=await fixture(t,'<html xmlns="'+HTML+'"><head/><body><input id="lower" required=""/><INPUT id="upper" required=""/><input id="upper-attribute" REQUIRED=""/><input id="mixed-type" type="HiDdEn" required=""/></body></html>','application/xhtml+xml');
 const matches=w.Element.prototype.matches;
 assert.deepEqual(pair(matches,d.getElementById('lower')),[true,false]);
 assert.deepEqual(pair(matches,d.getElementById('upper')),[false,false]);
 assert.deepEqual(pair(matches,d.getElementById('upper-attribute')),[false,true]);
 assert.deepEqual(pair(matches,d.getElementById('mixed-type')),[false,true]);
});

test('invalid/missing type fallback and actual type/required mutations remain live',async t=>{
 const {w,d}=await fixture(t);const input=d.createElement('input'),matches=w.Element.prototype.matches;d.body.append(input);
 input.required=true;assert.deepEqual(pair(matches,input),[true,false]);
 input.setAttribute('type','unrecognized-state');assert.equal(input.type,'text');assert.deepEqual(pair(matches,input),[true,false]);
 input.setAttribute('type','HIDDEN');assert.equal(input.type,'hidden');assert.deepEqual(pair(matches,input),[false,true]);
 input.setAttribute('type',' hidden ');assert.equal(input.type,'text');assert.deepEqual(pair(matches,input),[true,false]);
 input.type='checkbox';input.removeAttribute('required');assert.deepEqual(pair(matches,input),[false,true]);
 const held=input.getAttributeNode('type');held.value='range';input.setAttribute('required','false');assert.deepEqual(pair(matches,input),[false,true]);
 held.value='text';assert.deepEqual(pair(matches,input),[true,false]);
 input.removeAttribute('required');assert.deepEqual(pair(matches,input),[false,true]);
 input.setAttributeNS('urn:eligibility-heldout','held:required','');assert.deepEqual(pair(matches,input),[false,true]);
 input.setAttribute('required','');assert.deepEqual(pair(matches,input),[true,false]);
 input.removeAttributeNS(null,'required');assert.deepEqual(pair(matches,input),[false,true]);
});

test('logical selectors, closest and static NodeLists use the same real eligibility',async t=>{
 const {w,d}=await fixture(t);const box=d.createElement('div');box.innerHTML='<section id=html><button id=button required><span id=inside></span></button><input id=input required></section><section id=foreign><svg><input id=svg required=""/></svg></section>';d.body.append(box);
 const button=box.querySelector('#button'),input=box.querySelector('#input'),html=box.querySelector('#html'),foreign=box.querySelector('#foreign'),svg=box.querySelector('#svg');
 assert.deepEqual([...box.querySelectorAll(':is(:optional)')],[button]);
 assert.deepEqual([...box.querySelectorAll('input:not(:optional)')],[input,svg]);
 assert.deepEqual([...box.querySelectorAll('section:has(> :optional)')],[html]);
 assert.equal(box.querySelector('#inside').closest(':optional'),button);
 assert.equal(w.Element.prototype.closest.call(svg,':optional'),null);
 const held=box.querySelectorAll(':optional');input.required=false;
 assert.deepEqual([...held],[button]);assert.deepEqual([...box.querySelectorAll(':optional')],[button,input]);
 assert.equal(foreign.matches(':has(:optional)'),false);
});

test('authored wrapper getters cannot supply eligibility or be read by the private predicate',async t=>{
 const {w,d}=await fixture(t),matches=w.Element.prototype.matches;
 const input=d.createElement('input'),foreign=d.createElementNS(SVG,'input'),unknown=d.createElement('eligibility-unknown');
 input.required=true;foreign.setAttribute('required','');unknown.setAttribute('required','');d.body.append(input,foreign,unknown);
 let reads=0;const restores=[];
 try{
  for(const node of [input,foreign,unknown])for(const key of ['localName','namespaceURI','required','type','hasAttribute']){
   const before=Object.getOwnPropertyDescriptor(node,key);restores.push([node,key,before]);
   Object.defineProperty(node,key,{configurable:true,get(){reads++;throw new Error('authored '+key);}});
  }
  assert.deepEqual(pair(matches,input),[true,false]);assert.deepEqual(pair(matches,foreign),[false,false]);assert.deepEqual(pair(matches,unknown),[false,false]);
  assert.deepEqual([...d.querySelectorAll(':required')],[input]);
  assert.deepEqual([...d.querySelectorAll(':optional')],[]);assert.equal(reads,0);
 }finally{for(const[node,key,before]of restores)if(before)Object.defineProperty(node,key,before);else delete node[key];}
 // Even plausible returned property values cannot authenticate a generic node.
 for(const[key,value]of [['localName','input'],['namespaceURI',HTML],['required',true],['type','checkbox'],['hasAttribute',()=>true]])Object.defineProperty(unknown,key,{configurable:true,value});
 try{assert.deepEqual(pair(matches,unknown),[false,false]);}finally{for(const key of ['localName','namespaceURI','required','type','hasAttribute'])delete unknown[key];}
});

test('borrowed match/query operations qualify actual foreign active-frame backends',async t=>{
 const {w,d}=await fixture(t,'<body><input id=main required><iframe srcdoc="<input id=child required><svg><input id=foreign required></svg>"></iframe></body>');
 const child=d.querySelector('iframe').contentWindow,childInput=child.document.getElementById('child'),foreign=child.document.getElementById('foreign'),main=d.getElementById('main');
 assert.deepEqual(pair(w.Element.prototype.matches,childInput),[true,false]);
 assert.deepEqual(pair(child.Element.prototype.matches,main),[true,false]);
 assert.deepEqual(pair(w.Element.prototype.matches,foreign),[false,false]);
 assert.deepEqual([...w.Document.prototype.querySelectorAll.call(child.document,':required')],[childInput]);
 assert.deepEqual([...child.Document.prototype.querySelectorAll.call(d,':required')],[main]);
});

test('registered autonomous FACE state and ordinary unknown elements are not reclassified as built-in required controls',async t=>{
 const {page,w,d}=await fixture(t);
 page.evaluate(`customElements.define('eligibility-face',class extends HTMLElement{static formAssociated=true;constructor(){super();this.control=this.attachInternals();this.control.setFormValue('actual');}});`);
 const face=d.createElement('eligibility-face'),unknown=d.createElement('eligibility-other');face.setAttribute('required','');unknown.setAttribute('required','');d.body.append(face,unknown);
 face.control.setValidity({valueMissing:true},'actual invalid');
 assert.deepEqual(pair(w.Element.prototype.matches,face),[false,false]);assert.deepEqual(pair(w.Element.prototype.matches,unknown),[false,false]);
 assert.equal(face.matches(':invalid'),true);assert.equal(face.matches(':valid'),false);
});

test('unregistered documents retain their original matcher path',t=>{
 const dom=new JSDOM('<input required>');t.after(()=>dom.window.close());const input=dom.window.document.querySelector('input');
 assert.equal(input.matches(':required'),true);input.type='hidden';assert.equal(input.matches(':optional'),true);
});

const PRE_HOOK_PROGRAM=String.raw`import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {EventEmitter} from 'node:events';
const html='<body><input id="text" required><input id="hidden" type="hidden" required><select id="select" required></select><textarea id="textarea" required></textarea><button id="button" required></button></body>';
const standalone=new JSDOM(html),oldSource=new JSDOM(html);
const d=standalone.window.document,source=oldSource.window.document;
const ids=['text','hidden','select','textarea','button'],expected=[[true,false],[false,true],[true,false],[true,false],[false,true]];
const adopted=ids.map(id=>source.getElementById(id));
const detached=source.createElement('input');detached.required=true;
const logical=d.createElement('section');logical.innerHTML='<div id="left"></div><input id="right" required>';
const left=logical.firstChild,right=logical.lastChild;d.body.append(logical);
const fragment=d.createDocumentFragment();fragment.append(d.createElement('input'),d.createElement('button'));fragment.firstChild.required=true;fragment.lastChild.setAttribute('required','');
const disconnected=d.createElement('button');disconnected.setAttribute('required','');const inner=disconnected.appendChild(d.createElement('span'));
const originalMatches=oldSource.window.Element.prototype.matches;
const pair=(method,node)=>[method.call(node,':required'),method.call(node,':optional')];
for(let i=0;i<adopted.length;i++)assert.deepEqual(pair(originalMatches,adopted[i]),expected[i]);

// No Red Panda module is loaded until every node above has been constructed.
const {installSelectors}=await import('./src/selectors.js');
const pageOwner=Object.assign(new EventEmitter(),{closed:false,documentAbort:new AbortController()});
const controller=installSelectors(pageOwner,standalone.window);
const ownMatches=standalone.window.Element.prototype.matches;
// Execute nested sibling discovery first, before any full selector traversal.
assert.equal(ownMatches.call(left,':has(+ :required)'),true);
right.required=false;assert.equal(ownMatches.call(left,':has(+ :required)'),false);
right.required=true;assert.equal(ownMatches.call(left,':is(:has(+ :required),:optional)'),true);
for(let i=0;i<ids.length;i++)assert.deepEqual(pair(ownMatches,d.getElementById(ids[i])),expected[i]);
assert.deepEqual([...fragment.querySelectorAll(':required,:optional')],[fragment.firstChild,fragment.lastChild]);
assert.deepEqual(pair(ownMatches,disconnected),[false,true]);assert.equal(inner.closest(':optional'),disconnected);
const held=fragment.querySelectorAll(':required');fragment.firstChild.type='hidden';assert.equal(held.length,1);assert.equal(fragment.querySelectorAll(':required').length,0);fragment.firstChild.type='text';
let reads=0;const keys=['localName','namespaceURI','required','type','hasAttribute'];
try{
 for(const key of keys)Object.defineProperty(right,key,{configurable:true,get(){reads++;throw Error('authored '+key);}});
 assert.deepEqual(pair(ownMatches,right),[true,false]);assert.equal(ownMatches.call(left,':has(+ :required)'),true);assert.equal(reads,0);
}finally{for(const key of keys)delete right[key];}
controller.dispose();assert.equal(d.getElementById('text').matches(':required'),true);

const {Browser}=await import('./src/browser.js');
const {platformFactoryRecord}=await import('./src/platform-factories.js');
const browser=new Browser();
try{
 const recordsBefore=adopted.map(node=>Boolean(platformFactoryRecord(node)));
 for(let i=0;i<adopted.length;i++)assert.deepEqual(pair(originalMatches,adopted[i]),expected[i],'unregistered embedding '+i);
 const page=browser.createPage();await page.navigate('data:text/html,<body></body>');
 const target=page.dom.window.document,matches=page.dom.window.Element.prototype.matches;
 for(let i=0;i<adopted.length;i++){
  const node=adopted[i];assert.equal(target.adoptNode(node),node);target.body.append(node);
  assert.equal(node.ownerDocument,target);assert.deepEqual(pair(matches,node),expected[i],'adopted control '+i);assert.deepEqual(pair(originalMatches,node),expected[i],'foreign method '+i);
 }
 assert.equal(target.adoptNode(detached),detached);target.body.append(detached);assert.deepEqual(pair(matches,detached),[true,false]);
 detached.type='hidden';assert.deepEqual(pair(matches,detached),[false,true]);detached.type='invalid-state';assert.equal(detached.type,'text');assert.deepEqual(pair(matches,detached),[true,false]);
 detached.removeAttribute('required');assert.deepEqual(pair(matches,detached),[false,true]);
 const before=target.querySelectorAll(':optional');target.body.removeChild(detached);assert.equal(before[before.length-1],detached);assert.deepEqual(pair(matches,detached),[false,true]);
 console.log(JSON.stringify({recordsBefore,recordsAfter:adopted.map(node=>Boolean(platformFactoryRecord(node))),actualPublicAssertions:'PASS'}));
}finally{await browser.close();pageOwner.documentAbort.abort();standalone.window.close();oldSource.window.close();}
`;

// Fresh child ensures genuine pre-hook construction regardless of test imports.
test('private backend channel preserves pre-hook standalone, nested, fragment, disconnected and adopted controls',{timeout:20000},async()=>{
 const {stdout}=await promisify(execFile)(process.execPath,['--experimental-vm-modules','--input-type=module','--eval',PRE_HOOK_PROGRAM],{cwd:fileURLToPath(new URL('..',import.meta.url)),timeout:15000,maxBuffer:1024*1024});
 assert.match(stdout,/"actualPublicAssertions":"PASS"/);
});
