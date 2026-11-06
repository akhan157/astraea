# Lane ui-polish-pass — coordinator review

Reviewer: coordinator session (Claude Opus 5.5). The lane author (OMP
`deepseek/deepseek-flash`, catalog "DeepSeek-V4.1-Flash", effort max, agent
`dde99ff`) did not self-approve. This is independent review, not owner acceptance.

- Base `f8e1095`; assignment `0f5330a`; lane commits `25bd216`, `042bd30`,
  `be54572`, `7b030dd`, `78a5494`, `711ef8c`.
- Merged into `frontend/design` as `4f46e6c` (`git merge --no-ff ui-polish-pass`).

## Gate 1

Approved with amendments: resolve part type from the vehicle by `partId` (no DTO
or engine change); keep OS select popups and the 1279/1023/719 drawer breakpoints;
header may add at most one subtitle row; browser journeys may only gain assertions;
falsifiers recorded failing at base. Author's engine citation
(`crates/astraea-core/src/aero.rs:1302-1312`, body tubes push no aero surface) verified.

## Diff review

- Production: `src/console/kit/{Controls,Disclosure}.tsx` (new), `kit/Fields.tsx`,
  `kit/Status.tsx`, stage files, `evidence/*` control swaps, `shell/Shell.tsx`,
  `index.html`, `vite.config.ts`. No engine, schema, preset, gate, threshold or
  export change. No caveat text changed; only wrapping.
- Primitives keep the native element (select/checkbox/range/details), so role,
  accessible name and keyboard behaviour stay native.
- Site display: the run uses `vehicle.launchSite?.altitudeM ?? 0`
  (`src/console/design.ts:119`), so "Not set · sea level standard day assumed" is accurate.
- `scripts/preview-journeys.mjs`: the three removed lines are re-emitted in
  strengthened form; no assertion removed or weakened.
- Tests: `aeroBreakdown`, `aeroBreakdownText`, `missionSite`, `flightInspector`,
  `kit/controls`, `vite.config.test.ts`. Failing runs at base are recorded in
  external evidence `gate2-base/FAILURES.md`.

## Checks run by the coordinator on the merged tree (4f46e6c)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --maxWorkers=2` | 150 files, 1820 tests passed |
| `npx vitest run vite.config.test.ts --reporter=verbose` | collected and passed |
| `pnpm build` | exit 0; `dist/index.html` has `Beta 0.10.0` |
| `pnpm test:browser` | exit 0; 27 journeys passed, including the new themed-control, site/summary and 1280/1024/800 layout journeys |
| Headless Chromium screenshots, all 8 stages at 1600×1000 and 1280×800 | no console errors; Run and Compare are single-line at 1280; site card reads Not set; Flight launch settings are read-only; Aero has no "0 parts" text; caveats wrap in full |

## Disposition

Accepted increment for review items 1–5 and 8–10. Residual cosmetic notes, not blocking:
- At 1280 the mass-budget column header "Share of dry mass" wraps onto two lines.
- The Aero non-lifting sentences list part names in one long comma-joined line.

Out of scope and still open: item 6 (3D view look) and item 7 (empty inspector
with no selection) need an owner design decision. Owner acceptance of the
visible result is pending.
