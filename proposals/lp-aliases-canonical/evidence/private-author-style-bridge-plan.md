# Separate next packet: canonical author-style visibility reads

This is a static implementation plan, not implemented or validated code. The first no-clone LP adapter remains a separate pending packet; it fails explicitly on real author stylesheets. Its old clone design remains UNRUN/rejected by static review. No Root or future CSS package files are modified here.

## Actual seams and dependency

`styles.js:516` already owns cascade rank, importance, origin, layers, nesting, media, specificity, shorthand expansion and revert selection. Its primitive value computation can be reused. The current access path is not canonical: `rootOf` calls public `getRootNode`; `scopeSheets:418` uses public querySelectorAll/localName/media; `localToken:453` reads public checked/selected/location/viewport; `uaRulesFor:626` reads public localName; computed/inheritance also cross wrapper fields.

`selectors.js:169` has genuine private type/id/class/attribute predicates. `:empty` still reads public children/data. More complex selectors fall through NWSAPI (`matcher:198`, `match:210`) using public DOM traversal. Existing parsing is reusable, but its compiled string and `required` fast-reject lists are insufficient as a complete canonical selector program. They must not be treated as full matches.

CSSOM already has private LISTS/DEFERRED_LISTS, flatSheetState/deferredRuleStyle and real declaration mutation versions. Sheet disabled/media and some nondeferred rule metadata are still public-object reads. Their successful creation/mutation owners must supply canonical private state; reading an authored accessor or manufacturing a frozen CSS winner is not a substitute. Coordinate the existing CSS package owner before implementing this dependency.

## Explicit canonical read interface

Introduce a Host-only read interface whose input is an actual authenticated NodeImpl and immutable per-Document owner record. It supplies type/namespace/name, attributes, tree parent/children/siblings/root, private inline declaration, actual owner document, assigned slot/shadow host, genuine input/form/dialog state, real stylesheet scope records, and actual CSS/DOM/state revisions. No public Node facade, tag/prototype test, authored marker, fresh DOM clone or wrapper getter is used as authority.

Record the genuine DocumentImpl at successful installStyles. Bind the actual layout/viewport once at its real installation seam; do not read `window.innerWidth` or a reusable Page's later layout for a retained old Document. For owned Window environments, retain the immutable document/context authority, not a retargetable public global. Sheet/adopted scope records similarly key actual root implementations.

Keep current public computed-style behavior on its existing front-reader by default. Add a separate canonical read mode feeding the same cascade offer/sort/expand/layer/revert kernels. The markdown adapter consumes only the resulting primitive display/visibility fields. It never publishes declarations, nodes, rule records or a new public renderer controller.

## Canonical selectors

Extend the existing tokenizer/parser to retain an immutable selector program: compounds, combinators, logical subprograms and structural parameters, preserving existing public compiled output. Evaluate that program directly against actual NodeImpl and SymbolTree. Reuse existing private attribute/case/quirks matching and real state providers. Implement descendant/child/adjacent/general-sibling traversal, :scope/:root/:empty, structural nth families, :is/:where/:not/:has, and supported real form/focus/dialog predicates as measured. Keep unsupported namespace/pseudo cases explicit. Never route the canonical path through public matches/querySelector/NWSAPI or turn unsupported programs into a false successful CSS match.

## Sheet and cache state

Add narrow producer-time canonical records for sheet/rule membership and disabled/media state where an existing private record does not already exist. Existing real CSSOM methods update those records only after successful mutation; failed replace/insert/delete must not advance state. Reuse exact deferred rules/declarations and their existing versions, adopted-sheet order, external resource completion and actual style-node text. No new second stylesheet implementation or fake CSSRule is needed.

Cache actual computed outcomes only with private DOM tree/attribute version, stylesheet/declaration/adoption versions, real selector state/focus/fragment version, immutable document identity and actual viewport state. No authored getter values, elapsed-time cutoffs or unproved cache invalidation assumptions.

## Bounded Native-first acceptance sequence

1. Probe actual author-sheet display/visibility, ordinary and important cascade, inline precedence, layers/revert and viewport media. Compare real output rather than fixed implementation vectors.
2. Mutate actual class/style text, rule declarations, insertion/deletion, constructed sheet replacement and adoption; verify output changes and failed mutations preserve prior state.
3. Exercise actual combinator/logical/structural/state selectors needed by those cases; preserve Native unsupported observations separately.
4. Run the same fresh CE-constructor and poisoned Node/Element getter controls with real author styles present. Add poisoned public styleSheets/cssRules/media/Window metrics controls only after calibrating them. Require zero authored callbacks and unchanged constructor count/output; restore all authored controls before teardown.
5. Verify genuine child-frame style ownership, retained document authority and retirement using actual producer records. Preserve aliases' measured context/node/session errors.
6. Run narrow CSS/selector regressions and the existing dump47 controls with default behavior unchanged, then composed LP checks on all three exact SDKs. No full/source-budget/heap runs without a separate lease.

The first canonical adapter is a scoped initial slice, not completed alias or full browser parity. This followup removes the explicit author-style boundary only as real private reads and Native controls establish support.
