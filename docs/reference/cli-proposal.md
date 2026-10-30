# Isolated CLI compatibility proposal

[cli-proposal.patch](cli-proposal.patch) is a concrete un-applied patch for
`bin/red-panda.js`, a new independent `src/cli-options.js`, three bounded Browser
integration points, focused tests/native-output golden, README and the
compatibility ledger. Root owns production application and final immutable
acceptance. `git apply --check` passes. No production, dependency, environment or
native-builder files were changed by this task.

The current CLI already defaults to **no dump and5,000ms**. Those source values
and actual native/candidate default stdout were checked; this proposal does not
reimplement an obsolete HTML/10s default. The independently regenerated remaining
inventory now records parser defaults explicitly. README/COMPATIBILITY corrections
are included inside the proposed patch only.

## Concrete changes

- Bare `--dump` selects HTML. A following unrecognized separated value remains a
  positional URL, matching native's optional-format behavior. Existing extra
  candidate `text`/`links` formats remain supported.
- `--wait-script-file` reads UTF-8 JavaScript before navigation. Script/file flags
  write one logical value in CLI order; the last wins. Unreadable earlier files
  still fail before any HTTP request.
- A selector/script predicate without explicit `--wait-until` uses genuine
  navigation readiness `none`. The real DOM predicate may finish while child
  frames load. Explicit load still waits for actual frame completion.
- Repeated `--http-header "Name: Value"` values are case-insensitive last-wins.
  Fixed CLI headers enter the real transport after cookie/default recomputation
  on every redirect hop, so authored fetch headers cannot override them. Empty,
  Cookie and Accept-Language values are supported as observed. User-Agent via
  this flag is rejected with guidance to use `--user-agent`.
- Plain text dump output writes the exact payload without adding a newline.
  Existing payload newlines survive. JSON envelopes retain one framing LF;
  binary output retains its existing writer.

The isolated equivalents are
[cli-options-prototype.mjs](cli-options-prototype.mjs) and
[cli-integration.mjs](cli-integration.mjs). The source loader changes no files.
The Browser additions are real readiness and transport behavior; no fixture flag,
marker attribute, synthetic successful navigation or canned diagnostic count is
introduced.

## Evidence and validation

[cli-workflows-checkpoint.json](cli-workflows-checkpoint.json) records raw capture
paths, native process counts, first-output/close distinction, watchdog signals,
source-default correction and remaining gaps. The verified official native binary
has SHA-256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.

[cli-readiness-native.json](cli-readiness-native.json) uses an actual held child
HTTP response. Implicit script and selector waits dump `pending` before the child
load; explicit load dumps `loaded`. The overlay test reproduces those genuine
states. Fixed-header controls observe actual requests through redirects and a
page-authored fetch with a conflicting header.

[cli-dump-writer-native.json](cli-dump-writer-native.json) retains plain/JSON pairs
for HTML, Markdown, semantic JSON, semantic text and structured metadata. Every
native plain stdout equals its JSON.content exactly; JSON envelopes end with LF.
The authored fixture contains literal preformatted newlines. The proposed tests
include a compact derived native golden with original artifact/binary digests.

[cli-proposal.test.mjs](cli-proposal.test.mjs) passes **10 tests**. Existing
CLI/browser/navigation suites pass **35 tests** through the overlay. Logs are
retained as `cli-proposal-test-verification.log` and
`cli-proposal-regression-verification.log`. These are component runs over a mutable
checkout, not a frozen combined production checkpoint. No further mutable
startup jobs were run after root requested the native-helper build window.

The initial broader writer golden exposed an existing semantic-tree-text payload
gap: native retains the article node and omits quoted empty RootWebArea name;
candidate drops the article and includes `''`. The initial failed golden log is
retained. Final tests compare full native payloads for the other four modes; for
semantic text they verify verbatim real payload and native newline framing while
preserving that explicit payload gap. No semantic extractor rewrite is included.

## Native quirks and unresolved contracts

First-stdout time and process-close time are separate. Native sometimes writes
complete JSON promptly and then lingers around5s; four bounded captures required
the owned8s watchdog after complete output. Connection:close did not eliminate
all of these cases. Signals and late shutdown are retained rather than reported
as successful exits. In contrast, the observed `--terminate-ms100` infinite-script
control emits a real result around123ms even when shutdown lingers later. No
wait-only substitute for execution termination is provided here.

A main HTTP response delayed past default5s can yield native status0, empty
headers, error:null and exit0; current candidate produces a navigation timeout
failure. The option defaults match, while that outcome remains a concrete gap.
Native accepts wait-ms0. Idle modes can finish immediately on an already-idle
page; current candidate still rejects those mode names. Frame-expanded dumps,
image resources, complete HTTP/locale controls, JSON page_status/bot_challenge
instrumentation, exact native structured logs and batch parallelism remain
outside this patch. Empty success diagnostics are not fabricated.

The first negative-format probe mistakenly used separated `bogus`; native treated
it as a URL and attempted `http://bogus/`, which the proxy rejected403. No
credentials were used. That raw observation remains labeled in the checkpoint;
its historical driver is archived as reference text. All successor invalid-value
controls use owned-origin URLs, and the current driver is safe for its default
selection.

The supplemental9-case driver also read its own hash at completion while the file
was revised for first-output timing. Its reported source hash therefore binds the
later file, not the executed v2 snapshot. Raw data and the exact v2 source are both
retained with that limitation. The initial, connection-close, writer and readiness
captures have matching retained driver digests. The current general driver now
captures its digest at startup; that small successor change has syntax validation,
not a new runtime claim.
