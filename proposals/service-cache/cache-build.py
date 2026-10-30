import pathlib,json,tempfile,shutil,os,hashlib,difflib
here=pathlib.Path(__file__).resolve().parent;base=pathlib.Path(json.loads((here/'manifest.json').read_text())['snapshot']);target=pathlib.Path(tempfile.mkdtemp(prefix='red-panda-cache-proposal-',dir='/tmp'))
for name in ['src','native']:shutil.copytree(base/name,target/name)
shutil.copy2(base/'package.json',target/'package.json');os.symlink(base/'node_modules',target/'node_modules')
shutil.copy2(here/'overlay/src/cache.js',target/'src/cache.js')
source=(base/'src/browser.js').read_text();source="import {installCache} from './cache.js';\n"+source
anchor='      installFetch(this, window);'
assert source.count(anchor)==1
source=source.replace(anchor,anchor+'''
      const origin=this.securityOrigin??new URL(this.url).origin;
      const secure=(()=>{try{const url=new URL(origin);return url.protocol==='https:'||url.protocol==='wss:'||url.protocol==='http:'&&(url.hostname==='localhost'||url.hostname.endsWith('.localhost')||url.hostname==='[::1]'||/^127\\./.test(url.hostname));}catch{return false;}})();
      Object.defineProperty(window,'isSecureContext',{value:secure,configurable:true,enumerable:true});
      installCache(this,window,{enabled:Boolean(this.browser.options.experimentalFeatures?.serviceworker),secure});
''')
(target/'src/browser.js').write_text(source)
source=(base/'src/workers.js').read_text();source="import {installCache,cacheStoreFor} from './cache.js';\n"+source
source=source.replace('redPandaWorker: true, broadcast:', "redPandaWorker: true, cacheEnabled:Boolean(page.browser?.options?.experimentalFeatures?.serviceworker), secure:Boolean(window.isSecureContext), cacheOrigin:page.securityOrigin??window.location.origin, broadcast:")
source=source.replace("        if (message.kind === 'message') messaging.dispatchMessage(this, message);", """        if (message.kind === 'cacheOperation') {
          try { const result=await cacheStoreFor(page).operate(page.securityOrigin??window.location.origin,message.operation,message.args);if(!this.#terminated&&active())this.#thread.postMessage({kind:'cacheResponse',id:message.id,result}); }
          catch(error) {if(!this.#terminated&&active())this.#thread.postMessage({kind:'cacheResponse',id:message.id,error:{name:error.name,message:error.message}});}
        } else if (message.kind === 'message') messaging.dispatchMessage(this, message);""")
source=source.replace('const pending = new Map(), queued = [];','const pending = new Map(), cachePending=new Map(), queued = [];')
source=source.replace("    if (message.kind === 'response') {", """    if(message.kind==='cacheResponse') {const entry=cachePending.get(message.id);if(!entry)return;cachePending.delete(message.id);message.error?entry.reject(Object.assign(new Error(message.error.message),{name:message.error.name})):entry.resolve(message.result);}
    else if (message.kind === 'response') {""")
anchor="  vm.runInContext(GEOMETRY_SOURCE, context);"
assert source.count(anchor)==1
source=source.replace(anchor,anchor+"""
  Object.defineProperty(vm.runInContext('globalThis',context),'isSecureContext',{value:Boolean(workerData.secure),configurable:true,enumerable:true});
  installCache({url:workerData.url,securityOrigin:workerData.cacheOrigin,documentAbort:lifetime},vm.runInContext('globalThis',context),{enabled:workerData.cacheEnabled,secure:workerData.secure,
    store:{operate(_origin,operation,args){return new Promise((resolve,reject)=>{const id=requestId++;cachePending.set(id,{resolve,reject});parentPort.postMessage({kind:'cacheOperation',id,operation,args});});}},evaluate:source=>vm.runInContext(source,context)});
""")
(target/'src/workers.js').write_text(source)
files=['src/cache.js','src/browser.js','src/workers.js'];patch='' 
for name in files:
 old=(base/name).read_text()if(base/name).exists()else'';new=(target/name).read_text();patch+=''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+name,tofile='b/'+name))
(here/'cache-integration.patch').write_text(patch)
m={'kind':'isolated-cache-proposal','baseSnapshot':str(base),'snapshot':str(target),'productionFilesModified':False,'filesSHA256':{name:hashlib.sha256((target/name).read_bytes()).hexdigest()for name in files}}
(here/'cache-proposal.json').write_text(json.dumps(m,indent=2)+'\n');print(json.dumps(m))
