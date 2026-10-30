import assert from 'node:assert/strict';
import vm from 'node:vm';
import { writeFile } from 'node:fs/promises';
import { loadHeapBinding } from './src/native-heap.js';
const heap=loadHeapBinding(`/workspace/red-panda/.cache/heap-query-production/native/heap-query-node${process.versions.node.split('.')[0]}.node`);
const a=vm.createContext({}),b=vm.createContext({});
const run=(s,c=a)=>vm.runInContext(s,c);
run('globalThis.P={};globalThis.one=Object.create(P);globalThis.middle=Object.create(P);globalThis.two=Object.create(middle);globalThis.getters=0;Object.defineProperty(P,"__proto__",{get(){getters++;throw Error("getter")}})');
const P=run('P'),anchor=run('[]');const rows=[];
function query(prototype=P,selected=anchor,limits=[100000,2000000,4096,10000]){console.error('beforeQuery',rows.length);const result=heap.queryObjects(prototype,selected,...limits);rows.push({visited:result.visited,rawMatches:result.rawMatches,milliseconds:result.milliseconds});console.error('afterQuery',rows.length);return result.objects}
let result=query();assert.equal(result.length,3);assert.equal(Object.getPrototypeOf(result),run('Array.prototype'));assert.ok(result.includes(run('one')));result.find(x=>x===run('one')).mutated=17;assert.equal(run('one.mutated'),17);assert.equal(run('getters'),0);
run('globalThis.originalArray=Array;globalThis.setterHits=0;Object.defineProperty(Array.prototype,"0",{configurable:true,set(){setterHits++;throw Error("setter")}});globalThis.Array=new Proxy(function(){},{construct(){throw Error("ctor")}})');
run('globalThis.sideEffects=0;Object.defineProperty(originalArray.prototype,"constructor",{configurable:true,get(){sideEffects++;throw Error("constructor")}});Object.defineProperty(originalArray.prototype,Symbol.toStringTag,{configurable:true,get(){sideEffects++;throw Error("tag")}})');
result=query();assert.equal(run('sideEffects'),0);assert.equal(Object.getPrototypeOf(result),run('originalArray.prototype'));assert.equal(run('setterHits'),0);assert.equal(result.length,3);
result=query(P,run('[]',b));assert.equal(Object.getPrototypeOf(result),run('Array.prototype',b));assert.ok(result.includes(run('one')));
run('globalThis.proxyHits=0;globalThis.proxy=new Proxy(one,{getPrototypeOf(){proxyHits++;return P}});globalThis.beyond=Object.create(proxy)');result=query();assert.equal(result.includes(run('proxy')),false);assert.equal(result.includes(run('beyond')),false);result=query(run('proxy'));assert.equal(result.length,1);assert.equal(result[0],run('beyond'));assert.equal(run('proxyHits'),0);
for(const [limits,code]of [[[1,2000000,4096,10000],'ERR_HEAP_QUERY_RESULT_LIMIT'],[[100000,1,4096,10000],'ERR_HEAP_QUERY_VISIT_LIMIT'],[[100000,2000000,1,10000],'ERR_HEAP_QUERY_DEPTH_LIMIT'],[[100000,2000000,4096,1],'ERR_HEAP_QUERY_TIMEOUT']])assert.throws(()=>query(P,anchor,limits),e=>e.code===code);
result=query();assert.equal(result.length,3);assert.equal(run('setterHits'),0);const evidence={passed:true,node:process.version,queries:rows,verified:['actual identity/mutation','selected native Array realm','overwritten global Array','inherited numeric setter not called','__proto__ getter not called','Proxy cutoff and direct inheritor','explicit result/visit/depth failures then recovery']};await writeFile(`docs/reference/runtime-query-production-small-node${process.versions.node.split('.')[0]}.json`,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
