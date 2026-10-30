import { connect } from './cdp-client.js';
import { until } from '../src/browser.js';

export function historyObservation(result) {
  const history = value => ({ currentIndex: value.currentIndex, entries: value.entries.map(({ url, title, transitionType }) => ({ url, title, transitionType })) });
  return {
    initial: history(result.initial), pushed: result.pushed, replaced: result.replaced,
    ...(result.scriptedHash ? { scriptedHash: result.scriptedHash, scriptedBack: result.scriptedBack } : {}),
    fragment: result.fragment, history: history(result.history), back: result.back,
    sameDocumentEvents: result.events.filter(event => event.method === 'Page.navigatedWithinDocument')
      .map(event => ({ url: event.params.url, navigationType: event.params.navigationType })),
    fullNavigations: result.events.filter(event => event.method === 'Page.frameNavigated').length,
    createdContexts: result.events.filter(event => event.method === 'Runtime.executionContextCreated').length,
  };
}

export async function probeHistory(endpoint, url, { scripted = false } = {}) {
  const client = await connect(endpoint);
  let browserContextId;
  try {
    ({ browserContextId } = await client.send('Target.createBrowserContext'));
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params = {}) => client.send(method, params, sessionId);
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    await send('Page.navigate', { url: `${url}history` });
    await until(async () => await evaluate('document.readyState') === 'complete');
    const initial = await send('Page.getNavigationHistory');
    await evaluate(`history.pushState({step:1},'', '/history?step=1'); documentToken='retained';`);
    const pushed = await evaluate('JSON.stringify({url:location.href,state:history.state,length:history.length,token:documentToken})');
    await evaluate(`history.replaceState({step:2},'', '/history?step=2')`);
    const replaced = await evaluate('JSON.stringify({url:location.href,state:history.state,length:history.length,token:documentToken})');
    let scriptedHash, scriptedBack;
    if (scripted) {
      await evaluate(`location.hash='scripted'`);
      await until(async () => await evaluate('location.hash') === '#scripted');
      scriptedHash = JSON.parse(await evaluate('JSON.stringify({url:location.href,state:history.state,length:history.length,token:documentToken})'));
      await evaluate('history.back()');
      await until(async () => {
        try { return await evaluate('location.href') === `${url}history?step=2`; } catch { return false; }
      });
      scriptedBack = JSON.parse(await evaluate('JSON.stringify({url:location.href,state:history.state,length:history.length,token:documentToken})'));
    }
    await send('Page.navigate', { url: `${url}history?step=2#anchor` });
    await until(async () => await evaluate('location.hash') === '#anchor');
    const fragment = await evaluate('JSON.stringify({url:location.href,state:history.state,length:history.length,token:documentToken})');
    const history = await send('Page.getNavigationHistory');
    const target = history.entries[history.currentIndex - 1];
    const traversed = await send('Page.navigateToHistoryEntry', { entryId: target.id });
    await until(async () => await evaluate('location.href') === target.url);
    const back = await evaluate('JSON.stringify({url:location.href,state:history.state,length:history.length,token:documentToken})');
    return { initial, pushed: JSON.parse(pushed), replaced: JSON.parse(replaced), ...(scripted ? { scriptedHash, scriptedBack } : {}),
      fragment: JSON.parse(fragment), history, traversed, back: JSON.parse(back),
      events: client.events.filter(event => ['Page.navigatedWithinDocument','Page.frameNavigated','Runtime.executionContextCreated'].includes(event.method)) };
  } finally {
    if (browserContextId) await client.send('Target.disposeBrowserContext', { browserContextId });
    await client.close();
  }
}
