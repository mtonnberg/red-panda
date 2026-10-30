# MutationObserver delivery

`installMutations(page, window)` installs public observation before document
scripts. It preserves pinned jsdom registrations, WebIDL option conversion,
filtering, actual MutationRecord creation and live Node identities. Only the
delivery queue is independently owned. Install it after `installErrors` so
callback failures use the shared trusted global reporter.

The native jsdom helper queues a global notification token even when a DOM change
has no interested observers. A later observed mutation can therefore use a token
queued before an intervening Promise callback. Public observers now intercept
their own private record queue insertions: the first genuine interested public
record schedules a real microtask. Native helper checkpoints consume an empty
sink and cannot deliver these public records early. No timer, Promise primitive,
DOM operation, fixture, callback result or expected order is spoofed.

Observers belonging to one Browser share a public delivery queue; standalone
fixtures share one by Page. Delivery preserves the observed native construction
order. `takeRecords` and `disconnect` clear the real owned records without
canceling an already queued token. A callback's own new records receive another
delivery; later pending observers can include new records when their turn
arrives. Disconnecting a later pending observer suppresses its callback.
Callback record arrays belong to the observer realm. Borrowed WebIDL methods
continue to operate on these queues because the scoped hooks act at the pinned
implementation methods, not only the exposed prototype methods.

The controller exposes `createInternalObserver(callback)` and `dispose()`.
`createInternalMutationObserver(window, callback)` is also exported for engine
modules. Internal invalidation observers retain genuine native records and
callbacks while avoiding activation of the public delivery token. Integrate this
factory at all three current internal construction sites:

- `src/intersection.js`: geometry invalidation observer.
- `src/resize-observer.js`: geometry invalidation observer.
- `src/modules.js`: inserted module/import-map discovery observer.

An installer call is idempotent. Abort, Page close, Window close or explicit
disposal disconnect owned observers, discard queued records and release Page
listeners. Weak observer references permit otherwise unreachable disconnected
observers to be collected. Unregistered jsdom documents retain their existing
behavior. No dependency, bootstrap load hook, Node implementation or node_modules
file was changed.

## Native observations

`mutations-native-probe.mjs` uses an owned native process and target with bounded
public CDP evaluations. `mutations-native-observation.json` records:

- An unobserved append before a Promise, followed by a newly observed mutation,
  delivers `promise,mutation`.
- Observers deliver in construction order even when the second observer receives
  the first mutation.
- Taking queued records, then scheduling a Promise, then making another observed
  mutation delivers `mutation,promise` because the first token remains queued.
- Removing an observed subtree then immediately changing its attributes/text
  yields only the removal record. Detached-descendant transient observation is
  absent in the measured native browser. This native quirk is preserved; no
  standard-only transient registrations were added.

The tested native executable was
`/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux`, SHA256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
Target production code was not read or copied.

## Validation and limits

`node --experimental-vm-modules --test test/mutations.test.js` passes thirteen
tests covering ordering, internal/public separation, real records/options/old
values, subtree/removal behavior, receivers/brands/realms, multiple targets,
re-observation, delivery-time mutations, cancellation by disconnect, errors,
unregistered documents and disposal.
The combined errors, mutations, classic-scripts and shadow test run passed all
61 tests.

`mutations-verify.mjs` executes unchanged external fixtures with the independent
installers. `mutations-installation-settled-observation.json` records eleven of
twelve fixtures passing: dynamic inline execution now has the exact expected
`inline-0,after-0,inline-1,after-1,promise,mutation,timer` order, and ten ordinary
MutationObserver fixtures pass. The remaining `css_noop.html` failure concerns
real CSS style-attribute record generation counts (priority changes expected 1,
got 2; explicit assignments expected 1, got 0), which this delivery adapter does
not alter. CSS parsing/emission remains its owner's scope.

Follow-up: the CSS declaration owner subsequently fixed those emission counts
at their source. `css-mutation-checkpoint.json` records the actual unchanged
`css_noop.html` native pass, candidate failure before the CSS fix and candidate
pass afterward, alongside a passing current stylesheet fixture. The earlier
installer reports above remain unchanged historical observations.

The runner uses the existing classic-script comparison's generic 100ms settling
period before invoking harness onload assertions, allowing ordinary timer tasks
to run. The earlier no-settle report is retained as
`mutations-installation-observation.json`: it already had Promise-before-mutation
ordering, but asserted the onload callback before the ordinary timer fired. No
engine scheduling behavior was changed between these runner observations.

This is installer-level evidence, not a complete Browser/CDP parity result.
Record filtering and mutation production retain pinned jsdom/native quirks.
Slotchange task ordering, cross-origin observer reachability and a complete
native agent model have not been established by these bounded probes.
