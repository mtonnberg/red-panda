// Preload before the messaging/frame-write overlays while production is moving.
// Uses immutable committed source, and refuses silently changed snapshot bytes.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
const manifest=JSON.parse(readFileSync(new URL('./frozen-base.json',import.meta.url)));
const files=new Map(Object.entries(manifest.files).filter(([name])=>name.startsWith('src/')&&name.endsWith('.js')).map(([name,hash])=>{
 const source=readFileSync(`${manifest.snapshot}/${name}`,'utf8');if(createHash('sha256').update(source).digest('hex')!==hash)throw new Error(`Frozen messaging source changed: ${name}`);
 return[new URL(`../../${name}`,import.meta.url).href,source];
}));
export const hook=registerHooks({load(url,context,nextLoad){const loaded=nextLoad(url,context);return files.has(url)?{...loaded,source:files.get(url)}:loaded}});
