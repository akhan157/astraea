# RMP07f — accepted shared adapter calibration-binding guard

Source `a22df9d253445fb145868038aed816da70235b4b`, base `b3a4aef`.
[Assignment](ASSIGNMENT.md), [independent review](REVIEW.md),
[evidence inventory](EVIDENCE.json).

The console already deactivates foreign-bound calibration artifacts. The shared
adapter previously checked only that the supplied numeric scale equals its
artifact's scale; a direct caller could reach the legacy bridge with a foreign
binding and matching scale. The existing shared guard now rejects incompatible
bindings before nominal flight or any Monte Carlo chunks. It uses the existing
binding policy/only executable legacy contract, not a new routing architecture.

Unbound historical fits (with or without old provenance), exact-bound legacy
fits and no-artifact calls preserve behavior. Caller/project artifacts are not
mutated, deleted, refitted or silently applied to another model. Compatible
scale mismatches still refuse as before. If both binding and scale mismatch,
the binding error now precedes the old numeric-scale error; still no dispatch.

## Evidence

- Regression reproduced before the guard: all five foreign-binding variants
  resolved a direct flight call instead of rejecting. MC assertions were not
  reached in that failing iteration; no claim of independent pre-fix MC proof.
- Ten new tests: each binding-key mismatch through flight and ensemble (zero
  bridge/progress/cancel calls), four no-artifact/unbound/exact-bound compatibility
  variants, strict scale mismatch. Captured flight/ensemble options agree;
  scale, result artifact and manifest label preserved; callers unchanged.
- **244 tests/15 affected files**, TypeScript clean. Vite production build
  passes against the same production source before final test-only assertions.
- Independent read-only source review **ACCEPT**, no material findings. Two
  suggested test-only strengthenings adopted and tested after acceptance.

Mocked bridge captures are software dispatch evidence, **not executed WASM or
physics proof**. Fixtures isolate binding, not persisted-fit eligibility. Existing
WASM SHA256 remains
`b971b222d7e3df8c10ff268a3a540effc847adc209b6e52b8d5a0b2b08898337`.
No Rust/equation/default/model-selection/identity/schema change, no WASM rebuild
or browser/installed-platform claim. No empirical data accessed.

## Scope / successor

This closes a direct-call non-leak seam, not all C03/C04 consumers. RMP07 stays
partial: full candidate provider/command/query/plot/ensemble identity consistency,
explicit migration differences and applicable runtime/status checks remain open.
Nothing pushed, deployed, activated or released. Source/compute lease released;
raw logs/review external-only as inventoried in REVIEW/EVIDENCE.
