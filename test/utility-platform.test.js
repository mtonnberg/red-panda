import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Browser} from '../src/browser.js';
import {createIsolatedWorld,canonicalUtilityValue} from '../src/isolated-world.js';
import {installUtilityIntersection} from '../src/utility-observers.js';
import {installUtilityAnimationFrame} from '../src/utility-platform.js';
import {installUtilityLayout} from '../src/utility-layout.js';
import {installFonts} from '../src/fonts.js';
const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(t){const browser=new Browser({timeout:1000}),page=browser.createPage();await page.navigate('data:text/html,<div id="a" style="width:20px;height:30px">A</div>');const main=page.dom.window,world=createIsolatedWorld(main,{signal:page.documentAbort.signal});installUtilityLayout(page,world,main);installUtilityAnimationFrame(page,world,main);installUtilityIntersection(page,world,main);installFonts(world.global);t.after(()=>{world.dispose();browser.close();});return {browser,page,main,world};}

test('native public observer producers, ordering and option errors use genuine utility values',async t=>{
 const{world}=await fixture(t),native=JSON.parse(await readFile(new URL('./fixtures/utility-platform-native.json',import.meta.url),'utf8'));
 for(const row of native.observations){const actual=plain(await world.evaluate(row.expression));if(row.label==='raf-producer'){assert.equal(Number.isFinite(actual.clockDelta),true);assert.ok(Math.abs(actual.clockDelta)<100);delete actual.clockDelta;const expected={...row.result.result.value};delete expected.clockDelta;assert.deepEqual(actual,expected);}else assert.deepEqual(actual,row.result.result.value);}
});

test('rectangles and live layout dimensions come from canonical nodes while result identities stay utility-local',async t=>{
 const{page,main,world}=await fixture(t),node=main.document.getElementById('a');node.mainExpando=42;
 const expected=plain(node.getBoundingClientRect().toJSON());
 const actual=plain(world.evaluate('globalThis.target=document.getElementById("a");globalThis.rect=target.getBoundingClientRect();globalThis.rects=target.getClientRects();({value:rect.toJSON(),rect:rect instanceof DOMRect,base:rect instanceof DOMRectReadOnly,list:rects instanceof DOMRectList,item:rects.item(0)===rects[0],array:[...rects] instanceof Array,method:target.getBoundingClientRect instanceof Function,width:document.documentElement.clientWidth,height:document.documentElement.clientHeight,mainExpando:target.mainExpando})'));
 assert.deepEqual(actual,{value:expected,rect:true,base:true,list:true,item:true,array:true,method:true,width:page.layout.viewport.width,height:page.layout.viewport.height});
 assert.notEqual(world.evaluate('rect'),node.getBoundingClientRect());assert.equal(canonicalUtilityValue(world.evaluate('target')),node);
 node.style.width='40px';assert.equal(world.evaluate('target.getBoundingClientRect().width'),40);assert.equal(world.evaluate('rect.width'),20);
 assert.deepEqual(plain(world.evaluate('(()=>{const result=[];for(const fn of [()=>Element.prototype.getBoundingClientRect.call({}),()=>Object.getOwnPropertyDescriptor(Element.prototype,"clientWidth").get.call({})]){try{fn()}catch(error){result.push([error instanceof TypeError,error.message])}}return result})()')),[[true,'Illegal invocation'],[true,'Illegal invocation']]);
});

test('observer receives real changed geometry and utility target identity after main-world DOM mutations',async t=>{
 const{main,world}=await fixture(t);
 world.evaluate('globalThis.deliveries=[];globalThis.observer=new IntersectionObserver((records,observer)=>{deliveries.push({same:records[0].target===document.getElementById("a"),self:observer===globalThis.observer,array:records instanceof Array,entry:records[0] instanceof IntersectionObserverEntry,intersects:records[0].isIntersecting,ratio:records[0].intersectionRatio});});observer.observe(document.getElementById("a"));');
 await new Promise(resolve=>setTimeout(resolve,0));main.document.getElementById('a').style.display='none';await new Promise(resolve=>setTimeout(resolve,0));
 assert.deepEqual(plain(world.evaluate('deliveries')),[{same:true,self:true,array:true,entry:true,intersects:true,ratio:1},{same:true,self:true,array:true,entry:true,intersects:false,ratio:0}]);
});

test('RAF uses the prepared document scheduler, realm-local callback and single cancellation conversion',async t=>{
 const{main,world}=await fixture(t);main.requestAnimationFrame=()=>{throw new Error('authored main scheduler');};main.cancelAnimationFrame=()=>{throw new Error('authored main cancellation');};
 const result=await world.evaluate('new Promise(resolve=>{globalThis.canceledCalled=false;globalThis.conversions=0;const id=requestAnimationFrame(()=>{canceledCalled=true});cancelAnimationFrame({valueOf(){conversions++;return id}});requestAnimationFrame(function(timestamp){resolve({self:this===window,time:typeof timestamp,clock:performance.now()-timestamp,conversions,canceledCalled,entry:requestAnimationFrame instanceof Function,performance:performance instanceof Performance});});})');
 assert.deepEqual({...plain(result),clock:undefined},{self:true,time:'number',clock:undefined,conversions:1,canceledCalled:false,entry:true,performance:true});assert.ok(Math.abs(result.clock)<100);
});

test('document abort cancels pending RAF, observer work and its genuine font Promise remains in the utility realm',async t=>{
 const{page,main,world}=await fixture(t);assert.deepEqual(plain(world.evaluate('({set:document.fonts instanceof FontFaceSet,promise:document.fonts.ready instanceof Promise,global:FontFaceSet instanceof Function,same:document.fonts===document.fonts})')),{set:true,promise:true,global:true,same:true});
 world.evaluate('requestAnimationFrame(()=>document.documentElement.setAttribute("late-frame","bad"));new IntersectionObserver(()=>document.documentElement.setAttribute("late-observer","bad")).observe(document.getElementById("a"));');
 const document=main.document;page.documentAbort.abort();await new Promise(resolve=>setTimeout(resolve,25));assert.equal(document.documentElement.hasAttribute('late-frame'),false);assert.equal(document.documentElement.hasAttribute('late-observer'),false);
});

test('trusted utility factories publish weak provenance after final wrapper identity without heap dependencies',async t=>{
 const{world}=await fixture(t);const {platformFactoryRecord,subscribePlatformFactories}=await import('../src/platform-factories.js');
 const notifications=[];const unsubscribe=subscribePlatformFactories((value,record)=>{notifications.push({value,record});throw new Error('observer failure');});t.after(unsubscribe);
 const value=world.evaluate('new DOMRect(1,2,3,4)'),record=platformFactoryRecord(value);
 assert.equal(record.kind,'DOMRect');assert.equal(record.globalRef.deref(),world.global);assert.equal(record.implementation,world.implementationFor(value));assert.equal(notifications.find(row=>row.value===value).record,record);assert.equal(value.width,3);
 const fake=Object.create(Object.getPrototypeOf(value));for(const key of Object.getOwnPropertySymbols(value))Object.defineProperty(fake,key,Object.getOwnPropertyDescriptor(value,key));assert.equal(platformFactoryRecord(fake),undefined);
});
