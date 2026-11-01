import{test}from'node:test';
import assert from'node:assert/strict';
import{createRequire}from'node:module';
import{JSDOM}from'jsdom';
import{Browser}from'../src/browser.js';
import{createLayout}from'../src/layout.js';
import{platformFactoryRecord}from'../src/platform-factories.js';
import{composedLayoutChildren,composedLayoutContains}from'../src/composed-layout-tree.js';
const require=createRequire(import.meta.url),{domSymbolTree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const{implForWrapper,wrapperForImpl}=require('jsdom/lib/jsdom/living/generated/utils.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){const end=Date.now()+2000;while(!check()){if(Date.now()>=end)throw Error('Actual frame readiness deadline');await tick();}}
async function owned(t,html='<body>',options={}){const browser=new Browser(options),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,'+encodeURIComponent(html));return{browser,page,w:page.dom.window,d:page.dom.window.document};}
// The expected set is exactly the ORIGINAL snapshot traversal, not another
// inverse/membership implementation or a table of expected slot answers.
function assertMembership(document,extras=[]){
 const root=implForWrapper(document),expected=new Set(),pending=[root];
 while(pending.length){const node=pending.pop();if(expected.has(node))continue;expected.add(node);pending.push(...composedLayoutChildren(node));}
 const physical=new Set(),walk=[root,...extras.map(value=>implForWrapper(value))];
 while(walk.length){const node=walk.pop();if(!node||physical.has(node))continue;physical.add(node);walk.push(...domSymbolTree.childrenToArray(node));if(node._shadowRoot)walk.push(node._shadowRoot);}
 for(const node of new Set([...expected,...physical]))assert.equal(composedLayoutContains(root,node),expected.has(node),'Actual node '+node.nodeName+' matches original composed traversal');
 return expected;
}
function metrics(e){const rect=e.getBoundingClientRect();return{client:[e.clientWidth,e.clientHeight],offset:[e.offsetWidth,e.offsetHeight],scroll:[e.scrollWidth,e.scrollHeight],rect:[rect.x,rect.y,rect.width,rect.height]};}
function widthThenFull(w,e){const width=e.clientWidth,computed=w.getComputedStyle(e).width,full=metrics(e);assert.equal(width,full.client[0]);return{computed,full};}
function fullThenWidth(w,e){const full=metrics(e),computed=w.getComputedStyle(e).width;assert.equal(e.clientWidth,full.client[0]);return{computed,full};}

test('private membership equals original traversal through named slots closed roots fallback and real changes',{timeout:15000},async t=>{
 const{d}=await owned(t,'<body><div id=host><span id=a slot=chosen>A</span><span id=b>B</span><!--light--></div>'),host=d.getElementById('host'),a=d.getElementById('a'),b=d.getElementById('b');
 const root=host.attachShadow({mode:'closed'}),slot=d.createElement('slot'),fallback=d.createElement('span');slot.name='chosen';fallback.textContent='fallback';slot.append(fallback);root.append(slot);
 const inner=d.createElement('div');root.append(inner);const innerRoot=inner.attachShadow({mode:'closed'}),innerSlot=d.createElement('slot');innerRoot.append(innerSlot);inner.append(d.createElement('i'));
 const extras=[root,innerRoot,a,b,fallback];assertMembership(d,extras);
 a.slot='other';assertMembership(d,extras);slot.name='other';assertMembership(d,extras);
 a.remove();assertMembership(d,extras);host.append(a);assertMembership(d,extras);
 slot.remove();assertMembership(d,extras);root.append(slot);assertMembership(d,extras);
 b.append(d.createTextNode('live'));assertMembership(d,extras);assert.equal(a.clientWidth,a.getBoundingClientRect().width);
});

test('manual assignments retain actual membership after reassignment text removal fallback and slot reordering',{timeout:15000},async t=>{
 const{d}=await owned(t),host=d.createElement('div');d.body.append(host);const root=host.attachShadow({mode:'closed',slotAssignment:'manual'}),one=d.createElement('slot'),two=d.createElement('slot');root.append(one,two);
 const a=d.createElement('span'),text=d.createTextNode('assigned'),fallback=d.createElement('b');a.style.width='60px';one.append(fallback);host.append(a,text);const extras=[root,a,text,fallback];
 assertMembership(d,extras);one.assign(a,text);assertMembership(d,extras);assert.equal(a.clientWidth,60);
 two.assign(text,a);assertMembership(d,extras);one.assign();assertMembership(d,extras);
 two.style.display='none';assert.equal(a.clientWidth,0);two.style.display='';assert.equal(a.clientWidth,60);
 a.remove();assertMembership(d,extras);host.append(a);one.assign(a);assertMembership(d,extras);
 root.insertBefore(two,one);assertMembership(d,extras);two.remove();assertMembership(d,extras);
});

test('adopted mixed trees keep backend front identity and current document membership',{timeout:15000},async t=>{
 const a=await owned(t),other=a.browser.createPage();await other.navigate('data:text/html,<body>');const d=other.dom.window.document,host=a.d.createElement('div'),child=a.d.createElement('span');host.style.width='100px';child.style.cssText='width:50%;height:12px';host.append(child);a.d.body.append(host);
 const root=host.attachShadow({mode:'closed',slotAssignment:'manual'}),slot=a.d.createElement('slot');root.append(slot);slot.assign(child);const backend=platformFactoryRecord(child).implementation,prototype=Object.getPrototypeOf(child),held=child.getBoundingClientRect();
 assertMembership(a.d,[host,child,root]);assertMembership(d,[host,child,root]);assert.equal(child.clientWidth,50);
 assert.equal(d.adoptNode(host),host);assertMembership(a.d,[host,child,root]);assertMembership(d,[host,child,root]);assert.equal(child.clientWidth,0);
 d.body.append(host);assertMembership(a.d,[host,child,root]);assertMembership(d,[host,child,root]);assert.equal(child.clientWidth,50);assert.equal(child.clientHeight,12);
 assert.equal(platformFactoryRecord(child).implementation,backend);assert.equal(Object.getPrototypeOf(child),prototype);assert.equal(held.width,50);
 host.style.width='180px';assert.equal(child.clientWidth,90);assert.equal(child.getBoundingClientRect().width,90);
});

test('retained real frame documents and new frame documents have separate membership and live full reads',{timeout:15000},async t=>{
 const attribute=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;');const f=await owned(t,'<body><iframe id=f srcdoc="'+attribute('<div id=box style="width:70px;height:12px">old</div>')+'"></iframe>',{loadResources:['iframe']}),element=f.d.getElementById('f');
 await until(()=>element.contentDocument?.readyState==='complete'&&element.contentDocument.getElementById('box'));
 const oldDocument=element.contentDocument,oldWindow=element.contentWindow,old=oldDocument.getElementById('box'),backend=platformFactoryRecord(old).implementation,held=old.getBoundingClientRect();
 assertMembership(f.d,[old]);assertMembership(oldDocument,[element]);assert.deepEqual(widthThenFull(oldWindow,old),fullThenWidth(oldWindow,old));
 element.srcdoc='<div id=new style="width:90px;height:17px">new</div>';await until(()=>element.contentDocument!==oldDocument&&element.contentDocument?.readyState==='complete'&&element.contentDocument.getElementById('new'));
 const nextDocument=element.contentDocument,next=nextDocument.getElementById('new');assertMembership(oldDocument,[next]);assertMembership(nextDocument,[old]);assertMembership(f.d,[old,next]);assert.equal(next.clientWidth,90);assert.deepEqual(widthThenFull(element.contentWindow,next),fullThenWidth(element.contentWindow,next));
 element.remove();assertMembership(f.d,[old,next,element]);assertMembership(oldDocument,[next]);assert.equal(platformFactoryRecord(old).implementation,backend);assert.equal(held.width,70);
 // Retained reads use their actual old document; no assertion invents a new
 // post-retirement width policy beyond stable same-state interleavings.
 assert.deepEqual(widthThenFull(oldWindow,old),fullThenWidth(oldWindow,old));
});

test('width-first and full-first boxes agree through actual style text child viewport and selector changes',{timeout:15000},async t=>{
 const html='<style>.box{width:100px;height:auto}.box:has(input:checked){width:140px}</style><body><div class=box>alpha beta gamma delta<input type=checkbox></div>',a=await owned(t,html),b=await owned(t,html),ea=a.d.querySelector('.box'),eb=b.d.querySelector('.box');
 const mutations=[()=>{},e=>{e.style.width='80px';e.style.fontSize='8px'},e=>{e.firstChild.data='one two three four five six seven eight'},e=>{e.append(e.ownerDocument.createElement('span'))},e=>{e.querySelector('input').checked=true;e.style.width=''},e=>{e.style.display='contents'},e=>{e.style.display='none'},e=>{e.style.display='block';e.style.height='23px'},e=>{e.firstChild.remove()}];
 for(const mutate of mutations){mutate(ea);mutate(eb);assert.deepEqual(widthThenFull(a.w,ea),fullThenWidth(b.w,eb));}
 a.page.layout.setViewport({width:600,height:300});b.page.layout.setViewport({width:600,height:300});assert.deepEqual(widthThenFull(a.w,ea),fullThenWidth(b.w,eb));
 a.d.styleSheets[0].cssRules[0].style.width='120px';b.d.styleSheets[0].cssRules[0].style.width='120px';assert.deepEqual(widthThenFull(a.w,ea),fullThenWidth(b.w,eb));
});

test('explicit providers and legacy unowned token path retain eager unrelated extent reads and provider order',{timeout:15000},t=>{
 function fixture(){const dom=new JSDOM('<!doctype html><div id=box style="width:80px;height:17px"><span>text</span></div><aside style="height:40px"></aside>');t.after(()=>dom.window.close());const w=dom.window,e=w.document.getElementById('box'),aside=w.document.querySelector('aside'),actual=aside.style,raw=w.getComputedStyle.bind(w),calls=[];let reads=0;Object.defineProperty(aside,'style',{configurable:true,get(){reads++;return actual}});const layout=createLayout(w,{getComputedStyle(node){calls.push(node.nodeName);return raw(node)}});return{layout,e,calls,get reads(){return reads}};}
 const a=fixture(),b=fixture();assert.equal(a.layout.dimension(a.e,'width'),80);assert.ok(a.reads>0);assert.equal(a.layout.dimension(a.e,'height'),17);a.layout.rect(a.e);
 assert.equal(b.layout.dimension(b.e,'height'),17);assert.equal(b.layout.dimension(b.e,'width'),80);b.layout.rect(b.e);assert.deepEqual(a.calls,b.calls);assert.ok(b.reads>0);
});

test('default genuine width defers unrelated full extents while real full reads still materialize them',{timeout:15000},async t=>{
 const{d,page}=await owned(t,'<body><div id=box style="width:80px;height:17px"></div><aside style="height:40px"></aside>'),e=d.getElementById('box'),aside=d.querySelector('aside'),actual=aside.style;let reads=0;
 Object.defineProperty(aside,'style',{configurable:true,get(){reads++;return actual}});
 assert.equal(e.clientWidth,80);assert.equal(reads,0);assert.equal(e.getBoundingClientRect().height,17);assert.ok(reads>0);
 reads=0;e.style.width='120px';assert.equal(e.clientWidth,120);assert.equal(reads,0);assert.equal(e.clientHeight,17);assert.ok(reads>0);
 const fake=Object.create(Object.getPrototypeOf(e));for(const symbol of Object.getOwnPropertySymbols(e))Object.defineProperty(fake,symbol,Object.getOwnPropertyDescriptor(e,symbol));let traps=0;const proxy=new Proxy(e,{get(){traps++;throw Error('Proxy read')}});
 assert.equal(platformFactoryRecord(fake),undefined);assert.equal(page.layout.dimension(fake,'width'),0);assert.equal(page.layout.dimension(proxy,'width'),0);assert.equal(traps,0);
});

test('real custom-element reentry and repeated clone insertion never reuse pre-mutation membership or widths',{timeout:15000},async t=>{
 const{w,d}=await owned(t);let connectedWidth,innerWidth;
 class Measured extends w.HTMLElement{connectedCallback(){this.style.cssText='width:100px;display:block';const child=d.createElement('div');child.style.width='50%';this.append(child);connectedWidth=this.clientWidth;innerWidth=child.clientWidth;child.remove();this.append(child);assert.equal(child.clientWidth,50);}}
 w.customElements.define('measured-width-box',Measured);const host=d.createElement('measured-width-box');d.body.append(host);assert.equal(connectedWidth,100);assert.equal(innerWidth,50);assertMembership(d,[host]);
 const lane=d.createElement('div');lane.style.display='inline-block';host.append(lane);const item=d.createElement('span');lane.append(item);let previous=lane.clientWidth;
 for(let i=0;i<5;i++){lane.append(item.cloneNode(true));const current=lane.clientWidth;assert.ok(current>previous);assert.equal(Number.parseFloat(w.getComputedStyle(lane).width),current);assert.equal(lane.getBoundingClientRect().width,current);assertMembership(d,[lane]);previous=current;}
 host.remove();assert.equal(lane.clientWidth,0);assertMembership(d,[lane,host]);d.body.append(host);assertMembership(d,[lane,host]);assert.equal(host.clientWidth,100);
});
