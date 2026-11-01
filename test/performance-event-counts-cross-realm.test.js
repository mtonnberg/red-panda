import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Browser} from '../src/browser.js';
const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(t){const browser=new Browser();t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,<body><button id=target>actual</button><iframe></iframe>');return page;}

test('EventCounts borrowed methods and getter use the real receiver while errors belong to the callee VM',async t=>{
 const page=await fixture(t),result=page.evaluate(`(()=>{const child=document.querySelector('iframe').contentWindow,a=performance.eventCounts,b=child.performance.eventCounts;document.getElementById('target').click();child.document.body.dispatchEvent(new Event('click'));child.document.body.dispatchEvent(new Event('click'));const getter=Object.getOwnPropertyDescriptor(Performance.prototype,'eventCounts').get,otherGetter=Object.getOwnPropertyDescriptor(child.Performance.prototype,'eventCounts').get;let errors=[];for(const f of[()=>otherGetter.call({}),()=>child.EventCounts.prototype.get.call({},'click')])try{f();errors.push(false);}catch(e){errors.push(e instanceof child.TypeError&&!(e instanceof TypeError));}return{get:EventCounts.prototype.get.call(b,'click'),has:EventCounts.prototype.has.call(b,'click'),mainGetter: getter.call(child.performance)===b,otherGetter:otherGetter.call(performance)===a,errors,name:getter.name,prototypeWritable:Object.getOwnPropertyDescriptor(EventCounts,'prototype').writable}})()`);
 assert.deepEqual(plain(result),{get:2,has:true,mainGetter:true,otherGetter:true,errors:[true,true],name:'get eventCounts',prototypeWritable:false});
});

test('EventCounts typed genuine iterators accept the same foreign kind, reject other kinds and reject clone',async t=>{
 const page=await fixture(t),result=page.evaluate(`(()=>{const ec=performance.eventCounts,child=document.querySelector('iframe').contentWindow,names=['keys','values','entries'],prototypes=names.map(name=>Object.getPrototypeOf(ec[name]())),matrix=[];for(let i=0;i<3;i++)for(let j=0;j<3;j++){try{prototypes[i].next.call(ec[names[j]]());matrix.push(i===j);}catch(e){matrix.push(i!==j&&e instanceof TypeError);}}const constructors=prototypes.map(p=>({name:p.constructor.name,points:p.constructor.prototype===p,writable:Object.getOwnPropertyDescriptor(p.constructor,'prototype').writable,keys:Reflect.ownKeys(p).map(k=>typeof k==='symbol'?k.description:k)}));const cross=prototypes[2].next.call(child.performance.eventCounts.entries());let clones=[];for(const name of names)try{structuredClone(ec[name]());clones.push('accepted');}catch(e){clones.push(e.name);}return{matrix,constructors,distinct:prototypes[0]!==prototypes[1]&&prototypes[1]!==prototypes[2]&&prototypes[0]!==prototypes[2],cross:{...cross,ownPair:Object.getPrototypeOf(cross.value)===Array.prototype},clones}})()`);
 assert.equal(result.distinct,true);assert.deepEqual(Array.from(result.matrix),Array(9).fill(true));assert.deepEqual(plain(result.cross),{done:false,value:['auxclick',0],ownPair:true});assert.deepEqual(Array.from(result.clones),Array(3).fill('DataCloneError'));
 const names=['browser.webapi.collections.iterator.Entry(browser.webapi.EventCounts.Iterator,"0"[0..1]).JsApi','browser.webapi.collections.iterator.Entry(browser.webapi.EventCounts.Iterator,"1"[0..1]).JsApi','browser.webapi.collections.iterator.Entry(browser.webapi.EventCounts.Iterator,null).JsApi'];
 for(let i=0;i<3;i++)assert.deepEqual(plain(result.constructors[i]),{name:names[i],points:true,writable:false,keys:['next','constructor','Symbol.iterator']});
});

test('EventCounts forEach snapshots real count values before any callback while iterators remain live',async t=>{
 const page=await fixture(t),result=page.evaluate(`(()=>{const ec=performance.eventCounts,b=document.getElementById('target');b.click();const before=ec.get('click'),values=[],it=ec.values();it.next();ec.forEach((value,key,source)=>{if(key==='auxclick')b.click();if(key==='click')values.push({value,same:source===ec,current:ec.get('click')});});return{before,after:ec.get('click'),values,next:it.next()}})()`);
 assert.deepEqual(plain(result),{before:1,after:2,values:[{value:1,same:true,current:2}],next:{done:false,value:2}});
});
