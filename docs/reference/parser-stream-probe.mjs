// Candidate-only check of the integrated runtime. Native controls are retained
// separately. The current runtime is copied without source substitutions.
import http from 'node:http';
import path from 'node:path';
import { cp, mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import 'jsdom'; // Initialize jsdom before loading its private implementation adapters.

const [fixturesRoot, output] = process.argv.slice(2);
if (!fixturesRoot) throw new Error('Supply unchanged upstream fixture root and optional output');
const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const snapshot = await mkdtemp(path.join(tmpdir(), 'red-panda-parser-stream-integrated-'));
for (const name of ['src', 'native', 'package.json']) await cp(path.join(root, name), path.join(snapshot, name), { recursive: true });
await symlink(path.join(root, 'node_modules'), path.join(snapshot, 'node_modules'), 'dir');

const { Browser } = await import(pathToFileURL(path.join(snapshot, 'src/browser.js')).href);
const server = http.createServer(async (request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url, 'http://fixture.test').pathname).replace(/^\/+/, '');
    const filename = path.resolve(fixturesRoot, relative);
    if (!filename.startsWith(path.resolve(fixturesRoot) + path.sep)) throw new Error('Outside fixture root');
    const bytes = await readFile(filename);
    response.writeHead(200, { 'content-type': filename.endsWith('.js') ? 'text/javascript' : 'text/html' }); response.end(bytes);
  } catch { response.writeHead(404); response.end('missing fixture'); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = new Browser({ timeout: 5000, userAgent: 'Lightpanda/1.0' });
const expression = `(()=>{
  if(document.readyState!=='complete')return {pending:true};
  if(window.testing?.IS_TEST_RUNNER!==true)return {failed:true,message:'Native harness branch was not selected'};
  const details=()=>window.__chunks?{chunks:window.__chunks,firstReadyState:window.__firstReadyState,iCount:window.__iCount,domCount:document.querySelectorAll('i').length}:{};
  try{return {passed:window.testing?.assertOk()===true,...details()};}
  catch(error){return {failed:true,message:error.message,...details()};}
})()`;
async function settle(page) {
  await new Promise(resolve => setTimeout(resolve, 100));
  const deadline = Date.now() + 3500;
  while (Date.now() < deadline) {
    const value = await page.evaluate(expression);
    if (value?.passed || value?.failed) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return { timeout: true };
}
const fixtures = ['mutation_observer/parser_chunks.html', ...[
  'async_text.html', 'clone_already_started.html', 'dynamic_inline.html',
  'load_event.html', 'load_event_timer.html', 'preload.html',
].map(name => `element/html/script/${name}`)];
const report = { kind: 'bounded-unchanged-parser-stream-integrated-comparison', snapshot, node: process.version,
  navigationTimeoutMs: 5000,
  classicSHA256: hash(await readFile(path.join(snapshot, 'src/classic-scripts.js'))),
  parserStreamSHA256: hash(await readFile(path.join(snapshot, 'src/parser-stream.js'))),
  nativeControls: ['docs/reference/parser-stream-native-control.json', 'docs/reference/classic-scripts-baseline.json'],
  settleDelayMs: 100, fixtures: [] };
try {
  for (const fixture of fixtures) {
    const page = browser.createPage(), errors = [], consoleErrors = [];
    const started = performance.now();
    const entry = { fixture, sourceSHA256: hash(await readFile(path.join(fixturesRoot, fixture))) };
    page.on('pageError', error => errors.push(error.message));
    page.on('console', event => { if (event.type === 'error') consoleErrors.push(event.args.map(String).join(' ')); });
    page.newDocumentScripts.set('probe', { source: 'window.__lp_external_runner = true;' });
    try { await page.navigate(`${origin}/${fixture}`); entry.independent = { ...await settle(page), errors, consoleErrors }; }
    catch (error) { entry.independent = { error: error.message, errors, consoleErrors }; }
    finally { page.close(); }
    entry.elapsedMs = Math.round(performance.now() - started);
    report.fixtures.push(entry);
    process.stdout.write(`${fixture}: ${entry.independent.passed ? 'PASS' : JSON.stringify(entry.independent)}\n`);
  }
} finally {
  browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
report.cleanup = 'all independent pages, browser and owned port0 fixture server closed; integrated source copy retained for review';
if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
if (report.fixtures.some(entry => !entry.independent.passed)) process.exitCode = 1;
