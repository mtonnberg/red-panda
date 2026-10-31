// Actual file-control state over canonical jsdom backends. No public value is
// a protocol description: File/FileList consumers see the original real data.
import 'jsdom';
import {createRequire} from 'node:module';
import {platformFactoryRecord} from './platform-factories.js';
import {captureFileAPIRealm,withInputFileListAllocation} from './file-wrapper-realms.js';
import {createInvocationTrampoline} from './invocation.js';
import {captureDispatchWindow,withOwnedDispatchRecovery} from './dom-dispatch-recovery.js';
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
 const realm=captureFileAPIRealm(page,window);
 if(!realm)throw new TypeError('An actual file-input owner VM is required');
 captureDispatchWindow(window,realm.context);
 const record=Object.assign(Object.create(null),{page,window,document,signal:page.documentAbort?.signal,realm,context:realm.context,invocation:createInvocationTrampoline(realm.context),options:{timeout:Math.min(page.timeout??2000,2000),displayErrors:false}});
 documents.set(document,record);
}
export function fileInputOwner(implementation){return implementation instanceof Input?owner(implementation):undefined}
export function commitFileInputSelection(implementation,values){
 const record=owner(implementation);if(!record||record.page.closed||record.page.retired||record.signal?.aborted||!record.document._defaultView)return false;
 // CDP is a Host entry with no outer Runtime.evaluate watchdog. Enter the
 // captured genuine owner VM before the actual commit/event cohort, just as
 // owned Page.stopLoading does for authored abort handlers. The original
 // synchronous state mutation/dispatch order remains inside this one budget.
 return withOwnedDispatchRecovery(()=>record.invocation.invoke(commitAndDispatch,undefined,[implementation,values,record],record.options));
}
function commitAndDispatch(implementation,values,record){
 const list=implementation.files;replace(list,values);
 for(const type of ['input','change'])implementation._dispatch(Event.createImpl(record.document._globalObject,[type,{bubbles:true,cancelable:false,composed:false}],{isTrusted:true}));
 return true;
}
