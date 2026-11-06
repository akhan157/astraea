# RMP07d assignment — calibration/model binding and fail-closed inactive scale

Pinned dispatch base `de6b0df1df7e7cc27119198b7019166022d962e9` (contains the full
RMP12b chain), existing execute-rmp01-package-c80e7d3 / furry-fish worktree.
Coordinator/author installed OpenAI mimo-v2.6-pro/high; independent source-only
review before acceptance; two compiler/test jobs max; one heavy task at a time.

## Purpose and boundary

P0-contract §6 / RMP07-C03: a prior coast calibration multiplier is bound to its
old engine/model/geometry/estimator/conditions and **must not transfer
automatically** to a different provider. Today the app supports only the legacy
flight model and legacy fits apply as before; nothing prevents a silently wrong
transfer once a candidate model exists. Implement the binding mechanism now,
fail-closed and tested synthetically. No candidate selection/activation, no fit
algorithm/eligibility/calibration-policy changes, no physics/default changes,
no schema version bump (additive optional strict field), no core/engine changes.

## Contract fixed before implementation

- `DragFitProvenance.flightModelBinding?: {schemaId, modelId, environmentId,
  mechanicalModelId, calibrationPolicyId}` — five exact string fields, strict
  key set. Stored bindings are parsed leniently as declarations (never as
  supported/activated models) so a foreign-bound artifact still **loads and is
  retained as historical**; unknown models never execute.
- New fits always record the binding via `buildDragCalibration`, derived from
  the selection resolved at fit time. Old records without a binding keep today's
  legacy semantics and are labeled `unverified-legacy`.
- `calibrationBindingStatus(calibration, selection)`:
  `bound` (fields equal), `unverified-legacy` (no binding AND selection is
  legacy), else `incompatible`.
- `activeDragCalibration(project)` returns the calibration only when status is
  not `incompatible`. Dispatch (`captureRunInputs`), design/run identity
  (`designOf`) and UI application all consume the **active** scale only;
  incompatible artifacts stay in the document/history but never reach the
  engine and never join input keys. Absent/explicit legacy behavior and all
  existing keys/results remain unchanged.
- `setDragCalibration` refuses to apply an incompatible-bound calibration
  (throw before state change; Card surfaces the message). Loading/restoring a
  project keeps the artifact untouched — retention, not deletion.
- UI: the applied-calibration panel shows binding state (`bound to <modelId>`,
  `legacy fit; model binding unverified`, or `inactive: bound to a different
  flight model; scale not applied to runs`).

## Lease and evidence

src/application/dragCalibration.ts and its tests; src/application/runInputs.ts
tests (capture unchanged for legacy); src/console/design.ts, src/console/store.ts
(setDragCalibration guard only), src/console/dragCalibration.test.tsx,
src/console/evidence/CalibrationCard.tsx (binding argument + status display);
this run directory; affected package register/index/manifest/tracker/coordination
records. Focused tests + TS + frontend build; real-browser synthetic journey if
UI behavior needs it. Independent review, honest failures, hashes; no push/
release/outreach/paid provisioning/protected outcomes/automation restart.
