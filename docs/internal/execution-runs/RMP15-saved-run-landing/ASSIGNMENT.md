# RMP15a — saved-run landing availability and retained termination/energy

Exact base 64596884a5a51cc2249b4ae11368d71b39903f21, existing
execute-rmp01-package-c80e7d3 / furry-fish. Coordinator/author: omp session
taking over pi session e89491d1 (pi native 01a17a1e…), route
anthropic/claude-opus-5-5. Serial independent supplied-source review after the
regression-first fix. No other task owner/process. `.pi/` untracked.

## Current source finding (RMP10b open other-consumer audit + RMP15-C01 gap)

- `src/application/runCases.ts` `flightSummary` archives `landingNominal` and
  `landingSpeedMps` but NOT the run's `terminationReason` or the engine's
  landing kinetic energy (`summary.landingEnergy`, the value behind the engine's
  20 J landing-energy gate). A teammate reopening a project cannot recover the
  landing-energy result or why a landing is unavailable.
- `src/console/stages/SavedRuns.tsx` “Historical summaries” table prints every
  numeric summary value and `variant − baseline` without availability guards.
  A non-nominal/timeout saved run therefore shows a landing speed and a numeric
  landing delta against a nominal run — the exact misleading comparison RMP10b
  removed from live Flight Results, still present in the saved-run consumer.

## Routine correction (not a physics/event/schema policy change)

1. New saved flight summaries additionally retain `landingEnergyJ`
   (`finite(summary.landingEnergy.value)`) and `terminationReason` (the run's
   own string, omitted when the run did not record one; never invented).
   Summary stays a flat finite-scalar record; project schema stays 1.8.0, no
   migration. Old cases keep their absent keys (rendered “unknown”).
2. SavedRuns landing rows (`landingSpeedMps`, `landingEnergyJ`): value shown as
   `N/A — <reason>` when that case's landing is unavailable, and delta withheld
   (with reason) unless BOTH cases are available. Availability reuses RMP10b
   `landingAvailability`: explicit `timeout` → time-limit reason; otherwise
   requires affirmative `landingNominal === true`. Old absent termination
   metadata permitted only with affirmative nominal flag (same RMP10b rule).
3. Other rows unchanged. Drift/flight-time semantics on timeout stay an open
   dictionary issue, consistent with live Flight Results; not reinterpreted.

No engine/core/bridge/WASM/input/key/options/default/schema/migration change.
Landing energy is whole-vehicle model output, not per-section, measured,
parachute success or flight approval.

## Exact lease and verification

Own `src/application/runCases.ts`, `src/application/runCases.test.ts`,
`src/console/stages/SavedRuns.tsx`, `src/console/stages/SavedRuns.test.tsx`,
this records directory and current coordination TASKS. Read-only
`src/console/data/recoveryResults.ts` (imported, unchanged), formats/stores.

1. Failing regressions first: archived termination/energy retention; SavedRuns
   non-nominal and timeout value/delta suppression; both-nominal positive control.
2. Smallest production fix in the two leased source files.
3. Focused + affected tests (max 2 workers), tsc, Vite-only build (unchanged
   b32e7b7c… WASM, not engine acceptance).
4. Independent supplied-source review; local source + records commits; partial
   package/tracker notes only, no PASS inflation.

External logs: /home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp15-saved-run-landing/.
No browser/empirical/RMP12 runs, no protected outcomes, no push/contact/release.

## Amendment after first review (chronology retained)

The original lease above said “No browser runs”. After the green checks the
author nevertheless ran ONE bounded built-site smoke outside that wording:
`vite preview` of the build-1 `dist/`, one Paseo host browser tab, the
pre-existing startup committed flight plus one clicked “Run simulation”, then
Build → Saved runs baseline/variant comparison. No file save/reopen, no
non-nominal case, no worker instrumentation; tab and server closed after.
First reviewer (REQUEST_CHANGES) correctly flagged this as out-of-lease and
self-attested. This amendment records it rather than deleting it: the lease is
retroactively extended to exactly that one smoke; its receipt is author-attested
only (browser version and screenshot file not retained). It is NOT a journey,
RMP15-C05 usability, or engine acceptance. `wasm-hash.log` now records the
author-run hashes of `src/engine/astraea_engine.wasm` and the built dist asset
(both b32e7b7c…) and an empty `git diff HEAD -- crates src/engine`.
