# Lane: ui-polish-pass

## Pin

- Worktree: `.paseo/worktrees/3s8t98rp/ui-polish-pass` (relative to the owner's home)
- Branch: `ui-polish-pass`
- Base: `f8e10959e44a396c52d62b8d45cbdeb01aadbf33` (tip of `frontend/design`)
- Author model: OMP `deepseek/deepseek-flash` (catalog label "DeepSeek-V4.1-Flash"), effort `max`.
- Owner authorization: "Ok" (2026-11-03), approving the coordinator's proposal to
  open one polish lane for review items 1–5 and 8–10.

## Why this lane exists

The coordinator ran the production build (`pnpm build`, `vite preview`, headless
Chromium, 1600×1000 and 1280×800) and reviewed every stage on 2026-11-03. Its
verdict: the direction is right, but several surfaces still look unfinished.
The "before" screenshots are in `.paseo/worktrees/3s8t98rp/evidence-ui-polish-pass/coordinator-review-before/`
(`<width>-<index>-<Stage>.png`, `landing.png`, `tube-selected.png`). Look at them first.

Findings in scope, with citations at the base SHA:

1. **Aero breakdown shows a broken sentence.** `src/console/stages/Aero.tsx:78`
   always renders `"{rest.length} parts carry no lift (…)."`, so the NASA example
   shows "0 parts carry no lift ()." Body tubes come back with `cnAlpha.confidence
   === 'unknown'` and are listed as "CNα N/A · CP N/A", which reads as missing data.
   Fix: render the sentence only when the list is non-empty, use correct
   singular/plural, and present the tubes honestly. Tubes must not be relabelled as
   "zero lift" unless the engine reports zero: if the engine reports `unknown`, say
   why in plain words (for example "not modelled as a lifting surface in this
   subsonic rollup") without inventing a value. Check what the engine actually
   returns before choosing the wording, and cite it.
2. **Native, unthemed controls.** The default blue range scrubber and plain
   "Full flight" checkbox (`Flight.tsx` / `FlightTimeline.tsx`), native `<select>`
   ("Select run" in `SavedRuns.tsx`/`Build.tsx`, the Recovery bay picker in
   `evidence/RecoveryCard.tsx`), and native `<details>` triangles in Build/saved
   runs. Fix: use or extend the themed kit (`src/console/kit/`, `C.*` tokens in
   `kit/theme.ts`). Cover every native checkbox, range, select and details element
   in `src/console` that is reachable from the eight stages. List them all in Gate 1.
3. **Launch-site form looks like a placeholder** (`stages/SiteEditor.tsx`, shown on
   Mission): empty full-width input, oversized bright button, plain label. Fix:
   restyle into the compact themed field/button pattern used in the inspector.
4. **Huntsville shows "Elevation 0 m"** on the Mission site card because the
   preset has no `launchSite`, so the case resolver uses "sea level, standard day"
   (`src/application/caseResolver.ts:113`). Fix is **display only**: when no launch
   site is set, show it as not set (e.g. "Not set · sea level standard day assumed")
   with a way to set it, instead of a number that looks measured. **Do not** add a
   site altitude to any preset — that changes flight results and is an owner decision.
5. **Same settings in two places.** Launch rail, site/wind and main-deploy fields
   appear as editable inputs in both the Mission and Flight inspectors. Fix: Mission
   stays the place to edit them; Flight's inspector shows them as a compact read-only
   summary with an "Edit in Mission" action. Propose the exact layout in Gate 1.
8. **Cramped at 1280×800**, the desktop default size: "Run simulation" and
   "Compare revision" wrap onto two lines, the Airframe header text is cut off, and
   mass-budget part names are truncated. The responsive drawer starts only below
   1280 px (commit `87d6cf8`). Fix: no wrapped buttons and readable part names at
   1280×800 and 1024×768, keeping the RMP15-C05 guarantee (`docs/internal/execution-runs/RMP15-usability/ACCEPTANCE.md`)
   that the header fits and Run is fully visible at 800×600. Propose the mechanism
   (breakpoint change, nowrap plus collapse, or both) in Gate 1.
9. **Notes cut off mid-sentence**, e.g. Verify rail exit "…competition compliance
   are not ass…" and landing speed "…landing i…" on Verify and Recovery. Fix: the
   full text must be reachable without a hover-only tooltip (wrap to two lines, or
   the existing `kit/Caveat.tsx` summary+More pattern). No caveat text may be
   deleted or reworded in a way that changes its claim.
10. **Landing page is out of date.** `index.html:37` hardcodes "Beta 0.9" while
    `package.json` is 0.10.0. The hero image in `public/landing/` shows a part
    ("Airframe Transition") that is no longer in the NASA preset. Fix: get the version
    from `package.json` at build time (not another hardcoded string), then recapture
    `public/landing/*.webp` with `scripts/capture-screenshots.mjs` from the fixed build.

Items 6 (3D view look) and 7 (empty right panel with no selection) are **not** in
this lane. They need an owner design decision.

## In scope

`src/console/stages/{Aero,Flight,FlightTimeline,SavedRuns,Build,Mission,SiteEditor,Recovery,Verify}.tsx`,
`src/console/evidence/*` (only to swap native controls / fix truncation),
`src/console/kit/*` (new or extended themed primitives), `src/console/shell/{Shell,ProjectChrome,Inspector}.tsx`,
`src/console/Workstation.tsx`, `index.html`, `vite.config.ts` (only to inject the
version), `public/landing/*.webp`, tests next to the changed files, and a `CHANGELOG.md`
entry in the top section.

## Out of scope (do not touch)

- `crates/`, `src-tauri/`, engine/WASM sources, aero/physics models, gates,
  thresholds, tolerances, preset physical values, schema, file formats, export contents.
- Any change to what a caveat or claim says (layout only). No removed disclosures.
- 3D viewport look and the empty inspector (items 6–7). Staging, new part types,
  motor database.
- `README.md` and `docs/screenshots/` (unless an image there shows a broken string
  this lane fixes — then report it, do not recapture).
- `TASKS.md`, acceptance register, manifest, handoff, other worktrees, other lanes.

## Non-negotiables

- The author cannot self-accept. Do not edit the acceptance register, manifest,
  task board or handoff. `REVIEW.md` is written by the coordinator.
- No relaxed assertions, no special-casing fixtures, no deleted tests. Update
  selectors only where a native element was replaced, and keep the accessible name
  and role (the browser scripts use `getByRole`).
- Keyboard access is unchanged or better: every replaced control is focusable and
  works with keyboard, with a visible focus ring. The flight scrubber keeps arrow-key
  scrubbing.
- Committed vs staged semantics are unchanged.
- Host memory: run `free -h` before builds, tests or browser runs and stop below
  2 GiB available. Use `vitest --maxWorkers=2` and one heavy job at a time. Kill every
  dev/preview server and browser as soon as its check finishes. No subagents.
- No push, no merge, no release, no publish.

## Setup

The worktree has no `node_modules`. Run `pnpm install --frozen-lockfile` once. The
engine build needs `rustup target add wasm32-unknown-unknown` (already installed on this host).

## Gate 1 (before material edits)

Reply with a short design note and **stop until the coordinator approves**:
- the full list of native controls you will replace (file:line) and the kit
  primitive each one becomes,
- item 1: what the engine returns for body tubes (cite the code) and the exact
  wording you propose,
- item 5: the Flight inspector read-only layout,
- item 8: the mechanism and the breakpoints,
- item 10: how the version reaches `index.html`,
- the falsifier for each item: a test or probe that fails at base `f8e1095` and
  passes after.

## Required evidence

Raw logs and screenshots go outside the repo, in `.paseo/worktrees/3s8t98rp/evidence-ui-polish-pass/`.
- `npx tsc --noEmit` clean.
- `npx vitest run --maxWorkers=2 src/console` (exact command and tail), then the full
  suite `npx vitest run --maxWorkers=2` (tail).
- Regression tests that fail at base and pass after, at least for: item 1 (no
  "0 parts…()" text; plural wording), item 4 (no "0 m" elevation when the site is unset),
  item 5 (no editable rail input in the Flight inspector), item 10 (landing version
  equals `package.json`). Record both the failing and the passing runs.
- Built surface: `pnpm build`, then Playwright against `vite preview` in Chromium
  (follow `scripts/browser-smoke.mjs` and the production CSP in `dist/_headers`).
  Screenshots of all eight stages at 1600×1000, 1280×800 and 1024×768, plus the header
  at 800×600. Report `header.scrollWidth == innerWidth` and the Run button's visible
  fraction at each size. Report any console or CSP errors (expect none).
- `pnpm test:browser` still passes (tail).
- Recaptured `public/landing/*.webp`.

## Acceptance (coordinator decides)

Every in-scope item is either fixed with a test that can catch a regression, or
explicitly reported as not fixed with the reason. The built-surface screenshots show
no native-styled controls, no wrapped header buttons at 1280, and no mid-word
truncation of caveats. RMP15-C05 header-fit guarantees still hold.

## Report format

`docs/internal/execution-runs/ui-polish-pass/RESULT.md` + `EVIDENCE.json`. Reply with:
commit SHA(s), files changed (production vs tests vs docs vs images), exact commands
run and their results, what was deliberately not done, and open questions for the owner.
Commit locally with
`git -c user.name='OMP lane author' -c user.email='omp@localhost' commit`.
