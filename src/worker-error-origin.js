import{getRuntimeBinding}from'./native-runtime.js';
// Captured real VM anchor is the realm authority. SourceURL is engine metadata,
// never a brand, principal, or allow-list admission criterion.
export function workerErrorOrigins(anchor){
 return Object.freeze({read(value){const reader=getRuntimeBinding().errorOrigin;if(typeof reader!=='function')throw new Error('A matching Worker error-origin runtime build is required');return reader(value,anchor)}});
}
