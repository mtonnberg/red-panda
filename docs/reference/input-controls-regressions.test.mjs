// Prepared regression contracts from unchanged upstream HTML. Run explicitly;
// this file is outside npm's test/*.test.js collection while fixes are pending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser } from '../../src/browser.js';

async function fixture(t, markup = '<body></body>') {
  const browser = new Browser(); t.after(() => browser.close());
  const page = browser.createPage();
  await page.navigate(`data:text/html,${encodeURIComponent(markup)}`);
  return { page, window: page.dom.window, document: page.dom.window.document };
}

test('range sanitization rounds ties upward on the actual min/value/default ladder', async t => {
  const { document } = await fixture(t);
  const make = (attributes, value) => {
    const input = document.createElement('input'); input.type = 'range';
    for (const [name, text] of Object.entries(attributes)) input.setAttribute(name, text);
    input.value = value; return input;
  };
  assert.equal(make({ min: '.5', max: '1.5' }, '1').value, '1.5');
  assert.equal(make({ min: '0', max: '10', step: '2' }, '3').value, '4');
  assert.equal(make({ min: '0', max: '10', step: '4' }, '10').value, '8');
  assert.equal(make({ min: '-10', max: '10', step: '5' }, '-2.5').value, '0');
  assert.equal(make({ max: '10', value: '3.5' }, '5.3').value, '5.5');
  assert.equal(make({ min: '0', max: '10', value: '3.5' }, '5.3').value, '5');
  assert.equal(make({ min: '0', max: '100', step: '7' }, 'garbage').value, '49');
  assert.equal(make({ min: '0', max: '10', step: 'ANY' }, '3.7').value, '3.7');
  assert.equal(make({ min: '0', max: '10', step: '0' }, '3.4').value, '3');
});

test('parsed range defaults use final bounds while later bound changes clamp the current value', async t => {
  const { document, window } = await fixture(t, '<form><input name="range" type="range" min="0" max="11"><input type="color" name="color"></form>');
  const form = document.querySelector('form');
  assert.equal(form.elements[0].value, '6');
  assert.equal(new window.FormData(form).get('range'), '6');
  const input = document.createElement('input'); input.type = 'range'; input.max = '20';
  assert.equal(input.value, '20');
  input.value = '80'; input.max = '50'; input.step = '20'; assert.equal(input.value, '20');
  const dirty = document.createElement('input'); dirty.type = 'range'; dirty.value = '80'; dirty.max = '50';
  assert.equal(dirty.value, '50'); dirty.step = '20'; assert.equal(dirty.value, '40');
  form.elements[0].value = '10'; form.reset(); assert.equal(form.elements[0].value, '6');
});

test('off-ladder numeric stepping counts the snap as the first step and retains decimal precision', async t => {
  const { document } = await fixture(t);
  const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = '10'; input.step = '.5';
  input.value = '2.7'; input.stepUp(5); assert.equal(input.value, '5');
  input.value = '2.7'; input.stepDown(3); assert.equal(input.value, '1.5');
  input.value = '2.5'; input.stepUp(100); assert.equal(input.value, '10');
  input.stepDown(100); assert.equal(input.value, '0');
  const cents = document.createElement('input'); cents.type = 'number'; cents.step = '.01'; cents.value = '1234567.89';
  cents.stepUp(); assert.equal(cents.value, '1234567.9'); cents.stepDown(2); assert.equal(cents.value, '1234567.88');
});

test('valueAsNumber serializes whole local seconds without redundant milliseconds and preserves date realms', async t => {
  const { document, window } = await fixture(t);
  const local = document.createElement('input'); local.type = 'datetime-local';
  local.valueAsNumber = Date.UTC(2024, 2, 10, 13, 45, 5); assert.equal(local.value, '2024-03-10T13:45:05');
  const time = document.createElement('input'); time.type = 'time'; time.valueAsNumber = 3661500; assert.equal(time.value, '01:01:01.500');
  const date = document.createElement('input'); date.type = 'date'; date.valueAsNumber = Date.UTC(2024, 2, 10);
  assert.equal(date.valueAsDate instanceof window.Date, true); assert.equal(date.valueAsDate.getTime(), Date.UTC(2024, 2, 10));
  date.valueAsNumber = NaN; assert.equal(date.value, '');
  assert.throws(() => { date.valueAsNumber = Infinity; }, error => error.name === 'TypeError');
});

test('canceling a radio click restores the previously checked group member without input/change events', async t => {
  const { document } = await fixture(t, '<input id="a" type="radio" name="group" checked><input id="b" type="radio" name="group">');
  const a = document.querySelector('#a'), b = document.querySelector('#b'), seen = [];
  b.addEventListener('click', event => { seen.push(['click', a.checked, b.checked]); event.preventDefault(); });
  b.addEventListener('input', () => seen.push(['input'])); b.addEventListener('change', () => seen.push(['change']));
  b.click(); assert.deepEqual(seen, [['click', false, true]]);
  assert.equal(a.checked, true); assert.equal(b.checked, false);
});

test('radio grouping follows actual form owners including external form attributes', async t => {
  const { document } = await fixture(t, `<form id="one"></form><form id="two"></form>
    <input id="a" type="radio" name="group" form="one"><input id="b" type="radio" name="group" form="one">
    <input id="other" type="radio" name="group" form="two"><input id="none" type="radio" name="group">`);
  const get = id => document.getElementById(id);
  get('a').checked = true; get('other').checked = true; get('none').checked = true;
  assert.equal(get('a').checked, true); assert.equal(get('other').checked, true); assert.equal(get('none').checked, true);
  get('b').checked = true;
  assert.equal(get('a').checked, false); assert.equal(get('b').checked, true);
  assert.equal(get('other').checked, true); assert.equal(get('none').checked, true);
});

test('detached ordinary labels resolve wrapping only while shadow labels resolve under detached hosts', async t => {
  const { document } = await fixture(t);
  const ids = control => Array.from(control.labels, label => label.id);
  const tree = document.createElement('div');
  tree.innerHTML = '<label id="for" for="a">A</label><input id="a"><label id="wrap"><input id="b"></label>';
  assert.deepEqual(ids(tree.querySelector('#a')), []); assert.deepEqual(ids(tree.querySelector('#b')), []);
  assert.equal(tree.querySelector('#for').control, null); assert.equal(tree.querySelector('#wrap').control.id, 'b');
  document.body.append(tree); assert.deepEqual(ids(tree.querySelector('#a')), ['for']); assert.deepEqual(ids(tree.querySelector('#b')), ['wrap']);
  const host = document.createElement('div'); document.body.append(host); const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<label id="shadow-for" for="c">C</label><input id="c">'; host.remove();
  assert.deepEqual(ids(root.querySelector('#c')), ['shadow-for']); assert.equal(root.querySelector('label').control.id, 'c');
});

test('Option remains a constructing legacy factory with native metadata and ordinary option state', async t => {
  const { window } = await fixture(t);
  assert.equal(window.Option.name, 'Option'); assert.equal(window.Option.length, 0);
  assert.notEqual(window.Option, window.HTMLOptionElement); assert.equal(window.Option.prototype, window.HTMLOptionElement.prototype);
  const option = new window.Option('text', 'value', true);
  assert.equal(option.constructor, window.HTMLOptionElement); assert.equal(option.defaultSelected, true); assert.equal(option.selected, false);
  assert.throws(() => window.Option(), error => error.name === 'TypeError');
  assert.throws(() => new window.HTMLOptionElement(), error => error.name === 'TypeError');
  assert.deepEqual(Object.getOwnPropertyDescriptor(window.Option, 'prototype'), {
    value: window.HTMLOptionElement.prototype, writable: false, enumerable: false, configurable: false,
  });
});
