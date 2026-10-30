// Bounded native CDP observations. Each case uses a new owned browser process;
// none of the target engine implementation is imported into the candidate.
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const binary = process.argv[2] ?? '/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const fileSHA256 = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const binarySHA256 = await fileSHA256(binary);
const hostile = `({get nodeType(){__remoteHits++;throw null},get ownerDocument(){__remoteHits++;throw null},get constructor(){__remoteHits++;throw null},get name(){__remoteHits++;throw null},get message(){__remoteHits++;throw null},get stack(){__remoteHits++;throw null},get [Symbol.toStringTag](){__remoteHits++;throw null},toString(){__remoteHits++;throw null}})`;
const proxy = `new Proxy({answer:42},{get(){__remoteHits++;throw null},getPrototypeOf(){__remoteHits++;throw null},ownKeys(){__remoteHits++;throw null},getOwnPropertyDescriptor(){__remoteHits++;throw null}})`;
const values = [
 ['null','null'],['undefined','undefined'],['boolean','true'],['string',JSON.stringify('remote string')],['number','17'],['negative-zero','-0'],['nan','NaN'],['infinity','Infinity'],
 ['bigint','123n'],['symbol',`Symbol('remote')`],['object','({answer:42})'],['array','[1,2]'],['error',`new TypeError('visible')`],
 ['hostile-object',hostile],['proxy',proxy],['revoked-proxy',`(()=>{const p=Proxy.revocable({},{});p.revoke();return p.proxy})()`],
 ['hostile-error',`Object.defineProperties(new Error('visible'),Object.fromEntries(['message','name','stack','constructor'].map(key=>[key,{get(){__remoteHits++;throw null}}])))`],
 ['hostile-node',`Object.defineProperties(document.createElement('div'),Object.fromEntries(['nodeType','ownerDocument','constructor','nodeName'].map(key=>[key,{get(){__remoteHits++;throw null}}])))`],
 ['hostile-map',`Object.defineProperties(new Map([['x',1]]),{size:{get(){__remoteHits++;throw null}},constructor:{get(){__remoteHits++;throw null}}})`],
 ['callable-proxy',`new Proxy(function target(){},{get(){__remoteHits++;throw null},getPrototypeOf(){__remoteHits++;throw null}})`],
 ['function','function example(a){return a}'],['document-all','document.all'],['domexception',`new DOMException('visible','SyntaxError')`],['promise','Promise.resolve(42)'],['typed-array','new Uint8Array([1,2])'],['date','new Date(0)'],['regexp','/remote/gi'],
 ['symbol-tag',`Object.create(null,{[Symbol.toStringTag]:{get(){__remoteHits++;throw null}}})`],
 ['proxy-prototype',`Object.create(${proxy})`],
];
const selected = [];
for (const [name,value] of values) for (const method of ['Runtime.evaluate','Runtime.callFunctionOn']) {
  selected.push({name,method,operation:'return',value,byValue:false});
  if(['null','undefined','number','symbol','error','hostile-object','hostile-error'].includes(name))selected.push({name,method,operation:'throw',value,byValue:false});
}
for(const name of ['object','hostile-object','proxy','revoked-proxy','symbol']) {
 const value=values.find(row=>row[0]===name)[1];selected.push({name,method:'Runtime.evaluate',operation:'return',value,byValue:true});
}
const observations = [];
for (const test of selected) {
 let reference, client;
 const row = {name:test.name,method:test.method,operation:test.operation,returnByValue:test.byValue};
 try {
  reference=await startReference(binary);client=await connect(reference.endpoint,{timeout:2000});
  const {browserContextId}=await client.send('Target.createBrowserContext');
  const {targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId});
  const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
  await client.send('Runtime.enable',{},sessionId);
  const expression=`globalThis.__remoteHits=0; ${test.operation==='throw'?'throw ':''}(${test.value})`;
  try {
   if(test.method==='Runtime.evaluate')row.response=await client.send(test.method,{expression,returnByValue:test.byValue},sessionId);
   else {
    const receiver=await client.send('Runtime.evaluate',{expression:'({receiver:true})'},sessionId);
    row.response=await client.send(test.method,{objectId:receiver.result.objectId,functionDeclaration:`function(){globalThis.__remoteHits=0;${test.operation==='throw'?'throw':'return'} ${test.value}}`,returnByValue:test.byValue},sessionId);
   }
  }catch(error){row.protocolError={message:error.message,code:error.code??null};}
  try {
   row.getterHits=(await client.send('Runtime.evaluate',{expression:'globalThis.__remoteHits',returnByValue:true},sessionId)).result;
   row.heartbeat=(await client.send('Runtime.evaluate',{expression:'6*7',returnByValue:true},sessionId)).result;
  }catch(error){row.afterFailure={message:error.message,code:error.code??null};}
  await client.send('Target.disposeBrowserContext',{browserContextId}).catch(()=>{});
 }catch(error){row.setupFailure={message:error.message,code:error.code??null};}
 finally {
  if(client)await client.close();if(reference){await reference.close();row.ownedProcess={exitCode:reference.process.exitCode,signal:reference.process.signalCode};}
 }
 observations.push(row);
}
if(await fileSHA256(binary)!==binarySHA256)throw new Error('Selected executable changed during observation');
const result={scope:'Bounded arbitrary-value CDP observations; each case uses a new owned isolated process. Getter counts are explicit target state, not inferred from descriptions.',binary:{path:binary,sha256:binarySHA256},sourceSHA256:await fileSHA256(new URL(import.meta.url)),observations};
const json=JSON.stringify(result,null,2)+'\n';if(process.argv[3])await writeFile(process.argv[3],json,{flag:'wx'});else process.stdout.write(json);
