# Product continuation — 2026-11-07

Branch: `frontend/design`, private `astraea-dev`. Public product history is
separate in the retained `public-export` checkout, remote `akhan157/astraea`.
Do not push private history to public.

Accepted since the public UI export `e3a39e1` / private main `7a3b847`:

- Doc corrections: author `4394e4c`, merge `2d86d92`; exact previously approved
  claims, no README Windows edit. Coordinator build/version check and 150-link
  check passed. Review in `doc-claims/REVIEW.md`.
- No-parachute note: author `576be3b`, merge `16145c5`; current-design note only,
  simulation stays enabled. Coordinator focused checks, built visual QA and
  named navigable design backup complete. Review in
  `no-parachute-warning/REVIEW.md`.

## Next action

The separate `webkit-contexts` diagnosis lane is still outstanding. Its task is
`node:delegated-task:command%3Amcp%3Ab9463048-fbb1-457d-86b8-fa9e7ceedcf3%3Adelegate-task%3A5787c802-3b79-4ad0-89fe-38fd4d95db78`.
Its completion wakes this thread; do not poll. It owns viewport lifecycle,
not the preview journeys. First deliverable is a cause-backed plan, not source
edits. See `webkit-contexts/ASSIGNMENT.md` at pin `cb195f8`.

Public CI run 42393579721 failed at the final WebKit error assertion after all
journeys completed: active WebGL context limit and redundant loseContext error.
Chromium, Firefox and Rust passed. Do not mask errors or call this green.

After the reviewed fix: merge, verify the combined tree, merge to private main,
create the clean public export using the existing exclusions/no-reply identity,
run full tests and all browser engines on the actual export, then make the
authorized public push and confirm CI. Doc corrections and warning were approved
for one combined export; include the necessary CI repair.

Release `v0.10.0` and website deploy were authorized with "Go". They still need
the public repo's Tauri signing key (password only if present), Cloudflare account
ID and API token. GitHub hides existing private-repo secret values. Use installed
access when available; for values only the owner can supply, use request_secret,
never chat. No tag/release/deploy has been made by this continuation.

Research changes, over-stable example decisions and public-first development
remain outside this work. Existing design backups are immutable. The newest is
`Astraea UI 2026-11-07 Recovery Note`, capturing `16145c5`.
