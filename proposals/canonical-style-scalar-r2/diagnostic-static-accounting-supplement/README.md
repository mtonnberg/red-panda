# Source-aware static accounting supplement — original failure unchanged

The original diagnostic controller/status remains FAILED_OR_INCOMPLETE_DIAGNOSTIC7fba0b25 with originalSource31 timeout,2424ms, loadBarrier=null/assertOkPolls0. No fixture, trace, status, logger, callsite, source, cap or observation was edited or rerun. This supplement performs only Python static interpretation of the already-written bytes. It is not repaired gate acceptance or an uninstrumented Source pass.

The pinned logger spreads values after kind in both diagEnter and diagMark. Exactly two WRITTEN browser rows, sequence119/span43 and241/span98, have original kind interactive/complete and name initial.milestoneCallback from the exact authenticated source callsite. Each has its actual later written leave with identical span/name. Only those two existing rows are recognized as entered calls. Two separate phase markers at sequences46/240 are explicitly retained as original nonstandard kinds, not new spans. Every other kind is standard. Both source/callsite SHA and full raw trace hashes are authenticated in accounting.json. No missing event, exit, timestamp or closure is invented.

All343 written events across three files pass schema, contiguous sequence, per-file Host monotonic order, bounds and counter monotonicity checks. Actual107 span pairs (browser98/worker9) have zero unmatched leaves and zero outstanding spans at the final written event. The worker has no process-exit summary; this is explicit, not synthesized. Its nine actual pairs are complete and the containing process was independently closed. Both actual process summaries report writerFailed=false, bounds were not reached, stderr/report have no writer-error marker, and original stderr was not truncated. Original warnings and source/ownership guards remain in the untouched run.

## Actual inclusive spans

| Actual span | Inclusive ms | Actual observation |
|---|---:|---|
| Worker large.css request |33.147731|success, actual2,621,455 decoded bytes|
| Large sheet decoder |see accounting.json|captured typed-array byte count, no extra public getter|
| Large sheet parser |117.185241|no declaration-call/miss/initialization increments|
| Large sheet installation |125.960072|contains parser span|
| getComputedStyle span47 |1149.021974|contains canonical program span48|
| canonicalStyleProgram span48 |1148.647490|contains CSSRuleList span51|
| CSSRuleList span51 |1007.266596|actual104,858 entries and104,858 declaration calls/misses/initializations|
| innerText.collect span54 |1231.152170|sequential after getComputedStyle;0new declarations|

The three getComputedStyle/program/list costs are NESTED and must not be added. innerText is a separate sequential interval. There is a249.536515ms uninstrumented gap after getComputedStyle's return point and before innerText enters; it is not assigned to a function. Some computed-style property work occurs after getComputedStyle returns its live view, so these spans do not wholly attribute the gap or innerText internals. Counters measure actual function calls/lazy misses/initializations, not physical V8 allocation counts.

Within the browser PID/thread, interactive callback leave→complete callback entry is2647.938193ms. The driver receives navigation after117.376332ms and writes loadBarrierMissing2000.611943ms after its own sourceLoadStart. Actual Page.load was written later. Raw same-Linux stockNode Host-hrtime values place Page.load3249.606695ms after the driver marker and1248.994752ms after its missing-barrier marker; this is an explicitly scoped same-host comparison, not a universal clock-synchronization proof. The original wall-clock2000ms source timeout remains authoritative. No fresh assertion phase began.

The trace locates a substantial forced canonical-publication cost before final load in this instrumented graph; it does not prove an uninstrumented current654 duration, a necessary/general cause or a successful correction. Reusing genuine normalized private scalar declaration facts rather than materializing untouched public declarations is a separately authorized next design/implementation task, never a retroactive change to this run.
