import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve } from '../src/cdp.js';
import { connect } from './cdp-client.js';

async function fixture(t) {
  const service = await serve({ port: 0 }), client = await connect(`ws://127.0.0.1:${service.port}/`);
  t.after(async () => { await client.close(); await service.close(); });
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params = {}) => client.send(method, params, sessionId);
  await send('Page.enable'); await send('Runtime.enable');
  return { send, client };
}

test('call results and property handles inherit receiver groups while explicit groups survive', async t => {
  const { send } = await fixture(t);
  const objectId = (await send('Runtime.evaluate', { expression: '({})', objectGroup: 'owner' })).result.objectId;
  const inherited = await send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function(){return {child:{n:17}}}' });
  const explicit = await send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function(){return {n:18}}', objectGroup: 'other' });
  const properties = await send('Runtime.getProperties', { objectId: inherited.result.objectId, ownProperties: true });
  const child = properties.result.find(property => property.name === 'child').value.objectId;
  const prototype = properties.internalProperties.find(property => property.name === '[[Prototype]]').value.objectId;
  await send('Runtime.releaseObjectGroup', { objectGroup: 'owner' });
  for (const handle of [objectId, inherited.result.objectId, child, prototype]) {
    await assert.rejects(send('Runtime.getProperties', { objectId: handle }), { code: -32000, message: 'Could not find object with given id' });
  }
  assert.equal((await send('Runtime.getProperties', { objectId: explicit.result.objectId })).result.find(property => property.name === 'n').value.value, 18);
  await assert.rejects(send('Runtime.getProperties', { objectId: 'invalid' }), { code: -32000, message: 'Invalid remote object id' });
});

test('caller validation rejects mixed selectors and handles from another declared world', async t => {
  const { send } = await fixture(t);
  const frameId = (await send('Page.getFrameTree')).frameTree.frame.id;
  const { executionContextId } = await send('Page.createIsolatedWorld', { frameId, worldName: 'caller-validation' });
  const isolated = await send('Runtime.evaluate', { contextId: executionContextId, expression: '({realm:"isolated"})' });
  const root = await send('Runtime.evaluate', { expression: '({realm:"root"})' });
  await assert.rejects(send('Runtime.callFunctionOn', { objectId: root.result.objectId, functionDeclaration: 'function(value){return value.realm}', arguments: [{ objectId: isolated.result.objectId }], returnByValue: true }),
    { code: -32000, message: 'Argument should belong to the same JavaScript world as target object' });
  await assert.rejects(send('Runtime.callFunctionOn', { objectId: root.result.objectId, executionContextId, functionDeclaration: 'function(){return this.realm}' }),
    { code: -32602, message: 'ObjectId, executionContextId and uniqueContextId must mutually exclude each other' });
  const same = await send('Runtime.callFunctionOn', { objectId: isolated.result.objectId, functionDeclaration: 'function(value){return this===value}', arguments: [{ objectId: isolated.result.objectId }], returnByValue: true });
  assert.equal(same.result.value, true);
});

test('by-value caller arguments use captured real realm intrinsics and preserve JSON data properties', async t => {
  const { send } = await fixture(t);
  await send('Runtime.evaluate', { expression: 'JSON.parse=()=>{throw new Error("authored parser")}' });
  const value = JSON.parse('{"__proto__":{"marker":42},"array":[1,2]}');
  const result = await send('Runtime.callFunctionOn', { functionDeclaration: 'function(value){return [value instanceof Object,value.array instanceof Array,Object.hasOwn(value,"__proto__"),value.__proto__.marker,Object.getPrototypeOf(value)===Object.prototype]}', arguments: [{ value }], returnByValue: true });
  assert.deepEqual(result.result.value, [true, true, true, 42, true]);
});
