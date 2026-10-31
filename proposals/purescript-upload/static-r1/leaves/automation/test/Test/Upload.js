// Only unique owned disk-fixture creation/removal belongs here. No Puppeteer.
import {mkdtemp,writeFile,utimes,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const async = (task,dispose=()=>{}) => fail => success => () => {
  let canceled=false;
  Promise.resolve().then(task).then(value=>{if(canceled)Promise.resolve(dispose(value)).catch(()=>{});else success(value)()},error=>{if(!canceled)fail(error)()});
  return ()=>{canceled=true};
};
export const createFilesImpl=async(async()=>{
  const directory=await mkdtemp(join(tmpdir(),'red-panda-purescript-upload-'));
  try{
    const first=join(directory,'alpha.txt'),second=join(directory,'binary.redpanda');
    await writeFile(first,Buffer.from([65,0,255]));await writeFile(second,Buffer.from([3,1,4,0,128]));
    await utimes(first,1700000000.125,1700000000.125);await utimes(second,1700000000.125,1700000000.125);
    let closing;return{paths:[first,second],first,missing:join(directory,'missing-owned-file'),close:()=>closing??=rm(directory,{recursive:true,force:true})};
  }catch(error){await rm(directory,{recursive:true,force:true});throw error}
},fixture=>fixture.close());
export const removeFilesImpl=fixture=>async(()=>fixture.close());
export const uploadPaths=fixture=>fixture.paths;
export const firstPath=fixture=>fixture.first;
export const missingPath=fixture=>fixture.missing;
