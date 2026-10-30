import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const manifestURL=new URL('./frozen-base.json',import.meta.url),manifest=JSON.parse(await readFile(manifestURL,'utf8'));
const destination=await mkdtemp('/tmp/red-panda-messaging-codec-base-'),cwd=fileURLToPath(new URL('../..',import.meta.url));
const archive=execFileSync('git',['archive',manifest.commit,'src','native/collections.cc','package.json','package-lock.json'],{cwd,maxBuffer:32*1024*1024});
execFileSync('tar',['-x','-C',destination],{input:archive});
for(const[name,expected]of Object.entries(manifest.files)){const bytes=await readFile(`${destination}/${name}`);if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error(`Snapshot bytes changed: ${name}`)}
manifest.snapshot=destination;await writeFile(manifestURL,JSON.stringify(manifest,null,2)+'\n');console.log(destination);
