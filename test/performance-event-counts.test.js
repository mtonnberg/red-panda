import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Browser} from '../src/browser.js';
import {getHeapBinding} from '../src/native-heap.js';
import {writeFile} from 'node:fs/promises';

const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(t){const browser=new Browser();t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,<body><button id="target">real</button><iframe></iframe>');return page;}

test('EventCounts observes actual dispatch once before bubbling, nested, activation and redispatch listeners',async t=>{
 const page=await fixture(t),result=page.evaluate(`(()=>{const ec=performance.eventCounts,b=document.getElementById('target'),trace=[];for(const t of[b,document,window])t.addEventListener('click',()=>trace.push(ec.get('click')));const e=new Event('click',{bubbles:true});b.dispatchEvent(e);b.dispatchEvent(e);b.click();b.disabled=true;b.click();new EventTarget().dispatchEvent(new Event('click'));let nested=false;b.addEventListener('click',()=>{if(!nested){nested=true;b.dispatchEvent(new Event('click'));}});b.dispatchEvent(new Event('click'));return{trace,click:ec.get('click'),unknown:ec.get('load'),size:ec.size}})()`);
 assert.deepEqual(plain(result),{trace:[1,1,1,2,2,2,3,3,3,5,6],click:6,unknown:0,size:36});
});

test('EventCounts uses the actual target owner, independently of Event creation realm and inactive Document',async t=>{
 const page=await fixture(t),result=page.evaluate(`(()=>{const main=performance.eventCounts,child=document.querySelector('iframe').contentWindow;child.document.body.dispatchEvent(new Event('click'));const inert=document.implementation.createHTMLDocument(),b=inert.createElement('button');inert.body.append(b);b.click();return{main:main.get('click'),child:child.performance.eventCounts.get('click')}})()`);
 assert.deepEqual(plain(result),{main:1,child:1});
});

test('EventCounts brands are private and conversion plus clone errors use the genuine realm',async t=>{
 const page=await fixture(t),result=page.evaluate(`(()=>{const ec=performance.eventCounts,errors=[],fake={};Object.defineProperties(fake,Object.getOwnPropertyDescriptors(ec));for(const value of[{},fake,Object.create(ec),new Proxy(ec,{})]){try{ec.get.call(value,'click');errors.push(false);}catch(e){errors.push(e instanceof TypeError&&e.message==='Illegal invocation');}}let calls=0;const has=ec.has({toString(){calls++;return'click'}});let cloned;try{structuredClone(ec);cloned='accepted';}catch(e){cloned=e.name;}return{errors,has,calls,symbol:ec.has(Symbol('click')),cloned,own:Reflect.ownKeys(ec).length,map:ec instanceof Map}})()`);
 assert.deepEqual(plain(result),{errors:[true,true,true,true],has:true,calls:1,symbol:true,cloned:'DataCloneError',own:0,map:false});
});

test('EventCounts iterators read live counts and forEach continues after actual callback throws',async t=>{
 const page=await fixture(t),result=page.evaluate(`(()=>{const ec=performance.eventCounts,it=ec.entries(),first=it.next();document.getElementById('target').click();const second=it.next();let calls=0,escaped=false;try{ec.forEach(()=>{calls++;throw new Error('actual');});}catch{escaped=true;}let borrowed=false;try{Object.getPrototypeOf(it).next.call({});}catch(e){borrowed=e instanceof TypeError;}return{first,second,calls,escaped,borrowed,tag:Object.prototype.toString.call(it),alias:Object.getPrototypeOf(ec)[Symbol.iterator]===Object.getPrototypeOf(ec).entries}})()`);
 assert.deepEqual(plain(result),{first:{done:false,value:['auxclick',0]},second:{done:false,value:['click',1]},calls:36,escaped:false,borrowed:true,tag:'[object Object]',alias:false});
});

test('all EventCounts getters, typed iterators, constructors, next functions and borrowed results have genuine creation contexts',async t=>{
 const browser=new Browser();t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,<body><iframe></iframe>');
 const main=page.dom.window,child=main.document.querySelector('iframe').contentWindow,binding=getHeapBinding(),rows=[];
 function physical(label,value,window){
  const anchor=window.eval('[]'),prototype=Object.getPrototypeOf(value),row={label};
  try{row.first=binding.sameRealm(value,anchor);row.host=binding.sameRealm(value,[]);row.firstGlobal=binding.creationGlobal(value)===binding.creationGlobal(anchor);Object.setPrototypeOf(value,null);row.after=binding.sameRealm(value,anchor);row.afterGlobal=binding.creationGlobal(value)===binding.creationGlobal(anchor);}finally{Object.setPrototypeOf(value,prototype);}
  rows.push(row);assert.equal(row.first,true,label);assert.equal(row.host,false,label);assert.equal(row.firstGlobal,true,label);assert.equal(row.after,true,label);assert.equal(row.afterGlobal,true,label);
 }
 for(const [label,w]of [['main',main],['child',child]]){
  const ec=w.performance.eventCounts,C=w.EventCounts;physical(label+':front',ec,w);physical(label+':constructor',C,w);physical(label+':prototype',C.prototype,w);
  for(const key of Reflect.ownKeys(C.prototype)){const descriptor=Object.getOwnPropertyDescriptor(C.prototype,key);for(const field of ['value','get','set'])if(typeof descriptor[field]==='function')physical(label+':EventCounts:'+String(key)+':'+field,descriptor[field],w);}
  const getter=Object.getOwnPropertyDescriptor(w.Performance.prototype,'eventCounts').get;physical(label+':Performance:eventCounts:get',getter,w);
  let error;try{getter.call({});}catch(value){error=value;}physical(label+':Performance:eventCounts:error',error,w);
  for(const kind of ['keys','values','entries']){
   const it=ec[kind](),p=Object.getPrototypeOf(it),step=it.next();physical(label+':'+kind+':front',it,w);physical(label+':'+kind+':prototype',p,w);physical(label+':'+kind+':constructor',p.constructor,w);physical(label+':'+kind+':next',p.next,w);physical(label+':'+kind+':iterator',p[w.Symbol.iterator],w);physical(label+':'+kind+':step',step,w);if(kind==='entries'){physical(label+':'+kind+':pair',step.value,w);physical(label+':'+kind+':second-pair',it.next().value,w);}
   let failure;try{p.next.call({});}catch(value){failure=value;}physical(label+':'+kind+':error',failure,w);
  }
 }
 for(const [label,w,other]of [['main',main,child],['child',child,main]]){
  const p=Object.getPrototypeOf(w.performance.eventCounts.entries()),step=p.next.call(other.performance.eventCounts.entries());physical(label+':borrowed-step',step,w);physical(label+':borrowed-pair',step.value,w);
 }
 if(process.env.EVENT_COUNTS_CREATION_PROOF)await writeFile(process.env.EVENT_COUNTS_CREATION_PROOF,JSON.stringify({node:process.version,scope:'O(1) genuine public V8 Context and creation Global before/after null prototypes; no heap enumeration',rows},null,2)+'\n',{flag:'wx'});
});
