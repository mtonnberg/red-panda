import puppeteer from 'puppeteer-core';

// Promise -> Aff bridge. Canceled acquisition closes its eventual resource.
const async = (task, dispose = () => {}) => onError => onSuccess => () => {
  let canceled = false;
  Promise.resolve().then(task).then(
    value => { if (canceled) Promise.resolve(dispose(value)).catch(() => {}); else onSuccess(value)(); },
    error => { if (!canceled) onError(error instanceof Error ? error : new Error(String(error)))(); },
  );
  return () => { canceled = true; };
};

export const connectImpl = endpoint => async(
  () => puppeteer.connect({ browserWSEndpoint: endpoint, defaultViewport: null, protocolTimeout: 10000 }),
  browser => browser.disconnect(),
);
export const disconnectImpl = browser => () => { browser.disconnect(); };
export const createContextImpl = browser => async(() => browser.createBrowserContext(), context => context.close());
export const closeContextImpl = context => async(async () => { await context.close(); });
export const newPageImpl = context => async(() => context.newPage(), page => page.close());
export const closePageImpl = page => async(async () => { await page.close(); });
export const gotoImpl = page => url => async(async () => {
  const response = await page.goto(url, { waitUntil: 'load', timeout: 10000 });
  return response?.status() ?? 0;
});
export const gotoResponseImpl = page => url => async(async () => {
  const response = await page.goto(url, { waitUntil: 'load', timeout: 10000 });
  if (!response) throw new Error('Navigation did not produce an HTTP response');
  return response;
});
export const responseStatus = response => response.status();
export const responseTextImpl = response => async(() => response.text());
export const evaluateOnNewDocumentImpl = page => source => async(async () => (await page.evaluateOnNewDocument(source)).identifier);
export const removePreloadImpl = page => identifier => async(async () => { await page.removeScriptToEvaluateOnNewDocument(identifier); });
export const evaluateStringImpl = page => expression => async(async () => {
  const result = await page.evaluate(expression);
  if (typeof result !== 'string') throw new TypeError('Expected a string from page.evaluate');
  return result;
});
export const contentImpl = page => async(() => page.content());
export const waitForSelectorImpl = page => selector => async(async () => {
  const handle = await page.waitForSelector(selector, { timeout: 5000 });
  await handle?.dispose();
});
export const setCookieImpl = context => url => name => value => async(async () => {
  await context.setCookie({ name, value, domain: new URL(url).hostname, path: '/' });
});
export const cookieNamesImpl = context => async(async () => (await context.cookies()).map(cookie => cookie.name));
export const quote = JSON.stringify;
