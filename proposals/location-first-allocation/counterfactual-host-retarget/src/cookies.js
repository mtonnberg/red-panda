import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { toughCookie } from 'jsdom';

export function cookieToCDP(cookie) {
  const expires = cookie.expiryTime();
  return {
    name: cookie.key, value: cookie.value, domain: `${cookie.hostOnly ? '' : '.'}${cookie.domain}`, path: cookie.path,
    expires: expires === Infinity ? -1 : expires / 1000,
    size: cookie.key.length + cookie.value.length, httpOnly: !!cookie.httpOnly,
    secure: !!cookie.secure, session: expires === Infinity,
    ...(cookie.sameSite ? { sameSite: cookie.sameSite[0].toUpperCase() + cookie.sameSite.slice(1) } : {}),
    priority: 'Medium',
  };
}

export async function setCookie(jar, cookie, fallback = 'about:blank') {
  if (!cookie || typeof cookie.name !== 'string' || !cookie.name || typeof cookie.value !== 'string' ||
      /[;\r\n]/.test(cookie.name + cookie.value)) throw new Error('Invalid cookie name or value');
  for (const key of ['domain', 'path', 'sameSite']) {
    if (cookie[key] !== undefined && (typeof cookie[key] !== 'string' || /[;\r\n]/.test(cookie[key]))) {
      throw new Error(`Invalid cookie ${key}`);
    }
  }
  if (cookie.expires !== undefined && (!Number.isFinite(cookie.expires) || cookie.expires < -1)) {
    throw new Error('Invalid cookie expiry');
  }
  const url = new URL(cookie.url ?? (cookie.domain
    ? `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}${cookie.path ?? '/'}`
    : fallback));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Cookies require an HTTP(S) URL or domain');
  let text = `${cookie.name}=${cookie.value}; Path=${cookie.path ?? '/'}`;
  // Domain cookies use a leading dot in CDP. Plain domains represent host-only cookies.
  if (cookie.domain?.startsWith('.') && !isIP(cookie.domain.slice(1))) text += `; Domain=${cookie.domain}`;
  if (cookie.secure) text += '; Secure';
  if (cookie.httpOnly) text += '; HttpOnly';
  if (cookie.sameSite) text += `; SameSite=${cookie.sameSite}`;
  if (cookie.expires !== undefined && cookie.expires >= 0) text += `; Expires=${new Date(cookie.expires * 1000).toUTCString()}`;
  await jar.setCookie(text, url.href);
}

export async function exportCookies(jar) {
  const data = await jar.serialize();
  return data.cookies.map(value => toughCookie.Cookie.fromJSON(value))
    .filter(cookie => cookie.expiryTime() > Date.now())
    .map(cookieToCDP);
}

export async function readCookieFile(path) {
  const text = await readFile(path, 'utf8');
  if (text.trimStart().startsWith('[')) {
    const cookies = JSON.parse(text);
    if (!Array.isArray(cookies)) throw new Error('Cookie JSON must be an array');
    return cookies;
  }
  const cookies = [];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    if (!raw.trim() || (raw.startsWith('#') && !raw.startsWith('#HttpOnly_'))) continue;
    const httpOnly = raw.startsWith('#HttpOnly_');
    const fields = (httpOnly ? raw.slice('#HttpOnly_'.length) : raw).split('\t');
    if (fields.length !== 7 || !['TRUE', 'FALSE'].includes(fields[1]) || !['TRUE', 'FALSE'].includes(fields[3]) || !/^\d+$/.test(fields[4])) {
      throw new Error(`Invalid Netscape cookie on line ${index + 1}`);
    }
    const [domain, includeSubdomains, path, secure, expires, name, value] = fields;
    cookies.push({ name, value, domain: `${includeSubdomains === 'TRUE' ? '.' : ''}${domain.replace(/^\./, '')}`,
      path, secure: secure === 'TRUE', httpOnly, expires: expires === '0' ? -1 : Number(expires) });
  }
  return cookies;
}

export async function writeCookieFile(path, cookies) {
  // Publish a complete, owner-only jar; do not follow existing output symlinks.
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(cookies, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}
