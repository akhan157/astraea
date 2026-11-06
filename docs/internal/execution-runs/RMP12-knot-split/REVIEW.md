# RMP12 knot split — independent integration review

## Disposition

**ACCEPT the owner-authorized C1+C3 software increment**, not full RMP12-C02
qualification. Coordinating OpenAI session, independent of the DeepSeek author
family. Author source `49070710b6c5fb5070b3b42da0ed9bc9cec4a9b7`, records
`18085e3cebde542b1542eecbe060fa45817b9678`, merged at `c5ac1a1`.
The author did not accept its own work.

RMP12-C02 moves from `fail` to `in_progress`: the current default clears the
previously missed **provisional** rail reserve in the declared vertical fixture;
approved mission budgets, full state/attitude/regime coverage and physical
qualification remain open. Historical no-split failures are retained, not waived.

## Review findings and resolution

- Core step clipping covers the adaptive integration choke point, including
  reconstruction for event refinement. Near-coincident knots avoid an
  unrepresentable step; endpoint knots do not introduce a zero-length trial.
  Only time-tabulated thrust knots are covered. State-dependent Mach,
  atmosphere and wind-shear discontinuities remain outside this intervention.
- Midpoint event state and crossed-endpoint state are separate: reports use the
  midpoint; simultaneous-event predicates use the crossed endpoint. Numerical
  identity policy 2.0.0 binds splitting and the 1e-7 s root width. Old archives,
  policy records and recorded engine hashes remain historical.
- The two Rust fixture duration assertions were weakened from 1e-12 relative to
  1e-7 s absolute. This is explicitly reviewed, not hidden as an unchanged test.
  The approved midpoint algorithm has a width-w localization uncertainty. The
  midpoint-difference bound of w assumes brackets for the **same interpolated
  root**; it is not proof that independent trajectories share a physical root.
  Apogee checks remain 1e-12 and the separate WASM/TS oracle stays 1e-9. The
  observed duration agreement and those trajectory checks justify the bounded
  parity contract, not arbitrary trajectory divergence or physical accuracy.
- Fixture expectations were regenerated from the changed TS reference. They
  are implementation parity evidence, not an independent physical reference.
  The independent vertical diagnostic and split-off falsifier below are the
  separate numerical evidence.
- Dispatch estimates were corrected twice rather than pinned to an expected
  favorable answer. Final independent reproduction gives 3.2806396485 us, not
  the earlier 2.4/8.08 us estimates; event displacement is 0.042895 mm, distinct
  from maximum sampled position error 0.150254 mm.

## Independent merged-tree verification

External evidence root: `../evidence-rmp12-knot-split/` relative to the checkout.
See `COORDINATOR-EVIDENCE.json` for exact commands and artifact hashes.

- `cargo test --offline -j 2 --manifest-path crates/astraea-core/Cargo.toml --lib -- --test-threads=2`: **223 passed**.
- `cargo test --offline --locked -j 2 --manifest-path crates/astraea-engine/Cargo.toml --tests -- --test-threads=2`: **100 passed** in 11 suites.
- Focused adaptive/simulator/event-restart/engine/ensemble/Monte Carlo/pool/
  application/calibration tests, `--maxWorkers=2 --no-file-parallelism`:
  **115 passed in 9 files**. `tsc --noEmit`: exit 0.
- Built `profile_candidate_flight` from the merged source and executed all six
  rows through the committed `run_rows.py`. All six stdout hashes match the
  author's sealed run. A20: 3.2806396485 us; F20 split-off: 113.6749267578 us;
  old binary: 105.0140380858 us, historical stdout byte-exact. Default and
  explicit split agree physically. A20/F20 cost: 228/207 accepted trials,
  21 clips/21 straddles, no rejected trials (+10.1%).
- Source hashes: all 15 recorded source files and all three record hashes match
  the author evidence. Core and engine lockfiles compared equal across lanes.
- Rebuilt the ordinary production WASM with `CARGO_BUILD_JOBS=2`, then built
  Vite (3116 modules). Production-CSP Chromium executed a real default flight:
  **533 m modeled apogee**, canonical saved-output dictionary present, recorded
  engine SHA matches the actual loaded WASM response, no page runtime errors.
  Screenshot inspected. Browser and preview closed in `finally`.

## Build-hash observation — bounded, not a diagnosed defect

The authoritative merged-tree WASM SHA-256 is
`cf57158b84bdc92861fc56530c2fedb2e13d290e2d1212d90015fbce5746f508`.
The author's artifact is `68804608…`; the merged build is stable across two
ordinary invocations, but not byte-identical to that artifact. Both were invoked
in their respective verification runs; neither hash is substituted for the other.
The browser loaded and recorded the merged hash above.

Earlier coordinator narration called this a build-path identity defect. That
causal claim was premature and is withdrawn: a temporary path-remapping probe
still produced differing artifacts (`2fcfa2a6…` / `2025cdb4…`). Source/lock equality
does not prove toolchain/environment/build equivalence. Reproducibility cause
remains unresolved; no build script, flags or production identity policy was
changed to force equality. Binary-content identity intentionally identifies
bytes, not source equivalence. Fits tied to another SHA remain retained and
subject to the existing mismatch refusal; no provenance was rewritten.

## Remaining scope

No full-6D numerical qualification, approved decision budgets, state-dependent
breakpoint handling, new empirical evidence, platform/release acceptance or
universal error bound. The subsequent C04 matched experiment below is bounded
to two existing synthetic fixtures; broader configuration/qualification remains
open. No push, main merge, release or publication performed.

## Subsequent matched native/WASM experiment

Recorded separately in `MATCHED-RUNTIME-EVIDENCE.json`; no production code,
fixtures or tolerances changed. Both runtimes received the same serialized
`simulate_flight` request, using the existing telemetry fixture's exact
vehicle/motor/options for winds 0 and 3 m/s. Native executable was built from
the merged source; WASM is the exact browser-exercised `cf57158b…` artifact.
Compared structure, non-numeric fields and numeric fields with the standing
`abs(native-wasm) <= 1e-9 * max(abs(native), 1)` bound.

- Wind 0: 130,039 numeric fields satisfy the bound; maximum scaled error
  2.637e-16. Six events and 5,000 telemetry points per runtime.
- Wind 3: the strict all-field comparison **fails** on Euler display angles:
  4,975 roll and 34 yaw values differ. First failure at telemetry[18].rollDeg:
  -172.9 versus -176.4 degrees. Complete replies retained, not rewritten.
- Analysis of the same replies (no re-execution) confirms all 125,030 remaining
  numeric fields within the bound; maximum scaled error 1.443e-14. Every
  discrepant Euler field meets the pre-existing quaternion numerator <=1e-9
  singularity rule in `telemetry_parity.rs:28-32`, in **both** runtimes;
  largest numerator magnitude 3.276e-15. Canonical quaternion components and
  trajectory fields satisfy the original precision. This is not equality of
  the nonauthoritative Euler presentation and is not a new exemption.
- Initial harness attempt captured about 1 MiB then returned child status null;
  [INFERENCE] default `spawnSync` capture bound. Partial output retained under
  `native-wasm/`. Capture was increased to 32 MiB, without changing numeric
  assertions. The second attempt completed both replies before the wind-3
  assertion failed; analysis reuses those exact bytes in `native-wasm-2/`.

**ACCEPT bounded non-singular field parity evidence; RMP12-C04 remains
`in_progress`, not PASS.** Strict full-display parity is false. No blanket
native/WASM or physical qualification, source-equivalent build reproducibility,
or broader configuration coverage is inferred from these two cases.
