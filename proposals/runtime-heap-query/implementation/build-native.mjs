// Explicit CLI-only independent heap addon builder.
import { spawnSync } from 'node:child_process';
import { readFileSync,writeFileSync,mkdirSync,renameSync,rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const args=process.argv.slice(2),get=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]};
if(args.length!==4||!get('--headers')||!get('--output'))throw Error('Usage: node build-native.mjs --headers <exact SDK include/node> --output <heap-query.node>');
const headers=path.resolve(get('--headers')),output=path.resolve(get('--output')),source=path.join(root,'native/heap-query.cc');
const nodeHeader=readFileSync(path.join(headers,'node_version.h'),'utf8'),v8Header=readFileSync(path.join(headers,'v8-version.h'),'utf8');
const number=(text,name)=>{const m=text.match(new RegExp('^#define\\s+'+name+'\\s+(\\d+)','m'));if(!m)throw Error('Missing SDK macro '+name);return m[1]};
const sdkNode=['MAJOR','MINOR','PATCH'].map(x=>number(nodeHeader,'NODE_'+x+'_VERSION')).join('.');
const sdkV8=['MAJOR_VERSION','MINOR_VERSION','BUILD_NUMBER','PATCH_LEVEL'].map(x=>number(v8Header,'V8_'+x)).join('.');
if('v'+sdkNode!==process.version||sdkV8!==process.versions.v8.split('-')[0]||number(nodeHeader,'NODE_MODULE_VERSION')!==process.versions.modules)throw Error('Exact Node/V8/ABI SDK mismatch');
const compiler='g++',version=spawnSync(compiler,['--version'],{encoding:'utf8',timeout:10000});if(version.status!==0)throw Error('C++ compiler unavailable');
mkdirSync(path.dirname(output),{recursive:true});const temporary=output+'.tmp-'+process.pid;
const compilerArgs=['-std=c++20','-O2','-fno-strict-aliasing','-fPIC','-shared','-Wall','-Wextra','-Wno-unused-parameter','-Wno-cast-function-type','-DNODE_GYP_MODULE_NAME=red_panda_heap_query','-I'+headers,source,'-o',temporary];
try{const result=spawnSync(compiler,compilerArgs,{encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});if(result.error||result.status!==0)throw Error('Native build failed: '+(result.error?.message??result.stderr));renameSync(temporary,output)}finally{rmSync(temporary,{force:true})}
const manifest={kind:'red-panda-heap-query',backend:'public-v8-query-objects',apiVersion:1,node:process.version,v8:process.versions.v8,abi:process.versions.modules,platform:process.platform,architecture:process.arch,sourceSHA256:hash(source),binarySHA256:hash(output),headers:{'node_version.h':hash(path.join(headers,'node_version.h')),'v8-version.h':hash(path.join(headers,'v8-version.h'))},compiler:version.stdout.split('\n')[0],compilerArgs};
writeFileSync(output+'.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({output,...manifest}));
