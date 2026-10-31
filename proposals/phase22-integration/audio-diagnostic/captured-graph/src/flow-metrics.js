import {measureSelectedText} from './range-text.js';
// Measured native length arithmetic and text-height projection. Element text
// contributes height only with a resolvable explicit width. Actual selected-text
// glyph advances, whitespace and word wrapping share the independent producer.
export function resolveFlowLength(value,viewport={},basis){const m=/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|%|pt|pc|in|cm|mm|q|vw|vh)?$/i.exec(value?.trim()??'');if(!m)return undefined;const unit=(m[2]??'px').toLowerCase(),factors={px:1,pt:96/72,pc:16,in:96,cm:96/2.54,mm:96/25.4,q:96/101.6,vw:viewport.width/100,vh:viewport.height/100,'%':basis===undefined?undefined:basis/100};const factor=factors[unit];return factor===undefined?undefined:Math.fround(Number(m[1])*factor);}
export function nativeTextHeight(text,width,fontSize,nowrap=false,options={}){if(width===undefined||width<=0)return 0;const measured=measureSelectedText(String(text),{fontSize,width,nowrap,...options});return Math.ceil(measured?.height??0);}
