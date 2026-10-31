import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url),loaded=new Map();
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
export function loadHeapBinding(filename=fileURLToPath(new URL(`../native/build/${process.platform}-${process.arch}/node-${process.versions.node}/heap-query.node`,import.meta.url))){
 const manifest=JSON.parse(readFileSync(filename+'.json','utf8'));
 for(const [key,value]of Object.entries({node:process.version,abi:process.versions.modules,v8:process.versions.v8,platform:process.platform,architecture:process.arch,apiVersion:1,kind:"red-panda-heap-query",backend:"public-v8-query-objects"}))if(manifest[key]!==value)throw Error('Heap binding runtime mismatch: '+key);
 const source=fileURLToPath(new URL('../native/heap-query.cc',import.meta.url));
 if(manifest.sourceSHA256!==digest(source)||manifest.binarySHA256!==digest(filename))throw Error('Heap binding source/binary digest mismatch');
 if(loaded.has(filename)){if(loaded.get(filename).digest!==manifest.binarySHA256)throw Error('Loaded heap binding changed; restart required');return loaded.get(filename).binding}
 const binding=require(filename);
 if(binding.headersVersion!==process.version||String(binding.abiVersion)!==process.versions.modules||binding.apiVersion!==1||binding.backend!=="public-v8-query-objects"||binding.v8HeaderBase!==process.versions.v8.split("-")[0])throw Error('Compiled heap binding header/API mismatch');
 loaded.set(filename,{binding,digest:manifest.binarySHA256});return binding;
}

let defaultBinding;
export function getHeapBinding(){return defaultBinding??=loadHeapBinding()}
