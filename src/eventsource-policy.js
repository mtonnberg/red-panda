import {internalCookieHeader} from './internal-cookie-header.js';
// Captured real document/worker principals select cookies, CORS and referrers.
export function eventSourcePolicy(page,{origin,referrer=page.url}){
 return{
  async headers(target,credentials,lastId){
   const headers=new Headers({'accept':'text/event-stream','cache-control':'no-cache'});if(page.userAgent)headers.set('user-agent',page.userAgent);if(page.acceptLanguage)headers.set('accept-language',page.acceptLanguage);
   const same=target.origin===origin;if(!same)headers.set('origin',origin);if(lastId)headers.set('last-event-id',Buffer.from(lastId,'utf8').toString('latin1'));
   const referer=page.referrerFor?.(target.href,referrer);if(referer)headers.set('referer',referer);
   if(credentials||same){const cookie=await page.context?.cookies?.getCookieString(target.href);if(cookie)headers.set('cookie',internalCookieHeader(cookie))}
   page.extraHTTPHeaders?.forEach((value,name)=>headers.set(name,value));page.cliHTTPHeaders?.forEach((value,name)=>headers.set(name,value));return headers;
  },
  cors(response,target,credentials){if(target.origin===origin)return true;const allowed=response.headers.get('access-control-allow-origin');return (allowed===origin||!credentials&&allowed==='*')&&(!credentials||response.headers.get('access-control-allow-credentials')==='true')},
  async cookies(response,target,credentials){if(credentials||target.origin===origin)for(const cookie of response.headers.getSetCookie())await page.context?.cookies?.setCookie(cookie,target.href,{ignoreError:true})},
 };
}
