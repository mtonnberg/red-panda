import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CookieJar } from 'jsdom';
import { setCookie, exportCookies, readCookieFile, writeCookieFile } from '../src/cookies.js';

test('cookie export/load preserves host/domain scope, expiry and HttpOnly', async () => {
  const source = new CookieJar();
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  await setCookie(source, { name: 'host', value: 'only', domain: 'example.com', path: '/', httpOnly: true });
  await setCookie(source, { name: 'domain', value: 'shared', domain: '.example.com', path: '/app', secure: true, expires: expiry, sameSite: 'Strict' });
  await setCookie(source, { name: 'expired', value: 'gone', domain: 'example.com', expires: 0 });
  const exported = await exportCookies(source);
  assert.deepEqual(exported.map(cookie => cookie.domain).sort(), ['.example.com', 'example.com']);
  const restored = new CookieJar();
  for (const cookie of exported) await setCookie(restored, cookie);
  assert.equal(await restored.getCookieString('https://child.example.com/app'), 'domain=shared');
  assert.equal(await restored.getCookieString('https://example.com/'), 'host=only');
  assert.equal(await restored.getCookieString('https://example.com/', { http: false }), '');
  assert.equal(await restored.getCookieString('http://child.example.com/app'), '');
  assert.equal((await exportCookies(restored)).find(cookie => cookie.name === 'domain').expires, expiry);
});

test('Netscape files support HttpOnly and domain flags and reject malformed rows', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'red-panda-cookies-'));
  const path = join(directory, 'cookies.txt');
  try {
    await writeFile(path, '# Netscape HTTP Cookie File\n#HttpOnly_example.com\tFALSE\t/\tFALSE\t0\thost\tonly\n.example.com\tTRUE\t/app\tTRUE\t2000000000\tdomain\tshared\n');
    const cookies = await readCookieFile(path);
    assert.equal(cookies[0].httpOnly, true);
    assert.equal(cookies[0].expires, -1);
    assert.equal(cookies[1].domain, '.example.com');
    const jar = new CookieJar();
    for (const cookie of cookies) await setCookie(jar, cookie);
    assert.equal(await jar.getCookieString('https://child.example.com/app'), 'domain=shared');
    await writeFile(path, 'example.com\tFALSE\t/\tFALSE\tbad-expiry\tname\tvalue');
    await assert.rejects(readCookieFile(path), /line 1/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('cookie files are complete JSON with owner-only permissions, including replacement', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'red-panda-cookie-output-'));
  const path = join(directory, 'cookies.json');
  try {
    await writeFile(path, 'old', { mode: 0o644 });
    const cookies = [{ name: 'fixture', value: 'dummy', domain: '127.0.0.1', path: '/', expires: -1 }];
    await writeCookieFile(path, cookies);
    assert.deepEqual(await readCookieFile(path), cookies);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(path, 'utf8'))[0].name, 'fixture');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('invalid cookie attributes fail without importing the cookie', async () => {
  const jar = new CookieJar();
  for (const cookie of [
    { name: 'bad', value: 'value; Secure', domain: 'example.com' },
    { name: 'bad', value: 'value', domain: 'example.com; Domain=other.com' },
    { name: 'bad', value: 'value', domain: 'example.com', path: '/; HttpOnly' },
    { name: 'bad', value: 'value', domain: 'example.com', expires: NaN },
    { name: 'bad', value: 1, domain: 'example.com' },
  ]) await assert.rejects(setCookie(jar, cookie), /Invalid cookie/);
  assert.deepEqual(await exportCookies(jar), []);
});
