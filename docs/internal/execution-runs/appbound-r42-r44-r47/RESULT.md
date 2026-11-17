# App-bound bundle — R42 + R44 + R47 on today's app engine

Date: 2026-11-11. Branch: `appbound/r42-r44-r47`. Base: `5f17db5`
(`frontend/design`, tree identical to `250c8f9`). Source commit: `b2c4896`.
Status: **candidate; independent review pending; not pushed, not merged into
`frontend/design` or `main`.**

## What this is

The gate-1 engine content ported onto the app engine instead of the whole
`accuracy/integration` branch:

- R42 optional `launchSiteTemperatureC` and `nozzleExitDiameter`.
- R44 opt-in `flightDragSource: "calibrated"` and nose `tipRadius`.
- R47 metres-to-feet fix in the calibrated drag ladder.
- The **default-off R41 diagnostic seam** (`DiagnosticTerms`,
  `compute_flight_loads_with_terms`, `simulate_flight_diagnostic`) is included
  because R42's product resolver uses it. It is bit-identical when terms are
  absent; the identity proof below covers it.

Excluded: E-1 (`8dc5de2`), E-1b (`2d44ff0`/`6c5d8da`) and E-7 (`e0d0d97`).
E-7's `StabilityDto.parts` / `PartExtentDto` and its tests are removed. No
boattail/base-drag behavior is brought in.

No `src/` file changed. The TS oracle and aero-model provenance remain at
`5f17db5`. The built WASM is not committed.

## Diff

`git diff --stat 5f17db5..b2c4896 -- crates src`:

```text
 crates/astraea-core/src/aero.rs                       |    3 +
 crates/astraea-core/src/aero_model.rs                 |    4 +-
 crates/astraea-core/src/flight_provider.rs            |    5 +-
 crates/astraea-core/src/six_dof.rs                    |  351 ++++-
 crates/astraea-engine/src/commands.rs                 |  141 +-
 crates/astraea-engine/src/models.rs                   |  505 ++++++-
 crates/astraea-engine/tests/appbound_bundle_cohort.rs | 1381 +++++++++++++
 crates/astraea-engine/tests/freeform_fin_parity.rs    |    2 +
 crates/astraea-engine/tests/p1_boattail_arm.rs        |    2 +
 crates/astraea-engine/tests/p1_product_supersonic.rs  |    2 +
 crates/astraea-engine/tests/telemetry_parity.rs       |    2 +
 11 files changed, 2374 insertions(+), 24 deletions(-)
```

The 1,381-line test is the app-bound evidence harness (adapted from the R44
evidence test; it does not edit the research test to pass). The four small
parity-test edits add the new optional fields to `SixDofOptions` literals only.

## Identity proof (no new option)

Probe: `docs/internal/execution-runs/accuracy-bundle-frontend/preset-compare.probe.ts`
at `frontend/design`, run old-WASM vs new-WASM with the app's own requests.
Result: `/home/ak/astraea-evidence/appbound-r42-r44-r47/preset-compare.json`
(SHA-256 `7a9851…bf352`).

| Preset | App engine | App-bound | Delta |
|---|---:|---:|---:|
| Estes Alpha III + C6 | 299.1795257133733 m | 299.1795257133733 m | 0 |
| NASA Student Launch + K550W | 533.0760350112048 m | 533.0760350112048 m | 0 |
| Spaceport America + M1820 | 5013.508465461415 m | 5013.508465461415 m | 0 |

Max velocity, max Mach, flight duration, landing velocity, rail exit, validity,
CP and peak transonic Cd are also bit-identical. The only difference is the
additive `thrustPressure` / `axialDrag` keys in `runManifest`.

WASM built for the probe (not committed):

| Build | Bytes | SHA-256 |
|---|---:|---|
| app `5f17db5` | 2,003,605 | `5034fd48…55924e` |
| app-bound `b2c4896` | 2,033,664 | `f6feb37f…df9620` |

The existing parity fixtures (`drag-cd-scale-parity.json`,
`telemetry-parity.json`, `freeform-fin-parity.json`) are unchanged from
`5f17db5` and pass.

## Suites

- Core: **269 passed, 0 failed, 0 ignored, 5 suites** (`core-suite.log`).
- Engine `--lib --tests`: **156 passed, 0 failed, 7 ignored, 19 suites**
  (`engine-suite-final.log`).

## Bundle numbers rerun on this engine

Primary line, 20 airframes, qu8k excluded:

| Build | MAE | Signed | Within ±10 % |
|---|---:|---:|---:|
| App-bound bundle | **5.6253246 %** | **+0.2363039 %** | **18/20** |
| Corrected R41 Stack | 5.6126355 % | +0.2369995 % | 18/20 |
| Research R44 bundle | 5.6250576 % | +0.2160449 % | 18/20 |

Delta vs corrected R41 Stack: `+0.012689 pp` MAE. Delta vs the research R44
bundle: `+0.000267 pp` MAE and `+0.020259 pp` bias. The small bias difference is
the app default base drag (no E-1b); it is well inside the Phase 2 rule. The
Phase 2 rule still passes: MAE ≤ 7 %, 18/20 within ±10 %, signed within ±5 %.

Dev vehicles: Mini DX3 G69N **+29.011 %**, Cosmic Cargo **+24.585 %**, Top Shot
**−2.401 %**, Adventurer **−4.908 %**. Ensembles pass (whole/chunk, zero-sigma
member, single-flight wording). Wiring passes: product tables and apogee equal
the independent harness at 0; reported difference vs the research R41 tables is
`5.45e-2` (table) / `3.67e-3` (apogee), not gated. R3 plain-ladder reproduction
is not run on the app engine.

## Known limitations (recorded, not fixed)

1. `aero_provider.rs:303-327` `aero_model_status` still returns
   `flight: "refused"` with "flight coefficients still come from the legacy
   path in this build". With the opt-in on, that sentence is false. No UI calls
   the command; not fixed in this lane.
2. The built-up method refuses the Spaceport America template: fin set
   `sac-fins` does not follow a body tube (fins on the boattail transition). The
   supersonic template therefore flies legacy drag even with the option on; the
   UI will show the refusal.
3. Nose tip radius is inert below about Mach 0.9 (the blunt term is in
   `drag_supersonic.rs`); NASA SL calibrated apogee is unchanged with and
   without a 3 mm tip.
4. No frontend wiring; the frontend lane owns the UI and will move it onto this
   branch.
5. E-7 is excluded, so `StabilityDto` has no `parts` field.

## Status

Independent review by a different model family pending. No push; no edit to
`frontend/design` or `main`. The frontend coordinator runs its own proof before
merge.
