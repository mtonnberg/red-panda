// Actual file-control state over canonical jsdom backends. No public value is
// a protocol description: File/FileList consumers see the original real data.
import 'jsdom';
import {createRequire} from 'node:module';
import {platformFactoryRecord} from './platform-factories.js';
import {captureFileAPIRealm,withInputFileListAllocation} from './file-wrapper-realms.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const Input=require('jsdom/lib/jsdom/living/nodes/HTMLInputElement-impl.js').implementation;
const FileList=require('jsdom/lib/jsdom/living/file-api/FileList-impl.js').implementation;
const Event=require('jsdom/lib/jsdom/living/generated/Event.js');
const documents=new WeakMap(),installed=new WeakSet(),own=Object.getOwnPropertyDescriptor;
let patched=false;
function owner(control){return documents.get(control._ownerDocument)}
function replace(list,values){list.length=0;for(let i=0;i<values.length;i++)list.push(values[i])}
function patch(){
 if(patched)return;patched=true;
 const files=own(Input.prototype,'files'),value=own(Input.prototype,'value'),reset=Input.prototype._formReset;
 Object.defineProperty(Input.prototype,'files',{...files,set(source){
  if(!owner(this))return files.set.call(this,source);
  if(this.type!=='file'||source===null)return;
  if(!(source instanceof FileList))throw new TypeError('A canonical FileList implementation is required');
  const target=withInputFileListAllocation(owner(this).realm,()=>files.get.call(this));if(target===source)return;
  // Snapshot the actual members before mutation, including self/alias cases.
  replace(target,Array.from(source));
 },get(){const record=owner(this);return record?withInputFileListAllocation(record.realm,()=>files.get.call(this)):files.get.call(this)}});
 Object.defineProperty(Input.prototype,'value',{...value,set(text){if(owner(this)&&this.type==='file'&&text==='')return;return value.set.call(this,text)}});
 Input.prototype._formReset=function(...args){const result=Reflect.apply(reset,this,args);if(owner(this)&&this.type==='file')replace(this.files,[]);return result};
}
export function installFileInputs(page,window){
 if(installed.has(window))return;installed.add(window);patch();
 const document=platformFactoryRecord(window.document)?.implementation;
 if(!document)throw new TypeError('A canonical Document implementation is required');
 const record=Object.assign(Object.create(null),{page,window,document,signal:page.documentAbort?.signal,realm:captureFileAPIRealm(page,window)});
 documents.set(document,record);
}
export function fileInputOwner(implementation){return implementation instanceof Input?owner(implementation):undefined}
export function commitFileInputSelection(implementation,values){
 const record=owner(implementation);if(!record||record.page.closed||record.page.retired||record.signal?.aborted||!record.document._defaultView)return false;
 const list=implementation.files;replace(list,values);
 for(const type of ['input','change'])implementation._dispatch(Event.createImpl(record.document._globalObject,[type,{bubbles:true,cancelable:false,composed:false}],{isTrusted:true}));
 return true;
}
