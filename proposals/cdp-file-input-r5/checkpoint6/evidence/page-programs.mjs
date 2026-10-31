// Authored independent controls. No execution until a Parent quiet-runtime grant.
export const html=child=>`<!doctype html><meta charset=utf-8><body><p id=owned>${child?'child':'main'}</p><form id=form><input id=upload name=upload type=file required><input id=other name=other type=file><input id=text type=text><div id=plain>owned text</div></form>${child?'':'<iframe id=child src=/child></iframe>'}`;
export const bootstrap=`(()=>{
  const own=w=>{
    const events=[];w.ownedEvents=events;
    for(const type of ['input','change'])w.document.addEventListener(type,e=>events.push({type:e.type,trusted:e.isTrusted,bubbles:e.bubbles,cancelable:e.cancelable,composed:e.composed,target:e.target.id,owner:e.target.ownerDocument===w.document,event:e instanceof w.Event,inputEvent:e instanceof w.InputEvent,names:Array.from(e.target.files??[],f=>f.name),sizes:Array.from(e.target.files??[],f=>f.size)}));
    w.ownedHeldList=w.document.getElementById('upload').files;
    w.ownedHeldOtherList=w.document.getElementById('other').files;
    w.ownedHeldFile=null;
  };
  own(window);own(document.getElementById('child').contentWindow);
  globalThis.ownedFixtureReady=true;
  return {main:document.readyState,child:document.getElementById('child').contentDocument.readyState};
})()`;
export const authoredProducer=`(async()=>{
  const file=new File([new Uint8Array([65,0,255])],'page-created.txt',{type:'Text/Plain',lastModified:1234});
  globalThis.ownedAuthoredFile=file;
  return {name:file.name,type:file.type,size:file.size,lastModified:file.lastModified,file:file instanceof File,blob:file instanceof Blob,tag:Object.prototype.toString.call(file),bytes:Array.from(new Uint8Array(await file.arrayBuffer()))};
})()`;
export function snapshot(which='main'){
 return `(async()=>{
  const w=${which==='child'?'document.getElementById("child").contentWindow':'window'},u=w.document.getElementById('upload'),o=w.document.getElementById('other');
  const read=async f=>({name:f.name,type:f.type,size:f.size,lastModified:f.lastModified,file:f instanceof w.File,blob:f instanceof w.Blob,tag:Object.prototype.toString.call(f),webkitRelativePath:f.webkitRelativePath===undefined?{absent:true}:f.webkitRelativePath,bytes:Array.from(new w.Uint8Array(await f.arrayBuffer()))});
  const list=u.files,files=[];for(let i=0;i<list.length;i++)files.push(await read(list[i]));
  const attempt=fn=>{try{return {value:fn()}}catch(e){return {error:{name:e.name,message:e.message}}}};
  return {frame:${JSON.stringify(which)},value:u.value,length:list.length,files,listStable:list===w.ownedHeldList,otherListStable:o.files===w.ownedHeldOtherList,otherNames:Array.from(o.files,f=>f.name),fileList:list instanceof w.FileList,tag:Object.prototype.toString.call(list),itemMinusOne:attempt(()=>list.item(-1)===null),itemEnd:attempt(()=>list.item(list.length)===null),indexEnd:list[list.length]===undefined,keys:Object.keys(list),iterated:Array.from(list,f=>f.name),fileHeld:list[0]===w.ownedHeldFile,heldFile:w.ownedHeldFile?await read(w.ownedHeldFile):null,multiple:u.multiple,accept:u.accept,disabled:u.disabled,readOnly:u.readOnly,required:u.required,valid:u.validity.valid,valueMissing:u.validity.valueMissing,events:w.ownedEvents.slice()};
 })()`;
}
export const holdFirst=`(()=>{ownedHeldFile=document.getElementById('upload').files[0]??null;return {held:!!ownedHeldFile}})()`;
export const copyList=`(()=>{const u=document.getElementById('upload'),o=document.getElementById('other');const old=o.files;o.files=u.files;return {sameSource:o.files===u.files,sameOld:o.files===old,names:Array.from(o.files,f=>f.name),sourceNames:Array.from(u.files,f=>f.name),sameFile:o.files[0]===u.files[0],events:ownedEvents.slice()}})()`;
