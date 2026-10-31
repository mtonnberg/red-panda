# Retained frame worlds: restored current-source integration

Use `recovery-current.patch` for the current Root source. It applies cleanly on
Root f1b73dc plus the uncommitted custom-element, header-policy and actual heap
query changes. The historical `retirement.patch`, implementation and evidence
remain unchanged. No Lightpanda production code was imported.

The delta preserves each removed frame’s actual original VM, intrinsics,
Document, public wrappers and existing context IDs while retiring its browsing
authority. The frame leaves the active frame tree and cannot receive a newly
created isolated world. Native retains existing main and utility contexts,
compiled scripts, promises and ordinary callable objects after frame removal;
these remain usable until owning-page teardown. Document.defaultView becomes
null and Window.closed becomes true. Prior main timers, animation frames and
pending fetch transport are canceled, with canceled fetch promises left
unsettled; prior utility timers and later real tasks remain usable. Final
owning-page teardown revokes and closes both original realms.

The integration retains the current private invocation helper, Abort and encoder
code, heap factory registration and creation-global authority, custom elements,
header precedence and layout changes. A new focused test exercises real heap
queries in both retired main and utility contexts: returned arrays retain actual
object identity and selected Array.prototype, then actual owning-page abort
invalidates their authority.

Fresh validation after environment recovery:

- Node24.22.1: 44 combined frame/input/Runtime/retirement/heap checks passed before
  adding the heap-retirement regression; all four retirement checks then passed
  with that new regression. These are separate executions.
- Node26.13.0: all 45 combined checks passed with the new regression included.
- Exact verified Native binary and the same unchanged common driver matched
  39/39 previously selected public values; the nested driver matched 10/10
  previously selected deterministic controls. Raw results retain other timing,
  event, request and response-close observations. Preparatory RAF scheduling is
  not a deterministic equality claim.

See `recovery-current-manifest.json` for exact source, patch, runtime and evidence
hashes. The frozen executable composition is retained at
`/workspace/shared/retirement-recovery-20261031`. Generated native addons were
copied with their exact manifests and passed normal loader validation. No
production files were changed by this recovery worker. Full Root regression and
the current 55-check PureScript integration remain Parent integration work.
This is a finite compatibility result, not complete browser replication.
