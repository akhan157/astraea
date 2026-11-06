# ENG signed-contribution implementation review — 2026-10-25

**Disposition: accept the signed algebra and bounded physical change; request two small contract/evidence corrections before closing the patch.** No scientific reason was found to change the retained Mach law, drag projection, or nominal moment signs. The requested fixes concern an inaccurate runtime manifest and an overstated force-parity field, not the signed-contribution repair itself.

Read-only review of `/workspace/astraea-worktrees/engine-diagnosis-20261025`, HEAD/base `b4cc67d849efcf57455349e30672f379eac8faa9`, with uncommitted changes. Compared against `cp-scientific-review.md` and existing outputs in `/workspace/astraea-plan/evidence/signed-contributions-20261025`. No builds, test execution, simulations, network/data acquisition or holdout evaluation were performed by this reviewer. Source hashes below bind this review while the author finishes the commit/artifact manifest.

## Corrections requested

1. **Describe the newly introduced hard failure in the runtime contract.** `crates/astraea-engine/src/models.rs:774–779` still emits `continue-and-mark-UNKNOWN: out-of-domain segments continue; validity UNKNOWN; all safety outputs closed`. The new unsupported normal-slope/CP condition returns an error through `compute_flight_loads` before using the arm (`six_dof.rs:1238–1263,1433`), and reaches the native flight command as an error. Revise the manifest to distinguish continuing with UNKNOWN for evaluable out-of-domain loads from aborting when signed sums/CP are nonfinite, below the support floor or numerically cancellation-dominated. Preserve the existing nonfinite-kinematics handling; do not change it just to simplify the description. Verify the manifest text/contract through the ordinary focused checks and record the final binary identity if rebuilt.

2. **Do not call the present x/z comparison full force parity.** `scripts/diagnostics/signed-contributions.mjs:83` populates `forceDifferenceN` from x and z only, adding gravity back in z; it never compares y. The fixtures have identity attitude, zero wind, post-burn time and zero cant, so the comparison is sound for the two transverse channels but is not a three-component force check. Either include y (with thrust handled if the fixture changes) and rerun this bounded native check, or rename the field and downstream claims to transverse-force parity. The existing stored result, `1.1368683772161603e-13 N`, establishes transverse parity only. All three moment channels are compared (`:84`).

These are the only requested pre-closure fixes established by this review. Final source/artifact identity should be reconciled after them; the before/after measurements below refer to the inspected artifacts, not a future rebuilt binary.

## Accepted implementation findings

- **Signed superposition is correct.** `models.rs:469–484,566–574,581–600` accumulates `ΣC_i`, `ΣC_i x_i`, and `Σ|C_i|` separately for body/fins. Finite negative contributions are retained; absent or zero contributions add no moment; a nonzero contribution requires a finite station. Overflow/nonfinite accumulation returns an error rather than substituting CG. This matches the adopted signed Barrowman assembly and linear force/moment superposition; it does not validate the underlying aerodynamic approximations.
- **Zero/negative groups retain their couples.** No group CP division remains. At Mach M the core uses `C=B+gF`, `J=J_B+gJ_F`, and `CP=J/C`, with the existing effectiveness factor unchanged (`six_dof.rs:1244–1264`). This correctly handles zero group force with nonzero first moment and negative body force with positive total. TS mirrors the same preparation and combination (`src/dynamics/loads.ts:154–173,270–287`).
- **Unsupported totals fail before arm use.** Finite inputs, nonnegative absolute-slope sums, finite aggregate force/moment/absolute sum, absolute floor and relative cancellation checks precede CP division; finite CP is then required. Netnegative, zero and below-floor totals return errors. The relative policy is `C > 64 ε Σ|g_i C_i|`, a declared computational support guard, not a measured accuracy tolerance or a universal rigorous summation-error bound. The absolute policy accepts `C=1e-4 /rad`; this deliberately differs at equality from stability's `abs(C)>1e-4` division condition. Equality acceptance is explicit and tested, so it is not a hidden defect; describe it as reusing the numerical floor with a declared boundary rule, not exact inheritance of the whole stability branch.
- **Error propagation is present.** The normal calculation uses `?` before force/moment assembly. Endpoint-probe, rail-exit, macro, touchdown and stage callback paths propagate the loads error (`six_dof.rs:1863–1867,2068–2072,2223–2227,2354–2358,2462–2466`). The added core and native-command tests exercise this. This conservative support policy also refuses an undefined normal station before recovery/rail suppression; it is a support restriction of the current formulation, not a claim that zero/negative aerodynamic slopes are physically impossible.
- **Nonfinite Mach behavior remains reasonably scoped.** As before, nonfinite Mach uses the baseline factor while the unchanged load-validity/kernel path handles invalid kinematics. Retaining that behavior avoids an unrelated change to the established UNKNOWN/error policy. It does not mean NaN/Infinity Mach is a physically valid coefficient evaluation. New errors apply to invalid signed sums/CP support, not a newly invented Mach law.
- **The implemented force/moment interpretation is preserved.** The diagnostic explicitly calls CNα an added body-normal slope alongside wind-axis drag. The static arm still applies to full transverse aero force; pitch/yaw damping and roll torque remain unchanged. The diagnostic's static vector includes rate-independent fin-cant roll torque, and its damping vector has the signs needed for their sum to equal the total. The wrapper uses actual frontend conversion, preparation and production loads, not a reconstructed second RHS (`commands.rs:79–95`; `six_dof.rs:1311–1323`). It is native-only, absent from app dispatch. The example fixes rail/recovery false via that wrapper; evidence must not imply those regimes were exercised.

Tests inspected cover signed transition expansion/contraction through real preparation, invalid nonzero-contribution CP, zero/negative group algebra, reference-station translation, absolute/relative boundaries, nonfinite/overflowed CP, a positive low-Mach total becoming unsupported after fin degradation, both signs in pitch/yaw, damping decomposition, and native flight-command propagation. The supplied Vitest log records 57 passing tests across four files; the release build log records success. Core 18 tests, engine 25 tests and TypeScript checking are author-reported in the coordinator packet; this reviewer did not execute or independently reproduce those commands.

## Existing numerical evidence inspected

The local-load artifacts contain **36 states per vehicle, 72 total**, across M=0, 0.3, 0.8, 1.4, 2, 4; signed ±5°/0° in pitch/yaw; zero rates/cant, no wind/recovery/rail, and post-burn motor time. M0 provides coefficient inspection with zero aerodynamic loading, not a physical force-center measurement. Native and TS CP/CNα and all moment channels match exactly in the stored parity report; transverse force differs by at most `1.14e-13 N`. These checks are implementation evidence, not independent aerodynamic validation.

For the nominal NASA preset, every sample field other than the explicit model ID is unchanged; the native aero curves are also identical. For the controlled contracting-tail variant at M0.3 and +5° pitch:

| Quantity | Before | After |
|---|---:|---:|
| CNα, /rad | 21.31599981169365 | 20.10711092280476 |
| CP aft of nose, m | 2.390571723078401 | 2.4466614450239343 |
| Body transverse force z, N | −137.55957791160102 | −129.9529542578075 |
| Static pitch moment x, N m | 77.6033635915327 | 80.60116016238398 |

The drag magnitude, combined CG, reference area and curves are unchanged. The torque increase despite lower normal-force magnitude follows from the larger arm; it agrees with the full signed repair rather than the earlier CP-only substitution sensitivity.

All four stored development replay inputs compare equal before/after. Cosmic Cargo, Mini DX3 and Top Shot have no negative stability contributions and show exactly unchanged inspected apogee/time, burnout altitude/speed/time, rail-exit speed, termination and validity. Adventurer contains `adv-tail` CNα = −0.6729613466858226; its changes are:

| Output | After − before |
|---|---:|
| Apogee altitude | +0.0079215253 m |
| Apogee time | −0.0001953125 s |
| Burnout altitude | +0.0005630472 m |
| Burnout speed | −0.0000148351 m/s |
| Burnout time | 0 s |
| Rail-exit speed | 0 m/s |

All four terminate at touchdown before/after. Cosmic remains PASS; the other three remain UNKNOWN. `railExitTime` is not a field in the captured coarse DTO, so this review does not claim a numeric rail-time comparison from that key. The saved events can supply that comparison if reported. These small changes are consequences, not an accuracy pass or an optimization target.

The before/after manifest hashes match their corresponding four case-result files. Independently read artifact hashes: before WASM `e4ab1b9d207f791734108c6a85e480da3660603a66fdb97101f9ff033efe0985`; after WASM `74e0a00f14c7b825509420630b1cc7d2a27701471772b8fb32a733190ee586a0`. This verifies file identity, not a fresh source-to-binary rebuild. The before-native diagnostic has its own recorded source hashes; it is an instrumented local-load baseline, distinct from the frozen production-WASM full-flight replay.

## Reviewed source SHA-256

| File | SHA-256 |
|---|---|
| `crates/astraea-core/src/six_dof.rs` | `aca3586a8d7911336504a93d87303798d0c61eb713513732a4913bae563b088c` |
| `crates/astraea-engine/src/models.rs` | `9ce883bcdecf9dd698b4d2f1bf4947d5bd915938d0c55ce20531fefb47d340f7` |
| `crates/astraea-engine/src/commands.rs` | `84dc767abbee67552fb17e338cb9f7a80d60d4d82fbca2f6286e10e7c58b3766` |
| `crates/astraea-engine/examples/flight_loads_diagnostic.rs` | `f06fe35c357c35f3a360922d3b6609aee9f0e6804574ec24a538a5ef3aae2b4f` |
| `src/dynamics/loads.ts` | `f3f71e1a08ebdc5444df9267cc6b886b94c6e7e9fd9bab7b97bf3c18bc6110de` |
| `src/dynamics/loads.signed-normal.test.ts` | `3a07852d7cde4916962561436fcb640489215d255ff54abaad6262288b1916c3` |
| `scripts/diagnostics/signed-contributions.mjs` | `ad644115db8187595985c1ed05665102eac4d7ae2c189163dce702ea4a713ea1` |

The curve-versus-flight Mach laws remain unselected and incompletely qualified. This patch repairs signed-contribution transport under the existing flight law; it does not close the separate normal-versus-drag coefficient-definition question or justify a public collegiate accuracy claim.

## Coordinator reconciliation after review

The two requested reporting corrections were implemented in 48a92ad (integrated
as 62d6189): the run manifest explicitly distinguishes undefined-CP command errors
from classified-domain UNKNOWN continuation; parity checks now compare x/y/z
forces and assert the native phase flags. The corrected 72-state parity check
and targeted command/manifest test passed. This addendum records coordinator
verification; it does not relabel the original independent review or its hashes.
Final workspace binary/replay evidence is in the 2026-10-25 delivery review.
