import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {serve} from '../src/cdp.js';
import {connect} from './cdp-client.js';

async function setup(t){
 const service=await serve({port:0}),client=await connect(`ws://127.0.0.1:${service.port}`);
 t.after(async()=>{await client.close();await service.close()});
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 return{client,sessionId,send:(method,params={})=>client.send(method,params,sessionId)};
}

test('only exact known lifecycle methods route and genuine disabled domains can disable idempotently',async t=>{
 const{send}=await setup(t);
 for(const domain of['NotAnActualDomain','DOM']){
  await assert.rejects(send(domain+'.nested.enable'),error=>error.code===-32601);
  await assert.rejects(send(domain+'.nested.disable'),error=>error.code===-32601);
 }
 for(const domain of['Network','Runtime','Log','Performance','Audits','Page']){
  assert.deepEqual(await send(domain+'.disable'),{});
  await assert.rejects(send(domain+'.notARealMethod.enable'),error=>error.code===-32601);
  assert.deepEqual(await send(domain+'.enable'),{});
  await assert.rejects(send(domain+'.notARealMethod.disable'),error=>error.code===-32601);
  assert.deepEqual(await send(domain+'.disable'),{});assert.deepEqual(await send(domain+'.disable'),{});
 }
 // DOM keeps its substantive reset/observer owner, rather than entering the
 // generic acknowledgement branch. Page.disable remains an explicit Root
 // extension; it is not advertised as a Native Page action.
 assert.deepEqual(await send('DOM.enable'),{});assert.ok((await send('DOM.getDocument')).root);assert.deepEqual(await send('DOM.disable'),{});
});

test('unknown enable/disable suffixes never change real Network event delivery',async t=>{
 const{client,sessionId,send}=await setup(t),requests=[];
 const fixture=http.createServer((req,res)=>{requests.push(req.url);res.setHeader('content-type','text/html');res.end('<!doctype html><title>actual dispatch control</title>')});
 fixture.listen(0,'127.0.0.1');await once(fixture,'listening');t.after(async()=>{fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve))});
 const origin=`http://127.0.0.1:${fixture.address().port}`;
 await send('Page.enable');await send('Runtime.enable');
 const navigate=async path=>{await send('Page.navigate',{url:origin+path});const deadline=Date.now()+2000;while(Date.now()<deadline){const value=await send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});if(value.result.value==='complete')return;await new Promise(resolve=>setTimeout(resolve,5))}throw Error('actual load completion not observed within2s')};
 const observed=path=>client.events.filter(event=>event.sessionId===sessionId&&event.method==='Network.requestWillBeSent'&&event.params.request.url===origin+path).length;
 await send('Network.disable');await assert.rejects(send('Network.notARealMethod.enable'),error=>error.code===-32601);await navigate('/disabled');assert.equal(observed('/disabled'),0);
 await send('Network.enable');await assert.rejects(send('Network.notARealMethod.disable'),error=>error.code===-32601);await navigate('/enabled');assert.equal(observed('/enabled'),1);
 await send('Network.disable');await navigate('/disabled-again');assert.equal(observed('/disabled-again'),0);
 assert.deepEqual(requests,['/disabled','/enabled','/disabled-again']);
});
