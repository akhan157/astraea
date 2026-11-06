# RMP07c — accepted archived assumptions and exact input difference report

Base `dc3d890b668b6aba9498150890de4d202090a1bf`; source
`51e9603cc763a3b1329ace7e5eff8c17153fa94f` on the existing branch/worktree.
This is a read-only, useful end-to-end extension of the saved-run workflow,
not a substitute for trustworthy core predictions or completed Version1.

## Delivered and observed

Saved runs now expose their actual archived model/environment/mechanics/policy
selection, invocation altitude/surface wind/time step/main deployment/drag scale,
motor provenance, analysis override and actual ensemble method/count/seed. Version1
is explicitly legacy-implied with original declaration absent; summary-only
histories keep model/assumptions unknown. No current defaults/catalog/weather are
substituted for a missing historical input. Original input keys are correctly
identified as legacy freshness keys, not cryptographic checksums.

Baseline/variant inspection reports exact structural archived input differences,
including same-label edited motor curves, geometry/mass/recovery/options/mechanics/
sampler values. It separates invocation/analysis values from model declarations,
calibration artifacts and retained context/source provenance. Weather profiles
and requested ensemble settings are not misrepresented as the actual consumed
legacy surface-wind/sampler inputs. Calibration provenance differences are not
confused with a changed applied Cd scale. Legacy global powered/coast adjustment
and unknown present applicability remain explicit, not new physical qualification.

Object key order does not matter; array order and missing/null/zero do. Relevant
values are compared directly, not by caller labels or 32-bit hashes. Rows are
bounded at100 per group, long cells at512 characters, with explicit remaining
counts/truncation disclosure and full original archives retained in project
export. Reports infer neither causation nor physical accuracy. Flight/ensemble
scalar deltas are suppressed when run kinds differ. Historical scalar values,
actual invoked-buffer identity, load/undo behavior and all stored archives remain
unchanged; no implicit execution, recalibration or migration occurs.

## Fresh verification and review

- **253 tests /16 affected files pass**, including15 pure helper tests and two
  additional renderer tests, plus the previous archive/schema/persistence/async/
  worker-identity/generated-WASM checks. This is not an all-frontend/scientific run.
- TypeScript passes; Vite production rebuild passes. No schema/calibration/core/
  engine/worker/default/lock or freshness-key source changed.
- Actual Chromium156.0.8078.4 under the exact rebuilt production CSP passes the
  synthetic persistence/unsupported-import/v1-restore/v2-rerun journey plus opened
  assumptions and model-declaration difference interaction. Archived old/new model
  metadata and legacy global scale semantics are visible; report interaction
  leaves stored bytes unchanged. No external request or page runtime error.
- The existing local legacy WASM was deliberately reused and remeasured, **not
  rebuilt or changed** in this increment. Its source/built/fetched/case invocation
  SHA256 remains `b971b222d7e3df8c10ff268a3a540effc847adc209b6e52b8d5a0b2b08898337`.
  New frontend/site hashes are recorded separately in [EVIDENCE](EVIDENCE.json).
- Serial independent source-only review: **ACCEPT**, no material issue.
  [Review](REVIEW.md) distinguishes author-executed checks from reviewer reasoning.

## Retained failures and scope

First typecheck found a synthetic weather test using an undeclared `profile`
shape. Corrected it to the existing `WindLayer[]` DTO; no schema was guessed or
expanded. First browser attempt had a selector matching both a summary and a
hidden table caption; scoped to the actual summary before clicking. Both failed
logs remain local. No product assertion was relaxed.

C02's prior legacy preservation PASS remains supported. C07 is **in_progress**
for existing-legacy model/assumption/unknown reporting only, not full computational/
domain/quantity qualification of a new provider. C08 has fresh exact built-byte
reporting evidence but remains in_progress for the full offered-candidate path.
C01/C03/C05/C06 remain partial; C04 new candidate consumer consistency not_run.
Parent RMP07 remains partial. No new candidate selection, transfer/inactivation
policy or coefficient/output difference experiment was invented; this is an
**input** difference report, not proof of a changed physical effect.

All scientific/mission/team/platform/release gates stay open. In particular,
RMP12's105.0167us provisional rail-event error against100us remains failed; no
numerical experiment was rerun here. Existing RMP03 actual-source and RMP06 local
axial-startup/source dependencies are not silently satisfied by interface tests.
The broad empirical calibration browser script and flight-scoring datasets were
not run/read. No Windows/macOS/native installer or independent-team qualification.

## Availability, resources and next lane

Portable source/tests/checker, assignment/review, [browser checks](browser-checks.json),
EVIDENCE and package validation are in this run directory/repository. Full raw
logs, synthetic project snapshots and reviewer transcript are local only:
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp07-run-comparison/`.
Generated site/WASM/node_modules/browser artifacts are local, not committed.
Memory remeasured around10GiB available; heavy work serial, concurrency capped2;
reviewer serial/read-only. Every task process ended; lease released. `.pi/` stays
untracked. Nothing pushed, installed/deployed as a release or published.

Next ready work is the existing **RMP12 candidate-only diagnostic-control/corner-
partition experiment contract**, with independent pre-run review and a fresh
bounded allocation. Read retained result/saved-output diagnosis first: root width
alone cannot correct the upstream trajectory bias around thrust corners. Freeze
questions, controls, attempts, reference and provisional reserves before any new
native call; preserve the original nine-attempt failure. No unchanged-study
retry, guessed mission budget, default tolerance change or candidate activation.
RMP07 calibration/provider/status closure remains pending, not abandoned.
