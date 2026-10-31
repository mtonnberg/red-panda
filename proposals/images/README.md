# Independent image source and transport implementation

The Window image implementation maintains actual HTMLImageElement nodes,
source selection state, real optional transport and genuine decode Promises.
No image bitmap or decoded pixel output is invented. The default target profile
queues trusted selection load events without network; explicit image resources
fetch real response bytes and inspect PNG/GIF/JPEG/WebP headers. HTTP errors,
redirects, empty/invalid sources, supersession and actual cancellation determine
state and events. Natural sizes preserve the previous image until replacement
settles. Header inspection stops after a recognized size or a256KiB prefix;
more formats, malformed headers and larger metadata remain bounded gaps.

Source selection parses real density/width candidates and picture source order,
media/type predicates and px/vw/vh sizes. Dynamic source/tree mutations and
fragment/inert-document adoption update actual shared node state. Image factory
conversion/subclass behavior, loading/decoding/referrer attributes and decode
cancellation follow measured controls. Full sizes syntax, utility-specific
installation, exhaustive origin/header policy and retirement timing remain
unexhaustive.

Native observations are captured in state/extra/header expressions and reports:
139 rows, including response bodies with independent generated PNG dimensions,
actual pinned JPEG bytes, truncated headers, bad CRC, SVG/text, status201/204/404,
redirects and density candidates. Only real ephemeral origins are replaced in
state comparisons. Expression and actual body hashes are verified by the tests.
Nine focused checks pass. All four unchanged upstream image fixtures pass on
actual Native and the earlier composed candidate, exact registration/resource
profiles, Native/nonzero harness, real complete/load2s gate and separate2s
assertion budget; source/status logs are packaged in phase18 integration evidence.
This is not a full registration/WPT/performance result.

Direct public V8 proof retains a failed allocation hypothesis: VM Object.create
with a Host Event prototype produced a Host event. Constructing the captured VM
Object first, attaching the actual interface prototype, and minting the generated
Event backend on that SAME object gives VM=true/Host=false before and after null
prototype. Promises, errors and public functions also retain genuine VM contexts.
The later shared private Event foundation preserves this producer and removes
its physical implementation-symbol exposure through genuine private storage.
