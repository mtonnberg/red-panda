import { parseArgs } from 'node:util';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { connect } from '../test/cdp-client.js';
import { startReference } from './reference-server.mjs';
import { startFixtureServer } from './upstream-fixture-server.mjs';

const usage = `Usage: node scripts/conformance.mjs --root /path/to/upstream/src/browser/tests
  (--endpoint ws://127.0.0.1:9222/ | --binary /path/to/browser)
  --test node/is_equal_node.html [--test document_fragment/document_fragment.html]
  [--tests-file /path/to/selection.json] [--isolate]
  [--browser-arg=--load-resources --browser-arg=iframe]
  [--timeout 5000] [--settle-ms 0] [--port 9582] [--report /new/report.json]
  [--fixture-profile static|xhr-subset | --fixture-origin http://127.0.0.1:9582]

Runs unchanged upstream fixture assertions through raw CDP. Both targets use
Lightpanda/1.0 solely within this runner so testing.js takes identical branches.
The default owned server serves static files. xhr-subset enables documented test
routes. --fixture-origin uses a caller-owned server, which this runner never stops.
The native harness requires origin http://127.0.0.1:9582 for its dynamic routes.
`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const inside = (root, path) => { const rel = relative(root, path); return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)); };

async function runFixture(client, server, selection, timeout, settleMs = 0) {
  const started = Date.now();
  const deadline = started + timeout;
  const requestOffset = server.requests?.length ?? 0;
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
    if (settleMs) {
      while (Date.now() < deadline && await evaluate('document.readyState') !== 'complete') await sleep(Math.min(20,remaining()));
      if (Date.now() >= deadline) throw new Error('Fixture document-complete deadline exceeded');
      await sleep(Math.min(settleMs,remaining()));
      if (Date.now() >= deadline) throw new Error('Fixture settling deadline exceeded');
    }
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
    deadlineMs:timeout, deadlineIncludesNavigation:true, settleDelayMs:settleMs, waitForDocumentCompleteBeforeSettle:!!settleMs,
    assertOkPolls:polls, nonzeroObservationsEnforced:status==='passed',
    observationCount:null, observationCountNote:'Private upstream harness state; passing assertOk enforces nonzero observations and no pending async blocks.',
    diagnostics:logs, runtimeExceptions:events.filter(event => event.method === 'Runtime.exceptionThrown').map(event => event.params.exceptionDetails?.text),
    unavailableRoutes:server.requests ? server.requests.slice(requestOffset).filter(request => !request.routeKnown) : null,
    requestObservation:server.requests ? 'Owned fixture server request log; capped at 10000 entries.' : 'Unknown: external server request logs are not available to this runner.' };
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals:true, options:{
    root:{type:'string'}, endpoint:{type:'string'}, binary:{type:'string'}, test:{type:'string',multiple:true},
    'tests-file':{type:'string'}, isolate:{type:'boolean'}, 'browser-arg':{type:'string',multiple:true},
    timeout:{type:'string',default:'5000'}, 'settle-ms':{type:'string',default:'0'}, port:{type:'string',default:'9582'}, report:{type:'string'}, help:{type:'boolean'},
    'fixture-origin':{type:'string'}, 'fixture-profile':{type:'string'},
  } });
  if (values.help) { console.log(usage); return; }
  if (!values.root || Boolean(values.endpoint) === Boolean(values.binary)) throw new Error(usage);
  if (values.isolate && !values.binary) throw new Error('--isolate requires --binary (the runner never kills an externally owned endpoint)');
  if (values['browser-arg']?.length && !values.binary) throw new Error('--browser-arg requires --binary');
  if (values['fixture-origin'] && (values['fixture-profile'] || values.port !== '9582')) throw new Error('--fixture-origin cannot be combined with --fixture-profile or a custom --port');
  const profile = values['fixture-profile'] ?? 'static';
  if (!['static','xhr-subset'].includes(profile)) throw new Error('--fixture-profile must be static or xhr-subset');
  let fromFile = [];
  if (values['tests-file']) {
    const text = await readFile(values['tests-file'],'utf8');
    fromFile = text.trimStart().startsWith('[') ? JSON.parse(text) : text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    if (!Array.isArray(fromFile) || fromFile.some(path => typeof path !== 'string' || !path.trim())) throw new Error('--tests-file must contain a JSON array or newline list of fixture paths');
  }
  const tests = [...(values.test ?? []), ...fromFile, ...positionals];
  if (!tests.length) throw new Error('Zero selected fixtures: supply at least one explicit --test path');
  const timeout = Number(values.timeout), port = Number(values.port), settleMs=Number(values['settle-ms']);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120000 || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid timeout or port');
  if(!Number.isInteger(settleMs)||settleMs<0||settleMs>=timeout)throw new Error('--settle-ms must be a nonnegative integer below --timeout');
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
    if (values['fixture-origin']) {
      const parsed = new URL(values['fixture-origin']);
      if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('--fixture-origin must be an HTTP(S) origin without credentials, path, query or fragment');
      server = { origin:parsed.origin, requests:null, owned:false, metadata:null, close:async()=>{} };
      // Verify the actual main documents and harness served externally, rather
      // than claiming that local hashes prove unchanged remote source.
      const files = [{path:'testing.js',sha256:createHash('sha256').update(harness).digest('hex')},...selections];
      for (const file of files) {
        const url = `${server.origin}/src/browser/tests/${file.path.split('/').map(encodeURIComponent).join('/')}`;
        const response = await fetch(url,{signal:AbortSignal.timeout(timeout)});
        if (!response.ok || createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex') !== file.sha256) throw new Error(`External fixture bytes differ or are unavailable: ${file.path}`);
      }
    } else server = await startFixtureServer(root,{port,profile});
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
          result = await runFixture(ownedClient,server,selection,timeout,settleMs);
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
      } else result = await runFixture(client,server,selection,timeout,settleMs);
      results.push(result);
      console.error(`${result.status.toUpperCase()} ${result.path}${result.error ? ': '+result.error : ''}`);
    }
    const counts = { selected:results.length, passed:0, failed:0, timeout:0, unobserved:0 };
    for (const result of results) counts[result.status]++;
    const report = { schemaVersion:1, target:version, binary:binaryIdentity, root, endpoint, sourceHarnessSHA256:createHash('sha256').update(harness).digest('hex'),
      harnessSourceUnchanged:true, testUserAgent:'Lightpanda/1.0', externalRunnerFlag:true,
      isolatedBrowserPerFixture:!!values.isolate, browserArgs, settleDelayMs:settleMs, waitForDocumentCompleteBeforeSettle:!!settleMs,
      configurationCoverage:{
        sourceHtmlRunnerDefaults:['--load-resources','iframe','--load-resources','worker'],
        sourceDefaultsNote:'src/testing.zig HtmlRunnerOpts enables iframe and worker; individual registrations may override resources, experimental features or injected scripts.',
        fixtureSpecificOptionsVerified:false,
        unrunConfigurationDimensions:['Per-fixture native registration overrides not audited','Full upstream test_routes server not implemented; see fixture server metadata or external server contract'],
      },
      fixtureOrigin:server.origin, fixtureServerOwnership:server.owned?'runner-owned':'caller-owned; caller must stop it',
      fixtureServerMetadata:server.metadata, staticRoutesOnly:server.owned ? profile==='static' : null,
      sourceVerification:server.owned?'Local fixture files served directly':'External main fixture documents and testing.js hash-verified; transitive resource bytes not verified',
      results, counts };
    const json = `${JSON.stringify(report,null,2)}\n`;
    if (values.report) await writeFile(values.report,json,{flag:'wx'});
    console.log(json);
    process.exitCode = counts.passed === counts.selected ? 0 : 1;
  } finally { await client?.close(); await browser?.close(); await server?.close(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 2; });
