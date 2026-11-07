# Lane: no-parachute-warning

## Pin and authority

T3 prepares an isolated checkout from the commit adding this assignment on
`frontend/design`, after the doc-claims merge `2d86d92`. Use branch
`no-parachute-warning`. Author: OpenCode Go
`opencode-go/deepseek-v4.1-flash`, variant `max`.

The owner approved this queued item with "Go" on 2026-11-07. Earlier review
found the Spaceport example had no parachutes and landed ballistically, with
no explanatory note in the app. The example was fixed separately. This lane
adds the approved small "No parachute in this design" note for any current
design with no parachute component. It changes no inputs or simulation results.

## Proposed implementation boundary

- Small amber note using the existing theme and typography. Exact sentence:
  `No parachute in this design.` No new panel or large banner.
- Show it in Flight's existing whole-design readiness area and near the top
  of Recovery, including its no-run branch. It describes current design
  components; never infer recovery configuration from an older committed run.
- It is informational: do not block simulation, add a gate, alter validity,
  change any threshold, or claim anything about candidate-model descent.
- Note disappears immediately once the current design has a parachute.
  Any parachute component counts; do not introduce configuration rules here.
- No other UI, labels, inputs, preset, engine, physics, schema or export changes.

## Gate 1 only first

Confirm cwd, branch and HEAD. Read existing readiness and Recovery branches.
Send exact component edits, placement, stale-run and candidate behavior, and
the tests/journey changes. Stop before source edits for coordinator approval.

## Validation after approval

Add meaningful UI regression coverage for absent/present parachutes, current
design vs stale committed data, and no-run behavior. Keep run authorization
unchanged. Use the real built UI for a browser check (DOM/numbers); coordinator
will inspect screenshots and publish the named design backup. Test that
returning a parachute removes the note, without changing simulation inputs.

You own `src/console/shell/RunReadiness.tsx`, Recovery's note placement, focused
new tests, and a narrow addition to `scripts/preview-journeys.mjs`. The WebKit
lane owns viewport lifecycle and must not modify those files.

Run focused tests, tsc, build and Chromium browser acceptance, then record
RESULT.md and EVIDENCE.json and commit for coordinator review. Full suite and
all browser engines will be checked on the combined export. Do not weaken
existing assertions to make checks pass.

No subagents, push, merge, release, deploy or self-acceptance. Never read or
attach images: your model cannot consume them. Check `free -h` before heavy
work, stop below 2 GiB available, cap test workers/compilers at two jobs, run
long commands in the foreground. Do not change installed system packages.
