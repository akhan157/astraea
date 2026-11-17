# Accuracy bundle `2472314` — frontend merged-tree check

Date 2026-11-11. Checker: frontend coordinator (Claude Fable 5.2), thread
`b1d7ce0d-aa76-446f-a1f5-5e37bc9f0224`. Not an acceptance of the bundle.

**Result: the bundle is not opt-in only for the app. The merge was backed out.**
The opt-in parts (R42, R44, R47) are still wanted; they wait on an app-bound
engine line.

## What was handed over

Hand-off message (run 95) and
`docs/internal/execution-runs/R47-r44-altitude-units/GATE1-APPROVAL.md` on
`accuracy/integration`: merge `2472314` into `frontend/design`; "Absent optional
inputs remain bit-identical. No preset, project schema, default or claim
changes."

## What the merge actually carried

`250c8f9` (tip of `frontend/design` and of `main` at the time) is an ancestor of
`2472314`, so the merge is the whole `accuracy/integration` branch: 252 commits,
460 files, +212,578 lines. Beyond R42 `9e617b4`, R44 `7b327ae` and R47 `5f1c86e`
it brings engine lanes the app does not have:

| Lane | Merge | Effect on a flight with no new option | App status in the research records |
|---|---|---|---|
| R27 E-7 shared rollup | `e0d0d97` | none (flight path bit-identical) | owner approved the hand-off 2026-11-07 |
| R28 E-1 boattail base drag (TN 3320 fit) | `8dc5de2` | changes every boattailed vehicle | **failed its held-out check (R33): "development-only, not app-ready"** |
| R32 E-1b cylinder base drag (TN D-4821) | `2d44ff0` | changes every cylinder-base vehicle | approved for the app only as the backport `r38/e1b-backport` + `r39/e1b-continuity` `6c5d8da`, which keeps the historical boattail law |

`r39/e1b-continuity` `6c5d8da` is in neither `250c8f9` nor `2472314`. The bundle
also brings the research records and scripts (`docs/internal/accuracy-research/`,
`scripts/research/`, `src/validation/research/`, root `ASSIGNMENT.md`), which the
owner had removed from `frontend/design` on 2026-11-05.

The "bit-identical when absent" proof in R42/R44 is against
`accuracy/integration`'s own earlier state, not against the app engine.

## Measured

Same request as the app sends for each built-in template (template vehicle,
its motor, default launch options, no new option). Probe:
`preset-compare.probe.ts`; result: `preset-compare-250c8f9-vs-9adfd96.json`
(sha256 `5b49dfa10d0da5874fd5e20e1373c1c74409eff3c404013299b6d7af261d92b7`).

| Template | App engine `250c8f9` apogee | Bundle `9adfd96` apogee | Change |
|---|---:|---:|---:|
| Estes Alpha III + Estes C6 | 299.180 m | 298.924 m | −0.256 m (−0.09 %) |
| NASA Student Launch + AeroTech K550W | 533.076 m | 532.844 m | −0.232 m (−0.04 %) |
| Spaceport America + Cesaroni M1820 | 5,013.51 m | 5,175.20 m | **+161.69 m (+3.23 %)** |

Aero panel peak transonic Cd (power off): Alpha 1.2785 → 1.1873 (−7.1 %), NASA
Student Launch 0.7290 → 0.6094 (−16.4 %), Spaceport unchanged. The run manifest
gains `axialDrag` and `thrustPressure` (expected, additive).

The Alpha and NASA Student Launch moves equal the R38 hand-off note (−0.26 m,
−0.23 m), so they are E-1b. The Spaceport move is E-1: R38 and R39 both state
"Spaceport America unchanged" for the app-bound line.

WASM builds (bytes embed build paths, so hashes depend on the build directory):

| Source | Bytes | sha256 |
|---|---:|---|
| `250c8f9`, detached worktree | 2,004,054 | `c93a6ea992dc682b9c3f6898b0f1d92edaa1ec5716f05ca7b65b9ede1f0f1cc2` |
| `9adfd96`, repo root | 2,024,595 | `6cb5c35e562755eb5a00d00ea5e59fd5b19b7e280da40f6fcb8d3db5109049a2` |
| `5c95175` (after the revert), repo root | 2,003,549 | `a273ea06ad8ed82e58f078f60cb743286aaa3791b73ad1bb619fdb1f97fff544` |

The post-revert build reproduces the `250c8f9` numbers exactly on all three
templates (apogee, max speed, max Mach, duration, landing speed, peak Cd).

Rust suites on the merged tree `9adfd96`, run here (2 jobs, 2 test threads):

```text
cargo test --manifest-path crates/astraea-core/Cargo.toml -j 2 -- --test-threads=2
  -> exit 0, 277 passed, 0 failed
cargo test --manifest-path crates/astraea-engine/Cargo.toml --lib --tests -j 2 -- --test-threads=2
  -> exit 0, 168 passed, 0 failed, 19 ignored, 24 targets
```

They pass because the bundle's fixtures were regenerated for E-1 and E-1b
(`drag-cd-scale-parity.json`, `telemetry-parity.json`, `freeform-fin-parity.json`).
Green suites here do not show that the app's defaults are unchanged.

## Disposition

- `9adfd96` (merge, made by an interrupted run of this thread, unreviewed) was
  backed out by the forward revert `5c95175`. Tree after the revert equals
  `250c8f9` (`a350e717a8bf38b3a960338d3d65d55563f65358`). No reset, nothing pushed.
- The checkout's generated `src/engine/astraea_engine.wasm` was rebuilt from
  `5c95175`.
- Reported to the accuracy coordinator thread
  `f239519f-6287-42bc-b932-15167ebbb68c` as a deviation.

## What unblocks the engine part

An app-bound bundle SHA from the accuracy coordinator whose flights with no new
option equal an owner-approved app default, with the proof run against that
engine:

1. base: `frontend/design` (as R38/R39 did), not `accuracy/integration`;
2. content: R42 + R44 + R47, plus E-7 only if they need it; no E-1;
3. E-1b: either left out (default = today's app, `250c8f9`) or taken in its
   approved form `6c5d8da` (Alpha −0.09 %, NASA Student Launch −0.04 %, Spaceport
   unchanged) — an owner choice, because the second shifts two templates;
4. only that lane's own records, not the research tree.

Alternative, owner decision only: accept E-1 into the app as well (Spaceport
+3.23 % by default, against R33's held-out failure).

## Still open

- Frontend side of R42 §5 and R44 §7: not started in `frontend/design`; it can be
  authored against the bundle's option contract in a lane and held.
- Shipped WASM rebuild and built-surface check for the bundle: not done; they
  need the app-bound engine.

## Follow-up, 2026-11-11 (later the same day)

- The accuracy coordinator recorded the return (`accuracy/integration` @ `4b9dd95`,
  `FRONTEND-RETURN-2026-11-11.md`).
- The owner was asked which default the app-bound bundle should sit on (today's
  app engine, that plus `6c5d8da`, or the research engine whole). No choice yet:
  the reply was "Continue". Orchestrator decision meanwhile: request the app-bound
  bundle on **today's app engine** (branch from `frontend/design` @ `5f17db5`, no
  default change), because that is what gate 1 approved and needs no new
  authority. `6c5d8da` stays a separate hand-off; an optional second ref with it
  merged on top was requested so either owner choice can be merged without a
  second round. The owner's choice stays open.
- Frontend lane `accuracy-bundle-frontend` (base `9adfd96`): assignment `0768ffd`,
  author Gate 1 `08b2a15`, orchestrator Gate 1 review `bd39075` (approved with
  amendments). Implementation dispatched to the same author
  (`pi` / `deepseek/deepseek-flash`, thinking max). Not merged; it is held until
  the app-bound engine exists.
- Forwarded to the accuracy coordinator from the lane's Gate 1: the engine's
  `aero_model_status` still says flights are refused for every selection; the
  built-up method refuses the Spaceport America template (fins on the boattail
  transition); the nose tip radius has no effect below about Mach 0.9.
