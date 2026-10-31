// Restore the actual V8 global's intrinsic prototype captured before jsdom or
// the utility installer replaces it. No depth-only object is manufactured.
import {originalGlobalPrototypeFor} from './context-names.js';
const installed=new WeakSet(),get=Object.getOwnPropertyDescriptor,setPrototype=Object.setPrototypeOf,define=Object.defineProperty;
export function restoreWindowGlobalInheritance(global,context,intrinsic=originalGlobalPrototypeFor(context)){
 if(installed.has(global))return;
 const prototype=global.Window?.prototype,eventTarget=global.EventTarget?.prototype;
 const constructor=intrinsic&&get(intrinsic,'constructor')?.value;
 if(!intrinsic||typeof constructor!=='function'||get(constructor,'prototype')?.value!==intrinsic||!prototype||!eventTarget)throw Error('Original Window global prototype is unavailable');
 setPrototype(prototype,eventTarget);
 setPrototype(intrinsic,prototype);
 // This is the original, distinct engine global constructor, not Window's
 // public illegal-constructor function. Keep its actual call/new behavior.
 define(constructor,'name',{...get(constructor,'name'),value:'Window'});
 setPrototype(global,intrinsic);installed.add(global);
}
