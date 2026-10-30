import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JSDOM } from 'jsdom';
import { installForms } from '../src/forms.js';

function fixture(t, html = '') {
  const page = Object.assign(new EventEmitter(), { closed: false, documentAbort: new AbortController(), navigate: async () => ({}) });
  const dom = new JSDOM(html, { url: 'https://forms.test/', runScripts: 'outside-only',
    beforeParse: window => installForms(page, window) });
  page.dom = dom;
  t.after(() => { page.closed = true; page.documentAbort.abort(); dom.window.close(); });
  return { window: dom.window, document: dom.window.document, page };
}

test('form named properties are live, writable and nonenumerable while prototype members keep precedence', t => {
  const f = fixture(t, '<form><input id="identifier" name="user"><input name="choice" type="radio" value="a"><input name="choice" type="radio" value="b" checked><input name="action"><input name="submit"></form>');
  const form = f.document.querySelector('form'), user = form.querySelector('[name=user]');
  assert.equal(form.user, user); assert.equal(form.identifier, user); assert.equal(form[0], user);
  assert.equal(Object.getPrototypeOf(form), f.window.HTMLFormElement.prototype);
  assert.equal(form instanceof f.window.HTMLFormElement, true);
  assert.equal(form.action, 'https://forms.test/'); assert.equal(typeof form.submit, 'function');
  assert.equal(form.choice instanceof f.window.RadioNodeList, true); assert.equal(form.choice.value, 'b');
  assert.equal(Object.hasOwn(form, 'user'), true); assert.equal('user' in form, true);
  assert.deepEqual(Object.keys(form), []); assert.deepEqual(Object.getOwnPropertyNames(form), []);
  const descriptor = Object.getOwnPropertyDescriptor(form, 'user');
  assert.equal(descriptor.value, user); assert.equal(descriptor.enumerable, false);
  assert.equal(descriptor.writable, true); assert.equal(descriptor.configurable, true);
  const indexed = Object.getOwnPropertyDescriptor(form, '0');
  assert.equal(indexed.enumerable, true); assert.equal(indexed.writable, false);
  assert.throws(() => { form[0] = 'ignored'; }, TypeError); assert.equal(form[0], user);
  assert.equal(delete form[0], true); assert.equal(form[0], user);
  assert.equal(Reflect.defineProperty(form, '0', { value: 'ignored', configurable: true }), true);
  assert.equal(form[0], user);
  user.name = 'renamed'; assert.equal(form.user, undefined); assert.equal(form.renamed, user);
  assert.equal(form.identifier, user); user.remove(); assert.equal(form.renamed, undefined);
  assert.equal(form.identifier, undefined); assert.equal('renamed' in form, false);
});

test('virtual form and controls properties allow shadows and explicit descriptors without losing live fallback', t => {
  const f = fixture(t, '<form><input name="user"></form>');
  const form = f.document.querySelector('form'), user = form.querySelector('input');
  for (const target of [form, form.elements]) {
    assert.equal(Object.getOwnPropertyDescriptor(target, 'user').enumerable, false);
    assert.deepEqual(Object.keys(target), []);
    target.user = 'assigned'; assert.equal(target.user, 'assigned');
    assert.equal(Object.getOwnPropertyDescriptor(target, 'user').enumerable, false);
    assert.equal(delete target.user, true); assert.equal(target.user, user);
    Object.defineProperty(target, 'user', { value: 'defined', enumerable: true, configurable: true, writable: true });
    assert.equal(target.user, 'defined'); assert.equal(Object.keys(target).includes('user'), true);
    delete target.user; assert.equal(target.user, user);
  }
});

test('form controls retain actual indexed nodes, named collections, listed elements and image exclusion', t => {
  const f = fixture(t, '<form id="f"><fieldset name="fs"><input name="q" value="1"></fieldset><output name="out">text</output><object name="obj"></object><input type="image" name="img"></form><fieldset form="f" name="outside"></fieldset>');
  const form = f.document.querySelector('form'), controls = form.elements;
  assert.equal(controls instanceof f.window.HTMLFormControlsCollection, true);
  assert.equal([...controls].map(node => node.tagName).join(','), 'FIELDSET,INPUT,OUTPUT,OBJECT,FIELDSET');
  assert.equal(form.length, 5); assert.equal(form.fs, controls.fs); assert.equal(form[2], controls[2]);
  assert.equal(controls.out, form.querySelector('output')); assert.equal(controls.namedItem('obj'), form.obj);
  assert.equal(form.img, undefined); assert.equal(controls.img, undefined);
  assert.deepEqual([...new f.window.FormData(form)], [['q', '1']]);
  const input = f.document.createElement('input'); input.name = 'later'; form.append(input);
  assert.equal(controls.length, 6); assert.equal(controls.later, input); input.remove(); assert.equal(controls.later, undefined);
});

test('disconnected controls report their ancestor form while entry membership still respects a mismatched form attribute', t => {
  const f = fixture(t), form = f.document.createElement('form');
  form.innerHTML = '<fieldset><input name="q" value="1" form="missing"></fieldset>';
  const input = form.querySelector('input');
  assert.equal(input.form, form); assert.equal(form.elements.length, 1);
  assert.equal(form.q, undefined); assert.deepEqual([...new f.window.FormData(form)], []);
  f.document.body.append(form); assert.equal(input.form, null); assert.equal(form.elements.length, 1);
  form.remove(); assert.equal(input.form, form); input.remove(); assert.equal(input.form, null);
});

test('cloned forms preserve wrapper identity across DOM APIs and unregistered documents keep jsdom behavior', t => {
  const f = fixture(t, '<form id="original"><input name="user"></form>');
  const original = f.document.querySelector('form'), clone = original.cloneNode(true); clone.id = 'clone'; f.document.body.append(clone);
  assert.equal(f.document.getElementById('clone'), clone); assert.equal(f.document.forms.namedItem('clone'), clone);
  assert.equal(clone.user, clone.querySelector('input')); assert.equal(clone.user.form, clone);
  const plain = new JSDOM('<form><input name="user"></form>');
  try { assert.equal(plain.window.document.querySelector('form').user, undefined); }
  finally { plain.window.close(); }
});
