import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JSDOM, VirtualConsole } from 'jsdom';
import { installShadowDOM } from '../src/shadow.js';
import { installStyles, getStyleRevision } from '../src/styles.js';

function fixture(html = '<body></body>') {
  const page = Object.assign(new EventEmitter(), { closed: false, documentAbort: new AbortController() });
  const errors = []; const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error));
  let controller;
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:9582/styles', runScripts: 'dangerously', virtualConsole,
    beforeParse(window) { installShadowDOM(page, window); controller = installStyles(page, window); } });
  page.dom = dom;
  return { page, dom, window: dom.window, document: dom.window.document, controller, errors,
    element: selector => dom.window.document.querySelector(selector),
    close() { page.closed = true; page.documentAbort.abort(); page.emit('close'); dom.window.close(); } };
}

test('constructed stylesheets parse real CSSOM rules, keep live rule arrays and replace asynchronously with locking', async () => {
  const f = fixture();
  try {
    const sheet = new f.window.CSSStyleSheet(); const rules = sheet.cssRules;
    assert.equal(typeof f.window.CSSStyleSheet.prototype.replaceSync, 'function');
    assert.equal(sheet instanceof f.window.CSSStyleSheet, true); assert.equal(sheet.ownerNode, null); assert.equal(sheet.href, null);
    sheet.replaceSync('.first { color: red } @keyframes spin { from { opacity: 0 } to { opacity: 1 } }');
    assert.equal(sheet.cssRules, rules); assert.equal(rules.length, 2); assert.equal(rules[0].selectorText, '.first');
    assert.equal(rules[0].style.parentRule, rules[0]); assert.equal(rules[0].parentStyleSheet, sheet);
    assert.equal(rules[1].type, 7);
    const replacement = sheet.replace('.next { width: 25px }');
    assert.equal(replacement instanceof f.window.Promise, true);
    assert.throws(() => sheet.replaceSync('.blocked {}'), error => error.name === 'NotAllowedError');
    assert.throws(() => sheet.insertRule('.blocked {}'), error => error.name === 'NotAllowedError');
    assert.equal(await replacement, sheet); assert.equal(rules.length, 1); assert.equal(rules[0].selectorText, '.next');
    const other = new f.window.CSSStyleSheet(); sheet.replaceSync.call(other, '.borrowed { height: 4px }');
    assert.equal(other.cssRules[0].selectorText, '.borrowed'); assert.equal(sheet.cssRules[0].selectorText, '.next');
  } finally { f.close(); }
});

test('adopted sheets cause real computed effects while Document.styleSheets remains a list of DOM sheets', () => {
  const f = fixture('<style>.target { width: 10px; color: red }</style><div class="target"></div>');
  try {
    const target = f.element('div'), sheet = new f.window.CSSStyleSheet(); sheet.replaceSync('.target { width: 30px; color: blue }');
    const computed = f.window.getComputedStyle(target);
    assert.equal(computed.width, '10px'); assert.equal(f.document.styleSheets.length, 1);
    f.document.adoptedStyleSheets = [sheet];
    assert.equal(computed.width, '30px'); assert.equal(computed.color, 'rgb(0, 0, 255)'); assert.equal(f.document.styleSheets.length, 1);
    f.document.adoptedStyleSheets = []; assert.equal(computed.width, '10px'); assert.equal(computed.color, 'rgb(255, 0, 0)');
  } finally { f.close(); }
});

test('adopted lists mutate actual styles, detach old arrays on assignment and validate written sheets', () => {
  const f = fixture('<div></div>');
  try {
    const first = new f.window.CSSStyleSheet(), second = new f.window.CSSStyleSheet();
    first.replaceSync('div { color: red }'); second.replaceSync('div { color: blue }');
    const list = f.document.adoptedStyleSheets;
    assert.equal(Array.isArray(list), true); assert.equal(list instanceof f.window.Array, true);
    list.push(first); assert.equal(f.window.getComputedStyle(f.element('div')).color, 'rgb(255, 0, 0)');
    list.unshift(second, first); assert.equal(list.length, 3);
    assert.equal(list.pop(), first); assert.equal(f.window.getComputedStyle(f.element('div')).color, 'rgb(255, 0, 0)');
    list.splice(0, 2, second); assert.equal(list.length, 1); assert.equal(f.window.getComputedStyle(f.element('div')).color, 'rgb(0, 0, 255)');
    assert.throws(() => list.push(first, {}), error => error.name === 'NotAllowedError'); assert.equal(list.length, 1);
    f.document.adoptedStyleSheets = [first]; const current = f.document.adoptedStyleSheets;
    assert.notEqual(current, list); assert.equal(current[0], first);
    list.push(second); assert.equal(current.length, 1); assert.equal(f.window.getComputedStyle(f.element('div')).color, 'rgb(255, 0, 0)');
    assert.throws(() => { f.document.adoptedStyleSheets = [second, {}]; }, error => error.name === 'NotAllowedError'); assert.equal(current[0], first);
    current[3] = second; assert.equal(current.length, 4); assert.equal(f.window.getComputedStyle(f.element('div')).color, 'rgb(0, 0, 255)');
    delete current[3]; assert.equal(current.length, 4); assert.equal(f.window.getComputedStyle(f.element('div')).color, 'rgb(255, 0, 0)');
    current.length = 5; assert.equal(current.length, 5); assert.equal(f.window.getComputedStyle(f.element('div')).color, 'rgb(255, 0, 0)');
    current.length = 0; assert.equal(current.length, 0);
  } finally { f.close(); }
});

test('only constructed stylesheets from the same document can be adopted', async () => {
  const f = fixture('<style>div { color: red }</style>'), other = fixture();
  try {
    const regular = f.element('style').sheet;
    assert.equal(regular instanceof f.window.CSSStyleSheet, true);
    assert.throws(() => { f.document.adoptedStyleSheets = [regular]; }, error => error.name === 'NotAllowedError');
    regular.replaceSync('div {display:none}');assert.equal(regular.cssRules[0].style.display,'none');assert.equal(f.element('style').textContent,'div { color: red }');
    assert.equal(await regular.replace('span {display:block}'),regular);assert.equal(regular.cssRules[0].selectorText,'span');
    const foreign = new other.window.CSSStyleSheet();
    assert.throws(() => { f.document.adoptedStyleSheets = [foreign]; }, error => error.name === 'NotAllowedError');
    assert.throws(() => { f.document.adoptedStyleSheets = null; }, error => error.name === 'TypeError');
    assert.throws(() => new f.window.CSSStyleSheet({ baseURL: '/other' }), error => error.name === 'NotSupportedError');
  } finally { f.close(); other.close(); }
});

test('specificity, selector lists and source order choose only matching selectors before inline styles', () => {
  const f = fixture('<div id="target" class="target" data-x="yes"></div>');
  try {
    const sheet = new f.window.CSSStyleSheet();
    sheet.replaceSync('#target { width: 10px } .target { width: 20px } #missing, div { height: 1px } [data-x] { height: 2px } .target { color: red } .target { color: blue }');
    f.document.adoptedStyleSheets = [sheet];
    const target = f.element('div'), computed = f.window.getComputedStyle(target);
    assert.equal(computed.width, '10px'); assert.equal(computed.height, '2px'); assert.equal(computed.color, 'rgb(0, 0, 255)');
    target.style.width = '40px'; assert.equal(computed.width, '40px');
    target.removeAttribute('id'); assert.equal(computed.width, '40px'); target.style.width = ''; assert.equal(computed.width, '20px');
  } finally { f.close(); }
});

test('case-insensitive declarations and :where specificity preserve real rules and root display blockification', () => {
  const f = fixture('<div id="target" class="target"></div>');
  try {
    const sheet = new f.window.CSSStyleSheet(); sheet.replaceSync(':where(#target) { WIDTH: 40px; COLOR: RED } .target { width: 20px } html { display: contents }');
    f.document.adoptedStyleSheets = [sheet];
    const computed = f.window.getComputedStyle(f.element('div'));
    assert.equal(computed.width, '20px'); assert.equal(computed.color, 'rgb(255, 0, 0)');
    assert.equal(f.window.getComputedStyle(f.document.documentElement).display, 'block');
  } finally { f.close(); }
});

test('important declarations outrank normal inline styles and shorthand longhands participate in the cascade', () => {
  const f = fixture('<div id="target" class="target" style="width: 3px; margin-left: 2px"></div>');
  try {
    const sheet = new f.window.CSSStyleSheet(); sheet.replaceSync('.target { width: 50px !important; margin-left: 9px } #target { margin: 12px !important; color: blue !important } div { color: red }');
    f.document.adoptedStyleSheets = [sheet]; const target = f.element('div'), computed = f.window.getComputedStyle(target);
    assert.equal(computed.width, '50px'); assert.equal(computed.marginLeft, '12px'); assert.equal(computed.color, 'rgb(0, 0, 255)');
    target.style.setProperty('width', '4px', 'important'); target.style.setProperty('margin-left', '5px', 'important');
    assert.equal(computed.width, '4px'); assert.equal(computed.marginLeft, '5px');
  } finally { f.close(); }
});

test('overflow shorthand supplies both axes and longhands retain source order and declaration importance', () => {
  const f = fixture('<div id="target" class="target" style="overflow:auto"></div>');
  try {
    const target = f.element('div'), computed = f.window.getComputedStyle(target);
    assert.deepEqual([computed.overflow, computed.overflowX, computed.overflowY], ['auto', 'auto', 'auto']);
    target.style.cssText = 'overflow:hidden scroll';
    assert.deepEqual([computed.overflow, computed.overflowX, computed.overflowY], ['hidden scroll', 'hidden', 'scroll']);
    target.style.cssText = 'overflow:scroll; overflow-y:hidden';
    assert.deepEqual([computed.overflowX, computed.overflowY], ['scroll', 'hidden']);
    target.style.cssText = 'overflow-y:hidden; overflow:scroll';
    assert.deepEqual([computed.overflowX, computed.overflowY], ['scroll', 'scroll']);
    target.style.cssText = 'overflow:auto !important; overflow-y:hidden';
    assert.deepEqual([computed.overflowX, computed.overflowY], ['auto', 'auto']);
    target.style.cssText = 'overflow-x:clip; overflow-y:auto';
    assert.deepEqual([computed.overflowX, computed.overflowY], ['hidden', 'auto']);
    target.style.cssText = 'overflow-x:visible; overflow-y:scroll';
    assert.deepEqual([computed.overflowX, computed.overflowY], ['auto', 'scroll']);
    target.style.cssText = '';
    const sheet = new f.window.CSSStyleSheet(); sheet.replaceSync('#target { overflow:hidden scroll !important } .target { overflow-y:auto }');
    f.document.adoptedStyleSheets = [sheet];
    assert.deepEqual([computed.overflowX, computed.overflowY], ['hidden', 'scroll']);
    target.style.setProperty('overflow-y', 'hidden', 'important');
    assert.deepEqual([computed.overflowX, computed.overflowY], ['hidden', 'hidden']);
  } finally { f.close(); }
});

test('overflow axes handle explicit inheritance, unset, and variable-valued shorthand without becoming implicitly inherited', () => {
  const f = fixture('<div style="overflow:hidden scroll;--overflow:clip visible"><span></span></div>');
  try {
    const child = f.element('span'), computed = f.window.getComputedStyle(child);
    assert.deepEqual([computed.overflowX, computed.overflowY], ['visible', 'visible']);
    child.style.overflow = 'inherit';
    assert.deepEqual([computed.overflowX, computed.overflowY], ['hidden', 'scroll']);
    child.style.overflow = 'unset';
    assert.deepEqual([computed.overflowX, computed.overflowY], ['visible', 'visible']);
    child.style.overflow = 'var(--overflow)';
    assert.deepEqual([computed.overflowX, computed.overflowY], ['var(--overflow)', 'var(--overflow)']);
    child.style.setProperty('--overflow', 'hidden auto');
    assert.deepEqual([computed.overflowX, computed.overflowY], ['var(--overflow)', 'var(--overflow)']);
  } finally { f.close(); }
});

test('rule insertion, deletion, selector changes and declaration mutations update retained computed styles', () => {
  const f = fixture('<div class="target"></div>');
  try {
    const sheet = new f.window.CSSStyleSheet(); sheet.replaceSync('.target { width: 10px }'); f.document.adoptedStyleSheets = [sheet];
    const computed = f.window.getComputedStyle(f.element('div'));
    assert.equal(computed.width, '10px');
    sheet.cssRules[0].style.width = '20px'; assert.equal(computed.width, '20px');
    sheet.cssRules[0].style.setProperty('height', '30px'); assert.equal(computed.height, '30px');
    sheet.insertRule('.target { width: 40px !important }', 1); assert.equal(computed.width, '40px');
    sheet.deleteRule(1); assert.equal(computed.width, '20px');
    sheet.cssRules[0].selectorText = '.missing'; assert.equal(computed.width, 'auto');
    sheet.cssRules[0].selectorText = '.target'; sheet.cssRules[0].style.removeProperty('width'); assert.equal(computed.width, 'auto');
    assert.throws(() => sheet.insertRule('a {} b {}'), error => error.name === 'SyntaxError');
    assert.throws(() => sheet.deleteRule(99), error => error.name === 'IndexSizeError');
    assert.throws(() => sheet.insertRule('@import url("/other.css")'), error => error.name === 'SyntaxError');
  } finally { f.close(); }
});

test('inherited properties and CSS-wide keywords resolve through ancestors with independent initial values', () => {
  const f = fixture('<div id="parent" style="color:red;font-style:italic;isolation:isolate"><span id="child"></span></div>');
  try {
    const parent = f.element('#parent'), child = f.element('#child'), computed = f.window.getComputedStyle(child);
    assert.equal(computed.color, 'rgb(255, 0, 0)'); assert.equal(computed.fontStyle, 'italic'); assert.equal(computed.isolation, 'auto');
    child.style.isolation = 'inherit'; assert.equal(computed.isolation, 'isolate');
    child.style.isolation = 'unset'; assert.equal(computed.isolation, 'auto');
    child.style.fontStyle = 'initial'; assert.equal(computed.fontStyle, 'normal'); child.style.fontStyle = 'unset'; assert.equal(computed.fontStyle, 'italic');
    parent.style.color = 'blue'; assert.equal(computed.color, 'rgb(0, 0, 255)');
    parent.style.display = 'initial'; assert.equal(f.window.getComputedStyle(parent).display, 'inline');
    parent.style.display = ''; assert.equal(f.window.getComputedStyle(parent).display, 'block');
  } finally { f.close(); }
});

test('native custom property token streams inherit without substitution or cycle collapse', () => {
  const f = fixture('<div style="--size:23px;--tone:red"><span></span></div>');
  try {
    const sheet = new f.window.CSSStyleSheet(); sheet.replaceSync('span { width: var(--size); color: var(--tone); height: var(--missing, var(--fallback, 7px)); --a:var(--b); --b:var(--a); min-width:var(--a, 4px) }');
    f.document.adoptedStyleSheets = [sheet]; const span = f.element('span'), computed = f.window.getComputedStyle(span);
    assert.equal(computed.width, 'var(--size)'); assert.equal(computed.color, 'var(--tone)'); assert.equal(computed.height, 'var(--missing, var(--fallback, 7px))'); assert.equal(computed.minWidth, 'var(--a, 4px)');
    assert.equal(computed.getPropertyValue('--size'), '23px'); assert.equal(computed.getPropertyValue('--a'), 'var(--b)');
    span.style.setProperty('--size', 'not-a-length'); assert.equal(computed.width, 'var(--size)');assert.equal(computed.getPropertyValue('--size'),'not-a-length');
    span.style.setProperty('--fallback', '9px'); assert.equal(computed.height, 'var(--missing, var(--fallback, 7px))');assert.equal(computed.getPropertyValue('--fallback'),'9px');
  } finally { f.close(); }
});

test('adopted and local shadow sheets stay scoped while inherited values cross hosts and assigned slots', () => {
  const f = fixture('<style>.target { width: 90px; color: red }</style><div id="host" style="color:green"><span class="light">light</span></div><p class="target">outside</p>');
  try {
    const host = f.element('#host'), root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = '<style>.target { height: 11px } slot { font-style:italic }</style><div class="target">inside</div><slot></slot>';
    const inside = root.querySelector('.target'), outside = f.element('p'), local = root.querySelector('style');
    const adopted = new f.window.CSSStyleSheet(); adopted.replaceSync('.target { width: 30px }'); root.adoptedStyleSheets = [adopted];
    assert.equal(f.window.getComputedStyle(inside).width, '30px'); assert.equal(f.window.getComputedStyle(inside).height, '11px');
    assert.equal(f.window.getComputedStyle(inside).color, 'rgb(0, 128, 0)'); assert.equal(f.window.getComputedStyle(outside).width, '90px');
    assert.equal(f.window.getComputedStyle(outside).height, 'auto'); assert.equal(f.window.getComputedStyle(host).width, 'auto');
    assert.equal(f.window.getComputedStyle(host.firstElementChild).fontStyle, 'italic');
    assert.equal(f.document.styleSheets.length, 1); assert.ok(local.sheet instanceof f.window.CSSStyleSheet);
    local.sheet.cssRules[0].style.height = '22px'; assert.equal(f.window.getComputedStyle(inside).height, '22px');
    local.textContent = '.target { height: 33px }'; assert.equal(f.window.getComputedStyle(inside).height, '33px');
  } finally { f.close(); }
});

test('media and disabled sheets have actual bounded effects and retained computed styles react to viewport changes', () => {
  const f = fixture('<div></div>');
  try {
    const sheet = new f.window.CSSStyleSheet({ media: 'screen' });
    sheet.replaceSync('div { width: 10px } @media screen and (min-width: 800px) { div { width: 30px } } @media print { div { height: 100px } }');
    f.document.adoptedStyleSheets = [sheet]; const computed = f.window.getComputedStyle(f.element('div'));
    assert.equal(computed.width, '30px'); assert.equal(computed.height, 'auto');
    Object.defineProperty(f.window, 'innerWidth', { configurable: true, value: 500 }); assert.equal(computed.width, '10px');
    sheet.disabled = true; assert.equal(computed.width, 'auto'); sheet.disabled = false; assert.equal(computed.width, '10px');
    sheet.media.mediaText = 'print'; assert.equal(computed.width, 'auto');
  } finally { f.close(); }
});

test('computed declarations are readonly and style revisions track adopted sheet and CSSOM mutation', () => {
  const f = fixture('<div></div>');
  try {
    const sheet = new f.window.CSSStyleSheet(); sheet.replaceSync('div { width: 10px }');
    const original = getStyleRevision(f.window); assert.equal(getStyleRevision(f.window), original);
    f.document.adoptedStyleSheets = [sheet]; const adopted = f.controller.revision; assert.ok(adopted > original);
    sheet.cssRules[0].style.width = '20px'; const changed = getStyleRevision(f.window); assert.ok(changed > adopted); assert.equal(getStyleRevision(f.window), changed);
    const computed = f.window.getComputedStyle(f.element('div')); assert.equal(computed instanceof f.window.CSSStyleDeclaration, true);
    assert.throws(() => { computed.width = '100px'; }, error => error.name === 'NoModificationAllowedError');
    assert.throws(() => computed.setProperty('width', '100px'), error => error.name === 'NoModificationAllowedError');
    assert.equal(computed.width, '20px'); assert.equal(f.element('div').style.width, '');
    const before=f.window.getComputedStyle(f.element('div'),'::before');assert.equal(before,f.window.getComputedStyle(f.element('div'),':BEFORE'));assert.notEqual(before,computed);assert.throws(()=>{before.color='red'},error=>error.name==='NoModificationAllowedError');
  } finally { f.close(); }
});

test('unsupported advanced scope selectors are reported and unregistered windows retain their own APIs', () => {
  const f = fixture('<div></div>'), ordinary = new JSDOM('<div style="width:4px"></div>');
  try {
    const root = f.element('div').attachShadow({ mode: 'open' }); root.innerHTML = '<span></span>';
    const sheet = new f.window.CSSStyleSheet(); sheet.replaceSync(':host { width: 10px } ::slotted(span) { color: red } span { height: 2px }');
    root.adoptedStyleSheets = [sheet]; assert.equal(f.window.getComputedStyle(root.querySelector('span')).height, '2px');
    assert.ok(f.controller.unsupported.has(':host, ::slotted and ::part selectors'));
    assert.equal(typeof ordinary.window.CSSStyleSheet.prototype.replaceSync, 'undefined');
    assert.equal(ordinary.window.getComputedStyle(ordinary.window.document.querySelector('div')).width, '4px');
    f.controller.dispose(); assert.equal(getStyleRevision(f.window), 0);
  } finally { f.close(); ordinary.window.close(); }
});

test('document abort and closing the owned Window dispose style registration and Page listeners', () => {
  for (const reason of ['abort', 'close']) {
    const f = fixture('<div></div>');
    try {
      assert.ok(getStyleRevision(f.window) > 0); assert.equal(f.page.listenerCount('close'), 2);
      if (reason === 'abort') f.page.documentAbort.abort(); else f.window.close();
      assert.equal(getStyleRevision(f.window), 0); assert.equal(f.page.listenerCount('close'), 0);
    } finally { f.close(); }
  }
});
