# Astraea execution package: start here

This is the operational continuation package requested by the owner after stopping
the old engineering session. Engineering remains paused in that session; the
hourly resume automation remains disabled. Preparing/pushing this package is
migration work, not permission to resume code implementation here.

## First-session sequence

1. Open `akhan157/astraea`, branch `delivery/integration-20261024`. Obtain the
   latest remote head of this branch; do not start from main or the WIP branch.
   Migration before this expansion was9594c7d. Accepted engineering remains5ea3141;
   subsequent commits only plan/package the work. Read [STATE](STATE.md).
2. Inspect `git status --short`, `git log -8 --oneline`, `git worktree list` and
   this session's active agents/runs. Preserve unknown/user edits. If another
   run owns the work, coordinate rather than duplicate it. Never reset/clean or
   overwrite a checkout to make these instructions convenient.
3. Run `python3 docs/internal/execution-package/validate-package.py` from the
   repository root. It is a read-only package/link/dependency/content check;
   it does not run the simulation, open outcomes, build or mutate anything.
4. Read [CONTROL-LOOP](CONTROL-LOOP.md), [CHECKS](CHECKS.md), and
   [RMP01](packets/RMP01.md). Read its linked design and
   [INTERFACES](INTERFACES.md) before implementation. Other packet briefs are
   read when their lane is dispatched; do not ingest all historic raw artifacts.
5. Re-measure the new machine; discover tool/dependency availability. The old
  2CPU/8GiB and cached Docker/toolchain paths are historical. There is no tracked
   rust-toolchain.toml at this baseline. Do not assume `/workspace/astraea-plan`,
   old caches, a browser binary or Docker exists on the new machine. Git source
   and portable checkpoints are the intended migration starting point.
6. Recover the candidate WIP by [WIP-RECOVERY](WIP-RECOVERY.md). It is not a build-
   ready baseline. Start implementation in an isolated worktree from the completed
   branch, pin its exact current SHA, and reuse only the reviewed portions.
7. Dispatch RMP01 first using its assignment prompt and acceptance matrix. Before
   edits, write a run record/lease with owner, base, files, dependencies, evidence
   directory and resource allocation. RMP02 and RMP03 can do independent source/
   parser work; RMP04 needs its technical fixture-plan review before build/apply.
8. Follow the control loop until the bounded packet is reviewed and integrated
   locally. Update tracker/checkpoints and choose the next ready packet. Do not
   stop merely to ask whether routine authorized engineering should continue.

## Readiness and authority

The owner already authorized bounded engineering/delegation toward a scientifically
qualified collegiate1.0. New-session continuation begins when the owner supplies
[this continuation prompt](NEXT-SESSION-PROMPT.md). Use efficient models and
independent scientific review for material physics. Completed source and evidence
must be preserved; no broad research restart or quota reset inference.

Migration pushes are allowed for this package on the existing migration branch.
They do not authorize future engineering pushes, a main merge, tags, publication,
deployment, paid capacity, external contact or opening new holdout outcomes.
External dependencies are parked honestly. Do not re-enable old automation.

## What constitutes the plan

- [Packet index](packet-index.json): all18 work packets, closure dependencies,
  readiness, file leases and acceptance references. No packet is completed by
  writing this package. Later packets are expanded/repinned when dependencies
  produce actual interfaces; do not invent unknown future exports or budgets.
- [Decision ledger](DECISIONS.md): fixed semantics, coordinator decisions allowed
  within scope, and decisions needing owner/team/data authorization.
- [Interfaces](INTERFACES.md): concrete native candidate contract and invariant
  equations. Target semantics are fixed; proposed Rust names are not code that
  already exists.
- [Checks](CHECKS.md): safe test commands, required failure paths, numerical/
  scientific/release distinctions and commands that must not open scoring data.
- [Artifact availability](ARTIFACTS.md): which evidence is in Git, which is only
  a historical hash, and how to handle unavailable original-machine artifacts.
- [Templates](templates/ASSIGNMENT.md): assignment, result, evidence, external
  input qualification and decision-budget records.

The [full roadmap](../roadmap-to-collegiate-1.0-2026-10-26.md) defines the mission/
release goal; this package supplies the actual dispatch/review/resume procedure.
If a brief conflicts with P0 or a later accepted source-specific decision, stop
that dependent edit, record the conflict and resolve it through review. Do not
silently pick the easiest interpretation or weaken an acceptance check.
