# RMP18 — Release candidate and supported-claim reconciliation

## Purpose/status

Locally actionable reconciliation is delivered (merge `7024d29`): C01 PASS,
C02/C03/C04/C05 blocked on owner decisions and rights determinations. Delivered:
the unconditional native download URL/path log sink removed (extracted-source
proof; native runtime acceptance still requires the release build owner), a
deterministic generated third-party notices file served with the app (300,284 B,
both font licences verbatim, 153 JS packages, 21 Rust crates, unresolved items
named), and the historical beta accuracy claim explicitly scoped to the legacy
model. Remaining external: redistribution terms for the compiled-in NASA/TP-2002-211556
thermo subset, 8 shipped JS packages without an installed licence text,
motor-curve provenance, the 472-crate native closure, and the owner release
decision. Release decision and all remote/production actions remain separate.

## Prerequisites (closure versus early work)

- Early work inventories offered outputs/platforms/evidence and drafts known limits without implying readiness.
- Closure requires applicable RMP01–17 engineering, numerical, physical, uncertainty, prospective, product/team/platform dispositions.
- Owner decides primary-use1.0, explicit companion promise/version or continued0.9; no weaker promise is silently substituted.

## Required reading

- [STOP/migration handoff](../../SESSION-HANDOFF.md)
- [Full roadmap](../../roadmap-to-collegiate-1.0-2026-10-26.md)
- [Model routing](../../session-handoff/coordination/MODELS.md)
- [G0–G8 release gates](../../roadmap-to-collegiate-1.0-2026-10-26.md)
- [Migration/push authority boundary](../../SESSION-HANDOFF.md)
- [Product direction/status](../../project-status.md)
- [Preview readiness](../../preview-readiness.md)
- [Claim/budget limits](../../accuracy-program/collegiate-accuracy-spec-proposed.md)
- [Channel policy proposal](../../accuracy-program/first-batch-2026-10-26/UP0/plan.md)

## Files owned/prohibited/shared leases

- CREATE `docs/internal/execution-package/evidence/RMP18/` for candidate manifest, gate/claim/rights matrix and owner decision draft.
- Release notes/support/migration documents only within explicit coordinator lease; source fixes go to their owning packets.
- Shared leases: package/version/channel metadata and workflows require final review; no main/default change, tag, release, push, deploy, production key/feed operation here.
- All proposed CREATE paths require dispatch-time existence/ownership check; preserve unrelated dirty work and negotiate shared edits sequentially.

## Frozen decisions

- Computational correctness, empirical accuracy, usable uncertainty, team use and installed platform acceptance are separate statuses.
- No broad validated badge from one passing output; selected primary claims need applicable gates PASS and explicit supported envelope.
- Unresolved critical correctness/data-loss/install/update defects cannot be hidden by averages or version naming.
- Migration push authorization covers its documentation transfer; it does not authorize later engineering push/main merge/publication/deployment/signing/feed changes.

## Ordered implementation/review substeps and commit boundaries

1. Commit 1: inventory exact candidate source/lockfiles/site/WASM/native packages and link each to affected verification/review.
2. Build claim table by mission/output/regime/platform, including UNKNOWN/FAIL, source/calibration dependencies and operating limits.
3. Commit 2: reconcile G0–G8 for chosen product promise; identify any mandatory evidence gap rather than using percentage complete.
4. Inventory software/data redistribution rights, notices, reproducible examples and public/private artifact separation.
5. Commit 3: draft version/stable-preview channel policy, compatibility/support matrix, migration/recovery and release notes with precise model status.
6. Check exact package/source/signatures/notarization/feed requirements at applicable authorized stages; do not perform production operations now.
7. Review reproducible examples and intended decisions against actual qualified outputs, budgets and installed-platform evidence.
8. Commit 4: prepare owner decision with primary/companion/preview options, exact residual blockers and concrete final-action checklist; pause for separate authority.

## Input/output contracts and source fields

- Candidate input: source commit/tree status, locks/toolchain, engine/model/environment identities, source data/rights and exact site/WASM/package SHA.
- Evidence index: gate ID, output/mission/platform scope, command/artifact identity, reviewer disposition and limitations.
- Claims output: supported geometry/regime/conditions/outputs, accuracy/uncertainty scope, experimental/unavailable features and known failures.
- Delivery output: support/compatibility/channel/version policy, migration/recovery instructions, release notes and authorized production requirements.
- Owner decision: explicit promise/version/envelope and action scope; drafting or local readiness does not grant remote authority.

## Acceptance checks

| ID | Mechanism | Pass condition | Evidence |
| --- | --- | --- | --- |
| RMP18-C01 (Artifact reconciliation) | compare exact source/assets/packages with verification manifests | all offered artifacts have matching affected checks; no stale WASM/site | candidate hash matrix |
| RMP18-C02 (Gate completeness) | trace every primary claim through applicable G0–G8 | mandatory PASS or claim explicitly limited by owner; UNKNOWN not promoted | claim/gate disposition |
| RMP18-C03 (Rights/security boundary) | review redistribution/notices/private separation | authorized distributable material only; no keys/confidential data in artifacts/logs | rights/notices/private inventory |
| RMP18-C04 (Delivery coherence) | review support/channel/migration/examples | version promises match real platform/update/model behavior and recovery | reviewed release draft |
| RMP18-C05 (Authority) | check explicit owner final decision against proposed action | no push/merge/publish/deploy/sign/feed operation before its separate authorization | dated owner/action record |

## Negative/failure cases

- Do not call finite output range a validated envelope, or native diagnostic implementation a shipped production accuracy improvement.
- A missing gate may support continued preview or explicit companion decision; it cannot silently become primary-use1.0.

## Exact permitted checks or required prerequisites

- Permitted reconciliation begins with `git status --short`, `git log -5 --oneline` and `git diff --check`; retain exact candidate identities.
- After actual candidate artifacts exist, `sha256sum PATH_TO_CANDIDATE_WASM PATH_TO_CANDIDATE_PACKAGE` records local declared files only.
- No final universal build/test command closes release; choose affected source/platform checks from owning packets and their exact prerequisites.
- No git push/merge/tag, release CLI, deployment, production signer or feed command is authorized by this packet.
- Commands above are future resumed-work checks unless explicitly read-only packaging checks; this package records no new executions.

## Evidence to save

- Save exact candidate/source/asset/package matrix, G0–G8 output/platform traceability, rights inventory and all FAIL/UNKNOWN dispositions.
- Save reviewed release/support/channel/migration drafts, owner promise decision and separately authorized final-action scope when provided.
- Record pinned base, owner/model/effort, exact commands/exit status, source/input/artifact hashes, review disposition, limitations and next action.
- Historical external logs/binaries may be unavailable; identify missing artifacts honestly and never count retained hashes as fresh execution.

## Escalation/stop decisions

- Stop finalization on identity mismatch or unresolved critical defect; return a bounded correction to owner packet and invalidate affected evidence only.
- Missing empirical/platform/team evidence remains external blocker; owner must explicitly choose product promise, never fabricate a pass.
- Preserve defaults/main and stopped automation; no external contact, holdout access, paid/remote operation or publication is implied.

## Successor/ready-made agent assignment prompt

Owner final decision; only afterward a separately authorized publication/merge/deployment/signing operation with exact reviewed artifacts.

> Reconcile exact candidate source/site/WASM/native packages and G0–G8 by mission/output/platform. Draft precise supported claims, rights/support/channel/migration/release notes and primary/companion/preview decision. Preserve FAIL/UNKNOWN and critical blockers; perform no remote or production final action.
> Before work pin current integration base, inspect dirty state/active runs, name exact leases and resource budget, and retain completed evidence. Independent material-science/convention review is required where applicable.
