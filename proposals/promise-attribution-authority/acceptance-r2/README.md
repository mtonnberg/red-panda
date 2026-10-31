# Acceptance supplement after remaining SDK validation

Exact integration patch is unchanged: handoff-r2/integration.patch SHA3472c92123f67aa35ad25666e51b3bede704534f80391d9db22d75d6e6c62fe6. Exact runtime SHA9d8ef40e95876ebd18975e3f9292cafa10b1d413499d8f119fc99faf51dce0a3. Source and test leaves/manifests in handoff-r2 remain immutable; this supplement adds completed acceptance evidence only.

R2 attribution/errors passed21 each on24.22,24.19,26.13, with real creation-context/null-prototype proofs, zero traps, lazy ordering, retained-context GC and genuine fatal/legacy Host ownership controls. The separate existing regression gate passed100/100 on24.22:97 classic/parser/module/frame/stream cases plus3 retained-world cases. Its overall controller count error is preserved; the unselected heap case was omitted by Node rather than reported skipped. The SDK-only followup then passed42/42 without repeating those100. R1 remains actual17/21 with its four source-excerpt assertion failures, not rewritten into a pass.

All source guards were captured around their actual pre-integration runtime epochs on the92a6 runtime base. Parent deliberately started applying the exact three-leaf patch after the SDK lease was released. No fresh currentRoot==oldBase comparison was attempted. Root composition and full regression acceptance are Parent-owned and unrun by this agent.

The owner/lifetime review in handoff-r2 still applies. External/legacy init-hook timeout corruption is unresolved; no R3/checkpoint/Promise.then change. Cached-owner rejectionHandled policy and Native late-target distinction remain; no full future reusable-global or reclamation proof is claimed. Finite scoped success is not overall Native parity.
