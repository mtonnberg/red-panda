import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Event=require('jsdom/lib/jsdom/living/generated/Event.js');
// Actual control edit commits are Host-private and survive intervening value
// setters; a blur compares against the value before the first command edit.
const pending=new WeakMap();
export function beginCommandControlEdit(control,baseline=control.value){if(!pending.has(control))pending.set(control,baseline);}
export function commitCommandControlEdit(control){
 if(!pending.has(control))return;const before=pending.get(control);pending.delete(control);
 if(control.value!==before)control._dispatch(Event.createImpl(control._ownerDocument._globalObject,['change',{bubbles:true,cancelable:false,composed:false}],{isTrusted:true}));
}
