#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { Browser, VERSION } from '../src/browser.js';
import { serve } from '../src/cdp.js';
import { readCookieFile, writeCookieFile, setCookie, exportCookies } from '../src/cookies.js';

const help = `Red Panda ${VERSION} — experimental headless browser (no rendering)

Usage:
  red-panda fetch [options] <URL>...   Multiple URLs require --json
  red-panda serve [--host 127.0.0.1] [--port 9222]
  red-panda version

Fetch options:
  --dump html|text|markdown|links|structured_data   Output format (default html)
  --json                 Wrap the dump and HTTP metadata in JSON
  --wait-until load|domcontentloaded|done          Readiness (default load)
  --wait-ms N             Maximum page wait in milliseconds (default 10000)
  --wait-selector CSS     Wait for a matching DOM element
  --wait-script JS        Wait for a truthy JavaScript expression
  --no-javascript         Parse HTML without running page scripts
  --fail-on-http-error    Dump HTTP errors and exit 22
  --user-agent STRING    Override the user agent
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
  const { values, positionals, tokens } = parseArgs({ args: argv, allowPositionals: true, tokens: true, options: {
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' },
    dump: { type: 'string', default: 'html' }, json: { type: 'boolean' },
    host: { type: 'string', default: '127.0.0.1' }, port: { type: 'string', default: '9222' },
    'wait-until': { type: 'string', default: 'load' }, 'wait-ms': { type: 'string', default: '10000' },
    'wait-selector': { type: 'string' }, 'wait-script': { type: 'string' },
    'no-javascript': { type: 'boolean' }, 'user-agent': { type: 'string' },
    'fail-on-http-error': { type: 'boolean' },
    'inject-script': { type: 'string', multiple: true }, 'inject-script-file': { type: 'string', multiple: true },
    cookie: { type: 'string' }, 'cookie-jar': { type: 'string' },
  } });
  if (values.version) { console.log(`RedPanda/${VERSION}`); return; }
  if (values.help || !positionals.length) { console.log(help); return; }
  const [command, ...rest] = positionals;
  if (command === 'version' || values.version) { console.log(`RedPanda/${VERSION}`); return; }
  const timeout = integer(values['wait-ms'], '--wait-ms');
  const options = { timeout, javascript: !values['no-javascript'], userAgent: values['user-agent'] };
  if (command === 'serve') {
    if (rest.length) throw new Error('serve does not accept positional arguments');
    const port = integer(values.port, '--port', 0);
    if (port > 65535) throw new Error('--port must be between 0 and 65535');
    const service = await serve({ ...options, host: values.host, port });
    console.error(`RedPanda/${VERSION} CDP listening on ${service.host}:${service.port}`);
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; await service.close(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    return;
  }
  if (command !== 'fetch' || !rest.length) throw new Error('Expected fetch <URL>..., serve, or version');
  if (rest.length > 1 && !values.json) throw new Error('Fetching multiple URLs requires --json');
  if (!['html', 'text', 'markdown', 'links', 'structured_data'].includes(values.dump)) throw new Error('Unsupported --dump format');
  if (!['load', 'domcontentloaded', 'done'].includes(values['wait-until'])) throw new Error('Unsupported --wait-until value');
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
      try {
        // Lightpanda's wait-ms is a deadline, not an unconditional delay.
        await page.navigate(url, {
          waitUntil: values['wait-until'] === 'done' ? 'networkidle0' : values['wait-until'],
          selector: values['wait-selector'], script: values['wait-script'],
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
        results.push({ url: page.status ? page.url : url, http_status: page.status ?? 0,
          headers: page.responseHeaders ?? [], dump: values.dump, content: page.dump(values.dump), error });
        httpError ||= page.status >= 400;
        if (values['cookie-jar']) for (const cookie of await exportCookies(context.cookies)) {
          collectedCookies.set(`${cookie.domain}|${cookie.path}|${cookie.name}`, cookie);
        }
      } finally { browser.disposeContext(contextId); }
    }
    if (values['cookie-jar']) await writeCookieFile(values['cookie-jar'], [...collectedCookies.values()]);
    console.log(values.json ? JSON.stringify(results.length === 1 ? results[0] : { results }) : results[0].content);
    process.exitCode = failed ? 1 : values['fail-on-http-error'] && httpError ? 22 : 0;
  } finally { browser.close(); }
}

function navigationError(error) {
  if (['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH'].includes(error.cause?.code) || error.cause?.message === 'bad port') return 'CouldntConnect';
  if (/timeout|timed out|aborted/i.test(error.message)) return 'Timeout';
  return error.message;
}

main().catch(error => { console.error(`red-panda: ${error.message}`); process.exitCode = 1; });
