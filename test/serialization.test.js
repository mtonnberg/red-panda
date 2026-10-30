import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter, getEventListeners } from 'node:events';
import { JSDOM, VirtualConsole } from 'jsdom';
import { installSerialization, serializeHTML } from '../src/serialization.js';
import { installShadowDOM } from '../src/shadow.js';
import { dumpDocument } from '../src/dump.js';

const nativeReport = JSON.parse(await readFile(new URL('../docs/reference/serialization-native-observation.json', import.meta.url)));
const native = nativeReport.observations;
function fixture(html = '<body></body>', { registered = true } = {}) {
  const page = Object.assign(new EventEmitter(), { closed: false, documentAbort: new AbortController() });
  const errors = [], virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error));
  let controller;
  const dom = new JSDOM(html, { url: 'https://serialization.test/', runScripts: 'dangerously', virtualConsole,
    beforeParse(window) { if (registered) { installShadowDOM(page, window); controller = installSerialization(page, window); } } });
  return { page, dom, window: dom.window, document: dom.window.document, errors, controller,
    close() { page.documentAbort.abort(); page.closed = true; dom.window.close(); } };
}

test('real attribute and text values serialize independently across inner, outer, getHTML and templates', () => {
  const f = fixture();
  try {
    for (const row of native.cases) {
      const parent = f.document.createElement('div'), child = f.document.createElement('span');
      child.setAttribute('data-value', row.value); child.textContent = row.value; parent.append(child);
      const template = f.document.createElement('template'); template.content.append(child.cloneNode(true));
      const observer = new f.window.MutationObserver(() => {}); observer.observe(parent, { subtree: true, attributes: true, childList: true });
      assert.equal(parent.innerHTML, row.inner); assert.equal(child.outerHTML, row.outer); assert.equal(parent.getHTML(), row.getHTML.value);
      assert.equal(template.innerHTML, row.template); assert.equal(child.getAttribute('data-value'), row.value);
      assert.equal(child.textContent, row.value); assert.equal(observer.takeRecords().length, 0); observer.disconnect();
    }
  } finally { f.close(); }
});

test('HTML-owned XMLSerializer uses actual HTML emission and retains public argument/receiver validation', () => {
  const f = fixture();
  try {
    const serializer = new f.window.XMLSerializer();
    for (const row of native.cases) {
      const child = f.document.createElement('span'); child.setAttribute('data-value', row.value); child.textContent = row.value;
      assert.equal(serializer.serializeToString(child), row.xml.value);
    }
    assert.throws(() => serializer.serializeToString({}), error => error instanceof f.window.TypeError);
    assert.throws(() => f.window.XMLSerializer.prototype.serializeToString.call({}, f.document.body), error => error instanceof f.window.TypeError);
  } finally { f.close(); }
});

test('document serialization keeps doctype identifiers and structural newline without changing individual doctypes', () => {
  const f = fixture('<!DOCTYPE html PUBLIC "pub" "sys"><p>x</p>');
  try {
    const serializer = new f.window.XMLSerializer(), expected = native.doctypes[1].value;
    assert.equal(f.dom.serialize(), expected.xml); assert.equal(serializer.serializeToString(f.document), expected.xml);
    assert.equal(f.document.documentElement.outerHTML, expected.html);
    assert.equal(serializer.serializeToString(f.document.doctype), native.doctypeNodes[1].value);
    const parsed = new f.window.DOMParser().parseFromString('<!DOCTYPE html><p>x</p>', 'text/html');
    assert.equal(serializer.serializeToString(parsed), native.doctypes[0].value.xml);
  } finally { f.close(); }
});

test('boolean attribute recognition preserves the measured native subset and nonempty values', () => {
  const f = fixture();
  try {
    for (const [name, expected] of native.booleanNames) {
      const element = f.document.createElement('div'); element.setAttribute(name, ''); assert.equal(element.outerHTML, expected, name);
    }
    for (const [value, expected] of native.booleanValues) {
      const element = f.document.createElement('input'); element.setAttribute('disabled', value); assert.equal(element.outerHTML, expected);
    }
  } finally { f.close(); }
});

test('raw text, RCDATA and foreign script text retain their own escaping contexts', () => {
  const f = fixture();
  try {
    for (const row of native.raw) {
      const element = f.document.createElement(row.tag); element.setAttribute('data-angle', '<tag>'); element.textContent = '<text>&"\u00a0';
      assert.equal(element.innerHTML, row.inner); assert.equal(element.outerHTML, row.outer);
    }
    const svg = f.document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('disabled', '');
    const script = f.document.createElementNS(svg.namespaceURI, 'script'); script.textContent = '<x>&'; svg.append(script);
    assert.equal(svg.outerHTML, native.foreignRaw.value.html);
    assert.equal(new f.window.XMLSerializer().serializeToString(svg), native.foreignRaw.value.xml);
    assert.equal(f.window.escaped, undefined);
  } finally { f.close(); }
});

test('qualified foreign attributes and closed shadow selections emit their real nodes without mutation', () => {
  const f = fixture();
  try {
    const svg = f.document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('data-angle', '<tag>');
    svg.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '<tag>&');
    assert.equal(svg.outerHTML, native.namespaced.value); assert.equal(svg.getAttributeNS('http://www.w3.org/1999/xlink', 'href'), '<tag>&');
    const host = f.document.createElement('div'), root = host.attachShadow({ mode: 'closed', serializable: true });
    host.innerHTML = '<b data-light="&lt;tag&gt;">light &amp;</b>'; root.innerHTML = '<i data-shadow="&lt;tag&gt;">shadow</i>';
    const observer = new f.window.MutationObserver(() => {}); observer.observe(host, { childList: true, attributes: true, subtree: true }); observer.observe(root, { childList: true, attributes: true, subtree: true });
    assert.equal(host.getHTML({ shadowRoots: [root] }), native.shadow.value.getHTML);
    assert.equal(host.getHTML(), native.shadow.value.hostInner);
    assert.equal(host.outerHTML, `<div>${native.shadow.value.hostInner}</div>`);
    assert.equal(root.getHTML(), native.shadow.value.rootGetHTML); assert.equal(root.innerHTML, native.shadow.value.rootInner);
    assert.equal(host.shadowRoot, null); assert.equal(observer.takeRecords().length, 0); observer.disconnect();
  } finally { f.close(); }
});

test('HTML dumps share the actual node serializer after cloning and stripping', () => {
  const f = fixture('<!DOCTYPE html><input disabled><a title="&lt;tag&gt;&quot;&amp;&nbsp;">x &amp;</a>');
  try {
    assert.equal(dumpDocument(f.document), nativeReport.cli.stdout);
    const script = f.document.createElement('script'); script.type = 'application/json'; script.textContent = '<tag>&'; f.document.body.append(script);
    const observer = new f.window.MutationObserver(() => {}); observer.observe(f.document, { childList: true, attributes: true, subtree: true });
    assert.equal(dumpDocument(f.document, { stripModes: ['js'] }), nativeReport.cli.stdout);
    assert.equal(script.parentNode, f.document.body); assert.equal(script.textContent, '<tag>&');
    assert.equal(dumpDocument(f.document, { selector: 'a' }), '<a title="&lt;tag&gt;&quot;&amp;&nbsp;">x &amp;</a>');
    assert.equal(observer.takeRecords().length, 0); observer.disconnect();
  } finally { f.close(); }
});

test('XML-mode documents and unregistered windows retain their namespace-aware original paths', () => {
  const f = fixture(), other = fixture('<div title="&lt;tag&gt;"></div>', { registered: false });
  try {
    const xml = new f.window.DOMParser().parseFromString('<p:root xmlns:p="urn:p" p:a="&lt;tag&gt;"/>', 'application/xml');
    const root = xml.documentElement;
    assert.equal(root.getAttributeNS('http://www.w3.org/2000/xmlns/', 'p'), 'urn:p');
    assert.equal(root.getAttributeNS('urn:p', 'a'), '<tag>');
    assert.equal(new f.window.XMLSerializer().serializeToString(xml), '<p:root xmlns:p="urn:p" p:a="&lt;tag&gt;"/>');
    assert.equal(other.document.querySelector('div').outerHTML, '<div title="<tag>"></div>');
    assert.match(new other.window.XMLSerializer().serializeToString(other.document.querySelector('div')), /xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  } finally { f.close(); other.close(); }
});

test('registration is idempotent and disposal releases lifecycle hooks and restores scoped fallback', () => {
  const f = fixture();
  try {
    assert.equal(installSerialization(f.page, f.window), f.controller);
    const before = getEventListeners(f.page.documentAbort.signal, 'abort').length;
    const child = f.document.createElement('div'); child.setAttribute('title', '<tag>'); assert.equal(child.outerHTML, '<div title="&lt;tag&gt;"></div>');
    f.controller.dispose(); f.controller.dispose();
    assert.equal(getEventListeners(f.page.documentAbort.signal, 'abort').length, before - 1);
    assert.equal(child.outerHTML, '<div title="<tag>"></div>'); assert.equal(child.getAttribute('title'), '<tag>');
    assert.equal(serializeHTML(child), '<div title="&lt;tag&gt;"></div>');
  } finally { f.close(); }
});
