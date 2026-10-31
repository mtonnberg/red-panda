import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Browser } from '../src/browser.js';
import { createFixture } from './fixture.js';
import { installNavigation } from '../src/navigation.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 10));

function fixture(html = '', { register = true } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:9582/start', runScripts: 'outside-only', virtualConsole });
  const calls = [], reconciled = [];
  const page = Object.assign(new EventEmitter(), {
    closed: false, dom, documentAbort: new AbortController(), url: dom.window.location.href,
    navigate: async (url, options) => { calls.push({ url, options, pendingAtStart: page.pendingNavigation }); return { url }; },
    reconcileURL(window, options) { page.url = window.location.href; reconciled.push({ url: page.url, options }); },
  });
  const controller = register ? installNavigation(page, dom.window) : null;
  return { page, dom, window: dom.window, calls, reconciled, errors, controller,
    close() { page.closed = true; page.documentAbort.abort(); page.emit('close'); dom.window.close(); } };
}

test('Location.assign and href setters queue full navigation without changing public descriptors', async () => {
  const f = fixture();
  try {
    await tick();
    const descriptor = Object.getOwnPropertyDescriptor(f.window.location, 'href');
    assert.equal(descriptor.configurable, false);
    assert.equal(f.window.location.assign('/next'), undefined);
    const pending = f.page.pendingNavigation;
    assert.equal(pending.url, 'http://127.0.0.1:9582/next');
    assert.equal(pending.started, false); assert.equal(f.calls.length, 0);
    await pending.promise;
    assert.deepEqual(f.calls[0], { url: 'http://127.0.0.1:9582/next', options: { historyMode: 'push', referrer: 'http://127.0.0.1:9582/start' }, pendingAtStart: null });
    f.window.location.href = '/href-target';
    await f.page.pendingNavigation.promise;
    assert.equal(f.calls[1].url, 'http://127.0.0.1:9582/href-target');
    assert.equal(Object.getOwnPropertyDescriptor(f.window.location, 'href').set, descriptor.set);
    assert.equal(Object.hasOwn(f.window, 'page'), false);
  } finally { f.close(); }
});

test('replace and reload pass their history modes to the owning Page', async () => {
  const f = fixture();
  try {
    f.window.location.replace('/replacement'); await f.page.pendingNavigation.promise;
    f.window.location.reload(); await f.page.pendingNavigation.promise;
    assert.deepEqual(f.calls.map(call => call.options.historyMode), ['replace', 'reload']);
    assert.equal(f.calls[1].url, 'http://127.0.0.1:9582/start');
  } finally { f.close(); }
});

test('ordinary anchor defaults navigate only after an uncanceled click', async () => {
  const f = fixture('<a id="link" href="/destination">Next</a>');
  try {
    const link = f.window.document.querySelector('a');
    link.addEventListener('click', event => event.preventDefault(), { once: true });
    link.click(); await tick(); assert.equal(f.page.pendingNavigation, undefined); assert.equal(f.calls.length, 0);
    link.click(); const pending = f.page.pendingNavigation;
    assert.equal(pending.url, 'http://127.0.0.1:9582/destination'); await pending.promise;
    assert.equal(f.calls.length, 1);
  } finally { f.close(); }
});

test('anchor resolution respects base href and target, and noreferrer suppresses its referrer', async () => {
  const f = fixture('<base href="http://127.0.0.1:9582/base/"><base target="_self"><a href="child" rel="noreferrer">Next</a>');
  try {
    f.window.document.querySelector('a').click(); await f.page.pendingNavigation.promise;
    assert.equal(f.calls[0].url, 'http://127.0.0.1:9582/base/child');
    assert.equal(f.calls[0].options.referrer, '');
  } finally { f.close(); }
});

test('location and anchor fragments keep jsdom same-document behavior rather than fetching', async () => {
  const f = fixture('<a href="#anchor">Fragment</a>');
  try {
    f.window.location.hash = 'direct';
    assert.equal(f.window.location.href, 'http://127.0.0.1:9582/start#direct');
    assert.equal(f.page.pendingNavigation, undefined);
    f.window.location.replace('#replacement');
    assert.equal(f.reconciled.at(-1).options.historyMode, 'replace');
    f.window.document.querySelector('a').click(); await tick();
    assert.equal(f.window.location.hash, '#anchor'); assert.equal(f.calls.length, 0);
    assert.equal(f.page.url, f.window.location.href);
  } finally { f.close(); }
});

test('successive same-task assignments supersede queued work and earlier callers follow the final promise', async () => {
  const f = fixture();
  try {
    f.window.location.assign('/first'); const first = f.page.pendingNavigation;
    f.window.location.assign('/second'); const second = f.page.pendingNavigation;
    assert.equal(first.supersededBy, second);
    const [a, b] = await Promise.all([first.promise, second.promise]);
    assert.deepEqual(a, b); assert.equal(a.url, 'http://127.0.0.1:9582/second');
    assert.deepEqual(f.calls.map(call => call.url), ['http://127.0.0.1:9582/second']);
  } finally { f.close(); }
});

test('document abort, Page close and Window close cancel queued work and settle its promise', async () => {
  for (const reason of ['document', 'page', 'window']) {
    const f = fixture();
    try {
      f.window.location.assign('/next'); const pending = f.page.pendingNavigation;
      if (reason === 'document') f.page.documentAbort.abort();
      if (reason === 'page') { f.page.closed = true; f.page.emit('close'); }
      if (reason === 'window') f.window.close();
      await assert.rejects(pending.promise, error => error.name === 'AbortError');
      await tick(); assert.equal(f.calls.length, 0); assert.equal(f.page.pendingNavigation, null);
    } finally { f.close(); }
  }
});

test('closing the source document after a child navigation starts does not reject that child', async () => {
  const f = fixture();
  try {
    let complete;
    f.page.navigate = () => new Promise(resolve => { complete = resolve; });
    f.window.location.assign('/next'); const pending = f.page.pendingNavigation;
    await tick(); assert.equal(pending.started, true); assert.equal(f.page.pendingNavigation, null);
    f.page.documentAbort.abort(); complete({ url: 'http://127.0.0.1:9582/next' });
    assert.deepEqual(await pending.promise, { url: 'http://127.0.0.1:9582/next' });
  } finally { f.close(); }
});

test('asynchronous child errors remain observable without becoming global unhandled rejections', async () => {
  const f = fixture();
  try {
    f.page.navigate = () => Promise.reject(new Error('fixture network failure'));
    f.window.location.assign('/failure'); const pending = f.page.pendingNavigation;
    await assert.rejects(pending.promise, /fixture network failure/);
    assert.equal(pending.error.message, 'fixture network failure');
  } finally { f.close(); }
});

test('unsupported schemes, new contexts, downloads and modified activation fail explicitly', async () => {
  const f = fixture('<a id="blank" target="_blank" href="/new">New</a><a id="download" download href="/file">File</a><a id="modified" href="/next">Next</a>');
  try {
    assert.throws(() => f.window.location.assign('ftp://127.0.0.1/file'), error => error.name === 'NotSupportedError');
    assert.throws(() => f.window.document.querySelector('#blank').click(), /target _blank/);
    assert.throws(() => f.window.document.querySelector('#download').click(), /downloads are not implemented/);
    assert.throws(() => f.window.document.querySelector('#modified').dispatchEvent(new f.window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })), /another browsing context/);
    assert.equal(f.page.pendingNavigation, undefined);
    const recovered = f.window.document.querySelector('#blank'); recovered.removeAttribute('target'); recovered.click();
    await f.page.pendingNavigation.promise;
    assert.equal(f.calls[0].url, 'http://127.0.0.1:9582/new');
  } finally { f.close(); }
});

test('unregistered documents retain original jsdom navigation implementations', async () => {
  const registered = fixture();
  const ordinary = fixture('', { register: false });
  try {
    ordinary.window.location.hash = 'native'; assert.equal(ordinary.window.location.hash, '#native');
    ordinary.window.location.assign('/jsdom-unimplemented'); await tick();
    assert.ok(ordinary.errors.some(error => /navigation/.test(error.message)));
    assert.equal(registered.calls.length, 0); assert.equal(ordinary.calls.length, 0);
  } finally { registered.close(); ordinary.close(); }
});

test('the bridge performs a real independently fetched navigation through Browser', async () => {
  const server = await createFixture(); const browser = new Browser();
  try {
    const page = browser.createPage();
    const original = page.installHistory.bind(page);
    page.installHistory = (window, state) => { original(window, state); installNavigation(page, window); };
    await page.navigate(`${server.url}history`);
    page.evaluate("location.assign('/next')");
    const pending = page.pendingNavigation; await pending.promise;
    assert.equal(page.url, `${server.url}next`);
    assert.equal(page.evaluate('document.title'), 'Next page');
    assert.equal(page.navigationHistory().entries.at(-1).url, `${server.url}next`);
  } finally { browser.close(); await server.close(); }
});
