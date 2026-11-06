# Lane beta-aero-layout — coordinator review

Reviewer: coordinator session (Claude Opus 5.5). Author: OpenCode Go
`opencode-go/deepseek-v4.1-flash` (variant max). The author did not self-approve.
This is independent review, not owner acceptance.

- Base `52979f1`. Lane commits `b2494d6`, `65711b6`, `428605c`, `9a7e7d9`, `7c510cf`, `a27eea2`.
  Merged as `cfca0d2`.
- Process note: the author once ended its turn while a full-suite run was still going
  in a detached background process. The coordinator waited for that run (159 files,
  1892 tests passed) and sent a continuation requiring foreground runs.

## Gate 1

Option A approved: lay out from the native `aggregate_mass` rollup only when the
selected model publishes no parts; CG/CP markers stay the model's own. Amendments:
fix every affected surface, a bounded and coalesced cache, keep-last on failure,
three-preset parity, and record option E (engine DTO extents, one shared rollup) as
an upstream follow-up.

## Diff review

`src/console/hooks.ts`: the geometry rollup rides the same content-keyed cache entry,
under the same LRU bound and stability-pump coalescing. Legacy results never trigger
it, and a rollup failure never turns stability into an error. `Vehicle3D.tsx`: one
shared `layoutFromParts`. Order: model parts, then geometry, then last-ready, then
honest empty. Motor-station fallback added. `Viewport.tsx`: `data-layout-parts` probe
only. No `crates/` or engine changes.

## Checks run by the coordinator on the merged tree (cfca0d2)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --maxWorkers=2` | 159 files, 1892 tests passed |
| `pnpm build` | exit 0 |
| `pnpm test:browser` | exit 0, including "beta aero model: full rocket stays laid out; CP stays the model's own" |
| Coordinator Chromium probe, beta ticked | `data-layout-length` 2.97, `data-layout-parts` 7; screenshot shows the full rocket with CP 2,418 mm (beta), not 2,409 (legacy); no page errors |
| Author falsifier at pin | exit 1, `expected 1 to be close to 2.97` (author log) |

## Disposition

Accepted increment. Owner acceptance pending. Upstream follow-up: option E.
