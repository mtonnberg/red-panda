import http from 'node:http';

export async function createFixture() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture.test');
    if (url.pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'server=present; Path=/; HttpOnly' });
      response.end(`<!doctype html><html><head><title>Red Panda fixture</title></head><body>
        <h1>original</h1><a href="/next">Next</a><button>Change</button>
        <p id="async"></p><p id="timer"></p>
        <script>globalThis.observedPreload = globalThis.fixturePreload ?? 'absent';
        document.querySelector('h1').textContent = 'inline script ran';
        document.querySelector('button').addEventListener('click', () => document.querySelector('h1').textContent = 'clicked');
        fetch('/api').then(r => r.json()).then(x => document.querySelector('#async').textContent = x.message);
        setTimeout(() => document.querySelector('#timer').textContent = 'timer ran', 40);</script>
        <script src="/script.js"></script>
        </body></html>`);
    } else if (url.pathname === '/script.js') {
      response.writeHead(200, { 'content-type': 'text/javascript' });
      response.end("document.querySelector('h1').textContent = 'external script ran'");
    } else if (url.pathname === '/api') {
      setTimeout(() => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ message: 'async data' })); }, 75);
    } else if (url.pathname === '/echo-cookie') {
      response.writeHead(200, { 'content-type': 'text/plain' }); response.end(request.headers.cookie ?? '');
    } else if (url.pathname === '/next') {
      response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>Next page</title><h1>Next</h1>');
    } else if (url.pathname === '/response') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<h1>source</h1><script>document.querySelector("h1").textContent="mutated"</script>');
    } else if (url.pathname === '/plain-text') {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('\n<script>globalThis.shouldNotRun=true</script><b>literal & text</b>');
    } else if (url.pathname === '/redirect') {
      response.writeHead(302, { location: '/next', 'set-cookie': 'redirect=kept; Path=/' }); response.end();
    } else if (url.pathname === '/loop') {
      response.writeHead(302, { location: '/loop' }); response.end();
    } else if (url.pathname === '/slow') {
      const timer = setTimeout(() => response.end('<h1>too late</h1>'), 2000);
      response.on('close', () => clearTimeout(timer));
    } else if (url.pathname === '/script-error') {
      response.end('<h1>still usable</h1><script>throw new Error("fixture exception")</script>');
    } else {
      response.writeHead(404, { 'content-type': 'text/html' }); response.end('<h1>Not found</h1>');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(resolve => {
    server.closeAllConnections(); server.close(resolve);
  }) };
}
