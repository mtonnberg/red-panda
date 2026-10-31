# Shared invocation privacy and real frame recovery

This independent checkpoint moves the existing invocation adapter's implementation state out of the page VM. Root production and prior DOM/IndexedDB packages were not edited. Scratch: `/workspace/shared/invocation-privacy-20261031`. Frozen leaves: `candidate-v1/`. Source patch SHA256 `87e849eee365bf628e30c97639ee9b42e17925987949ad376ca3b083da551a08`, changing only `src/invocation.js` and adding `test/invocation-privacy.test.js`. It passes git apply --check against the actual Root source recorded in base-manifest. Final invocation source SHA256 `baa560723ee1f9c5ef53c9b3ddc29cc66a6691eb41756f7a575cab61cd650133`.

## Concrete implementation

The old bootstrap retained a genuine VM parents WeakMap, frozen VM controller, and five VM controller functions in its random lexical binding. All current/parent/frame/token/pending/recovery state now lives in genuine Host closures, null-prototype Host records, Host WeakMap/WeakSet/Set values and Host tasks. The lexical bridge is a frozen null-prototype Host object exposing only run/inspect; its two Host arrow functions have null prototypes. Enter/leave/unwind are private Host functions, not bridge capabilities. Physical creation context is measured independently, not inferred from prototypes.

The actual VM Script invocations remain unchanged in purpose and expression: lexicalBinding.run() and lexicalBinding.inspect() execute through actual vm.Script.runInContext watchdogs. The existing public VM Reflect.apply and Error constructors are captured before authored code; capturing these existing intrinsic values creates no new private VM objects. Real errors, function calls, declared-function evaluation, receivers/arguments and returned objects/arrays/functions/Promises retain their original actual realms and identities. Authored apply replacements are bypassed by the same trusted intrinsic semantics, without copying authored values or retargeting their prototypes.

Every actual invocation/inspection frame now has a Host recovery token. Normal finally paths restore the real previous frame and cancel the owned checkpoint when no work remains. An independent Host checkpoint unwinds abandoned frame chains in reverse ownership order, including generic invocations that have no inspection ancestor. The old implementation scheduled recovery only for inspections; raw controls prove standalone/nested generic frames remained callable after an ancestor deadline. New recovery removes those actual stranded frames and subsequent real calls still return their actual results. Disposal clears owned current/pending state and its own scheduled recovery, without canceling unrelated tasks or changing an active function's real returned value.

## Bootstrap boundary

This is deliberately a bootstrap-only property transfer, not a native-private lexical binding. NodeVM's global lexical initialization obtains the Host bridge through one configurable, nonenumerable data property on the actual owned raw context. The bootstrap consumes it into the existing random lexical const and synchronously deletes it; Host finally deletes it too. No authored script is run by the bootstrap, and installation remains before authored code. No Window/context property is used during any later invocation/inspection. Raw and test own-key snapshots match before/after installation and calls, including retained authored properties resembling the private prefix.

The random lexical name remains addressable if learned; the entry is not claimed to be a native private slot or a complete sandbox boundary. A separate native owned-context backend is being prototyped by Root's coverage agent. This checkpoint assumes the normal owned, extensible pre-author context bootstrap; arbitrary adversarial/frozen context transfer semantics are not established. The two bridge methods expose neither frame-parent mutation endpoints nor inherited Host constructors, but no broader security guarantee follows from that bounded interface.

## Direct evidence, without filtering

Root granted a short serial targeted heap/deadline slot after composed validation; it was explicitly released immediately after these probes/tests. No later heap run was launched. `probe.mjs` uses a fresh genuine VM and direct public V8 QueryObjects against actual WeakMap/Object/Function prototypes, returning complete unfiltered matches. No factory classification, property/name filtering, hints, fabricated counts, result substitution or masking was added. Query result arrays have the selected VM's actual creation context.

`before-v1.json` versus `after-v1.json`, summarized in `privacy-comparison.json`:

| Actual VM prototype query | Old install increase | New install increase |
| --- | ---: | ---: |
| WeakMap | 1 | 0 |
| Object | 7 | 0 |
| Function | 5 | 0 |

The actual lexical controller changes from VM-created to Host-created. The final bridge and run function are physically Host values, not VM objects assigned a Host-looking prototype. Two authored WeakMaps (ordinary and in a copied controller lookalike) remain exactly both identities: final count2, versus old count3 including its private parents WeakMap. Authored frozen old-controller/bridge lookalikes, their real functions and independent public objects all remain present by exact identity. Public value arrays/functions remain physically VM-created; real invocation returns the actual original object and value17. Settled authored WeakMaps remain both exact matches.

`before-recovery-v1.json` versus `after-recovery-v1.json` uses the exact same driver. An ancestor VM deadline actually enters and interrupts the owned infinite callback. After the independent checkpoint, the old generic and nested-generic bridge still execute the stranded infinite function and time out again; the new bridge correctly throws the real VM No owned invocation frame Error. Both preserve subsequent actual result12. Normal nested [21,12,21], withValue identity, async identity and disposed rejection remain unchanged. These expected old negative deadline controls are evidence, not failed final checks.

## Focused validation

* `focused-v1.txt`: 11/11 existing invocation and protocol-serialization tests pass. Includes actual getter deadlines, exact owned-child abandoned inspection/descendant recovery, serializer abort/stale authority, and the child's real authored-prototype heap positive.
* `focused-new-v1.txt`: all 8 new invocation tests and 14 existing messaging functional controls pass. New tests cover transfer-key cleanup/authored lookalikes, real selected-VM intrinsic errors after authored overrides, real declaration/call deadlines, nested/inspection/async identity, generic and nested recovery without inspections, cross-context ancestor deadlines, and active-call disposal. Messaging tests include genuine native incumbent source/realm behavior, real transfers and worker/context ownership.
* That same first messaging run has three explicit input failures: the isolated scratch had no `.cache` reference directory. These were ENOENT setup failures before fixture execution, not runtime assertions/deadlines. `upstream-messaging-v2.txt` supplies the existing exact pinned reference root through RED_PANDA_REFERENCE_TESTS_ROOT and reruns only those failed three tests: 3/3 unchanged message_channel.html, broadcast_channel.html and window/post_message.html pass with nonzero real assertion counts. No fixtures/harness were rewritten or assertion paths bypassed.

There are 36 distinct passing focused checks across these logs after the input-path correction. Prepared Node24.22.1 only; other Node versions are untested here. Owned addon rebuilds were serial and completed before execution; `owned-rebuild-node24.txt` and source-manifest record exact source/binary/header identities. No native source/dependency was changed. Messaging fixture servers use ephemeral localhost ports; no canonical9582/9584 service was bound. No broad/full/PureScript suite was run. Existing MaxListenersExceededWarning/VM Modules warnings remain visible and unsuppressed.

`source-manifest.json` binds the full executed scratch graph, exact frozen source leaves, base invocation source, patch and exact owned addon manifests. The retirement agent's earlier independent JSDOM negative is retained unchanged in `../indexeddb-privacy/before-r1.json`; this scope adds direct before/after and recovery evidence rather than altering that package.

This establishes the bounded invocation-state privacy and real recovery properties above. It does not establish complete environment privacy, native-private binding security, all possible bootstrap/context policies, broad heap stress or complete browser parity. No existing heap query implementation/filter, public-value codec, DOM factory or other package was edited.
