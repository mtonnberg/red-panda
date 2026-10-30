import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve } from '../src/cdp.js';
import { connect } from './cdp-client.js';

async function fixture(t) {
  const service = await serve({ port: 0, loadResources: ['iframe'] });
  const client = await connect(`ws://127.0.0.1:${service.port}/`);
  t.after(async () => { await client.close(); await service.close(); });
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params = {}) => client.send(method, params, sessionId);
  const evaluate = (expression, options = {}) => send('Runtime.evaluate', { expression, ...options });
  return { send, evaluate };
}

test('CDP retains hostile values without reading getters and survives by-value serialization failures', async t => {
  const { send, evaluate } = await fixture(t);
  const source = `globalThis.getterHits=0;globalThis.hostile={};
    for(const name of ['nodeType','ownerDocument','nodeName','constructor','name','message','stack','code',Symbol.toStringTag,Symbol.toPrimitive])
      Object.defineProperty(hostile,name,{get(){getterHits++;throw null}});
    Object.defineProperty(hostile,'visible',{enumerable:true,get(){getterHits++;throw null}});hostile`;
  const returned = await evaluate(source, { objectGroup: 'adversarial' });
  assert.equal(returned.result.type, 'object'); assert.equal(returned.result.subtype, undefined); assert.equal(returned.result.className, 'Object');
  assert.equal((await evaluate('getterHits', { returnByValue: true })).result.value, 0);
  const thrown = await evaluate('throw hostile', { objectGroup: 'adversarial' });
  assert.equal(thrown.exceptionDetails.text, 'Uncaught'); assert.equal(thrown.result.type, 'object');
  assert.notEqual(thrown.result.objectId, thrown.exceptionDetails.exception.objectId);
  for (const objectId of [returned.result.objectId, thrown.result.objectId, thrown.exceptionDetails.exception.objectId]) {
    const identity = await send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function(){return this===globalThis.hostile}', returnByValue: true });
    assert.equal(identity.result.value, true);
  }
  assert.equal((await evaluate('getterHits', { returnByValue: true })).result.value, 0);
  await assert.rejects(evaluate('hostile', { returnByValue: true }), error => error.code === -32603 && error.message === 'Internal error');
  assert.equal((await evaluate('getterHits', { returnByValue: true })).result.value, 1);
  assert.equal((await evaluate('6*7', { returnByValue: true })).result.value, 42);
  await send('Runtime.releaseObjectGroup', { objectGroup: 'adversarial' });
  await assert.rejects(send('Runtime.getProperties', { objectId: thrown.result.objectId }), /Could not find object/);
});

test('CDP exception details retain original primitives, Symbols and rejected promises', async t => {
  const { send, evaluate } = await fixture(t);
  for (const [expression, type, subtype, value] of [['null', 'object', 'null', null], ['undefined', 'undefined'], ['17', 'number', undefined, 17]]) {
    const failure = await evaluate(`throw ${expression}`);
    assert.equal(failure.result.type, type); assert.equal(failure.result.subtype, subtype);
    assert.equal(failure.result.value, value); assert.equal(failure.exceptionDetails.text, 'Uncaught');
    assert.deepEqual(failure.exceptionDetails.exception, failure.result);
  }
  const symbol = await evaluate('globalThis.keptSymbol=Symbol("own");throw keptSymbol', { objectGroup: 'symbols' });
  assert.equal(symbol.result.type, 'symbol'); assert.equal(symbol.exceptionDetails.exception.type, 'symbol');
  assert.equal(symbol.result.description, 'Symbol(own)'); assert.equal(typeof symbol.result.objectId, 'string');
  assert.notEqual(symbol.result.objectId, symbol.exceptionDetails.exception.objectId);
  const identity = await send('Runtime.callFunctionOn', { objectId: symbol.result.objectId,
    functionDeclaration: 'function(){return this.valueOf()===globalThis.keptSymbol}', returnByValue: true });
  assert.equal(identity.result.value, true);
  await assert.rejects(evaluate('keptSymbol', { returnByValue: true }), error => error.code === -32000);
  const promise = await evaluate('new Promise((_,reject)=>globalThis.rejectLater=reject)');
  const pending = send('Runtime.awaitPromise', { promiseObjectId: promise.result.objectId, returnByValue: true });
  await evaluate('rejectLater(null)');
  const rejected = await pending;
  assert.deepEqual(rejected.result, { type: 'object', subtype: 'null', value: null });
  assert.deepEqual(rejected.exceptionDetails.exception, rejected.result);
});

test('CDP classifies genuine DOM nodes and proxies without invoking authored metadata getters or traps', async t => {
  const { send, evaluate } = await fixture(t);
  const node = await evaluate(`globalThis.getterHits=0;globalThis.node=document.createElement('div');
    for(const name of ['nodeType','ownerDocument','constructor','nodeName'])Object.defineProperty(node,name,{get(){getterHits++;throw null}});node`);
  assert.equal(node.result.subtype, 'node'); assert.equal(node.result.className, 'HTMLDivElement'); assert.equal(node.result.description, '');
  const ordinary = await evaluate(`globalThis.traps=0;globalThis.proxy=new Proxy({value:1},{get(){traps++;throw null},getPrototypeOf(){traps++;throw null},ownKeys(){traps++;throw null}});proxy`);
  assert.equal(ordinary.result.subtype, 'proxy'); assert.equal(ordinary.result.className, 'Object');
  const revoked = await evaluate('globalThis.revocable=Proxy.revocable({},{});revocable.revoke();revocable.proxy');
  assert.equal(revoked.result.subtype, 'proxy');
  assert.equal((await evaluate('getterHits+traps', { returnByValue: true })).result.value, 0);
  await assert.rejects(evaluate('revocable.proxy', { returnByValue: true }), error => error.code === -32603);
  assert.equal((await evaluate('42', { returnByValue: true })).result.value, 42);
  const group = await evaluate('({child:{marker:42}})', { objectGroup: 'properties' });
  const properties = await send('Runtime.getProperties', { objectId: group.result.objectId });
  const child = properties.result.find(property => property.name === 'child').value;
  await send('Runtime.releaseObjectGroup', { objectGroup: 'properties' });
  await assert.rejects(send('Runtime.getProperties', { objectId: child.objectId }), /Could not find object/);
});
