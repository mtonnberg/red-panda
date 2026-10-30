// Explicit opt-in tests for a proposed integration. npm's production suite does
// not load this source hook or silently gain the proposed implementation.
import './dialogs-integration.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { isModal, isPopoverOpen, installDialogs, getDialogStateRevision } from './dialogs-prototype.mjs';
const { Browser } = await import('../../src/browser.js');
const { runInput } = await import('../../src/input.js');
const { startFixtureServer } = await import('../../scripts/upstream-fixture-server.mjs');

async function fixture(t, html='<body></body>') {
  const browser=new Browser();t.after(()=>browser.close());const page=browser.createPage();
  await page.navigate(`data:text/html,${encodeURIComponent(html)}`);
  const window=page.dom.window,document=window.document;
  return {browser,page,window,document,make(tag='dialog',markup='') { const element=document.createElement(tag);element.innerHTML=markup;document.body.append(element);return element; }};
}
const escape = page => runInput({page},'Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});

test('dialog mode is private and close queues one trusted event while preserving existing focus',async t=>{
  const {make,window,document}=await fixture(t),button=make('button'),dialog=make('dialog','<input autofocus>');button.focus();
  const events=[];for(const type of ['close','beforetoggle','toggle'])dialog.addEventListener(type,event=>events.push({type,trusted:event.isTrusted,bubbles:event.bubbles,cancelable:event.cancelable}));
  assert.equal(dialog.returnValue,'');dialog.returnValue='preset';dialog.showModal();
  assert.equal(isModal(dialog),true);assert.equal(dialog.open,true);assert.equal(document.activeElement,button);
  assert.deepEqual([...dialog.attributes].map(attribute=>attribute.name),['open']);assert.equal(Object.hasOwn(dialog,'returnValue'),false);
  dialog.show();dialog.showModal();assert.deepEqual(events,[]);
  dialog.close('confirmed');assert.equal(isModal(dialog),false);assert.equal(dialog.open,false);assert.equal(dialog.returnValue,'confirmed');assert.deepEqual(events,[]);
  dialog.close('ignored');await delay(15);assert.equal(dialog.returnValue,'confirmed');
  assert.deepEqual(events,[{type:'close',trusted:true,bubbles:false,cancelable:false}]);assert.equal(document.activeElement,button);
  assert.throws(()=>window.HTMLDialogElement.prototype.show.call({}),window.TypeError);
  assert.equal(dialog.cloneNode().returnValue,'');assert.equal('requestClose' in dialog,false);assert.equal('closedBy' in dialog,false);
});

test('modal validity distinguishes disconnected, nonmodal, removed and popover-open dialogs',async t=>{
  const {make,document}=await fixture(t),detached=document.createElement('dialog');
  assert.throws(()=>detached.showModal(),error=>error.name==='InvalidStateError');detached.show();assert.equal(detached.open,true);
  const dialog=make();dialog.show();assert.throws(()=>dialog.showModal(),error=>error.name==='InvalidStateError');dialog.close();
  dialog.popover='manual';dialog.showPopover();assert.throws(()=>dialog.showModal(),error=>error.name==='InvalidStateError');dialog.hidePopover();dialog.showModal();
  dialog.remove();assert.equal(isModal(dialog),false);assert.equal(dialog.open,true);document.body.append(dialog);
  assert.throws(()=>dialog.showModal(),error=>error.name==='InvalidStateError');dialog.close();dialog.showModal();dialog.removeAttribute('open');assert.equal(isModal(dialog),false);
  dialog.show();dialog.close(null);assert.equal(dialog.returnValue,'');dialog.returnValue='preset';dialog.show();dialog.close(undefined);assert.equal(dialog.returnValue,'preset');
});

test('only uncancelled privileged Escape requests the top modal close',async t=>{
  const {make,page,window,document}=await fixture(t),a=make(),b=make(),log=[];a.showModal();b.showModal();
  for(const dialog of [a,b])for(const type of ['cancel','close'])dialog.addEventListener(type,event=>log.push({dialog:dialog===a?'a':'b',type,trusted:event.isTrusted,cancelable:event.cancelable}));
  document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(b.open,true);
  b.addEventListener('cancel',event=>event.preventDefault(),{once:true});escape(page);assert.equal(b.open,true);assert.equal(log.length,1);
  document.addEventListener('keydown',event=>event.preventDefault(),{once:true});escape(page);assert.equal(log.length,1);
  escape(page);assert.equal(a.open,true);assert.equal(b.open,false);await delay(15);
  assert.deepEqual(log,[{dialog:'b',type:'cancel',trusted:false,cancelable:true},{dialog:'b',type:'cancel',trusted:false,cancelable:true},{dialog:'b',type:'close',trusted:true,cancelable:false}]);
  escape(page);assert.equal(a.open,false);await delay(15);assert.equal(log.at(-1).dialog,'a');
});

test('popover reflection, actual toggle events and boolean forcing match the observed native profile',async t=>{
  const {make,window}=await fixture(t),pop=make('div');
  assert.equal(pop.popover,null);for(const [value,expected]of [['','auto'],['AUTO','auto'],['hint','hint'],['bogus','manual']]){pop.setAttribute('popover',value);assert.equal(pop.popover,expected)}
  pop.popover='manual';const events=[];for(const type of ['beforetoggle','toggle'])pop.addEventListener(type,event=>events.push({type,old:event.oldState,next:event.newState,cancelable:event.cancelable,trusted:event.isTrusted,brand:event instanceof window.ToggleEvent,open:isPopoverOpen(pop)}));
  pop.showPopover();assert.deepEqual(events,[{type:'beforetoggle',old:'closed',next:'open',cancelable:true,trusted:true,brand:true,open:false},{type:'toggle',old:'closed',next:'open',cancelable:false,trusted:true,brand:true,open:true}]);
  pop.showPopover();assert.equal(events.length,2);assert.equal(pop.togglePopover(),false);assert.equal(events.at(-2).cancelable,false);
  assert.equal(pop.togglePopover({force:false}),true);assert.equal(pop.togglePopover(false),false);pop.popover=null;
  assert.throws(()=>pop.showPopover(),error=>error.name==='NotSupportedError');assert.throws(()=>pop.hidePopover(),error=>error.name==='NotSupportedError');
  assert.throws(()=>window.HTMLElement.prototype.showPopover.call({}),window.TypeError);
});

test('popover cancellation, attribute invalidation and detachment never leave visible marker attributes or stale state',async t=>{
  const {make,document}=await fixture(t),pop=make('div');pop.popover='auto';const opening=event=>{if(event.newState==='open')event.preventDefault()};
  pop.addEventListener('beforetoggle',opening);pop.showPopover();assert.equal(isPopoverOpen(pop),false);pop.removeEventListener('beforetoggle',opening);
  pop.showPopover();assert.equal(isPopoverOpen(pop),true);assert.equal(pop.outerHTML,'<div popover="auto"></div>');pop.popover='manual';assert.equal(isPopoverOpen(pop),false);
  pop.showPopover();pop.remove();assert.equal(isPopoverOpen(pop),false);document.body.append(pop);assert.equal(isPopoverOpen(pop),false);
  pop.showPopover();pop.removeAttribute('popover');assert.equal(isPopoverOpen(pop),false);
  pop.popover='manual';pop.addEventListener('beforetoggle',()=>pop.removeAttribute('popover'),{once:true});pop.showPopover();assert.equal(isPopoverOpen(pop),false);
  const detached=document.createElement('div');detached.popover='manual';detached.hidePopover();assert.throws(()=>detached.showPopover(),error=>error.name==='InvalidStateError');
});

test('auto and hint sibling chains close while nested chains and independent manual popovers remain open',async t=>{
  const {make,page,window}=await fixture(t),a=make('div'),b=make('div'),c=make('div'),manual=make('div');for(const pop of[a,b,c])pop.popover='auto';manual.popover='manual';
  a.showPopover();manual.showPopover();b.showPopover();b.append(c);c.showPopover();
  assert.deepEqual([a,b,c,manual].map(isPopoverOpen),[false,true,true,true]);escape(page);assert.deepEqual([b,c,manual].map(isPopoverOpen),[true,true,true]);
  assert.deepEqual(installDialogs(page,window).topLayer,[manual,b,c]);
  const x=make('div'),y=make('div');x.popover='hint';y.popover='hint';x.showPopover();y.showPopover();assert.deepEqual([x,y].map(isPopoverOpen),[false,true]);
});

test('dialog form submission preserves validation, trusted submit/formdata order, return values and bypass semantics',async t=>{
  const {make,page}=await fixture(t),navigation=[];page.on('request',event=>navigation.push(event));
  for(const mode of ['value','missing','submit','request','prevent','invalid','override']){
    const dialog=make('dialog','<form method=dialog><input name=q><button value=yes>go</button></form>'),form=dialog.firstChild,button=form.querySelector('button'),events=[];
    dialog.returnValue='preset';dialog.showModal();for(const type of ['submit','formdata','close'])(type==='close'?dialog:form).addEventListener(type,event=>{events.push([type,event.isTrusted]);if(mode==='prevent'&&type==='submit')event.preventDefault()});
    if(mode==='missing')button.removeAttribute('value');if(mode==='invalid')form.firstChild.required=true;if(mode==='override'){form.method='get';button.formMethod='dialog'}
    if(mode==='submit')form.submit();else if(mode==='request')form.requestSubmit();else button.click();
    if(['prevent','invalid'].includes(mode)){assert.equal(dialog.open,true);assert.deepEqual(events,mode==='prevent'?[['submit',true]]:[])}
    else{assert.equal(dialog.open,false);assert.equal(dialog.returnValue,['value','override'].includes(mode)?'yes':'preset');assert.deepEqual(events,mode==='submit'?[['formdata',true]]:[['submit',true],['formdata',true]]);await delay(5);assert.equal(events.at(-1)[0],'close')}
    dialog.close();dialog.remove();
  }
  assert.equal(navigation.length,0);
});

test('dialog form submission uses nearest ancestor, external submitters, orphan forms and post-formdata method changes',async t=>{
  const {make,document}=await fixture(t),outer=make(),inner=document.createElement('dialog');inner.innerHTML='<form id=owned method=dialog><button value=inner>go</button></form>';outer.append(inner);outer.show();inner.show();inner.querySelector('button').click();assert.equal(outer.open,true);assert.equal(inner.open,false);
  inner.show();const external=make('button');external.setAttribute('form','owned');external.value='external';external.click();assert.equal(inner.returnValue,'external');assert.equal(inner.open,false);
  const orphan=make('form','<button>go</button>');orphan.method='dialog';let submits=0;orphan.onsubmit=()=>submits++;orphan.firstChild.click();assert.equal(submits,1);
  inner.show();const form=inner.firstChild;form.method='get';form.addEventListener('formdata',()=>{form.method='dialog'},{once:true});form.requestSubmit();assert.equal(inner.open,false);
});

test('queued close events are suppressed after document replacement and independent realms retain private owners',async t=>{
  const {page,make,window}=await fixture(t),dialog=make(),events=[];dialog.addEventListener('close',()=>events.push('old'));dialog.show();dialog.close();
  await page.navigate('data:text/html,<body>replacement</body>');await delay(15);assert.deepEqual(events,[]);
  const current=page.dom.window,other=current.document.createElement('dialog');current.document.body.append(other);
  window.HTMLDialogElement.prototype.showModal.call(other);assert.equal(isModal(other),true);assert.equal(installDialogs(page,current).isModal(other),true);
});

test('private state revision tracks actual modal and closed-shadow popover transitions without recording no-ops',async t=>{
  const {make,page,window,document}=await fixture(t),controller=installDialogs(page,window),dialog=make(),host=make('div');
  const shadow=host.attachShadow({mode:'closed'}),pop=document.createElement('div');pop.popover='manual';shadow.append(pop);
  assert.equal(getDialogStateRevision(window),0);assert.equal(controller.revision,0);
  dialog.showModal();const modal=controller.revision;assert.ok(modal>0);dialog.showModal();dialog.show();assert.equal(controller.revision,modal);
  pop.showPopover();const opened=controller.revision;assert.ok(opened>modal);pop.showPopover();assert.equal(controller.revision,opened);
  pop.hidePopover();const hidden=controller.revision;assert.ok(hidden>opened);pop.hidePopover();assert.equal(controller.revision,hidden);
  pop.addEventListener('beforetoggle',event=>event.preventDefault(),{once:true});pop.showPopover();assert.equal(controller.revision,hidden);
  pop.showPopover();const reopened=controller.revision;host.remove();assert.ok(controller.revision>reopened);assert.equal(isPopoverOpen(pop),false);
  const beforeClose=controller.revision;dialog.close();assert.ok(controller.revision>beforeClose);assert.equal(getDialogStateRevision(window),controller.revision);
  const closed=controller.revision;dialog.close();assert.equal(controller.revision,closed);
});

test('unchanged upstream dialog fixture records real observations in the native harness branch',async t=>{
  const root='/tmp/red-panda-upstream-reference/browser-948d77378/src/browser/tests',server=await startFixtureServer(root,{port:0,profile:'static'});t.after(()=>server.close());
  const browser=new Browser({userAgent:'Lightpanda/1.0'});t.after(()=>browser.close());const page=browser.createPage();
  page.newDocumentScripts.set('external',{source:'globalThis.__lp_external_runner=true;'});
  const path='element/html/dialog.html',source=await readFile(`${root}/${path}`);const diagnostics=[];page.on('console',event=>{if(event.type==='error')diagnostics.push(event.args.map(String).join(' '))});
  await page.navigate(`${server.origin}/src/browser/tests/${path}`);await delay(30);
  assert.equal(page.evaluate('testing.IS_TEST_RUNNER'),true);assert.equal(page.evaluate('__lp_external_runner'),true);
  assert.equal(page.evaluate('testing.assertOk()'),true,JSON.stringify(diagnostics));assert.deepEqual(diagnostics,[]);
  assert.equal(createHash('sha256').update(source).digest('hex'),'742a2104c10a6507d733ffde43dc1555635be60d7918e787c3a716f114c0edf0');
});
