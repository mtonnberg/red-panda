// Independent bounded CLI option adapter; no target implementation imported.
import {readFile} from 'node:fs/promises';

// Native --dump has an optional recognized format; a non-format next token is
// still a positional URL. Preserve the existing candidate-only text/links modes.
export function prepareCLIArguments(argv,formats) {
 const accepted=new Set(formats),result=[];
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];result.push(arg);
  if(arg==='--'){result.push(...argv.slice(i+1));break;}
  if(arg==='--dump'&&!accepted.has(argv[i+1]))result.push('html');
 }
 return result;
}

// Both flags write one logical wait script. Read in CLI order, including files
// that a later expression overrides: unreadable files fail before navigation.
export async function readCLIWaitScript(tokens) {
 let source;
 for(const token of tokens){
  if(token.kind!=='option')continue;
  if(token.name==='wait-script')source=token.value;
  if(token.name==='wait-script-file'){
   try{source=await readFile(token.value,'utf8');}
   catch(error){throw new Error(`Failed to read --wait-script-file ${token.value}: ${error.code}`,{cause:error});}
  }
 }
 return source;
}

export function parseCLIHTTPHeaders(values=[]) {
 const headers=new Headers();
 for(const raw of values){
  const colon=raw.indexOf(':');
  if(colon<1)throw new Error('--http-header expected "Name: Value"');
  const name=raw.slice(0,colon).trim(),value=raw.slice(colon+1).trim();
  if(name.toLowerCase()==='user-agent')throw new Error('Use --user-agent instead of --http-header User-Agent');
  try{headers.set(name,value);}catch(error){throw new Error(`Invalid --http-header ${name}: ${error.message}`,{cause:error});}
 }
 return headers;
}
