import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JSDOM, VirtualConsole } from 'jsdom';
import { installShadowDOM } from '../src/shadow.js';
import { installFocus } from '../src/focus.js';

function fixture(html = '<body></body>', { beforeParse = () => {} } = {}) {
  const page = Object.assign(new EventEmitter(), { closed: false, documentAbort: new AbortController() });
  const errors = [];
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error));
  let controller;
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:9582/shadow', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
    beforeParse(window) { installFocus(window); controller = installShadowDOM(page, window); beforeParse(window, page); },
  });
  page.dom = dom;
  return { page, dom, window: dom.window, document: dom.window.document, errors, controller,
    close() { page.closed = true; page.documentAbort.abort(); page.emit('close'); dom.window.close(); } };
}

test('attachShadow reflects modern options with readonly defaults and retains host validation', () => {
  const f = fixture();
  try {
    const host = f.document.createElement('div');
    const root = host.attachShadow({ mode: 'closed', delegatesFocus: true, clonable: true, serializable: true, slotAssignment: 'manual' });
    assert.equal(host.shadowRoot, null); assert.equal(root.mode, 'closed'); assert.equal(root.host, host);
    assert.equal(root.delegatesFocus, true); assert.equal(root.clonable, true); assert.equal(root.serializable, true); assert.equal(root.slotAssignment, 'manual');
    assert.throws(() => { root.serializable = false; }, TypeError);
    const defaults = f.document.createElement('div').attachShadow({ mode: 'open' });
    assert.deepEqual([defaults.delegatesFocus, defaults.clonable, defaults.serializable, defaults.slotAssignment], [false, false, false, 'named']);
    assert.throws(() => host.attachShadow({ mode: 'closed' }), error => error.name === 'NotSupportedError');
    assert.throws(() => f.document.createElement('input').attachShadow({ mode: 'open' }), error => error.name === 'NotSupportedError');
    assert.throws(() => f.document.createElement('div').attachShadow({ mode: 'invalid' }), error => error.name === 'TypeError');
    assert.throws(() => f.document.createElement('div').attachShadow({ mode: 'open', slotAssignment: 'invalid' }), error => error.name === 'TypeError');
  } finally { f.close(); }
});

test('getHTML serializes actual qualified shadow trees before light children with deterministic flag order', () => {
  const f = fixture();
  try {
    const wrapper = f.document.createElement('div'); const host = f.document.createElement('section'); wrapper.append(host);
    const root = host.attachShadow({ mode: 'closed', delegatesFocus: true, clonable: true, serializable: true });
    root.innerHTML = '<slot></slot>'; host.innerHTML = '<span>light &amp; text</span>';
    const expected = '<section><template shadowrootmode="closed" shadowrootdelegatesfocus="" shadowrootserializable="" shadowrootclonable=""><slot></slot></template><span>light &amp; text</span></section>';
    assert.equal(wrapper.getHTML({ serializableShadowRoots: true }), expected);
    assert.equal(wrapper.getHTML({ shadowRoots: [root] }), expected);
    assert.equal(wrapper.getHTML(), wrapper.innerHTML);
    assert.equal(host.getHTML({ serializableShadowRoots: true }), expected.slice('<section>'.length, -'</section>'.length));
    assert.equal(host.getHTML(), '<span>light &amp; text</span>');
  } finally { f.close(); }
});

test('explicit closed-root lists qualify only listed roots and nested serializable roots stay independently selected', () => {
  const f = fixture();
  try {
    const host = f.document.createElement('div'); const outer = host.attachShadow({ mode: 'closed' });
    outer.innerHTML = '<p><i>light</i></p>'; const nestedHost = outer.querySelector('p');
    const inner = nestedHost.attachShadow({ mode: 'open', serializable: true }); inner.innerHTML = '<b>deep</b>';
    assert.equal(host.getHTML({ serializableShadowRoots: true }), '');
    assert.equal(host.getHTML({ shadowRoots: [outer] }), '<template shadowrootmode="closed"><p><i>light</i></p></template>');
    assert.equal(host.getHTML({ shadowRoots: new Set([outer, inner]) }), '<template shadowrootmode="closed"><p><template shadowrootmode="open" shadowrootserializable=""><b>deep</b></template><i>light</i></p></template>');
    assert.equal(outer.getHTML({ serializableShadowRoots: true }), '<p><template shadowrootmode="open" shadowrootserializable=""><b>deep</b></template><i>light</i></p>');
    assert.equal(outer.getHTML(), outer.innerHTML);
    assert.throws(() => host.getHTML({ shadowRoots: [host] }), error => error.name === 'TypeError');
    assert.throws(() => host.getHTML({ shadowRoots: null }), error => error.name === 'TypeError');
    assert.throws(() => host.getHTML('invalid'), error => error.name === 'TypeError');
  } finally { f.close(); }
});

test('serialization preserves real escaping, templates and foreign markup and makes no DOM mutations', async () => {
  const f = fixture();
  try {
    const host = f.document.createElement('div'); host.innerHTML = '<template><span title="a&amp;&quot;">&lt;text&gt;</span></template><svg viewBox="0 0 1 1"><path d="M0 0"></path></svg><!--end-->';
    const root = host.attachShadow({ mode: 'open', serializable: true }); root.innerHTML = '<script>if (1 < 2) window.escaped = "&";</script>';
    const records = []; const observer = new f.window.MutationObserver(changes => records.push(...changes));
    observer.observe(host, { subtree: true, childList: true, attributes: true }); observer.observe(root, { subtree: true, childList: true, attributes: true });
    const html = host.getHTML({ serializableShadowRoots: true });
    assert.equal(html, `<template shadowrootmode="open" shadowrootserializable="">${root.innerHTML}</template>${host.innerHTML}`);
    await Promise.resolve(); assert.equal(records.length, 0); observer.disconnect();
    assert.equal(f.window.escaped, undefined);
  } finally { f.close(); }
});

test('document parsing consumes declarative templates before a following script and supports nested closed roots', () => {
  const f = fixture('<body><div id="host"><template shadowrootmode="open" shadowrootserializable><p>shadow</p><div id="nested"><template shadowrootmode="closed" shadowrootserializable><b>deep</b></template></div></template><span>light</span></div><script>window.observed = [document.querySelector("#host").shadowRoot.querySelector("p").textContent, document.querySelector("#host").querySelector("template")];</script>');
  try {
    const host = f.document.querySelector('#host'); assert.deepEqual([...f.window.observed], ['shadow', null]);
    assert.equal(host.shadowRoot.mode, 'open'); assert.equal(host.shadowRoot.serializable, true);
    assert.equal(host.querySelector('p'), null); assert.equal(host.querySelector('span').textContent, 'light');
    assert.equal(host.shadowRoot.querySelector('#nested').shadowRoot, null);
    assert.equal(host.getHTML({ serializableShadowRoots: true }), '<template shadowrootmode="open" shadowrootserializable=""><p>shadow</p><div id="nested"><template shadowrootmode="closed" shadowrootserializable=""><b>deep</b></template></div></template><span>light</span>');
    assert.equal(f.errors.length, 0);
  } finally { f.close(); }
});

test('setHTMLUnsafe builds nested declarative roots and round trips while direct and innerHTML templates stay inert', () => {
  const f = fixture();
  try {
    const wrapper = f.document.createElement('div');
    const html = '<div><template shadowrootmode="open" shadowrootserializable=""><slot></slot></template><span>light</span></div>';
    wrapper.setHTMLUnsafe(html); assert.equal(wrapper.getHTML({ serializableShadowRoots: true }), html);
    assert.equal(wrapper.firstElementChild.shadowRoot.querySelector('slot').assignedNodes()[0].textContent, 'light');
    const ordinary = f.document.createElement('div'); ordinary.innerHTML = html;
    assert.equal(ordinary.firstElementChild.shadowRoot, null); assert.ok(ordinary.querySelector('template'));
    const direct = f.document.createElement('div'); direct.setHTMLUnsafe('<template shadowrootmode="open"><b>direct</b></template><i>light</i>');
    assert.equal(direct.shadowRoot, null); assert.equal(direct.querySelector('template').content.textContent, 'direct');
    const root = wrapper.firstElementChild.shadowRoot;
    root.setHTMLUnsafe('<p><template shadowrootmode="open"><em>nested</em></template></p>');
    assert.equal(root.querySelector('p').shadowRoot.querySelector('em').textContent, 'nested');
    assert.throws(() => wrapper.setHTMLUnsafe('<b>x</b>', { sanitizer: {} }), error => error.name === 'NotSupportedError');
  } finally { f.close(); }
});

test('invalid hosts and duplicate roots retain templates while full document template content owns declarative roots', () => {
  const f = fixture('<body><template id="inert"><div><template shadowrootmode="open"><b>inert</b></template></div></template>');
  try {
    const host = f.document.createElement('div');
    host.setHTMLUnsafe('<div id="valid"><template shadowrootmode="open"><p>first</p></template><template shadowrootmode="closed"><p>second</p></template></div><input><template shadowrootmode="bad"><b>invalid</b></template>');
    const valid = host.querySelector('#valid');
    assert.equal(valid.shadowRoot.textContent, 'first'); assert.ok(valid.querySelector('template'));
    assert.equal(host.querySelector('template[shadowrootmode=bad]').content.textContent, 'invalid');
    const content = f.document.querySelector('#inert').content;
    const inert = content.querySelector('div'), root = inert.shadowRoot;
    assert.ok(root instanceof f.window.ShadowRoot); assert.equal(root.nodeType, 11); assert.equal(root.mode, 'open');
    assert.equal(root.host, inert); assert.equal(root.textContent, 'inert');
    assert.equal(root.ownerDocument, inert.ownerDocument); assert.equal(root.ownerDocument, content.ownerDocument);
    assert.notEqual(root.ownerDocument, f.document); assert.equal(root.ownerDocument.defaultView, null);
    assert.equal(inert.isConnected, false); assert.equal(root.isConnected, false);
    assert.equal(inert.querySelector('template'), null);
  } finally { f.close(); }
});

test('custom-element disabledFeatures and connected callbacks retain their host behavior during unsafe parsing', () => {
  const f = fixture();
  try {
    let connected = 0;
    f.window.customElements.define('shadow-disabled-host', class extends f.window.HTMLElement { static get disabledFeatures() { return ['shadow']; } });
    f.window.customElements.define('shadow-custom-host', class extends f.window.HTMLElement { connectedCallback() { connected++; this.seenShadow = Boolean(this.shadowRoot); } });
    const wrapper = f.document.createElement('div'); f.document.body.append(wrapper);
    wrapper.setHTMLUnsafe('<shadow-disabled-host><template shadowrootmode="open"><b>blocked</b></template></shadow-disabled-host><shadow-custom-host><template shadowrootmode="open"><b>works</b></template></shadow-custom-host>');
    assert.equal(wrapper.querySelector('shadow-disabled-host').shadowRoot, null);
    assert.ok(wrapper.querySelector('shadow-disabled-host template'));
    assert.equal(wrapper.querySelector('shadow-custom-host').seenShadow, true); assert.equal(connected, 1);
    assert.throws(() => wrapper.querySelector('shadow-disabled-host').attachShadow({ mode: 'open' }), error => error.name === 'NotSupportedError');
    assert.equal(f.errors.length, 0);
  } finally { f.close(); }
});

test('reattaching a matching declarative root returns and empties that same root while retaining its flags', () => {
  const f = fixture();
  try {
    const wrapper = f.document.createElement('div'); wrapper.setHTMLUnsafe('<div><template shadowrootmode="open" shadowrootdelegatesfocus shadowrootclonable><b>declared</b></template></div>');
    const host = wrapper.firstElementChild;
    const declared = host.shadowRoot;
    assert.throws(() => host.attachShadow({ mode: 'closed' }), error => error.name === 'NotSupportedError');
    const reattached = host.attachShadow({ mode: 'open' }); assert.equal(reattached, declared); assert.equal(declared.childNodes.length, 0);
    assert.equal(declared.delegatesFocus, true); assert.equal(declared.clonable, true);
    assert.throws(() => host.attachShadow({ mode: 'open' }), error => error.name === 'NotSupportedError');
  } finally { f.close(); }
});

test('document-parsed shadow scripts execute before following scripts without leaking private IDs or executing inert fragment scripts', () => {
  const f = fixture('<body><div id="host"><template shadowrootmode="open"><span id="privateShadowId">private</span><script>window.shadowScriptRan = true; window.shadowScriptRoot = document.currentScript.getRootNode();</script></template></div><script>window.afterShadow = window.shadowScriptRan;</script>');
  try {
    const host = f.document.querySelector('#host'); assert.equal(f.window.shadowScriptRan, true); assert.equal(f.window.afterShadow, true);
    assert.equal(f.window.shadowScriptRoot, host.shadowRoot); assert.equal(f.document.getElementById('privateShadowId'), null);
    assert.equal(f.window.privateShadowId, undefined);
    const wrapper = f.document.createElement('div'); f.document.body.append(wrapper);
    wrapper.setHTMLUnsafe('<div><template shadowrootmode="open"><script>window.unsafeShadowScriptRan = true;</script></template></div>');
    assert.equal(f.window.unsafeShadowScriptRan, undefined); assert.equal(f.errors.length, 0);
  } finally { f.close(); }
});

test('clonable shadow roots are deeply cloned even for shallow hosts including nested roots and independent nodes', () => {
  const f = fixture();
  try {
    const host = f.document.createElement('div'); host.innerHTML = '<i>light</i>';
    const root = host.attachShadow({ mode: 'open', clonable: true, serializable: true, delegatesFocus: true });
    root.innerHTML = '<input value="a"><p><b>nested</b></p>';
    const nested = root.querySelector('p').attachShadow({ mode: 'closed', clonable: true, serializable: true }); nested.innerHTML = '<span>deep</span>';
    const shallow = host.cloneNode(false); assert.equal(shallow.childNodes.length, 0);
    assert.equal(shallow.shadowRoot.children.length, 2); assert.equal(shallow.shadowRoot.clonable, true);
    assert.equal(shallow.shadowRoot.delegatesFocus, true); assert.equal(shallow.shadowRoot.serializable, true);
    assert.equal(shallow.shadowRoot.getHTML({ serializableShadowRoots: true }), root.getHTML({ serializableShadowRoots: true }));
    assert.notEqual(shallow.shadowRoot.querySelector('input'), root.querySelector('input'));
    shallow.shadowRoot.querySelector('input').value = 'changed'; assert.equal(root.querySelector('input').value, 'a');
    const deep = host.cloneNode(true); assert.equal(deep.innerHTML, '<i>light</i>');
    const normal = f.document.createElement('div'); normal.attachShadow({ mode: 'open' }); assert.equal(normal.cloneNode(true).shadowRoot, null);
    assert.throws(() => root.cloneNode(true), error => error.name === 'NotSupportedError');
  } finally { f.close(); }
});

test('named slots preserve actual assignment, closed root isolation and slotchange behavior', async () => {
  const f = fixture();
  try {
    const host = f.document.createElement('div'); f.document.body.append(host);
    const root = host.attachShadow({ mode: 'closed', serializable: true }); root.innerHTML = '<slot name="named"></slot><slot></slot>';
    const named = root.querySelector('[name]'), normal = root.querySelector('slot:not([name])'); let changes = 0;
    named.addEventListener('slotchange', () => changes++);
    const child = f.document.createElement('span'); child.slot = 'named'; child.textContent = 'light'; host.append(child);
    assert.equal(named.assignedNodes()[0], child); assert.equal(child.assignedSlot, null); assert.equal(host.shadowRoot, null);
    child.slot = ''; assert.equal(normal.assignedNodes()[0], child); assert.equal(named.assignedNodes().length, 0);
    await Promise.resolve(); assert.ok(changes > 0);
    assert.match(host.getHTML({ serializableShadowRoots: true }), /<slot name="named"><\/slot>/);
  } finally { f.close(); }
});

test('manual slots assign real nodes in explicit order, exclude automatic assignment and use the composed event path', async () => {
  const f = fixture();
  try {
    const host = f.document.createElement('div'); host.innerHTML = '<b id="a">A</b><i id="b">B</i>'; f.document.body.append(host);
    const root = host.attachShadow({ mode: 'open', slotAssignment: 'manual' }); root.innerHTML = '<slot>fallback</slot>';
    const slot = root.querySelector('slot'), a = host.querySelector('#a'), b = host.querySelector('#b');
    let changes = 0; slot.addEventListener('slotchange', () => changes++);
    await Promise.resolve(); changes = 0;
    assert.deepEqual([...slot.assignedNodes()], []); assert.equal(a.assignedSlot, null);
    assert.equal(slot.assignedNodes({ flatten: true })[0].textContent, 'fallback');
    let observedPath;
    root.addEventListener('custom', event => { observedPath = event.composedPath(); });
    a.dispatchEvent(new f.window.Event('custom', { bubbles: true, composed: true })); assert.equal(observedPath, undefined);
    slot.assign(b, a, b);
    assert.deepEqual([...slot.assignedNodes()], [b, a]); assert.deepEqual([...slot.assignedElements()], [b, a]);
    assert.equal(a.assignedSlot, slot);
    a.dispatchEvent(new f.window.Event('custom', { bubbles: true, composed: true }));
    assert.equal(observedPath.includes(slot), true); assert.equal(observedPath.includes(root), true);
    await Promise.resolve(); assert.equal(changes, 1);
    changes = 0; a.slot = 'different'; slot.name = 'changed'; await Promise.resolve();
    assert.equal(changes, 0); assert.deepEqual([...slot.assignedNodes()], [b, a]);
  } finally { f.close(); }
});

test('manual assignments track reassignment, detached nodes and slots, fallback flattening and closed-root isolation', async () => {
  const f = fixture();
  try {
    const host = f.document.createElement('div'); f.document.body.append(host);
    const text = f.document.createTextNode('text'), child = f.document.createElement('span'); host.append(text, child);
    const root = host.attachShadow({ mode: 'closed', slotAssignment: 'manual' }); root.innerHTML = '<slot id="outer"><slot id="inner">fallback</slot></slot><slot id="other"></slot>';
    const outer = root.querySelector('#outer'), inner = root.querySelector('#inner'), other = root.querySelector('#other');
    inner.assign(child, text); assert.deepEqual([...outer.assignedNodes({ flatten: true })], [child, text]);
    assert.equal(child.assignedSlot, null); assert.equal(text.assignedSlot, null);
    other.assign(child); assert.deepEqual([...inner.assignedNodes()], [text]); assert.deepEqual([...other.assignedNodes()], [child]);
    let oldRootEvents = 0; root.addEventListener('moved', () => oldRootEvents++);
    const ordinary = f.document.createElement('div'); f.document.body.append(ordinary);
    ordinary.append(child); assert.deepEqual([...other.assignedNodes()], []);
    child.dispatchEvent(new f.window.Event('moved', { bubbles: true, composed: true }));
    assert.equal(oldRootEvents, 0);
    host.append(child); assert.deepEqual([...other.assignedNodes()], [child]);
    other.remove(); assert.deepEqual([...other.assignedNodes()], []);
    root.append(other); assert.deepEqual([...other.assignedNodes()], [child]);
    inner.assign(); assert.deepEqual([...inner.assignedNodes()], []); assert.equal(inner.assignedNodes({ flatten: true })[0].textContent, 'fallback');
    assert.throws(() => inner.assign(f.document.createComment('invalid')), error => error.name === 'TypeError');
    await Promise.resolve();
  } finally { f.close(); }
});

test('slot.assign does not replace named assignment and cloning manual roots does not copy original node associations', () => {
  const f = fixture();
  try {
    const namedHost = f.document.createElement('div'); namedHost.innerHTML = '<b>A</b><i slot="named">B</i>';
    const namedRoot = namedHost.attachShadow({ mode: 'open' }); namedRoot.innerHTML = '<slot></slot><slot name="named"></slot>';
    const namedSlot = namedRoot.querySelector('slot'); namedSlot.assign(namedHost.querySelector('i'));
    assert.deepEqual([...namedSlot.assignedNodes()], [namedHost.querySelector('b')]);
    const manualHost = f.document.createElement('div'); manualHost.innerHTML = '<b>Manual</b>';
    const manualRoot = manualHost.attachShadow({ mode: 'open', slotAssignment: 'manual', clonable: true }); manualRoot.innerHTML = '<slot></slot>';
    const originalSlot = manualRoot.querySelector('slot'), child = manualHost.querySelector('b'); originalSlot.assign(child);
    const clone = manualHost.cloneNode(true);
    assert.equal(clone.shadowRoot.slotAssignment, 'manual'); assert.deepEqual([...clone.shadowRoot.querySelector('slot').assignedNodes()], []);
    assert.deepEqual([...originalSlot.assignedNodes()], [child]);
  } finally { f.close(); }
});

test('delegatesFocus uses actual host focus and preserves document and root activeElement retargeting', () => {
  const f = fixture();
  try {
    const host = f.document.createElement('div'); f.document.body.append(host);
    const root = host.attachShadow({ mode: 'closed', delegatesFocus: true }); root.innerHTML = '<button disabled>No</button><input><button>Next</button>';
    const input = root.querySelector('input'); let focused = 0; input.addEventListener('focus', event => { focused++; assert.equal(event.isTrusted, true); });
    host.focus(); assert.equal(f.document.activeElement, host); assert.equal(root.activeElement, input); assert.equal(focused, 1);
    host.focus(); assert.equal(focused, 1);
  } finally { f.close(); }
});

test('template shadow attributes reflect without activating arbitrary inserted templates and style adoption fails explicitly', () => {
  const f = fixture();
  try {
    const template = f.document.createElement('template'); assert.equal(template.shadowRootMode, ''); assert.equal(template.shadowRootClonable, false);
    template.shadowRootMode = 'OPEN'; assert.equal(template.shadowRootMode, 'open'); assert.equal(template.getAttribute('shadowrootmode'), 'OPEN');
    template.shadowRootMode = 'invalid'; assert.equal(template.shadowRootMode, '');
    template.shadowRootDelegatesFocus = true; template.shadowRootClonable = true; template.shadowRootSerializable = true;
    assert.equal(template.hasAttribute('shadowrootdelegatesfocus'), true); template.shadowRootClonable = false;
    assert.equal(template.hasAttribute('shadowrootclonable'), false); assert.equal(template.shadowRootSerializable, true);
    const host = f.document.createElement('div'); template.shadowRootMode = 'open'; host.append(template);
    assert.equal(host.shadowRoot, null);
    const root = host.attachShadow({ mode: 'open' });
    assert.throws(() => root.adoptedStyleSheets, error => error.name === 'NotSupportedError');
    assert.throws(() => { root.adoptedStyleSheets = []; }, error => error.name === 'NotSupportedError');
  } finally { f.close(); }
});

test('unregistered parser documents retain jsdom defaults and disposing registered documents removes Page listeners', () => {
  const f = fixture(); const ordinary = new JSDOM('<div><template shadowrootmode="open"><b>inert</b></template></div>');
  try {
    const host = ordinary.window.document.querySelector('div'); assert.equal(host.shadowRoot, null); assert.ok(host.querySelector('template'));
    const root = host.attachShadow({ mode: 'open', serializable: true }); assert.equal(root.serializable, undefined);
    assert.equal(typeof host.getHTML, 'undefined');
    assert.equal(f.page.listenerCount('close'), 1); f.controller.dispose(); assert.equal(f.page.listenerCount('close'), 0);
    assert.throws(() => f.document.createElement('div').setHTMLUnsafe('x'), error => error.name === 'InvalidStateError');
  } finally { f.close(); ordinary.window.close(); }
});

test('document abort and Window close suppress queued native slotchange callbacks from the disposed document', async () => {
  for (const reason of ['abort', 'close']) {
    const f = fixture();
    try {
      const host = f.document.createElement('div'); f.document.body.append(host);
      const root = host.attachShadow({ mode: 'open', slotAssignment: 'manual' }); root.innerHTML = '<slot></slot>';
      const slot = root.querySelector('slot'), child = f.document.createElement('b'); host.append(child);
      let changes = 0; slot.addEventListener('slotchange', () => changes++); slot.assign(child);
      if (reason === 'abort') f.page.documentAbort.abort(); else f.window.close();
      await Promise.resolve(); await Promise.resolve(); assert.equal(changes, 0, reason);
      assert.equal(f.page.listenerCount('close'), 0);
    } finally { f.close(); }
  }
});
