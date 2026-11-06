# RMP10c — geometry CP/margin withheld where the normal-force slope is unsupported (RMP10-C02)

Base 29cbc02. Initial author omp (anthropic/claude-opus-5-5); continuation openai-codex/gpt-6.1-sol. Serial MiMo no-tools review.
Goal increment 6.

## Finding (reproduced on shipped WASM b32e7b7c…)

`astraea_core::aero::stability` (aero.rs ~1393) substitutes CP = 2/3 × total
length whenever |ΣCNα| ≤ 1e-4, then derives a margin and the isStable /
isOverStable verdict from it. A finless Estes Alpha with a tail cone to
0.0005·d gives ΣCNα ≈ 5e-7 and the app shows CP 0.357 m, margin 7.24 cal,
"Overstable"; the flight engine refuses the same vehicle ("unsupported total
CNalpha … requires finite C >= 0.0001 and C > 64*epsilon*sumAbs"). The
plain-language "what if this transition were removed" sentence reuses the same
fallback. This is a stability classification from a substituted CP — exactly
what RMP10-C02 forbids.

## Change (app layer; engine bytes unchanged)

- New pure `qualifyGeometryStability` (src/aero/geometryCpSupport.ts) applied
  once at `stabilityOfRecorded` (src/tauri/bridge.ts), the only app entry for
  native stability. Flight support requires finite ΣCNα ≥ 1e-4 and
  ΣCNα > 64·ε·Σ|CNα_i| (contributions). Geometry requires strictly > 1e-4
  because the native geometry command substitutes CP at equality. When
  unsupported: cp and staticMarginCalibers → NaN, isStable/isOverStable → false,
  new `cpUnavailable` reason; totalCNa, cg, mass and every contribution kept.
  Supported results pass through unchanged (same object values).
- Consumers: stabilityBreakdown sentences (reason, no pullers/verdict; the
  transition what-if sentence is skipped when its residual slope is
  unsupported), adapter CP/margin as `unknown` with the reason and the margin
  gate reason, copilot stability checks reason, viewport CP marker hidden for
  a non-finite CP, Airframe strip marker/text.
- No change to Rust, physics, flight, thresholds, defaults or schemas.

## Lease

New src/aero/geometryCpSupport.ts + test; src/tauri/bridge.ts;
src/core/types.ts (optional field); src/aero/stabilityBreakdown.ts (+test);
src/console/data/adapter.ts; src/copilot/checks.ts;
src/console/viewport/Vehicle3D.tsx; src/console/stages/Airframe.tsx; affected
tests; new src/engine/geometryCpSupport.test.ts (real WASM). Records dir, TASKS,
RMP10 notes. Evidence: /home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp10-geometry-cp-support/.

## Verification extension

- Existing real-WASM ensemble determinism describe gets an explicit 120 s
  timeout: the full suite exceeded its implicit 20 s limit (25.7 s observed).
  Assertions, run counts and engine bytes unchanged.
- Final boundary audit also applies conditioning to the transition-removal
  residual slope. No CP-shift ratio is formed from an unsupported residual.
- Browser smoke is a bounded built-site check, not usability or engineering
  qualification. The unchanged raw signed CNα percentage shares can grow huge
  near cancellation; this increment withholds CP/margin/verdict, not that display.
- RMP10-C02 remains in_progress: unified-provider/free-couple semantics are
  not closed by this geometry-only correction.

## Authorized resume from 27c1b05

Owner explicitly requested resume after reading the recorded review stop. This
authorizes resolving the findings and fresh review, not acceptance of the WIP.
Both failed reviews remain historical evidence.

Lease extension: `src/copilot/{engine,assistant,fixes}.ts`,
`src/console/stages/AeroControls.tsx`, affected consumer tests, and changelog.
Use the existing cached geometry qualifier to withhold the native coefficient
preview's CP when its baseline is unsupported; preserve Cd and the native/TS
models. Audit the separate TS transonic path's actual production reachability.
Evidence: sibling `evidence-rmp10-geometry-cp-support-resume/`. No engine rebuild;
restore the preserved b32e7b7c… artifact in this fresh checkout.
