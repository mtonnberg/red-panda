# R2: complete captured conversion globals — unrun

The R1 seven-leaf candidate and its actual seven-syntax/6-tests/2-pass/4-fail epoch remain immutable. This separate real copy is `/workspace/shared/utility-data-transfer-r2-20261031`. No Node job, build, browser, syntax check or retry has run in R2; Root is unchanged.

Only two runtime leaves change relative to R1: file-wrapper-realms captures actual VM String and Number alongside TypeError during its FIRST private realm registration, and DataTransfer captures the same intrinsics before publishing public definitions. Both use a frozen Host-owned `{TypeError, String, Number}` projection. There is no later public-global lookup, Host String fallback for VM values, proxy/prototype retagging, backend clone or frontend identity change. The pinned dependency audit proves these are all required globals: toNumber reads Number, DOMString reads String, and every makeException call uses TypeError; File/Blob bags/EndingType only need TypeError additionally.

The single test delta strengthens the existing replaced-global check by poisoning String and Number as well. Every original physical, sole-Proxy, canonical alias, byte/clone, identity, trap, disposal and Native comparison assertion is unchanged. Counts remain six new plus 33 existing tests. Original PS five-leaf/129-conditional proposal stays separate and untouched.

The complete seven-leaf integration patch is still against the selectively composed current Root + accepted checkpoint9 R5 source. The three-leaf intrinsics-correction.patch is the exact R1→R2 delta (two runtime, one strengthened test). Private application and reversal reproduce exact bytes. Both native artifact sets and every other R1 owned source input remain unchanged; R5 final prerequisite acceptance is separate, and Root has not merged it here.

Exact next command:

`python3 /workspace/red-panda/proposals/utility-data-transfer/run-candidate-r2.py`

No repeat of R1's seven successful standalone syntax checks. Node parses the changed modules naturally when running the same six physical/functionality tests, then the owned seven-row cached-Native replay (six complete semantic-object comparisons and separate protocol control), then 33 existing cases. Expected 39 tests, 20–40 seconds, 120-second administrative cap. Original raw RPC 2,500ms /owned 15s /parent 20s and every test/VM/fixture budget stay unchanged. Stop at the first failed stage; no retries, Source edits, PS build, Native repeat or heap enumeration. Fresh current Root and frozen owned graph/dependencies/Node/native/oracle guards remain in place. R1 controller's failed-stage actualTests0 accounting limit remains disclosed; raw TAP determines any actual failed-stage counts.

The broader owner/lifetime/canonical module design and all limitations stay those in candidate-static-r1/README.md. External/legacy Promise-hook interruption, future reused globals, unretained reclamation, full main File/Blob definition parity, advanced DataTransfer cloning/coercion/drag behavior and final composed full validation are not claimed. R1's two positives remain separate evidence; R2 has no passing-runtime claim yet.
