import http from 'node:http';

export async function createFixture() {
  const headersFor = request => Object.fromEntries(
    ['x-client', 'x-shared', 'x-page', 'user-agent', 'accept-language', 'referer']
      .map(name => [name, request.headers[name] ?? null]),
  );
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
    } else if (url.pathname === '/history') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`<!doctype html><title>History fixture</title><h1>History</h1><a id="fragment" href="#anchor">Fragment</a>
        <script>globalThis.historyEvents=[];globalThis.documentToken='original';
        addEventListener('popstate',e=>historyEvents.push({type:'popstate',state:e.state}));
        addEventListener('hashchange',e=>historyEvents.push({type:'hashchange',oldURL:e.oldURL,newURL:e.newURL}));</script>`);
    } else if (url.pathname === '/modules') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><h1>Loading module</h1><script type="module">import {answer} from "/module-value.js";await new Promise(resolve=>setTimeout(resolve,20));document.querySelector("h1").textContent=String(answer)</script>');
    } else if (url.pathname === '/module-value.js') {
      response.writeHead(200, { 'content-type': 'text/javascript' }); response.end('export const answer=42;');
    } else if (url.pathname === '/navigation-source') {
      response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><script>location.replace("/next")</script>');
    } else if (url.pathname === '/click-navigation') {
      response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><a id="next" href="/next">Next</a>');
    } else if (url.pathname === '/forms') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><title>Forms fixture</title><input id="text"><textarea id="notes"></textarea><input id="readonly" readonly value="locked"><div id="editable" contenteditable="true"></div>');
    } else if (url.pathname === '/response') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<h1>source</h1><script>document.querySelector("h1").textContent="mutated"</script>');
    } else if (url.pathname === '/plain-text') {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('\n<script>globalThis.shouldNotRun=true</script><b>literal & text</b>');
    } else if (url.pathname === '/request-headers') {
      const headers = JSON.stringify(headersFor(request)).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`<!doctype html><title>Request headers</title><pre id="navigation">${headers}</pre>
        <pre id="resource"></pre><pre id="fetch"></pre><script src="/header-script.js"></script>
        <script>fetch('/header-api', {headers: {'x-page':'page-value','x-shared':'page'}})
          .then(r => r.json()).then(data => document.querySelector('#fetch').textContent = JSON.stringify(data));</script>`);
    } else if (url.pathname === '/header-script.js') {
      response.writeHead(200, { 'content-type': 'text/javascript' });
      response.end(`document.querySelector('#resource').textContent=${JSON.stringify(JSON.stringify(headersFor(request))).replaceAll('<', '\\u003c')}`);
    } else if (url.pathname === '/header-api') {
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(headersFor(request)));
    } else if (url.pathname === '/redirect') {
      response.writeHead(302, { location: '/next', 'set-cookie': 'redirect=kept; Path=/' }); response.end();
    } else if (url.pathname === '/redirect-to') {
      response.writeHead(302, { location: url.searchParams.get('url') }); response.end();
    } else if (url.pathname === '/resource-redirect-page') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<pre id="resource"></pre><script src="/redirecting-script"></script>');
    } else if (url.pathname === '/redirecting-script') {
      response.writeHead(302, { location: '/header-script.js', 'set-cookie': ['resource-one=a; Path=/', 'resource-two=b; Path=/'] }); response.end();
    } else if (url.pathname === '/resource-error-page') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<h1>Document survived</h1><script src="/missing-script"></script>');
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
