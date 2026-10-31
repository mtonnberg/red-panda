# Actual-world heap query proposal

The independent backend now operates on actual main, utility and iframe VM
contexts and returns a genuine Array in the selected context, retaining actual
public object identities. Root applied the final leaf delta while this handoff was being finalized. Its
leaf digests and reverse patch check match; this agent did not edit production. No Lightpanda engine production source was copied.

Use `integration-current.patch`, whose base common-file digests are recorded in
`integration-current-manifest.json`. Its existing-file changes are narrow imports,
factory notifications, dispatch and native build aggregation. It preserves Root's
current invocation, caller/group validation, selected-realm decoding, Abort,
performance, precision and encoder implementations. This latest Root adaptation
passed `git apply --check`; it is **not itself an executed full-Root build**.
The executed composition is separately preserved below.

## Exact leaves and dependencies

New leaves are in `leaf/`: `native/heap-query.cc`, `native/build-heap.mjs`,
`src/native-heap.js`, `src/heap-registry.js`, `src/heap-query.js`,
`src/heap-worlds.js`, `src/platform-factory-hooks.js`, and two focused test files.

The platform factory hooks are the inventory owner's dependency-free provenance
producer, not a codec dependency on native heap code. Root already has the shared
`src/platform-factories.js` registry prerequisite. Utility factories publish final
public wrappers into that registry before their optional heap callbacks; metadata
contains actual successful constructor global/implementation references. Globals
are weak, the registry is not enumerable, and heap observers never retain `read`
closures or strongly snapshot wrappers before collection. Other successful public
Fetch, Streams, HTMLDDA and composed CSS factories supply direct notifications.

Root's already accepted genuine-world/decorator dependency is
`proposals/utility-worlds-platform/integration-current.patch` (or the documented
incremental world patches, not both). `configureUtilityFactories` still supplies
actual VM authority and a final post-repoint wrapper notification. No aliases are
accepted as substitutes for real contexts, and no general remote-value rewrapping
was added. A foreign main Node carried through authored CustomEvent.detail keeps
its actual main public identity even when its remote handle is logically utility.

The form adapter must pass its actual previous setup return as `replace` when it
publishes the final Red Panda Proxy. The expanded shared factory hooks see jsdom's
inner generated Proxy first. Omitting that explicit composition authority caused a
real identity conflict and failed navigation; the negative logs and diagnostic are
preserved. The fix permits only that captured prior wrapper, not last-writer wins.

## API and resource bounds

`queryHeapObjects(prototype,actualContext,limits,expectedContextId?)` returns real
`objects` plus visited/raw/public/filtered and timing metadata. `runHeapQuery`
resolves the caller-owned prototype handle through the existing actual Session
context facade, then retains the real result using existing object groups.
`registerHeapRealmAuthority` uses an actual vm.Context, selected-context array
anchor and host-only liveness predicate; disposal removes its authority.

The native predicate traverses actual prototypes, stops before Proxy traps,
excludes the supplied prototype and internal anchor, and returns real objects.
Post-walk canonicalization uses exact trusted raw/public factory mappings,
deduplicates real identities and creates own Array entries without inherited
setters. No constructor-name, authored symbol getter or candidate marker proves
ownership or private implementation status.

Actual registered V8 creation globals partition matching objects. Only a real
unregistered Host bridge allocation falls back to the weak constructor-global
provenance. A later one-line precedence correction makes that fallback explicit;
known actual VM context always wins. The previous58-check milestone is preserved
before this separate correction, with targeted24/26 checks afterward.

Defaults are100000 raw matches,100000 public matches,2000000 visited objects,
4096 prototype hops and10000ms. Hard maxima are500000 matches,5000000 visited,
16384 hops and60000ms. Bounds throw stable errors, never truncated prefix arrays.
Raw caps count before context filtering/canonicalization. GC and the profiler walk
are blocking and not forcibly interruptible: the time limit is cooperative, not a
hard request cancellation guarantee. Owned diagnostic processes use core size0
and external deadlines. A trusted observation failure is sticky and makes queries
fail explicitly rather than silently exposing an incomplete/raw-target mapping;
the successful underlying Web API factory return is preserved.

The new explicit builder exports `buildHeap`, uses the exact Node/V8/ABI SDK,
records compiler/header/source/binary provenance and never downloads dependencies.
The loader checks exact Node/ABI/full V8/platform/architecture/API/backend fields,
source and binary digests, plus compiled header/ABI/V8-base exports. Missing or
stale artifacts fail; a loaded binary replacement requires restart. Root's native
build aggregation hunk builds all three required addons.

## Executed evidence

The frozen composition at `/tmp/red-panda-heap-worlds-final-e3msfvdg` consists of
Root8a8558d, immutable accepted utility/decorator patches, the provenance helper,
and heap-only changes. Root's encoder bytes were verified equal after removing
only the heap notification. Later Root common-file adaptation is source-only.

- Exact Node24.22.1 and26.13.0 each passed58 focused checks with test-file
  concurrency1 (29.2s/29.3s). These cover actual main/utility/frame identity,
  groups, released/stale handles, hostile getters/setters, public form/collection
  proxies, foreign authored values/fake prototypes, bounds, observation failure,
  retained old utility contexts, Runtime, Streams and utility decorators.
- An earlier concurrent Node24 run passed57/58 with a15s socket timeout. Other
  files also showed13–17s stalls. The failed case passed alone, then all58 passed
  serially. These observations do not establish a universal latency guarantee.
- Earlier main/frame probes and native/current wrapper milestones are preserved
  in `runtime-heap-query/implementation` and this directory. The current-source
  wrapper oracle contains51 prototype-query rows per engine across three realms,
  plus payload graph/availability observations. All exercised identity/Array-realm
  flags agree; heap counts differ. Those earlier source epochs are not relabeled
  as the later decorator/subscription epoch.
- The actual Native cross-newTarget control constructs Blob and Date with genuine
  utility subclasses through main constructors. Both engines exclude these from
  utility-selected queries and include them in main-selected borrowed-prototype
  queries. Prototypes remain utility-local; Blob has11 real bytes and Date17.
  V8 reports Date's actual creation as main; Blob is a real unregistered Host
  allocation with trusted main provenance. No empty result was fabricated.
- The separate precedence regression returns a genuine foreign VM value from an
  owned host producer and proves that its factory hint cannot override its actual
  registered VM identity. It passes on both runtimes. The Date/Blob Native control was also replayed
  against both exact Node24/26 candidates. `newtarget-precedence.patch`
  isolates this change from the preserved58-check source.

`milestone58-source.tar.gz`, epoch manifests, build manifests, raw logs and probe
sources preserve positive, failed and UNOBSERVED stages. The final manifest records
exact digests. No crash/core dump occurred in these final combined controls.

## Remaining coverage limits

Exact heap counts are not equal (for example Native form results2 versus candidate1,
and utility Object.prototype counts2903 versus5838 in the owned wrapper fixture).
Do not fabricate objects or exclude authored objects to force those counts.
Full utility Request/Response/ReadableStream/fetch/HTMLAllCollection availability
remains incomplete in the measured earlier fixture. Exhaustive public wrapper and
constructor/proxy combinations are not established by the exercised subset.

The separate later retirement delta is not in this source. The accepted initial
world code aborts removed frames where Native retains internally executable
contexts/documents/timers; the world owner has a genuine39/39 retirement proposal
for separate integration. Current proof covers retained old objects across actual
navigation/disposal, not that unmerged retirement behavior. Full Root regression,
existing53 PureScript acceptance on the final Root merge, and larger conformance
remain Root's next integration checks; these focused results are not full browser
replication or universal Runtime parity claims.
