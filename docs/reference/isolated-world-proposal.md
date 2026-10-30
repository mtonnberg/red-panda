# Genuine utility-world prototype

The independent prototype creates a real vm.Context over the original DOM
implementation tree. It compiles pinned jsdom IDL wrappers in that VM, with
private per-world wrapper identity and genuine utility Object/Function/Array
prototypes. Main implementation wrapperSymbol backlinks remain canonical;
no DOM copy, marker-based realm selection or alternate-ID main-world alias is used.
No production/shared files or native build contracts were changed.

[isolated-world-merge.md](isolated-world-merge.md) gives exact production merge
hooks and dependencies. The leaf patch contains the two new modules and tests;
the full frozen integration demonstrates them against an older saved source and
must not overwrite current caller validation, groups, realm-values or invocation.
The separate optional main-IDL patch preserves existing identities and shared CSS
while correcting measured base links and the getAttributeNames sequence realm.

The archived sources and observations are under
[isolated-world/](isolated-world/). Their relative integration paths expect the
files under `proposal/` of the recorded snapshot root; world/main unit tests can
also be read directly. The archived invocation helper came from the independent
termination proposal; production should reuse Root's current helper.

Verification includes **16 focused tests passing on Node24.22.1 and26.13.0**:
10 core world tests,4 actual raw-CDP tests and2 optional main-IDL tests. They cover
real lexical/compiled execution, per-world DOM expandos, shared actual mutations,
static/live collection identity, actual Event callbacks, native MutationObserver
producer realms, private node recognition, factory authority hooks, bindings,
preloads, stable unique IDs and bounded private invocation.

One identical startup-hash-bound public driver ran against verified native and
the frozen candidate with both iframe resource profiles enabled. It compared
**39 ordinary public values:35 match**. The four nonmatches all concern retired
frame lifetime. Native retains existing closed-frame main/utility contexts, old
DOM and a pending timer after removal; the frozen FramePage implementation aborts
and cancels them. Missing observations are never counted as passes. All73 frozen
source/native files remained byte-identical, and the final prototype source
manifests match before/after capture. Dependencies use the shared pinned
node_modules tree; this is component evidence, not a combined current production
checkpoint or an immutable copy of every dependency.

Native quirks preserved include main-world MutationObserver callback arguments
with a real utility callback, raw authored values through CustomEvent.detail,
context-name caching across sessions, scoped binding lifetime and required
worldName parser diagnostics. A foreign main Node returned from utility retains
its actual wrapper while its handle is logically utility; only typed DOM.resolveNode
selects a different world wrapper. No general remote-value rewriting is used.

Native before-author preload callbacks and parent/child utility identities were
observed directly. The optional main getAttributeNames method is nonconstructable,
retains its descriptor/name/length, produces its creation realm's actual Array
when borrowed, and ignores later Array/Reflect replacements. Existing
EventTarget→main Object alignment was verified and left untouched. An earlier
generated-source inference about that base link was withdrawn; no heap membership
or counts were fabricated or measured by this task.

Retired-frame semantics, utility Window messaging/structuredClone/Broadcast/Blob/
File producers, Root-owned CSS/layout/XML/other decorators, foreign callback/error
routing and complete protocol timing remain explicit integration gaps. The genuine
VM core is not a claim of the complete Window surface. Main host function [[Realm]]
remains a limit outside the explicitly compiled sequence wrapper.

An early cold-start integration run exposed a CommonJS private-interface cycle;
the optional helper now bootstraps jsdom before accessing those interfaces. An early
frame probe omitted iframe loading and was rerun with its exact resource flag.
An early empty-world probe incorrectly continued after a missing-field error;
its successor requires the explicit empty string and verifies actual isolation.
Final comparisons use the corrected driver and preserve all four retired-frame
failures. Existing frozen Page close-listener warnings remain in test logs.
