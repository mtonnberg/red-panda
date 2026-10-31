// Independent text geometry for the measured headless profile. These are real
// selected Unicode scalars and CSS whitespace/wrapping decisions, not element
// bounding-box dimensions or a font renderer.
const asciiSpace=/[\t\n\f\r ]/;
const mark=/\p{Mark}/u;
function wide(code){return code>=0x1100&&(code<=0x115f||code===0x2329||code===0x232a||code>=0x2e80&&code<=0xa4cf&&code!==0x303f||code>=0xac00&&code<=0xd7a3||code>=0xf900&&code<=0xfaff||code>=0xfe10&&code<=0xfe19||code>=0xfe30&&code<=0xfe6f||code>=0xff00&&code<=0xff60||code>=0xffe0&&code<=0xffe6||code>=0x1f300&&code<=0x1faff||code>=0x20000&&code<=0x3fffd)}
export function selectedText(data,start,end){
 const boundary=offset=>offset>0&&offset<data.length&&data.charCodeAt(offset)>=0xdc00&&data.charCodeAt(offset)<=0xdfff&&data.charCodeAt(offset-1)>=0xd800&&data.charCodeAt(offset-1)<=0xdbff?offset-1:offset;
 return data.slice(boundary(start),boundary(end));
}
export function glyphAdvance(character,fontSize){
 const code=character.codePointAt(0);if(mark.test(character)||code===0x200c||code===0x200d)return 0;
 if(character===' ')return fontSize*.33;if(character==='\t')return fontSize*.33*4;if(character==='\f')return fontSize*.33;
 return fontSize*(wide(code)?1:.6);
}
export function measureSelectedText(text,{fontSize=16,width=Infinity,whiteSpace='normal',collapse,nowrap=false}={}){
 const preserve=/^(?:pre|pre-wrap|break-spaces)$/.test(whiteSpace)||/(?:^|\s)preserve(?:\s|$)/.test(whiteSpace)||collapse==='preserve';
 const newlines=preserve||whiteSpace==='pre-line';nowrap=nowrap||whiteSpace==='pre'||whiteSpace==='nowrap'||/(?:^|\s)nowrap(?:\s|$)/.test(whiteSpace);
 text=text.replace(/\r\n?/g,'\n');
 if(!preserve){if(newlines)text=text.split('\n').map(line=>line.replace(/[\t\f ]+/g,' ').replace(/^ | $/g,'')).join('\n');else text=text.replace(/[\t\n\f\r ]+/g,' ').replace(/^ | $/g,'');}
 if(!text)return null;
 const advance=text=>{let result=0;for(const character of text)result+=glyphAdvance(character,fontSize);return result;};
 let maximum=0,line=0,lines=0;const chunks=newlines?text.split('\n'):[text];if(newlines&&chunks.at(-1)==='')chunks.pop();
 for(const chunk of chunks){
  let pending='';line=0;
  for(const token of chunk.match(/[\t\f ]+|[^\t\f ]+/g)??[]){
   if(asciiSpace.test(token[0])){pending+=token;continue;}
   const spacing=advance(pending),word=advance(token);
   if(!nowrap&&line>0&&line+spacing+word>width){maximum=Math.max(maximum,line);lines++;line=word;}
   else line+=spacing+word;
   pending='';
  }
  line+=advance(pending);maximum=Math.max(maximum,line);lines++;
 }
 return{width:maximum,height:Math.max(1,lines)*fontSize*1.2};
}
