// Bounded public-API observations; no upstream engine implementation is used.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';

export const expression = `(async () => {
  const output = {}, attempt = callback => { try { return callback() ?? null; } catch (error) { return {error:error.name,message:error.message}; } };
  const state = element => ({open:element.open ?? null,modal:attempt(()=>element.matches(':modal')),popover:attempt(()=>element.matches(':popover-open')),active:document.activeElement?.id,html:element.outerHTML});
  const create = (tag='dialog', html='') => { const element=document.createElement(tag);element.innerHTML=html;document.body.append(element);return element; };
  const flush = () => new Promise(resolve=>setTimeout(resolve,20));
  output.api = Object.fromEntries(['show','showModal','close','requestClose','closedBy','returnValue'].map(name=>[name,{type:typeof document.createElement('dialog')[name],descriptor:attempt(()=>{const d=Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,name);return d?{enumerable:d.enumerable,configurable:d.configurable,writable:d.writable,length:d.value?.length}:null})}]));
  output.popoverApi = Object.fromEntries(['popover','showPopover','hidePopover','togglePopover'].map(name=>[name,typeof document.createElement('div')[name]]));output.ToggleEvent=typeof ToggleEvent;
  try {
  output.stage='dialog';
  const before = create('button'); before.id='before';before.focus();
  const dialog=create('dialog','<input id=first><input id=auto autofocus>');dialog.id='dialog';
  const events=[];for(const type of ['beforetoggle','toggle','cancel','close'])dialog.addEventListener(type,event=>events.push({type,oldState:event.oldState,newState:event.newState,cancelable:event.cancelable,bubbles:event.bubbles,trusted:event.isTrusted,open:dialog.open,modal:attempt(()=>dialog.matches(':modal'))}));
  output.show=attempt(()=>{dialog.show();return state(dialog)});output.showSync=events.slice();await flush();output.showAsync=events.splice(0);
  output.showModalWhileOpen=attempt(()=>dialog.showModal());dialog.close('first');output.closeSync={state:state(dialog),events:events.slice()};await flush();output.closeAsync=events.splice(0);
  before.focus();dialog.showModal();output.modal=state(dialog);output.showWhileModal=attempt(()=>dialog.show());output.modalAgain=attempt(()=>dialog.showModal());
  dialog.removeAttribute('open');output.removedOpen=state(dialog);await flush();output.removedEvents=events.splice(0);document.body.append(dialog);dialog.showModal();dialog.remove();output.removedModal=state(dialog);document.body.append(dialog);output.reinsertedModal=state(dialog);output.reinsertedShowModal=attempt(()=>dialog.showModal());dialog.close();await flush();events.length=0;
  dialog.returnValue='preset';dialog.show();dialog.close(undefined);output.closeUndefined=dialog.returnValue;dialog.show();dialog.close(null);output.closeNull=dialog.returnValue;
  output.requestClose=attempt(()=>{dialog.show();dialog.requestClose('requested');return state(dialog)});await flush();output.requestCloseEvents=events.splice(0);dialog.close();
  output.stage='popover';
  const pop=create('div','<button id=inside>inside</button>');pop.id='pop';
  output.popoverReflection=[];for(const value of [null,'','auto','manual','hint','bogus','AUTO']){if(value===null)pop.removeAttribute('popover');else pop.setAttribute('popover',value);output.popoverReflection.push([value,pop.popover]);}
  const pe=[];for(const type of ['beforetoggle','toggle'])pop.addEventListener(type,event=>pe.push({type,oldState:event.oldState,newState:event.newState,cancelable:event.cancelable,bubbles:event.bubbles,trusted:event.isTrusted}));
  pop.popover='auto';output.popShow=attempt(()=>{pop.showPopover();return state(pop)});output.popSync=pe.slice();await flush();output.popAsync=pe.splice(0);output.popAgain=attempt(()=>pop.showPopover());
  output.popToggle=attempt(()=>pop.togglePopover());output.popToggleForced=attempt(()=>pop.togglePopover(true));output.popHide=attempt(()=>pop.hidePopover());await flush();output.popToggleEvents=pe.splice(0);
  const cancel=event=>event.preventDefault();pop.addEventListener('beforetoggle',cancel);output.popCancelled=attempt(()=>{pop.showPopover();return state(pop)});pop.removeEventListener('beforetoggle',cancel);
  pop.showPopover();pop.removeAttribute('popover');output.popRemovedAttribute=state(pop);await flush();output.popRemovedEvents=pe.splice(0);pop.popover='manual';pop.showPopover();pop.remove();output.popRemoved=state(pop);document.body.append(pop);output.popReinserted=state(pop);pop.hidePopover();
  const detached=document.createElement('div');detached.popover='manual';output.detachedPopover=attempt(()=>detached.showPopover());output.missingPopover=attempt(()=>document.body.showPopover());output.missingPopoverHide=attempt(()=>document.body.hidePopover());output.detachedPopoverHide=attempt(()=>detached.hidePopover());
  output.popToggleDictionary=attempt(()=>{pop.togglePopover({force:true});return pop.matches(':popover-open')});pop.hidePopover();
  output.stage='dialog-popover';
  const dpop=create();dpop.popover='manual';dpop.show();output.dialogNonModalPopover=attempt(()=>dpop.showPopover());dpop.close();dpop.hidePopover();dpop.showModal();output.dialogModalPopover=attempt(()=>dpop.showPopover());dpop.close();
  output.stage='forms';
  output.forms=[];
  for(const mode of ['button-value','button-none','input-value','submit','request','prevent','invalid','formmethod']){
    const d=create('dialog','<form method=dialog><input name=q><button value=yes>go</button><input type=submit value=input></form>');d.returnValue='preset';d.showModal();const form=d.firstChild,button=form.querySelector('button'),log=[];
    for(const type of ['submit','formdata','close']) (type==='close'?d:form).addEventListener(type,event=>{log.push({type,trusted:event.isTrusted,cancelable:event.cancelable});if(mode==='prevent'&&type==='submit')event.preventDefault()});
    if(mode==='button-none')button.removeAttribute('value');if(mode==='invalid'){form.firstChild.required=true;form.firstChild.value='';}if(mode==='formmethod'){form.method='get';button.setAttribute('formmethod','dialog');}
    const result=attempt(()=>{if(mode==='submit')form.submit();else if(mode==='request')form.requestSubmit();else if(mode==='input-value')form.querySelector('[type=submit]').click();else button.click();return {open:d.open,value:d.returnValue,log:log.slice()}});await flush();output.forms.push({mode,result,async:log.slice()});d.close();d.remove();
  }
  output.stage='autostack';
  output.autoStack=attempt(()=>{const a=create('div'),b=create('div'),c=create('div');for(const p of[a,b,c])p.popover='auto';a.showPopover();b.showPopover();b.append(c);c.showPopover();const result=[a,b,c].map(p=>p.matches(':popover-open'));for(const p of[a,b,c])p.remove();return result});
  output.toggleArguments=[];for(const input of [undefined,null,false,true,0,1,{}, {force:false}, {force:true}]){pop.hidePopover();const result=attempt(()=>pop.togglePopover(input));output.toggleArguments.push({input:JSON.stringify(input)??'undefined',result,open:pop.matches(':popover-open')})}pop.hidePopover();
  output.popAttributeChange=attempt(()=>{pop.popover='auto';pop.showPopover();pop.popover='manual';return pop.matches(':popover-open')});pop.hidePopover();
  output.hintStack=attempt(()=>{const a=create('div'),b=create('div');a.popover='hint';b.popover='hint';a.showPopover();b.showPopover();const result=[a,b].map(p=>p.matches(':popover-open'));a.remove();b.remove();return result});
  output.modalPopoverInteraction=attempt(()=>{pop.popover='auto';pop.showPopover();const d=create();d.showModal();const result=pop.matches(':popover-open');d.close();d.remove();pop.hidePopover();return result});
  } catch(error) { output.probeError={name:error.name,message:error.message,stack:error.stack}; }
  return output;
})()`;

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const binary=process.argv[2] ?? '/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
  const reference=await startReference(binary);let client;
  try {
    client=await connect(reference.endpoint,{timeout:5000});const {targetId}=await client.send('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});await client.send('Page.navigate',{url:'data:text/html,<body></body>'},sessionId);
    const result=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
    if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
    const keyboard=[];
    for(const mode of ['modal','nonmodal','stack','cancelled-cancel','cancelled-key','synthetic','removed','removed-open','popover-auto','popover-manual']) {
      const setup=`(()=>{document.body.innerHTML='<dialog id=a></dialog><dialog id=b></dialog>';window.log=[];const a=document.getElementById('a'),b=document.getElementById('b');for(const d of[a,b])for(const type of['cancel','close'])d.addEventListener(type,e=>{log.push({id:d.id,type,trusted:e.isTrusted,cancelable:e.cancelable,bubbles:e.bubbles});if('${mode}'==='cancelled-cancel'&&type==='cancel')e.preventDefault()});document.onkeydown='${mode}'==='cancelled-key'?e=>e.preventDefault():null;if('${mode}'.startsWith('popover-')){const p=document.createElement('div');p.id='p';p.popover='${mode}'.slice(8);document.body.append(p);p.showPopover()}else if('${mode}'==='nonmodal')a.show();else a.showModal();if('${mode}'==='stack')b.showModal();if('${mode}'==='removed'){a.remove();document.body.append(a)}if('${mode}'==='removed-open')a.removeAttribute('open');if('${mode}'==='synthetic')document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return true})()`;
      await client.send('Runtime.evaluate',{expression:setup,returnByValue:true},sessionId);
      if(mode!=='synthetic')await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
      const observed=await client.send('Runtime.evaluate',{expression:"new Promise(r=>setTimeout(()=>r({a:document.getElementById('a').open,b:document.getElementById('b').open,log:window.log,popover:document.getElementById('p')?.matches(':popover-open')??null}),20))",returnByValue:true,awaitPromise:true},sessionId);
      keyboard.push({mode,result:observed.result.value,error:observed.exceptionDetails});
    }
    const report={scope:'Bounded public dialog/popover/form/focus observations; not full top-layer conformance',binary,binarySHA256:createHash('sha256').update(await readFile(binary)).digest('hex'),expression,result:result.result.value,keyboard};
    const json=JSON.stringify(report,null,2)+'\n';if(process.argv[3])await writeFile(process.argv[3],json,{flag:'wx'});console.log(json);
  }finally{await client?.close();await reference.close();}
}
