import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require=createRequire(import.meta.url);
export const output=fileURLToPath(new URL(`../../.cache/window-messaging-entry/node-${process.versions.node}/entry.node`,import.meta.url));
export async function buildEntry(){
 const executable=await realpath(process.execPath),source=fileURLToPath(new URL('./entry.cc',import.meta.url));
 const candidates=[process.env.RED_PANDA_NODE_HEADERS,path.resolve(path.dirname(executable),'../include/node'),path.resolve(path.dirname(executable),`../node_modules/node-${process.platform}-${process.arch}/include/node`),`/workspace/shared/node-headers/${process.version}/node-${process.version}/include/node`].filter(Boolean);
 let headers;for(const candidate of candidates){try{const version=await readFile(path.join(candidate,'node_version.h'),'utf8');if(['MAJOR','MINOR','PATCH'].map(name=>version.match(new RegExp(`^#define NODE_${name}_VERSION ([0-9]+)$`,'m'))?.[1]).join('.')===process.versions.node){headers=candidate;break}}catch{}}
 if(!headers)throw new Error(`Matching Node headers required for ${process.version}`);
 await mkdir(path.dirname(output),{recursive:true});
 await new Promise((resolve,reject)=>{const child=spawn(process.env.CXX??'g++',['-std=c++20','-O2','-fno-strict-aliasing','-fPIC','-shared','-Wall','-Wextra','-Wno-unused-parameter','-DNODE_GYP_MODULE_NAME=red_panda_messaging_entry',`-I${headers}`,source,'-o',output],{stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',chunk=>{if(stderr.length<20000)stderr+=chunk});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`Entry compiler ${code}: ${stderr}`)))});
 const manifest={node:process.version,abi:process.versions.modules,v8:process.versions.v8,platform:process.platform,architecture:process.arch,headers,sourceSHA256:createHash('sha256').update(await readFile(source)).digest('hex'),binarySHA256:createHash('sha256').update(await readFile(output)).digest('hex')};
 await writeFile(output+'.json',JSON.stringify(manifest,null,2)+'\n');return{output,manifest};
}
export async function loadEntry(){
 const manifest=JSON.parse(await readFile(output+'.json','utf8'));
 for(const[key,expected]of Object.entries({node:process.version,abi:process.versions.modules,v8:process.versions.v8,platform:process.platform,architecture:process.arch}))if(manifest[key]!==expected)throw new Error(`Entry addon ${key} mismatch`);
 if(manifest.sourceSHA256!==createHash('sha256').update(await readFile(new URL('./entry.cc',import.meta.url))).digest('hex'))throw new Error('Entry addon source mismatch');
 if(manifest.binarySHA256!==createHash('sha256').update(await readFile(output)).digest('hex'))throw new Error('Entry addon binary mismatch');return require(output);
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildEntry()));
