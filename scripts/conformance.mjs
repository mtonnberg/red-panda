import { parseArgs } from 'node:util';
import http from 'node:http';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { connect } from '../test/cdp-client.js';
import { startReference } from './reference-server.mjs';

const usage = `Usage: node scripts/conformance.mjs --root /path/to/upstream/src/browser/tests
  (--endpoint ws://127.0.0.1:9222/ | --binary /path/to/browser)
  --test node/is_equal_node.html [--test document_fragment/document_fragment.html]
  [--tests-file /path/to/selection.json] [--isolate]
  [--browser-arg=--load-resources --browser-arg=iframe]
  [--timeout 5000] [--port 9582] [--report /new/report.json]

Runs unchanged upstream fixture assertions through raw CDP. Both targets use
Lightpanda/1.0 solely within this runner so testing.js takes identical branches.
Only static HTTP fixtures are served; dynamic upstream test routes are not ported.
`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const inside = (root, path) => { const rel = relative(root, path); return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)); };
const mimeTypes = { '.html':'text/html', '.xhtml':'application/xhtml+xml', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.xml':'application/xml', '.txt':'text/plain', '.svg':'image/svg+xml', '.png':'image/png', '.gif':'image/gif', '.jpg':'image/jpeg', '.webp':'image/webp', '.wasm':'application/wasm' };

async function fixtureServer(root, port) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const entry = { method: request.method, path: request.url, status: 0 };
    if (requests.length < 5000) requests.push(entry);
    const finish = (status, text) => { entry.status = status; response.writeHead(status, { 'content-type':'text/plain', 'cache-control':'no-store' }); response.end(text); };
    try {
      if (!['GET','HEAD'].includes(request.method)) return finish(405, 'Static fixture server supports GET and HEAD only');
      const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const prefix = '/src/browser/tests/';
      if (!path.startsWith(prefix) || path.includes('\\')) return finish(404, 'Upstream dynamic test route is not implemented');
      const candidate = resolve(root, path.slice(prefix.length));
      if (!inside(root, candidate)) return finish(403, 'Outside fixture root');
      const canonical = await realpath(candidate);
      if (!inside(root, canonical)) return finish(403, 'Symlink escapes fixture root');
      if (!(await stat(canonical)).isFile()) return finish(404, 'Not a fixture file');
      const bytes = await readFile(canonical);
      entry.status = 200;
      response.writeHead(200, { 'content-type':mimeTypes[extname(canonical)] ?? 'application/octet-stream', 'cache-control':'no-store', 'content-length':bytes.length });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) { finish(error instanceof URIError ? 400 : 404, 'Fixture unavailable'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { requests, origin:`http://127.0.0.1:${server.address().port}`, close:() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}

async function runFixture(client, server, selection, timeout) {
  const started = Date.now();
  const deadline = started + timeout;
  const requestOffset = server.requests.length;
  let context;
  let session;
  let polls = 0;
  let harnessObserved = false;
  let nativeHarnessBranch = null;
  let observedUserAgent = null;
  let status = 'unobserved';
  let error = null;
  const eventOffset = client.events.length;
  const remaining = () => Math.max(1, deadline - Date.now());
  const send = (method, params = {}, budget = remaining()) => client.send(method, params, session, { timeout:budget });
  const rootSend = (method, params) => client.send(method, params, undefined, { timeout:remaining() });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  try {
    context = (await rootSend('Target.createBrowserContext')).browserContextId;
    const target = await rootSend('Target.createTarget', { url:'about:blank', browserContextId:context });
    session = (await rootSend('Target.attachToTarget', { targetId:target.targetId, flatten:true })).sessionId;
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    await send('Network.setUserAgentOverride', { userAgent:'Lightpanda/1.0' });
    await send('Page.addScriptToEvaluateOnNewDocument', { source:'globalThis.__lp_external_runner = true;' });
    const url = `${server.origin}/src/browser/tests/${selection.path.split('/').map(encodeURIComponent).join('/')}`;
    const navigation = await send('Page.navigate', { url });
    if (navigation.errorText) throw new Error(navigation.errorText);
    while (Date.now() < deadline) {
      polls++;
      const value = JSON.parse(await evaluate(`JSON.stringify((() => {
        if (typeof testing === 'undefined' || typeof testing.assertOk !== 'function') return {kind:'missing'};
        const metadata = {nativeBranch:testing.IS_TEST_RUNNER === true,userAgent:navigator.userAgent};
        if (!metadata.nativeBranch || globalThis.__lp_external_runner !== true) return {...metadata,kind:'wrong-branch'};
        try { return {...metadata,kind:testing.assertOk() === true ? 'passed' : 'pending'}; }
        catch (error) { return {...metadata,kind:'failed',message:String(error && error.message || error)}; }
      })())`));
      if (value.kind !== 'missing') harnessObserved = true;
      if (value.nativeBranch !== undefined) { nativeHarnessBranch = value.nativeBranch; observedUserAgent = value.userAgent; }
      if (value.kind === 'wrong-branch') { status = 'unobserved'; error = 'The harness did not enter the required native/external-runner branch'; break; }
      if (value.kind === 'passed') { status = 'passed'; break; }
      if (value.kind === 'failed') {
        status = /no test observations|no assertions/.test(value.message) ? 'unobserved' : 'failed'; error = value.message; break;
      }
      await sleep(20);
    }
    if (!['passed','failed'].includes(status) && error === null) {
      if (harnessObserved) {
        status = 'timeout'; error = 'Upstream assertOk remained pending until the deadline';
      } else { status = 'unobserved'; error = 'Upstream assertion harness was not observed'; }
    }
  } catch (cause) {
    status = /timeout|timed out|deadline/i.test(cause.message) ? 'timeout' : 'failed'; error = cause.message;
  } finally {
    if (status === 'timeout' && harnessObserved) await send('Runtime.evaluate', {
      expression:"typeof testing !== 'undefined' && typeof testing.printTimeoutState === 'function' ? (testing.printTimeoutState(),true) : false",
      returnByValue:true,
    },200).catch(() => {});
    if (context) await client.send('Target.disposeBrowserContext', { browserContextId:context },undefined,{timeout:250}).catch(() => {});
  }
  const events = client.events.slice(eventOffset).filter(event => event.sessionId === session);
  const logs = events.filter(event => event.method === 'Runtime.consoleAPICalled').map(event => ({ type:event.params.type, text:event.params.args.map(arg => arg.value ?? arg.description ?? arg.type).join(' ') }));
  if (status === 'timeout' && logs.some(log => /no test observations were recorded/.test(log.text)) &&
      !logs.some(log => /Pending async scripts|module testing\.async\(\) blocks completed/.test(log.text))) {
    status = 'unobserved'; error = 'Upstream harness recorded no test observations';
  }
  return { ...selection, status, error, durationMs:Date.now()-started, harnessObserved, nativeHarnessBranch, observedUserAgent,
    deadlineMs:timeout, deadlineIncludesNavigation:true,
    assertOkPolls:polls, nonzeroObservationsEnforced:status==='passed',
    observationCount:null, observationCountNote:'Private upstream harness state; passing assertOk enforces nonzero observations and no pending async blocks.',
    diagnostics:logs, runtimeExceptions:events.filter(event => event.method === 'Runtime.exceptionThrown').map(event => event.params.exceptionDetails?.text),
    unavailableRoutes:server.requests.slice(requestOffset).filter(request => request.status !== 200) };
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals:true, options:{
    root:{type:'string'}, endpoint:{type:'string'}, binary:{type:'string'}, test:{type:'string',multiple:true},
    'tests-file':{type:'string'}, isolate:{type:'boolean'}, 'browser-arg':{type:'string',multiple:true},
    timeout:{type:'string',default:'5000'}, port:{type:'string',default:'9582'}, report:{type:'string'}, help:{type:'boolean'},
  } });
  if (values.help) { console.log(usage); return; }
  if (!values.root || Boolean(values.endpoint) === Boolean(values.binary)) throw new Error(usage);
  if (values.isolate && !values.binary) throw new Error('--isolate requires --binary (the runner never kills an externally owned endpoint)');
  if (values['browser-arg']?.length && !values.binary) throw new Error('--browser-arg requires --binary');
  let fromFile = [];
  if (values['tests-file']) {
    const text = await readFile(values['tests-file'],'utf8');
    fromFile = text.trimStart().startsWith('[') ? JSON.parse(text) : text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    if (!Array.isArray(fromFile) || fromFile.some(path => typeof path !== 'string' || !path.trim())) throw new Error('--tests-file must contain a JSON array or newline list of fixture paths');
  }
  const tests = [...(values.test ?? []), ...fromFile, ...positionals];
  if (!tests.length) throw new Error('Zero selected fixtures: supply at least one explicit --test path');
  const timeout = Number(values.timeout), port = Number(values.port);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120000 || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid timeout or port');
  const root = await realpath(resolve(values.root));
  const harness = await readFile(join(root,'testing.js'));
  const selections = [];
  for (const path of tests) {
    if (isAbsolute(path) || path.includes('\\') || !path.endsWith('.html')) throw new Error(`Invalid fixture path: ${path}`);
    const canonical = await realpath(resolve(root,path));
    if (!inside(root,canonical)) throw new Error(`Fixture escapes root: ${path}`);
    const bytes = await readFile(canonical);
    selections.push({ path:relative(root,canonical).split(sep).join('/'), sha256:createHash('sha256').update(bytes).digest('hex'), tagged:/<meta\s+name=["']?lp-mode["']?\s+content=["']?test["']?\s*\/?>/i.test(bytes.toString()) });
  }
  const browserArgs = values['browser-arg'] ?? [];
  let browser, server, client;
  try {
    server = await fixtureServer(root,port);
    let endpoint = values.endpoint ?? null;
    const binaryIdentity = values.binary ? {
      path:resolve(values.binary), sha256:createHash('sha256').update(await readFile(resolve(values.binary))).digest('hex'),
      note:'Identity of the selected executable or launcher file; imported modules/shared libraries are not included.',
    } : null;
    let version = null;
    if (!values.isolate) {
      if (values.binary) browser = await startReference(resolve(values.binary),{args:browserArgs});
      endpoint = browser?.endpoint ?? values.endpoint;
      client = await connect(endpoint,{timeout});
      version = await client.send('Browser.getVersion');
    }
    const results = [];
    for (const selection of selections) {
      let result;
      if (values.isolate) {
        let ownedBrowser, ownedClient;
        const started = Date.now();
        try {
          ownedBrowser = await startReference(resolve(values.binary),{args:browserArgs});
          ownedClient = await connect(ownedBrowser.endpoint,{timeout});
          const target = await ownedClient.send('Browser.getVersion');
          version ??= target;
          result = await runFixture(ownedClient,server,selection,timeout);
          result.target = target;
        } catch (cause) {
          result = { ...selection,status:/timeout|timed out|deadline/i.test(cause.message)?'timeout':'failed',error:cause.message,
            phase:'browser-setup',harnessObserved:false,nonzeroObservationsEnforced:false,durationMs:Date.now()-started };
        } finally {
          await ownedClient?.close();
          await ownedBrowser?.close();
        }
        result.ownedBrowser = { pid:ownedBrowser?.process.pid ?? null,exitCode:ownedBrowser?.process.exitCode ?? null,signal:ownedBrowser?.process.signalCode ?? null };
        result.totalDurationMs = Date.now()-started;
      } else result = await runFixture(client,server,selection,timeout);
      results.push(result);
      console.error(`${result.status.toUpperCase()} ${result.path}${result.error ? ': '+result.error : ''}`);
    }
    const counts = { selected:results.length, passed:0, failed:0, timeout:0, unobserved:0 };
    for (const result of results) counts[result.status]++;
    const report = { schemaVersion:1, target:version, binary:binaryIdentity, root, endpoint, sourceHarnessSHA256:createHash('sha256').update(harness).digest('hex'),
      harnessSourceUnchanged:true, testUserAgent:'Lightpanda/1.0', externalRunnerFlag:true,
      isolatedBrowserPerFixture:!!values.isolate, browserArgs,
      configurationCoverage:{
        sourceHtmlRunnerDefaults:['--load-resources','iframe','--load-resources','worker'],
        sourceDefaultsNote:'src/testing.zig HtmlRunnerOpts enables iframe and worker; individual registrations may override resources, experimental features or injected scripts.',
        fixtureSpecificOptionsVerified:false,
        unrunConfigurationDimensions:['Per-fixture native registration overrides not audited','Stateful HTTP/WebSocket test_routes not implemented'],
      },
      fixtureOrigin:server.origin, staticRoutesOnly:true, results, counts };
    const json = `${JSON.stringify(report,null,2)}\n`;
    if (values.report) await writeFile(values.report,json,{flag:'wx'});
    console.log(json);
    process.exitCode = counts.passed === counts.selected ? 0 : 1;
  } finally { await client?.close(); await browser?.close(); await server?.close(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 2; });
