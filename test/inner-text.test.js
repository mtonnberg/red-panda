import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { installStyles } from '../src/styles.js';
import { installInnerText } from '../src/inner-text.js';

function fixture(t) {
  const page=Object.assign(new EventEmitter(),{documentAbort:new AbortController()});
  const dom=new JSDOM('<!doctype html><head></head><body></body>',{runScripts:'outside-only',pretendToBeVisual:true,url:'http://127.0.0.1/'});
  installStyles(page,dom.window);const controller=installInnerText(page,dom.window);
  t.after(()=>{page.documentAbort.abort();dom.window.close();});return{page,window:dom.window,document:dom.window.document,controller};
}
const load = async name => JSON.parse(await readFile(new URL('../docs/reference/'+name,import.meta.url),'utf8')).observations;

test('all public native connected/detached cases match actual DOM and computed styles',async t=>{
  const{document:d}=fixture(t),data=await load('inner-text-native-observation.json');
  for(const row of data.cases){const parent=d.createElement('section'),root=d.createElement('div');root.innerHTML=row.html;if(row.style)root.style.cssText=row.style;if(row.ancestorStyle)parent.style.cssText=row.ancestorStyle;parent.append(root);
    assert.equal(root.innerText,row.detached,row.name+' detached');d.body.append(parent);assert.equal(root.innerText,row.connected,row.name+' connected');parent.remove();}
});

test('tag-based breaks, literal BR edges, ignored CSS whitespace and Unicode text remain native-shaped',async t=>{
  const{document:d}=fixture(t),data=await load('inner-text-edges-native-observation.json');
  for(const row of data.tags){const root=d.createElement('div');root.innerHTML='a<'+row.tag+'>b</'+row.tag+'>c';d.body.append(root);assert.equal(root.innerText,row.text,row.tag);root.remove();}
  for(const row of data.edges){const root=d.createElement('div');root.innerHTML=row.html;if(row.style)root.style.cssText=row.style;d.body.append(root);assert.equal(root.innerText,row.text,row.name);root.remove();}
});

test('measured simple Unicode case ranges and form-control roots match public controls',async t=>{
  const{document:d}=fixture(t),data=await load('inner-text-unicode-native-observation.json');
  for(const row of data.unicode){const root=d.createElement('div');root.textContent=row.text;root.style.textTransform=row.mode;d.body.append(root);assert.equal(root.innerText,row.result,row.mode+' '+row.text);root.remove();}
  for(const row of data.roots){const root=d.createElement(row.tag);root.innerHTML=row.html;d.body.append(root);assert.equal(root.innerText,row.text,row.tag);root.remove();}
  for(const row of data.extra){const root=d.createElement('div');root.innerHTML=row.html;d.body.append(root);assert.equal(root.innerText,row.text,row.html);root.remove();}
});

test('setter creates real Text/BR nodes, removes actual children, normalizes CR/LF and never parses markup',async t=>{
  const{window:w,document:d}=fixture(t),data=await load('inner-text-native-observation.json');
  for(const row of data.setters){const root=d.createElement('div');const old=d.createElement('b');root.append(old);d.body.append(root);const input=row.inputType==='undefined'?undefined:row.input;root.innerText=input;assert.equal(old.parentNode,null);assert.equal(root.innerHTML,row.value.html);assert.equal(root.textContent,row.value.text);assert.equal(root.innerText,row.value.innerText);assert.deepEqual(Array.from(root.childNodes,node=>({type:node.nodeType,name:node.nodeName,data:node.data??null})),row.value.nodes);root.remove();}
  const root=d.createElement('div');d.body.append(root);root.innerText='<script>globalThis.noExecute=1</script>';assert.equal(w.noExecute,undefined);assert.equal(root.children.length,0);assert.match(root.innerHTML,/&lt;script&gt;/);
});

test('native primitive Symbol conversion and throwing object coercion preserve real setter semantics',t=>{
  const{window:w,document:d}=fixture(t),root=d.createElement('div');
  root.innerText=Symbol('x');assert.equal(root.textContent,'x');root.innerText=Symbol('');assert.equal(root.textContent,'');root.innerText=Symbol();assert.equal(root.textContent,'undefined');root.innerText=12n;assert.equal(root.textContent,'12');
  assert.throws(()=>root.innerText={toString(){throw new w.Error('coercion');}},/coercion/);assert.equal(root.textContent,'12');assert.throws(()=>root.innerText={toString(){return Symbol('x');}},error=>error instanceof w.TypeError);
});

test('stylesheet visibility and transforms, DOM edits and adoption are read live',t=>{
  const{document:d}=fixture(t),sheet=d.createElement('style');sheet.textContent='.hidden{display:none}.upper{text-transform:uppercase}';d.head.append(sheet);
  const root=d.createElement('div');root.innerHTML='a<span class="hidden">x</span><span class="upper">b</span>';assert.equal(root.innerText,'axb');d.body.append(root);assert.equal(root.innerText,'aB');root.querySelector('.hidden').className='';assert.equal(root.innerText,'axB');root.querySelector('.upper').textContent='updated';assert.equal(root.innerText,'axUPDATED');root.remove();assert.equal(root.innerText,'axupdated');
});

test('setter emits genuine replacement records and HTMLElement-only accessors enforce realm brands',async t=>{
  const{window:w,document:d,page,controller}=fixture(t),root=d.createElement('div');d.body.append(root);const child=d.createElement('span');root.append(child);const records=[];new w.MutationObserver(batch=>records.push(...batch)).observe(root,{childList:true});root.innerText='a\nb';await Promise.resolve();assert.equal(records.length,1);assert.equal(records[0].removedNodes[0],child);assert.equal(records[0].addedNodes.length,3);assert.equal(records[0].addedNodes[1],root.children[0]);
  assert.equal(installInnerText(page,w),controller);assert.equal(Object.hasOwn(w.Element.prototype,'innerText'),false);assert.equal(typeof d.createElementNS('http://www.w3.org/2000/svg','svg').innerText,'undefined');const descriptor=Object.getOwnPropertyDescriptor(w.HTMLElement.prototype,'innerText');assert.equal(descriptor.get.name,'get innerText');assert.equal(descriptor.set.name,'set innerText');assert.throws(()=>descriptor.get.call({}),error=>error instanceof w.TypeError);assert.throws(()=>descriptor.set.call(Object.create(root),'x'),error=>error instanceof w.TypeError);
});

test('script own innerText is the native raw-text alias with distinct null conversion',async t=>{
  const{window:w,document:d}=fixture(t),data=await load('inner-text-script-native-observation.json');
  for(const row of data){const script=d.createElement('script');script.innerText=row.type==='symbol'?Symbol('x'):row.type==='undefined'?undefined:row.input;assert.equal(script.text,row.text);assert.equal(script.innerHTML,row.html);assert.deepEqual(Array.from(script.childNodes,node=>node.nodeType),row.childTypes);}
  const script=d.createElement('script');script.text='X';script.style.display='block';d.body.append(script);assert.equal(script.innerText,'X');assert.equal(Object.getOwnPropertyDescriptor(w.HTMLElement.prototype,'innerText').get.call(script),'');assert.equal(Object.hasOwn(w.HTMLScriptElement.prototype,'innerText'),true);
});

test('separate native-UA dependency preserves hidden-element fallback and author display overrides',async t=>{
  const{installStyles:installNativeStyles}=await import('../src/styles.js');
  const page=Object.assign(new EventEmitter(),{documentAbort:new AbortController()});const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'http://127.0.0.1/'});t.after(()=>{page.documentAbort.abort();dom.window.close();});installNativeStyles(page,dom.window);installInnerText(page,dom.window);const data=await load('inner-text-hidden-native-observation.json'),d=dom.window.document;
  for(const row of data){const root=d.createElement('div'),child=d.createElement(row.tag);child.textContent='X';if(row.display)child.style.display=row.display;root.append('a',child,'b');d.body.append(root);assert.equal(root.innerText,row.parentText,row.tag+' parent '+row.display);assert.equal(child.innerText,row.ownText,row.tag+' own '+row.display);assert.equal(dom.window.getComputedStyle(child).display,row.computedDisplay,row.tag+' CSS '+row.display);root.remove();}
});

test('computed text-transform grammar matches native modifiers, invalid values and raw inline serialization',async t=>{
  const{installStyles:installNativeStyles}=await import('../src/styles.js');
  const page=Object.assign(new EventEmitter(),{documentAbort:new AbortController()});const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'http://127.0.0.1/'});t.after(()=>{page.documentAbort.abort();dom.window.close();});installNativeStyles(page,dom.window);installInnerText(page,dom.window);const d=dom.window.document;
  const controls=[...(await load('inner-text-transform-native-observation.json')).map(row=>({...row,parentMode:'uppercase'})),...(await load('inner-text-transform-invalid-native-observation.json'))];
  for(const row of controls){const parent=d.createElement('div'),element=d.createElement('span');parent.style.textTransform=row.parentMode;element.textContent='Mixed';element.style.textTransform=row.value;parent.append(element);d.body.append(parent);assert.equal(element.style.textTransform,row.inline,row.value+' inline');assert.equal(dom.window.getComputedStyle(element).textTransform,row.computed,row.value+' computed');assert.equal(element.innerText,row.text,row.value+' innerText');parent.remove();}
});

test('invalid text-transform reveals real valid stylesheet declaration instead of losing the cascade',async t=>{
  const{installStyles:installNativeStyles}=await import('../src/styles.js');
  const page=Object.assign(new EventEmitter(),{documentAbort:new AbortController()});const dom=new JSDOM('<!doctype html><head><style>.target{text-transform:uppercase}</style></head><body></body>',{runScripts:'outside-only',url:'http://127.0.0.1/'});t.after(()=>{page.documentAbort.abort();dom.window.close();});installNativeStyles(page,dom.window);installInnerText(page,dom.window);const d=dom.window.document;
  for(const row of await load('inner-text-transform-cascade-native-observation.json')){const parent=d.createElement('div'),element=d.createElement('span');parent.style.textTransform='lowercase';element.className='target';element.textContent='Mixed';element.style.textTransform=row.value;if(row.value==='var(--mode)')element.style.setProperty('--mode','shout');parent.append(element);d.body.append(parent);assert.equal(element.style.textTransform,row.inline);assert.equal(dom.window.getComputedStyle(element).textTransform,row.computed,row.value);assert.equal(element.innerText,row.text,row.value);parent.remove();}
});
