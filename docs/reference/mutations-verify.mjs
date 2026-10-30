// Run unchanged source fixtures through independent installers; no Browser/CDP parity claim.
import { JSDOM, VirtualConsole, ResourceLoader } from 'jsdom';
import { EventEmitter } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { installErrors } from '../../src/errors.js';
import { installMutations } from '../../src/mutations.js';
import { installStyles } from '../../src/styles.js';
import { installModuleScripts } from '../../src/modules.js';
import { installClassicScripts } from '../../src/classic-scripts.js';
import { startFixtureServer } from '../../scripts/upstream-fixture-server.mjs';

const root = process.argv[2];
if (!root) throw new Error('Supply external src/browser/tests directory');
const paths = [
  'element/html/script/dynamic_inline.html',
  ...['attribute_filter', 'character_data', 'childlist', 'css_noop', 'disconnect_other_during_delivery',
    'multiple_observers', 'mutation_observer', 'mutations_during_callback', 'observe_multiple_targets',
    'reobserve_same_target', 'subtree'].map(name => `mutation_observer/${name}.html`),
];
const server = await startFixtureServer(root, { port: 0, profile: 'static' }), results = [];
try {
  for (const path of paths) {
    const bytes = await readFile(join(root, path)), errors = [], logs = [], virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => errors.push(error.message));
    virtualConsole.on('error', (...args) => logs.push(args.map(String).join(' ')));
    const page = Object.assign(new EventEmitter(), { documentAbort: new AbortController(), closed: false, javascript: true,
      fetch, extraHTTPHeaders: new Headers(), context: {}, userAgent: 'Lightpanda/1.0', referrerFor: () => null });
    const dom = new JSDOM(bytes.toString(), { url: `${server.origin}/src/browser/tests/${path}`, runScripts: 'dangerously',
      resources: new ResourceLoader({ userAgent: 'Lightpanda/1.0' }), virtualConsole, pretendToBeVisual: true,
      beforeParse(window) {
        Object.defineProperty(window.navigator, 'userAgent', { configurable: true, get: () => 'Lightpanda/1.0' });
        window.__lp_external_runner = true;
        installErrors(page, window); installMutations(page, window); installStyles(page, window);
        installModuleScripts(page, window); installClassicScripts(page, window);
      } });
    page.dom = dom;
    // Match the bounded classic-script comparison runner: allow ordinary timer
    // tasks to run before testing.onload callbacks are asserted by the harness.
    await new Promise(resolve => setTimeout(resolve, 100));
    let status = 'timeout', error = null;
    try {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        if (dom.window.testing?.assertOk()) { status = 'passed'; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } catch (cause) { status = 'failed'; error = String(cause); }
    if (status === 'timeout') dom.window.testing?.printTimeoutState();
    results.push({ path, sha256: createHash('sha256').update(bytes).digest('hex'), status, error, errors, logs });
    console.error(`${status.toUpperCase()} ${path}`);
    page.documentAbort.abort(); page.closed = true; dom.window.close();
  }
  const result = { scope: 'Installer-level unchanged external fixtures; not Browser/CDP integration evidence',
    settleDelayMs: 100,
    harnessSHA256: createHash('sha256').update(await readFile(join(root, 'testing.js'))).digest('hex'), results };
  const json = JSON.stringify(result, null, 2) + '\n';
  if (process.argv[3]) await writeFile(process.argv[3], json, { flag: 'wx' });
  console.log(json);
  if (results.some(result => result.status !== 'passed')) process.exitCode = 1;
} finally { await server.close(); }
