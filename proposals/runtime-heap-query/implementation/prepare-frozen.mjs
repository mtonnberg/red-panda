// Newly written preservation helper; not used to produce historical probe results.
import { existsSync,readFileSync,mkdirSync,readdirSync,writeFileSync,cpSync,symlinkSync,realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]};
if(args.length!==4||!option('--destination')||!option('--dependencies'))throw Error('Usage: node prepare-frozen.mjs --destination <new directory> --dependencies <installed node_modules>');
const destination=path.resolve(option('--destination')),dependencies=path.resolve(option('--dependencies')),archive=path.join(here,'frozen-source-base.tar.gz');
const digest=value=>createHash('sha256').update(value).digest('hex'),epoch=JSON.parse(readFileSync(path.join(here,'validation-epoch.json'),'utf8'));
if(existsSync(destination))throw Error('Destination exists; refusing to overwrite');
if(digest(readFileSync(archive))!==epoch.sourceArchiveSHA256)throw Error('Source archive digest mismatch');
const dependencyManifest=JSON.parse(readFileSync(path.join(here,'jsdom-dependency-manifest.json'),'utf8'));
for(const [name,expected]of Object.entries(dependencyManifest.files))if(digest(readFileSync(path.join(dependencies,'jsdom',name)))!==expected)throw Error('Pinned jsdom source mismatch: '+name);
mkdirSync(destination,{recursive:true});const extracted=spawnSync('tar',['-xzf',archive,'-C',destination],{encoding:'utf8'});if(extracted.status!==0)throw Error('Archive extraction failed: '+extracted.stderr);
const baseline=JSON.parse(readFileSync(path.join(here,'frozen-base-manifest.json'),'utf8'));
for(const [name,expected]of Object.entries(baseline.files)){if(name.startsWith('native/build/'))continue;if(digest(readFileSync(path.join(destination,name)))!==expected)throw Error('Baseline extraction mismatch: '+name)}
cpSync(path.join(here,'overlay'),destination,{recursive:true});cpSync(path.join(here,'src'),path.join(destination,'src'),{recursive:true});cpSync(path.join(here,'native/heap-query.cc'),path.join(destination,'native/heap-query.cc'));
const modules=path.join(destination,'node_modules');mkdirSync(modules);
for(const name of readdirSync(dependencies)){const output=path.join(modules,name),input=path.join(dependencies,name);if(name==='jsdom')cpSync(realpathSync(input),output,{recursive:true});else symlinkSync(input,output)}
writeFileSync(path.join(destination,'PREPARATION.json'),JSON.stringify({status:'NEW_HELPER_PREPARED_NOT_BUILT_OR_RUNTIME_TESTED',sourceArchiveSHA256:epoch.sourceArchiveSHA256,jsdomSourceFingerprint:digest(readFileSync(path.join(here,'jsdom-dependency-manifest.json')))},null,2)+'\n');
console.log(JSON.stringify({destination,status:'prepared; native bindings must be explicitly built with exact SDK'}));
