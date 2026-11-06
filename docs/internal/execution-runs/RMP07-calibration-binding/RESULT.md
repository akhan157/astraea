# RMP07d — accepted calibration/flight-model binding (fail-closed inactive scale)

Pinned dispatch base `de6b0df1df7e7cc27119198b7019166022d962e9`; this increment
adds the P0-contract §6 / RMP07-C03 mechanism that keeps a coast-fitted drag
scale from silently transferring to a different flight model. No candidate
selection/activation, no fit algorithm/eligibility/calibration-policy/physics/
default changes, no schema bump (additive optional strict field), no core/engine
changes. Legacy behavior and all existing keys/results are byte-preserved.

## Delivered

- `DragFitProvenance.flightModelBinding` — five exact non-empty string fields,
  strict key set. Stored bindings parse as **declarations only**: a foreign-bound
  artifact still loads and is retained as project history, never executable or
  activatable. Malformed bindings (null, wrong shape, extra key, empty string)
  fail closed at parse.
- New fits record the binding from the selection resolved **at fit time**
  (`FitState.flightModel`); the fit-staleness key folds in the selection, so a
  selection change stales the fit and blocks apply. Apply and the already-applied
  comparison use the fit-time binding, never the apply-time selection.
- `calibrationBindingStatus`: `bound` / `unverified-legacy` (no binding + legacy
  selection; honest name for records that predate binding) / `incompatible`.
  Forward rule: no binding + non-legacy selection is incompatible.
- `activeDragCalibration` gates every consumer: dispatched scale
  (`captureRunInputs`), run identity (`launchCaseInput` via `designOf`), and the
  UI. Incompatible artifacts stay in the document but never reach the engine,
  never join input keys (verified key-identical with/without the artifact), and
  never appear in archived run inputs.
- `setDragCalibration` refuses applying an incompatible-bound fit before any
  state change (whole-project identity unchanged); loading/restoring keeps the
  artifact untouched — retention, not deletion.
- The calibration panel states the binding (`bound to <modelId>` / `legacy fit;
  model binding unverified`) and, for incompatible artifacts, an explicit
  inactive note; the "Drag calibrated" chip is suppressed and "remains applied"
  wording becomes "is inactive for the current model".

## Verification and review

- **279 tests / 18 affected files pass** (66 in the four focused files),
  including: binding recorded + Save/Open round-trip; well-formed foreign
  binding retained but inactive end-to-end; malformed bindings refused; foreign
  scale never dispatched/archived while legacy fits dispatch unchanged;
  `currentRunKey()` byte-identical with/without a retained incompatible
  artifact; dispatched record excludes it; apply refusal with zero state change;
  legacy records/keys unchanged. TypeScript clean; Vite production build passes.
- One test failed during development (a minimal cast fixture rejected by
  `writeProject` validation); the round-trip test moved to the full-record
  generator's file. No product behavior changed to make it pass.
- Independent source review: REQUEST_CHANGES (identity-key leak; apply-time
  binding) → fixes → **ACCEPT**. [REVIEW](REVIEW.md) keeps both rounds.

## Scope and limits

This is a mechanism gate, not scientific evidence: it prevents silent scale
transfer once another model exists; it does not validate any fit or model.
Only the legacy selection exists in the app today, so the incompatibility paths
are exercised synthetically. RMP07-C03 remains **in_progress** (this closes the
migration/transfer mechanism; full calibration non-leak across every consumer
and candidate exposure remains open). No candidate status UI, no migration
difference report, no default change. Local commits only; nothing pushed.

## Next

Continue RMP07: consumer-consistency/status work (C04/C07) and explicit
migration difference reporting, or the next reviewed numerical experiment for
the knot-split policy across regimes. Default-policy changes still require
broader RMP08–10 evidence and RMP05 decision budgets.
