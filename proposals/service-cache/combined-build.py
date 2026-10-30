import pathlib,json,tempfile,shutil,os,hashlib,difflib
here=pathlib.Path(__file__).resolve().parent;service=json.loads((here/'service-proposal.json').read_text());base=pathlib.Path(service['snapshot']);target=pathlib.Path(tempfile.mkdtemp(prefix='red-panda-service-combined-',dir='/tmp'))
for name in ['src','native']:shutil.copytree(base/name,target/name)
shutil.copy2(base/'package.json',target/'package.json');os.symlink(base/'node_modules',target/'node_modules')
inputs=json.loads((here/'worker-api-inputs/manifest.json').read_text())
for name,digest in inputs['filesSHA256'].items():
 source=here/'worker-api-inputs/src'/name;assert hashlib.sha256(source.read_bytes()).hexdigest()==digest;shutil.copy2(source,target/'src'/name)
def replace(source,before,after):
 if source.count(before)!=1:raise RuntimeError(f'Changed integration point ({source.count(before)}): {before}')
 return source.replace(before,after)
source=(base/'src/workers.js').read_text();source="import {installWorkerAPIs,captureWorkerCreator} from './worker-apis.js';\nimport {completeWorkerSyncResponse,createSyncWorkerRequest} from './worker-sync-transport.js';\n"+source
source=replace(source,'  const signal = page.documentAbort?.signal, owned = new Set();','  const creatorSnapshot=captureWorkerCreator(page,window);\n  const signal = page.documentAbort?.signal, owned = new Set();')
source=replace(source,'      const url = new URL(String(input), window.document.baseURI);','      const creator=creatorSnapshot();\n      const url = new URL(String(input), creator.baseURL);')
source=replace(source,'      const origin = page.securityOrigin ?? window.location.origin;','      const origin = creator.origin;')
source=replace(source,'redPandaWorker: true, service:', "redPandaWorker: true, origin:url.protocol==='data:'?'null':creator.origin, service:")
source=source.replace('secure:Boolean(window.isSecureContext)','secure:creator.secure').replace('cacheOrigin:page.securityOrigin??window.location.origin','cacheOrigin:creator.origin').replace('cacheStoreFor(page).operate(page.securityOrigin??window.location.origin,','cacheStoreFor(page).operate(creator.origin,')
source=replace(source,"}, message.script ? 'Script' : 'Fetch');", "}, message.script ? 'Script' : message.resourceType ?? 'Fetch');")
source=replace(source,'headers: [...response.headers], url: response.url || message.url, bytes };\n            if (message.sync) {', 'headers: [...response.headers], url: response.url || message.url, bytes };\n            if(message.syncBinary)completeWorkerSyncResponse(message.sync,result);\n            else if (message.sync) {')
source=replace(source,'          } catch (error) {\n            if (message.sync) {', '          } catch (error) {\n            if(message.syncBinary)completeWorkerSyncResponse(message.sync,null,error);\n            else if (message.sync) {')
source=replace(source,'const request = (url, init = {}, script = false, signal)', 'const request = (url, init = {}, script = false, signal, resourceType)')
source=replace(source,"parentPort.postMessage({ kind: 'request', id, url, init, script });", "parentPort.postMessage({ kind: 'request', id, url, init, script, resourceType });")
source=replace(source,'    async fetch(input, init = {}) {','    async fetch(input, init = {}, resourceType) {')
source=replace(source,'false, init.signal ?? original.signal);','false, init.signal ?? original.signal, resourceType);')
source=replace(source,"  Object.defineProperty(vm.runInContext('globalThis',context),'isSecureContext',{value:Boolean(workerData.secure),configurable:true,enumerable:true});", """  installWorkerAPIs(vm.runInContext('globalThis',context),{evaluate:source=>vm.runInContext(source,context),fetch:(input,init)=>bridge.fetch(input,init,'XHR'),syncRequest:createSyncWorkerRequest(parentPort),origin:workerData.origin,baseURL:()=>workerData.url,secure:workerData.secure,signal:lifetime.signal,active:()=>!closed,trustEvent:trustWorkerEvent,dedicated:!workerData.service});""")
source=replace(source,'{enabled:workerData.cacheEnabled,secure:workerData.secure,','{enabled:workerData.cacheEnabled,secure:workerData.secure,baseURL:()=>workerData.url,')
(target/'src/workers.js').write_text(source)
source=(target/'src/cache.js').read_text();source=replace(source,'store=cacheStoreFor(page), evaluate=', 'store=cacheStoreFor(page), baseURL=()=>page.url, evaluate=');source=replace(source,'const bridge={baseURL:()=>page.url,active,','const bridge={baseURL,active,')
source=replace(source,'function cacheRealm(bridge, enabled) {','function cacheRealm(bridge, enabled) {\n  const Request=globalThis.Request,Response=globalThis.Response,URL=globalThis.URL,Uint8Array=globalThis.Uint8Array;')
source=replace(source,"  const request = input => {\n    const value = input instanceof Request ? input : new Request(new URL(String(input), bridge.baseURL()).href);\n    const url = new URL(value.url); url.hash = '';\n    return {url:url.href,method:value.method,headers:Array.from(value.headers,pair=>Array.from(pair)),credentials:value.credentials};\n  };", """  const requestURL=Object.getOwnPropertyDescriptor(Request.prototype,'url').get;
  const requestMethod=Object.getOwnPropertyDescriptor(Request.prototype,'method').get;
  const requestHeaders=Object.getOwnPropertyDescriptor(Request.prototype,'headers').get;
  const requestCredentials=Object.getOwnPropertyDescriptor(Request.prototype,'credentials').get;
  const request = input => {
    let value=input;try{requestURL.call(value);}catch{value=new Request(new URL(String(input),bridge.baseURL()).href);}
    const url=new URL(requestURL.call(value));url.hash='';
    return{url:url.href,method:requestMethod.call(value),headers:Array.from(requestHeaders.call(value),pair=>Array.from(pair)),credentials:requestCredentials.call(value)};
  };""")
(target/'src/cache.js').write_text(source)
source=(target/'src/browser.js').read_text();source="import {captureWorkerCreator} from './worker-apis.js';\n"+source
start=source.index('      const origin=this.securityOrigin??new URL(this.url).origin;');end=source.index('      installCache(this,window,',start)
source=source[:start]+"      const creatorSnapshot=captureWorkerCreator(this,window);\n      const secure=creatorSnapshot().secure;\n      Object.defineProperty(window,'isSecureContext',{get:()=>creatorSnapshot().secure,configurable:true,enumerable:true});\n"+source[end:]
source=replace(source,'experimentalFeatures?.serviceworker),secure});','experimentalFeatures?.serviceworker),secure,baseURL:()=>creatorSnapshot().baseURL});');(target/'src/browser.js').write_text(source)
source=(target/'src/service-workers.js').read_text();source="import {captureWorkerCreator} from './worker-apis.js';\n"+source
source=replace(source,'  const signal=page.documentAbort?.signal,generation=', '  const creatorSnapshot=captureWorkerCreator(page,window);\n  const signal=page.documentAbort?.signal,generation=');source=source.replace('document.baseURI','creatorSnapshot().baseURL').replace('page.securityOrigin??new URL(page.url).origin','creatorSnapshot().origin');(target/'src/service-workers.js').write_text(source)

source=(target/'src/frames.js').read_text();originalFrame=source
source=replace(source,'      documentImpl._URL = parseURL(finalURL); documentImpl._origin = new URL(finalURL).origin;','      documentImpl._URL = parseURL(finalURL); documentImpl._origin = new URL(finalURL).origin;\n      documentImpl._clearBaseURLCache();')
(target/'src/frames.js').write_text(source)
(here/'redirected-frame-integration.patch').write_text(''.join(difflib.unified_diff(originalFrame.splitlines(True),source.splitlines(True),fromfile='a/src/frames.js',tofile='b/src/frames.js')))
original=pathlib.Path(json.loads((here/'manifest.json').read_text())['snapshot']);names=['src/cache.js','src/service-workers.js','src/workers.js','src/browser.js','src/frames.js']+['src/'+name for name in inputs['filesSHA256']]
patch=''
for name in names:
 old=(original/name).read_text()if(original/name).exists()else'';new=(target/name).read_text();patch+=''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+name,tofile='b/'+name))
(here/'combined-integration.patch').write_text(patch)
m={'kind':'isolated-service-cache-worker-api-combination','originalBaseSnapshot':str(original),'serviceBaseSnapshot':str(base),'snapshot':str(target),'productionFilesModified':False,'filesSHA256':{name:hashlib.sha256((target/name).read_bytes()).hexdigest()for name in names}}
(here/'combined-proposal.json').write_text(json.dumps(m,indent=2)+'\n');print(json.dumps(m))
