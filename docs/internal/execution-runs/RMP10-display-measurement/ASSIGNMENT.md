# Assignment / file and resource lease — RMP10 remaining display/output qualification

- Packet/subpacket and acceptance IDs: RMP10; A1–A4, A7 of the accepted scope
  split (A5/A6 sweep-only). Register IDs RMP10-C01, RMP10-C04, RMP10-C07 stay
  partial/in_progress; this lane claims no PASS.
- Exact current integration base SHA: `ae8c54b` (branch
  `rmp10-display-measurement`, worktree
  `/home/ak/.paseo/worktrees/3s8t98rp/rmp10-display-measurement`). Base verified
  by `git rev-parse` at lease time; no rebase assumed.
- Owner / model / effort: single worktree owner; coordinator approved the scope
  split. No subagent, no reviewer call, no subdelegation.
- Existing user work preserved: only untracked `rmp10-display-dispatch.md`
  present; no stash/reset/branch switch.
- Availability / sealed boundary: TypeScript sources and vitest stub engine
  available offline. `src/engine/astraea_engine.wasm` is gitignored
  (`.gitignore:6`) and **absent** in this worktree; engine identity is NOT
  verifiable here and is owned by the merged integration. No binary restore,
  copy or hash, no rebuild. No raw flight outcomes, no protected data.
- Owned files (this lane):
  - CREATE `docs/internal/execution-runs/RMP10-display-measurement/{ASSIGNMENT,RESULT,EVIDENCE}.md/json`
  - EDIT `src/console/data/adapter.ts` (honest label text only)
  - EDIT tests: `src/console/data/outputContracts.test.ts`,
    `src/console/data/recoveryResults.test.ts`,
    `src/console/stages/recoveryResults.test.tsx`,
    `src/console/stages/SavedRuns.test.tsx`,
    `src/console/evidence/MomentArmHistoryPanel.test.tsx`
- Read-only/prohibited: all `crates/**` Rust, WASM assets and build scripts,
  schema/archive parsers and formats, thresholds/gates constants, budgets
  (`MAX_PROJECT_ARCHIVE_BYTES`/`MAX_FOREIGN_IMPORT_BYTES`), calibration and
  classified-ledger modules, project state/stores, other RMP10 run directories,
  the calibration-applicability and ensemble-ledger worktrees.
- Invariants: no physics/reference-model/threshold/schema/archive-format change;
  no Rust/WASM; no new dependency; 64 MiB/8 MiB budgets and classified-ledger
  behavior intact; shipped engine identity not re-verified or re-asserted here.
- Required reading (done before edits): `rmp10-display-dispatch.md`;
  `docs/internal/execution-package/{CONTROL-LOOP,DECISIONS,CHECKS}.md`;
  `packets/RMP10.md`; register entries C01/C04/C07;
  `execution-runs/RMP10-{flight-model-history,geometry-cp-support,peak-evidence,
  qualified-output-archive,recovery-readouts}/RESULT.md`; roadmap RMP09/RMP10
  exit checks; sources `src/application/{momentArmHistory,flightLanding,
  savedFlightOutputs}.ts`, `src/console/data/{adapter,recoveryResults}.ts`,
  `src/console/stages/{Recovery,SavedRuns,Flight,Build}.tsx`,
  `src/console/evidence/{RecoveryCard,MomentArmHistoryPanel}.tsx`,
  `crates/astraea-core/src/six_dof.rs` (read-only citations).
- Ordered small commits:
  1. lease/record + A2 honest landing-energy mass-basis label (adapter only);
  2. A1/A3/A4/A5/A6 consumer-matrix assertions;
  3. A7 delta-withholding regressions per consumer (fix only if a leak is found);
  4. RESULT/EVIDENCE with the sweep matrix, failed attempts and the (B) list.
- Per-ID mechanism/evidence: A1 one authoritative interval and one canonical
  dictionary proven by consumer equality tests; A2 disclose lumped whole-vehicle
  mass basis and unsupported per-section energy without touching the engine
  computation or the 20 J value; A3/A4/A5/A6 already-honest verdicts each with a
  file:line row plus a regression-capable assertion; A7 delta withholding for
  unavailable interval, delayed/missing clock, timeout and non-nominal records on
  canonical table, historical table, export/trace and archive summary.
- Test commands: focused affected vitest only (`pnpm vitest run <files>`),
  `pnpm exec tsc --noEmit`, optional Vite build if typecheck/vitest pass. No full
  suite, no browser journey (coordinator owns browser proof).
- Independent review: coordinator; no self-acceptance. Material-physics review is
  not required because no physical computation changes.
- Resources: `free -h` checked; ≤2 workers; no server left running; single owner.
- Evidence: this directory (RESULT.md, EVIDENCE.json) plus command logs written
  beside the worktrees under `evidence-rmp10-display-measurement/`.
- Stop/rework/escalation: stop if a fix needs engine/physics/schema/threshold
  change, or if a consumer contradicts the single-interval/single-dictionary
  contract beyond a duplicate removal. Successor: coordinator integration.
- Authority: local reversible engineering only; no push/publication/outreach,
  no outcome access, no paid provisioning, no automation restart.
