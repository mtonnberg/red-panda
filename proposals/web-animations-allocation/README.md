# Actual VM allocation correction

Apply `allocation-followup.patch` after the frozen original Web Animations
patch. The original package remains unchanged. Its fixture and queryObjects
checks did not prove allocation context: direct public-V8 evidence shows the
original animation and playback-event objects are Host-created before and
after prototype=null. Their constructors, methods, getters and Promises were
already genuine VM values. The contrary original observations are retained in
`evidence/original-context-proof.json`.

The correction allocates the animation as a literal in the actual VM's public
Element.animate method, sets its real interface prototype, then calls generated
EventTarget.setup on that SAME object. The playback constructor now initializes
its actual VM receiver through generated Event.setup. Internal trusted events
use the captured original VM playback constructor, not page-replaced globals.
No Host object is grafted onto a VM prototype as an allocation substitute, and
no private VM constructor table is introduced.

Actual implementations are captured immediately at setup. Attribute-handler
registration, removal, default prevention and dispatch use captured genuine
implementations and EventListener conversion; no later authored wrapper
implementation-symbol getter is consulted. Element validation also uses the
private successful-factory implementation. A control installs throwing symbol
getters on both the element and animation, then verifies successful allocation,
trusted finish delivery, target identity and zero getter reads.

Focused checks pass **14/14 on Node 24.22.1 and 14/14 on Node 26.13.0**, including
the original 12 Native-oracle/state checks. Each runtime records **13 direct
creation-context rows**, all VM=true, Host=false and matching the VM creation
global before AND after setting prototype=null: animations, authored playback
events, real trusted finish/cancel events, constructors, methods/getters and
ready/finished Promises. The unchanged upstream animation fixture passes again
with the source load/then-assert budgets. It uses an ephemeral fixture port;
canonical 9582/9584 were not used.

`manifest.json` binds the exact base/followup hashes and tests. The patch applies
cleanly after the original and contains only the animation module plus its new
focused allocation test. The original matching runtime/heap binaries are reused;
there is no new C++ change or rebuild. No heap walk, broad/full suite or
PureScript suite ran during this followup. Direct V8 creation-context functions
are used instead of factory hints, claimed CDP metadata or prototype identity.
