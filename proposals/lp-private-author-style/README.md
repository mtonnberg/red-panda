# LP private author-style bridge — V5 bounded handoff

This independent implementation lets LP.getMarkdown read actual author-style state without calling authored DOM/CSS fronts or cloning nodes. It extends the accepted canonical alias producer; it does not complete Lightpanda replication or the entire CSS/Markdown surface.

Apply `integration-current.patch` to the Root working graph at checkpoint `48380c507d53def618946def28a117be995b6d21`. A read-only `git apply --check` passed there. The patch has nine runtime leaves, five new test files (21 cases), and six actual Native reference artifacts. Eight runtime leaves match the original isolated base; the CDP leaf is composed from CURRENT Root and changes only the existing markdownAlias call to pass the actual Page document as URL-render context. No old Browser/CDP file is copied wholesale into Root. `source-manifest.json` records all before/after identities. Root composition has not been executed by this child.

The tested isolated source remains the original `ece1b4bb2be85dfe7dec5e33e53ac92f56eed0c9` working graph recorded in `base-manifest.json`, not an implicit upgrade to current Root. `integration-isolated.patch` and `leaves-isolated` retain that tested graph. `leaves-current` and `before-current` make the one-contextual-hunk composition reviewable.

## Implementation

Canonical Node identity comes from successful private factory provenance. CSS declaration maps are captured at real constructor initialization, including documents born without a Window. Document factory observations authenticate inactive owner backends. An absent style registration never authenticates an arbitrary owner or declaration.

Active documents use real DOM stylesheet sources, shared CSS parsing/specificity/media/cascade math, canonical backend selector matching, and actual private viewport state. Compiled programs snapshot real rule/declaration data; public cssRules materialization and actual stylesheet operations have separate producer effects. No stored output vectors are replayed.

Style ownership follows the actual source Document. Markdown URLs use the actual main render context base. Scoped hidden roots may render while hidden descendants remain filtered. Genuine inactive documents use the measured no-style-context visibility policy; no fake Window or CSS values are created. Adoption preserves the same node/declaration and changes ownership through the real DOM operation.

Actual slot traversal emits assigned nodes and then real fallback children, as measured. Named slot-bearing nodes reached outside slot traversal are omitted. Paragraph and container boundaries preserve the Native-observed order and spacing. Generic CLI/Page.dump defaults are unchanged; the existing dump suite includes 47 captured Native samples.

Selected CSS field getter/setter/method functions and their errors are actually allocated in the originating VM. Public V8 sameRealm/creationGlobal checks passed before and after nulling prototypes on all three SDKs. Strong receiver brands reject forged/proxied receivers before authored conversion or property reads.

## Validation and epochs

V5 passed 98/98 cases on each exact SDK: Node24.22.1,24.19.0,26.13.0. Each SDK ran five new detached/poison cases and a separate 93-case prior matrix; there was no fabricated single combined execution. All V5 phases preserved 562 consumed source/native/oracle/controller/SDK inputs and 6579 dependencies. Original per-case/API budgets remain unchanged. Canonical proxy transport settings were applied before launches; proxy/TLS settings were preserved.

A fresh candidate-only actor additionally matched all 13 retained Native detached-document results, with actual node types, zero LP errors and complete cleanup. The Native and historical Root actors were not rerun. Root historical visibility/URL differences and V4's eight genuine detached/adoption errors remain recorded. Current Root's deliberate subsequent errors.js Promise fix is the only consumed Root delta; DOM/Style/Markdown routes remain unchanged.

Earlier V3 owner/cache actors matched 7 and 21 Native-observed Markdown results respectively on byte-identical V4 runtime. Native's extra sheet-media setup failed: its unobserved later row is not claimed as equivalent. Those actors are separate historical epochs, not V5 executions.

The first poisoned read of a visible container with an adopted styled descendant preserved actual CSS state and identity. Native admitted all seven common poison surfaces, with zero authored reads and successful restoration. Native's unsupported legacy `_values` route is explicitly UNEXERCISED. The candidate-only legacy real-Map shadow is EXERCISED in tests, with zero reads. Map capability detection exists only in the harness, never as production authority. Changing the same descendant declaration from none to block makes its text appear after adoption; inactive-document output remains unchanged, matching Native.

All rejected/partial epochs are retained: initial retained-registration hypothesis rejected by contrary controls; first candidate2/7; V2 slot1/2; V3 mutation fixture15/16 with the remaining77 unrun; V4 detached8errors; Native poisonR2 rejected during setup before any LP observation. Failed inputs/goldens/budgets were never rewritten. V4's fixture correction changed a conflicting p selector to the genuinely winning existing .chosen class while preserving strong mutation assertions.

## Explicit remaining bounds

- Legacy public stylesheet front identity/text-mutation behavior still differs from Native even when canonical Markdown matches. Public CSS constructors/prototypes and the whole CSSOM surface are not claimed to have complete realm/shape parity.
- Native's observed adopted/shadow stylesheet render profile is distinct from Root's genuine public computed-style support. Real CSSOM data is not falsified to hide that difference.
- Complex selector states outside the implemented private matcher remain unsupported rather than using authored front callbacks. Nested shadow re-projection and broader Markdown formatting remain separate future work.
- The entire Root suite, full upstream fixture matrix and current-Root composed patch remain Parent-owned validation. No performance equality or full replication claim is made.

`evidence.tar.gz` contains raw probes, all positive/negative logs and guards, rejected setup traces, exact historical leaf archives, and environment/cleanup records. `validation-summary.json` indexes the final selected epochs. No Native engine code or new dependency is imported.
