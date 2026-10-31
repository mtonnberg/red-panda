import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { JSDOM, VirtualConsole } from 'jsdom';
import { installErrors } from '../src/errors.js';

function fixture(html = '<body><button>click</button></body>', install = true) {
  const page = Object.assign(new EventEmitter(), { closed: false, documentAbort: new AbortController() });
  const errors = []; const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { errors.push(error); page.emit('pageError', error); });
  let controller;
  const dom = new JSDOM(html, { url: 'https://errors.test/page', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
    beforeParse(window) { if (install) controller = installErrors(page, window); } });
  return { dom, window: dom.window, errors, controller, page,
    close() { page.closed = true; page.documentAbort.abort(); dom.window.close(); } };
}
const tick = (ms = 25) => new Promise(resolve => setTimeout(resolve, ms));

test('reportError creates trusted realm ErrorEvents with exact values and required argument validation', () => {
  const f = fixture();
  try {
    const seen = [];
    f.window.addEventListener('error', event => { seen.push(event); event.preventDefault(); });
    const error = new f.window.Error('boom');
    for (const value of [error, undefined, null, 'text', 23, { message: 'object' }, Symbol('sym')]) f.window.reportError(value);
    assert.deepEqual(seen.map(event => event.message), ['Error: boom', 'undefined', 'null', 'text', '23', '[object Object]', 'sym']);
    assert.equal(seen[0].error, error);
    for (const event of seen) {
      assert.equal(event instanceof f.window.ErrorEvent, true); assert.equal(event.isTrusted, true);
      assert.equal(event.cancelable, true); assert.equal(typeof event.filename, 'string');
    }
    assert.equal(seen[1].error, undefined); assert.equal(seen[2].error, null); assert.equal(f.errors.length, 0);
    assert.throws(() => f.window.reportError(), error => error instanceof f.window.TypeError);
    const made = new f.window.ErrorEvent('error'); f.window.dispatchEvent(made); assert.equal(made.isTrusted, false);
  } finally { f.close(); }
});

test('window and inline body onerror receive five arguments and true suppresses only default reporting', () => {
  const f = fixture();
  try {
    const calls = []; const boom = new f.window.Error('boom');
    f.window.onerror = function (...args) { calls.push(['handler', args]); return true; };
    f.window.addEventListener('error', event => calls.push(['listener', event]));
    f.window.reportError(boom);
    assert.equal(calls[0][0], 'handler'); assert.equal(calls[0][1].length, 5);
    assert.equal(calls[0][1][0], 'Error: boom'); assert.equal(calls[0][1][4], boom);
    assert.equal(calls[1][0], 'listener'); assert.equal(f.errors.length, 0);
    f.window.onerror = null;
    const body = f.window.document.createElement('body');
    body.setAttribute('onerror', 'globalThis.bodyArgs = [event, source, lineno, colno, error]; return true;');
    f.window.reportError(boom); assert.equal(f.window.bodyArgs.length, 5); assert.equal(f.window.bodyArgs[4], boom);
    body.removeAttribute('onerror');
    f.window.reportError('unsuppressed'); assert.equal(f.errors.length, 1); assert.equal(f.errors[0].message, 'unsuppressed');
  } finally { f.close(); }
});

test('callback exceptions report once, retain realm error identity, and preserve listener removal and receivers', async () => {
  const f = fixture();
  try {
    const seen = []; f.window.addEventListener('error', event => { seen.push(event); event.preventDefault(); });
    f.window.eval(`
      const boom = name => { throw new Error(name); };
      setTimeout(() => boom('timeout'), 0);
      const interval = setInterval(() => { clearInterval(interval); boom('interval'); }, 0);
      requestAnimationFrame(() => boom('animation'));
      queueMicrotask(() => boom('microtask'));
      window.onmessage = () => boom('message'); window.postMessage('message', '*');
      new MutationObserver(() => boom('mutation')).observe(document.body, { attributes: true });
      document.body.setAttribute('data-observed', 'yes');
      const button = document.querySelector('button');
      const removed = () => boom('removed'); button.addEventListener('click', removed); button.removeEventListener('click', removed);
      button.setAttribute('onclick', 'throw new Error("attribute")'); button.click();
      button.onclick = () => boom('property'); button.click();
      const listener = { handleEvent(event) { globalThis.listenerThis = this === listener; boom('object'); } };
      button.addEventListener('other', listener); button.dispatchEvent(new Event('other'));
      globalThis.timerArgs = null;
      setTimeout(function(a, b) { timerArgs = [this === window, a, b]; }, 0, 1, 2);
    `);
    await tick(50);
    assert.deepEqual(seen.map(event => event.error.message).sort(), ['animation', 'attribute', 'interval', 'message', 'microtask', 'mutation', 'object', 'property', 'timeout']);
    assert.equal(seen.every(event => event.isTrusted && event.error instanceof f.window.Error), true);
    assert.equal(f.window.listenerThis, true); assert.deepEqual(Array.from(f.window.timerArgs), [true, 1, 2]);
    assert.equal(f.errors.length, 0);
  } finally { f.close(); }
});

test('recursive error handler failures do not recurse and hostile thrown values cannot escape host serializers', () => {
  const f = fixture();
  try {
    let calls = 0;
    f.window.onerror = () => { calls++; throw new f.window.Error('handler failure'); };
    f.window.reportError(new f.window.Error('original'));
    assert.equal(calls, 1); assert.equal(f.errors.length, 2);
    assert.deepEqual(f.errors.map(error => error.message), ['Error: handler failure', 'Error: original']);
    f.window.onerror = null;
    const hostile = Object.create(null, {
      stack: { get() { throw 1; } }, message: { get() { throw 2; } }, name: { get() { throw 3; } },
      [Symbol.toPrimitive]: { value() { throw 4; } },
    });
    f.window.reportError(hostile); f.window.reportError(null);
    assert.equal(f.errors[2].detail, hostile); assert.equal(f.errors[2].message, 'Uncaught exception');
    assert.equal(f.errors[3].message, 'null');
    f.window.document.querySelector('button').onclick = () => { throw hostile; };
    assert.doesNotThrow(() => f.window.document.querySelector('button').click());
    assert.equal(f.errors.length, 5);
  } finally { f.close(); }
});

test('classic script reporting shares trusted dispatch and cancellation without duplicate VirtualConsole errors', () => {
  const f = fixture(`<script>
    globalThis.scriptErrors = [];
    addEventListener('error', event => { scriptErrors.push(event); event.preventDefault(); });
  </script><script>throw new Error('classic failure')</script>`);
  try {
    assert.equal(f.window.scriptErrors.length, 1);
    const event = f.window.scriptErrors[0];
    assert.equal(event.isTrusted, true); assert.equal(event.message, 'Error: classic failure');
    assert.equal(event.error instanceof f.window.Error, true); assert.equal(f.errors.length, 0);
  } finally { f.close(); }
});

test('string timers execute real global scripts and safely report arbitrary thrown values', async () => {
  const f = fixture();
  try {
    const values = []; f.window.addEventListener('error', event => { values.push(event.error); event.preventDefault(); });
    f.window.eval(`globalThis.hostile = Object.create(null, { stack: { get() { throw 42; } } });
      setTimeout('let timerLexical = 17; throw hostile', 0);
      setTimeout('globalThis.lexicalSeen = timerLexical; throw null', 0);`);
    await tick();
    assert.equal(f.window.lexicalSeen, 17); assert.equal(values[0], f.window.hostile); assert.equal(values[1], null);
    assert.equal(f.errors.length, 0);
    assert.throws(() => f.window.setTimeout(Symbol('source')), error => error instanceof f.window.TypeError);
  } finally { f.close(); }
});

test('unregistered jsdom realms retain original callback reporting and disposed page callbacks are inert', async () => {
  const f = fixture(), other = fixture(undefined, false);
  try {
    other.window.eval('setTimeout(() => { throw new Error("legacy"); }, 0)');
    f.window.eval('queueMicrotask(() => { globalThis.shouldNotRun = true; throw new Error("old document"); })');
    f.controller.dispose(); await tick();
    assert.equal(other.errors.length, 1); assert.match(other.errors[0].message, /legacy/);
    assert.equal(f.window.shouldNotRun, undefined); assert.equal(f.errors.length, 0);
  } finally { f.close(); other.close(); }
});

async function child(source) {
  const setup = `import { JSDOM, VirtualConsole } from 'jsdom';
    import { installErrors } from './src/errors.js';
    const errors=[]; const vc=new VirtualConsole(); vc.on('jsdomError', e=>errors.push(e.message));
    const page={closed:false,documentAbort:new AbortController()}; let controller;
    const dom=new JSDOM('<body></body>',{runScripts:'dangerously',virtualConsole:vc,beforeParse(w){controller=installErrors(page,w)}});
    const window=dom.window;
    ${source}`;
  return await new Promise((resolve, reject) => {
    const process = spawn(globalThis.process.execPath, ['--input-type=module', '-e', setup], { cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    process.stdout.on('data', data => { stdout += data; }); process.stderr.on('data', data => { stderr += data; });
    const timeout = setTimeout(() => { process.kill(); reject(new Error('Owned rejection test timed out')); }, 5000);
    process.on('error', reject); process.on('close', code => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
  });
}

test('owned page Promise rejection events match Native untrusted delivery and late null reason', async () => {
  const result = await child(`
    window.eval(\`globalThis.events=[];
      addEventListener('unhandledrejection', e=>{events.push([e.type,e.isTrusted,e.cancelable,e.reason.message,e.promise===pending,e instanceof PromiseRejectionEvent]);e.preventDefault();});
      addEventListener('rejectionhandled', e=>events.push([e.type,e.isTrusted,e.cancelable,e.reason,e.promise===pending]));
      globalThis.pending=Promise.reject(new Error('page failure'));
      setTimeout(()=>pending.catch(()=>{}),20);\`);
    setTimeout(()=>{console.log(JSON.stringify({events:Array.from(window.events),errors}));dom.window.close()},80);
  `);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { events: [
    ['unhandledrejection', false, true, 'page failure', true, true],
    ['rejectionhandled', false, false, null, true],
  ], errors: [] });
});

test('unsuppressed async page exceptions report without killing transport and disposed realm rejections are ignored', async () => {
  const result = await child(`
    window.eval('(async()=>{throw new ReferenceError("missing observer")})()');
    setTimeout(()=>{controller.dispose();window.eval('Promise.reject(new Error("old document"))')},10);
    setTimeout(()=>{console.log(JSON.stringify(errors));dom.window.close()},50);
  `);
  assert.equal(result.code, 0, result.stderr); assert.deepEqual(JSON.parse(result.stdout), ['ReferenceError: missing observer']);
});

test('unrelated host Promise rejections remain fatal', async () => {
  const result = await child(`Promise.reject(new Error('host failure'));setTimeout(()=>dom.window.close(),50);`);
  assert.notEqual(result.code, 0); assert.match(result.stderr, /host failure/);
});
