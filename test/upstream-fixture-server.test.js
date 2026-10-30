import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startFixtureServer } from '../scripts/upstream-fixture-server.mjs';

async function fixture(profile='xhr-subset') {
  const parent=await mkdtemp(join(tmpdir(),'red-panda-fixture-server-'));
  const root=join(parent,'root');
  const {mkdir}=await import('node:fs/promises');
  await mkdir(root);
  await writeFile(join(root,'test.html'),'<p>unaltered fixture</p>');
  await writeFile(join(parent,'secret.html'),'outside-root');
  await symlink(join(parent,'secret.html'),join(root,'escape.html'));
  const server=await startFixtureServer(root,{port:0,profile});
  return {...server,close:async()=>{await server.close();await rm(parent,{recursive:true,force:true});}};
}

function request(origin,path,options={}) {
  return new Promise((resolve,reject)=>{
    const req=http.request(origin,{path,...options},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>resolve({status:res.statusCode,reason:res.statusMessage,headers:res.headers,rawHeaders:res.rawHeaders,body:Buffer.concat(chunks)}));
    });req.on('error',reject);req.end();
  });
}

test('fixture XHR routes preserve observable status, body, MIME and reason contracts',async()=>{
  const server=await fixture();
  try {
    const xhr=await request(server.origin,'/xhr');
    assert.equal(xhr.body.toString(),'1234567890'.repeat(10));
    assert.equal(xhr.headers['content-type'],'text/html; charset=utf-8');
    assert.equal((await request(server.origin,'/xhr_empty')).body.length,0);
    assert.deepEqual((await request(server.origin,'/xhr/binary')).body,Buffer.from([0,0,1,2,0,0,9]));
    assert.equal((await request(server.origin,'/xhr/json')).body.toString(),'{"over":"9000!!!","updated_at":1765867200000}');
    assert.equal((await request(server.origin,'/xhr/xml')).headers['content-type'],'application/xml');
    assert.equal((await request(server.origin,'/xhr/no_content_type')).headers['content-type'],undefined);
    assert.equal((await request(server.origin,'/xhr/reason')).reason,'HOUSTON WE HAVE A');
    assert.equal((await request(server.origin,'/xhr/404')).status,404);
    assert.equal((await request(server.origin,'/status/429')).status,429);
    const bad=await request(server.origin,'/xhr/bad_gzip');
    assert.equal(bad.headers['content-encoding'],'gzip');assert.equal(bad.body.toString(),'not actually gzip');
    const duplicate=await request(server.origin,'/xhr/duplicate_headers');
    assert.equal(duplicate.headers['x-b'],'1, 2, 3');
    assert.equal(duplicate.rawHeaders.filter(value=>value==='X-B').length,2);
    assert.equal(server.requests.every(entry=>entry.routeKnown),true);
  } finally {await server.close();}
});

test('fixture redirects, scoped cookies, header echo and preflight use explicit contracts',async()=>{
  const server=await fixture();
  try {
    assert.equal((await request(server.origin,'/xhr/redirect')).headers.location,`${server.origin}/xhr`);
    assert.equal((await request(server.origin,'/set_cookie')).headers['set-cookie'][0],'lp_hidden=1; Path=/set_cookie_scope');
    const redirect=await request(server.origin,'/download_tool/redirect');
    assert.equal(redirect.status,302);assert.equal(redirect.headers.location,'/download_tool/echo_headers');
    assert.equal(redirect.headers['set-cookie'][0],'lp_redirect=1; Path=/download_tool');
    const echo=await request(server.origin,'/echo_headers',{headers:{'X-Hop':'value',Origin:'http://example.test'}});
    assert.match(echo.body.toString(),/X-Hop: value\n/);
    assert.equal(echo.headers['access-control-allow-origin'],'http://example.test');
    const preflight=await request(server.origin,'/echo_headers',{method:'OPTIONS',headers:{Origin:'http://example.test'}});
    assert.equal(preflight.headers['access-control-allow-headers'],'x-hop');
  } finally {await server.close();}
});

test('fixture static files reject encoded traversal, symlink escape and unsupported routes',async()=>{
  const server=await fixture('static');
  try {
    const file=await request(server.origin,'/src/browser/tests/test.html');
    assert.equal(file.status,200);assert.equal(file.body.toString(),'<p>unaltered fixture</p>');
    const head=await request(server.origin,'/src/browser/tests/test.html',{method:'HEAD'});
    assert.equal(head.body.length,0);assert.equal(Number(head.headers['content-length']),file.body.length);
    for(const path of ['/src/browser/tests/%2e%2e%2fsecret.html','/src/browser/tests/escape.html','/src/browser/tests/%5csecret.html']) {
      const response=await request(server.origin,path);assert.notEqual(response.status,200);assert.doesNotMatch(response.body.toString(),/outside-root/);
    }
    const unavailable=await request(server.origin,'/xhr');
    assert.equal(unavailable.status,404);assert.match(unavailable.body.toString(),/Unsupported fixture route/);
    assert.equal(server.requests.at(-1).routeKnown,false);
    assert.equal((await request(server.origin,'/src/browser/tests/%zz')).status,400);
  } finally {await server.close();}
});

test('fixture metadata exposes incomplete coverage and intentional error routes remain known',async()=>{
  const server=await fixture();
  try {
    const metadata=JSON.parse((await request(server.origin,'/__fixture_metadata')).body.toString());
    assert.equal(metadata.completeUpstreamServer,false);assert.ok(metadata.unsupportedRouteGroups.includes('SSE'));
    await request(server.origin,'/xhr/404');assert.equal(server.requests.at(-1).routeKnown,true);
    await request(server.origin,'/sse/simple');assert.equal(server.requests.at(-1).routeKnown,false);
  } finally {await server.close();}
});

test('fixture shutdown cancels delayed owned requests without waiting for the long response',async()=>{
  const server=await fixture();
  const pending=request(server.origin,'/xhr/hang').catch(error=>error);
  while(server.requests.length===0)await new Promise(resolve=>setImmediate(resolve));
  const started=Date.now();await server.close();
  assert.ok(Date.now()-started<1000);assert.ok(await pending instanceof Error);
});
