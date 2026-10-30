// Run only after the coordinator releases runtime diagnostics. Candidate paths
// must point at an isolated source/native copy, never an experimental live edit.
import http from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';
import { parserResetCases } from './inactive-view-cases.mjs';

const [mode, executableOrSnapshot, output] = process.argv.slice(2);
if (!['native', 'candidate'].includes(mode) || !executableOrSnapshot) throw new Error('Supply native binary or candidate snapshot, plus optional output');
const hash = value => createHash('sha256').update(value).digest('hex');
let current, reference, client, browser;
const requests = [], timers = new Set();
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://fixture.test').pathname;
  const observation = { pathname, closedBeforeBody: false }; requests.push(observation);
  response.on('close', () => { observation.closedBeforeBody = !response.writableEnded; });
  if (pathname === '/case.html') { response.writeHead(200, { 'content-type': 'text/html' }); response.end(current.html); return; }
  const route = current.routes[pathname];
  if (!route) { response.writeHead(404); response.end('missing'); return; }
  const send = () => { if (response.destroyed) return; response.writeHead(200, { 'content-type': route.type ?? 'text/javascript' }); response.end(route.body); };
  if (route.delay) {
    const timer = setTimeout(() => { timers.delete(timer); send(); }, route.delay); timers.add(timer);
  } else send();
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const report = { kind: 'bounded-public-parser-reset-observations', mode, navigationTimeoutMs: 5000, cases: [] };
const expression = `JSON.stringify(window.probeResult??null)`;
async function settle(evaluate) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const text = await evaluate(expression);
    if (typeof text === 'string' && text !== 'null') return JSON.parse(text);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return { timeout: true };
}
try {
  if (mode === 'native') {
    report.binarySHA256 = hash(await readFile(executableOrSnapshot));
    if (report.binarySHA256 !== '9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f') throw new Error('Unexpected native executable');
    report.nativeArguments=['--load-resources','iframe','--load-resources','worker']; reference = await startReference(executableOrSnapshot,{args:report.nativeArguments}); client = await connect(reference.endpoint);
  } else {
    report.snapshot = path.resolve(executableOrSnapshot);
    const { Browser } = await import(pathToFileURL(path.join(report.snapshot, 'src/browser.js')).href);
    browser = new Browser({ timeout: 5000 });
    report.classicSHA256 = hash(await readFile(path.join(report.snapshot, 'src/classic-scripts.js')));
  }
  for (const test of parserResetCases) {
    current = test; requests.length = 0;
    const entry = { name: test.name, htmlSHA256: hash(test.html), scripts: Object.fromEntries(Object.entries(test.routes).map(([name, route]) => [name, hash(route.body)])) };
    if (mode === 'native') {
      let browserContextId;
      try {
        ({ browserContextId } = await client.send('Target.createBrowserContext'));
        const { targetId } = await client.send('Target.createTarget', { browserContextId, url: 'about:blank' });
        const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
        const send = (method, params = {}) => client.send(method, params, sessionId);
        await send('Page.navigate', { url: `${origin}/case.html` });
        entry.observed = await settle(async source => {
          const result = await send('Runtime.evaluate', { expression: source, returnByValue: true });
          if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
          return result.result.value;
        });
      } catch (error) { entry.error = error.message; }
      finally { if (browserContextId) await client.send('Target.disposeBrowserContext', { browserContextId }); }
    } else {
      const page = browser.createPage(), errors = [];
      page.on('pageError', error => errors.push(error.message));
      try {
        try { await page.navigate(`${origin}/case.html`); } catch (error) { entry.navigationError = error.message; }
        entry.observed = await settle(source => page.evaluate(source)); entry.errors = errors;
      } catch (error) { entry.error = error.message; }
      finally { page.close(); }
    }
    entry.requests = structuredClone(requests); report.cases.push(entry);
    process.stdout.write(`${entry.name}: ${JSON.stringify(entry.observed ?? { error: entry.error })}\n`);
  }
} finally {
  browser?.close();
  try { if (client) await client.close(); } finally { if (reference) await reference.close(); }
  for (const timer of timers) clearTimeout(timer);
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
report.cleanup = 'owned pages, contexts, browser connection/process and port0 server closed; delayed response timers cancelled';
if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
