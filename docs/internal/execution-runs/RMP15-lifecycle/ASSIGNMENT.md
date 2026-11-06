# RMP15d — run/ensemble/cancel lifecycle evidence (RMP15-C03)

Base 121c688. Author omp (anthropic/claude-opus-5-5); serial MiMo no-tools review.
Goal increment 2. Lease: src/console/projectJobs.test.ts (tests only), this
directory, TASKS, RMP15 package notes. Read-only: src/console/store.ts,
src/state/analysis.ts, src/state/project.ts.

Hypothesis tested first (retained): overlapping same-project flights could let
an older completion end/error a newer job. Disproved — store.run() returns
early while a run is in progress (store.ts:445); the red result was vacuous,
production edit and test reverted, no defect.

Then: add direct tests for the two unpinned C03 cases — an edit while a flight
runs (result bound to dispatched inputs, shown stale, saved with dispatched
inputs; repeated run requests refused) and restarting a running ensemble (old
aborted; its late chunks cannot alter the new job or leave a result).
Mutation-check the guard. Bounded built-site trace of rapid repeated triggers.
