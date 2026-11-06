# Lane: ui-polish-2

## Pin

- Worktree: `.paseo/worktrees/3s8t98rp/ui-polish-2` (relative to the owner's home)
- Branch: `ui-polish-2`
- Base: `524fadd1dba1a21b9202582cc812bd8c11ee2d1e` (tip of `frontend/design`, after
  `ui-polish-pass` merge `4f46e6c` and review `17f9367`)
- Author model: OMP `deepseek/deepseek-flash` (catalog label "DeepSeek-V4.1-Flash"), effort `max`.

## Owner direction (2026-11-04)

The owner looked at the merged polish build and said:
- "The empty panel doesn't make sense. It should auto open and close if empty, something like that, u decide."
- "For the 1280-wide issue, u decide."
- "The aero sentence: the way it's listed might not be the move. Look into a better way to display it."

The coordinator made the design decisions below under that authority. Gate 1 can
challenge a decision with evidence, but cannot silently change it.

Before screenshots (merged build): `.paseo/worktrees/3s8t98rp/evidence-ui-polish-2/coordinator-before/`.

## Item A — inspector auto-opens and auto-closes (decided)

Today, Airframe and Aero with no selected part show a full-height right panel that
only says "Select a part in the tree or the 3D view." (`src/console/shell/Inspector.tsx:67`).
That is about 20% of the width wasted.

Rules:
1. **Empty** means the active stage's inspector would only render that placeholder.
   It is **not** empty while it holds anything actionable, such as staged airframe edits
   with Apply/Discard, warnings, or the stage's own summary. List every stage's empty
   condition in Gate 1, citing code.
2. **Wide layout (inline inspector, ≥1280 px):** when the inspector becomes empty it
   collapses automatically. When content appears (a part is selected from the tree,
   the 3D view, a table row, the palette, the onboarding tour or the RunReadiness links)
   it opens automatically.
3. **Manual control wins.** The toggle button and `]` keep working. If the user opens
   it while empty, it stays open and shows the placeholder. If the user closes it while
   it has content, it stays closed until the next *new* selection.
4. **Drawer layout (<1280 px):** never auto-open the drawer, because it covers the
   canvas. Still auto-close it when it becomes empty. Keep the existing breakpoint
   logic in `src/console/Workstation.tsx:78-195` intact (`explicitRight`, `autoCollapse`).
5. **Motion:** about 160 ms width/opacity transition. With `prefers-reduced-motion`
   it is instant. No layout jump in the status bar or top bar. The 3D viewport
   re-frames to the new width; the camera framing already handles aspect.
6. Keyboard focus must not be lost into a collapsed panel. If focus was inside it,
   move focus to the selected tree item or the stage header.

## Item B — remaining 1280 issues (decided)

- Mass budget column header "Share of dry mass" wraps at 1280 (`src/console/stages/Airframe.tsx:99`).
  Fix: column headers never wrap (`whitespace-nowrap`), shortening only if needed.
  The bar column absorbs the squeeze.
- The palette placeholder truncates to "span 2…" at 1280. Fix: below `2xl`, show only
  "Search" plus the key hint. The accessible name and title stay unchanged.
- Sweep all eight stages at 1280×800 and 1024×768 (both with the inspector open and
  with item A's auto-collapse) for any other wrapped button, wrapped column header or
  mid-word clipped label. List them in Gate 1 and fix them in this lane.

## Item C — Aero non-lifting parts display (decided)

The comma-joined sentences ("Body tubes Payload & Avionics Bay, Airframe Coupler, …
are not modelled as lifting surfaces …") are hard to scan, and you can't find those
parts in 3D from them.

Decision: put them **in the same breakdown table** as secondary rows.
- Rename the first column header from "Lifting surface" to "Part".
- Lifting rows come first, as today. Then a quiet group divider row reading
  "Not lifting surfaces", then one dimmed row per non-lifting part (body tubes,
  parachutes, mass items, and engine-reported zero-CNα parts).
- In those rows the Share, CNα and CP cells show "—". An engine-reported exact zero
  shows `0` honestly, not "—". Never show "0" for an `unknown` value.
- These rows keep hover-to-find in 3D and click-to-select, the same as lifting rows.
- **One** footnote line under the table replaces the sentences: "— not modelled as a
  lifting surface in this subsonic rollup. These parts move the CG, not the CP."
  The engine citation (`crates/astraea-core/src/aero.rs:1302-1312`) still holds.
- `unknown` rows of other types (for example an unsupported fin shape) must **not** be
  merged into the quiet group. They stay visible as distinct warning rows with the
  engine's own reason, as `unknownRowSentence` does today.
- Remove the sentence helpers that become unused. Keep or replace their tests so the
  rules above are pinned.

## Coordinator decisions recorded here (owner said "u decide" for deferred items)

- **Huntsville site altitude: not added.** Keep the NASA preset without `launchSite`.
  Adding one would change the example's flight results (the 533 m regression
  baseline used by browser journeys and README) and needs a sourced pad elevation.
  The UI already says "Not set · sea level standard day assumed". Not in this lane.
- **3D view look (former item 6):** queued as a separate lane, `viewport-look`,
  after this one, because it touches different files. Not in this lane.

## In scope

`src/console/Workstation.tsx`, `src/console/store.ts` (only if a session field is
needed for item A), `src/console/shell/{Shell,Inspector,PartsTree}.tsx`,
`src/console/stages/{Airframe,Aero}.tsx`, `src/console/stages/aeroBreakdownText.ts`
and its tests, `src/console/kit/Table.tsx` (group/divider row support),
other stage files only for item B sweep fixes, tests next to changed files,
`scripts/preview-journeys.mjs` (add assertions only), and the top section of `CHANGELOG.md`.

## Out of scope (do not touch)

- `src/console/viewport/*` (reserved for `viewport-look`), `crates/`, `src-tauri/`,
  engine/WASM, physics, gates, thresholds, presets, schema, file formats, exports.
- Caveat or claim text changes (except the Aero sentences replaced by item C's footnote).
- `README.md`, `docs/screenshots/`, `public/landing/` (the coordinator decides on
  recapture after review).
- `TASKS.md`, the acceptance register, manifest, handoff, other worktrees and lanes.

## Non-negotiables

- The author cannot self-accept. Do not edit the register, manifest, board or
  handoff. `REVIEW.md` is written by the coordinator.
- No relaxed or removed assertions and no special-casing fixtures. Existing tests that
  set `rightOpen` must keep their meaning. If one must change, explain why in RESULT.md.
- Run `free -h` before builds, tests or browser runs; stop below 2 GiB available.
  Use `vitest --maxWorkers=2`, one heavy job at a time, and kill servers and browsers
  as soon as each check finishes. No subagents. No push, merge, release or publish.

## Setup

Run `pnpm install --frozen-lockfile` once. The wasm32 target is installed. Use
`PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2 pnpm build`.

## Gate 1 (before material edits)

Reply with a short design note and **stop until the coordinator approves**:
- A: per-stage empty condition (with citations), where the auto rule lives, how
  "manual wins" is tracked, the drawer interaction, and focus handling.
- B: the list of wrapped or clipped items you found at 1280 and 1024 (with screenshots
  in the evidence folder) and the fix for each.
- C: the table structure (how the divider/secondary rows fit `DataTable`), the exact
  footnote text, and the handling of zero vs unknown vs other-unknown rows.
- The falsifier for each item: a test or browser probe that fails at base `524fadd`
  and passes after.

## Required evidence

Put evidence in `.paseo/worktrees/3s8t98rp/evidence-ui-polish-2/`.
- `npx tsc --noEmit` clean. Focused vitest, then the full suite
  `npx vitest run --maxWorkers=2` (record the tails).
- Falsifiers recorded failing at base and passing after (exact commands).
- `pnpm build`, then `pnpm test:browser` (tail). Use a Playwright probe against
  `vite preview` with the production CSP in Chromium:
  - Airframe at 1600 and 1280: no selection means the inspector is collapsed; click a tree
    part and it opens; deselect (Escape or empty click) and it closes; `]` while empty
    keeps it open. Sample frames during the transition and record the timing.
  - 1024: selecting does not pop the drawer.
  - Aero at 1600 and 1280: screenshot of the table with the group rows; hover a
    non-lifting row and the 3D highlight appears.
  - All eight stages at 1600, 1280 and 1024: screenshots, plus the wrapped/clipped
    sweep result (expect zero). Record console or CSP errors (expect none).

## Acceptance (coordinator decides)

A, B and C are each implemented as decided, with a regression-capable test, or
explicitly reported as not done with the reason. Built-surface screenshots show it
working. RMP15-C05 header-fit guarantees and the earlier `ui-polish-pass` journeys
still pass.

## Report format

`docs/internal/execution-runs/ui-polish-2/RESULT.md` + `EVIDENCE.json`. Reply with
commit SHAs, files changed (production vs tests vs docs), exact commands and results,
what was deliberately not done, and open questions. Commit locally with
`git -c user.name='OMP lane author' -c user.email='omp@localhost' commit`.
