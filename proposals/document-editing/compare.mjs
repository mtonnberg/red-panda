import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const [nativePath,candidatePath,output]=process.argv.slice(2);
const raw=await Promise.all([nativePath,candidatePath].map(p=>readFile(p))),[native,candidate]=raw.map(b=>JSON.parse(b));
assert.equal(native.root,'native');assert.equal(native.failure,undefined);assert.equal(candidate.failure,undefined);assert.equal(native.observations.length,27);assert.equal(candidate.observations.length,27);assert.deepEqual(candidate.sourceBefore,candidate.sourceAfter);
const names=new Set(),results=[];
for(let i=0;i<27;i++){
 const a=native.observations[i],b=candidate.observations[i];assert.equal(a.name,b.name);assert.equal(names.has(a.name),false);names.add(a.name);
 for(const row of[a,b]){assert.equal(row.result.exceptionDetails,undefined);assert.equal(row.result.result.type,'string');}
 const expected=JSON.parse(a.result.result.value),actual=JSON.parse(b.result.result.value);assert.deepEqual(actual,expected,a.name);results.push({name:a.name,equal:true});
}
const sha=b=>createHash('sha256').update(b).digest('hex');const result={nativePath,candidatePath,nativeSHA256:sha(raw[0]),candidateSHA256:sha(raw[1]),graphFiles:Object.keys(candidate.sourceBefore).length,rows:27,equal:27,results};await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({rows:27,equal:27}));
