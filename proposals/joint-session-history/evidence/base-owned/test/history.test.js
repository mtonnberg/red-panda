import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Browser, until } from '../src/browser.js';
import { createFixture } from './fixture.js';

let fixture;
before(async () => { fixture = await createFixture(); });
after(async () => { await fixture.close(); });

test('history API updates URL, clones state, replaces entries and retains the document', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage(); await page.navigate(`${fixture.url}history`);
    const context = page.executionContextId, loader = page.loaderId;
    page.evaluate("const state={step:1}; history.pushState(state,'','/history?step=1'); state.step=99; documentToken='retained'");
    assert.equal(page.url, `${fixture.url}history?step=1`);
    assert.equal(page.evaluate('history.state.step'), 1);
    assert.equal(page.history[1].state.step, 1);
    const pushedId = page.history[1].id;
    page.evaluate("history.replaceState({step:2},'','/history?step=2')");
    assert.equal(page.history.length, 2);
    assert.notEqual(page.history[1].id, pushedId);
    assert.equal(page.url, `${fixture.url}history?step=2`);
    assert.equal(page.executionContextId, context); assert.equal(page.loaderId, loader);
    assert.equal(page.evaluate('documentToken'), 'retained');
  } finally { browser.close(); }
});

test('invalid history state and cross-origin URLs fail without changing history', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage(); await page.navigate(`${fixture.url}history`);
    assert.throws(() => page.evaluate("history.pushState({},'', 'https://other.test/')"), /cannot update history/);
    assert.throws(() => page.evaluate("history.pushState({fn:()=>1},'', '#bad')"), /could not be cloned/);
    assert.equal(page.history.length, 1); assert.equal(page.historyIndex, 0);
    assert.equal(page.url, `${fixture.url}history`);
  } finally { browser.close(); }
});

test('fragment links synchronize the browser URL without refetching the document', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage();
    const requests = []; page.on('request', request => requests.push(request));
    await page.navigate(`${fixture.url}history`);
    page.evaluate("documentToken='retained'; document.querySelector('#fragment').click()");
    await until(() => page.url === `${fixture.url}history#anchor`);
    assert.equal(page.evaluate('documentToken'), 'retained');
    assert.equal(page.evaluate('history.state'), null);
    assert.equal(page.history.length, 2); assert.equal(requests.length, 1);
  } finally { browser.close(); }
});

test('scripted back and forward restore state and preserve forward entries', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage(); await page.navigate(`${fixture.url}history`);
    page.evaluate("history.pushState({step:1},'','/history?step=1'); documentToken='retained'; location.hash='route'");
    await until(() => page.history.length === 3);
    page.evaluate('history.back()');
    await until(() => page.historyIndex === 1);
    assert.equal(page.evaluate('history.state.step'), 1);
    assert.equal(page.evaluate('documentToken'), 'retained');
    assert.equal(page.evaluate('history.length'), 3);
    page.evaluate('history.forward()');
    await until(() => page.historyIndex === 2);
    assert.equal(page.url, `${fixture.url}history?step=1#route`);
    assert.equal(page.evaluate('history.state'), null);
  } finally { browser.close(); }
});

test('pushing from the middle of history removes only forward entries', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage(); await page.navigate(`${fixture.url}history`);
    page.evaluate("history.pushState(1,'','?step=1'); history.pushState(2,'','?step=2')");
    await page.traverseHistory(1);
    page.evaluate("history.pushState(3,'','?step=3')");
    assert.deepEqual(page.history.map(entry => entry.url), [`${fixture.url}history`, `${fixture.url}history?step=1`, `${fixture.url}history?step=3`]);
    assert.equal(new Set(page.history.map(entry => entry.id)).size, 3);
    assert.equal(await page.traverseHistory(3), false);
    assert.equal(page.historyIndex, 2);
  } finally { browser.close(); }
});

test('traversing back from another document restores state and related same-document entries', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage(); const requests = []; page.on('request', request => requests.push(request));
    await page.navigate(`${fixture.url}history`);
    page.evaluate("history.pushState({step:1},'','?step=1');documentToken='old-document'");
    await page.navigate(`${fixture.url}next`);
    await page.traverseHistory(1, { forceReload: true });
    assert.equal(page.evaluate('history.state.step'), 1);
    assert.equal(page.evaluate('documentToken'), 'original');
    page.evaluate("documentToken='new-document'");
    await page.traverseHistory(0);
    assert.equal(page.evaluate('documentToken'), 'new-document');
    assert.equal(page.evaluate('history.state'), null);
    assert.equal(requests.length, 3);
  } finally { browser.close(); }
});

test('reload preserves the history entry and its state while replacing the JavaScript context', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage(); await page.navigate(`${fixture.url}history`);
    page.evaluate("history.replaceState({step:1},''); documentToken='changed'");
    const id = page.history[0].id, context = page.executionContextId;
    await page.navigate(page.url, { historyMode: 'reload' });
    assert.equal(page.history.length, 1); assert.equal(page.history[0].id, id);
    assert.notEqual(page.executionContextId, context);
    assert.equal(page.evaluate('documentToken'), 'original');
    assert.equal(page.evaluate('history.state.step'), 1);
  } finally { browser.close(); }
});

test('failed navigation leaves the current history and document fetch usable', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage(); await page.navigate(`${fixture.url}history`);
    await assert.rejects(page.navigate('http://127.0.0.1:1/unreachable'));
    assert.equal(page.url, `${fixture.url}history`); assert.equal(page.history.length, 1);
    const result = await page.evaluate("fetch('/header-api').then(r=>r.json()).then(data=>data['user-agent'])");
    assert.equal(result, 'RedPanda/0.1.0');
  } finally { browser.close(); }
});
