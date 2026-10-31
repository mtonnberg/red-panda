import {spawn} from 'node:child_process';
import {readFile,mkdir,rename,rm,writeFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const source=fileURLToPath(new URL('./heap-query.cc',import.meta.url));
export const defaultHeapPath=fileURLToPath(new URL(`./build/${process.platform}-${process.arch}/node-${process.versions.node}/heap-query.node`,import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
function macro(text,name){const value=text.match(new RegExp('^#define\\s+'+name+'\\s+(\\d+)','m'))?.[1];if(value===undefined)throw Error('Missing SDK macro '+name);return value}
async function sdk(explicit){
 const executable=await realpath(process.execPath),candidates=[explicit,path.resolve(path.dirname(executable),'../include/node'),path.resolve(path.dirname(executable),`../node_modules/node-${process.platform}-${process.arch}/include/node`),`/workspace/shared/node-headers/${process.version}/node-${process.version}/include/node`,'/usr/include/node'].filter(Boolean);
 for(const include of candidates){try{const node=await readFile(path.join(include,'node_version.h'),'utf8'),v8=await readFile(path.join(include,'v8-version.h'),'utf8');const version=['MAJOR','MINOR','PATCH'].map(part=>macro(node,'NODE_'+part+'_VERSION')).join('.'),v8Base=['MAJOR_VERSION','MINOR_VERSION','BUILD_NUMBER','PATCH_LEVEL'].map(part=>macro(v8,'V8_'+part)).join('.');if('v'+version!==process.version||macro(node,'NODE_MODULE_VERSION')!==process.versions.modules||v8Base!==process.versions.v8.split('-')[0])throw Error('Exact Node/V8/ABI SDK mismatch');return {include,node,v8}}catch(error){if(include===explicit)throw error}}
 throw Error('Exact Node/V8 SDK is required; set RED_PANDA_NODE_HEADERS');
}
function execute(command,args,timeout=120000){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='',expired=false;const timer=setTimeout(()=>{expired=true;child.kill('SIGKILL')},timeout);const collect=(existing,data)=>existing.length<100000?existing+data:existing;child.stdout.on('data',data=>{stdout=collect(stdout,data)});child.stderr.on('data',data=>{stderr=collect(stderr,data)});child.once('error',error=>{clearTimeout(timer);reject(error)});child.once('close',code=>{clearTimeout(timer);if(expired)reject(Error('Heap compiler deadline exceeded'));else if(code!==0)reject(Error('Heap compiler failed: '+stderr));else resolve(stdout)})})}
export async function buildHeap({headers=process.env.RED_PANDA_NODE_HEADERS,output=defaultHeapPath}={}){
 if(process.platform!=='linux')throw Error('The independent heap addon currently has a Linux build recipe');
 const header=await sdk(headers),compiler=process.env.CXX??'g++',compilerVersion=(await execute(compiler,['--version'],10000)).split('\n')[0];
 output=path.resolve(output);await mkdir(path.dirname(output),{recursive:true});const temporary=output+'.'+process.pid+'.tmp';
 const compilerArgs=['-std=c++20','-O2','-fno-strict-aliasing','-fPIC','-shared','-Wall','-Wextra','-Wno-unused-parameter','-Wno-cast-function-type','-DNODE_GYP_MODULE_NAME=red_panda_heap_query','-I'+header.include,source,'-o',temporary];
 try{await execute(compiler,compilerArgs);const manifest={kind:'red-panda-heap-query',backend:'public-v8-query-objects',apiVersion:1,node:process.version,v8:process.versions.v8,abi:process.versions.modules,platform:process.platform,architecture:process.arch,sourceSHA256:hash(await readFile(source)),binarySHA256:hash(await readFile(temporary)),headers:{'node_version.h':hash(header.node),'v8-version.h':hash(header.v8)},compiler:compilerVersion,compilerArgs};await rename(temporary,output);await writeFile(output+'.json',JSON.stringify(manifest,null,2)+'\n');return {output,manifest}}finally{await rm(temporary,{force:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]};process.stdout.write(JSON.stringify(await buildHeap({headers:option('--headers'),output:option('--output')}))+'\n')}
