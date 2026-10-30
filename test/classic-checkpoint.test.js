import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { Browser } from '../src/browser.js';
import { checkpointStatistics } from '../src/clear-hook.js';

const controls = JSON.parse(await readFile(new URL('../docs/reference/streams-checkpoint-clear-oracle-node24.json', import.meta.url), 'utf8'));
for (const [name, html] of Object.entries(controls.fixtures)) {
  test(`real evaluator order and currentScript match native ${name} trace`, async t => {
    const server = http.createServer((_request, response) => { response.setHeader('content-type', 'text/html'); response.end(html); });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const browser = new Browser({ loadResources: ['iframe'] });
    t.after(async () => { browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const page = browser.createPage(), before = checkpointStatistics();
    await page.navigate(`http://127.0.0.1:${server.address().port}/`);
    assert.deepEqual(JSON.parse(JSON.stringify(page.evaluate('trace'))), JSON.parse(controls.results[name].native.result.value));
    assert.equal(page.evaluate('document.currentScript'), null);
    assert.equal(checkpointStatistics().activeScopes, 0);
    assert.ok(checkpointStatistics().ran > before.ran);
  });
}
