# Repair design — review return 1 (bounded repair, Gate 1 approved)

Pin at start of repair: `ed3ad0c` (source identical to reviewed pin `7845dec`; only
`REVIEW-RETURN-1.md` differs). Author: DeepSeek V4.1 Flash via `pi` (routing.md fallback; no model
change). This note is written **before** any source edit. Scope is exactly findings 1–5; no schema
bump, no `crates/` edit, no physics, no merge/push, no board/register/manifest/handoff edits.

## 1 — P1 `runInputs.ts`: shared derivation (write side)

Mechanism: `captureRunInputs` builds the archived `engineOptions` from one source,
`flightRunOptions(project.vehicle)`. `launchAltitudeASL` keeps its historical `?? 0` pin so a
site-less vehicle's archive bytes stay as before; the three new option keys are spread exactly as
the bridge derives them (present only when the vehicle owns them) and override any caller-supplied
value, so the archive cannot disagree with the dispatched request. Ensemble captures use the same
function.

Falsifier: an opted-in vehicle archived without `engineOptions.flightDragSource`, or a save→open
that loses it, means the archive is not the invocation. Regression asserts flight and ensemble
captures and their save→open round-trip retain `flightDragSource`; a default vehicle's archive and
full saved document remain byte-identical (existing goldens plus a no-key assertion).

## 2 — P1 `projectJson.ts`: strict presence+value on import

Mechanism: `validateRunInputs` computes `flightRunOptions(vehicle)` once. For each of
`launchSiteTemperatureC`, `nozzleExitDiameter`, `flightDragSource`: if the vehicle derives it, the
archive must carry it and the value must equal the derivation (type-checked first); if the vehicle
does not derive it, the archive must not carry it. This rejects deletion, wrong values and
unexpected options. Documents with no opt-in (and all older documents) derive nothing, so they are
unchanged and stay loadable.

Falsifier: delete an archived derived key, alter its value, or add a key the archived vehicle does
not own; each must throw. A default document must still round-trip byte-for-byte.

## 3 — P2 `runCases.ts` / `SavedRuns.tsx`: archive and show the engine's own line

Mechanism: for a flight/ensemble record whose *archived* inputs carry the drag opt-in, the case
summary gains `axialDrag` copied verbatim from the recorded run's `manifest.axialDrag` (flight) or
`dispersion.axialDrag` (ensemble). Nothing is written when the opt-in was not archived or the
engine reported no line, so default documents are unchanged. Import validation accepts
`summary.axialDrag` only as a non-empty string on a case whose archived legacy inputs opt in, and
requires it for such a case (this build's engine always emits the line for an opted-in run) —
deletion is refused. `SavedRuns` displays the archived string verbatim with the shared refusal
prefix when the archived string records a refusal; it never asks the current engine and never
re-derives the refusal from requested options alone.

Falsifier: an opted-in flight archive without the engine line, a line fabricated from request
options, a line shown for a default run, or a line lost/recomputed after reopen. Regressions cover
flight and ensemble archives, default absence, import deletion/forgery and the saved-run display.

## 4 — P2 `adapter.ts`: flight-specific Basis, panel confidence untouched

Mechanism: `aeroConfidence` stays byte-identical for the panels. `toFlightRun` uses a new
`flightAeroConfidence` that, when the vehicle opted in, describes the **dispatched flight physics**
from the recorded engine line: built-up axial drag at every Mach number when the engine used it, or
"requested, engine refused, legacy drag flown" when the recorded line shows the refusal (the same
one permitted prose check, `builtUpDragWasRefused`). Lift/stability remain legacy; calibration, if
applied, keeps the `calibrated` label and appends its existing scale note. The reason is archived
with the canonical output dictionary as before.

Falsifier: an opted-in flight whose apogee Basis still claims the panel-only hybrid override, or a
refused shape whose Basis claims the built-up drag flew. Regressions cover a used and a refused
flight, the unchanged panel text, and the archived reason after save→open.

## 5 — P2 `bridge.ts`: shared admission for committed flight and ensemble; preview ungated

Mechanism: one shared rule (`application/flightAdmission.ts`, text unchanged from the approved
string table) decides: drag opt-in ⇒ a usable built-up selection required (R-2/R-3/R-4); a
selection without the opt-in ⇒ the existing legacy-path refusal (R-1). The store keeps its pre-run
gate, and the bridge now enforces the same rule as the last gate for `simulateFlightRecorded`
(committed flight; `aeroModel` is app-side only, never a wire option) and for all four ensemble
entry points via a new optional `aeroModel` argument. `adapter.runFlight` forwards its `aeroModel`
to the bridge; `adapter.runMonteCarlo`/`McRunInput` and the store pass the selection for chunks.
`previewFlight` is deliberately left without the gate (row 2/3 preview behaviour unchanged).
Direct consumers inspected: store flight/MC, adapter flight/MC, CalibrationCard fit flight (blocked
while the opt-in is on; no selection passed), live preview (ungated), smoke and research harnesses
(no opt-in vehicles).

Falsifier: an opted-in vehicle without/with a defective selection dispatching a committed flight or
ensemble through the bridge, a selection-only flight dispatching, or a preview refusing. Regressions
exercise all of these plus the adapter forwarding.

## Evidence plan

Focused vitest files only (`--maxWorkers=2`), `tsc --noEmit` for new type errors (14 pre-existing
research-harness errors remain). New regressions are named `return1:` and are first run in a
throwaway worktree at `7845dec` to show the failure, then on this tree to show the pass. Logs go to
the existing external evidence dir (`repair/`), never the repo. `free -h` before each run; stop
under 2 GiB available.
