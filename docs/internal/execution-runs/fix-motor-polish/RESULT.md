> Moved 2026-11-14 from the repo-root `RESULT.md` (main @ `a57a7c8`, lines 257–264) during owner-approved tidy-up. Text unchanged.

## fix-motor-polish — author report (not self-accepted)

- Base: `250c8f9f478591a9f981a10a2f96e7ad45829031`; implementation: `a7059c2` (full SHA available via `git rev-parse a7059c2`).
- Search imports update the motor preview; the chart's grid child can shrink. Mount descriptions use the current units. Rated and curve-derived impulse are identified; standalone calculators disclose their scope. BATES rejects requests exceeding 10,000 samples with a useful message before allocating.
- `free -h`: 6.0 GiB available before the suite. `npx tsc --noEmit`: passed. `npx vitest run src/console/stages src/propulsion --maxWorkers=2`: 22 files, 233 tests passed; jsdom emitted four canvas `getContext` not-implemented notices. New component tests cover a stubbed search/import, chart endpoint and shrinkable container, imperial fit, and excessive grain samples. One initial focused run failed due to an incorrect test fixture key; corrected before the suite.
- No browser suite or built-app visual check was run, per assignment. Chart clipping still requires the orchestrator's real viewport verification. No physics or database values changed; no push, merge, or self-acceptance. `ASSIGNMENT.md`, `node_modules`, and the engine WASM were not committed.
