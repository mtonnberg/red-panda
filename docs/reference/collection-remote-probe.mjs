import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';
import { until } from '../../src/browser.js';

const [binary, output] = process.argv.slice(2);
if (!binary) throw new Error('Supply the verified native reference binary');
const referenceSHA256 = createHash('sha256').update(await readFile(binary)).digest('hex');
if (referenceSHA256 !== '9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f') throw new Error('Reference binary digest mismatch');
const browser = await startReference(binary);
let client, browserContextId;
const capture = { kind: 'local-native-CDP-observation', referenceSHA256, observations: [] };
try {
  client = await connect(browser.endpoint);
  capture.version = await client.send('Browser.getVersion');
  ({ browserContextId } = await client.send('Target.createBrowserContext'));
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params = {}) => client.send(method, params, sessionId);
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'data:text/html,<!doctype html><div id="entry">Collection</div>' });
  await until(async () => (await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true })).result.value === 'complete');
  for (const expression of ['document.all', 'Object.prototype.toString.call(document.all)', 'JSON.stringify(document.all)']) {
    for (const returnByValue of [false, true]) {
      const params = { expression, returnByValue };
      capture.observations.push({ method: 'Runtime.evaluate', params, result: await send('Runtime.evaluate', params) });
    }
  }
  capture.cleanup = { contextDisposed: false, clientClosed: false, browserStopped: false };
} finally {
  if (browserContextId && client) {
    await client.send('Target.disposeBrowserContext', { browserContextId });
    if (capture.cleanup) capture.cleanup.contextDisposed = true;
  }
  if (client) { await client.close(); if (capture.cleanup) capture.cleanup.clientClosed = true; }
  await browser.close(); if (capture.cleanup) capture.cleanup.browserStopped = true;
}
const text = JSON.stringify(capture, null, 2) + '\n';
if (output) await writeFile(output, text);
process.stdout.write(text);
