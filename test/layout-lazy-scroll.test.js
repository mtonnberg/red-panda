import{test}from'node:test';
import assert from'node:assert/strict';
import{JSDOM}from'jsdom';
import{Browser}from'../src/browser.js';
import{createLayout}from'../src/layout.js';
import{platformFactoryRecord}from'../src/platform-factories.js';
async function owned(t,html='<body>',options={}){const browser=new Browser(options),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,'+encodeURIComponent(html));return{browser,page,w:page.dom.window,d:page.dom.window.document};}
function eagerOracle(page,window=page.dom.window){return createLayout(window,{...page.layout.viewport,getComputedStyle:page.layout.rawComputedStyle});}
function compare(page,node,oracle){const actual=page.layout.scrollWidth(node),expected=oracle.scrollWidth(node);assert.equal(actual,expected,'Same actual Node and original explicit-provider eager path');assert.equal(node.scrollWidth,expected);return actual;}
function outcome(operation){try{return{value:operation()}}catch(error){return{error:error.name,message:error.message}}}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){const end=Date.now()+2000;while(!check()){if(Date.now()>=end)throw Error('Actual frame readiness deadline');await tick();}}

test('lazy scrollWidth equals the original eager path through real clone innerHTML overflow and clipping changes',{timeout:15000},async t=>{
 const{page,d}=await owned(t,'<body><div id=outer style="width:100px"><div id=lane style="display:inline-block;white-space:nowrap"><span style="width:40px"></span><span style="width:60px"></span></div></div>'),outer=d.getElementById('outer'),lane=d.getElementById('lane'),oracle=eagerOracle(page);let initial=compare(page,lane,oracle);assert.equal(initial,100);
 lane.append(lane.firstChild.cloneNode(true));assert.equal(compare(page,lane,oracle),140);compare(page,outer,oracle);
 lane.innerHTML+=lane.innerHTML;assert.equal(compare(page,lane,oracle),280);assert.ok(compare(page,outer,oracle)>outer.clientWidth);
 for(const overflow of['hidden','auto','clip','visible']){lane.style.overflowX=overflow;compare(page,outer,oracle);compare(page,lane,oracle);}
 lane.style.width='80px';compare(page,outer,oracle);lane.firstChild.style.width='50%';compare(page,lane,oracle);
 lane.lastChild.remove();compare(page,lane,oracle);const marker=d.createTextNode('');outer.append(marker);outer.insertBefore(lane,marker);compare(page,outer,oracle);
});

test('actual horizontal semantics remain equal for inline percent contents flex grid out-of-flow and hidden boxes',{timeout:15000},async t=>{
 const{page,d}=await owned(t),oracle=eagerOracle(page),outer=d.createElement('div'),box=d.createElement('div'),child=d.createElement('div');outer.style.width='200px';box.style.width='100px';child.style.width='350px';box.append(child);outer.append(box);d.body.append(outer);
 for(const display of['block','inline','inline-block','contents','flex','grid']){box.style.display=display;compare(page,box,oracle);compare(page,outer,oracle);child.style.width='50%';compare(page,box,oracle);child.style.width='350px';}
 for(const position of['absolute','fixed','static']){child.style.position=position;compare(page,box,oracle);}
 box.style.display='none';assert.equal(compare(page,box,oracle),0);box.style.display='block';child.style.float='left';compare(page,box,oracle);box.remove();assert.equal(compare(page,box,oracle),0);outer.append(box);compare(page,box,oracle);
});

test('named and manual slot scroll widths follow real reassignment fallback removal and adoption identities',{timeout:15000},async t=>{
 const a=await owned(t),host=a.d.createElement('div'),child=a.d.createElement('span');host.style.width='100px';child.style.width='150px';child.slot='chosen';host.append(child);a.d.body.append(host);const root=host.attachShadow({mode:'closed'}),slot=a.d.createElement('slot'),fallback=a.d.createElement('b');slot.name='chosen';fallback.style.width='90px';slot.append(fallback);root.append(slot);const oracle=eagerOracle(a.page);
 compare(a.page,host,oracle);compare(a.page,child,oracle);child.slot='elsewhere';assert.equal(compare(a.page,child,oracle),0);compare(a.page,slot,oracle);slot.name='elsewhere';compare(a.page,child,oracle);
 const manual=a.d.createElement('div'),item=a.d.createElement('span');manual.style.width='80px';item.style.width='120px';manual.append(item);a.d.body.append(manual);const manualRoot=manual.attachShadow({mode:'closed',slotAssignment:'manual'}),one=a.d.createElement('slot'),two=a.d.createElement('slot');two.style.display='none';manualRoot.append(one,two);one.assign(item);compare(a.page,item,oracle);two.assign(item);assert.equal(compare(a.page,item,oracle),0);one.assign(item);compare(a.page,manual,oracle);
 const backend=platformFactoryRecord(item).implementation,prototype=Object.getPrototypeOf(item),other=a.browser.createPage();await other.navigate('data:text/html,<body>');const target=other.dom.window.document;target.adoptNode(manual);assert.equal(item.scrollWidth,0);target.body.append(manual);const otherOracle=eagerOracle(other);compare(other,item,otherOracle);compare(other,manual,otherOracle);assert.equal(platformFactoryRecord(item).implementation,backend);assert.equal(Object.getPrototypeOf(item),prototype);
 item.remove();assert.equal(compare(other,item,otherOracle),0);manual.append(item);one.assign(item);compare(other,item,otherOracle);
});

test('explicit providers and the unowned token fallback retain eager callbacks and two-snapshot token reads',{timeout:15000},t=>{
 function fixture(explicit){const dom=new JSDOM('<!doctype html><div id=box style="width:80px"><span style="width:120px"></span></div><aside style="height:40px"></aside>');t.after(()=>dom.window.close());const w=dom.window,e=w.document.getElementById('box'),aside=w.document.querySelector('aside'),attributes=aside.attributes,declaration=aside.style,raw=w.getComputedStyle.bind(w),calls=[];let attributeReads=0,styleReads=0,optionReads=0;Object.defineProperty(aside,'attributes',{configurable:true,get(){attributeReads++;return attributes}});Object.defineProperty(aside,'style',{configurable:true,get(){styleReads++;return declaration}});const options=explicit?{get getComputedStyle(){optionReads++;return node=>{calls.push(node.nodeName);return raw(node)}}}:{};const model=createLayout(w,options);return{w,e,model,calls,get attributeReads(){return attributeReads},get styleReads(){return styleReads},get optionReads(){return optionReads}};}
 const explicit=fixture(true),token=fixture(false);assert.ok(explicit.model.scrollWidth(explicit.e)>=80);assert.ok(explicit.styleReads>0);assert.ok(explicit.attributeReads>=4);assert.equal(explicit.optionReads,1);assert.ok(explicit.calls.length>0);
 assert.ok(token.model.scrollWidth(token.e)>=80);assert.equal(token.attributeReads,explicit.attributeReads);assert.ok(token.styleReads>0);
 const again=fixture(true);assert.equal(again.model.scrollWidth(again.e),explicit.model.scrollWidth(explicit.e));assert.deepEqual(again.calls,explicit.calls);assert.equal(explicit.optionReads,1);
});

test('genuine non-root scrollWidth defers unrelated extents but root body height and global extents keep the full path',{timeout:15000},async t=>{
 const{page,d}=await owned(t,'<body><div id=box style="width:80px"><span style="width:120px"></span></div><aside style="height:40px"></aside>'),box=d.getElementById('box'),aside=d.querySelector('aside'),declaration=aside.style,oracle=eagerOracle(page);let reads=0;Object.defineProperty(aside,'style',{configurable:true,get(){reads++;return declaration}});
 const first=box.scrollWidth;assert.equal(reads,0);assert.equal(first,oracle.scrollWidth(box));assert.ok(reads>0);
 reads=0;box.firstChild.style.width='150px';const next=box.scrollWidth;assert.equal(reads,0);assert.equal(next,oracle.scrollWidth(box));assert.ok(reads>0);
 reads=0;box.style.width='90px';d.documentElement.scrollWidth;assert.ok(reads>0);assert.deepEqual(page.layout.documentSize,oracle.documentSize);
 reads=0;box.style.width='100px';assert.equal(d.body.scrollWidth,oracle.scrollWidth(d.body));assert.ok(reads>0);
 reads=0;box.style.width='110px';box.scrollHeight;assert.ok(reads>0);assert.equal(box.scrollWidth,oracle.scrollWidth(box));
});

test('namespace elements retained frames and non-Element lookalikes preserve eager-oracle values and real backend brands',{timeout:15000},async t=>{
 const f=await owned(t,'<!doctype html><body>',{loadResources:['iframe']}),oracle=eagerOracle(f.page);
 for(const namespace of[null,'urn:scroll','http://www.w3.org/2000/svg','http://www.w3.org/1998/Math/MathML']){const e=f.d.createElementNS(namespace,'section');e.setAttribute('style','width:70px');f.d.body.append(e);compare(f.page,e,oracle);e.append(f.d.createElement('span'));compare(f.page,e,oracle);}
 const element=f.d.createElement('div');element.style.width='80px';element.textContent='text';f.d.body.append(element);const fake=Object.create(Object.getPrototypeOf(element));for(const symbol of Object.getOwnPropertySymbols(element))Object.defineProperty(fake,symbol,Object.getOwnPropertyDescriptor(element,symbol));let reads=0;const proxy=new Proxy(element,{get(){reads++;throw Error('Authored proxy read')}});
 for(const node of[f.d,f.d.doctype,element.firstChild,f.d.createComment('x'),fake,proxy])assert.deepEqual(outcome(()=>f.page.layout.scrollWidth(node)),outcome(()=>oracle.scrollWidth(node)));assert.equal(reads,0);
 const frame=f.d.createElement('iframe');frame.srcdoc='<div id=child style="width:70px"><span style="width:120px"></span></div>';f.d.body.append(frame);await until(()=>frame.contentDocument?.readyState==='complete'&&frame.contentDocument.getElementById('child'));const page=f.page.frames.findElement(frame),child=frame.contentDocument.getElementById('child'),backend=platformFactoryRecord(child).implementation,childOracle=eagerOracle(page);
 compare(page,child,childOracle);child.firstChild.style.width='150px';compare(page,child,childOracle);frame.remove();assert.deepEqual(outcome(()=>page.layout.scrollWidth(child)),outcome(()=>childOracle.scrollWidth(child)));assert.equal(platformFactoryRecord(child).implementation,backend);
});
