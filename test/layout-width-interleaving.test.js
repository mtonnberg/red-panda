import{test}from'node:test';
import assert from'node:assert/strict';
import{JSDOM}from'jsdom';
import{Browser}from'../src/browser.js';
import{createLayout}from'../src/layout.js';
import{platformFactoryRecord}from'../src/platform-factories.js';

async function owned(t,html='<body>'){
 const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());
 await page.navigate('data:text/html,'+encodeURIComponent(html));
 return{browser,page,w:page.dom.window,d:page.dom.window.document};
}
function metrics(e){const r=e.getBoundingClientRect();return{width:e.clientWidth,height:e.clientHeight,rect:[r.width,r.height],scroll:[e.scrollWidth,e.scrollHeight]}}

test('a genuine Element width-only query does not eagerly request vertical data from its real configured style provider',{timeout:15000},t=>{
 const dom=new JSDOM('<!doctype html><div id="box" style="width:80px;height:17px"><span>alpha</span></div>');t.after(()=>dom.window.close());
 const w=dom.window,e=w.document.getElementById('box'),raw=w.getComputedStyle.bind(w);let heightReads=0;
 const layout=createLayout(w,{getComputedStyle(node){const actual=raw(node);return new Proxy(actual,{get(target,key){if(key==='height')heightReads++;return Reflect.get(target,key,target)}})}});
 assert.ok(platformFactoryRecord(e)?.implementation);assert.equal(layout.dimension(e,'width'),80);assert.equal(heightReads,0);
 assert.equal(layout.dimension(e,'height'),17);assert.ok(heightReads>0);assert.equal(layout.rect(e).height,17);
 e.style.width='120px';e.style.height='23px';heightReads=0;
 assert.equal(layout.dimension(e,'width'),120);assert.equal(heightReads,0);assert.equal(layout.rect(e).height,23);assert.ok(heightReads>0);
});

test('width-first and height-first reads preserve real wrapping font text and retained rectangle invalidation',{timeout:15000},async t=>{
 const{w,d}=await owned(t),e=d.createElement('div');e.style.width='100px';e.textContent='alpha beta gamma delta epsilon zeta';d.body.append(e);
 assert.equal(e.clientWidth,100);const tall=e.clientHeight;assert.ok(tall>20);assert.deepEqual(metrics(e).rect,[100,tall]);assert.equal(w.getComputedStyle(e).width,'100px');
 const held=e.getBoundingClientRect(),saved=[held.x,held.y,held.width,held.height];
 e.firstChild.data='alpha';assert.equal(e.clientWidth,100);assert.equal(e.clientHeight,20);assert.deepEqual(metrics(e).rect,[100,20]);
 e.style.whiteSpace='nowrap';e.style.fontSize='8px';assert.equal(e.clientHeight,10);assert.equal(e.clientWidth,100);assert.deepEqual(metrics(e).rect,[100,10]);
 e.style.height='0px';assert.equal(e.clientWidth,100);assert.equal(e.clientHeight,0);assert.equal(e.scrollHeight,10);assert.deepEqual([held.x,held.y,held.width,held.height],saved);
 e.style.height='27px';e.style.width='80px';assert.equal(e.clientHeight,27);assert.equal(e.clientWidth,80);assert.deepEqual(metrics(e).rect,[80,27]);
});

test('width dimension interleavings keep actual sheet child and inline mutations live in the same boxes',{timeout:15000},async t=>{
 const{d}=await owned(t,'<style>.box{width:80px;height:17px}</style><body><div class="box"></div>'),e=d.querySelector('.box'),sheet=d.styleSheets[0];
 assert.equal(e.clientWidth,80);assert.deepEqual(metrics(e).rect,[80,17]);const held=e.getBoundingClientRect();
 sheet.cssRules[0].style.width='120px';sheet.cssRules[0].style.height='23px';assert.equal(e.clientWidth,120);assert.equal(e.clientHeight,23);assert.deepEqual(metrics(e).rect,[120,23]);
 assert.deepEqual([held.width,held.height],[80,17]);
 e.style.height='';e.style.width='200px';const child=d.createElement('div');child.style.cssText='width:50%;height:70px';e.append(child);
 assert.equal(e.clientWidth,200);assert.equal(child.clientWidth,100);assert.equal(child.clientHeight,70);assert.equal(e.clientHeight,23);
 e.style.height='auto';assert.equal(e.clientWidth,200);assert.ok(e.clientHeight>=70);assert.equal(child.getBoundingClientRect().width,100);
 child.style.width='40px';child.style.height='12px';assert.equal(e.clientWidth,200);assert.equal(child.clientWidth,40);assert.ok(e.clientHeight>=12);
});

test('width-first element reads retain viewport root hidden detached and display-contents behavior',{timeout:15000},async t=>{
 const{page,d}=await owned(t),e=d.createElement('div');e.style.cssText='width:50%;height:20px';d.body.append(e);
 page.layout.setViewport({width:600,height:400});assert.equal(e.clientWidth,300);assert.equal(e.clientHeight,20);assert.equal(d.documentElement.clientWidth,600);assert.deepEqual(metrics(e).rect,[300,20]);
 page.layout.setViewport({width:400,height:300});assert.equal(e.clientHeight,20);assert.equal(e.clientWidth,200);assert.deepEqual(metrics(e).rect,[200,20]);
 e.style.display='none';assert.equal(e.clientWidth,0);assert.equal(e.clientHeight,0);assert.equal(e.getClientRects().length,0);
 e.style.display='block';assert.equal(e.clientWidth,200);assert.equal(e.clientHeight,20);e.remove();assert.equal(e.clientWidth,0);assert.equal(e.clientHeight,0);
 const wrap=d.createElement('div'),child=d.createElement('div');wrap.style.display='contents';child.style.cssText='width:40px;height:12px';wrap.append(child);d.body.append(wrap);
 assert.equal(wrap.clientWidth,0);assert.equal(child.clientWidth,40);assert.deepEqual(metrics(child).rect,[40,12]);
});

test('adoption and real manual shadow slots preserve backend identity and width height geometry under reordered reads',{timeout:15000},async t=>{
 const a=await owned(t),second=a.browser.createPage();await second.navigate('data:text/html,<body>');const b={d:second.dom.window.document,w:second.dom.window};
 const host=a.d.createElement('div'),child=a.d.createElement('span');host.style.cssText='width:100px';child.style.cssText='width:60px;height:12px';host.append(child);a.d.body.append(host);
 const shadow=host.attachShadow({mode:'closed',slotAssignment:'manual'}),visible=a.d.createElement('slot'),hidden=a.d.createElement('slot');hidden.style.display='none';shadow.append(visible,hidden);visible.assign(child);
 const backend=platformFactoryRecord(child).implementation,prototype=Object.getPrototypeOf(child);assert.equal(child.clientWidth,60);assert.equal(child.clientHeight,12);const held=child.getBoundingClientRect();
 hidden.assign(child);assert.equal(child.clientWidth,0);assert.equal(child.clientHeight,0);visible.assign(child);assert.equal(child.clientHeight,12);assert.equal(child.clientWidth,60);
 assert.equal(b.d.adoptNode(host),host);b.d.body.append(host);assert.equal(child.ownerDocument,b.d);assert.equal(platformFactoryRecord(child).implementation,backend);assert.equal(Object.getPrototypeOf(child),prototype);
 assert.equal(child.clientWidth,60);assert.deepEqual(metrics(child).rect,[60,12]);child.style.cssText='width:90px;height:20px';assert.equal(child.clientHeight,20);assert.equal(child.clientWidth,90);assert.deepEqual(metrics(child).rect,[90,20]);assert.deepEqual([held.width,held.height],[60,12]);
});

test('genuine non-Element dimensions keep their old path and copied-symbol proxy lookalikes gain no layout authority',{timeout:15000},t=>{
 const dom=new JSDOM('<!doctype html><div style="width:80px;height:17px">text</div>');t.after(()=>dom.window.close());const w=dom.window,d=w.document,e=d.querySelector('div'),layout=createLayout(w),text=e.firstChild;
 assert.equal(layout.dimension(d,'width'),layout.viewport.width);assert.equal(layout.dimension(text,'width'),5);assert.equal(layout.dimension(text,'height'),5);assert.equal(layout.dimension(d.createComment('x'),'width'),0);
 const fake=Object.create(Object.getPrototypeOf(e));for(const symbol of Object.getOwnPropertySymbols(e)){const descriptor=Object.getOwnPropertyDescriptor(e,symbol);if(descriptor)Object.defineProperty(fake,symbol,descriptor)}
 assert.equal(platformFactoryRecord(fake),undefined);assert.equal(layout.dimension(fake,'width'),0);let reads=0;const proxy=new Proxy(e,{get(){reads++;throw Error('authored proxy getter')}});
 assert.equal(layout.dimension(proxy,'width'),0);assert.equal(layout.dimension(proxy,'height'),0);assert.equal(reads,0);assert.equal(layout.dimension(e,'unknown-axis'),undefined);
});
