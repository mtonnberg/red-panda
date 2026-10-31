import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {Browser} from '../src/browser.js';
import {serve} from '../src/cdp.js';
import {createSharedWorkerHTTP} from '../src/shared-worker-http.js';
import {observeCookieJar} from '../src/cookie-jar-observer.js';
import {setCookie} from '../src/cookies.js';
import {connect} from './cdp-client.js';

const headers=[
 'plain=actual; Path=/', 'rejected=invalid; Path=/; SameSite=None',
 'secure=actual; Path=/; SameSite=None; Secure',
 'last_lax=actual; Path=/; SameSite=None; SameSite=Lax',
 'last_none=invalid; Path=/; SameSite=Lax; SameSite=None',
 'ignored_unknown=invalid; Path=/; SameSite=None; SameSite=unknown',
 'quoted=actual; Path=/; SameSite="None"',
 'secure_value=actual; Path=/; SameSite=None; Secure=0'
];
async function actualServer(t){
 const source=`import{parentPort,workerData}from'node:worker_threads';import{createServer}from'node:http';const requests=[];const server=createServer((request,response)=>{requests.push({url:request.url,headers:request.headers});if(request.url==='/requests'){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(requests));return}const cookies=request.url==='/set'?workerData.headers:request.url==='/invalid'?['existing=invalid;Path=/;SameSite=None','existing=invalid;Path=/;SameSite=None;Max-Age=0']:[];response.writeHead(200,{'content-type':request.url==='/'?'text/html':'text/plain',...(cookies.length?{'set-cookie':cookies}:{})});response.end(request.url==='/'?'<!doctype html><body>Actual cookie transport document':'Actual cookie transport response')});server.listen(0,'127.0.0.1',()=>parentPort.postMessage({port:server.address().port}));`;
 const worker=new Worker(new URL('data:text/javascript,'+encodeURIComponent(source)),{workerData:{headers},execArgv:[]});t.after(()=>worker.terminate());
 const[{port}]=await once(worker,'message');return'http://127.0.0.1:'+port;
}
const cookieView=async(jar,origin)=>(await jar.getCookies(origin.replace('http:','https:')+'/')).map(cookie=>({name:cookie.key,value:cookie.value,sameSite:cookie.sameSite,secure:cookie.secure}));
const expectedNames=['plain','secure','last_lax','quoted','secure_value'];
async function actualPage(t){const origin=await actualServer(t),browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());await page.navigate(origin+'/');return{origin,browser,page,jar:page.context.cookies};}

for(const transport of['async','sync','shared'])test('real '+transport+' HTTP response rejects insecure None before successful mutation and preserves valid cookies',async t=>{
 const{origin,page,jar}=await actualPage(t);await jar.setCookie('existing=keep; Path=/; SameSite=None; Secure',origin+'/');
 page.userAgent='actual-cookie-owner-agent';page.acceptLanguage='xx-YY';page.extraHTTPHeaders.set('x-cookie-owner','from-cdp');page.cliHTTPHeaders.set('x-cookie-owner','from-cli');
 const changes=[],unsubscribe=observeCookieJar(jar,(kind,cookie)=>changes.push({kind,name:cookie.name,value:cookie.value}));t.after(unsubscribe);
 let owner;if(transport==='shared'){owner=createSharedWorkerHTTP(page,page,{origin,url:origin+'/shared.js'});t.after(()=>owner.close());}
 const request=async path=>{if(transport==='async')return(await page.fetch(origin+path)).text();if(transport==='shared')return(await owner.fetch(origin+path)).text();return page.evaluate('(()=>{const x=new XMLHttpRequest();x.open("GET",'+JSON.stringify(path)+',false);x.send();if(x.status!==200)throw Error("Actual sync response failed");return x.responseText})()');};
 assert.equal(await request('/invalid'),'Actual cookie transport response');assert.deepEqual(changes,[]);assert.equal((await cookieView(jar,origin)).find(cookie=>cookie.name==='existing').value,'keep');
 assert.equal(await request('/set'),'Actual cookie transport response');const cookies=await cookieView(jar,origin);assert.deepEqual(cookies.filter(cookie=>cookie.name!=='existing').map(cookie=>cookie.name),expectedNames);assert.equal(cookies.find(cookie=>cookie.name==='last_lax').sameSite,'lax');assert.equal(cookies.find(cookie=>cookie.name==='quoted').sameSite,undefined);assert.equal(cookies.find(cookie=>cookie.name==='secure_value').secure,true);assert.deepEqual(changes.map(change=>change.name),expectedNames);
 const wire=await(await fetch(origin+'/requests')).json();for(const entry of wire.filter(entry=>entry.url==='/invalid'||entry.url==='/set')){assert.equal(entry.headers['user-agent'],'actual-cookie-owner-agent');assert.equal(entry.headers['accept-language'],'xx-YY');assert.equal(entry.headers['x-cookie-owner'],'from-cli');}
});

test('CDP keeps actual HTTPS defaults, exact enum and schema results, valid batch members and rejected replacements',async t=>{
 const origin=await actualServer(t),service=await serve({port:0}),client=await connect('ws://127.0.0.1:'+service.port+'/');t.after(async()=>{await client.close();await service.close()});
 const{browserContextId}=await client.send('Target.createBrowserContext'),{targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});const send=(method,params={})=>client.send(method,params,sessionId);await send('Page.enable');await send('Page.navigate',{url:origin+'/'});
 assert.deepEqual(await send('Network.setCookie',{name:'invalid',value:'bad',url:origin+'/',sameSite:'None'}),{success:false});
 // These combined inputs establish policy ordering, not a global range rule.
 for(const options of[{name:''},{expires:-2}])assert.deepEqual(await send('Network.setCookie',{name:'invalid',value:'bad',url:origin+'/',sameSite:'None',secure:false,...options}),{success:false});
 assert.deepEqual(await send('Network.setCookie',{name:'existing',value:'keep',url:origin+'/',sameSite:'None',secure:true}),{success:true});
 for(const options of[{secure:false},{secure:false,expires:0}])assert.deepEqual(await send('Network.setCookie',{name:'existing',value:'bad',url:origin+'/',sameSite:'None',...options}),{success:false});
 assert.deepEqual(await send('Network.setCookie',{name:'https_default',value:'actual',url:origin.replace('http:','https:')+'/',sameSite:'None',secure:false}),{success:true});
 assert.deepEqual(await send('Network.setCookie',{name:'lowercase',value:'actual',url:origin+'/',sameSite:'none'}),{success:true});
 await assert.rejects(send('Network.setCookie',{name:'missing',url:origin+'/',sameSite:'None'}),error=>error.code===-31998&&error.message==='MissingField');await assert.rejects(send('Network.setCookie',{name:'wrong_type',value:'actual',url:origin+'/',sameSite:'None',secure:0}),error=>error.code===-31998&&error.message==='UnexpectedToken');await assert.rejects(send('Network.setCookie',{name:'bad;name',value:'actual',url:origin+'/',sameSite:'None'}),error=>error.code===-31998&&error.message==='Sanitizing cookie failed');
 for(const url of[null,undefined])await assert.rejects(send('Network.setCookie',{name:'missing_address',value:'actual',url,sameSite:'None'}),error=>error.code===-32602&&error.message==='At least one of the url or domain needs to be specified');
 for(const[name,invalid,message,code]of[['schema',{name:'missing',url:origin+'/'},'MissingField',-31998],['sanitize',{name:'bad;name',value:'bad',url:origin+'/',sameSite:'None'},'Invalid cookie fields',-32602]])await assert.rejects(send('Network.setCookies',{cookies:[{name:'atomic_'+name,value:'must-not-store',url:origin+'/',sameSite:'None',secure:true},invalid]}),error=>error.code===code&&error.message===message);
 for(const method of['Network.setCookies','Storage.setCookies']){const cookies=[{name:method[0]+'_valid',value:'keep',url:origin+'/',sameSite:'None',secure:true},{name:method[0]+'_invalid',value:'bad',url:origin+'/',sameSite:'None'}];assert.deepEqual(await(method==='Storage.setCookies'?client.send(method,{browserContextId,cookies}):send(method,{cookies})),{});}
 const{cookies}=await send('Network.getCookies',{urls:[origin.replace('http:','https:')+'/']});assert.deepEqual(cookies.map(cookie=>cookie.name),['existing','https_default','lowercase','N_valid','S_valid']);assert.equal(cookies[0].value,'keep');assert.equal(cookies[1].secure,true);assert.equal(cookies[2].sameSite,undefined);
});

test('generic importer and raw embedding jar retain their previous behavior outside the measured HTTP and CDP channels',async t=>{
 const{origin,jar}=await actualPage(t);await setCookie(jar,{name:'generic',value:'actual',url:origin+'/',sameSite:'None'});await jar.setCookie('raw=actual; Path=/; SameSite=None',origin+'/');assert.deepEqual((await cookieView(jar,origin)).map(cookie=>({name:cookie.name,sameSite:cookie.sameSite,secure:cookie.secure})),[{name:'generic',sameSite:'none',secure:false},{name:'raw',sameSite:'none',secure:false}]);
});
