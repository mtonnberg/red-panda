// Only fixture lifecycle belongs in JS; the Puppeteer test is PureScript.
import { createFixture } from '../../../test/fixture.js';
import { serve } from '../../../src/cdp.js';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';

async function createTransports() {
  const server = http.createServer((request, response) => {
    if (request.url !== '/events') { response.writeHead(404); response.end(); return; }
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'access-control-allow-origin': request.headers.origin ?? '*',
      'cache-control': 'no-store',
    });
    response.write('id: 17\nevent: panda\ndata: red');
    setImmediate(() => response.end('-panda\n\n'));
  });
  const sockets = new WebSocketServer({ server, path: '/echo' });
  sockets.on('connection', socket => {
    socket.on('error', () => {});
    socket.on('message', (bytes, binary) => {
      if (binary) socket.send(bytes, { binary: true });
      else socket.send(`echo:${bytes.toString('utf8')}`);
    });
  });
  server.listen(0, '127.0.0.1');
  try { await once(server, 'listening'); }
  catch (error) { sockets.close(); server.close(); throw error; }
  const port = server.address().port;
  let closing;
  return {
    streamUrl: `http://127.0.0.1:${port}/events`,
    socketUrl: `ws://127.0.0.1:${port}/echo`,
    close: () => closing ??= (async () => {
      for (const socket of sockets.clients) socket.terminate();
      server.closeAllConnections();
      await Promise.all([
        new Promise(resolve => sockets.close(resolve)),
        new Promise(resolve => server.close(resolve)),
      ]);
    })(),
  };
}

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
  let transports;
  try {
    transports = await createTransports();
    const service = await serve({ port: 0 });
    return { url: fixture.url, endpoint: `ws://127.0.0.1:${service.port}/`, streamUrl: transports.streamUrl, socketUrl: transports.socketUrl,
      close: async () => { try { await service.close(); } finally { try { await transports.close(); } finally { await fixture.close(); } } } };
  } catch (error) { try { await transports?.close(); } finally { await fixture.close(); } throw error; }
});
export const stopImpl = fixture => async(async () => { await fixture.close(); });
export const fixtureUrl = fixture => fixture.url;
export const fixtureEndpoint = fixture => fixture.endpoint;
export const fixtureStreamUrl = fixture => fixture.streamUrl;
export const fixtureSocketUrl = fixture => fixture.socketUrl;
