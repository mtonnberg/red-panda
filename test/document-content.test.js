import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { serve } from '../src/cdp.js';
import { until } from '../src/browser.js';
import { connect } from './cdp-client.js';

test('setDocumentContent forwards one genuine DCL/load only after actual external resources execute', async t => {
  let held;
  const fixture = http.createServer((request, response) => {
    if (request.url === '/held.js') { held = response; return; }
    response.setHeader('content-type', 'text/html'); response.end('<!doctype html><body><p>initial</p>');
  });
  fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
  const service = await serve({ port: 0 }), client = await connect(`ws://127.0.0.1:${service.port}/`);
  t.after(async () => { held?.end(); await client.close(); await service.close(); fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve)); });
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params = {}) => client.send(method, params, sessionId);
  await send('Page.enable'); await send('Runtime.enable'); await send('Page.setLifecycleEventsEnabled', { enabled: true });
  await send('Page.navigate', { url: `http://127.0.0.1:${fixture.address().port}/` });
  const frameId = (await send('Page.getFrameTree')).frameTree.frame.id;
  const start = client.events.length;
  await send('Page.setDocumentContent', { frameId, html: '<script src="/held.js"></script><p id="fresh">fresh</p>' });
  await until(() => held !== undefined);
  const lifecycle = () => client.events.slice(start).filter(event => event.method === 'Page.lifecycleEvent').map(event => event.params.name);
  assert.deepEqual(lifecycle().filter(name => name === 'DOMContentLoaded' || name === 'load'), []);
  held.setHeader('content-type', 'text/javascript'); held.end('window.heldRan=42;');
  await until(() => lifecycle().includes('load'));
  assert.deepEqual(lifecycle().filter(name => name === 'DOMContentLoaded' || name === 'load'), ['DOMContentLoaded', 'load']);
  assert.equal((await send('Runtime.evaluate', { expression: 'heldRan', returnByValue: true })).result.value, 42);
  await assert.rejects(send('Page.setDocumentContent', { frameId: 'missing', html: '<p>wrong</p>' }), /No frame/);
});
