import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { installStyles } from '../src/styles.js';
import { installCheckVisibility } from '../src/check-visibility.js';
const load=async name=>JSON.parse(await readFile(new URL('../docs/reference/'+name,import.meta.url),'utf8')).observations;
function fixture(t){const page=Object.assign(new EventEmitter(),{documentAbort:new AbortController()});const{window}=new JSDOM('<!doctype html><head></head><body></body>',{runScripts:'outside-only',pretendToBeVisual:true});installStyles(page,window);const controller=installCheckVisibility(page,window);t.after(()=>{page.documentAbort.abort();window.close()});return{page,window,document:window.document,controller}}

test('native measured connected/detached/display/visibility/opacity/content options follow actual style state',async t=>{
 const{document:d}=fixture(t);for(const row of(await load('check-visibility-native-observation.json')).cases){const p=d.createElement('section'),e=d.createElement('div');if(row.name!=='empty')e.textContent='X';if(row.style)e.style.cssText=row.style;if(row.ancestor)p.style.cssText=row.ancestor;if(row.attr){const[k,v='']=row.attr.split('=');e.setAttribute(k,v)}p.append(e);if(row.fragment)d.createDocumentFragment().append(p);else if(row.connected!==false)d.body.append(p);for(const result of row.results)assert.equal(e.checkVisibility(result.options),result.value,row.name+' '+JSON.stringify(result.options));p.remove();}
});

test('native hidden tags and author display overrides are real stylesheet results',async t=>{
 const{window:w,document:d}=fixture(t);for(const row of(await load('check-visibility-native-observation.json')).tags){const e=row.tag==='svg'?d.createElementNS('http://www.w3.org/2000/svg','svg'):d.createElement(row.tag);d.body.append(e);if(row.override)e.style.display='block';for(const result of row.results)assert.equal(e.checkVisibility(result.options),result.value,row.tag+' '+row.override);e.remove();}
});

test('open and closed shadow hosts and real slot assignment determine composed visibility',async t=>{
 const{document:d}=fixture(t);for(const row of await load('check-visibility-composed-native-observation.json')){if(!row.mode)continue;const h=d.createElement('div'),e=d.createElement('span'),r=h.attachShadow({mode:row.mode}),s=d.createElement('slot');s.style.cssText=row.slotStyle;r.append(s);if(!row.matched)e.slot='missing';h.append(e);d.body.append(h);assert.equal(e.checkVisibility(),row.result,JSON.stringify(row));assert.equal(e.checkVisibility({opacityProperty:true}),row.opacity);assert.equal(e.checkVisibility({visibilityProperty:true}),row.visibility);h.remove();}
});

test('real slot fallback is hidden when assigned nodes replace it; orphan documents have no view',async t=>{
 const{document:d}=fixture(t);for(const assigned of[false,true]){const h=d.createElement('div'),r=h.attachShadow({mode:'closed'}),s=d.createElement('slot'),f=d.createElement('span');s.append(f);r.append(s);if(assigned)h.append(d.createElement('b'));d.body.append(h);assert.equal(s.checkVisibility(),true);assert.equal(f.checkVisibility(),!assigned);s.assignedNodes=()=>assigned?[]:[d.createElement('i')];assert.equal(f.checkVisibility(),!assigned);h.remove();}const orphan=d.implementation.createHTMLDocument('x');for(const e of[orphan.documentElement,orphan.body,orphan.createElement('div')])assert.equal(e.checkVisibility(),false);
});

test('all four real option getters run in native order, ignore contentVisibilityAuto, and propagate throws',t=>{
 const{window:w,document:d}=fixture(t),e=d.createElement('div');e.style.display='none';const access=[],options={};for(const key of['checkOpacity','checkVisibilityCSS','contentVisibilityAuto','opacityProperty','visibilityProperty'])Object.defineProperty(options,key,{get(){access.push(key);return true}});assert.equal(e.checkVisibility(options),false);assert.deepEqual(access,['checkOpacity','checkVisibilityCSS','opacityProperty','visibilityProperty']);const sentinel=new w.Error('option');assert.throws(()=>e.checkVisibility({get checkOpacity(){throw sentinel}}),error=>error===sentinel);assert.equal(e.checkVisibility({get contentVisibilityAuto(){throw sentinel}}),false);
});

test('option dictionaries reject primitives but accept null, objects and functions with actual booleans',t=>{
 const{window:w,document:d}=fixture(t),e=d.createElement('div');for(const x of[undefined,null,{},()=>{}])assert.equal(e.checkVisibility(x),true);for(const x of[true,1,'x',Symbol('x'),1n])assert.throws(()=>e.checkVisibility(x),error=>error instanceof w.TypeError);e.style.opacity='0';for(const x of[true,1,'false',[],{}])assert.equal(e.checkVisibility({opacityProperty:x}),false);for(const x of[false,0,'',null,undefined])assert.equal(e.checkVisibility({opacityProperty:x}),true);assert.equal(e.checkVisibility({checkOpacity:false,opacityProperty:true}),false);assert.equal(e.checkVisibility({checkOpacity:true,opacityProperty:false}),false);
});

test('method is a realm Element method, brands before dictionary conversion and installs idempotently',t=>{
 const{window:w,document:d,page,controller}=fixture(t),method=w.Element.prototype.checkVisibility;assert.equal(installCheckVisibility(page,w),controller);assert.equal(Object.hasOwn(w.HTMLElement.prototype,'checkVisibility'),false);assert.equal(method.name,'checkVisibility');assert.equal(method.length,0);assert.deepEqual(Object.getOwnPropertyDescriptor(w.Element.prototype,'checkVisibility'),{value:method,writable:true,enumerable:true,configurable:true});assert.throws(()=>method.call({}, {get checkOpacity(){throw new Error('wrong')}}),error=>error instanceof w.TypeError);assert.throws(()=>method.call(Object.create(d.createElement('div'))),error=>error instanceof w.TypeError);
});

test('live DOM/style changes and window closure do not leave observers or callbacks',t=>{
 const{window:w,document:d}=fixture(t),parent=d.createElement('div'),e=d.createElement('span');parent.append(e);assert.equal(e.checkVisibility(),true);parent.style.display='none';assert.equal(e.checkVisibility(),false);parent.style.display='contents';assert.equal(e.checkVisibility(),true);d.body.append(parent);e.style.visibility='hidden';assert.equal(e.checkVisibility({visibilityProperty:true}),false);e.style.visibility='visible';assert.equal(e.checkVisibility({visibilityProperty:true}),true);w.close();assert.equal(e.checkVisibility(),false);
});


test('native exact raw opacity strings remain distinct real computed values before visibility checks',async t=>{
 const{window:w,document:d}=fixture(t);for(const row of await load('check-visibility-composed-native-observation.json')){if(!row.opacity||row.mode)continue;const e=d.createElement('div');e.style.opacity=row.opacity;d.body.append(e);assert.equal(w.getComputedStyle(e).opacity,row.computed,row.opacity);assert.equal(e.checkVisibility({opacityProperty:true}),row.result,row.opacity);e.remove();}
 const parent=d.createElement('div');parent.style.opacity='0';d.body.append(parent);for(const row of [...await load('check-visibility-opacity-native-observation.json'),...(await load('check-visibility-opacity-serialization-native-observation.json')).slice(0,3),...(await load('check-visibility-opacity-numbers-native-observation.json')).slice(0,4)]){const e=d.createElement('div');e.style.setProperty('--zero','0');e.style.opacity=row.value;parent.append(e);assert.equal(e.style.opacity,row.inline,row.value+' inline');assert.equal(w.getComputedStyle(e).opacity,row.computed,row.value+' computed');assert.equal(e.checkVisibility({opacityProperty:true}),row.result,row.value);e.remove();}
});
