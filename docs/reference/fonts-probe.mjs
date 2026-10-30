import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';
import { until } from '../../src/browser.js';

const [binary, output] = process.argv.slice(2);
const sha256 = createHash('sha256').update(await readFile(binary)).digest('hex');
if (sha256 !== '9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f') throw new Error('Reference binary digest mismatch');
const browser = await startReference(binary, { args: ['--load-resources', 'worker'] });
let client, context;
const result = { kind: 'local-native-CDP-observation', referenceSHA256: sha256, arguments: ['--load-resources', 'worker'], probes: [] };
try {
  client = await connect(browser.endpoint);
  ({ browserContextId: context } = await client.send('Target.createBrowserContext'));
  const { targetId } = await client.send('Target.createTarget', { browserContextId: context, url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => client.send(method, params, sessionId);
  await send('Network.enable');
  await send('Page.navigate', { url: 'data:text/html,<!doctype html><p>fonts</p>' });
  await until(async () => (await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true })).result.value === 'complete');
  const probes = {
    descriptors: `(()=>{const keys=['family','style','weight','stretch','unicodeRange','variant','featureSettings','variationSettings','display','ascentOverride','descentOverride','lineGapOverride','status'];const f=new FontFace('F','url(http://127.0.0.1:9/missing.woff)');const custom=new FontFace('Custom','not valid source',{style:'oblique',weight:'700',stretch:'expanded',unicodeRange:'U+0-FF',variant:'small-caps',featureSettings:'"kern" 1',variationSettings:'"wght" 700',display:'swap',ascentOverride:'10%',descentOverride:'20%',lineGapOverride:'30%'});return{defaults:Object.fromEntries(keys.map(k=>[k,f[k]])),custom:Object.fromEntries(keys.map(k=>[k,custom[k]])),faceTag:Object.prototype.toString.call(f),setTag:Object.prototype.toString.call(document.fonts),eventTarget:document.fonts instanceof EventTarget,readySame:document.fonts.ready===document.fonts.ready,loadedSame:f.loaded===f.loaded,loadSame:f.load()===f.loaded};})()`,
    promises: `(async()=>{const f=new FontFace('F','invalid'),s=document.fonts;const events=[];for(const type of ['loading','loadingdone','loadingerror'])s.addEventListener(type,e=>events.push({type:e.type,status:s.status,constructor:e.constructor.name,faces:e.fontfaces?.length,trusted:e.isTrusted}));let readyValue;await s.ready.then(v=>readyValue=v===s);s.add(f);const p=s.load('16px F');events.push({label:'after-load',status:s.status});let value;try{value=await p;}catch(e){value={error:e.name,message:e.message};}events.push({label:'resolved',status:s.status});return{readyValue,readyUndefined:await s.ready===undefined,loadedUndefined:await f.loaded===undefined,loadUndefined:await f.load()===undefined,loadedValue:await f.loaded===f,loadValue:await f.load()===f,setLoadValue:Array.isArray(value)?value.map(v=>v===f):value,events};})()`,
    membership: `(()=>{const a=new FontFace('A','url(a)'),b=new FontFace('B','url(b)'),s=new FontFaceSet([a,b,a]);const results={initial:s.size,add:s.add(a)===s,has:s.has(a),hasOther:s.has(new FontFace('A','url(a)')),values:[...s].map(f=>f.family),entries:[...s.entries()].map(([a,b])=>[a.family,b.family])};const each=[];s.forEach((a,b,c)=>each.push([a.family,b===a,c===s]));results.each=each;results.deleted=s.delete(a);results.deletedAgain=s.delete(a);results.afterDelete=s.size;results.clear=s.clear();results.afterClear=s.size;return results;})()`,
    errors: `(async()=>{const rows=[];for(const [name,fn] of [['FontFace missing',()=>new FontFace()],['FontFace bad descriptor',()=>new FontFace('F','bad',{style:'invalid'})],['FontFace binary',()=>new FontFace('F',new Uint8Array([1,2]).buffer)],['FontFaceSet missing',()=>new FontFaceSet()],['FontFaceSet bad',()=>new FontFaceSet([{}])],['add bad',()=>document.fonts.add({})],['has bad',()=>document.fonts.has({})],['delete bad',()=>document.fonts.delete({})],['check invalid',()=>document.fonts.check('invalid')],['load invalid',()=>document.fonts.load('invalid')],['check missing',()=>document.fonts.check()],['load missing',()=>document.fonts.load()],['face brand',()=>Object.getOwnPropertyDescriptor(FontFace.prototype,'family').get.call({})],['set brand',()=>FontFaceSet.prototype.check.call({},'16px F')]]){try{const value=await fn();rows.push({name,ok:true,type:typeof value,status:value?.status,array:Array.isArray(value),value:typeof value==='boolean'?value:undefined});}catch(e){rows.push({name,error:e.name,message:e.message});}}return rows;})()`,
    setters: `(()=>{const f=new FontFace('Before','invalid');const rows=[];for(const k of ['family','style','weight','stretch','unicodeRange','variant','featureSettings','variationSettings','display','ascentOverride','descentOverride','lineGapOverride','status']){try{f[k]='invalid';rows.push({key:k,value:f[k]});}catch(e){rows.push({key:k,error:e.name,message:e.message});}}return rows;})()`,
    collection: `(()=>{const a=new FontFace('A','url(a)'),b=new FontFace('B','url(b)'),s=document.fonts;const result={before:s.size,names:Object.getOwnPropertyNames(FontFaceSet.prototype),faceNames:Object.getOwnPropertyNames(FontFace.prototype),eventProperties:['onloading','onloadingdone','onloadingerror'].map(k=>[k,typeof s[k]]),iterator:typeof s[Symbol.iterator]};result.add=s.add(a)===s;result.afterA=s.size;s.add(b);s.add(a);result.afterDuplicates=s.size;result.checkUnknown=s.check('16px Unknown');result.documentDescriptor=Object.getOwnPropertyDescriptor(Document.prototype,'fonts');result.loadedDescriptor=Object.getOwnPropertyDescriptor(FontFace.prototype,'loaded');return result;})()`,
    arguments: `(()=>{const rows=[];for(const [name,fn] of [['onearg',()=>new FontFace('A')],['numberfamily',()=>new FontFace(12,'x').family],['nullsource',()=>new FontFace('A',null).status],['badsourceobject',()=>new FontFace('A',{}).status],['descriptor-getter',()=>new FontFace('A','x',{get style(){throw Error('read descriptor');}}).status],['source-getter',()=>new FontFace('A',{toString(){throw Error('read source');}}).status],['add missing',()=>document.fonts.add()],['check number',()=>document.fonts.check(12)],['check null',()=>document.fonts.check(null)],['check symbol',()=>document.fonts.check(Symbol())],['check brand missing',()=>FontFaceSet.prototype.check.call({})]]){try{rows.push({name,value:fn()});}catch(e){rows.push({name,error:e.name,message:e.message});}}return rows;})()`,
    workerData: `new Promise(resolve=>{const u='data:application/javascript,'+encodeURIComponent("postMessage({FontFace:typeof FontFace,FontFaceSet:typeof FontFaceSet,fonts:typeof fonts,globalFonts:typeof self.fonts});"),w=new Worker(u);const t=setTimeout(()=>{w.terminate();resolve({timeout:true});},300);w.onmessage=e=>{clearTimeout(t);w.terminate();resolve(e.data);};w.onerror=e=>{clearTimeout(t);w.terminate();resolve({error:e.message});};})`,
    worker: `new Promise(resolve=>{const b=new Blob(["postMessage({FontFace:typeof FontFace,FontFaceSet:typeof FontFaceSet,fonts:typeof fonts,globalFonts:typeof self.fonts});"],{type:'text/javascript'}),u=URL.createObjectURL(b),w=new Worker(u);const t=setTimeout(()=>{w.terminate();URL.revokeObjectURL(u);resolve({timeout:true});},300);w.onmessage=e=>{clearTimeout(t);w.terminate();URL.revokeObjectURL(u);resolve(e.data);};w.onerror=e=>{clearTimeout(t);w.terminate();URL.revokeObjectURL(u);resolve({error:e.message});};})`,
  };
  for (const [name, expression] of Object.entries(probes)) {
    try { result.probes.push({ name, response: await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }) }); }
    catch (error) { result.probes.push({ name, error: { code: error.code, message: error.message } }); }
  }
  result.fontRequests = client.events.filter(event => event.method === 'Network.requestWillBeSent' && event.params.request.url.includes('missing.woff'));
} finally {
  try { if (context && client) await client.send('Target.disposeBrowserContext', { browserContextId: context }); }
  finally { try { if (client) await client.close(); } finally { await browser.close(); } }
}
result.cleanup = 'context, socket and owned reference process closed';
const serialized = JSON.stringify(result, null, 2) + '\n';
if (output) await writeFile(output, serialized);
process.stdout.write(serialized);
