// Genuine Window factory installation is synchronous and demand loaded.
import {createRequire} from 'node:module';
export {knownPlatformFactoryKind,registerPlatformFactoryKind} from './platform-factory-kinds.js';
const require=createRequire(import.meta.url);
export function installPlatformFactoryHooks(){return require('./dom-platform-factory-hooks.js').installPlatformFactoryHooks()}
