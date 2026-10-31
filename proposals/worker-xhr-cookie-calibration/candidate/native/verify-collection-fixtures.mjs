import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { installCollections, loadCollectionsBinding } from '../src/collections.js';

const [referenceTests, addon] = process.argv.slice(2);
if (!referenceTests || !addon) throw new Error('Usage: node native/verify-collection-fixtures.mjs REFERENCE_TESTS_DIRECTORY ADDON_PATH');
const binding = loadCollectionsBinding(addon), results = [];
for (const fixture of ['document/all_collection.html', 'collections/html_all_collection.html', 'collections/radio_node_list.html']) {
  const filename = path.resolve(referenceTests, fixture), source = await readFile(filename);
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  virtualConsole.on('error', message => errors.push(String(message)));
  const dom = new JSDOM(source.toString(), { url: pathToFileURL(filename).href, resources: 'usable', runScripts: 'dangerously', virtualConsole,
    beforeParse(window) { window.__lp_external_runner = true; installCollections(window, { binding }); } });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Collection fixture load timed out')), 5000);
      dom.window.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    const passed = dom.window.testing.assertOk();
    results.push({ fixture, sourceSHA256: createHash('sha256').update(source).digest('hex'), passed, errors });
  } catch (error) { results.push({ fixture, sourceSHA256: createHash('sha256').update(source).digest('hex'), passed: false, errors: [...errors, error.message] }); }
  finally { dom.window.close(); }
}
const harness = await readFile(path.resolve(referenceTests, 'testing.js'));
process.stdout.write(JSON.stringify({ kind: 'local-unchanged-fixture-check', node: process.version, v8: process.versions.v8,
  addon, testingSHA256: createHash('sha256').update(harness).digest('hex'), results }, null, 2) + '\n');
if (results.some(result => !result.passed || result.errors.length)) process.exitCode = 1;
