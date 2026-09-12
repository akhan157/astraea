# UI2 design debate brief (from master coordinator)

You are reviewing `docs/ui2-architecture.md` against master positions.
Design discussion only — NO code. For each item: accept (record + adjust
the doc) or rebut with reasoning; update the doc. Agreement without
reasoning will be rejected.

AGREED OUTRIGHT: D01 five studios + modal kill, D02 launch case, D03
immutable runs, D04 explicit weather, D05 rail, D06 no-new-deps, D09 2D-only
recovery, D10 minimal editor, D12 staging-design-only, D13/D14,
Q-dispositions, S1–S7 order.

CHALLENGES (answer each):
1. Parked WA2/WA3 work: S4/S6 must START from the parked implementations
   (WA3 chunk API + Vite worker + session in worktree astraea-frontend,
   commits 576a6eb/1fcbbe2; WA2 overlay pure module + chart in worktree
   astraea-wa2) — review-and-integrate, not rewrite. Justify anything
   you would still rewrite.
2. Cross-studio journeys need explicit UX (deep links, continue-in-X
   actions) or studios re-silo; propose the mechanism.
3. Calibration Apply stays gated, but resolve acceleration-semantics EARLY
   (it gates the flagship closed loop); propose which slice answers it.
4. IndexedDB agreed, but file export/import must be first-class from S3
   day one; adjust S3 acceptance.
5. Drop/reword any plan language constraining master orchestration
   (parallelization is a master call).
6. Weather interim probe-display-only risks repeating the "theater"
   finding; propose what makes it unmistakable in UI.

Context (read first, in order): docs/research/ux-coherence-report.md,
forum-intel-report.md, tool-coverage-report.md, frontend-plan.md +
master-contract-decisions.md, staging-design-package.md; main docs
ui-ux-design-spec, master-product-spec, capability-decision-queue.md.
Every major decision must cite its source.

WHEN DONE, report completion by running exactly this command in this
terminal (fill in the outcome: succeeded/failed):
orca orchestration send --type worker_done --subject "<done/failed>: UI2 debate resolved" --body "<what changed in ui2-architecture.md, per-challenge verdicts>" --task-id task_fc5932805948 --dispatch-id ctx_DEBATE --outcome succeeded --files-modified "docs/ui2-architecture.md" --json
(Replace ctx_DEBATE with the dispatch id shown in your task preamble; if
you never received one, use --task-id only and state that.)
