// Preserve the canonical whatwg-url factories while allocating their first
// public shells in the owning VM. parse() binds its actual parsed backend.
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
const require=createRequire(import.meta.url);
const pins={URL:'64e6c311095210c0b4018a132231a7730f86d3f21edb68c76f4b041938253767',URLSearchParams:'1ee8059189e64d52b71ac2bad99f874566d61bfb3937ecbf126c5b90f7f0f38b'};
const pending=new WeakMap();
let installed=false;
export function installURLWrapperRealms(createShell){
 if(installed)return;installed=true;
 for(const kind of ['URLSearchParams','URL']){
  const filename=require.resolve('whatwg-url/lib/'+kind+'.js'),factory=require(filename),original=readFileSync(filename,'utf8');
  if(createHash('sha256').update(original).digest('hex')!==pins[kind])throw Error('Pinned URL factory source changed: '+kind);
  let source=original;
  const replace=(from,to)=>{if(source.split(from).length!==2)throw Error('Pinned URL factory seam changed: '+kind);source=source.replace(from,to)};
  replace('return Object.create(proto);','return createShell(globalObject, proto, '+JSON.stringify(kind)+');');
  replace('exports.setup(Object.create(new.target.prototype),','exports.setup(createShell(globalObject, new.target.prototype, '+JSON.stringify(kind)+'),');
  if(kind==='URL'){
   replace('value: new Impl.implementation(globalObject, constructorArgs, privateData),','value: selectedImplementation(globalObject, constructorArgs, privateData, Impl.implementation),');
   replace('return utils.tryWrapperForImpl(Impl.implementation.parse(globalObject, ...args));','return wrapParsed(globalObject, Impl.implementation.parse(globalObject, ...args));');
  }
  const selectedImplementation=(globalObject,args,privateData,Implementation)=>{
   const backend=pending.get(privateData);
   if(backend){pending.delete(privateData);return backend}
   return Reflect.construct(Implementation,[globalObject,args,privateData]);
  };
  const wrapParsed=(globalObject,backend)=>{
   if(backend===null)return null;
   // Only the real private parser return reaches this factory. No public
   // symbols/prototypes, dummy wrapper or replacement backend select it.
   const privateData=Object.create(null);pending.set(privateData,backend);
   try{return factory.create(globalObject,[],privateData)}finally{pending.delete(privateData)}
  };
  const module={exports:factory};
  vm.compileFunction(source,['exports','require','module','__filename','__dirname','createShell','selectedImplementation','wrapParsed'],{filename})(factory,createRequire(filename),module,filename,dirname(filename),createShell,selectedImplementation,wrapParsed);
  if(module.exports!==factory)throw Error('Canonical URL factory exports changed');
 }
}
