// Only fixture lifecycle belongs in JS; the Puppeteer test is PureScript.
import { createFixture } from '../../../test/fixture.js';
import { serve } from '../../../src/cdp.js';

const async = task => fail => success => () => {
  let canceled = false;
  Promise.resolve().then(task).then(
    value => { if (canceled) value?.close?.(); else success(value)(); },
    error => { if (!canceled) fail(error)(); },
  );
  return () => { canceled = true; };
};
export const startImpl = async(async () => {
  const fixture = await createFixture();
  try {
    const service = await serve({ port: 0 });
    return { url: fixture.url, endpoint: `ws://127.0.0.1:${service.port}/`, close: async () => { await service.close(); await fixture.close(); } };
  } catch (error) { await fixture.close(); throw error; }
});
export const stopImpl = fixture => async(async () => { await fixture.close(); });
export const fixtureUrl = fixture => fixture.url;
export const fixtureEndpoint = fixture => fixture.endpoint;
