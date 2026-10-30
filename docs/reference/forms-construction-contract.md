# Form construction and reset observations

Red Panda independently implements form entry construction, trusted `formdata`
dispatch and reset reentrancy. No Lightpanda engine source was imported.

The owned [probe](forms-construction-probe.mjs) executes the same public API
expression against the verified reference binary and an independent Browser.
The reference executable SHA-256 is
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
The probe closes its CDP socket, owned reference process and candidate browser.

The [initial observation](forms-construction-before.json) and
[expanded observation](forms-construction-before-expanded.json) retain the
pre-change differences. The [post-change observation](forms-construction-after.json)
has identical native and candidate result objects on Node 24.22.1. These are
bounded local runtime observations, separate from earlier REA investigations.

Observed behavior:

- Construction dispatches a trusted, bubbling, noncancelable `formdata` event.
  Its payload is the exact returned FormData object, and handler edits persist.
- Detached forms also dispatch. Constructing from the same form inside that
  event throws `InvalidStateError`; submission of that form is ignored. A
  different form can construct normally, and the guard releases afterward.
- Subclasses retain both brands, their prototype and constructor identity.
- The reference accepts an HTMLElement second argument that is not a submit
  button or belongs to another form; those controls add no submitter entry.
  Plain objects, numbers and strings throw `TypeError`. `requestSubmit` retains
  its separate submit-button and ownership validation.
- Native `FormData.set` removes matching entries and appends the replacement,
  rather than retaining the first matching entry's position. Red Panda follows
  that observed order and preserves one conversion of each supplied argument.
- Reset dispatches a trusted, bubbling, cancelable event. Reset of the same
  form from its listener is ignored. Cancellation retains dirty values; a later
  reset and reset-button activation restore defaults.

The implementation retains jsdom's generated Web IDL wrappers and FormData
entry storage. Constructor interception builds through the same successful
control collection used by navigation submissions, including actual files,
image coordinates, disabled options and direction fields. Per-document weak
state owns the construction and reset guards. Ordinary unregistered jsdom
documents keep their existing fallback behavior.

These observations do not establish complete form association, custom-element
internals, every encoding or multipart boundary equivalence. The wider unchanged
upstream fixture results are recorded separately.
