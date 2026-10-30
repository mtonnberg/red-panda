# Input controls: prepared independent scope

Runtime probes remain paused pending the broader comparison owner's release.
No production/common code was changed for this preparation. The standalone
`input-controls-regressions.test.mjs` file contains eight real Browser regression
contracts outside npm's ordinary test glob; it has not been executed while the
probe window is paused. It uses no Puppeteer workflow and no target engine code.

## Frozen evidence

Frozen checkpoint 085510c is `/tmp/red-panda-broader-frozen-EGeNlI`. Its native
report passes all seven selected fixtures. Candidate failures are:

| Fixture | First concrete differences |
| --- | --- |
| input-attrs.html | Range tie 1 returns 1 instead of 1.5; parsed bounded default stays 50 instead of 6; max change leaves 50 instead of clamping 20. |
| input-value-as.html | datetime-local number serialization adds .000; off-ladder stepUp(5) snaps once and ignores remaining steps. |
| input_click.html | Canceling a radio click fails to restore the previous checked radio. |
| input_radio.html | Same-name external controls ignore their distinct form= owners during grouping. |
| label.html | Detached ordinary-tree controls expose for-associated labels. |
| option.html | Option.length is 4 rather than 0; source also permits Option() without new. |
| dialog.html | returnValue and dialog methods are missing; the fixture also exercises popover and dialog-form submission. |

The reports serve unchanged HTML from external source commit
948d773786380bae36f046639fc61e2ddddd212a. Only fixture contracts, the independent
engine and pinned third-party jsdom source were read.

## Proposed numeric and activation adapter

Add a document-scoped installer using pinned HTMLInputElementImpl hooks and
existing Decimal.js. Preserve real input state, dirty flags, content attributes,
validation and generated WebIDL methods. Compose current hooks rather than
replacing their earlier style/focus behavior.

Range sanitization should clamp, then choose the nearest allowed step rung using
the actual min -> value content attribute -> zero base. Ties choose the higher
rung; a rung beyond max falls back downward. Step=any skips snapping; invalid
nonpositive steps use the default. Preserve the authored value string when it
already fits the ladder. Apply this after value assignments, value/type/min/max/
step attribute changes and form reset without creating fake input/change events
or rewriting the value content attribute.

Parser initialization needs a separate step: `<input type=range min=0 max=11>`
defaults to the final midpoint rounded to 6. A dynamically created default range
at 50 followed by max=20 instead clamps to 20. Compose parse5's actual adapter
createElement after full attribute adoption for initial sanitization, following
the existing shadow adapter chaining pattern. A single attribute hook cannot
correctly distinguish these cases.

For numeric/date stepping, retain real conversions and Decimal arithmetic but
count the off-ladder snap as step one; apply remaining requested steps before
clamping to min/max rungs. Preserve the existing supported-type and step=any
InvalidStateError behavior. Whole-second datetime-local serialization must omit
redundant .000. Additional time/fractional/negative-count cases need bounded
native observations after release before expanding behavior beyond fixtures.

Radio grouping should enumerate the actual tree and compare case-sensitive
nonempty names, type=radio and real form owner identity. Snapshot the previously
checked group member before actual legacy pre-activation, and restore that member
on canceled activation when it still belongs to the group. Delegate existing
event dispatch, trusted input/change events and disabled/reentrant click behavior.
Probe handler-driven group/type changes after release before asserting their
exact cancellation semantics.

## Labels, Option and dialogs

For labels, restrict for= resolution to Document or ShadowRoot roots. Detached
ordinary wrapping labels still resolve their own first labelable descendant, but
ordinary detached controls expose no labels. A real live NodeList query must
re-evaluate its target's current root on access so attachment, removal, shadow
roots and duplicate IDs stay accurate. Scope impl getter changes to owned
documents; do not replace labels with snapshot arrays.

Option can wrap the existing real factory with zero declared arguments and a
required new-target check. Delegate actual text/value/defaultSelected/selected
creation and preserve HTMLOptionElement.prototype, its constructor and the
readonly/nonenumerable/nonconfigurable prototype descriptor. No selection logic
needs changing based on the frozen option fixture.

Dialog requires a separate real state/lifecycle scope: show/showModal/close,
non-attribute returnValue, modal/nonmodal distinction, connection checks,
cancelable requests and asynchronous trusted close events. The unchanged fixture
also requires popover conflicts and method=dialog submissions using submitter
overrides and the nearest ancestor dialog. Current forms deliberately throws
NotSupportedError for that method, so a dialog adapter alone cannot finish this
fixture. Do not claim modal interaction/focus behavior from an open-attribute-only
implementation. Root should allocate the dialog/popover/form integration scope
separately.
