# S2: refused shapes. Gate 1 outcome: NO CHANGE, refusal stays

**Lane.** Author codex `gpt-6.1-terra`, medium effort, research only. The checkout is `/home/ak/.t3/worktrees/astraeat3/t3-55b180b2-420a55ba098f51ed`. The author completed only the cohort row. The orchestrator finished the inventory from existing hash-pinned outputs on 2026-11-15. No new probe ran.

## Cohort (candidate, K4 probe output `K4/cand.json`, sha256 `be7d0ef2…`)

All 23 flights fly built-up drag; none is refused.

## Development vehicles (step-0 native `dev_vehicles`, `step0/cohort-native/dev-vehicles.json`, in step-0 SHA256SUMS `290c61fd…`)

| Vehicle | Drag outcome | Measured apogee | Legacy error | Built-up arm error |
|---|---|---|---|---|
| Mini DX3 G69N (11 flights) | built-up | 600–1018 m | +16 % to +97 % | +13 % to +91 % |
| Cosmic Cargo | built-up | 292 m | +27.3 % | +24.6 % |
| **Top Shot E12** | **refused**: freeform fin planform | 309 m | −2.5 % | −2.5 % (flies legacy) |
| **Adventurer J510W** | **refused**: freeform fin planform | 3197 m | −4.9 % | −4.9 % (flies legacy) |

## Templates (K3 lane output, archived in `K3-lane-out/presets-commit2.json`)

- **Built-up:** Alpha III and NASA SL.
- **Refused:** Spaceport America, because "fin set 'sac-fins' does not follow a body tube" (fins on the boattail).

## Refusal classes in the engine (`crates/astraea-core/src/calibrated/from_vehicle.rs`, `design.rs`)

- elliptical or freeform fin planforms;
- extra transitions, or more than one expanding transition;
- a body tube after the boattail or fin can;
- fins not on a body tube;
- more than one fin set on one body part;
- unsupported nose shape or airfoil;
- a Power Law nose without its exponent;
- non-contiguous body runs;
- rail guides on more than one merged tube.

## Disposition

**No change.** Refused designs keep the legacy fallback, and the result screen states the reason.

The only refused shapes with flown data are the two freeform-fin vehicles. On legacy drag they come in at −2.5 % and −4.9 %, so there is no measured evidence that extending the built-up method would help. With n = 2 there is also no basis to fit one. Per GOAL.md, the extension stops at Gate 1. The Release Readiness Report lists the refusal classes and these two results.

**Falsifier.** Flown data showing that a refused shape class flies worse on legacy drag than the built-up method would fly it. That would need the method extended and validated on independent data.

**Note for the report.** The Mini DX3 rows (+13 % to +91 %) are development evidence with known motor and mass issues (see `docs/flight-validation/mini-dx3-results.md`). They are not a regression from this goal: P7 requires no new failures, and the numbers were unchanged at step 0.
