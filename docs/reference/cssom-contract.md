# Scoped CSSOM compatibility

The reference is the checksum-verified Lightpanda Linux binary
`1.1.0-nightly.11326+948d77378`, SHA-256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
No native browser engine implementation was imported or copied.

`cssom-probe.mjs` performs bounded CDP observations against an owned browser.
`cssom-native-observation.json` contains the observed values. The same probe was
captured through REA 6.8.0: `cssom-native-evidence.json`, Evidence ID
`ev_41193b7fa5867307fc3318444a41433028864256b2a763ff4b436181201203ed`.
The process exited 0, settled and had no output truncation. This is runtime
observation, not a whole-engine decompilation or a full CSS conformance claim.

## Implemented behavior

- Declaration scanning recognizes strings, escapes, comments and balanced
  component values. Empty declarations do not swallow following properties;
  URL colons and semicolons within values are not declaration boundaries.
- Inline cssText, parsed style attributes and rule declarations share the
  declaration path. Priorities recognize whitespace around `!important`, and
  changes synchronize to attributes/serialization through jsdom's callbacks.
- Invalid nested rules in declaration cssText are discarded through the next
  top-level semicolon. Within stylesheet rules a nested block ends at its own
  closing brace, so following declarations still apply.
- The measured scalar length-zero, first-baseline, duplicate two-value and
  anchor-size argument-order serializations are supported. Anchor functions
  are retained as specified values; this does not resolve anchor positioning.
- Safe unquoted URLs retain that form. Quoted URL tokens remain quoted, including
  quoted paths with spaces. This does not rewrite URL-like text inside strings
  or unrelated declarations.
- CSSRuleList provides a retained indexed list with a live iterator. It is not an
  Array and does not expose Array values/keys/entries. The measured native list
  also lacks item(); the adapter keeps that native interface shape. The
  existing StyleSheetList remains the same live object with indexed iteration.
- Style rule serialization includes normal CSS punctuation and can be replaced
  through cssText. Constructed replacement retains list identity, locking,
  owner-document adoption checks and asynchronous completion. Media grouping
  mutations maintain parent pointers and update real cascade results.
- Unknown at-rules are retained as type 0 without claiming their cascade
  semantics. Out-of-range stylesheet insertRule indexes clamp to the tail, as
  documented by the reference's explicit CSS-in-JS compatibility fixture;
  deleteRule still throws IndexSizeError.

The adapter is scoped to documents registered with installStyles. Ordinary
unregistered jsdom windows retain their original declarations and stylesheets.
The ordinary import loader is preserved for parser-compatible imported sheets.

## Validation and limits

`cssom-fixture-checkpoint.json` records independent runs of the unchanged
upstream css/stylesheet.html, css/font_face.html, css/font_face_set.html and
domrect.html fixtures. Native and candidate both passed 4/4 with no assertion
diagnostics or runtime exceptions. The pre-change stylesheet failure and
fixture identity are also recorded in conformance-webapi-checkpoint.json.
Local CSSOM/styles/input/layout/fonts tests passed 72/72, including real
cascade effects, adoption affinity, disposal, rule mutation, attribute syncing
and dynamic checked/selected/focus/reset invalidation.

The bounded native probe still differs in multi-value zero serialization:
the native preserves authored unitless multi-value padding/margin/border-spacing
strings while cssstyle expands their zero lengths to px. Native @font-face
serialization retains source formatting and does not expose its descriptor
style in this observation; the candidate exposes parsed descriptor declarations.
These gaps are retained explicitly in the fixture checkpoint's probe comparison.

The tokenizer and existing cascade are not a complete CSS parser or renderer.
Nested selectors, cascade layers, @supports conditions, complex selector support,
animation execution, anchor layout and arbitrary CSS grammar remain outside the
implemented cascade. Nested blocks are skipped for declaration recovery; they
are not silently presented as an implemented nesting cascade. Imported sheets
that require syntax recovery remain a documented limitation.

## Computed-style cold path

The previous implementation repeatedly computed the same ancestors and converted
matched UA declarations for each descendant. Registered documents now retain
computed results behind DOM/ancestor/stylesheet/media/state tokens, cache scope
node enumeration by DOM version and normalize fixed UA declarations once.
Dynamic checked/selected/value/reset/validity state and focus invalidate both
retained styles and the layout revision. Abort/close still dispose registration.

A local three-run cold probe read four computed properties from 81 elements.
All returned values matched commit 7e3d112; median time was 519ms before and
127ms after in this machine under concurrent work. See
cssom-performance-observation.json for individual timings and source hashes.
This is a bounded diagnostic measurement, not a browser performance guarantee.
The installer-level report-error fixture passed after this optimization, but a
production Browser/CDP run still missed its postMessage callback deadline;
that remaining event-loop/timing issue is not reported as fixed here.

## Style attribute mutation commits

Declaration changes now temporarily silence intermediate dependency callbacks
and commit the final serialized attribute once. This prevents duplicate removal
records during setProperty and shorthand operations. Normalized identical values,
invalid declarations and absent removals preserve the original raw style text
and emit no records. Explicit cssText assignments emit one record even when the
serialized value is identical or empty; direct setAttribute remains an explicit
attribute mutation. removeProperty normalizes ordinary property names while
retaining significant custom-property case.

Five additional tests cover real attribute old values and emission counts,
priority changes, shorthand batches, no-ops, explicit assignments, custom
properties and retained computed-style/revision invalidation. CSSOM, style and
mutation tests pass 44/44. `css-mutation-checkpoint.json` records unchanged native
and candidate fixture evidence: css_noop passes natively, fails before the fix
and passes afterward; the current stylesheet fixture passes in both browsers.
No observer filtering or test-specific scheduling was added.
