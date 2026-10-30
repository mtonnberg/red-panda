import http from 'node:http';
const server = http.createServer((req,res)=>{
if(req.url==='/script.js'){res.setHeader('content-type','application/javascript');res.end(`document.querySelector('h1').textContent='external'; setTimeout(()=>document.querySelector('#later').textContent='timer done',40); fetch('/data').then(r=>r.json()).then(d=>document.querySelector('#api').textContent=d.message);`);return;}
if(req.url==='/data'){res.setHeader('content-type','application/json');res.end(JSON.stringify({message:'fetched data'}));return;}
if(req.url==='/bad'){res.statusCode=404;}
res.setHeader('content-type','text/html');res.end(`<!doctype html><html><head><title>Fixture</title></head><body><h1>initial</h1><a href='/second'>Next page</a><button onclick="document.querySelector('h1').textContent='clicked'">Click</button><p id='later'></p><p id='api'></p><script>document.querySelector('h1').textContent='inline';</script><script src='/script.js'></script></body></html>`);
});server.listen(9317,'127.0.0.1',()=>console.log('fixture ready'));
