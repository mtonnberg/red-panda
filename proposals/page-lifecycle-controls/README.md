# Page lifecycle controls: Native-first preparation

Status: STATIC PREPARATION ONLY. The new driver and all scenarios are UNRUN. No Root source, dependency, native artifact or frozen handoff has been changed. The driver does not import either browser's implementation.

Ready command (run only after Parent grants an exclusive slot):

```sh
timeout --signal=TERM --kill-after=2s 25s /workspace/shared/rea-tools/node_modules/node/bin/node /workspace/red-panda/proposals/page-lifecycle-controls/native-probe.mjs /workspace/shared/lightpanda-reference/lightpanda-x86_64-linux /workspace/red-panda/proposals/page-lifecycle-controls/native-r1.json
```

One Native process, one real HTTP fixture, ephemeral loopback ports only. Twelve scenario rows, with complete raw CDP response/event chronology and HTTP request/finish/early-close observations. Expected normal duration is roughly 4–8 seconds; the owned administrative watchdog is 20 seconds and external cleanup cap 25+2 seconds. Original declared command/load budgets are 2 seconds, readiness 10 seconds; no retry or timeout increase occurs. Each run creates a new report with exclusive-create mode. An observed protocol error is retained as data; fixture/setup failures stop the run and remain failures.

The twelve scenarios are:

1. Page.close before any context.
2. Page.stopLoading before any context.
3. Page.close with an unknown session.
4. Target.closeTarget with an unknown target while an actual target remains live.
5. Idle stop twice: actual Document identity, live tasks and HTTP task marker.
6. Stop a real replacement Document request before headers, then release and recover via a new navigation.
7. Stop an actual partial HTTP Document stream: prefix script and DOM, retained suffix exclusion or completion, actual navigation settlement and recovery.
8. Stop genuine defer-script, iframe, Fetch and XHR loads; observe their actual settlement/events while a separately armed timer remains live, release responses, then navigate again.
9. Close a loaded page with primary and auxiliary sessions: reply versus Inspector/Target events, later session use, repeated close, target listing and real task suppression.
10. Close a pending pre-header navigation: actual request cancellation and pending command outcome.
11. Close the actual resource cohort and an armed task.
12. Close without Page.enable: actual target/session effects independent of Page event subscription.

The script saves the entire raw wire stream, not just selected events. Timestamps are diagnostic, not normalized expected values. Held responses release only after the stop/close observation. Response `close` is recorded with `writableFinished` to distinguish real transport cancellation from ordinary request completion. Native's child stderr/exit/signal and the driver/client/binary hashes are retained. A naturally unresolved navigation command can reach its original command deadline and is preserved rather than silently discarded.

## Static current-source findings

Root commit and source hashes are recorded in static-source.json. Session.run has no Page.close or Page.stopLoading case; these commands reach Unsupported CDP method. Page.close already owns the real Browser page removal, navigationGeneration increment, navigation/document abort, popup disposal, browsing-window disposal and close emission. Browser.createPage's once-close listener removes the actual page and emits targetDestroyed. Connection.destroyed only publishes targetDestroyed when discovery is enabled; it currently does not detach sessions. Session.close disposes serializer/runtime/utility/listener/object/script resources but does not close a Page. Existing Target.closeTarget calls Page.close synchronously before receive sends its response; Native source guidance instead places the response before close-target events. Actual ordering remains a calibration question until this driver runs.

Window stop has a genuine, separate implementation: window-lifecycle-timers snapshots the actual document/frame load cohorts before arbitrary abort callbacks, calls captured document resource stop/navigation cancellation, then cancels existing Fetch/XHR snapshots. It deliberately preserves timers and the document's lifetime signal. navigation.js cancels queued navigation, navigationAbort and Navigation API state through a captured original stop. This must remain distinct from Page.close's permanent document retirement.

Native engine source was read only to identify the causal boundaries. It was not imported or translated. Its Page.stopLoading delegates to the selected session's live and pending page owners; Frame stop recursively cancels descendant loads and queued navigation, aborts the active parser and can finish a main transfer early. These source observations do not replace runtime evidence. In particular, Red Panda currently buffers a main Document response before parsing, so partial-stream stop may expose a genuine wider parser/transport gap; do not substitute a fixed DOM or fabricated readiness/load event to hide it.

## Proposed ownership design after calibration

For close, route Page.close and Target.closeTarget through the same actual Page lifetime owner. Preserve existing idempotent backend close. Resolve command/session/target authority first, acknowledge in the measured order, then dispose the real page and all attached per-connection sessions exactly once. Any post-response action must be a Host-owned protocol completion effect; a queued microtask inside async Session.run would run before receive's response continuation and cannot establish reply-first ordering. Keep browsing context lifetime separate from target lifetime. Do not route protocol close through authored window.close or beforeunload dialogs, and do not broaden the dialog owner's scope.

For stop, expose a narrow Host-only operation over the existing private pages/document records and captured stop owners. Never invoke an authored replaceable window.stop property. Snapshot each actual load cohort before calling abort handlers; preserve document timers, realm identities, resource ownership, pending Navigation API settlement and subsequent navigation. Do not abort documentAbort to implement stop. Native measurements must decide the behavior for pending replacements, stream prefixes, Fetch/XHR cancellation and descendant scopes. If real incremental main-response support is required, keep that as an explicit bounded dependency rather than claiming an acknowledgement implements stopping.

Focused implementation tests will derive their assertions from saved Native observations and actual independent HTTP lifecycle effects. Candidate comparison uses the same request gates and original budgets. Required regression paths include navigation-load-cancel, original window lifecycle timer/Fetch/XHR stop controls, retained frame retirement, protocol target/session cleanup and a subsequent real navigation. Broader tests or implementation are not authorized by this preparation packet alone; Parent schedules the next lease.
