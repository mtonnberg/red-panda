# Console namespace compatibility

The owned namespace supplies genuine realm-local, nonconstructable methods,
replaceable Window properties, private per-Window counters/timers, actual named
task callbacks and the measured console event delivery. Borrowed namespace
methods ignore their receiver; the Window accessor still validates genuine
registered globals. Argument transport uses fresh host arrays and preserves
actual values without invoking authored numeric setters or iterators.

`native-v4.json` and `probe.mjs` retain the pinned Native observations. The
namespace scratch at `/workspace/shared/console-namespace-current` passed six
focused checks and the unchanged console fixture. Four original observation
groups matched exactly; the remaining accessor group differed only in global
prototype depth. The separately reviewed `window-global-chain` change restores
the original V8 global prototype and closes that measured difference, without
manufacturing a prototype solely to change depth. Its composed Native replay
matches all five observation groups.

`integration-current.patch` adapts only installer imports, console protocol types
and the actual utility namespace to the newer Root serializer/value graph.
`integration-current-manifest.json` records those exact leaves. Root then passed
14 Console/serializer checks and 26 Console/global/processor checks separately.
These are scoped results, not one combined or complete protocol pass rate.

Earlier reports preserve the initial caller-side shape probe error, a scratch
syntax error, missing copied test support and the intermediate global-receiver
mapping failure. None is counted as a Native or final candidate pass. The final
receiver map uses actual context globals and their captured jsdom global objects.

The measured Native console does not emit CDP records for count/time/group/table
operations; the adapter retains actual state while matching that observed event
surface. Exhaustive formatting, async debugger task metadata and worker namespace
coverage remain unproven. This implementation is not a logging or sandbox
security boundary.
