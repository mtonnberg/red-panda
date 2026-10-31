from pathlib import Path
r=Path.cwd();out=r/'.cache/validation/phase20-full'
p=r/'README.md';s=p.read_text().replace('runs 84 assertions','runs 87 assertions').replace('1,552 JavaScript tests, 84 PureScript Puppeteer','1,588 JavaScript tests, 87 PureScript Puppeteer').replace('docs/reference/phase19-integration/validation.json','docs/reference/phase20-integration/validation.json').replace('all 9,275 unchanged inputs','all 9,382 unchanged inputs').replace('24/24 with their declared profiles','27/27 with their declared profiles')
s=s.replace('Earlier failed epochs remain recorded. Full browser equivalence remains incomplete.','The separate full-fetch fixture still fails its literal client-hint branding check;\nthat failed report remains unchanged. Earlier failed epochs remain recorded.\nFull browser equivalence remains incomplete.')
s=s.replace('SharedWorker and nested workers remain unsupported. Blob/File message cloning is supported.','SharedWorker uses real shared VM actors and entangled ports within a root Page;\nits state survives creator-frame removal. Incoming transferred values are allocated\nin the receiving VM. SharedWorker and MessageChannel/Port are still absent in\nisolated utility worlds; nested workers remain unsupported. Blob/File message\ncloning and creator-owned dedicated-worker Blob URLs are supported.')
s=s.replace('real XHR/WebSocket/EventSource and FileReaderSync;','real XHR/WebSocket/EventSource and FileReaderSync, shared Worker actors and real ports;')
s=s.replace('| HTML / JS | Incremental HTML parsing,','| HTML / JS | Actual WebAssembly streaming compilation from genuine Response bytes; incremental HTML parsing,')
(out/'README-next.md').write_text(s)
p=r/'docs/COMPATIBILITY.md';s=p.read_text();a=s.index('The current checkpoint adds actual VM Event');b=s.index('The separate complete frozen candidate matrix',a)
s=s[:a]+'''The current checkpoint adds real SharedWorker VM actors and receiving-VM port/value
allocation, private Shared SSE/WebSocket brokers and actual parked transport
cleanup; genuine Response-backed WebAssembly streaming compilation; completed
Worker document-XHR errors; generic request metadata, no-cors redirect taint and
creator-owned dedicated Worker Blob URLs. It preserves the previous public Event
realms, SSE, WebSocket admission, audio, image, IndexedDB, popup, Sanitizer,
animation, Storage, select and DOM lifecycle work. No native C++ or dependency
source changed in this batch.

All 1,588 JavaScript tests, 87 PureScript Puppeteer checks, 13 native differential
groups, syntax checks and strict/pedantic PureScript builds pass.
[Validation](reference/phase20-integration/validation.json) records 9,382 unchanged
declared inputs: 2,074 indexed source/reference inputs, 18 native build artifacts,
6,579 Node dependency files, 689 cached reference inputs, one controller and 21
unchanged preexisting reference files excluded from this commit.
Paired native/candidate replays pass 27/27 with the declared profiles, plus a
separate 2/2 WebSocket replay with both binaries explicitly configured for 50.
The original 2000ms load and fresh 2000/8000ms assertion budgets remain separate;
9,345 inputs are unchanged. The full-fetch replay remains NativePASS/candidateFAIL
in module23 fetch_header_layers: real RedPanda client hints fail a literal
Lightpanda identity expectation. Its two actual Runtime exceptions are retained.
Absence of the older module25 diagnostic is not whole-fixture success.

The combined isolated 127 checks pass; the Root strict/87 Puppeteer pipeline and
36 key checks each on Node 24.19.0 and 26.13.0 pass with 8,653 inputs unchanged.
A separate Shared composition passes 17 checks on all three SDKs. These bounded
controls do not establish full SharedWorker, network or performance equivalence.

An additional actual utility-world comparison is a retained negative: Native
exposes SharedWorker/MessageChannel/MessagePort and delivers a trusted shared
worker reply, while this candidate exposes all three as undefined. Shared global
constructor, symbols, cross-port ordering and API propagation remain partial.
Worker Response/Blob/URL realms and broader CORS/cookie/referrer/transport profiles
also remain incomplete. Public composedPath and EventTarget symbol differences
remain. Later namespace/Event parity, history/Navigation, editing, form, viewport
and owned-window proposals are separate work. Presence of a proposal is not
production support. Earlier failed epochs remain in the phase18/19 evidence.

'''+s[b:];(out/'COMPATIBILITY-next.md').write_text(s)
print('Prepared documentation; Root files remain frozen until full validation completes')
