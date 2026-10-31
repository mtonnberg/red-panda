# Utility DataTransfer R3 (unrun)

R3 adds one private positive backend-kind route in `isolated-world.js` before generic Proxy, symbol and Array handling. The route calls the existing canonical `wrapImpl` factory for already registered genuine File/Blob/FileList implementations; it does not infer a brand from public metadata or allocate a replacement backend. This closes the R2 omission where genuine FileList implementations (Array subclasses) entered generic Array cloning.

R2 is preserved unchanged, including its actual 6 tests / 4 pass / 2 fail result. R3 changes only one runtime line relative to R2; all tests and their assertions are byte-identical. The seven-leaf complete patch still depends on the separately frozen R5 file-input prerequisite, which remains unmerged into Root. Private apply/reverse checks passed. No JavaScript syntax, tests or protocol replay have run for R3.

Prepared command (requires Parent runtime lease):

`python3 /workspace/red-panda/proposals/utility-data-transfer/run-candidate-r3.py`

The unchanged gate runs 6 new physical/semantic tests, compares six complete cached Native semantic objects (with the seventh ordinary cross-world protocol control separate), then 33 existing consumer tests. Total 39 tests. Original RPC 2500 ms, owned/parent replay 15/20 s and actual VM/test limits stay unchanged; 120 s is the administrative ceiling. Stop on first failing stage, no retries. Source, dependency, executable, 18 native artifact and oracle guards remain in place. Failed-stage TAP counts must be read from raw output because the existing controller preserves its nonzero-exit-before-counting behavior.

All Root files are untouched. PureScript upload tests and their 129 total projection remain unbuilt/unrun. Native physical birth is not inferred from nominal Native profiles. External/legacy Promise-hook interruption and previously documented protocol gaps remain explicit.
