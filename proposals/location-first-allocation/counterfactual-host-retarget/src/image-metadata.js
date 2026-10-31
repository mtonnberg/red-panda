// Independent image-header inspection. No bitmap is decoded or synthesized.
// null means that a recognized header needs more bytes; [0,0] is unknown.
export function imageHeaderSize(b,ended=false){
 const n=b.length;if(n<12&&!ended)return null;
 if(n>=8&&b[0]===137&&b.toString('ascii',1,4)==='PNG')return n>=24?[b.readUInt32BE(16),b.readUInt32BE(20)]:ended?[0,0]:null;
 if(n>=6&&/^GIF8[79]a$/.test(b.toString('ascii',0,6)))return n>=10?[b.readUInt16LE(6),b.readUInt16LE(8)]:ended?[0,0]:null;
 if(n>=2&&b[0]===255&&b[1]===216){
  let p=2;while(p<n){if(b[p++]!==255)return[0,0];while(p<n&&b[p]===255)p++;if(p>=n)return ended?[0,0]:null;const marker=b[p++];if(marker===217||marker===218)return[0,0];if(marker===1||marker>=208&&marker<=215)continue;if(p+2>n)return ended?[0,0]:null;const size=b.readUInt16BE(p);if(size<2)return[0,0];if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return p+7<=n?[b.readUInt16BE(p+5),b.readUInt16BE(p+3)]:ended?[0,0]:null;if(p+size>n)return ended?[0,0]:null;p+=size;}return ended?[0,0]:null;
 }
 if(n>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'){
  if(n<30)return ended?[0,0]:null;const kind=b.toString('ascii',12,16);
  if(kind==='VP8X')return[1+b.readUIntLE(24,3),1+b.readUIntLE(27,3)];
  if(kind==='VP8 '&&b[23]===157&&b[24]===1&&b[25]===42)return[b.readUInt16LE(26)&16383,b.readUInt16LE(28)&16383];
  if(kind==='VP8L'&&b[20]===47){const bits=b.readUInt32LE(21);return[(bits&16383)+1,((bits>>>14)&16383)+1]};return[0,0];
 }
 return[0,0];
}
