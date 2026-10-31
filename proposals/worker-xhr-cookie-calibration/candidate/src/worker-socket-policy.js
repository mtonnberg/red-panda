// Host-only browser-context policy. The reply stays in worker host state and
// supplies the genuine physical upgrade; it is never exposed to authored JS.
export async function workerSocketPolicy(page, input) {
  const url=new URL(input);
  if(!['ws:','wss:'].includes(url.protocol))throw new TypeError('Socket policy requires ws or wss');
  const cookieURL=new URL(url);cookieURL.protocol=url.protocol==='wss:'?'https:':'http:';
  // Measured Native upgrade policy ignores both CLI headers and CDP extra
  // headers, while honoring actual UA/language overrides and the cookie jar.
  const headers=new Headers({'accept':'*/*'});
  if(page.userAgent)headers.set('user-agent',page.userAgent);
  if(!headers.has('accept-language')&&page.acceptLanguage)headers.set('accept-language',page.acceptLanguage);
  const cookies=await page.context?.cookies.getCookieString(cookieURL.href);
  if(cookies)headers.set('cookie',cookies);else headers.delete('cookie');
  return {headers:[...headers]};
}
