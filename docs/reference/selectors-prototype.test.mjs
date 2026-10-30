import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {installSelectors,selectorForSpecificity,getSelectorStateRevision} from './selectors-prototype.mjs';
import {installDialogs,isModal,isPopoverOpen,getDialogStateRevision} from './dialogs-prototype.mjs';
import './selectors-integration.mjs';
const {installStyles,getStyleRevision}=await import('../../src/styles.js');
function fixture(t,html,{styles=false,dialogs=false}={}){
 const page=Object.assign(new EventEmitter(),{closed:false,documentAbort:new AbortController()});let controller;
 const dom=new JSDOM('<!doctype html>'+html,{runScripts:'dangerously',beforeParse(w){if(dialogs)installDialogs(page,w);controller=installSelectors(page,w,{isModal,isPopoverOpen,getStateRevision:getDialogStateRevision});if(styles)installStyles(page,w);}});
 t.after(()=>{page.documentAbort.abort();dom.window.close();});return {w:dom.window,d:dom.window.document,page,controller};
}

test('attribute comparisons use real values, ASCII flags, HTML language and foreign namespaces',t=>{
 const{d}=fixture(t,'<form id="form" method="POST"></form><input id="input" type="Checkbox"><a id="a" href="" rel="NoFollow" hreflang="EN-us"></a><a id="b"></a><svg><g id="g" type="Matrix"></g></svg><p id="p" x="null"></p>');
 for(const op of ['^=','$=','*=','~='])assert.equal(d.querySelectorAll(`[href${op}""]`).length,0);
 assert.equal(d.querySelector('form[method=post]').id,'form');assert.equal(d.querySelector('form[method=post s]'),null);assert.equal(d.querySelector('form[method=post S]'),null);
 assert.equal(d.querySelector('input[type=checkbox]').id,'input');assert.equal(d.querySelector('#g[type=matrix]'),null);assert.equal(d.querySelector('#g[type=matrix i]').id,'g');
 assert.equal(d.querySelector('a[rel~=nofollow][hreflang|=en]').id,'a');assert.deepEqual([...d.querySelectorAll('[x=null]')].map(n=>n.id),['p']);
 assert.equal(d.querySelectorAll('a:not([href^=""])').length,2);assert.equal(d.querySelectorAll('[href^=""],a').length,2);
});

test('CSS strings/identifiers decode escapes and reject real invalid lexical values',t=>{
 const{d}=fixture(t,'<a id="a" href="tel:1" data-v="a:b"></a><p id="slash" data-v="abc\\def"></p><p id="quote" data-v=\'it"s ok\'></p><p id="one" x="1"></p><p id="nul" x="a&#xfffd;b"></p>');
 for(const selector of ['[data-v=a\\:b]','[href^=tel\\:]','[href=tel\\3a 1]','[data-v="a\\\n:b"]'])assert.equal(d.querySelector(selector).id,'a',selector);
 for(const selector of ['[data-v="abc\\\\def"]','[data-v="abc\\5c def"]'])assert.equal(d.querySelector(selector).id,'slash',selector);
 assert.equal(d.querySelector('[data-v="it\\"s ok"]').id,'quote');assert.equal(d.querySelector('[x=\\31]').id,'one');assert.equal(d.querySelector('[x=a\0b]').id,'nul');
 for(const selector of ['[x=1]','[x=-1]','[data-v=a:b]','[x=a\\\nb]','[x="a\nb"]',':has()',':not()',':lang()',':nth-child(foo)',':nth-child(-)',':nth-child(+)']){
  assert.throws(()=>d.querySelectorAll(selector),error=>error.name==='SyntaxError'&&error.code===12,selector);
  assert.throws(()=>d.body.matches(selector),error=>error.name==='SyntaxError',selector);
  assert.throws(()=>d.body.closest(selector),error=>error.name==='Error',selector);
 }
});

test('pseudo-element branches are syntactically validated and cannot become element matches',t=>{
 const{d}=fixture(t,'<div id="d" class="x"><span></span></div>');const node=d.getElementById('d');
 for(const selector of ['::before','::marker','::-webkit-unknown','::part(x)','::part(x)::before','::before::marker','::before:is(.a)','::selection:window-inactive','::column::scroll-marker:target-current']){
  assert.equal(node.matches(selector),false);assert.equal(node.closest(selector),null);assert.equal(d.querySelectorAll(selector).length,0);
 }
 assert.equal(node.matches('div::before,.x'),true);assert.equal(node.matches(':is(#d::before,.x)'),true);assert.equal(node.matches(':where(::after)'),false);
 for(const selector of ['::foo','::-moz-selection','::-webkit-autofill','::before()','::part()','::picker(x)','::before::after','::before.x','::before div','::before[a]','::before:hover','::marker::before',':not(::before)',':has(::before)','div:has(>p::before)','::placeholder:hover','::part(x):first-child','::part(x):not(.a)','::part(x)::part(y)','::before::marker:hover'])assert.throws(()=>node.matches(selector),error=>error.name==='SyntaxError',selector);
 assert.equal(selectorForSpecificity(':is(#d::before,.x)'),':is(.x)');
});

test('forgiving pseudo-element removal affects real cascade without changing public CSSOM selector text',t=>{
 const{w,d}=fixture(t,'<style>:is(#d::before,.x){display:none}.x{display:block}.hide,.x::before{display:none}*,::before,::after{--ring:3px}</style><div id="d" class="x"></div><p class="hide"></p>',{styles:true});
 assert.equal(w.getComputedStyle(d.getElementById('d')).display,'block');assert.equal(w.getComputedStyle(d.querySelector('.hide')).display,'none');assert.equal(w.getComputedStyle(d.getElementById('d')).getPropertyValue('--ring'),'3px');
 assert.equal(d.querySelector('style').sheet.cssRules[0].selectorText,':is(#d::before,.x)');
});

test('duplicate ID lookup follows actual tree order through attribute changes and moves',t=>{
 const{d}=fixture(t,'<main><section id="a"><i id="same">A</i></section><section id="b"><i id="same">B</i></section></main>');
 const root=d.querySelector('main'),a=d.getElementById('a'),b=d.getElementById('b'),first=a.firstElementChild;
 const ids=()=>Array.from(root.querySelectorAll('#same'),e=>e.textContent);
 assert.equal(d.getElementById('same'),first);first.id='other';first.id='same';assert.equal(d.getElementById('same'),first);assert.deepEqual(ids(),['A','B']);
 assert.equal(b.querySelector('#same').textContent,'B');root.append(a);assert.equal(d.getElementById('same').textContent,'B');assert.deepEqual(ids(),['B','A']);root.prepend(a);assert.equal(d.getElementById('same'),first);
 assert.equal(first.querySelector('#same'),null);assert.equal(b.querySelector('main #same').textContent,'B');assert.equal(b.querySelector('#a'),null);
});

test('scoped queries preserve actual ShadowRoot/fragment boundaries and static NodeLists',t=>{
 const{w,d}=fixture(t,'<div id="host"></div>');const shadow=d.getElementById('host').attachShadow({mode:'closed'});shadow.innerHTML='<b id="same">A</b><b id="same">B</b>';
 const list=shadow.querySelectorAll('#same');assert.equal(list instanceof w.NodeList,true);assert.deepEqual(Object.keys(list),['0','1']);assert.deepEqual([...list.values()].map(n=>n.textContent),['A','B']);assert.equal(d.querySelector('#same'),null);
 shadow.firstChild.remove();assert.equal(shadow.querySelector('#same').textContent,'B');assert.equal(list.length,2);assert.equal(list[0].textContent,'A');
 const moved=shadow.firstChild;d.body.append(moved);assert.equal(shadow.querySelectorAll('#same').length,0);assert.equal(d.getElementById('same'),moved);
 const fragment=d.createDocumentFragment();fragment.append(d.createElement('i'));assert.equal(fragment.querySelectorAll('i').length,1);assert.equal(fragment.querySelectorAll('#same').length,0);
});

test('modal/popover selectors use actual private dialog state and add no selector marker attributes',t=>{
 const{d}=fixture(t,'<dialog></dialog><div popover="auto"></div>',{dialogs:true});const dialog=d.querySelector('dialog'),popover=d.querySelector('[popover]');
 assert.equal(dialog.matches(':modal'),false);dialog.showModal();assert.equal(isModal(dialog),true);assert.equal(dialog.matches(':modal'),false);assert.deepEqual(dialog.getAttributeNames(),['open']);
 dialog.close();assert.equal(dialog.matches(':modal'),false);popover.showPopover();assert.equal(isPopoverOpen(popover),true);assert.equal(popover.matches(':popover-open'),true);assert.deepEqual(popover.getAttributeNames(),['popover']);popover.hidePopover();assert.equal(popover.matches(':popover-open'),false);
});

test('WebIDL conversion is once, validates arguments/receivers, and disposal restores unregistered behavior',t=>{
 const{w,d,page,controller}=fixture(t,'<p class="x"></p>');let calls=0;assert.equal(d.querySelector({toString(){calls++;return'.x';}}),d.querySelector('p'));assert.equal(calls,1);
 assert.throws(()=>d.querySelector(),error=>error.name==='TypeError');assert.throws(()=>d.querySelector(Symbol('x')),error=>error.name==='TypeError');assert.throws(()=>w.Document.prototype.querySelector.call({},'.x'),error=>error.name==='TypeError');
 const ordinary=new JSDOM('<form method="POST"></form>');try{assert.throws(()=>ordinary.window.document.querySelector('[method=post s]'));}finally{ordinary.window.close();}
 controller.dispose();const next=installSelectors(page,w);controller.dispose();assert.equal(d.querySelector('[method=post s]'),null);next.dispose();
 page.documentAbort.abort();assert.throws(()=>d.querySelector('[method=post s]'));assert.throws(()=>installSelectors(page,w),error=>error.name==='InvalidStateError');
});


test('same-Document root replacement refreshes :root/:scope matching and tree-order IDs',t=>{
 const{d}=fixture(t,'<p id="old"></p>');assert.equal(d.querySelector(':root'),d.documentElement);
 const root=d.createElement('html'),body=d.createElement('body'),child=d.createElement('p');child.id='new';body.append(child);root.append(body);d.replaceChild(root,d.documentElement);
 assert.equal(d.querySelector(':root'),root);assert.equal(d.querySelector(':scope > body'),body);assert.equal(d.getElementById('old'),null);assert.equal(d.getElementById('new'),child);
});


test('namespace-qualified attribute selectors preserve the existing engine path',t=>{
 const html='<svg xmlns:xlink="http://www.w3.org/1999/xlink"><a id="link" xlink:href="urn:example"/></svg>';const ordinary=new JSDOM('<!doctype html>'+html);t.after(()=>ordinary.window.close());
 const {d}=fixture(t,html);const before=[...ordinary.window.document.querySelectorAll('[*|href]')].map(n=>n.id);assert.deepEqual(before,['link']);assert.deepEqual([...d.querySelectorAll('[*|href]')].map(n=>n.id),before);assert.equal(d.querySelector('[*|href]').matches('[*|href]'),true);
});


test('private popover transitions invalidate retained styles, ancestors and layout revisions without marker attributes',t=>{
 const{w,d}=fixture(t,'<style>section{color:blue}section:has(:popover-open){color:red}[popover]{display:block;width:10px}[popover]:popover-open{width:20px}</style><section><div popover="manual"></div></section><div id="host"></div>',{styles:true,dialogs:true});
 const parent=d.querySelector('section'),popover=d.querySelector('[popover]');
 const parentStyle=w.getComputedStyle(parent),popoverStyle=w.getComputedStyle(popover);
 assert.equal(parentStyle.color,'rgb(0, 0, 255)');assert.equal(popoverStyle.width,'10px');
 const before=getStyleRevision(w),privateBefore=getSelectorStateRevision(w);
 popover.showPopover();assert.equal(parentStyle.color,'rgb(255, 0, 0)');assert.equal(popoverStyle.width,'20px');
 assert.ok(getStyleRevision(w)>before);assert.ok(getSelectorStateRevision(w)>privateBefore);assert.deepEqual(popover.getAttributeNames(),['popover']);
 const opened=getSelectorStateRevision(w);popover.showPopover();assert.equal(getSelectorStateRevision(w),opened);
 popover.hidePopover();assert.equal(parentStyle.color,'rgb(0, 0, 255)');assert.equal(popoverStyle.width,'10px');
 const shadow=d.getElementById('host').attachShadow({mode:'closed'});shadow.innerHTML='<div popover="manual"></div>';
 const closedPopover=shadow.firstChild,closedBefore=getStyleRevision(w);
 closedPopover.showPopover();assert.ok(getStyleRevision(w)>closedBefore);assert.equal(closedPopover.matches(':popover-open'),true);
});
