# Completed unchanged-baseline attribution observations

The exact prepared controller ran once. Native and baseline children exited 0; the independent sole-listener Host child exited 1 with the actual unrelated Host rejection error. These are observations, not a candidate acceptance suite. Total 3.302 seconds; no child deadline expired. The 538 source/native/helper/Node guard inputs are unchanged; all child and Native browser PIDs were absent at seal. The external Native binary was not included in the before/after controller guard, so no such invariance is claimed.

## Native observations

| Case | unhandled target | handled target |
| --- | --- | --- |
| ordinary-main | main | main |
| foreign-created-main-executor | frame | main |
| main-created-foreign-reject | main | main |
| foreign-created-foreign-reject | frame | main |
| subclass-null-chain | main | main |
| subclass-foreign-chain | main | main |
| main-promise-foreign-late-handler | main | main |
| retired-frame | frame | main |

Every delivered event retained exact Promise identity, untrusted state, cancelable unhandled/noncancelable handled flags, original unhandled reason and late null reason. Construction-realm attribution fits the eight unhandled rows. It does not describe all late-handler targets. In the prepared main-promise-foreign-late-handler row the foreign caller still applies the captured main Promise.prototype.then, so it does not isolate function-realm versus call-site/context ownership. A separate foreign-then control is needed before any precise general late-attribution rule. The removed-frame row shows retained Native delivery after actual frame.remove; it must not be relabeled as parity with Root's known-disposed suppression policy.

## Actual Node/V8 provenance and unchanged Root routing

| Case | Actual creation context | Root page target |
| --- | --- | --- |
| ordinary-a | A | A |
| null-after-init | A | A |
| vm-subclass-null-chain | A | none |
| vm-subclass-foreign-chain | A | B |
| host-constructor-vm-newtarget | Host | A |
| vm-constructor-host-newtarget | A | none |
| host-promise-vm-prototype-after-init | Host | none |
| vm-subclass-proxy-chain | A | none |
| foreign-b | B | B |
| disposed-a | A | none |

Every row is a genuine util.types.isPromise value; real sameRealm and creationGlobal agree on the physical contexts independently of visible prototype choices. The null-after-init case confirms the eager cache already preserves later prototype removal. The Host-after-init case confirms that simply grafting a VM prototype after allocation is not an existing Root forgery bug. The constructor/newTarget crossings provide a real physically Host Promise incorrectly assigned to A, and the converse missed genuine A Promise. The foreign subclass chain is a real A-to-B misattribution. The proxy-chain case produced two authored getPrototypeOf traps. The diagnostic did not capture trap stacks, so the two exact producers are not individually claimed.

The classification child deliberately adds a process unhandledRejection observer, which prevents Root's sole-listener Host fallback from throwing. All process unhandled/handled notifications remain in raw output. It is not a default-fatal test. The separate child has no added observer and fatally exits 1, preserving the current unrelated Host path. Disposed A produced no page events or forwarding errors.

## Implementation implications, no implementation yet

A lazy private state created at unhandled notification can correct the demonstrated attribution cases using genuine Promise branding and exact creation-context authority without reading public prototypes. It must preserve current Root handled/disposed/Host/forwarding semantics and explicitly record the measured Native late-handler and removed-frame differences; silently calling the whole change Native-equivalent would be false. Context registration must use trusted immutable actual anchors and exact sameRealm comparisons, not a reusable public proxy alone. Retained/null-prototype Promise lifetime and GC/tombstone registration remain required proofs before acceptance.

The actual external init-only PROMISE-hook corruption measured in animation-scheduling-recovery/minimal-node-r2 remains unresolved for both default/native-checkpoint and afterEvaluate queues. Changing internal attribution does not recover external-hook safety, authorize rejected R3, or establish public CallbackScope recovery.
