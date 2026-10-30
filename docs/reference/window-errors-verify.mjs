// Installer-level execution of unchanged external HTML; not a Browser/CDP parity claim.
import { JSDOM, VirtualConsole, ResourceLoader } from 'jsdom';
import { EventEmitter } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { installErrors } from '../../src/errors.js';
import { installStyles } from '../../src/styles.js';
import { installLayout } from '../../src/layout.js';
import { installIntersection } from '../../src/intersection.js';
import { installResizeObserver } from '../../src/resize-observer.js';
import { installPerformance } from '../../src/performance.js';
import { startFixtureServer } from '../../scripts/upstream-fixture-server.mjs';

const root = process.argv[2];
if (!root) throw new Error('Supply external src/browser/tests directory');
const server = await startFixtureServer(root, { port: 0, profile: 'static' });
const path = 'event/report_error.html';
const bytes = await readFile(join(root, path));
const errors = [], logs = [], eventTrace = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));
virtualConsole.on('error', (...args) => logs.push(args.map(String).join(' ')));
const page = Object.assign(new EventEmitter(), { closed: false, documentAbort: new AbortController() });
page.on('pageError', error => errors.push(String(error)));
let dom;
try {
  dom = new JSDOM(bytes.toString(), { url: `${server.origin}/src/browser/tests/${path}`, runScripts: 'dangerously',
    resources: new ResourceLoader({ userAgent: 'Lightpanda/1.0' }), virtualConsole, pretendToBeVisual: true,
    beforeParse(window) {
      Object.defineProperty(window.navigator, 'userAgent', { configurable: true, get: () => 'Lightpanda/1.0' });
      window.__lp_external_runner = true;
      installErrors(page, window); installStyles(page, window);
      const started = Date.now();
      window.addEventListener('error', event => eventTrace.push({ type: 'error', message: event.message, elapsedMs: Date.now() - started }));
      window.addEventListener('message', () => eventTrace.push({ type: 'message', handler: typeof window.onmessage, elapsedMs: Date.now() - started }));
      const layout = installLayout(page, window);
      installIntersection(page, window, layout); installResizeObserver(page, window, layout); installPerformance(page, window);
    },
  });
  const deadline = Date.now() + 2000;
  let status = 'timeout', error = null;
  try {
    while (Date.now() < deadline) {
      if (dom.window.testing?.assertOk()) { status = 'passed'; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  } catch (cause) { status = 'failed'; error = String(cause); }
  if (status === 'timeout') dom.window.testing?.printTimeoutState();
  const result = { scope: 'Installer-level unchanged external fixture; not a production Browser/CDP integration result',
    sourceHarnessSHA256: createHash('sha256').update(await readFile(join(root, 'testing.js'))).digest('hex'),
    path, sha256: createHash('sha256').update(bytes).digest('hex'), status, error, errors, logs, eventTrace };
  const json = JSON.stringify(result, null, 2) + '\n';
  if (process.argv[3]) await writeFile(process.argv[3], json, { flag: 'wx' });
  console.log(json);
  if (status !== 'passed') process.exitCode = 1;
} finally { page.documentAbort.abort(); dom?.window.close(); await server.close(); }
