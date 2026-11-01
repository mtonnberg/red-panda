import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serve} from '../src/cdp.js';
import {connect} from './semantic-client.js';
async function fixture(t){
 const service=await serve({port:0}),client=await connect('ws://127.0.0.1:'+service.port+'/'),cleanup=[];
 const required=async(method,params={},sid)=>{const response=await client.send(method,params,sid);assert.equal(response.error,undefined,JSON.stringify(response));return response.result;};
 const {targetId}=await required('Target.createTarget',{url:'about:blank'}),{sessionId}=await required('Target.attachToTarget',{targetId,flatten:true});
 const send=(method,params={})=>required(method,params,sessionId),evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,timeout:200});assert.equal(result.exceptionDetails,undefined,JSON.stringify(result));return result.result.value;};
 t.after(async()=>{try{for(const operation of cleanup.reverse())await operation();}finally{await client.close();await service.close();}});
 await send('Runtime.enable');await send('Page.navigate',{url:'data:text/html,'+encodeURIComponent('<!doctype html><title>Actual private observers</title><body><main id="parent"><button id="held">Actual text</button></main>')});
 const root=(await send('DOM.getDocument',{depth:-1})).root.nodeId,nodeId=(await send('DOM.querySelector',{nodeId:root,selector:'#held'})).nodeId;
 await evaluate('globalThis.heldButton=document.getElementById("held");heldButton.remove();true');
 cleanup.push(()=>evaluate('(()=>{for(const key of ["localName","tagName","ownerDocument","textContent","getAttribute"])delete heldButton[key];return true})()'));
 return{send,evaluate,client,nodeId};
}
const poison='globalThis.observerReads=0;for(const key of ["localName","tagName","ownerDocument","textContent"])Object.defineProperty(heldButton,key,{configurable:true,get(){observerReads++;throw Error("Actual authored observer getter: "+key)}});Object.defineProperty(heldButton,"getAttribute",{configurable:true,value(){observerReads++;throw Error("Actual authored observer getAttribute")}});';
test('enabled DOM notifications preserve real insertion and attribute data without authored metadata reads',{timeout:6000},async t=>{
 const f=await fixture(t),index=f.client.events.length;
 await f.evaluate('(()=>{document.getElementById("parent").append(heldButton);'+poison+'return true})()');
 assert.equal(await f.evaluate('observerReads'),0);
 const insertion=f.client.events.slice(index).find(event=>event.method==='DOM.childNodeInserted'&&event.params.node.nodeId===f.nodeId);assert.ok(insertion,'actual insertion notification');
 assert.equal(insertion.params.node.localName,'button');assert.equal(insertion.params.node.nodeName,'BUTTON');assert.deepEqual(insertion.params.node.attributes,['id','held']);assert.equal(insertion.params.node.childNodeCount,1);
 await f.evaluate('heldButton.setAttribute("data-live","actual");true');
 const attribute=f.client.events.slice(index).find(event=>event.method==='DOM.attributeModified'&&event.params.nodeId===f.nodeId&&event.params.name==='data-live');assert.ok(attribute,'actual attribute notification');assert.equal(attribute.params.value,'actual');
 assert.equal(await f.evaluate('observerReads'),0);assert.deepEqual(f.client.events.slice(index).filter(event=>event.method==='Runtime.exceptionThrown'),[]);
});
test('real module discovery still evaluates an inserted nested module beside a poisoned ordinary node',{timeout:6000},async t=>{
 const f=await fixture(t),index=f.client.events.length;
 await f.evaluate('(()=>{const container=document.createElement("section"),script=document.createElement("script");script.type="module";script.textContent="globalThis.actualModuleExecutions=(globalThis.actualModuleExecutions??0)+1;export const actual=42;globalThis.actualModuleValue=actual";container.append(script);document.body.append(heldButton,container);'+poison+'return true})()');
 const began=Date.now();let result;while(Date.now()-began<2500){result=await f.evaluate('({count:globalThis.actualModuleExecutions,value:globalThis.actualModuleValue})');if(result.count===1&&result.value===42)break;await new Promise(resolve=>setTimeout(resolve,2));}
 assert.deepEqual(result,{count:1,value:42});assert.equal(await f.evaluate('observerReads'),0);assert.deepEqual(f.client.events.slice(index).filter(event=>event.method==='Runtime.exceptionThrown'),[]);
});
