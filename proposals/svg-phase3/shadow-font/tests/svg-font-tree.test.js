import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Browser } from '../src/browser.js';
import { getStyleInheritanceParent } from '../src/styles.js';

async function fixture(t) { const browser = new Browser(); t.after(() => browser.close()); const page = browser.createPage(); await page.navigate('data:text/html,<body></body>'); return { page, window:page.dom.window }; }

test('SVG em font inheritance matches all native open/closed host, assigned-slot and mutation controls', async t => {
  const { page } = await fixture(t);
  const expression = await readFile(new URL('../docs/reference/svg-phase3-shadow-font-native-expression.js', import.meta.url), 'utf8');
  const native = JSON.parse(await readFile(new URL('../docs/reference/svg-phase3-shadow-font-native-observation.json', import.meta.url), 'utf8')).observations;
  assert.deepEqual(JSON.parse(JSON.stringify(page.evaluate(expression))), native);
});

test('shared style parent uses genuine closed-slot/host state and SVG font values update after reassignment', async t => {
  const { window:w } = await fixture(t), host=w.document.createElement('div'); w.document.body.append(host); host.style.fontSize='30px';
  const root=host.attachShadow({mode:'closed'}), slot=w.document.createElement('slot'), other=w.document.createElement('slot'); slot.name='one'; other.name='two'; slot.style.fontSize='40px'; other.style.fontSize='60px'; root.append(slot,other);
  const svg=w.document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('x','2em'); svg.setAttribute('slot','one'); host.append(svg);
  assert.equal(svg.assignedSlot,null); assert.equal(getStyleInheritanceParent(svg),slot); assert.equal(svg.x.baseVal.value,80);
  svg.setAttribute('slot','two'); assert.equal(getStyleInheritanceParent(svg),other); assert.equal(svg.x.baseVal.value,120);
  const inner=w.document.createElementNS('http://www.w3.org/2000/svg','svg'); inner.setAttribute('x','2em'); root.append(inner);
  assert.equal(getStyleInheritanceParent(inner),host); assert.equal(inner.x.baseVal.value,60);
  Object.defineProperty(inner,'parentElement',{get(){throw new Error('authored parent getter')}}); Object.defineProperty(svg,'assignedSlot',{get(){throw new Error('authored slot getter')}});
  assert.equal(getStyleInheritanceParent(inner),host); assert.equal(getStyleInheritanceParent(svg),other);
});
