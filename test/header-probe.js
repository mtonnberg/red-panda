import { connect } from './cdp-client.js';
import { until } from '../src/browser.js';

export async function probeRequestHeaders(endpoint, url, { enableNetwork = false } = {}) {
  const client = await connect(endpoint);
  let browserContextId;
  try {
    ({ browserContextId } = await client.send('Target.createBrowserContext'));
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params = {}) => client.send(method, params, sessionId);
    await send('Page.enable'); await send('Runtime.enable');
    if (enableNetwork) await send('Network.enable');
    await send('Network.setExtraHTTPHeaders', { headers: { 'X-Client': 'cdp-probe', 'X-Shared': 'extra' } });
    await send('Network.setUserAgentOverride', { userAgent: 'RedPandaProbe/1', acceptLanguage: 'sv-SE' });
    const inspect = async () => {
      await send('Page.navigate', { url: `${url}request-headers` });
      await until(async () => (await send('Runtime.evaluate', {
        expression: 'Boolean(document.querySelector("#fetch")?.textContent)', returnByValue: true,
      })).result?.value === true);
      const result = await send('Runtime.evaluate', { expression: `JSON.stringify({
        navigation:JSON.parse(document.querySelector('#navigation').textContent),
        resource:JSON.parse(document.querySelector('#resource').textContent),
        fetch:JSON.parse(document.querySelector('#fetch').textContent),
        userAgent:navigator.userAgent,language:navigator.language
      })`, returnByValue: true });
      return JSON.parse(result.result.value);
    };
    const configured = await inspect();
    await send('Network.setExtraHTTPHeaders', { headers: {} });
    const cleared = await inspect();
    return { configured, cleared };
  } finally {
    if (browserContextId) await client.send('Target.disposeBrowserContext', { browserContextId });
    await client.close();
  }
}
