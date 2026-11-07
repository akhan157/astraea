# Lane: webkit-contexts

## Pin and purpose

Start from the commit adding this assignment on `frontend/design`, whose parent
is `89fc995`. T3 creates the isolated checkout. Use branch `webkit-contexts`.
Author: OpenCode Go `opencode-go/deepseek-v4.1-flash`, variant `max`.

Public export `e3a39e1` (dev main `7a3b847`) failed GitHub CI run
42393579721 at the final WebKit error assertion. Every journey completed, but
the captured errors were:

- `There are too many active WebGL contexts on this page, the oldest context will be lost.`
- `WebGL: INVALID_OPERATION: loseContext: context already lost`

Chromium, Firefox and Rust passed. Fix the resource lifecycle, without filtering
these errors, relaxing checks or disabling WebGL. Existing context-loss fallback,
restoration, editing and stage navigation must remain functional.

## First deliverable: diagnosis and plan only

Confirm cwd, branch and HEAD, then investigate `src/console/viewport/webgl.ts`,
`Viewport.tsx`, R3F teardown, stage unmounts and the loss/restore journey.
Distinguish context leaks from redundant loss calls and browser behavior.
Return the cause supported by code/probes, exact proposed changes, invariants,
a regression test that fails before the fix, and how to validate WebKit.
Stop before material source edits for coordinator approval.

The availability probe creates a temporary context without explicitly releasing
it, and releaseShellCanvases currently calls loseContext without checking loss.
These are leads, not an accepted root-cause claim. Do not assume fixing those
alone addresses the context-limit error.

## Scope and constraints

- Own viewport WebGL lifecycle and its focused tests. A dedicated browser
  regression script is allowed. Do not edit `scripts/preview-journeys.mjs`
  while the separate doc-claims lane owns its landing assertion.
- No engine, physics, schema, design or output changes. No docs-claim edits.
- Never read images: your model cannot consume them. Use DOM and measurements.
- No subagents, push, merge, release or deployment. You cannot self-accept.
- Run `free -h` before heavy work; cap tests at `--maxWorkers=2` and compilers
  at two jobs. Stop below 2 GiB available. Keep long commands in the foreground.
- Do not change global packages or services. Report missing local WebKit support
  and an exact validation alternative before installing anything system-wide.

After approval, implement narrowly and record RESULT.md and EVIDENCE.json here.
Preserve failed probes and raw logs outside the repo. Required validation:
type check, focused regression, build, Chromium acceptance and WebKit acceptance
where runnable. Do not call an unavailable browser a pass.
