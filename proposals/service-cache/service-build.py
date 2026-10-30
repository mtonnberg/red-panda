import pathlib,json,tempfile,shutil,os,difflib,hashlib
here=pathlib.Path(__file__).resolve().parent;base=pathlib.Path(json.loads((here/'cache-proposal.json').read_text())['snapshot']);target=pathlib.Path(tempfile.mkdtemp(prefix='red-panda-service-proposal-',dir='/tmp'))
for name in ['src','native']:shutil.copytree(base/name,target/name)
shutil.copy2(base/'package.json',target/'package.json');os.symlink(base/'node_modules',target/'node_modules')
shutil.copy2(here/'overlay/src/service-workers.js',target/'src/service-workers.js')
def replace(source,before,after):
 if source.count(before)!=1:raise RuntimeError(f'Changed integration point ({source.count(before)}): {before}')
 return source.replace(before,after)
source=(base/'src/browser.js').read_text();source="import {installServiceWorkers} from './service-workers.js';\n"+source
before="      installWorkers(this, window, { enabled: this.browser.options.loadResources === undefined || this.browser.options.loadResources.includes('worker') });"
source=replace(source,before,before.replace('      installWorkers(', '      const workers=installWorkers(')+"\n      installServiceWorkers(this,window,{enabled:Boolean(this.browser.options.experimentalFeatures?.serviceworker),secure:window.isSecureContext,spawn:workers.createService});")
(target/'src/browser.js').write_text(source)
source=(base/'src/workers.js').read_text();source="import {installServiceWorkerRealm} from './service-workers.js';\n"+source
source=replace(source,'  let disposed = false;', '  const serviceRequests=new Map();\n  let disposed = false;')
source=replace(source,'    constructor(input, options = {}) {\n      super();', '    constructor(input, options = {}, serviceToken) {\n      super();\n      const service=serviceRequests.get(serviceToken);serviceRequests.delete(serviceToken);')
source=replace(source,'      if (!enabled) return;', '      if (!enabled&&!service) return;')
source=replace(source,'redPandaWorker: true, cacheEnabled:', 'redPandaWorker: true, service:service?.initial, cacheEnabled:')
source=replace(source,'      owned.add(this);', "      service?.setControls(message=>{if(!this.#terminated)this.#thread.postMessage(message);},()=>this.terminate(),(data,transfer)=>this.postMessage(data,transfer));\n      owned.add(this);")
source=replace(source,"        if (message.kind === 'cacheOperation') {", """        if(message.kind==='serviceReady')service?.ready();
        else if(message.kind==='serviceLifecycle')service?.lifecycle(message.type,message.error);
        else if(message.kind==='serviceError')service?.error(message.error);
        else if(message.kind==='serviceCall'){
          try{const result=await service.call(message.operation,message.args);if(!this.#terminated&&active())this.#thread.postMessage({kind:'serviceResponse',id:message.id,result});}
          catch(error){if(!this.#terminated&&active())this.#thread.postMessage({kind:'serviceResponse',id:message.id,error:{name:error.name,message:error.message}});}
        }
        else if (message.kind === 'cacheOperation') {""")
source=replace(source,"        else if (message.kind === 'error') {", "        else if (message.kind === 'error') {\n          if(service){page.emit('console',{type:'error',args:[message.error.message]});return;}")
source=replace(source,"        if (!this.#terminated && active()) {\n          const event = new window.ErrorEvent", "        if (!this.#terminated && active()) {\n          if(service){service.error({name:error.name,message:error.message});return;}\n          const event = new window.ErrorEvent")
source=replace(source,"  return { dispose, get size() { return owned.size; } };", "  return { dispose, createService(input,options,configuration){const token=Symbol();serviceRequests.set(token,configuration);return new Worker(input,options,token);}, get size() { return owned.size; } };")
source=replace(source,'const pending = new Map(), cachePending=new Map(), queued = [];', 'const pending = new Map(), cachePending=new Map(), servicePending=new Map(), queued = [];')
source=replace(source,'let requestId = 1, ready = false, closed = false, context, emit, messaging, streams, broadcast;', 'let requestId = 1, ready = false, closed = false, context, emit, messaging, streams, broadcast,serviceRuntime;')
source=replace(source,'    const createTrustedMessage = (type, data, ports, origin', '    globalThis.__trustWorkerEvent=event=>{trustedEvents.add(event);return event;};\n    const createTrustedMessage = (type, data, ports, origin')
source=replace(source,"  const createTrustedMessage = vm.runInContext('__createTrustedMessage', context);", "  const createTrustedMessage = vm.runInContext('__createTrustedMessage', context);\n  const trustWorkerEvent=vm.runInContext('__trustWorkerEvent',context);")
source=replace(source,"  vm.runInContext('delete globalThis.__emitMessage; delete globalThis.__createTrustedMessage;', context);", """  if(workerData.service)serviceRuntime=installServiceWorkerRealm(vm.runInContext('globalThis',context),{evaluate:source=>vm.runInContext(source,context),initial:workerData.service,active:()=>!closed,trustEvent:trustWorkerEvent,
    call(operation,args){return new Promise((resolve,reject)=>{const id=requestId++;servicePending.set(id,{resolve,reject});parentPort.postMessage({kind:'serviceCall',id,operation,args});});}});
  vm.runInContext('delete globalThis.__emitMessage; delete globalThis.__createTrustedMessage;delete globalThis.__trustWorkerEvent;', context);""")
source=replace(source,"    if(message.kind==='cacheResponse')", """    if(message.kind==='serviceState'){serviceRuntime?.update(message.record,true);}
    else if(message.kind==='serviceLifecycle'){serviceRuntime.dispatch(message.type).then(()=>{if(!closed)parentPort.postMessage({kind:'serviceLifecycle',type:message.type});},failure=>{if(!closed)parentPort.postMessage({kind:'serviceLifecycle',type:message.type,error:error(failure)});});}
    else if(message.kind==='serviceResponse'){const entry=servicePending.get(message.id);if(!entry)return;servicePending.delete(message.id);message.error?entry.reject(Object.assign(new Error(message.error.message),{name:message.error.name})):entry.resolve(message.result);}
    else if(message.kind==='cacheResponse')""")
source=replace(source,'    ready = true;', "    ready = true;\n    if(workerData.service)parentPort.postMessage({kind:'serviceReady'});")
source=replace(source,'  } catch (error) { dispatchError(error); }\n}', "  } catch (failure) { if(workerData.service)parentPort.postMessage({kind:'serviceError',error:error(failure)});else dispatchError(failure); }\n}")
(target/'src/workers.js').write_text(source)
files=['src/service-workers.js','src/browser.js','src/workers.js'];patch=''
for name in files:
 old=(base/name).read_text()if(base/name).exists()else'';new=(target/name).read_text();patch+=''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+name,tofile='b/'+name))
(here/'service-integration.patch').write_text(patch)
metadata={'kind':'isolated-service-worker-prototype','baseSnapshot':str(base),'snapshot':str(target),'productionFilesModified':False,'filesSHA256':{name:hashlib.sha256((target/name).read_bytes()).hexdigest()for name in files}}
(here/'service-proposal.json').write_text(json.dumps(metadata,indent=2)+'\n');print(json.dumps(metadata))
