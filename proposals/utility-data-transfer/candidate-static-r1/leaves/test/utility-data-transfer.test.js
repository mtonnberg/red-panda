import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {Browser} from '../src/browser.js';
import {createIsolatedWorld} from '../src/isolated-world.js';
import {installUtilityDataTransfer} from '../src/data-transfer.js';
import {installFetch} from '../src/fetch.js';
import {getHeapBinding} from '../src/native-heap.js';
import {observeDOMWrapperProxy} from '../src/dom-wrapper-realms.js';
import {fileWrapperImplementation} from '../src/file-wrapper-realms.js';
import {platformFactoryRecord} from '../src/platform-factories.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js'),File=require('jsdom/lib/jsdom/living/generated/File.js'),List=require('jsdom/lib/jsdom/living/generated/FileList.js');
const binding=getHeapBinding(),plain=value=>JSON.parse(JSON.stringify(value)),proofs=[];
function actual(value,anchor,label){const prototype=Object.getPrototypeOf(value),before={selected:binding.sameRealm(value,anchor),Host:binding.sameRealm(value,{}),global:binding.creationGlobal(value)===binding.creationGlobal(anchor)};Object.setPrototypeOf(value,null);const after={selected:binding.sameRealm(value,anchor),Host:binding.sameRealm(value,{}),global:binding.creationGlobal(value)===binding.creationGlobal(anchor)};Object.setPrototypeOf(value,prototype);proofs.push({label,before,after});assert.deepEqual(before,{selected:true,Host:false,global:true});assert.deepEqual(after,before)}
async function fixture(t){const browser=new Browser(),page=browser.createPage();await page.navigate('data:text/html,<input id=files type=file multiple>');const main=page.dom.window,world=createIsolatedWorld(main,{signal:page.documentAbort.signal});installFetch(page,world.global,{mainWindow:main,evaluate:source=>world.evaluate(source)});installUtilityDataTransfer(page,world);t.after(()=>{world.dispose();browser.close()});return{browser,page,main,world,g:world.global}}

test('main and utility DataTransfer definitions and first public values use their actual VMs and original single list Proxy',async t=>{
 const{main,world,g}=await fixture(t),observed=[];const stop=observeDOMWrapperProxy('FileList',(target,handler)=>observed.push({target,handler}));t.after(stop);
 for(const[global,label]of[[main,'main'],[g,'utility']]){
  const store=new global.DataTransfer(),files=store.files,item=store.items.add('actual','text/plain'),iterator=store.items[Symbol.iterator]();
  for(const[name,value]of Object.entries({Constructor:global.DataTransfer,prototype:global.DataTransfer.prototype,getFiles:Object.getOwnPropertyDescriptor(global.DataTransfer.prototype,'files').get,Item:global.DataTransferItem,ItemList:global.DataTransferItemList,store,files,item,list:store.items,iterator,next:iterator.next,result:iterator.next(),types:store.types}))actual(value,global.Object.prototype,label+':'+name);
  assert.equal(store.files,files);assert.equal(List.is(files),true);assert.equal(platformFactoryRecord(files).implementation,fileWrapperImplementation(files));assert.equal(utils.wrapperForImpl(fileWrapperImplementation(files)),files);
  const targets=binding.proxyTargets(files);assert.equal(targets.length,1);assert.ok(observed.some(row=>row.target===targets[0]));actual(targets[0],global.Object.prototype,label+':original-FileList-target');
 }
 assert.equal(observed.length,2);
 for(const{handler}of observed)for(const key of['get','getOwnPropertyDescriptor']){const value=handler[key],prototype=Object.getPrototypeOf(value);assert.equal(binding.sameRealm(value,{}),true);Object.setPrototypeOf(value,null);assert.equal(binding.sameRealm(value,{}),true);assert.equal(binding.sameRealm(value,g.Object.prototype),false);Object.setPrototypeOf(value,prototype)}
 assert.equal(world.evaluate('typeof DataTransfer'), 'function');
});

test('utility DataTransfer copies real membership into the shared stable input list and exact authored empty branch retains trust',async t=>{
 const{main,world}=await fixture(t),input=main.document.getElementById('files'),original=input.files,events=[];for(const type of['input','change'])input.addEventListener(type,e=>events.push([e.type,e.isTrusted,e.target===input,input.files.length]));
 const value=await world.evaluate(`(async()=>{const input=document.getElementById('files'),transfer=new DataTransfer(),list=input.files,file=new File(['utility data'],'utility.txt',{type:'text/plain',lastModified:123});transfer.items.add(file);input.files=transfer.files;transfer.items.clear();return{sameList:input.files===list,length:input.files.length,sourceLength:transfer.files.length,name:input.files[0].name,text:await input.files[0].text(),sameFile:input.files[0]===file,listInstance:input.files instanceof FileList,fileInstance:file instanceof File}})()`);
 assert.deepEqual(plain(value),{sameList:true,length:1,sourceLength:0,name:'utility.txt',text:'utility data',sameFile:true,listInstance:true,fileInstance:true});assert.equal(input.files,original);assert.equal(input.files[0].name,'utility.txt');assert.deepEqual(events,[]);
 for(let n=0;n<2;n++)world.evaluate(`(()=>{const element=document.getElementById('files');element.files=new DataTransfer().files;element.dispatchEvent(new Event('input',{bubbles:true,composed:true}));element.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 assert.equal(input.files,original);assert.equal(input.files.length,0);assert.equal(input.value,'');assert.deepEqual(events,[['input',false,true,0],['change',false,true,0],['input',false,true,0],['change',false,true,0]]);
});

test('utility File and Blob canonical factories retain genuine first frontends, original backends and real read/clone bytes',async t=>{
 const{main,world,g}=await fixture(t),values=world.evaluate(`(()=>{const blob=new Blob([new Uint8Array([3,0,255])],{type:'application/octet-stream'}),file=new File([blob],'actual.bin',{type:'application/octet-stream',lastModified:123}),slice=blob.slice(1);return{blob,file,slice}})()`);
 for(const[name,value]of Object.entries(values)){actual(value,g.Object.prototype,'utility:'+name);assert.equal(platformFactoryRecord(value).implementation,fileWrapperImplementation(value));assert.equal(utils.wrapperForImpl(fileWrapperImplementation(value)),value)}
 for(const[name,value]of Object.entries({File:g.File,Blob:g.Blob,FileList:g.FileList,filePrototype:g.File.prototype,blobText:g.Blob.prototype.text,blobArrayBuffer:g.Blob.prototype.arrayBuffer,fileName:Object.getOwnPropertyDescriptor(g.File.prototype,'name').get}))actual(value,g.Object.prototype,'utility-definition:'+name);
 assert.equal(File.is(values.file),true);assert.equal(await values.file.text(),'\u0003\u0000\ufffd');assert.deepEqual(Array.from(new Uint8Array(await values.file.arrayBuffer())),[3,0,255]);assert.deepEqual(Array.from(new Uint8Array(await values.slice.arrayBuffer())),[0,255]);
 const clone=main.structuredClone(values.file);assert.notEqual(clone,values.file);assert.equal(clone.name,'actual.bin');assert.equal(clone.type,'application/octet-stream');assert.equal(clone.lastModified,123);assert.deepEqual(Array.from(new Uint8Array(await clone.arrayBuffer())),[3,0,255]);assert.equal(utils.wrapperForImpl(fileWrapperImplementation(values.file)),values.file);
 const list=main.document.getElementById('files').files;const alias=world.evaluate('document.getElementById("files").files');assert.notEqual(alias,list);assert.equal(fileWrapperImplementation(alias),fileWrapperImplementation(list));assert.equal(utils.wrapperForImpl(fileWrapperImplementation(list)),list);assert.equal(List.is(alias),true);
});

test('copied symbols, Proxy fronts and public symbol redirection cannot authorize utility file/transfer brands or input assignment',async t=>{
 const{main,world,g}=await fixture(t),file=new g.File(['real'],'real.txt'),transfer=new g.DataTransfer(),list=transfer.files,input=world.evaluate('document.getElementById("files")');let reads=0;
 const setter=Object.getOwnPropertyDescriptor(g.HTMLInputElement.prototype,'files').set,getter=Object.getOwnPropertyDescriptor(g.DataTransfer.prototype,'files').get;
 for(const[value,convert]of[[file,File],[list,List]]){
  const copy=Object.create(Object.getPrototypeOf(value));Object.defineProperties(copy,Object.getOwnPropertyDescriptors(value));for(const key of Reflect.ownKeys(copy))if(typeof key==='symbol')Object.defineProperty(copy,key,{get(){reads++;throw Error('authored symbol')},configurable:true});
  const proxy=new Proxy(value,{get(){reads++;throw Error('authored Proxy')},getOwnPropertyDescriptor(){reads++;throw Error('authored descriptor')}});
  for(const fake of[copy,proxy]){assert.equal(convert.is(fake),false);if(value===list)assert.throws(()=>setter.call(input,fake),error=>{actual(error,g.Object.prototype,'setter-strong-brand-error');return error instanceof g.TypeError});else await assert.rejects(g.Blob.prototype.arrayBuffer.call(fake),error=>error instanceof g.TypeError)}
 }
 for(const fake of[{},Object.create(g.DataTransfer.prototype),new Proxy(transfer,{get(){reads++;throw Error('authored transfer')}})])assert.throws(()=>getter.call(fake),error=>{actual(error,g.Object.prototype,'transfer-strong-brand-error');return error instanceof g.TypeError&&error.message==='Illegal invocation'});
 const fakeBackend=Object.create(Object.getPrototypeOf(fileWrapperImplementation(file))),fakeFront=Object.create(g.File.prototype);
 Object.defineProperty(fakeFront,utils.implSymbol,{value:fakeBackend,configurable:true});Object.defineProperty(fakeBackend,utils.wrapperSymbol,{value:fakeFront,configurable:true});
 assert.equal(world.wrap(fakeFront),fakeFront);assert.equal(File.is(fakeFront),false);assert.equal(platformFactoryRecord(fakeFront),undefined);
 const symbol=utils.implSymbol,descriptor=Object.getOwnPropertyDescriptor(file,symbol),implementation=fileWrapperImplementation(file);
 Object.defineProperty(file,symbol,{get(){reads++;throw Error('authored real-file symbol')},configurable:true});
 try{assert.equal(File.is(file),true);assert.equal(fileWrapperImplementation(file),implementation);assert.equal(file.name,'real.txt');assert.equal(await file.text(),'real');const clone=main.structuredClone(file);assert.equal(await clone.text(),'real')}finally{if(descriptor)Object.defineProperty(file,symbol,descriptor);else delete file[symbol]}
 assert.equal(reads,0);assert.equal(input.files.length,0);
});

test('captured utility producer and private conversion arrays ignore replacement globals, registry constructors and numeric Array setters',async t=>{
 const{world}=await fixture(t);const result=world.evaluate(`(()=>{const Transfer=DataTransfer,FileType=File,BlobType=Blob,OriginalError=Error,OriginalArray=Array,OriginalObject=Object,OriginalSymbol=Symbol,saved=[],priorIndex=Object.getOwnPropertyDescriptor(Array.prototype,'0');let reads=0;const poison=()=>{reads++;throw new OriginalError('authored global')};for(const key of['Object','Proxy','Array','TypeError','FileList','Blob','Symbol']){saved.push([key,OriginalObject.getOwnPropertyDescriptor(globalThis,key)]);OriginalObject.defineProperty(globalThis,key,{get:poison,configurable:true})}OriginalObject.defineProperty(OriginalArray.prototype,'0',{set:poison,configurable:true});try{const transfer=new Transfer(),blob=new BlobType(['a']),file=new FileType(['b'],'b.txt',{lastModified:123}),entry=transfer.items.add(file);const iterator=transfer.items[OriginalSymbol.iterator]();return {values:[transfer.files.length,transfer.files[0]===file,entry.getAsFile()===file,blob.size,transfer.types[0],iterator.next().value===entry],reads}}finally{if(priorIndex)OriginalObject.defineProperty(OriginalArray.prototype,'0',priorIndex);else delete OriginalArray.prototype[0];for(const [key,descriptor]of saved)OriginalObject.defineProperty(globalThis,key,descriptor)}})()`);assert.deepEqual(plain(result),{values:[1,true,true,1,'Files',true],reads:0});
});

test('utility installation is idempotent and DataTransfer string callbacks remain real asynchronous owner tasks',async t=>{
 const{page,world,g}=await fixture(t),Constructor=g.DataTransfer,read=g.Blob.prototype.text;installUtilityDataTransfer(page,world);assert.equal(g.DataTransfer,Constructor);assert.equal(g.Blob.prototype.text,read);
 const trace=await world.evaluate(`new Promise(resolve=>{const transfer=new DataTransfer(),item=transfer.items.add('actual','text/plain'),trace=[];item.getAsString(value=>{trace.push(value);resolve(trace)});trace.push('sync');transfer.items.clear()})`);assert.deepEqual(Array.from(trace),['sync','actual']);
});
test.after(async()=>{if(process.env.DATA_TRANSFER_REALM_PROOF)await writeFile(process.env.DATA_TRANSFER_REALM_PROOF,JSON.stringify({proofs},null,2)+'\n',{flag:'wx'})});
