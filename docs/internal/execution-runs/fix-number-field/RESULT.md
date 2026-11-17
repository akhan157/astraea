> Moved 2026-11-14 from the repo-root `RESULT.md` (main @ `a57a7c8`, lines 211–234) during owner-approved tidy-up. Text unchanged.

# Number field lane result

- `45e2001` — parser, Escape cancellation, feedback, and regression tests (author; not self-accepted).
- The following report commit records this evidence; its SHA is the lane HEAD.

## Behaviour
- Done: strict decimal/grouping parser; `1,500` is grouping. Invalid and ambiguous input is rejected.
- Done: Escape cancels synchronously; Enter and blur commit. Arrow and drag use the same parser.
- Done: clamp and rejection show a positioned status note, cleared by the next edit. No call sites changed.
- Done: existing unchanged-value guard retained. No min/max, physics, or unit tables changed.
- Not done: built-app/browser verification and independent acceptance belong to the orchestrator.

## Evidence
- `free -h`: 5.8 GiB available before tests; 5.4 GiB before final checks (exit 0).
- On base production code, `npx vitest run src/console/kit/NumberField.test.tsx --maxWorkers=2` exited 1: all three Escape, comma, and clamp feedback regressions failed. Parser tests require the new module, absent at base.
- `npx tsc --noEmit` exited 0.
- `npx vitest run src/console/kit --maxWorkers=2` exited 0: 7 files, 49 tests. Search found no other NumberField test files.
- `git diff --check` exited 0 before commit.
- Browser suites deliberately not run per assignment. No push.

## Risks
- The positioned feedback may overlap nearby controls; visual verification in the built app remains necessary. Display rounding follows the existing `show` formatting.
- Author has not accepted this work; independent review is required.
