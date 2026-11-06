# Lane spaceport-landing — coordinator review

Reviewer: coordinator session (Claude Opus 5.5). Author: OpenCode Go
`opencode-go/deepseek-v4.1-flash` (variant max). The author did not self-approve.
This is independent review, not owner acceptance.

- Base `edd943d`. Lane commits `0072d56` (Gate 1), `0757ad0`, `03b337a`. Merged as `302ff66`.

## Owner decision (2026-11-06)

Gate 1 classified the cause as preset data: `PRESET_SPACEPORT_AMERICA` never had a
parachute, so the flight landed ballistic. The owner chose **option A**: add an 18 in
drogue (Cd 1.2, 0.12 kg) and a 60 in main (Cd 1.5, 0.55 kg), following the NASA Student
Launch conventions. The owner was told the example's results shift. The "no parachute
in this design" warning was offered and not decided, so it was not built.

## Diff review

- `src/state/presets.ts`: two parachute components appended, drogue before main.
- `crates/astraea-engine/tests/fixtures/spaceport-vehicle.json`: the same two
  components. This is test data that mirrors the preset, not engine source; the P4
  `p4Baseline.test.ts:59` tripwire requires the preset and the fixture to agree. No
  existing value changed. Accepted; the research session is notified.
- `src/console/data/spaceportRecovery.test.ts`: new regression test (drogue + main
  present; shipped-WASM run lands ≤ 10.67 m/s; landing gate passes). It fails with
  the preset change stashed.
- No other example's numbers moved, and no tolerance or assertion changed.

## Coordinator fix: flaky viewcube journey (`c5c74b6`)

The author reproduced an intermittent `pnpm test:browser` failure on the untouched
base `0072d56`: "viewcube must sit inside the canvas (canvas 300,150)". The check read
the canvas before it had resized from its default. The journey now polls until the
canvas and footprint agree, then runs the unchanged exact assertions.

## Checks run by the coordinator on the merged tree (302ff66)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --maxWorkers=2` | 165 files, 1947 tests passed |
| `pnpm build` | exit 0 |
| `pnpm test:browser` run 1 | exit 0 |
| `pnpm test:browser` run 2 | exit 0 |

Browser logs include "Spaceport America (practice): Apogee (committed run) 5,014 m".
Author-measured run: landing 7.900 m/s, drift 491 m, all gates pass.

## Disposition

Accepted increment. `frontend/design` is ready for the owner's decision on a local
merge into `main` (no conflicts; push and deploy remain off).
