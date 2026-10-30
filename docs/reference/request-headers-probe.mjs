import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createFixture } from '../../test/fixture.js';
import { probeRequestHeaders } from '../../test/header-probe.js';
import { startReference } from '../../scripts/reference-server.mjs';

const binary = process.argv[2];
if (!binary) throw new Error('Supply the path to the verified reference browser');
const referenceSHA256 = createHash('sha256').update(await readFile(binary)).digest('hex');
const fixture = await createFixture();
let browser;
try {
  browser = await startReference(binary);
  const enableNetwork = process.argv[3] === 'enable-network';
  console.log(JSON.stringify({ referenceSHA256, enableNetwork, result: await probeRequestHeaders(browser.endpoint, fixture.url, { enableNetwork }) }));
} finally { await browser?.close(); await fixture.close(); }
