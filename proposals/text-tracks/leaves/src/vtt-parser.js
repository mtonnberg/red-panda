import {decodeHTML} from 'entities';

export function parseVTTTimestamp(input){
 const match=/^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/.exec(input);
 if(!match||Number(match[2])>59||Number(match[3])>59)return null;
 return Number(match[1]??0)*3600+Number(match[2])*60+Number(match[3])+Number(match[4])/1000;
}
export function formatVTTTimestamp(value){
 const total=Math.round(value*1000),ms=total%1000,seconds=Math.floor(total/1000)%60,minutes=Math.floor(total/60000)%60,hours=Math.floor(total/3600000);
 return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}
const percent=input=>{const m=/^(\d+(?:\.\d+)?)%$/.exec(input);if(!m)return null;const value=Number(m[1]);return value<=100?value:null;};
function cueSettings(text,cue,regions){
 for(const token of text.split(/[\t ]+/)){
  const index=token.indexOf(':');if(index<0)continue;const key=token.slice(0,index),value=token.slice(index+1);
  if(key==='region'){cue.region=regions.get(value)??null;continue;}
  if(key==='align'&&['start','center','end','left','right'].includes(value))cue.align=value;
  if(key==='vertical'&&['rl','lr'].includes(value))cue.vertical=value;
  if(key==='size'){const number=percent(value);if(number!==null)cue.size=number;}
  if(key==='position'){
   const[coordinate,alignment]=value.split(','),number=percent(coordinate);if(number===null)continue;
   if(alignment!==undefined&&!['line-left','center','line-right','auto'].includes(alignment))continue;
   cue.position=number;if(alignment!==undefined)cue.positionAlign=alignment;
  }
  if(key==='line'){
   const[coordinate,alignment]=value.split(',');if(alignment!==undefined&&!['start','center','end'].includes(alignment))continue;
   const number=percent(coordinate);
   if(number!==null){cue.line=number;cue.snapToLines=false;}
   else if(/^-?\d+$/.test(coordinate)){cue.line=Number(coordinate);cue.snapToLines=true;}
   else if(coordinate==='auto'){cue.line='auto';cue.snapToLines=true;}
   else continue;
   if(alignment!==undefined)cue.lineAlign=alignment;
  }
 }
}
function regionSettings(lines){
 const region={id:'',width:100,lines:3,regionAnchorX:0,regionAnchorY:100,viewportAnchorX:0,viewportAnchorY:100,scroll:''};
 for(const line of lines){const split=line.indexOf(':');if(split<0)continue;const key=line.slice(0,split),value=line.slice(split+1).trim();
  if(key==='id')region.id=value;
  if(key==='width'){const number=percent(value);if(number!==null)region.width=number;}
  if(key==='lines'&&/^\d+$/.test(value))region.lines=Number(value)>>>0;
  if(key==='scroll'&&value==='up')region.scroll=value;
  if(key==='regionanchor'||key==='viewportanchor'){
   const[x,y]=value.split(','),a=percent(x??''),b=percent(y??'');if(a===null||b===null)continue;
   const prefix=key==='regionanchor'?'regionAnchor':'viewportAnchor';region[prefix+'X']=a;region[prefix+'Y']=b;
  }
 }
 return region;
}
export function parseWebVTT(input){
 const text=input.replace(/^\uFEFF/,'').replace(/\r\n?|\n/g,'\n'),lines=text.split('\n');
 if(!/^WEBVTT(?:[\t ].*)?$/.test(lines[0]))throw new SyntaxError('Invalid WebVTT signature');
 let index=1;while(index<lines.length&&lines[index]!=='')index++;
 const cues=[],regions=new Map(),regionDefinitions=[];
 while(index<lines.length){
  while(index<lines.length&&lines[index]==='')index++;if(index===lines.length)break;
  const block=[];while(index<lines.length&&lines[index]!=='')block.push(lines[index++]);
  if(/^NOTE(?:[\t ]|$)/.test(block[0])||block[0]==='STYLE')continue;
  if(block[0]==='REGION'){const region=regionSettings(block.slice(1));regionDefinitions.push(region);regions.set(region.id,region);continue;}
  let timing=0,id='';if(!block[0].includes('-->')){id=block[0];timing=1;}
  const match=/^\s*(\S+)[\t ]+-->[\t ]+(\S+)(?:[\t ]+(.*))?$/.exec(block[timing]??'');if(!match)continue;
  const startTime=parseVTTTimestamp(match[1]),endTime=parseVTTTimestamp(match[2]);if(startTime===null||endTime===null)continue;
  const cue={id,startTime,endTime,text:block.slice(timing+1).join('\n')};cueSettings(match[3]??'',cue,regions);cues.push(cue);
 }
 return{cues,regions:regionDefinitions};
}

// Produce actual DOM nodes from the WebVTT cue-text token stream. Unknown tags
// are ignored; their text remains text and never becomes an executable element.
export function renderVTTCue(document,text){
 const fragment=document.createDocumentFragment(),stack=[{node:fragment,tag:''}];
 const append=node=>stack.at(-1).node._append(node);
 const tokens=text.match(/<[^>]*>|[^<]+|</g)??[];
 for(const token of tokens){
  if(token[0]!=='<'||token==='<'){append(document.createTextNode(decodeHTML(token)));continue;}
  const source=token.slice(1,-1),timestamp=parseVTTTimestamp(source);
  if(timestamp!==null){append(document.createProcessingInstruction('timestamp',formatVTTTimestamp(timestamp)));continue;}
  if(source[0]==='/'){
   const tag=source.slice(1);if(tag==='ruby'&&stack.at(-1).tag==='rt')stack.pop();
   if(stack.length>1&&stack.at(-1).tag===tag)stack.pop();continue;
  }
  const match=/^([a-z]+)((?:\.[^\s.]*)*)(?:[\t\n ]+(.*))?$/.exec(source);if(!match)continue;
  const tag=match[1];if(!['c','i','b','u','ruby','rt','v','lang'].includes(tag))continue;
  if(tag==='rt'&&stack.at(-1).tag!=='ruby')continue;
  const node=document.createElement(['c','v','lang'].includes(tag)?'span':tag),classes=match[2].split('.').filter(Boolean);
  if(classes.length)node.setAttributeNS(null,'class',classes.join(' '));
  const annotation=decodeHTML((match[3]??'').trim().replace(/[\t\n\f\r ]+/g,' '));
  if(tag==='v')node.setAttributeNS(null,'title',annotation);if(tag==='lang')node.setAttributeNS(null,'lang',annotation);
  append(node);stack.push({node,tag});
 }
 return fragment;
}
