import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startReference} from '/workspace/red-panda/scripts/reference-server.mjs';
import {connect} from '/workspace/red-panda/test/cdp-client.js';
const binary=process.argv[2],output=process.argv[3],sha=x=>createHash('sha256').update(x).digest('hex');
const binarySHA256=sha(await readFile(binary));if(binary.includes('lightpanda')&&binarySHA256!=='9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f')throw Error('wrong Native binary');
const cases=[
 ['plain','({a:1,b:"two"})'],
 ['own-toJSON','({a:1,toJSON(){hits.push("own-toJSON");return {changed:2}}})'],
 ['nonenumerable-toJSON','Object.defineProperty({a:1},"toJSON",{value(){hits.push("hidden-toJSON");return 9}})'],
 ['inherited-toJSON','Object.assign(Object.create({toJSON(){hits.push("inherited-toJSON");return 8}}),{a:1})'],
 ['toJSON-getter','Object.defineProperty({a:1},"toJSON",{enumerable:true,get(){hits.push("toJSON-getter");return ()=>9}})'],
 ['hidden-getter','Object.defineProperty({a:1},"hidden",{get(){hits.push("hidden");return 7}})'],
 ['own-getter','Object.defineProperty({a:1},"visible",{enumerable:true,get(){hits.push("visible");return 7}})'],
 ['inherited-getter','Object.assign(Object.create({get inherited(){hits.push("inherited");return 8}}),{a:1})'],
 ['throwing-getter','Object.defineProperty({},"visible",{enumerable:true,get(){hits.push("throw");throw Error("getter-failure")}})'],
 ['symbol-key','({a:1,[Symbol("secret")]:2})'],
 ['nested-values','({u:undefined,f(){},s:Symbol("s"),n:null,a:[undefined,function(){},Symbol("s"),null]})'],
 ['nonfinite','({nan:NaN,infinity:Infinity,negative:-Infinity,zero:-0})'],
 ['bigint-property','({a:1,b:2n})'],
 ['bigint-array','[1,2n]'],
 ['sparse-array','Object.assign(Array(3),{1:"one",extra:42})'],
 ['array-accessor','Object.defineProperty([1,2],"1",{get(){hits.push("array-index");return 7}})'],
 ['array-toJSON','Object.assign([1,2],{toJSON(){hits.push("array-toJSON");return 8}})'],
 ['boxed-number','new Number(17)'],['boxed-string','new String("abc")'],['boxed-boolean','new Boolean(false)'],
 ['date','new Date("2020-01-02T03:04:05Z")'],['regexp','/ab/gi'],['map','new Map([["a",1]])'],['set','new Set([1])'],
 ['typed-array','new Uint8Array([7,8])'],['data-view','new DataView(new ArrayBuffer(3))'],['array-buffer','new ArrayBuffer(3)'],
 ['error','new TypeError("bad")'],['error-extra','Object.assign(new Error("bad"),{extra:17})'],['dom-exception','new DOMException("bad","AbortError")'],
 ['url','new URL("https://example.test/a?x=1")'],['point','typeof DOMPoint==="function"?new DOMPoint(1,2,3,4):{unavailable:"DOMPoint"}'],
 ['rect','typeof DOMRect==="function"?new DOMRect(1,2,3,4):{unavailable:"DOMRect"}'],
 ['video-color','typeof VideoColorSpace==="function"?new VideoColorSpace({matrix:"rgb"}):{unavailable:"VideoColorSpace"}'],
 ['null-prototype','Object.assign(Object.create(null),{a:1})'],
 ['proto-key','Object.defineProperty({},"__proto__",{value:{pollution:true},enumerable:true})'],
 ['enumeration-mutation','Object.defineProperty({a:1},"b",{enumerable:true,get(){hits.push("mutate");this.c=3;delete this.a;return 2}})'],
 ['proxy','new Proxy({a:1},{ownKeys(t){hits.push("ownKeys");return Reflect.ownKeys(t)},getOwnPropertyDescriptor(t,k){hits.push("descriptor:"+String(k));return Reflect.getOwnPropertyDescriptor(t,k)},get(t,k,r){hits.push("get:"+String(k));return Reflect.get(t,k,r)}})'],
 ['revoked-proxy','(()=>{const p=Proxy.revocable({},{});p.revoke();return p.proxy})()'],
 ['nested-toJSON','({nested:{a:1,toJSON(){hits.push("nested-toJSON");return 8}}})'],
 ['array-cycle','(()=>{const a=[];a.push(a);return a})()'],['object-cycle','(()=>{const a={};a.self=a;return a})()'],
];
let service,client;const observations=[];
const report=async()=>writeFile(output,JSON.stringify({binarySHA256,driverSHA256:sha(await readFile(new URL(import.meta.url))),observations},null,2)+'\n');
try{
 service=await startReference(binary);client=await connect(service.endpoint,{timeout:5000});
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'});const{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 const send=(method,params={})=>client.send(method,params,sessionId);
 for(const[label,expression]of cases){
  const record={label,expression};
  try{record.result=await send('Runtime.evaluate',{expression:`globalThis.hits=[];globalThis.value=(${expression});value`,returnByValue:true});}catch(error){record.error={code:error.code,message:error.message};}
  try{record.hits=(await send('Runtime.evaluate',{expression:'hits',returnByValue:true})).result.value;}catch(error){record.hitsError=error.message;}
  observations.push(record);await report();
 }
}finally{await client?.close();await service?.close();await report();}
