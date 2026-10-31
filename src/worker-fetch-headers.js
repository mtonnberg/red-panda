import {createRequire} from 'node:module';
const MIMEType=createRequire(import.meta.url)('whatwg-mimetype');
const forbidden=new Set(['accept-charset','accept-encoding','access-control-request-headers','access-control-request-method','connection','content-length','cookie','cookie2','date','dnt','expect','host','keep-alive','origin','permissions-policy','referer','te','trailer','transfer-encoding','upgrade','user-agent','via']);
export function forbiddenWorkerHeader(name,value){return forbidden.has(name)||name.startsWith('sec-')||name.startsWith('proxy-')||(['x-http-method','x-http-method-override','x-method-override'].includes(name)&&value.split(',').some(v=>['CONNECT','TRACE','TRACK'].includes(v.trim().toUpperCase())))}
export function simpleWorkerHeader(name,value){
 if(value.length>128)return false;
 if(['accept-language','content-language'].includes(name))return /^[0-9A-Za-z *,\-.;=]*$/.test(value);
 if(name==='range')return /^bytes=\d+-\d*$/.test(value);
 if(!['accept','content-type'].includes(name)||/[\x00-\x08\x0a-\x1f\x7f"():<>?@[\]{}]/.test(value))return false;
 if(name==='accept')return true;
 try{return ['application/x-www-form-urlencoded','multipart/form-data','text/plain'].includes(new MIMEType(value).essence)}catch{return false}
}
export function guardWorkerHeaders(raw,guard){
 const out=new Headers();for(const[name,value]of raw){if(guard==='response'&&['set-cookie','set-cookie2'].includes(name))continue;if(guard.startsWith('request')&&forbiddenWorkerHeader(name,value))continue;if(guard==='request-no-cors'&&!simpleWorkerHeader(name,value))continue;out.append(name,value)}return out;
}
