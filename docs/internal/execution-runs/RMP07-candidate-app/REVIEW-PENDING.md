# RMP07 candidate app — review pending

Coordinator-owned independent review is required. The author did not write
`REVIEW.md` or accept any check.

Suggested review focus, with evidence in `RESULT.md` / `EVIDENCE.json`:

1. **Schema/version gates:** 1.12 migration, 1.11 flightOutputs retention,
   candidate fields rejected before 1.12, v3 inputs exact-key validation,
   candidate result archive strictness and nullable semantics.
2. **No DTO evasion:** `isMotorMount`/`assignedMotorId` remain in the exact
   request; flagged mounts fail preflight; the synthetic supported geometry is
   imported as an ordinary project; no preset simplification.
3. **One projection:** candidate output IDs/availability used by Flight, Saved
   Runs and Build trace; no legacy PASS, zero-fill or apogee relabel.
4. **Consumer boundaries:** preview/ensemble/legacy aero/stability/copilot/
   calibration/moment-arm/KML/query refusals are reached at action boundaries,
   not only disabled UI.
5. **Persistence:** undo/redo retains candidate cases; load saved inputs does
   not auto-run; two-tab/save failure behavior remains the existing revision
   guard; tampered import leaves the document.
6. **Actual bytes:** rebuilt WASM SHA/bytes and the production-CSP browser
   journey; no historical receipt transferred.

Retained external evidence is under `/tmp/rmp07-candidate-evidence/` (not in
Git). The transient browser script is not committed. Historical proposal and
gate documents are unchanged. Coordinator may accept, amend, or return one
focused rework in the same lane.

## Correction rework (current)

The coordinator's F1–F5 review is retained verbatim at `REVIEW.md` (SHA-256
`a8bed25297f6b1db6a23b0bd9da1269a65779be5585e83c782ed9ad190e25932`). The
author correction is in `99f2a56` and `59e5566`; current checks and durable
receipts are in `RESULT.md` and `EVIDENCE.json`, with the new evidence under
`../evidence-rmp07-candidate-app/rework-2026-10-29/`.

Independent verification should focus on:

1. F1 parser/context relationships and forged report/archive schemas; targeted
   coordinator-probe mutations are now failing tests.
2. F2 pre-await admission, deferred preparation, duplicate activation, and
   cancellation during preparation/dispatch; browser receipt records exactly
   one candidate worker post for two synchronous activations.
3. F3 selected-vs-recorded attribution in Mission/Verify/Aero/preview/Build,
   header/sidebar and Model status. The corrected browser proof includes a real
   legacy run before candidate opt-in.
4. F4 detached/frozen capture and F5 exact canonical freshness across the shared
   header/Flight/Build boundary, including the forced key collision.
5. Actual rebuilt WASM/site bytes, production CSP, save/reopen/load/rerun,
   stale import and normal-horizon cancellation. `curveMatchesReferenceSample`
   remains false and is not an app display bug; the engine limitation stays with
   the engine owner.

Not accepted by the author; no register/manifest/TASKS/handoff edit.

## Supplement correction (current)

`REVIEW-SUPPLEMENT.md` is retained verbatim (SHA-256
`b9b695a9c7c7c54cb12a379edc58f1d5141befe216204e9c75b7d4f01d30fe7d`).
Source correction: `3ed90bb`; project schema is back on the approved `1.12.0`
with only `1.11.0 -> 1.12.0` migration. The prior 1.13 bump is retracted and
its raw receipts remain historical.

Focus for independent verification:

1. F1 retained final `positionM`/`velocityMps`/flags equality with
   `finalState`/`finalFlags`; exact declared retention count below/above the cap.
   Do not attribute unretained event-adjacency proof to decimated archives.
2. F2b: real command-palette Monte Carlo refusal on a candidate selection must
   preserve active Run-disabled/Cancel/token/busy and dispatch exactly one mass
   and one candidate call. Browser receipt is in
   `../evidence-rmp07-candidate-app/supplement-2026-10-29/`.
3. Actual 1.12 candidate receipt accepted; actual 1.12 final-sample and
   omitted-context negatives refused while the open document remains.
4. Rebuilt WASM/site bytes, production CSP, save/reopen/load/rerun, F3 legacy
   suppression and normal 2 s/0.01 s cancellation.
5. `curveMatchesReferenceSample=false` remains an engine observation for the
   engine owner; no app workaround.

Not accepted by the author; no register/manifest/TASKS/handoff edit.
