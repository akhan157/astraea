> Moved 2026-11-14 from the repo-root `RESULT.md` (main @ `a57a7c8`, lines 266–278) during owner-approved tidy-up. Text unchanged.

## fix-polish-a — author report (not self-accepted)

Base: `250c8f9f478591a9f981a10a2f96e7ad45829031`; implementation commit: `6aa00a2`. Independent review and integration are required.

- Tour entry points now select Mission; the first card is positioned at the top right. Overlap at the requested viewport sizes remains for the orchestrator's browser check.
- Parts filter and focusable readouts have a cyan focus-visible ring. Readouts remain focusable so their confidence tooltips are keyboard accessible. Mobile landing header button and footer links have 44 px minimum height.
- CP is defined as the point where the resultant aerodynamic force acts; current margin questions use the engine-backed stability answer. Higher-flight guidance names impulse, mass and drag and explicitly says it has not evaluated changes.
- Flight help no longer mentions a temperature control. Site editor rejects outside 0–20,000 m ASL, consistent with `crates/astraea-core/src/flight_provider.rs` and `src/application/candidate.ts`.
- Ctrl+Q remains open: the shell has no custom menu; adding a quit accelerator would require introducing/customizing a native menu. No native changes made.

Evidence: `free -h` available 5.7 GiB before checks; `npx tsc --noEmit` passed; `npx vitest run src/console src/onboarding src/copilot src/landing --maxWorkers=2` passed 69 files / 591 tests; focused `npx vitest run src/copilot/copilot.test.ts src/console/stages/siteAndTelemetry.test.tsx --maxWorkers=2` passed 2 files / 35 tests; `git diff --check` passed. Vitest printed jsdom canvas and localStorage warnings. Browser suites and cargo check were not run: browser verification belongs to orchestrator and no native files changed. No push; no self-acceptance.
