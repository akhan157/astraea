# RMP15a — saved-run landing availability and retained termination/energy

Source 041a8fcd71964f9fa876bbab6a7bc132a4d6e22a, base 64596884a5a51cc2249b4ae11368d71b39903f21. First review REQUEST_CHANGES (evidence/lease
only), records rework, rereview ACCEPT. Parent RMP15 and RMP10 remain partial.

## Delivered bounded correction

- `withRunCases` flight summaries now also retain `landingEnergyJ`
  (finite model landing kinetic energy, null when non-finite) and
  `terminationReason` exactly as the run recorded it; omitted when the run
  recorded none. Flat finite-scalar summary; schema 1.8.0, no migration. Old
  saved cases keep absent keys (rendered “unknown”).
- Saved runs “Historical summaries”: `landingSpeedMps` / `landingEnergyJ`
  values render `N/A — <reason>` when that case's landing is unavailable, and
  the delta is withheld with a reason unless both cases are available. Rule is
  RMP10b `landingAvailability` unchanged: explicit timeout → “run stopped on its
  time limit”; otherwise affirmative `landingNominal === true` required (an old
  record without the flag is not a touchdown). Closes the SavedRuns part of the
  RMP10b open other-consumer audit. Other rows/deltas unchanged; unlike-kind
  rows still `—`.

No engine/core/bridge/WASM/input/key/options/default/schema change. Landing
energy is whole-vehicle model output, not per-section, measured, parachute
success or approval. Drift/flight-time meaning on timeout remains an open
dictionary item (unchanged, consistent with live Flight Results).

## Verification (external evidence root, see RAW-ARTIFACTS.json)

- before-fix.log: runCases+SavedRuns 3 fail/14 pass — missing landingEnergyJ,
  missing terminationReason (UI non-nominal/timeout assertions in that test were
  not reached pre-fix), and the old-record test showing the actual pre-fix
  defect: unguarded `7.1` value and `2.00000` delta for a case without a nominal
  flag.
- focused-1.log 17/17; affected-1.log 63 files/717 tests
  (src/application, src/console, src/formats, src/state; 2 workers); tsc-1
  clean; build-1 Vite pass; git diff --check clean.
- wasm-hash.log: src and dist WASM both b32e7b7c…; empty diff in crates/src/engine.
- browser-smoke-1.json: ONE bounded built-site smoke (out of original lease,
  see ASSIGNMENT amendment): real WASM startup flight + one clicked run; Saved
  runs comparison showed retained landingEnergyJ 196.818726090029 and
  terminationReason touchdown for both, numeric deltas for both-nominal.
  Author-attested; no save/reopen, non-nominal case, or worker instrumentation.

## Remaining scope

RMP15-C01 progress only (saved recovery-relevant scalars). Full saved
trajectory/event retention, read-only historical plots, new-provider/import/
environment archives, C02–C05 journeys and native platforms remain open.
Nonblocking reviewer limits retained: unguarded landingEnergy access,
timeout-only reason mapping, untested both-unavailable reason precedence.
No push/release/team/physical acceptance.
