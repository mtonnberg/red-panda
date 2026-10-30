// Raw-CDP control for an externally held parser blocker. A host safety release
// bounds engines that cannot service Runtime.evaluate while parsing is blocked;
// that path is recorded as inconclusive rather than as successful cancellation.
import http from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';

const [mode, executableOrSnapshot, output] = process.argv.slice(2);
if (!['native', 'candidate'].includes(mode) || !executableOrSnapshot) throw new Error('Supply native binary or isolated candidate source root, then optional output');
const hash = value => createHash('sha256').update(value).digest('hex');
const html = '<!doctype html><script>window.oldScriptRan=false;window.savedDocument=document;window.savedWindow=window;window.savedArray=Array;</script><script src="/held.js"></script><p id="stale">stale</p>';
const heldSource = 'window.oldScriptRan=true;';
const resetExpression = `(()=>{
  const before={state:document.readyState,oldScriptRan,stale:!!document.getElementById('stale')};
  const original=document,returned=document.open();
  const afterOpen={state:document.readyState,same:returned===original,empty:document.documentElement===null};
  document.write('<p id="fresh">fresh</p>');document.close();
  return {before,afterOpen,sameDocument:document===original,sameWindow:window===savedWindow,sameArray:Array===savedArray,fresh:!!document.getElementById('fresh')};
})()`;
const finalExpression = `({state:document.readyState,sameDocument:document===savedDocument,sameWindow:window===savedWindow,sameArray:Array===savedArray,oldScriptRan,
  fresh:!!document.getElementById('fresh'),stale:!!document.getElementById('stale')})`;
const started = performance.now();
const report = { kind: 'bounded-raw-cdp-held-parser-reset-control', mode, controlVariant: 'second-CDP-connection',
  htmlSHA256: hash(html), heldScriptSHA256: hash(heldSource), resetExpression, finalExpression,
  safetyReleaseMs: 1000, commandTimeoutMs: 5000, timeline: [] };
const mark = (event, detail = {}) => report.timeline.push({ event, elapsedMs: Math.round(performance.now() - started), ...detail });
let heldResponse, received, reference, service, client, secondClient, browserContextId, safety;
const held = new Promise(resolve => { received = resolve; });
let bodyReleased = false;
function release(reason) {
  if (bodyReleased) return;
  bodyReleased = true; mark('held-body-release', { reason, peerAlreadyClosed: !!heldResponse?.destroyed });
  if (heldResponse && !heldResponse.destroyed) { heldResponse.writeHead(200, { 'content-type': 'text/javascript' }); heldResponse.end(heldSource); }
}
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://fixture.test').pathname; mark('http-request', { pathname });
  if (pathname === '/case.html') { response.writeHead(200, { 'content-type': 'text/html' }); response.end(html); return; }
  if (pathname !== '/held.js') { response.writeHead(404); response.end('missing'); return; }
  heldResponse = response;
  response.on('close', () => mark('held-response-close', { bodyEnded: response.writableEnded, bodyReleased }));
  received();
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
try {
  let endpoint;
  if (mode === 'native') {
    report.binarySHA256 = hash(await readFile(executableOrSnapshot));
    if (report.binarySHA256 !== '9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f') throw new Error('Unexpected native executable');
    reference = await startReference(executableOrSnapshot); endpoint = reference.endpoint;
  } else {
    report.snapshot = path.resolve(executableOrSnapshot);
    const { serve } = await import(pathToFileURL(path.join(report.snapshot, 'src/cdp.js')).href);
    service = await serve({ port: 0, timeout: 5000 }); endpoint = `ws://127.0.0.1:${service.port}/`;
  }
  client = await connect(endpoint, { timeout: 5000 });
  ({ browserContextId } = await client.send('Target.createBrowserContext'));
  const { targetId } = await client.send('Target.createTarget', { browserContextId, url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params = {}) => client.send(method, params, sessionId);
  await send('Page.enable');
  secondClient = await connect(endpoint, { timeout: 5000 });
  report.secondConnectionLoadTarget = await secondClient.send('Target.createTarget', { browserContextId, url: 'about:blank' });
  const secondSession = (await secondClient.send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
  const resetSend = (method, params = {}) => secondClient.send(method, params, secondSession);
  await resetSend('Page.enable');
  mark('navigation-command-sent');
  const navigation = send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/case.html` }).then(
    result => { mark('navigation-response'); return { result }; },
    error => { mark('navigation-error', { message: error.message }); return { error: error.message }; });
  let heldDeadline;
  try {
    await Promise.race([held, new Promise((_, reject) => { heldDeadline = setTimeout(() => reject(new Error('Held external script request was not reached')), 4000); })]);
  } finally { clearTimeout(heldDeadline); }
  mark('reset-command-sent'); safety = setTimeout(() => release('safety-deadline'), report.safetyReleaseMs);
  const reset = await resetSend('Runtime.evaluate', { expression: resetExpression, returnByValue: true });
  report.resetResponse = reset; report.bodyReleasedBeforeResetResponse = bodyReleased;
  mark('reset-command-response', { bodyReleased }); clearTimeout(safety); release('reset-command-completed');
  report.navigation = await navigation;
  await new Promise(resolve => setTimeout(resolve, 50));
  report.finalResponse = await send('Runtime.evaluate', { expression: finalExpression, returnByValue: true });
  const before = reset.result?.value?.before;
  report.controlReachedBlockedParser = !report.bodyReleasedBeforeResetResponse && before?.state === 'loading' && before.oldScriptRan === false;
  report.interpretation = report.controlReachedBlockedParser
    ? 'Reset command observed a genuinely held parser before the old external body was released.'
    : 'Inconclusive cancellation control: the reset command did not observe a held loading parser before body release.';
  report.events = [...client.events.filter(event => event.sessionId === sessionId).map(event => ({connection:1,...event})), ...secondClient.events.filter(event => event.sessionId === secondSession).map(event => ({connection:2,...event}))];
} catch (error) { report.error = { message: error.message, stack: error.stack }; }
finally {
  clearTimeout(safety); release('cleanup');
  try {
    if (client && browserContextId) await client.send('Target.disposeBrowserContext', { browserContextId });
  } catch (error) { report.contextCleanupError = error.message; }
  try { await secondClient?.close(); if (client) await client.close(); } finally {
    const closed = await Promise.allSettled([
      service?.close(), reference?.close(),
      (async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); })(),
    ]);
    const errors = closed.filter(result => result.status === 'rejected').map(result => result.reason?.message ?? String(result.reason));
    if (errors.length) report.cleanupErrors = errors;
  }
}
report.cleanup = 'owned CDP context, connection, candidate service or verified native process, held-response timer and port0 HTTP server closed';
const json = JSON.stringify(report, null, 2) + '\n'; if (output) await writeFile(output, json); process.stdout.write(json);
if (report.error || report.cleanupErrors?.length) process.exitCode = 1;
