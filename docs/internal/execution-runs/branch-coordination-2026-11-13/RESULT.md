# Branch coordination into main — 2026-11-13

Owner instruction (2026-11-13): "finish coordinating branches into main and then
settle those threads". Coordinator: Claude Opus 5.5 (coordination thread). Local
merges only. Nothing pushed: a push to `main` triggers `website.yml` (Cloudflare
Pages deploy), which needs a separate owner authorization.

## Merges

| Step | Commit | Content |
|---|---|---|
| Walkthrough into frontend line | `4781e72` (lane `integrate/main-closeout`, base `efd8972`) | `t3/app-walkthrough-test-plan` @ `a534d60`: accepted fix lanes number-field, blueprint-export, motor-polish, polish-a, polish-b, run-persistence steps 1-2 |
| `frontend/design` | fast-forward `efd8972` -> `4781e72` | |
| `main` | `29a5657` (`--no-ff`, parent `35aa28a`) | tree identical to `4781e72` |

Conflicts resolved by the coordinator: `src/console/stages/SiteEditor.tsx` keeps both
the 0-20,000 m altitude range check and the temperature commit (tests for both in
`siteAndTelemetry.test.tsx`); the root lane-record `RESULT.md` keeps both sides.

Checks on the merged tree (`4781e72`): `pnpm build:engine`, `tsc --noEmit`,
`vitest run --maxWorkers=2` 180 files / 2122 tests, `vite build`, all exit 0.

## Branches deliberately not merged

| Branch(es) | Disposition | Source |
|---|---|---|
| `r1` `r3`-`r10` `r15` `q1e5` `p3` `t3/r24` `t3/r25` `t3/r26` `r30` `r38` `r39` `appbound/r42-r44-r47` | Diagnostic or research lanes: findings already imported as records on `accuracy/integration`, which is the research line. Never merged into the product line by design. Branches kept. | `accuracy/integration:docs/internal/accuracy-research/HANDOFF.md` |
| `accuracy/integration` (`c94568f`, 8 docs commits) | Research home; `frontend/design` removed research records at `8e930cd` by agreement. Not merged. | same HANDOFF, "Branch layout" |
| `accuracy-bundle-frontend` (`df5be86`) | Superseded: its code commits are patch-equivalent in the frontend line, and its test pin matches it. The unique commits are lane records only. Branch kept. | `git cherry` |
| `p2/mc-rail-clamp` | Already contained. | |

## Still open (not claimed)

In the walkthrough thread, to resume when the author route (GPT-6.1 Terra medium) comes back after its usage limit:
persistence step 3 (`fix-run-persistence` @ `af43d61`, unreviewed), persistence step 4
(labelling reopened results), and the engine float-roundtrip lane
(`fix-engine-float-roundtrip` @ `022ab9e`, based on `accuracy/integration`; product use
needs owner OK). When they are accepted, their merge into `frontend/design` and `main`
goes through this coordination record.

No acceptance-register change; no author self-acceptance; no push, tag or release.

## Second pass — 2026-11-13 afternoon

| Step | Commit | Content |
|---|---|---|
| Help-text fix | `222e857` | `Flight.tsx` again says "altitude and temperature in Mission": the merged Mission `SiteEditor` has a temperature field (flagged by the walkthrough coordinator) |
| Walkthrough step 3 | `0386d06` | `t3/app-walkthrough-test-plan` @ `8726f8f`, reported "ready for main" by the walkthrough coordinator: auto-restore accepted after review fixes and a built-app reload check; step 4 verified, no code |

Merged-tree checks: `pnpm build:engine`, `tsc --noEmit`, `vitest run --maxWorkers=2`
182 files / 2135 tests, `vite build`, all exit 0.

All walkthrough UI findings are now in `main`: 28 fixed, 1 won't fix (owner decision, Ctrl+Q). The one
remaining item is the engine float-roundtrip lane on `accuracy/integration`. It reaches the app only
with an owner OK after its before/after numbers are reported. That is an owner gate, not open
integration work.

## Third pass — engine float-roundtrip fix (owner OK 2026-11-13: "move just this fix")

Only `022ab9e` was cherry-picked (`-x`) from `accuracy/integration` (`dd38088`). No other research
engine change came along. The fix enables serde_json `float_roundtrip` in `astraea-core` and
`astraea-engine`, and adds a Rust test, a fixture and an app request-path test. The app test was
re-typed for the frontend line's Node shim; its logic is unchanged.

Checks on this line, run by the coordinator:
- Falsifier: with the old `Cargo.toml` files, `src/engine/candidateFloatRoundtrip.test.ts` fails
  with `motor aft station must lie within the declared vehicle length`. It passes with the fix.
- Output identity: walkthrough probe (`numeric-probe/probe.test.ts`, simulateFlight plus a seeded
  8-run ensemble for the Estes, NASA and Spaceport presets). Old WASM `805b91a6…` vs fixed WASM
  `15c67cc9…`: 390,264 values, 0 differing.
- `cargo test` for both crates (`-j2`, 2 threads), `pnpm build:engine`, `tsc --noEmit`,
  `vitest run --maxWorkers=2` 183 files / 2136 tests, `vite build`: all exit 0.
- Not run: ARCAS benchmark, browser smoke.

Engine file identity changes (local build `15c67cc9…`). The walkthrough lane notes that WASM
hashes differ across build folders for the same source, so identity records that rely only on
that hash are weak.

## Fourth pass — main closeout (control session, 2026-11-13)

`main` `5c85b84` → `6560dd7` (local, not pushed). Three reviewed lanes: dispersion `axialDrag`
render guard (`d5b0b48`), 1280 Flight layout (`160ca58`), restored motor lost on reload/file open
(`6560dd7`). The last two were exposed by the first full browser smoke since the walkthrough merges.
ARCAS, built-app checks of the merged walkthrough fixes, and the full browser smoke now pass.
Details: `docs/internal/execution-runs/main-closeout-2026-11-13/RESULT.md`.
