# Actual Window global inheritance and console placement

Use `integration.patch`. Its five files preserve the current Root Console
integration and alter only fresh-context prototype capture, Window inheritance,
and focused regression controls. No production files were edited by this worker.

The console depth difference comes from a genuine global-object inheritance
mismatch. Native has the same chain in main, frame and both utility contexts:

```
actual global → intrinsic global prototype → Window.prototype
             → EventTarget.prototype → Object.prototype
```

The intrinsic layer owns only a constructor, distinct from the public illegal
Window constructor. Native console belongs to Window.prototype, at depth2.
Root previously pointed its global directly at Window.prototype, while jsdom
inserted a tagged WindowProperties placeholder after that prototype. Utility
globals also skipped their actual intrinsic layer. Moving console to another
object would conceal the inheritance mismatch.

Node's actual fresh vm.Context already supplies the missing intrinsic object.
The context factory now captures that exact object before jsdom replaces its
link. Utility creation also captures it directly before installing interfaces.
The adapter restores it above the existing Window prototype and links that real
prototype to its actual generated EventTarget prototype. No dummy prototype,
depth marker or replacement Window/document/wrapper is manufactured. The
intrinsic constructor retains its genuine call/new behavior; its name metadata
identifies the Window global. Function.toString is not rewritten.

Pinned jsdom Window.js explicitly describes its WindowProperties object as a
placeholder. Its live named-property tracker instead owns accessors on the actual
raw Window and tracks actual document attachments/attribute changes. The adapter
preserves that same tracker, Window object, document, constructor and wrappers.
Controls verify dynamic ID/name changes, duplicate live collections, reassignment,
lexical shadowing and foreign/retired-frame access retain their Root behavior.
Native has existing differences for duplicate IDs, form names and foreign named
lookup; these are recorded rather than changed by this prototype-only patch.

Fresh-context capture uses the actual top-level `this` and host intrinsic
prototype lookup, so supplied public Object/globalThis aliases cannot provide a
false prototype. Unknown existing contexts receive no invented substitute.
Standalone IDL alignment preserves its previous global behavior when original
capture metadata is unavailable.

## Evidence and limits

`manifest.json` records the exact final patch, source compositions, test and raw
report hashes. Final focused controls cover all four actual realm variants,
genuine constructor call/new behavior, EventTarget callbacks, named routing and
existing world/frame behavior. The unchanged compiled PureScript acceptance
program runs against the composed source; this is distinct from a new strict
PureScript compiler run.

The earlier namespace composition matches all five original Native console
observations, including depth2, and passes the unchanged console source fixture.
The final current-Root composition is separately fingerprinted after rebasing to
preserve Root's newly integrated Console code. Earlier setup-invalid observations
and test failures remain preserved: stale context selection, a public alias used
as a VM context, and eval-local `let` used instead of a persistent VM Script were
corrected without removing assertions.

This fixes the global chain, not the complete Window IDL surface. Native's Window
prototype has182 own names; Root exposes far fewer. Several global EventTarget
methods also differ in own-versus-inherited placement. Node's intrinsic constructor
retains nonconfigurable arguments/caller properties and an unnamed native-function
string, unlike Native's hidden Window constructor. These genuine engine differences
are not hidden with fake descriptors or fabricated strings. Full latest Root
regression remains parent integration work.
