import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Browser} from '../src/browser.js';
import {spawnSync} from 'node:child_process';

async function fixture(t) {
  const browser = new Browser({loadResources: ['iframe']});
  t.after(() => browser.close());
  const page = browser.createPage();
  await page.navigate('data:text/html,<body><p id=one>first</p><section><p id=two>second</p></section><iframe></iframe>');
  return page.dom.window;
}

test('Document XPath absent contexts query the actual receiver and keep real result nodes', async t => {
  const w = await fixture(t), d = w.document;
  for (const context of [null, undefined]) {
    const result = d.evaluate('//p', context, null, w.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    assert.equal(result.snapshotLength, 2);
    assert.equal(result.snapshotItem(0), d.getElementById('one'));
    assert.equal(result.snapshotItem(1), d.getElementById('two'));
    assert.equal(result.snapshotItem(2), null);
  }
  const held = d.evaluate('//p', null, null, w.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  d.getElementById('one').remove();
  assert.equal(held.snapshotLength, 2);
  assert.equal(d.evaluate('count(//p)', null, null, w.XPathResult.NUMBER_TYPE, null).numberValue, 1);
});

test('borrowed Document XPath defaults to the genuine child receiver and preserves explicit scope', async t => {
  const w = await fixture(t), child = w.document.querySelector('iframe').contentDocument;
  const parent = child.body.appendChild(child.createElement('section'));
  const p = parent.appendChild(child.createElement('p')); p.textContent = 'child only';
  const outside = child.body.appendChild(child.createElement('p')); outside.textContent = 'outside';
  const evaluate = w.Document.prototype.evaluate;
  assert.equal(evaluate.call(child, 'count(//p)', null, null, w.XPathResult.NUMBER_TYPE, null).numberValue, 2);
  assert.equal(evaluate.call(child, 'string(./p)', parent, null, w.XPathResult.STRING_TYPE, null).stringValue, 'child only');
  assert.equal(evaluate.call(child, './p', parent, null, w.XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue, p);
  assert.equal(p.ownerDocument, child);
  assert.equal(w.document.querySelectorAll('p').length, 2);
});

test('Document XPath defaulting preserves private receiver guards without authored lookups', async t => {
  const w = await fixture(t), d = w.document, evaluate = w.Document.prototype.evaluate;
  const fake = Object.create(w.Document.prototype);
  let reads = 0;
  for (const key of ['nodeType', 'ownerDocument', 'document']) {
    Object.defineProperty(fake, key, {configurable: true, get() {reads++; throw Error('authored ' + key);}});
  }
  const proxy = new Proxy(d, {get() {reads++; throw Error('authored get');}, getPrototypeOf() {reads++; throw Error('authored prototype');}});
  for (const receiver of [null, undefined, {}, fake, proxy, d.body]) {
    assert.throws(() => evaluate.call(receiver, '//p', null, null, w.XPathResult.ANY_TYPE, null), e => e instanceof w.TypeError && e.message === 'Illegal invocation');
  }
  assert.equal(reads, 0);
});

test('unregistered standalone Document installers keep their original explicit and absent-context behavior', () => {
  const source = `import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installDocumentXPathEntries} from './src/document-member-realms.js';
import {platformFactoryRecord} from './src/platform-factories.js';
for (const runScripts of [undefined, 'outside-only']) {
 const dom = new JSDOM('<p>standalone</p>', runScripts ? {runScripts} : {});
 try {
  const w = dom.window, d = w.document;
  assert.equal(platformFactoryRecord(d), undefined);
  const original = w.Document.prototype.evaluate;
  let before;
  try {original.call(d, '//p', null, null, w.XPathResult.ANY_TYPE, null)} catch (e) {before = {name:e.name,message:e.message}}
  assert.ok(before);
  installDocumentXPathEntries(w);
  assert.equal(d.evaluate('count(//p)', d, null, w.XPathResult.NUMBER_TYPE, null).numberValue, 1);
  let after;
  try {d.evaluate('//p', null, null, w.XPathResult.ANY_TYPE, null)} catch (e) {after = {name:e.name,message:e.message}}
  assert.deepEqual(after, before);
 } finally {dom.window.close()}
}`;
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', source], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 3000
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});
