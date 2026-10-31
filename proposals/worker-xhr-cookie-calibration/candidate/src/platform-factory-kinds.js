// Kind names classify ordinary lookalikes only; they never confer brands.
// Validate actual pinned generated source bytes without evaluating Window code.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),bytes=readFileSync(new URL('./platform-factory-kinds-manifest.json',import.meta.url)),digest=value=>createHash('sha256').update(value).digest('hex');
if(digest(bytes)!=='0a838b73f06ec04f32829ddd0ee4d21ea2aa2da049d49afc93be99aa4c4015f8')throw new Error('Pinned platform kind manifest changed');
const manifest=JSON.parse(bytes),knownKinds=new Set(manifest.extraKinds);
if(require('jsdom/package.json').version!==manifest.jsdomVersion)throw new Error('Pinned platform kind dependency changed');
for(const record of manifest.files){if(digest(readFileSync(require.resolve(record.specifier)))!==record.sha256)throw new Error('Pinned jsdom DOM allocation source changed: '+record.specifier);if(record.kind)knownKinds.add(record.kind)}
export function knownPlatformFactoryKind(kind){return knownKinds.has(kind)}
export function registerPlatformFactoryKind(kind){if(typeof kind!=='string'||!kind)throw new TypeError('Platform factory kind is required');knownKinds.add(kind)}
