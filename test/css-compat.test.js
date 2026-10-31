import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {JSDOM} from 'jsdom';
const load=name=>import('../src/'+name+'.js');
const [{installStyles,getStyleRevision},{installSelectors},{installDialogs,isPopoverOpen,getDialogStateRevision},{installGeometry},{installMedia},{installLayout},{installCheckVisibility}]=await Promise.all(['styles','selectors','dialogs','geometry','media','layout','check-visibility'].map(load));
function fixture(t,html='<body></body>'){
 const page=Object.assign(new EventEmitter(),{documentAbort:new AbortController()});
 const dom=new JSDOM('<!doctype html>'+html,{url:'https://example.test/one',runScripts:'dangerously',beforeParse(w){installSelectors(page,w,{isPopoverOpen,getStateRevision:getDialogStateRevision});installStyles(page,w);installDialogs(page,w);installGeometry(w);installMedia(page,w);installLayout(page,w);installCheckVisibility(page,w);}});
 t.after(()=>{page.documentAbort.abort();dom.window.close()});return{page,w:dom.window,d:dom.window.document};
}
test('native computed matrix arithmetic and font bases use actual declarations, not public constructor hooks',t=>{
 const {w,d}=fixture(t,'<body><section style="font-size:20px"><div style="transform:translateX(10px) scale(2);font-size:1.5em"></div></section>');const e=d.querySelector('div'),c=w.getComputedStyle(e);w.DOMMatrix=class{constructor(){throw Error('authored constructor')}};
 assert.equal(c.transform,'matrix(2, 0, 0, 2, 10, 0)');assert.equal(c.fontSize,'30px');e.style.transform='rotate(45deg)';assert.equal(c.transform,'matrix(0.707107, 0.707107, -0.707107, 0.707107, 0, 0)');e.style.transform='translateX(50%)';assert.equal(c.transform,'matrix(1, 0, 0, 1, 50, 0)');e.style.fontSize='2rem';assert.equal(c.fontSize,'32px');d.documentElement.style.fontSize='20px';assert.equal(c.fontSize,'40px');
});
test('declared variable token streams, inherited aliases and cycles remain raw native values',t=>{
 const {w,d}=fixture(t,'<body><div style="--base:4px;--alias:var(--base);--cycle:var(--cycle, 7px)"><span style="--base:9px;width:var(--alias)"></span></div>');const c=w.getComputedStyle(d.querySelector('span'));assert.equal(c.getPropertyValue('--alias'),'var(--base)');assert.equal(c.getPropertyValue('--base'),'9px');assert.equal(c.getPropertyValue('--cycle'),'var(--cycle, 7px)');assert.equal(c.width,'var(--alias)');
});
test('axis declarations expand real indexed longhands, preserve importance and commit one mutation',t=>{
 const {w,d}=fixture(t),e=d.createElement('div'),s=e.style,observer=new w.MutationObserver(()=>{});observer.observe(e,{attributes:true,attributeOldValue:true});s.setProperty('OVERFLOW','hidden scroll','important');assert.equal(observer.takeRecords().length,1);assert.equal(s.length,2);assert.deepEqual([...s],['overflow-x','overflow-y']);assert.equal(s.cssText,'overflow: hidden scroll !important;');s.overflowY='auto';assert.equal(observer.takeRecords().length,1);assert.equal(s.overflow,'');assert.equal(s.cssText,'overflow-x: hidden !important; overflow-y: auto;');s.removeProperty('Overflow');assert.equal(s.length,0);s.overscrollBehavior='contain auto';s.overscrollBehaviorY='contain';assert.equal(s.cssText,'overscroll-behavior: contain;');s.setProperty('background-color','blue','important');assert.equal(s.getPropertyValue('BACKGROUND-COLOR'),'blue');assert.equal(s.getPropertyPriority('Background-Color'),'important');observer.disconnect();
});
test('float null removal and independent prefixed border radius retain actual style state',t=>{
 const{d}=fixture(t),s=d.createElement('div').style;s.cssFloat='right';s.cssFloat=undefined;assert.equal(s.cssFloat,'undefined');s.cssFloat=null;assert.equal(s.cssText,'');s.webkitBorderRadius='5px';assert.equal(s.borderRadius,'');assert.equal(s.getPropertyValue('-webkit-border-radius'),'5px');assert.equal(s.cssText,'-webkit-border-radius: 5px;');
});
test('computed style and canonical pseudo views retain identity and remain live readonly views',t=>{
 const{w,d}=fixture(t,'<body><div></div>');const e=d.querySelector('div'),c=w.getComputedStyle(e),p=w.getComputedStyle(e,':before');assert.equal(c,w.getComputedStyle(e));assert.equal(p,w.getComputedStyle(e,'::BEFORE'));assert.notEqual(c,p);assert.equal(c,w.getComputedStyle(e,'before'));assert.throws(()=>c.setProperty('width','3px'),{name:'NoModificationAllowedError'});e.style.width='23px';assert.equal(c.width,'23px');assert.equal(c.borderTopWidth,'0px');assert.equal(c.borderStyle,'none');assert.equal(c.flexBasis,'auto');
});
test('stylesheet root scope, nesting and owning sheet mutations affect genuine elements',t=>{
 const{w,d}=fixture(t,'<head><style>:scope:not(html){visibility:hidden}.box{visibility:hidden;&.ready{visibility:visible}>span{display:none}@media screen{&.hidden{display:none}}}</style></head><body><div class="box ready"><span></span></div>');const e=d.querySelector('div'),sheet=d.styleSheets[0];assert.equal(w.getComputedStyle(d.body).visibility,'visible');assert.equal(w.getComputedStyle(e).visibility,'visible');assert.equal(e.firstChild.checkVisibility(),false);assert.equal(sheet.cssRules[1].cssRules.length,3);assert.equal(sheet.cssRules[1].cssRules[2].type,4);assert.equal(Object.getPrototypeOf(sheet),w.CSSStyleSheet.prototype);const identity=sheet.cssRules;sheet.replaceSync('.box{&.ready{display:none}}');assert.equal(sheet.cssRules,identity);assert.equal(e.checkVisibility(),false);
});
test('cascade layers preserve declaration order, nested ranks, importance and measured grouping cap',t=>{
 const{w,d}=fixture(t,'<head><style>@layer a,b;@layer b{.x{display:block}}@layer a{#x{display:none}}@layer a{#x{visibility:hidden!important}}.x{visibility:visible!important}</style></head><body><div id="x" class="x"></div>');const e=d.querySelector('div'),c=w.getComputedStyle(e);assert.equal(c.display,'block');assert.equal(c.visibility,'hidden');const sheet=d.styleSheets[0];for(const depth of[32,33]){sheet.replaceSync('@layer a{'.repeat(depth)+'.x{display:none}'+'}'.repeat(depth));assert.equal(c.display,depth===32?'none':'block');}
});
test('form, character, custom element, target and private popover changes invalidate retained styles',t=>{
 const{w,d}=fixture(t,'<head><style>input:indeterminate+span,.badge:empty,x-unit:not(:defined),#anchor:target+span{display:none}</style></head><body><input type="checkbox"><span></span><b class="badge">x</b><x-unit></x-unit><div id="anchor"></div><span id="target"></span><div popover></div>');const input=d.querySelector('input'),panel=input.nextElementSibling,c=w.getComputedStyle(panel);assert.equal(c.display,'inline');input.indeterminate=true;assert.equal(c.display,'none');input.indeterminate=false;assert.equal(c.display,'inline');const b=d.querySelector('b');b.firstChild.data='';assert.equal(b.matches(':empty'),true);assert.equal(b.checkVisibility(),false);b.firstChild.appendData('x');assert.equal(b.checkVisibility(),true);const unit=d.querySelector('x-unit');assert.equal(unit.checkVisibility(),false);w.customElements.define('x-unit',class extends w.HTMLElement{});assert.equal(unit.checkVisibility(),true);w.location.hash='anchor';assert.equal(d.getElementById('target').checkVisibility(),false);const pop=d.querySelector('[popover]');const revision=getStyleRevision(w);assert.equal(pop.checkVisibility(),false);pop.showPopover();assert.equal(pop.checkVisibility(),true);assert.ok(getStyleRevision(w)>revision);pop.hidePopover();assert.equal(pop.checkVisibility(),false);
});
test('flat tree geometry follows actual private slot assignment and fallback state',t=>{
 const{d}=fixture(t),h=d.createElement('div'),a=d.createElement('span');h.append(a);d.body.append(h);assert.ok(a.offsetWidth>0);const r=h.attachShadow({mode:'closed'});assert.equal(a.offsetWidth,0);const slot=d.createElement('slot'),fallback=d.createElement('i');slot.append(fallback);r.append(slot);assert.ok(a.offsetWidth>0);assert.equal(fallback.offsetWidth,0);a.remove();assert.ok(fallback.offsetWidth>0);
});
test('media lists are branded targets with genuine viewport changes, event order and cleanup',async t=>{
 const{page,w}=fixture(t),m=w.matchMedia('(max-width:1000px)'),events=[];assert.equal(m instanceof w.EventTarget,true);assert.equal(Object.prototype.toString.call(m),'[object MediaQueryList]');assert.throws(()=>new w.MediaQueryList(),{name:'TypeError'});assert.equal(m.matches,false);m.addListener(e=>events.push([e.matches,e.media,e.isTrusted]));page.layout.setViewport({width:800,height:600});assert.equal(m.matches,true);assert.equal(w.screen.width,800);await new Promise(r=>w.setTimeout(r,10));assert.deepEqual(events,[[true,'(max-width:1000px)',true]]);assert.equal(w.matchMedia('not unknown').matches,false);assert.equal(w.matchMedia('not (unknown:x)').matches,true);assert.equal(w.matchMedia('(width:50em)').matches,true);page.layout.setViewport({width:900});assert.equal(events.length,1);page.documentAbort.abort();page.layout.setViewport({width:1200});await new Promise(r=>setTimeout(r,10));assert.equal(events.length,1);
});

test('media change callbacks observe published layout and screen state in Native listener order',async t=>{
 const{page,w}=fixture(t),query=w.matchMedia('(max-width:1000px)'),rows=[];
 const capture=kind=>event=>rows.push([kind,event.matches,event.isTrusted,event.target===query,event.currentTarget===query,w.innerWidth,w.screen.width,w.visualViewport.width,page.layout.viewport.width,query.matches]);
 query.addEventListener('change',capture('event-listener'));query.addListener(capture('legacy-listener'));query.onchange=capture('handler');
 page.layout.setViewport({width:800,height:600});assert.equal(query.matches,true);await new Promise(resolve=>w.setTimeout(resolve,35));
 assert.deepEqual(rows,['event-listener','legacy-listener','handler'].map(kind=>[kind,true,true,true,true,800,800,800,800,true]));
 rows.length=0;page.layout.setViewport({width:900});await new Promise(resolve=>w.setTimeout(resolve,35));assert.deepEqual(rows,[]);
 page.layout.setViewport({width:1200});assert.equal(query.matches,false);await new Promise(resolve=>w.setTimeout(resolve,35));
 assert.deepEqual(rows,['event-listener','legacy-listener','handler'].map(kind=>[kind,false,true,true,true,1200,1200,1200,1200,false]));
});
