# Static phase23 Attr → CSS → focus → text-decoration composition

No runtime, Node/Native test or build was executed. Root's audio diagnosis retains the runtime lease. The current Root source was copied into an owned real source/test/native/helper tree at /workspace/shared/phase23-attr-css-composition-20261031;560 inputs were byte-verified and Root remained unchanged throughout composition.

Apply only the exact frozen patches, in order:
1. attribute-adoption/candidate-r1/integration.patch (8db4d4a9…)
2. computed-style-defaults/candidate-r1/integration.patch (fb54b861…)
3. focus-owner-document/candidate-r1/integration.patch (c9b04a71…)
4. css-text-decoration/candidate-r1/integration.patch (04edf70f…)
Then add the Attr, CSS and text-decoration test patches. All14 check/apply steps succeeded without conflicts, offsets or context adaptations. Existing Root styles/selectors/focus/attribute-names are exactly the original patch bases. The final five runtime leaves equal their accepted frozen leaves. current-root-composed.patch is a review diff against today's actual Root, not authorization to apply to Root before the checkpoint.

Only four existing runtime files change (styles, selectors, focus, attribute-names), one module is added, and three test files are added. All13 protected source files remain byte-identical, including current namespace parsing/serialization, direct/private EventTarget/Event/WebSocket storage, platform allocation authority, invocation privacy and timer ownership. In particular current isolated-world f531abe3… retains its newer private Location path and direct-only Node/Target rebinding. No older isolated-world/factory/timer source is transplanted from a prior proposal.

Before runtime, recheck hashes after the phase22 audio checkpoint and recopy from that final approved source if needed. Run the12 new functional tests, existing namespace/authority25, cascade/focus58, ownership/timer29 and layout/range/selection39 declared cases in serial batches; these are static declared counts rather than new run results. The exact file lists and full hashes are in plan.json. Start with Node24.22.1, then the approved24.19/26 artifacts as Root leases allow. Raw75/320/three-authored Native controls must keep all fields/expectations and original API budgets. Retain the65 known remaining CSS differences rather than filtering or weakening assertions. Layout consumers require actual checks because the accepted display model feeds them; full renderer/performance parity is not claimed.

The independent frozen evidence remains historical: Attr3/3, composed CSS/focus6/6, text-decoration new3+prior6=9/9, three exact Native controls, full75 match and320 reduction239→65/no new paths. None is promoted into a current-Root runtime result. Frozen packets and Root/private-current sources are untouched.
