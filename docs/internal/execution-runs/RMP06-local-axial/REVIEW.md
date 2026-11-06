# Independent review record — RMP06a

Reviewer: separate Codex CLI sessions (installed OpenAI gpt-6.1-sol configuration), read-only and serial. The first three invocations reported reasoning effort `none`; the final full audit explicitly used `model_reasoning_effort="high"`, confirmed in its runtime header. They authored no source and executed no builds/tests. This is independent-session review, not a different-model consensus or empirical qualification.

Source reviewed: `a286e9d`, `36d637c`, then corrected source `15be61bbd7598f6a6b485bd3f9ebe9b217071312`. Raw transcripts are external; final messages are retained below for portable disposition/equation evidence. Only machine-local source link destinations were normalized to relative paths; cited line numbers refer to the reviewed pre-fix source.

## Contract review

Required changes before ACCEPT, limited to the RMP06a diagnostic contract:

1. **Normalize nose pressure as well as body base.** `compute_nosecone_wave_drag` returns a coefficient on body frontal area, not arbitrary Sref. Explicitly require:
   `CA_nose = 0.005 * (π Dref²/4) / Sref`.
   Apply the same area conversion to inherited body-base Cd exactly once. Friction and fin-edge outputs already use Sref. Without the nose conversion, the promised force invariance under re-referencing fails.

2. **Make friction coverage and fin multiplicity explicit.** State that the single body friction surface covers the nose plus cylinder, and each fin-set wetted area covers all fins and both exposed faces, with count already included. Supplied form factors must not include separately summed nose, edge, or base pressure contributions. This closes the remaining omission/double-counting ambiguity while retaining caller-supplied area/form-factor assumptions.

3. **Correct the fin-edge inventory wording and sweep units.** Only LE receives `cos²(sweep)`; TE does not. Declare `sweep_length` in metres, using `span²/(span²+sweep_length²)`, rather than leaving “sweep” ambiguous as an angle.

Otherwise, the bounded contract is sound: actual local E1 supplies q/M/Re; pressure terms retain their inherited lack of Re dependence; explicit power/plume and unobstructed-base assumptions avoid inferred nozzle corrections; zero-speed null coefficients and nonzero effective-Re refusal are honest. The single component sum, −Y force convention, and partial parent/integration status are appropriate for this unqualified diagnostic.

Read-only review completed; no edits, builds, tests, datasets, network access, or prior RMP01 review.
## Implementation review

**ACCEPT WITH REQUIRED FIXES**

One medium-severity numerical-contract defect remains.

- **P2 — Positive fin leading-edge contributions can silently become zero.** [axial.rs:119](../../../../crates/astraea-core/src/axial.rs#L119) validates the squared sweep operands, but not their quotient. At [axial.rs:168](../../../../crates/astraea-core/src/axial.rs#L168), any zero coefficient is accepted as legitimate. For example, retain ordinary flow/friction inputs and use square fins with `span=1e-100`, `sweep_length=1e100`, and `thickness=1e100`. Preparation accepts positive finite span², denominator, and edge scale. The inherited sweep quotient nevertheless underflows to zero, returning a zero LE contribution and a supported total. This violates the explicit underflow-refusal contract. Rounded/airfoil LE arithmetic can likewise round a mathematically positive low-Mach contribution to zero through subtraction cancellation.

  **Required fix:** distinguish structural zeros from lost positive contributions. Validate the sweep quotient and require a positive representable LE coefficient for square, rounded, and airfoil edges at positive Mach; retain legitimate double-wedge, TE, and subsonic-wave zeros. Refusal is sufficient within this increment; no inherited-source rewrite is necessary. Add focused regression evidence for sweep underflow and rounded/airfoil cancellation, alongside retained structural-zero checks. The current Python checker’s absolute tolerance can accept tiny expected positives as zero, so those checks need explicit positivity/refusal assertions.

The three previous contract fixes are otherwise correctly incorporated:

- Nose **and** base coefficients convert body frontal area to explicit Sref exactly once; fin terms already use Sref.
- Mandatory coverage declares whole nose+cylinder and every fin set’s complete exposed faces, with count already included and no separately summed pressure in form factors. Surface identities and E1 length/roughness coverage are checked exactly.
- Sweep is explicitly a length in metres and scales LE alone; TE remains unswept.

The remaining inspected implementation is consistent with this bounded diagnostic: strict typed E1 evaluation occurs once, rendering does not reevaluate it, friction is consumed once, power changes only base pressure with explicit opt-in, and total/component normalization and the negative body-Y force convention agree. Zero-speed coefficients are unavailable with zero static loads after validation. Prepared state is privately owned and exposed immutably. Existing aero sources and app dispatch remain unchanged; engine exposure is native-only.

This was read-only reasoning review; I did not run builds, tests, datasets, or network requests. The author-reported suites do not resolve the counterexample above. No physical qualification is inferred. Parent RMP06 remains partial, with no shared trajectory/query/curve integration or axial cache.
## Focused correction re-review

ACCEPT.

The P2 is resolved: preparation rejects an underflowed sweep quotient, and nonzero-flow evaluation requires positive LE/TE coefficients wherever the inherited source defines them as positive. Legitimate structural zeros remain allowed.

The regressions meaningfully isolate quotient underflow and rounded/airfoil cancellation while maintaining Reynolds support. Square and double-wedge controls distinguish refusal from valid structural zeros. No new numerical or source-contract defects found in the focused changes.

Read-only inspection only; reported test results were not rerun. Parent RMP06 remains partial, with no physical qualification, cache, or trajectory claim.
## Final independent high-effort audit

**ACCEPT** — bounded native RMP06a at `15be61b` versus `3d9ca93`.

Independent inspection found no serious arithmetic, reference-area, provenance, null-semantics, or strict-parser blocker. The fix rejects lost positive fin-edge contributions while preserving source-defined structural zeros. Nose/base conversion, existing Sref normalization for fins/friction, single typed E1 consumption, mandatory declarations, and activation boundaries match the contract.

Acceptance covers this inherited subsonic zero-incidence diagnostic only. Full RMP06 integration, startup coverage, and physical/source qualification remain open.

Read-only audit; no edits, builds, tests, dataset access, or network. Reported check results were not rerun.