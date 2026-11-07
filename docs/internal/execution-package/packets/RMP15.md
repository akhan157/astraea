# RMP15 — Product journeys, preservation and interoperability

## Purpose/status

EARLY journey design ready; changed-provider journeys require integrated experimental paths and exact built site.

[RMP15a](../../execution-runs/RMP15-saved-run-landing/RESULT.md), source 041a8fc: saved flight
cases retain landingEnergyJ/terminationReason (absence stays absent); Saved runs
withholds landing values/deltas unless both cases report nominal touchdown (RMP10b
rule). Review REQUEST_CHANGES (evidence/lease) → ACCEPT. C01 progress only; no
schema change, no journey/usability/native acceptance. [Evidence](../../execution-runs/RMP15-saved-run-landing/EVIDENCE.json).

[RMP15b](../../execution-runs/RMP15-saved-run-events/RESULT.md), source 65ef81e: project schema
1.9.0 retains each saved flight's exact recorded event timeline (strict parser,
identity migration, older-schema injection refuses); Saved runs shows it
read-only with disclosures. Review ACCEPT. C01 progress only. [Evidence](../../execution-runs/RMP15-saved-run-events/EVIDENCE.json).

[RMP15c](../../execution-runs/RMP15-failure-recovery/RESULT.md), source 75c9ea4: failed saves,
opens and imports state what is preserved and the next step. Review
REQUEST_CHANGES → ACCEPT; **RMP15-C02 PASS** for current legacy model/import
paths; new provider/import/environment paths must re-show it. [Evidence](../../execution-runs/RMP15-failure-recovery/EVIDENCE.json).

[RMP15d](../../execution-runs/RMP15-lifecycle/RESULT.md): lifecycle tests (edit during run,
ensemble restart) plus cited guards; review ACCEPT; **RMP15-C03 PASS** for current
legacy paths. [Evidence](../../execution-runs/RMP15-lifecycle/EVIDENCE.json).

[Qualified archive correction](../../execution-runs/RMP10-qualified-output-archive/RESULT.md),
source `f082b67`, author-independent coordinator ACCEPT: schema 1.11 retains
canonical per-output qualification and flags; old summaries remain unqualified.
Built Chromium under production CSP proved an actual 9,584,081-byte two-flight
save/open/save byte-exact and real three-flight ZIP trace/archive consistency.
Zero/unavailable and 1.10 legacy presentations exercised with labeled synthetic
fixtures. Fixed normal producer files exceeding the old import cap: native
project save/open/export share 64 MiB, foreign imports stay at 8 MiB; safe
refusal, no truncation. C01 remains in progress for other provider/environment
and interoperability journeys; this is not physical/usability qualification.

This is a future dispatch brief. Current session is packaging only: no engineering, builds, simulations, outcome reads or automation restart.

## Prerequisites (closure versus early work)

- Reuse completed complete-dispatch-input archives and actual executed-WASM provenance; extend rather than redo that work.
- Changed model/import/environment journeys depend on RMP03/RMP07 and applicable RMP01/RMP06 integration.
- Browser acceptance requires the exact newly built site and permitted representative files; native OS acceptance remains RMP16.

## Required reading

- STOP/migration handoff (private coordination notes)
- [Full roadmap](../../roadmap-to-collegiate-1.0-2026-10-26.md)
- Model routing (private coordination notes)
- [Completed archive/provenance checkpoint](../../delivery-review-2026-10-25-repro.md)
- Reproducibility run record (private coordination notes)
- [Prior delivery evidence](../../delivery-review-2026-10-25.md)
- [Output/claim audit](../../accuracy-program/diagnostics/collegiate-output-contract-audit.md)
- [Existing project boundary](../../../../src/formats/projectJson.ts)

## Files owned/prohibited/shared leases

- Existing `src/formats/`, `src/state/projectIo.ts`, project state/history and `src/engine/` only under explicit per-file leases.
- CREATE `docs/internal/execution-package/evidence/RMP15/` for scenario matrix and sanitized exact-built-site receipts.
- Shared leases: model DTO/project migration with RMP07, imports with RMP03, worker/output contracts with RMP10; no concurrent schema edits.
- All proposed CREATE paths require dispatch-time existence/ownership check; preserve unrelated dirty work and negotiate shared edits sequentially.

## Frozen decisions

- Complete dispatch inputs and actual executed engine identities already exist; summary-only historical runs stay unreconstructable.
- Saved/exported records expose effective model/environment/input/qualification and preserve original identities across reopen/export.
- Unsupported geometry/material/overrides must refuse or disclose loss; a lossy round trip cannot silently pass.
- Do not make default low-TWR/landing-energy examples green by weakening physics/constraints; explain or replace defensibly.

## Ordered implementation/review substeps and commit boundaries

1. Commit 1: trace completed archive/provenance fields through each new provider/import/environment path and list actual extension gaps.
2. Define journeys build/import, edit/undo, select experimental model, run/ensemble/cancel, variant comparison and save/reopen/share/export.
3. Commit 2: implement smallest boundary/preservation repair per coherent file lease; keep old document fixtures and engine identities.
4. Exercise malformed/untrusted imports, service loss, failed saves, pending worker/concurrent tabs and migration failures.
5. Commit 3: add focused behavioral coverage for actual new risks and representative permitted vendor/telemetry units/time/datum handling.
6. Build exact changed site once prerequisites available; run actual browser journeys at intended desktop sizes with keyboard/error recovery.
7. Commit 4: inspect saved/exported artifacts for full effective inputs, actual model/WASM/environment and honest unsupported/qualification states.
8. Review dependency/licensing/untrusted-file/native permission boundaries and prepare RMP16 platform-specific residual checklist.

## Input/output contracts and source fields

- Input: pre/post schema/version/hash, exact provider/import/source/environment identity, old document fixture and complete run dispatch.
- Journey record: browser/OS/version/viewport/build hashes, steps, user-visible status, worker/cancel completion and save/export identities.
- Telemetry: permitted file provenance/rights, channel units/timebase/altitude datum, measured versus derived/simulated label.
- Output: preserved old documents and new path archives, actionable errors, no stale result promotion and explicit losses/limits.
- Historical test results attach to their recorded artifact; current built-browser evidence needs current site/WASM identity.

## Acceptance checks

| ID | Mechanism | Pass condition | Evidence |
| --- | --- | --- | --- |
| RMP15-C01 (Archive extension) | save/reopen/export changed provider/environment run | complete effective inputs and executed identity retained; old records preserved | artifact field/hash comparison |
| RMP15-C02 (Failure preservation) | malformed import/save fail/migration conflict/pending worker | no data loss or stale result; actionable recoverable status | focused results and recovery receipt |
| RMP15-C03 (Lifecycle) | run/ensemble/cancel and concurrent edits/tabs | late workers cannot overwrite new state or mislabel result identity | browser/state trace |
| RMP15-C04 (Interoperability) | permitted representative import/export/telemetry round trip | units/time/datum and geometry losses correctly handled | fixture rights and field comparison |
| RMP15-C05 (Usability) | exact built site keyboard/offline/error journeys | intended tasks understandable and limits visible on supported sizes | build-linked browser receipts |

## Negative/failure cases

- Existing engine tests do not establish Windows Edge, native Safari or actual desktop dialogs; Linux WebKit does not certify them.
- Network/service failure or unsupported override cannot silently discard source features or replace the chosen model.

## Exact permitted checks or required prerequisites

- Future prerequisites: declared Node/pnpm and locked local dependencies, permitted fixtures and reviewed new model build inputs available.
- Focused existing suites: `node node_modules/vitest/vitest.mjs run src/formats/projectJson.test.ts src/state/projectIo.test.ts src/engine/pool.test.ts`.
- `pnpm build` changes engine/site artifacts; execute only in resumed authorized engineering after exact-source review, then record all hashes.
- `pnpm test:browser` is existing browser harness; inspect its server/artifact prerequisites and ensure it targets that exact new site before running.
- Commands above are future resumed-work checks unless explicitly read-only packaging checks; this package records no new executions.

## Evidence to save

- Save prior/new schema and archive identity comparison, focused failure receipts, actual browser build/viewport/runtime identities and workflow recordings.
- Save representative fixture rights, dependency/permission review, remaining native-platform gaps and reviewer disposition.
- Record pinned base, owner/model/effort, exact commands/exit status, source/input/artifact hashes, review disposition, limitations and next action.
- Historical external logs/binaries may be unavailable; identify missing artifacts honestly and never count retained hashes as fresh execution.

## Escalation/stop decisions

- Stop on data loss/stale results or ambiguous identity; isolate smallest repair rather than continue collecting happy-path screenshots.
- Missing browser/native environment is a precise external blocker; do not infer acceptance from compilation.
- Preserve defaults/main and stopped automation; no external contact, holdout access, paid/remote operation or publication is implied.

## Successor/ready-made agent assignment prompt

RMP16 installed-platform journeys; RMP17 independent team use; RMP18 product/preservation claims.

> Extend completed input archives and executed-WASM provenance to new model/import/environment paths. Own explicitly leased product boundary files; verify real save/reopen/undo/cancel/error/interoperability journeys on exact new built site. Preserve old identities, explain unsupported limits and hand native gaps to RMP16.
> Before work pin current integration base, inspect dirty state/active runs, name exact leases and resource budget, and retain completed evidence. Independent material-science/convention review is required where applicable.
