import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {createIsolatedWorld,utilityNodeIdentity,canonicalUtilityValue} from './isolated-world.mjs';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
function setup(t,options={}){const dom=new JSDOM('<!doctype html><button id="a">A</button><p id="p">P</p>',{runScripts:'dangerously'}),abort=new AbortController();const world=createIsolatedWorld(dom.window,{signal:abort.signal,...options});t.after(()=>{abort.abort();dom.window.close();});return{dom,main:dom.window,world,abort};}
const plain=value=>JSON.parse(JSON.stringify(value));

test('actual VM globals, functions and per-world DOM prototypes/expandos differ over one real tree',t=>{
 const{main,world}=setup(t),button=main.document.getElementById('a'),impl=utils.implForWrapper(button),canonical=impl[utils.wrapperSymbol];main.onlyMain=42;button.mainExpando=42;
 assert.equal(vm.isContext(world.context),true);assert.notEqual(world.context,main);assert.deepEqual(plain(world.evaluate('({global:typeof onlyMain,expando:document.getElementById("a").mainExpando,node:document.getElementById("a") instanceof HTMLButtonElement,object:document instanceof Object,method:document.querySelector instanceof Function,window:window instanceof Window,view:document.defaultView===window})')),{global:'undefined',node:true,object:true,method:true,window:true,view:true});
 world.evaluate('globalThis.onlyUtility=84;document.getElementById("a").utilityExpando=84;Node.prototype.utilityProperty=84;document.getElementById("a").textContent="shared mutation";');assert.equal(main.onlyUtility,undefined);assert.equal(button.utilityExpando,undefined);assert.equal(main.Node.prototype.utilityProperty,undefined);assert.equal(button.textContent,'shared mutation');assert.equal(impl[utils.wrapperSymbol],canonical);
});

test('two genuine worlds retain independent wrappers and original canonical main backlink',t=>{
 const{main,world}=setup(t),other=createIsolatedWorld(main);t.after(()=>other.dispose());const first=world.evaluate('document.getElementById("a")'),second=other.evaluate('document.getElementById("a")');assert.notEqual(first,second);assert.equal(canonicalUtilityValue(first),main.document.getElementById('a'));assert.equal(canonicalUtilityValue(second),main.document.getElementById('a'));first.expando=1;assert.equal(second.expando,undefined);world.evaluate('document.getElementById("a").setAttribute("shared","yes")');assert.equal(other.evaluate('document.getElementById("a").getAttribute("shared")'),'yes');
});

test('real live collections and static NodeLists return their own genuine public wrappers',t=>{
 const{main,world}=setup(t);assert.deepEqual(plain(world.evaluate('globalThis.list=document.querySelectorAll("p");globalThis.live=document.body.children;({list:list instanceof NodeList,index:list[0]===document.getElementById("p"),array:document.getElementById("p").getAttributeNames() instanceof Array,collection:live instanceof HTMLCollection,count:live.length})')),{list:true,index:true,array:true,collection:true,count:2});main.document.body.append(main.document.createElement('p'));assert.deepEqual(plain(world.evaluate('({static:list.length,live:live.length})')),{static:1,live:3});
});

test('utility-created nodes preserve shared identity and keep utility expandos out of main wrappers',t=>{
 const{main,world}=setup(t);const node=world.evaluate('globalThis.created=document.createElement("span");created.id="created";created.expando=17;document.body.append(created);created');assert.equal(world.evaluate('document.getElementById("created")===created'),true);assert.equal(main.document.getElementById('created').expando,undefined);assert.equal(canonicalUtilityValue(node),main.document.getElementById('created'));
});

test('events use real world callback/this/target wrappers in both producer directions',t=>{
 const{main,world}=setup(t),button=main.document.getElementById('a');let rootEvent;button.addEventListener('audit',event=>{rootEvent=event;event.mainExpando=1;assert.equal(event instanceof main.Event,true);});world.evaluate('globalThis.result=null;document.getElementById("a").addEventListener("audit",function(e){e.utilityExpando=2;result={event:e instanceof Event,target:e.target===this,self:this===document.getElementById("a"),main:e.mainExpando};});');button.dispatchEvent(new main.Event('audit'));assert.deepEqual(plain(world.evaluate('result')),{event:true,target:true,self:true});assert.equal(rootEvent.utilityExpando,undefined);world.evaluate('document.getElementById("a").dispatchEvent(new Event("audit"))');assert.equal(rootEvent instanceof main.Event,true);assert.equal(rootEvent.utilityExpando,undefined);
});

test('authored CustomEvent.detail values retain original cross-world identity rather than being copied',t=>{
 const{main,world}=setup(t);main.detailArray=[main.document.getElementById('p')];main.detailArray[0].mainExpando=42;world.evaluate('document.addEventListener("detail",e=>{globalThis.detailResult={array:e.detail instanceof Array,node:e.detail[0]===document.getElementById("p"),expando:e.detail[0].mainExpando};e.detail.push(2)});');main.document.dispatchEvent(new main.CustomEvent('detail',{detail:main.detailArray}));assert.equal(main.detailArray.length,2);assert.deepEqual(plain(world.evaluate('detailResult')),{array:false,node:false,expando:42});
});

test('MutationObserver preserves the measured main-delivery native quirk in a real utility callback',async t=>{
 const{main,world}=setup(t);main.utilityMarker=undefined;let result;main.document.getElementById('p').addEventListener('mo',e=>{result={array:e.detail.records instanceof main.Array,node:e.detail.records[0].target===main.document.getElementById('p'),observer:e.detail.observer instanceof main.MutationObserver};});world.evaluate('globalThis.utilityMarker=84;globalThis.observer=new MutationObserver((records,observer)=>{globalThis.observation={array:records instanceof Array,node:records[0].target===document.getElementById("p"),observer:observer===globalThis.observer,global:utilityMarker};document.getElementById("p").dispatchEvent(new CustomEvent("mo",{detail:{records,observer}}));});observer.observe(document.getElementById("p"),{attributes:true});');assert.equal(world.evaluate('observer instanceof MutationObserver'),true);main.document.getElementById('p').setAttribute('x','yes');await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(plain(world.evaluate('observation')),{array:false,node:false,observer:false,global:84});assert.deepEqual(result,{array:true,node:true,observer:true});
});

test('abort removes actual callbacks/observers/timers without repeating authored conversion hooks',async t=>{
 const{main,world,abort}=setup(t);main.calls=[];world.evaluate('globalThis.conversions=0;const type={toString(){conversions++;return "audit"}};const opts={get capture(){conversions++;return false}};document.addEventListener(type,()=>document.documentElement.setAttribute("late-event","bad"),opts);globalThis.observer=new MutationObserver(()=>document.documentElement.setAttribute("late-observer","bad"));observer.observe(document.getElementById("p"),{attributes:true});setTimeout(()=>document.documentElement.setAttribute("late-timer","bad"),20);');assert.equal(world.evaluate('conversions'),2);main.document.getElementById('p').setAttribute('x','before-abort');abort.abort();main.document.dispatchEvent(new main.Event('audit'));await new Promise(resolve=>setTimeout(resolve,30));for(const name of ['late-event','late-observer','late-timer'])assert.equal(main.document.documentElement.hasAttribute(name),false);assert.throws(()=>world.evaluate('1'),/disposed/);world.dispose();
});

test('factory notifications carry actual realm/implementation/final public values with weak-identity recognition',t=>{
 const events=[],factories=[];const{world,abort}=setup(t,{onRealm(global,context){events.push('realm');assert.equal(vm.isContext(context),true);assert.equal(global.document instanceof global.Document,true);},onWrapper(value,global,metadata){events.push('factory');factories.push({value,global,metadata});}});assert.equal(events[0],'realm');const list=world.evaluate('document.querySelectorAll("p")');const entry=factories.find(row=>row.value===list);assert.ok(entry);assert.equal(entry.global,world.global);assert.equal(entry.metadata.impl,world.implementationFor(list));assert.equal(entry.metadata.interfaceName,'NodeList');const node=world.evaluate('document.getElementById("p")');assert.equal(utilityNodeIdentity(node).nodeType,1);const fake=Object.create(Object.getPrototypeOf(node));Object.defineProperty(fake,utils.implSymbol,{value:world.implementationFor(node)});assert.equal(utilityNodeIdentity(fake),undefined);abort.abort();assert.equal(entry.metadata.disposed,true);assert.equal(utilityNodeIdentity(node),undefined);
});

test('bounded private invocation preserves utility literals/lexical scope and ignores authored apply replacements',t=>{
 const{world}=setup(t,{timeout:30});world.evaluate('globalThis.answer=42;globalThis.before=[];before=Object.getOwnPropertyNames(globalThis);Function.prototype.apply=()=>99;Reflect.apply=()=>98;JSON.parse=()=>({poisoned:true});');assert.equal(world.callFunction('function(){return answer}',world.global,[]),42);assert.equal(world.callFunction('function(){return Object.getOwnPropertyNames(globalThis).filter(key=>!before.includes(key)).length}',world.global,[]),0);assert.throws(()=>world.callFunction('function(){while(true){}}',world.global,[]),error=>error.code==='ERR_SCRIPT_EXECUTION_TIMEOUT');assert.equal(world.callFunction('function(){return answer+1}',world.global,[]),43);
});
