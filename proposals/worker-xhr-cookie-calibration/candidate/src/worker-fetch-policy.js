import {guardWorkerHeaders,simpleWorkerHeader} from './worker-fetch-headers.js';
const redirects=new Set([301,302,303,307,308]),simpleMethods=new Set(['GET','HEAD','POST']);
const fail=()=>{throw new TypeError('fetch error')};
function cors(response,origin,credentials){const allow=response.headers.get('access-control-allow-origin');if(allow!==origin&&!(allow==='*'&&!credentials))fail();if(credentials&&response.headers.get('access-control-allow-credentials')!=='true')fail()}

// A private consumer of actual transport responses. Each callback issues one
// real hop; request mode/principal/history never come from Window metadata.
export async function fetchWorkerHTTP({request,origin,referrerFor},input,init={},sourceURL){
 const mode=init.mode??'cors',credentials=init.credentials??'same-origin',credentialed=credentials==='include';
 let target=new URL(input),method=init.method??'GET',body=init.body,requestOrigin=origin,tainted=false,referrerSource=sourceURL;
 const headers=guardWorkerHeaders(new Headers(init.headers),mode==='no-cors'?'request-no-cors':'request'),history=[];
 for(let count=0;count<=20;count++){
  const http=['http:','https:'].includes(target.protocol),cross=http&&target.origin!==requestOrigin;
  if(mode==='same-origin'&&cross)fail();if(http&&target.origin!==origin)tainted=true;
  const unsafe=[...headers].filter(([n,v])=>!simpleWorkerHeader(n,v)).map(([n])=>n).sort();
  const preflight=mode==='cors'&&cross&&(!simpleMethods.has(method)||unsafe.length);
  if(preflight){
   const preHeaders=new Headers({'origin':requestOrigin,'access-control-request-method':method});if(unsafe.length)preHeaders.set('access-control-request-headers',unsafe.join(', '));
   const referrer=referrerFor?.(target.href,referrerSource);if(referrer)preHeaders.set('referer',referrer);
   const response=await request(target.href,{method:'OPTIONS',headers:preHeaders,credentials:'omit',mode:'cors',redirect:'manual',skipDefaultReferrer:true},history);
   cors(response,requestOrigin,credentialed);if(response.status<200||response.status>299)fail();
   const methods=(response.headers.get('access-control-allow-methods')??'').split(',').map(v=>v.trim()),names=(response.headers.get('access-control-allow-headers')??'').toLowerCase().split(',').map(v=>v.trim());
   if((!simpleMethods.has(method)&&!methods.includes(method)&&!(methods.includes('*')&&!credentialed))||unsafe.some(name=>!names.includes(name)&&!(names.includes('*')&&!credentialed&&name!=='authorization')))fail();
  }
  const actual=new Headers(headers);if(http&&(!['GET','HEAD'].includes(method)||mode==='cors'&&cross))actual.set('origin',requestOrigin);
  const referrer=referrerFor?.(target.href,referrerSource);if(referrer)actual.set('referer',referrer);referrerSource=referrer??'';
  const response=await request(target.href,{...init,method,headers:actual,body,credentials,mode,redirect:'manual',skipDefaultReferrer:true},history);
  if(mode==='cors'&&cross)cors(response,requestOrigin,credentialed);
  const location=response.headers.get('location');
  if(redirects.has(response.status)&&location){
   if(init.redirect==='error')fail();
   if(init.redirect==='manual')return{status:0,statusText:'',type:'opaqueredirect',url:'',redirected:false,headers:[],bytes:new Uint8Array()};
   if(count===20)fail();const next=new URL(location,target);if(!['http:','https:'].includes(next.protocol)||next.username||next.password)fail();
   if(next.origin!==target.origin){headers.delete('authorization');if(target.origin!==requestOrigin)requestOrigin='null'}
   if(response.status===303&&method!=='HEAD'||[301,302].includes(response.status)&&method==='POST'){method='GET';body=undefined;headers.delete('content-type');headers.delete('content-length')}
   history.push(target.href);target=next;continue;
  }
  if(mode==='no-cors'&&tainted)return{status:0,statusText:'',type:'opaque',url:'',redirected:false,headers:[],bytes:new Uint8Array()};
  // Native Worker Fetch validates CORS but exposes all non-cookie response
  // headers; it does not apply the Window response safelist/expose filter.
  const bodyNull=response.body===null,bytes=new Uint8Array(await response.arrayBuffer());return{status:response.status,statusText:response.statusText,type:http&&target.origin!==origin&&mode==='cors'?'cors':'basic',url:response.url||target.href,redirected:count>0,headers:[...guardWorkerHeaders(response.headers,'response')],bytes,bodyNull};
 }
 fail();
}
