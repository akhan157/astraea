# A3 legacy sentence — implemented, not self-accepted

Base: `064a4a1759228e107705645d00d223ed0510af8b`, branch `a3-legacy-sentence`, worktree
`~/.paseo/worktrees/3s8t98rp/a3-legacy-sentence`. Cwd confirmed at start with that branch and
HEAD. This author does not self-accept; independent review is outstanding.

## What changed

| File | Change |
|---|---|
| `src/console/evidenceClaims.ts:20` | `BETA_ACCURACY_CLAIM` carries the owner-approved legacy sentence. |
| `index.html:170`, `docs/accuracy.md:3`, `README.md` blockquote, `.github/workflows/release.yml:72` (`releaseBody`) | Same sentence, character for character. |
| `src/console/evidenceClaims.test.ts` (new) | One test pins the full `BETA_ACCURACY_CLAIM` string exactly. Closes A2 review finding L1. |

Replacement, applied in all five copies:

- Old: `Shapes it cannot model use legacy drag, which has no blind test on those shapes.`
- New: `Shapes it cannot model use legacy drag, which has no blind test on those shapes; on one small rocket with freeform fins it predicted about 26% low (10 flights, development comparison).`

`BETA_BANNER_SHORT` is unchanged. `README.md` was re-wrapped to the same ≤79-column blockquote
width; the change is whitespace-only. No other wording changed.

Copy normalization check (rendered text, line joins collapsed), all exact:

- `README.md` blockquote equals `**0.10 beta.** ` + claim + ` See the [accuracy record](docs/accuracy.md) for tested cases and known limits before using any number operationally.` — 615 characters.
- `docs/accuracy.md:3` equals the claim — 483 characters.
- `index.html:170` after `<strong>Beta.</strong> ` equals the claim.
- `releaseBody` equals the claim + ` See docs/accuracy.md and CHANGELOG.md.`

`grep -rc "predicted about 26% low"` returns 1 for each of the five files; the old sentence
(`those shapes. Not`) matches none of them. `src/console/stageRendering.test.tsx:71` pins only
`no blind test on those shapes`, which the new sentence still contains; it needed no change.

## Commands and exit codes

Host before the work: `free -h` exit 0, 9.9 GiB available; load average 3.80 before tsc and
4.18 before the full suite, both below the 6 gate. `mkdir -p /home/ak/a3/tmp` first. Long
commands ran detached with `TMPDIR=/home/ak/a3/tmp` and their exit echoed.

| Command | Exit | Log / result |
|---|---|---|
| `pnpm exec tsc --noEmit -p .` | 0 | `/home/ak/a3/tsc-final.log` |
| `pnpm exec vitest run src/console/evidenceClaims.test.ts src/console/stageRendering.test.tsx --maxWorkers=2` | 0, 2 files / 2 tests | `/home/ak/a3/focused.log` |
| `pnpm exec vitest run --maxWorkers=2` | 0, 194 files / 2,236 tests | `/home/ak/a3/vitest-full.log` |
| `pnpm exec vite build` | 0 | `/home/ak/a3/build.log` |

Compiler: TypeScript 7.0.2 from the lane's `node_modules` symlink. pnpm pre-run dependency
verification refuses the shared `node_modules` symlink (`workspace hoist directory is not a real
directory`) and the exact `pnpm exec` form printed that warning with exit 0 and no compiler
diagnostics; to remove the ambiguity the same commands were rerun as
`pnpm --config.verify-deps-before-run=false exec …` (same pnpm-resolved binary) and once as
`./node_modules/.bin/tsc --noEmit -p .`; all exit 0. The exit codes above are from the
`verify-deps-before-run=false` runs. `node_modules` is untracked and was not committed.

Built output contains the new sentence in `dist/index.html` and `dist/assets/app-C2YshX3o.js`.
`vite build` copied the unchanged engine WASM to `dist/assets/astraea_engine-IGhBEJvl.wasm`,
sha256 `4c1ec4ed7192f0f0eab9206481e74d2627c3a2f8010376a69f9194df10824535`, identical to
`src/engine/astraea_engine.wasm`; nothing was rebuilt.

## Not done

- No engine, `crates/`, threshold or value change; no WASM rebuild or commit.
- No network, push, tag or release.
- No edits to `GOAL-HANDOFF.md`, `RELEASE-READINESS-REPORT.md`, the acceptance register or `CHANGELOG.md`.
- `/home/ak/astraea-evidence/R6-public-cohort/` was not opened.
- No screenshot: the change is text-only and the assignment asked for no UI capture; the built
  HTML and bundle were checked for the exact sentence instead.
- Independent review and acceptance remain outstanding.

Process note: the first edit attempt resolved relative paths against the orchestrating
worktree (`goal-collegiate-accuracy`). Those six paths were reverted with `git checkout --`
plus removal of the new test file before any check ran; that worktree was clean afterwards.
The committed lane diff below contains only the intended lane files.
