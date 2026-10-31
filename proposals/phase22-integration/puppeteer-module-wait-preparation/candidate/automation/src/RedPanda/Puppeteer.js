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
export const armNavigationImpl = page => () => {
  const controller = new AbortController();
  const promise = page.waitForNavigation({ waitUntil: 'load', timeout: 5000, signal: controller.signal }).then(() => page.url());
  promise.catch(() => {}); // Owned watcher can be canceled before anyone awaits it.
  return { controller, promise };
};
export const awaitNavigationImpl = pending => async(() => pending.promise);
export const cancelNavigationImpl = pending => () => { pending.controller.abort(); };
export const goBackImpl = page => async(async () => { await page.goBack({ waitUntil: 'load', timeout: 5000 }); return page.url(); });
export const goForwardImpl = page => async(async () => { await page.goForward({ waitUntil: 'load', timeout: 5000 }); return page.url(); });
export const reloadImpl = page => async(async () => { await page.reload({ waitUntil: 'load', timeout: 5000 }); return page.url(); });
export const pageUrlImpl = page => () => page.url();
export const childFrameImpl = page => index => async(async () => {
  const frame = page.mainFrame().childFrames()[index];
  if (!frame) throw new Error(`No child frame at index ${index}`);
  return frame;
});
export const evaluateFrameStringImpl = frame => expression => async(async () => {
  const value = await frame.evaluate(expression);
  if (typeof value !== 'string') throw new TypeError('Expected a string from frame.evaluate');
  return value;
});
export const gotoFrameImpl = frame => url => async(async () => (await frame.goto(url, { waitUntil: 'load', timeout: 5000 }))?.status() ?? 0);
export const focusFrameImpl = frame => selector => async(async () => { await frame.focus(selector); });
export const screenshotImpl = page => fullPage => async(() => page.screenshot({ type: 'png', fullPage }));
export const pdfImpl = page => async(() => page.pdf());
export const byteLength = bytes => bytes.byteLength;
export const signature = bytes => Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(8, bytes.byteLength)).toString('hex');
export const responseStatus = response => response.status();
export const responseTextImpl = response => async(() => response.text());
export const evaluateOnNewDocumentImpl = page => source => async(async () => (await page.evaluateOnNewDocument(source)).identifier);
export const removePreloadImpl = page => identifier => async(async () => { await page.removeScriptToEvaluateOnNewDocument(identifier); });
export const setExtraHTTPHeadersImpl = page => headers => async(async () => {
  await page.setExtraHTTPHeaders(Object.fromEntries(headers.map(({ name, value }) => [name, value])));
});
export const setUserAgentImpl = page => userAgent => async(async () => { await page.setUserAgent(userAgent); });
export const focusImpl = page => selector => async(async () => { await page.focus(selector); });
export const clickImpl = page => selector => async(async () => { await page.click(selector); });
export const typeTextImpl = page => selector => text => async(async () => { await page.type(selector, text); });
export const pressKeyImpl = page => key => async(async () => { await page.keyboard.press(key); });
export const insertTextImpl = page => text => async(async () => { await page.keyboard.sendCharacter(text); });
export const evaluateStringImpl = page => expression => async(async () => {
  const result = await page.evaluate(expression);
  if (typeof result !== 'string') throw new TypeError('Expected a string from page.evaluate');
  return result;
});
export const evaluateHandleImpl = page => expression => async(() => page.evaluateHandle(expression), handle => handle.dispose());
export const queryObjectsImpl = page => prototype => async(() => page.queryObjects(prototype), handle => handle.dispose());
export const evaluateHandleStringImpl = handle => expression => async(async () => {
  const result = await handle.evaluate((value, source) => (0, eval)(`(${source})`)(value), expression);
  if (typeof result !== 'string') throw new TypeError('Expected a string from handle.evaluate');
  return result;
});
export const disposeHandleImpl = handle => async(async () => { await handle.dispose(); });
export const contentImpl = page => async(() => page.content());
export const waitForFunctionImpl = page => expression => async(async () => {
  const handle = await page.waitForFunction(expression, { timeout: 5000, polling: 'mutation' });
  await handle.dispose();
});
export const waitForSelectorImpl = page => selector => async(async () => {
  const handle = await page.waitForSelector(selector, { timeout: 5000 });
  await handle?.dispose();
});
export const setCookieImpl = context => url => name => value => async(async () => {
  await context.setCookie({ name, value, domain: new URL(url).hostname, path: '/' });
});
export const cookieNamesImpl = context => async(async () => (await context.cookies()).map(cookie => cookie.name));
export const quote = JSON.stringify;

export const createProtocolSessionImpl = page => async(() => page.createCDPSession(), session => session.detach());
export const detachProtocolSessionImpl = session => async(() => session.detach());
export const getFrameTreeImpl = session => async(() => session.send('Page.getFrameTree'));
export const createUtilityWorldImpl = session => params => async(() => session.send('Page.createIsolatedWorld', params));
export const evaluateUtilityStringImpl = session => contextId => expression => async(async () => {
  const response = await session.send('Runtime.evaluate', { contextId, expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  if (typeof response.result.value !== 'string') throw new TypeError('Utility evaluation did not return a string');
  return response.result.value;
});
