// Deliberate unsupported embedding control. Never disable or replace this hook.
import {createHook} from 'node:async_hooks';
import {types} from 'node:util';
import {writeSync} from 'node:fs';
let promises=0;
const emit=value=>writeSync(1,JSON.stringify(value)+'\n');
const hook=createHook({init(id,type,trigger,resource){
 if(type!=='PROMISE')return;
 promises++;
 if(promises===1)emit({marker:'external-init-hook-observed-real-Promise',id,trigger,genuine:types.isPromise(resource)});
}});
hook.enable();
emit({marker:'external-init-hook-enabled',neverDisabled:true});
process.on('exit',code=>emit({marker:'external-init-hook-exit',code,promises,neverDisabled:true}));
