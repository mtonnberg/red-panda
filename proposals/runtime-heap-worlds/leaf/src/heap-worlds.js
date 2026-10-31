import {configureUtilityFactories} from './world-sessions.js';
import {registerHeapRealmAuthority,registerHeapFactoryValue} from './heap-registry.js';
let installed=false;
export function installHeapUtilityFactories(){
 if(installed)return;installed=true;
 configureUtilityFactories({
  onRealm(global,context,metadata){const authority=registerHeapRealmAuthority({context,contextId:metadata.contextId,isActive:metadata.isActive});return ()=>authority.dispose();},
  onWrapper(value,global,metadata){registerHeapFactoryValue(value,{implementation:metadata.impl,globalObject:global});}
 });
}
