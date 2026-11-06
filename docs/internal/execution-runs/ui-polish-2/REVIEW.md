# Lane ui-polish-2 — coordinator review

Reviewer: coordinator session (Claude Opus 5.5, Anthropic family). The author is
OpenCode Go `opencode-go/deepseek-v4.1-flash` (variant max) through T3 `delegate_task`,
a different model family. The author did not self-approve. This is independent review,
not owner acceptance.

- Base `6de01f6` (assignment). Lane commits `731010a`, `2b6362e`, `9747baa`, `34df324`.
- Coordinator review fix `109a00f` (see below). Merged into `frontend/design` as `2b39298`.

## Gate 1

Approved. Escape already reverted staged edits (`src/console/Workstation.tsx:147-154`),
so the two-step deselect was approved with guards: nothing staged, palette closed,
shortcuts sheet closed, focus not in a field. The author added a stricter guard for
any open `role="dialog"`, which is acceptable. Motor/Verify placeholders count as
content. The stage-header focus target was approved.

## Diff review

- Production: `Workstation.tsx` (auto rule, pins, Escape), `shell/Inspector.tsx`
  (staged banner hoisted above the empty state), `kit/Table.tsx` (sections, nowrap
  headers), `stages/Aero.tsx` + `aeroBreakdownText.ts` (classification), `Airframe.tsx`
  (mass widths), `Motor.tsx` (note hidden below 2xl), `Shell.tsx` (palette label),
  `common.tsx` (stage-header focus target). `viewport/*`, engine, schema, presets,
  caveats and exports are untouched.
- Classification honours zero vs unknown: unknown CNα renders "—", never 0; an
  engine-reported exact zero renders its value; unknown rows of other types stay
  warning lines carrying the engine's reason.
- **Finding (fixed by the coordinator, `109a00f`):** the manual-close pin stored the
  selected id. On stages with content and no selection (Mission, Flight, Build) the pin
  was `null`, which read as "no pin", so the next stage change reopened a panel the
  user had closed. Replaced with a boolean cleared by a new selection. Regression test
  "keeps a manual close with no selection across stage changes until a new selection"
  failed on `34df324` (`expected true to be false`) and passes after.

## Checks run by the coordinator on the merged tree (2b39298)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --maxWorkers=2` | 152 files, 1837 tests passed |
| `pnpm build` | exit 0 |
| `pnpm test:browser` | exit 0, 27 journeys passed |
| Headless Chromium screenshots at 1600 and 1280 | Airframe loads with the inspector collapsed and the canvas widened; selecting a tube opens it; Escape closes it and focus lands on the tree item; Aero table shows a "Not lifting surfaces" group with "—" cells; search reads "Search" at 1280; no console errors |

## Disposition

Accepted increment for items A, B and C. Owner acceptance of the visible result is
pending. Next queued lane: `viewport-look` (3D view look, per the owner-viewed mockup).
