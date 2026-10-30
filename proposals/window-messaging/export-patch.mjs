// Produce a concrete review artifact; never applies it to the shared repository.
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {transformSource} from './integration.mjs';
const root=new URL('../..',import.meta.url),manifest=JSON.parse(await readFile(new URL('./frozen-base.json',import.meta.url),'utf8'));
const normalize=source=>source.replaceAll(new URL('./platform-codec.mjs',import.meta.url).href,'./platform-codec.js').replaceAll(new URL('./broadcast-config.mjs',import.meta.url).href,'./broadcast-config.js').replaceAll(new URL('./broadcast-realm.mjs',import.meta.url).href,'./broadcast-realm.js').replaceAll("'../../src/messaging.js'","'./messaging.js'").replaceAll("'./broadcast-config.mjs'","'./broadcast-config.js'").replaceAll("'./broadcast-realm.mjs'","'./broadcast-realm.js'");
const temporary=await mkdtemp('/tmp/red-panda-messaging-patch-');let patch='';
async function append(name,before,after){const old=`${temporary}/before`,next=`${temporary}/after`;await writeFile(old,before);await writeFile(next,after);try{patch+=execFileSync('diff',['-u','--label',before?'a/'+name:'/dev/null','--label','b/'+name,old,next],{encoding:'utf8'})}catch(error){if(error.status!==1)throw error;patch+=error.stdout}}
try{
 for(const name of['src/messaging.js','src/workers.js','test/messaging.test.js']){
  const before=name.startsWith('src/')?await readFile(`${manifest.snapshot}/${name}`,'utf8'):execFileSync('git',['show',`${manifest.commit}:${name}`],{cwd:fileURLToPath(root),encoding:'utf8'});
  let after=normalize(transformSource(new URL(name,root).href,before));
  after=after.replace(/execArgv: \[\.\.\.\(typeof vm\.SourceTextModule === 'function' \? \['--experimental-vm-modules'\] : \[\]\), '--import', "[^"]+"\]/,"execArgv: typeof vm.SourceTextModule === 'function' ? ['--experimental-vm-modules'] : []");
  await append(name,before,after);
 }
 for(const[name,destination]of[['platform-codec.mjs','src/platform-codec.js'],['broadcast-config.mjs','src/broadcast-config.js'],['broadcast-realm.mjs','src/broadcast-realm.js'],['messaging.mjs','src/window-messaging.js']])await append(destination,'',normalize(await readFile(new URL(name,import.meta.url),'utf8')));
 await writeFile(new URL('./core-and-worker.patch',import.meta.url),patch);console.log('Wrote isolated core-and-worker.patch; Browser/runtime-helper wiring is separate.');
}finally{await rm(temporary,{recursive:true,force:true})}
