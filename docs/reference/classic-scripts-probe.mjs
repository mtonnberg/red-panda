import http from 'node:http';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';

const [binary, snapshot, fixturesRoot, output, adapter] = process.argv.slice(2);
if (!binary || !snapshot || !fixturesRoot) throw new Error('Supply native binary, frozen independent source root, fixture root, optional output and adapter path');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const binarySHA256 = hash(await readFile(binary));
if (binarySHA256 !== '9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f') throw new Error('Unexpected native binary digest');
const { Browser } = await import(pathToFileURL(path.resolve(snapshot, 'src/browser.js')).href);
if (adapter) {
  const { installClassicScripts } = await import(pathToFileURL(path.resolve(adapter)).href);
  // Test-only integration around the frozen runtime; no baseline file is edited.
  const prototype = (await import(pathToFileURL(path.resolve(snapshot, 'src/browser.js')).href)).Page.prototype;
  const prepare = prototype.prepareWindow;
  prototype.prepareWindow = function (window, ...args) { prepare.call(this, window, ...args); installClassicScripts(this, window); };
}
const server = http.createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url, 'http://fixture.test').pathname).replace(/^\/+/, '');
    const filename = path.resolve(fixturesRoot, name);
    if (!filename.startsWith(path.resolve(fixturesRoot) + path.sep)) throw new Error('Outside fixture root');
    const bytes = await readFile(filename);
    response.writeHead(200, { 'content-type': filename.endsWith('.js') ? 'text/javascript' : 'text/html' }); response.end(bytes);
  } catch { response.writeHead(404); response.end('missing fixture'); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const reference = await startReference(binary), browser = new Browser({ timeout: 3000 });
let client;
const observations = { kind: 'bounded-unchanged-classic-fixture-comparison', binarySHA256, snapshot,
  adapter: adapter ?? null, adapterSourceSHA256: adapter ? hash(await readFile(path.resolve(adapter))) : null, settleDelayMs: 100,
  browserSourceSHA256: hash(await readFile(path.resolve(snapshot, 'src/browser.js'))),
  modulesSourceSHA256: hash(await readFile(path.resolve(snapshot, 'src/modules.js'))), fixtures: [] };
const expression = `(()=>{if(document.readyState!=='complete')return {pending:true};try{return {passed:window.testing?.assertOk()===true};}catch(error){return {failed:true,message:error.message};}})()`;
async function settle(evaluate) {
  const deadline = Date.now() + 2500;
  // Allow already-queued mutation/promise/timer tasks to run before invoking
  // harness onload callbacks; Page.navigate on native returns at commit.
  await new Promise(resolve => setTimeout(resolve, 100));
  while (Date.now() < deadline) {
    const value = await evaluate(expression);
    if (value?.passed || value?.failed) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return { timeout: true };
}
try {
  client = await connect(reference.endpoint);
  for (const fixture of ['async_text.html', 'clone_already_started.html', 'dynamic_inline.html', 'load_event.html', 'load_event_timer.html', 'preload.html']) {
    const url = `${origin}/element/html/script/${fixture}`;
    const entry = { fixture, sourceSHA256: hash(await readFile(path.resolve(fixturesRoot, 'element/html/script', fixture))) };
    const page = browser.createPage(), errors = [], consoleErrors = [];
    page.on('pageError', error => errors.push(error.message));
    page.on('console', event => { if (event.type === 'error') consoleErrors.push(event.args.map(String).join(' ')); });
    page.newDocumentScripts.set('probe', { source: 'window.__lp_external_runner = true;' });
    try { await page.navigate(url); entry.independent = { ...await settle(source => page.evaluate(source)), errors, consoleErrors }; }
    catch (error) { entry.independent = { error: error.message, errors }; }
    finally { page.close(); }
    let browserContextId;
    try {
      ({ browserContextId } = await client.send('Target.createBrowserContext'));
      const { targetId } = await client.send('Target.createTarget', { browserContextId, url: 'about:blank' });
      const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params = {}) => client.send(method, params, sessionId);
      await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__lp_external_runner = true;' });
      await send('Page.navigate', { url });
      entry.native = await settle(async source => {
        const value = await send('Runtime.evaluate', { expression: source, returnByValue: true, awaitPromise: true });
        if (value.exceptionDetails) return { failed: true, exception: value.exceptionDetails.text };
        return value.result.value;
      });
    } catch (error) { entry.native = { error: error.message }; }
    finally { if (browserContextId) await client.send('Target.disposeBrowserContext', { browserContextId }); }
    observations.fixtures.push(entry);
  }
} finally {
  browser.close();
  try { if (client) await client.close(); } finally { await reference.close(); await new Promise(resolve => server.close(resolve)); }
}
observations.cleanup = 'owned browser, contexts, sockets, independent pages and port0 fixture server closed';
const json = JSON.stringify(observations, null, 2) + '\n';
if (output) await writeFile(output, json);
process.stdout.write(json);
