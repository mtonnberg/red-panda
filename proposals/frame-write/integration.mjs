// Opt-in isolated source overlay. Production files are never modified; refuse
// to overwrite a changed integration base in another agent's working tree.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(readFileSync(new URL('./proposal.json', import.meta.url)));
const hash = value => createHash('sha256').update(value).digest('hex');
const sources = new Map(Object.entries(manifest.files).map(([name, metadata]) => [
  new URL(`../../${name}`, import.meta.url).href,
  { ...metadata, name, source: readFileSync(`${manifest.snapshot}/${name}`, 'utf8') },
]));
for (const entry of sources.values()) if (hash(entry.source) !== entry.proposedSHA256) throw new Error(`Frozen frame-write source changed: ${entry.name}`);
export const hook = registerHooks({ load(url, context, nextLoad) {
  const loaded = nextLoad(url, context), replacement = sources.get(url);
  if (!replacement) return loaded;
  const actual = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source);
  if (hash(actual) !== replacement.baseSHA256) throw new Error(`Frame-write integration base changed: ${replacement.name}`);
  return { ...loaded, source: replacement.source };
} });
