# Genuine HTMLDDA across protocol and messaging

`integration.patch` applies to current Root and changes no Root production files
directly. The implementation continues to use its real V8 `[[IsHTMLDDA]]` object.
No undefined-returning substitute, Proxy typeof workaround, serialization marker
or synthetic empty protocol value is introduced.

## Observed behavior and changes

By-reference metadata, retained receiver/argument identity, callable/indexed
access, thrown-object retention and DataCloneError for genuine collections were
already correct. Native and candidate both return a fresh collection for each
`document.all` access; the new controls retain `savedAll` and test that exact
object, rather than assuming SameObject behavior.

The candidate binding incorrectly supplied enumerators for virtual index/name
interceptors. Native actual JavaScript `Object.keys`, `getOwnPropertyNames` and
`Reflect.ownKeys` return no virtual keys, despite presence checks and indexed/
named descriptors remaining real. Removing the actual V8 interceptor enumerators
makes the existing V8 protocol serializer naturally produce native `{}` for an
otherwise empty collection. Real authored own properties still enumerate and
serialize, demonstrated by `{owned:23}`. Indexed descriptors now carry native
ReadOnly; named descriptors remain unenumerable and writable. No wire result is
substituted or filtered to manufacture these outputs.

`Runtime.getProperties` now recognizes the genuine object despite its JavaScript
typeof result being `"undefined"` and returns its actual prototype handle.
Protocol class metadata for the exact adapter-created public prototype comes
from a private WeakMap populated at its successful creation. This metadata-only
map does not replace the prototype or participate in clone/heap factory brands.
Authored tags/getters are not used to establish that classification.

Collection receiver state is shared privately across owned realms so a genuine
main/child collection accepts a borrowed method or length getter. Measured native
read contracts also require signed32 numeric `item`, missing-argument TypeError,
and the first ID match followed by the first eligible name match. Earlier local
tests assumed duplicate matches returned an HTMLCollection and virtual keys were
enumerated; those assertions are replaced by stronger actual native observations,
including ID priority and live mutation. The unchanged upstream fixtures pass.

## Evidence and validation

The native binary SHA256 remains
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
The final raw-CDP oracle records28 rows per engine. **27/28 wire rows match after
normalizing only remote object ID strings**. The remaining thrown-object row
retains existing exception position/stack/script/context metadata differences;
those are visible in the comparison. Separate commands prove both the result
and exception handles retain the original genuine collection in both engines.
See `evidence/console-rebase-native.json` and its comparison. Earlier driver/result
epochs are retained with exact driver SHA256 checks, including negative stages.

The final current-Root composition passed **38/38** collection, HTMLDDA protocol,
safe metadata, actual-inspector serialization and Console checks on Node24.19.0,
24.22.1 and26.13.0. Another **33/33** heap/messaging checks passed on24.22.1 after
that rebase. The three unchanged local
source collection fixtures passed their real harness with no reported errors.
This is a local unchanged-fixture check, separately labeled from the native CDP
oracle. The final source archive, all runtime build receipts, source hashes and
raw logs are retained. Root's complete suite/PureScript validation remains Root's
integration work, not a result claimed here.

A draft assembled against an older candidate accidentally removed Root's newer
console import/event normalizations. It was rejected before application and is
retained under `stages/before-console-rebase`. The final delta was regenerated
from current Root with only the owned transforms; its patch contains no console
normalization changes. Current values, ImageData, serializer and Console files
were preserved and tested. The first expanded Console runs were setup failures
because the isolated snapshot lacked its native JSON fixture; after copying the
exact Root fixture, all38 checks passed on all three runtimes.

A separate explicit pre-rebase32-check receipt produced31 passes and1 failure at
`protocol-serialization-timeout.mjs:21`: the intended getter had not been entered
when checked after its outer50ms timeout. That stage remains unclassified. The
fixture and assertions were not changed by this scope. Earlier32 runs and the
final current-composition38 runs passed; no universal timing guarantee follows.

An intermediate prototype metadata change used the existing clone-factory
registry. A new native control exposed the mistake: cloning the prototype itself
must throw TypeError from its real getter, while that registry caused an earlier
DataCloneError. The final separate metadata-only map preserves actual getter
execution. The caught negative oracle and final TypeError control are retained;
the full affected32 checks,33 regressions and3 fixtures were rerun afterward.
An earlier31/32 run also caught missing prototype class metadata; its assertion
was preserved and the implementation corrected.

## Build and remaining scope

Native source SHA256 is
`c1b1c670befb2235791dd6b8b759a514ee0273b609aaf7e044cb6f691f3b650d`.
Owned matching collection addons were built on all three Node versions in the
isolated workspace. Root must rebuild its collection binding with each actual
runtime after applying the patch, then restart services; old source-digest
manifests must fail, and hot replacement is unsupported. No upstream production
engine code was imported. Port9582 was not used.

Legacy assignment/deletion/defineProperty/preventExtensions/freeze edge cases,
exhaustive named-tag/coercion combinations, utility-world collection availability,
complete exception positions/stacks and native performance remain outside this
bounded proof. Borrowed methods were calibrated on genuine main/child realms;
this is not a complete browser-origin isolation claim.
