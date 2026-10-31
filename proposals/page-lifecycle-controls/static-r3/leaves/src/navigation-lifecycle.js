// Trusted Host-only lifecycle seam. Runtime state remains with actual journals,
// queues, transports and public objects; callbacks never answer fixture data.
let observer;
export function setNavigationLifecycle(value){observer=value}
export function beforeNavigation(page,details){return observer?.begin(page,details)}
export function committedNavigation(page,details){return observer?.committed(page,details)}
export function documentNavigation(page,details){return observer?.document(page,details)}
export function linkedNavigation(operation,pending){observer?.linked(operation,pending)}
export function stopNavigation(page,options){observer?.stop(page,options)}
