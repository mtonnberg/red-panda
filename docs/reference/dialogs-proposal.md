# Dialog and popover proposal

This is an opt-in independent implementation against candidate commit
`085510cd1b546fb0fdee18674761092359bb6b6d`. No production files are modified.
The implementation is `dialogs-prototype.mjs`; the exact proposed Browser,
form and privileged-input wiring is in `dialogs-integration.mjs` as isolated
Node source overlays. Upstream production engine code is neither imported nor
copied.

## Evidence

`dialogs-probe.mjs` records bounded public DOM and raw CDP observations in
`dialogs-native-observation.json`. The native executable SHA256 is
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
The probe owns its native browser and uses dynamically reserved ports. No shared
browser endpoint or port9582 service is used.

`dialogs-native-fixture.json` separately records a fresh passing native run of
unchanged `element/html/dialog.html`, with the upstream native harness branch,
nonzero-observation enforcement and source hashes. The fixture SHA256 is
`742a2104c10a6507d733ffde43dc1555635be60d7918e787c3a716f114c0edf0`.

The proposal passes the same unchanged fixture and ten additional integration
tests on Node24.22.1 and Node26.13.0. All 59 existing input, frame-input, focus,
forms-integration and navigation tests pass with the proposal overlays.
Existing `forms.test.js` has 19 passing tests and one outdated assertion at
line265: an orphan `method=dialog` form must now consume submission without
throwing or navigating, replacing the old unsupported-error expectation.

Run the opt-in suite explicitly:

```sh
node --test docs/reference/dialogs-regressions.test.mjs
node --import ./docs/reference/dialogs-integration.mjs --test test/input.test.js test/frame-input.test.js test/focus.test.js test/forms-integration.test.js test/navigation.test.js
```

## Contracts and integration

`installDialogs(page, window)` belongs in the main and frame Window installer,
before authored scripts and after focus/navigation installation. It installs:

- `HTMLDialogElement.show`, `showModal`, `close` and private `returnValue`.
- `HTMLElement.popover`, `showPopover`, `hidePopover`, `togglePopover` and
  `ToggleEvent` where missing.
- Synchronous private state invalidation when `open`/`popover` attributes
  change or a subtree detaches. Cloning does not copy modal/popover/return state.
- A host controller with `dispose`, `isModal`, `isPopoverOpen` and an ordered
  `topLayer` snapshot and monotonic private `revision`. No synthetic marker attributes, page globals or event
  listeners implementing keyboard defaults are added.

Exported `isModal(element)` and `isPopoverOpen(element)` check document lifetime,
connection and actual mode. The selector proposal uses the popover provider;
the modal selector deliberately retains the native false result described
below. Actual modal control state must never be inferred from `[open]`.
`getDialogStateRevision(window)` exposes a host-only invalidation token for the
selector/style/layout caches. It advances on actual state changes, including
transitions in closed ShadowRoots, and remains stable on cancelled openings and
no-ops. Synchronous detachment sweeps the private top-layer entries because
jsdom's ordinary detach recursion does not enter a host's ShadowRoot.

`submitDialogForm(form, submitter)` is called at forms.js's current unsupported
dialog branch, **after** its existing validation, trusted submit and trusted
formdata pipeline. It returns true to consume dialog submissions, including
orphan forms; false preserves ordinary navigation. It closes the nearest
ancestor dialog. A missing submitter/value attribute preserves `returnValue`.
The existing formmethod override and post-event method mutations are retained.

`requestDialogClose(window)` is called by privileged Escape's default action
after uncancelled keydown. It requests only the newest connected modal in that
document, dispatches cancel, and closes only when cancel was not prevented.
Page-created keyboard events never call this helper. Frame keyboard routing
remains in the existing input module.

## Native profile and limits

The pinned native profile intentionally differs from newer browser standards:

- `requestClose` and `closedBy` are absent. show/showModal/close do not emit
  dialog toggle events. Opening does not move focus or enforce modal inertness;
  the proposal retains the existing real active element.
- close queues a trusted, nonbubbling, noncancelable event. Undefined and null
  close arguments preserve `returnValue` in the observed native profile.
- Native privileged Escape's cancel event is untrusted; its queued close is
  trusted. The proposal preserves that observed distinction.
- Popover beforetoggle **and toggle fire synchronously**. Opening beforetoggle
  is cancelable; closing is not. Auto and hint siblings close while nested
  popovers of that mode remain open. Manual popovers remain independent.
- togglePopover accepts nullable Boolean forcing; an object such as
  `{force:false}` converts to true in this profile. Native Escape currently
  leaves popovers open. requestClose, newer force dictionaries, light dismissal
  and invoker-button default actions are outside this proposal.
- A modal dialog's showPopover is accepted by the native profile; showModal
  while a popover is already showing throws InvalidStateError.
- Native `matches(':modal')` currently returns false after showModal despite
  Escape recognizing the modal. The actual private modal provider remains
  available for control state; the separate selector predicate retains the
  observed native false result at the parent's request.

The bounded proposal provides state and event semantics, not top-layer painting,
backdrop rendering or a new focus policy. It does not yet add UA stylesheet
fallbacks for hidden popovers. The selector proposal owns wiring this private
revision into the existing style/layout cache tokens; visible attributes must
not be used for invalidation. Mixed auto/hint
stack interactions, cross-shadow nested popovers, fullscreen interaction and
multi-document close-request propagation need further native observations.
