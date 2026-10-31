// Actual CookieJar text is UTF-8 on the HTTP wire. Native Headers and Node's
// HTTP client accept byte-valued strings, so encode only this private producer.
// Authored Headers and privileged configured-header validation stay unchanged.
const from=Buffer.from;
export function internalCookieHeader(value){return from(value,'utf8').toString('latin1')}
