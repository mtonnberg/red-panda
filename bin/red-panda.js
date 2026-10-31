#!/usr/bin/env node
import {parseWebSocketLimit,prepareCLIArguments,readCLIWaitScript,parseCLIHTTPHeaders} from '../src/cli-options.js';
import { parseArgs } from 'node:util';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { Browser, VERSION } from '../src/browser.js';
import { serve } from '../src/cdp.js';
import { runMCPStdio } from '../src/mcp.js';
import { serveMCPHTTP } from '../src/mcp-http.js';
import { runScript } from '../src/script.js';
import { DUMP_FORMATS, STRIP_MODES } from '../src/dump.js';
import { alternateMarkdown } from '../src/markdown-alternate.js';
import { readCookieFile, writeCookieFile, setCookie, exportCookies } from '../src/cookies.js';

// Re-exec in place so module scripts share the page VM and server ownership
// remains attached to the same PID (including bounded conformance cleanup).
if (typeof vm.SourceTextModule !== 'function' && typeof process.execve === 'function') {
  process.execve(process.execPath, [process.execPath, '--experimental-vm-modules', ...process.execArgv, ...process.argv.slice(1)], process.env);
}

const help = `Red Panda ${VERSION} — experimental headless browser

Usage:
  red-panda fetch [options] <URL>...   Multiple URLs require --json
  red-panda serve [--host 127.0.0.1] [--port 9222] [--protocol cdp|webdriver]...
  red-panda mcp [--port PORT | --cdp-port PORT]   MCP over stdio or HTTP
  red-panda run <script.js | ->        Execute a saved browser script
  red-panda version

Fetch options:
  --ws-max-concurrent N     Concurrent WebSocket transports (0–255; default 8)
  --dump FORMAT          html, markdown, semantic_tree, semantic_tree_text,
                         structured_data, text, links, png or pdf (no flag: no dump; bare --dump: html)
  --dump-selector CSS    Dump the first matching element
  --dump-max-bytes N     Soft UTF-8 cap for HTML/Markdown, with truncation marker
  --strip-mode GROUP     js, css, ui, invisible, shell or clutter (repeatable)
  --with-base            Insert an absolute base URL into full-document HTML
  --markdown-alternate   Prefer an authored Markdown alternate within the page deadline
  --json                 Wrap the dump and HTTP metadata in JSON
  --wait-until load|domcontentloaded|done          Readiness (default load; none with a wait predicate)
  --wait-ms N             Maximum page wait in milliseconds (default 5000)
  --wait-selector CSS     Wait for a matching DOM element
  --wait-script JS        Wait for a truthy JavaScript expression
  --wait-script-file PATH Read a wait expression from a UTF-8 file (last script flag wins)
  --http-header HEADER   Set a fixed Name: Value header on every HTTP request (repeatable)
  --no-javascript         Parse HTML without running page scripts
  --fail-on-http-error    Dump HTTP errors and exit 22
  --user-agent STRING    Override the user agent
  --experimental-features FEATURE  Enable serviceworker (repeatable)
  --load-resources KIND  Enable stylesheet, iframe, worker, image or beacon requests (repeatable)
  --inject-script JS     Run before page scripts (repeatable, in CLI order)
  --inject-script-file PATH  Read a preload script from a file
  --cookie PATH          Load a JSON or Netscape cookie file into each page
  --cookie-jar PATH      Save collected cookies as an owner-only JSON file

Run only trusted pages: the jsdom runtime is not a security sandbox.
CDP implements a subset; see README.md for supported operations.
`;

function integer(value, name, minimum = 1) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum || Number(value) > 2147483647) {
    throw new Error(`${name} must be an integer between ${minimum} and 2147483647`);
  }
  return Number(value);
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals, tokens } = parseArgs({ args: prepareCLIArguments(argv, [...DUMP_FORMATS, 'png', 'pdf']), allowPositionals: true, tokens: true, options: {
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' },
    dump: { type: 'string', default: '' }, json: { type: 'boolean' },
    'dump-selector': { type: 'string' }, 'dump-max-bytes': { type: 'string' },
    'strip-mode': { type: 'string', multiple: true }, 'with-base': { type: 'boolean' },
    'markdown-alternate': { type: 'boolean' },
    host: { type: 'string', default: '127.0.0.1' }, port: { type: 'string', default: '9222' },
    'wait-until': { type: 'string', default: 'load' }, 'wait-ms': { type: 'string', default: '5000' },
    'wait-selector': { type: 'string' }, 'wait-script': { type: 'string' }, 'wait-script-file': { type: 'string' },
    'http-header': { type: 'string', multiple: true },
    'ws-max-concurrent': { type: 'string' },
    'no-javascript': { type: 'boolean' }, 'user-agent': { type: 'string' },
    'fail-on-http-error': { type: 'boolean' },
    'inject-script': { type: 'string', multiple: true }, 'inject-script-file': { type: 'string', multiple: true },
    cookie: { type: 'string' }, 'cookie-jar': { type: 'string' },
    protocol: { type: 'string', multiple: true },
    'http-session-timeout': { type: 'string', default: '60' },
    'remote-allow-origins': { type: 'string', multiple: true },
    'cdp-port': { type: 'string' },
    'load-resources': { type: 'string', multiple: true },
    'experimental-features': { type: 'string', multiple: true },
  } });
  if (values.version) { console.log(`RedPanda/${VERSION}`); return; }
  if (values.help || !positionals.length) { console.log(help); return; }
  const [command, ...rest] = positionals;
  if (command === 'version' || values.version) { console.log(`RedPanda/${VERSION}`); return; }
  const timeout = integer(values['wait-ms'], '--wait-ms');
  const cliHTTPHeaders = parseCLIHTTPHeaders(values['http-header']);
  let loadResources = values['load-resources'] ?? (command === 'mcp' ? ['stylesheet'] : []);
  for (const resource of loadResources) if (!['none', 'stylesheet', 'iframe', 'worker', 'image', 'beacon'].includes(resource)) throw new Error(`Unsupported resource loading: ${resource}`);
  if (loadResources.includes('none')) loadResources = [];
  const features = values['experimental-features'] ?? [];
  for (const feature of features) if (feature !== 'serviceworker') throw new Error(`Unsupported experimental feature: ${feature}`);
  const options = { wsMaxConcurrent:parseWebSocketLimit(values['ws-max-concurrent']),experimentalFeatures: {serviceworker: features.includes('serviceworker')}, timeout, cliHTTPHeaders, javascript: !values['no-javascript'], userAgent: values['user-agent'], loadResources };
  if (command === 'run') {
    if (rest.length !== 1) throw new Error('run requires one script path or - for stdin');
    if (values.cookie || values['cookie-jar'] || values['inject-script'] || values['inject-script-file']) throw new Error('Cookie files and preload flags are not yet supported for saved scripts');
    try {
      const result = await runScript({ path: rest[0], browserOptions: options, timeout });
      process.stdout.write(result.output);
    } catch (error) { if (error.output) process.stdout.write(error.output); throw error; }
    return;
  }
  if (command === 'mcp') {
    if (rest.length) throw new Error('mcp does not accept positional arguments');
    if (values.cookie || values['cookie-jar']) throw new Error('Cookie files are not yet supported for MCP');
    if (tokens.some(token => token.kind === 'option' && token.name === 'port')) {
      if (values['cdp-port'] !== undefined) throw new Error('--cdp-port cannot be combined with --port');
      const port = integer(values.port, '--port', 0);
      if (port > 65535) throw new Error('--port must be between 0 and 65535');
      const httpSessionTimeout = tokens.some(token => token.kind === 'option' && token.name === 'http-session-timeout')
        ? integer(values['http-session-timeout'], '--http-session-timeout', 0) : 0;
      const service = await serveMCPHTTP({ host: values.host, port, httpSessionTimeout, browserOptions: options,
        remoteAllowOrigins: values['remote-allow-origins'] ?? [],
      });
      console.error(`RedPanda/${VERSION} MCP HTTP listening on ${service.host}:${service.port}`);
      let stopping = false;
      const stop = async () => { if (stopping) return; stopping = true; await service.close(); };
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      return;
    }
    let service;
    try {
      if (values['cdp-port'] !== undefined) {
        const port = integer(values['cdp-port'], '--cdp-port', 0);
        if (port > 65535) throw new Error('--cdp-port must be between 0 and 65535');
        service = await serve({ ...options, host: values.host, port, allowedOrigins: values['remote-allow-origins'] });
      }
      await runMCPStdio({ ...(service ? { browser: service.browser } : {}), browserOptions: options });
    } finally { await service?.close(); }
    return;
  }
  if (command === 'serve') {
    if (rest.length) throw new Error('serve does not accept positional arguments');
    const port = integer(values.port, '--port', 0);
    if (port > 65535) throw new Error('--port must be between 0 and 65535');
    const service = await serve({ ...options, host: values.host, port, protocols: values.protocol,
      httpSessionTimeout: integer(values['http-session-timeout'], '--http-session-timeout', 0),
      allowedOrigins: values['remote-allow-origins'],
    });
    console.error(`RedPanda/${VERSION} automation server listening on ${service.host}:${service.port}`);
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; await service.close(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    return;
  }
  if (command !== 'fetch' || !rest.length) throw new Error('Expected fetch <URL>..., serve, mcp, run, or version');
  if (rest.length > 1 && !values.json) throw new Error('Fetching multiple URLs requires --json');
  const binaryDump = ['png', 'pdf'].includes(values.dump);
  if (values.dump && !binaryDump && !DUMP_FORMATS.includes(values.dump)) throw new Error('Unsupported --dump format');
  if (values['markdown-alternate'] && values.dump !== 'markdown') throw new Error('--markdown-alternate requires --dump markdown');
  if (values['markdown-alternate'] && values['dump-selector'] !== undefined) throw new Error('--markdown-alternate cannot be combined with --dump-selector');
  const dumpOptions = { selector: values['dump-selector'], withBase: values['with-base'] ?? false,
    maxBytes: values['dump-max-bytes'] === undefined ? undefined : integer(values['dump-max-bytes'], '--dump-max-bytes', 0),
    stripModes: values['strip-mode'] ?? [],
  };
  for (const mode of dumpOptions.stripModes) if (!STRIP_MODES.includes(mode)) throw new Error(`Unsupported strip mode: ${mode}`);
  if (dumpOptions.maxBytes !== undefined && !['html', 'markdown'].includes(values.dump)) throw new Error('--dump-max-bytes requires HTML or Markdown');
  if (!['load', 'domcontentloaded', 'done'].includes(values['wait-until'])) throw new Error('Unsupported --wait-until value');
  const waitScript = await readCLIWaitScript(tokens);
  const waitUntil = tokens.some(token => token.kind === 'option' && token.name === 'wait-until') ? values['wait-until'] : (values['wait-selector'] !== undefined || waitScript !== undefined ? 'none' : 'load');
  const browser = new Browser(options);
  try {
    const template = browser.contexts.get('default').cookies;
    // Validate inputs before issuing the first network request.
    if (values.cookie) for (const cookie of await readCookieFile(values.cookie)) await setCookie(template, cookie);
    const preloads = [];
    for (const token of tokens) {
      if (token.kind !== 'option') continue;
      if (token.name === 'inject-script') preloads.push(token.value);
      if (token.name === 'inject-script-file') preloads.push(await readFile(token.value, 'utf8'));
    }
    const results = [];
    const collectedCookies = new Map();
    let failed = false;
    let httpError = false;
    for (const url of rest) {
      // Match Lightpanda's independent CLI pages. Only loaded cookies are shared.
      const contextId = browser.createContext();
      const context = browser.contexts.get(contextId);
      context.cookies = await template.clone();
      const page = browser.createPage(contextId);
      for (const [index, source] of preloads.entries()) page.newDocumentScripts.set(`cli:${index}`, { source });
      let error = null;
      const deadline = Date.now() + timeout;
      try {
        // Lightpanda's wait-ms is a deadline, not an unconditional delay.
        await page.navigate(url, {
          waitUntil: waitUntil === 'done' ? 'networkidle0' : waitUntil,
          selector: values['wait-selector'], script: waitScript,
        });
      } catch (cause) {
        failed = true;
        error = navigationError(cause);
        if (!page.status) {
          const document = page.dom.window.document;
          document.body.replaceChildren();
          const heading = document.createElement('h1'); heading.textContent = 'Navigation failed';
          const reason = document.createElement('p'); reason.textContent = `Reason: ${error}`;
          document.body.append(heading, reason);
        }
        if (!values.json) console.error(`red-panda: ${error}`);
      }
      try {
        let content = '';
        let selected;
        try {
          if (values['markdown-alternate']) {
            selected = await alternateMarkdown(page, { ...dumpOptions, deadline, format: 'markdown' });
            content = selected.content;
          } else if (binaryDump) {
            const rendered = await page.render(values.dump, dumpOptions);
            content = rendered.bytes.toString('base64');
          } else if (values.dump) content = page.dump(values.dump, dumpOptions);
        }
        catch (cause) {
          failed = true; error ??= cause.code ?? cause.message;
          if (!values.json) console.error(`red-panda: ${error}`);
        }
        results.push({ url: selected?.usedAlternate ? selected.url : page.status ? page.url : url,
          http_status: selected?.usedAlternate ? selected.httpStatus : page.status ?? 0,
          headers: selected?.usedAlternate ? selected.headers : page.responseHeaders ?? [], dump: values.dump, content, error });
        httpError ||= page.status >= 400;
        if (values['cookie-jar']) for (const cookie of await exportCookies(context.cookies)) {
          collectedCookies.set(`${cookie.domain}|${cookie.path}|${cookie.name}`, cookie);
        }
      } finally { browser.disposeContext(contextId); }
    }
    if (values['cookie-jar']) await writeCookieFile(values['cookie-jar'], [...collectedCookies.values()]);
    if (values.json) console.log(JSON.stringify(results.length === 1 ? results[0] : { results }));
    else if (binaryDump) process.stdout.write(Buffer.from(results[0].content, 'base64'));
    else if (values.dump) process.stdout.write(results[0].content);
    process.exitCode = failed ? 1 : values['fail-on-http-error'] && httpError ? 22 : 0;
  } finally { browser.close(); }
}

function navigationError(error) {
  if (['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH'].includes(error.cause?.code) || error.cause?.message === 'bad port') return 'CouldntConnect';
  if (/timeout|timed out|aborted/i.test(error.message)) return 'Timeout';
  return error.message;
}

main().catch(error => { console.error(`red-panda: ${error.message}`); process.exitCode = 1; });
