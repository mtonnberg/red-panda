# Bounded ElementInternals and form-associated elements

Independent implementation, without Native engine code. `integration.patch` adds the new module/test and narrow owning-module hunks in custom-elements.js, forms.js, document-xml.js and selectors.js. It changes no Browser/global native source. Root production files were not edited. The tested scratch is `/workspace/shared/element-internals-20261031`, copied from Root's CSS+Storage+Canvas graph. Full candidate/base files are review artifacts: apply the narrow patch instead of replacing newer Root files.

## Observed target and owned graph

Native SHA256: `9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`. Native controls and the unmodified pinned `custom_elements/element_internals.html` and `custom_elements/form_callbacks.html` ran first. All servers/processes belong to these helpers, bind ephemeral localhost ports and close in finally. Only generated fixture data and owned POST endpoints are used. No port9582, personal data, external service or native instrumentation is involved.

Before any candidate execution, **all three owned scratch addons were rebuilt serially** with the exact Node24.22.1 SDK against the copied native sources. `owned-build-node24.txt` and `build-manifests/` record source/binary/header/compiler hashes. `base-source-hashes.json` and `candidate-source-hashes.json` fingerprint the actual graph. Other copied Node-version binaries were not executed or claimed; only prepared Node24.22.1 was checked here. No native change is included in this integration patch.

## Implemented behavior

- Preserve the actual generated ElementInternals objects, their real HTMLElement targets, form objects, registry constructors, shadow roots and generated ValidityState records. Trusted factory records authenticate new methods; copied implementation symbols/proxies do not create valid receivers. The original target's internal ARIA map is initialized and missing measured braille reflections are supplied without changing the element's public attributes.
- Actual per-element form state drives association, disabled/read-only/datalist validation barriers, values and validity flags. Real tree insertion/removal, ID/form/disabled changes, parser construction and upgrades enqueue actual custom-element reactions. Atomic moveBefore defers recomputation until the real topology change completes. Callback counts follow transitions; no fixture-specific counts or responses are used.
- Keep original constructors/definitions and construction stacks. Collect actual form lifecycle callback functions and use the existing reaction queues/error reporting. Association changes pass the actual form or null. Disabled fieldsets and first-legend changes use real ancestry. Real resets queue callbacks after built-in control resets and respect cancelable reset events.
- Form collections include actual autonomous form-associated elements in tree order. Customized built-ins keep built-in behavior and ignore autonomous formAssociated flags, as Native demonstrates. New FormData/form submissions use actual string/File values and copied FormData entry snapshots, including nameless custom controls carrying their own FormData keys. Invalid controls prevent actual HTTP submission; valid values traverse the existing form/network machinery.
- Genuine live ValidityState flags reflect each setValidity update. Failed validation dispatches real trusted, cancelable, non-bubbling invalid events. Form validation and :valid/:invalid/:enabled/:disabled predicates use actual state without synthesizing invalid events during selector matching.
- Actual CustomStateSet values have private Host Set state and ordinary public live iterators, matching Native's plain-object iterator shape. They support mutation/iteration semantics and real callback arguments. No private Host state record is returned to VM helpers; retained factories/controllers are Host null-prototype records or genuine public values.
- **Target quirks are retained:** states and ValidityState cache the wrapper from the first getter's actual realm; labels return fresh Array snapshots in each invoked getter realm, containing actual label elements. They are not live NodeLists. Native ignores setFormValue's optional state argument, including its getters. Native rejects :state(...) selectors. No origin/realm/protocol identities are aliased.

## Evidence and checks

Both unmodified upstream fixtures return `testing.assertOk() === true` on Native (`native-fixtures.json`) and the final candidate (`frozen-candidate-fixtures.json`). Fixture bytes and helpers are hashed in the reports.

`comparison.json` compares identical-helper raw JSON observation strings. **13/14 complete runtime rows match:**8/8 interface/state/form/callback rows,2/3 realm/label rows,2/2 coercion rows and1/1 customized built-in row. The remaining row consists of unsupported :state selector failures: both throw SyntaxError, but Native says "The string did not match the expected pattern" and the existing shared selector parser says "Unknown pseudo-class". No error text or wire result was substituted.

`native-submission-v1.json`, `frozen-candidate-submission.json` and `submission-comparison.json` preserve actual HTTP receipts. Trusted invalid/submit events and zero blocked requests over the observed40ms window match. Valid urlencoded POST bytes match exactly (`before=b&custom=actual-value&after=a`). Multipart requests contain the same ordered fields, filename, content type and exact owned file bytes; independent actual boundary strings differ and are retained. The comparison parses those raw receipts for semantic review only. Later additions to the original FormData do not appear in the submitted snapshot.

Frozen focused serial checks:

- `frozen-tests-node24.txt`: **14/14** new tests, including genuine identities, receiver brands, state iterator lifetime, actual labels/realm allocation, validation events, callbacks/moves, fieldsets, values/reset and real POSTs.
- `frozen-existing-node24.txt`: **21/21** selected existing form, custom-element/parser and move regressions. The exact name pattern is recorded in `verification.json`.
- No broad/full/heap or PureScript suite was run. Node24.19/Node26 execution is unverified in this checkpoint; Root can check its rebuilt combined graph.

## Remaining scope and honest limits

1. Generic unsupported-selector error wording remains different. :state matching itself is unsupported by both sides.
2. Extra form callbacks are collected after the underlying registry definition returns and before its real reaction flush. Exotic callback getters, invalid callback rollback/whenDefined behavior and reentrant definition error atomicity need dedicated controls; no complete definition-algorithm parity is claimed.
3. Reentrant constructor/mutation edge cases, validation anchor behavior through shadow trees, exhaustive coercions, adoption across unrelated/inert documents, iframe retirement/full teardown and isolated utility worlds are not established by these controls. No automatic formStateRestoreCallback behavior is fabricated; Native ignored the supplied state values in the tested calls.
4. Initial assumptions about live NodeList labels were corrected after actual Native realm/lifetime controls showed fresh Array snapshots. Superseded files are retained as history, not passing evidence for that assumption. The initial focused test failure compared genuine cross-realm nested arrays with Host deepStrictEqual; its assertion was corrected to verify real realm allocation and compare projected contents. An early patch command used the wrong working directory, failed before editing any production file, and its old candidate fixture output is retained separately. Final frozen tests/controls are canonical.
5. Existing MaxListenersExceeded/experimental-VM warnings remain visible in logs. This checkpoint does not claim full ElementInternals or browser replication.

## Reproduce

Use the already prepared Node24.22.1 executable and preserve the outbound proxy while appending localhost/127.0.0.1 to both NO_PROXY spellings. Rebuild the scratch addons against its exact copied sources before executing a different Node runtime. Run `node --experimental-vm-modules --test --test-concurrency=1 test/element-internals.test.js` in the integrated checkout.

Run `node --experimental-vm-modules proposals/element-internals/probe.mjs <new-output.json>` for Native; likewise realm-probe.mjs, conversion-probe.mjs, builtin-probe.mjs or submission-probe.mjs. Set ELEMENT_INTERNALS_CANDIDATE_ROOT to an absolute checkout for the candidate. `fixture-probe.mjs native|<checkout> <new-output.json>` runs both pinned fixtures. Outputs use exclusive creation; use new paths. Run checks serially.
