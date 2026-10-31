import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Browser} from '../src/browser.js';
import {getHeapBinding} from '../src/native-heap.js';
import {runFileInput} from '../src/cdp-file-input.js';
import {platformFactoryRecord} from '../src/platform-factories.js';
import {fileWrapperImplementation} from '../src/file-wrapper-realms.js';
import {observeDOMWrapperProxy} from '../src/dom-wrapper-realms.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js'),File=require('jsdom/lib/jsdom/living/generated/File.js'),List=require('jsdom/lib/jsdom/living/generated/FileList.js'),Blob=require('jsdom/lib/jsdom/living/generated/Blob.js');
class WireError extends Error {constructor(message,code){super(message);this.code=code}}
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'red-panda-file-input-')),browser=new Browser({timeout:1000}),page=browser.createPage();
 t.after(async()=>{browser.close();await rm(dir,{recursive:true,force:true})});
 await page.navigate('data:text/html,<form id=form><input id=a type=file required><input id=b type=file></form><iframe id=child>');
 const w=page.dom.window,a=w.document.getElementById('a'),b=w.document.getElementById('b');
 const session={page,nodes:new Map([[1,a],[2,b]]),object(id){if(id==='a')return a;throw Error('actual missing handle')}},connection={browser,sessions:new Map([['actual-test-session',session]])};
 const set=(files,selector={nodeId:1})=>runFileInput(connection,session,{files,...selector},WireError);
 const path=join(dir,'owned.txt'),binary=join(dir,'bytes.unknown');await writeFile(path,Buffer.from([65,0,255]));await writeFile(binary,Buffer.from([3,1,4]));await utimes(path,1700000000.125,1700000000.125);
 return {dir,browser,page,w,a,b,path,binary,set,connection,session};
}
function actualRealm(value,w){const binding=getHeapBinding(),anchor=w.eval('[]'),host=[],p=Object.getPrototypeOf(value);try{for(let i=0;i<2;i++){assert.equal(binding.sameRealm(value,anchor),true);assert.equal(binding.sameRealm(value,host),false);assert.equal(binding.creationGlobal(value),binding.creationGlobal(anchor));Object.setPrototypeOf(value,null)}}finally{Object.setPrototypeOf(value,p)}}
test('file-api factories allocate genuine VM wrappers before binding the same canonical backend and sole list Proxy',async t=>{
 const observed=[];const stop=observeDOMWrapperProxy('FileList',(target,handler)=>observed.push({target,handler}));t.after(stop);
 const {w,a}=await fixture(t),blob=new w.Blob(['real']),file=new w.File(['bytes'],'authored.txt',{lastModified:123});
 for(const value of [blob,file,a.files])actualRealm(value,w);
 for(const[value,factory]of [[blob,Blob],[file,File],[a.files,List]]){const implementation=fileWrapperImplementation(value);assert.equal(platformFactoryRecord(value).implementation,implementation);assert.equal(utils.wrapperForImpl(implementation),value);assert.equal(utils.implForWrapper(value),implementation);assert.equal(factory.is(value),true)}
 // Legacy generated public definitions are explicitly outside this migration.
 assert.equal(getHeapBinding().sameRealm(w.File,[]),true);
 assert.ok(observed.length);const binding=getHeapBinding();for(const {target,handler}of observed){actualRealm(target,w);for(const key of ['get','getOwnPropertyDescriptor']){const f=handler[key],p=Object.getPrototypeOf(f);try{for(let i=0;i<2;i++){assert.equal(binding.sameRealm(f,[]),true);assert.equal(binding.sameRealm(f,w.eval('[]')),false);Object.setPrototypeOf(f,null)}}finally{Object.setPrototypeOf(f,p)}}}
});
test('copied and Proxy lookalikes cannot supply file brands or trigger authored symbol getters',async t=>{
 const {w,a}=await fixture(t);for(const[value,factory,Prototype,key]of [[new w.File(['actual'],'name'),File,w.File.prototype,'name'],[a.files,List,w.FileList.prototype,'length']]){
  let reads=0;const fake=Object.create(Object.getPrototypeOf(value));Object.defineProperties(fake,Object.getOwnPropertyDescriptors(value));
  const symbol=Reflect.ownKeys(value).find(k=>typeof k==='symbol'&&k.description==='impl');if(symbol)Object.defineProperty(fake,symbol,{get(){reads++;throw Error('authored slot read')},configurable:true});
  assert.equal(factory.is(fake),false);assert.equal(factory.is(new Proxy(value,{get(){reads++;throw Error('authored Proxy read')}})),false);
  assert.throws(()=>Object.getOwnPropertyDescriptor(Prototype,key).get.call(fake),e=>e instanceof w.TypeError);assert.equal(reads,0);
 }
});
test('real disk assignment yields exact bytes, stat mtime, stable list and trusted plain input then change Events',async t=>{
 const {w,a,path,binary,set}=await fixture(t),list=a.files,events=[];
 for(const type of ['input','change'])a.addEventListener(type,e=>events.push([e.type,e.isTrusted,e.bubbles,e.cancelable,e.composed,e instanceof w.Event,e instanceof w.InputEvent,Array.from(a.files,f=>f.name)]));
 assert.deepEqual(set([path,binary]),{});assert.equal(a.files,list);assert.equal(list.length,2);assert.equal(a.multiple,false);assert.equal(a.validity.valueMissing,false);actualRealm(list,w);actualRealm(list[0],w);
 assert.deepEqual(Array.from(new w.Uint8Array(await list[0].arrayBuffer())),[65,0,255]);assert.equal(list[0].name,'owned.txt');assert.equal(list[0].type,'text/plain');assert.equal(list[0].lastModified,1700000000125);assert.equal(list[1].type,'application/octet-stream');
 assert.deepEqual(events,[['input',true,true,false,false,true,false,['owned.txt','bytes.unknown']],['change',true,true,false,false,true,false,['owned.txt','bytes.unknown']]]);
});
test('a later disk failure preserves actual old File identity, bytes, list and event count atomically',async t=>{
 const {w,a,path,binary,dir,set}=await fixture(t);set([path]);const list=a.files,file=list[0];let events=0;a.addEventListener('input',()=>events++);a.addEventListener('change',()=>events++);
 assert.throws(()=>set([binary,join(dir,'missing-owned-path')]),e=>e.code===-31998&&e.message==='FileNotFound');assert.equal(a.files,list);assert.equal(list.length,1);assert.equal(list[0],file);assert.equal(events,0);assert.deepEqual(Array.from(new w.Uint8Array(await file.arrayBuffer())),[65,0,255]);
});
test('files assignment copies membership, empty value keeps it, reset clears and every explicit empty selection fires real events',async t=>{
 const {a,b,path,binary,set}=await fixture(t),target=b.files;set([path,binary]);b.files=a.files;assert.equal(b.files,target);assert.notEqual(b.files,a.files);assert.equal(b.files[0],a.files[0]);set([binary]);assert.equal(b.files.length,2);
 a.value='';assert.equal(a.files.length,1);a.form.reset();assert.equal(a.files.length,0);assert.equal(b.files.length,0);
 const events=[];a.addEventListener('input',e=>events.push([e.type,e.isTrusted]));a.addEventListener('change',e=>events.push([e.type,e.isTrusted]));set([]);set([]);assert.deepEqual(events,[['input',true],['change',true],['input',true],['change',true]]);
});
test('selector precedence and strong private real-Node authority reject copied lookalikes without reading authored slots',async t=>{
 const {w,a,path,set,connection,session}=await fixture(t);set([path],{nodeId:1,backendNodeId:2,objectId:'missing'});assert.equal(a.files.length,1);
 assert.throws(()=>set([path],{nodeId:4000000000,backendNodeId:1}),e=>e.code===-31998&&e.message==='NodeNotFound');
 let reads=0;const fake=Object.create(w.HTMLInputElement.prototype);Object.defineProperties(fake,Object.getOwnPropertyDescriptors(a));session.object=()=>fake;
 const sym=Reflect.ownKeys(a).find(k=>typeof k==='symbol'&&k.description==='impl');if(sym)Object.defineProperty(fake,sym,{get(){reads++;throw Error('authored input slot')},configurable:true});
 assert.throws(()=>runFileInput(connection,session,{files:[path],objectId:'fake'},WireError),e=>e.message==='ObjectIdIsNotANode');assert.equal(reads,0);
});
test('immutable Blob reads retain actual file backing after authored implementation-symbol replacement',async t=>{
 const {w,a,path,set}=await fixture(t);set([path]);const file=a.files[0],sym=Reflect.ownKeys(file).find(k=>typeof k==='symbol'&&k.description==='impl');let reads=0;
 if(sym)Object.defineProperty(file,sym,{get(){reads++;throw Error('authored file slot')},configurable:true});
 assert.equal(file.name,'owned.txt');assert.equal(file.size,3);assert.deepEqual(Array.from(new w.Uint8Array(await file.arrayBuffer())),[65,0,255]);assert.equal(reads,0);
});
test('genuine standalone Host documents retain Host allocation and canonical File and FileList behavior',()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<input type=file>');try{const w=dom.window,file=new w.File(['host'],'host.txt'),list=w.document.querySelector('input').files;assert.equal(getHeapBinding().sameRealm(file,[]),true);assert.equal(getHeapBinding().sameRealm(list,[]),true);assert.equal(file.name,'host.txt');assert.equal(list.length,0);assert.equal(File.is(file),true);assert.equal(List.is(list),true)}finally{dom.window.close()}
});
for(const access of ['index','item','iterator'])test('child first '+access+' access uses actual indexed-reader or method-callee VM and retains one canonical File',async t=>{
 const {w,path,page,connection}=await fixture(t),iframe=w.document.querySelector('iframe');const child=iframe.contentWindow,input=child.document.createElement('input');input.type='file';input.id='childUpload';child.document.body.append(input);
 const session={page,nodes:new Map([[1,input]])};connection.sessions.set('child-control',session);runFileInput(connection,session,{files:[path],nodeId:1},WireError);
 const list=input.files;assert.equal(Object.getPrototypeOf(list),w.FileList.prototype);actualRealm(list,w);
 const expression=access==='index'?'list[0]':access==='item'?'list.item(0)':'list[Symbol.iterator]().next().value';
 const first=child.eval(`(()=>{const list=document.getElementById('childUpload').files;return ${expression}})()`);const selected=access==='index'?child:w;actualRealm(first,selected);assert.equal(Object.getPrototypeOf(first),selected.File.prototype);assert.equal(list[0],first);assert.equal(list.item(0),first);assert.equal(list[Symbol.iterator]().next().value,first);assert.equal(platformFactoryRecord(first).implementation,fileWrapperImplementation(first));
});
test('main first File access stays in its original genuine VM after child access without retargeting',async t=>{
 const {w,path,page,connection}=await fixture(t),iframe=w.document.querySelector('iframe');const child=iframe.contentWindow,input=child.document.createElement('input');input.type='file';input.id='childUpload';child.document.body.append(input);const session={page,nodes:new Map([[1,input]])};connection.sessions.set('child-main-control',session);runFileInput(connection,session,{files:[path],nodeId:1},WireError);
 const file=w.eval(`document.querySelector('iframe').contentDocument.getElementById('childUpload').files[0]`);actualRealm(file,w);assert.equal(Object.getPrototypeOf(file),w.File.prototype);const childRead=child.eval(`document.getElementById('childUpload').files.item(0)`);assert.equal(childRead,file);actualRealm(childRead,w);assert.equal(childRead instanceof child.File,false);
});
test('borrowed item uses its authentic method VM independently of caller and preserves the first real File',async t=>{
 const {w,path,page,connection}=await fixture(t),child=w.document.querySelector('iframe').contentWindow,input=child.document.createElement('input');input.id='childUpload';input.type='file';child.document.body.append(input);const session={page,nodes:new Map([[1,input]])};connection.sessions.set('borrowed-item',session);
 runFileInput(connection,session,{files:[path],nodeId:1},WireError);const first=child.FileList.prototype.item.call(input.files,0);actualRealm(first,child);assert.equal(Object.getPrototypeOf(first),child.File.prototype);assert.equal(w.FileList.prototype.item.call(input.files,0),first);
 runFileInput(connection,session,{files:[path],nodeId:1},WireError);const second=w.FileList.prototype.item.call(input.files,0);actualRealm(second,w);assert.equal(Object.getPrototypeOf(second),w.File.prototype);assert.equal(child.FileList.prototype.item.call(input.files,0),second);
});
test('genuine VM iterator prototypes and results follow actual borrowed next callee with exact public data shape',async t=>{
 const {w,path,page,connection}=await fixture(t),child=w.document.querySelector('iframe').contentWindow,input=child.document.createElement('input');input.id='childUpload';input.type='file';child.document.body.append(input);const session={page,nodes:new Map([[1,input]])};connection.sessions.set('borrowed-next',session);const assign=()=>runFileInput(connection,session,{files:[path],nodeId:1},WireError);
 assign();const list=input.files,main=list[Symbol.iterator](),other=child.FileList.prototype[Symbol.iterator].call(list),mp=Object.getPrototypeOf(main),cp=Object.getPrototypeOf(other);actualRealm(main,w);actualRealm(mp,w);actualRealm(other,child);actualRealm(cp,child);assert.notEqual(mp,cp);assert.deepEqual(Reflect.ownKeys(main),[]);assert.equal(Object.hasOwn(main,'next'),false);assert.equal(Object.prototype.toString.call(main),'[object Object]');assert.deepEqual(Reflect.ownKeys(mp),['next','constructor',Symbol.iterator]);assert.equal(main[Symbol.iterator](),main);assert.equal(typeof main.return,'undefined');assert.equal(typeof main.throw,'undefined');
 for(const [prototype,selected]of [[mp,w],[cp,child]]){actualRealm(prototype.next,selected);actualRealm(prototype.constructor,selected);actualRealm(prototype[Symbol.iterator],selected);assert.equal(prototype.next.name,'next');assert.equal(prototype.next.length,0);assert.equal(Object.getOwnPropertyDescriptor(prototype,'next').enumerable,true);assert.equal(Object.getOwnPropertyDescriptor(prototype,'constructor').enumerable,false);assert.equal(Object.getOwnPropertyDescriptor(prototype,Symbol.iterator).enumerable,false)}
 const result=cp.next.call(main);actualRealm(result,child);actualRealm(result.value,child);assert.deepEqual(Object.keys(result),['done','value']);assert.equal(result.done,false);for(const key of ['done','value']){const d=Object.getOwnPropertyDescriptor(result,key);assert.equal(d.enumerable,true);assert.equal(d.configurable,true);assert.equal(d.writable,true)}
 assign();const fresh=child.FileList.prototype[Symbol.iterator].call(list),opposite=mp.next.call(fresh);actualRealm(opposite,w);actualRealm(opposite.value,w);const done=mp.next.call(fresh);assert.equal(done.done,true);assert.equal(done.value,undefined);assert.equal(Object.hasOwn(done,'value'),true);
});
test('real iterator reads live replacement and resumes at unchanged index after done',async t=>{
 const {w,a,path,binary,set}=await fixture(t);set([path,binary]);const it=a.files[Symbol.iterator]();assert.equal(it.next().value.name,'owned.txt');set([binary]);assert.equal(it.next().done,true);set([path,binary]);assert.equal(it.next().value.name,'bytes.unknown');assert.equal(it.next().done,true);
 const before=a.files[Symbol.iterator]();set([binary,path]);assert.equal(before.next().value.name,'bytes.unknown');set([]);assert.equal(before.next().done,true);set([binary,path]);const resumed=before.next();actualRealm(resumed,w);assert.equal(resumed.done,false);assert.equal(resumed.value.name,'owned.txt');
});
test('private iterator brands reject copied/Proxy receivers without traps and use real callee VM errors',async t=>{
 const {w,a}=await fixture(t),child=w.document.querySelector('iframe').contentWindow,it=a.files[Symbol.iterator](),other=child.FileList.prototype[Symbol.iterator].call(a.files);let traps=0;const fake=Object.create(Object.getPrototypeOf(it)),proxy=new Proxy(it,{get(){traps++;throw Error('authored iterator trap')}});
 for(const receiver of [fake,proxy])assert.throws(()=>it.next.call(receiver),e=>{actualRealm(e,w);return e instanceof w.TypeError&&e.message==='Illegal invocation'});
 assert.throws(()=>Object.getPrototypeOf(other).next.call(fake),e=>{actualRealm(e,child);return e instanceof child.TypeError&&e.message==='Illegal invocation'});assert.equal(traps,0);
 assert.throws(()=>w.FileList.prototype[Symbol.iterator].call(Object.create(w.FileList.prototype)),e=>e instanceof w.TypeError&&e.message==='invalid argument');
});
test('real stateful iterators reject cloning while real disk File still clones actual bytes',async t=>{
 const {w,a,path,set}=await fixture(t);set([path]);const it=a.files[Symbol.iterator]();assert.throws(()=>w.structuredClone(it),e=>e.name==='DataCloneError');const original=a.files[0],copy=w.structuredClone(original);assert.notEqual(copy,original);actualRealm(copy,w);assert.equal(copy.name,original.name);assert.equal(copy.type,original.type);assert.equal(copy.lastModified,original.lastModified);assert.deepEqual(Array.from(new w.Uint8Array(await copy.arrayBuffer())),[65,0,255]);
});
