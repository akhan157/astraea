# Lane `spaceport-landing` — result

Author: OpenCode Go `opencode-go/deepseek-v4.1-flash` (variant max). **Not self-accepted.**
Coordinator review pending.

- Worktree `/home/ak/.t3/worktrees/astraeat3/t3-b4f7a9d6`, branch `spaceport-landing`.
- Pin `edd943d378165f8af7c5bd06a6287c4fc07d9fb7`. Gate 1 note `0072d56`. Implementation
  `0757ad0`. This report is the commit after it.
- Approval: coordinator message 2026-11-06 — Gate 1 approved, owner chose variant B
  (18 in drogue, Cd 1.2; 60 in main, Cd 1.5), NASA SL conventions; owner told the example's
  defaults shift.

## What changed

| File | Change |
|---|---|
| `src/state/presets.ts:204-227` | `PRESET_SPACEPORT_AMERICA` gains `sac-drogue` (0.46 m / Cd 1.2 / 0.12 kg / axialOffset 0.20) and `sac-main` (1.524 m / Cd 1.5 / 0.55 kg / axialOffset 0.85), in that component order so the engine reads drogue then main. |
| `crates/astraea-engine/tests/fixtures/spaceport-vehicle.json:48-66` | the Rust-side vehicle fixture mirrors the preset, adding the same two components. It already mirrored NASA SL's two chutes; Spaceport had drifted only because the preset had none. |
| `src/console/data/spaceportRecovery.test.ts` (new, 78 lines) | regression test: the preset declares a drogue and a main in that order, and a shipped-WASM flight through the Console adapter emits `apogee_drogue` and `main`, lands at or below `LANDING_SPEED_GATE` (10.67 m/s), and the `landing_speed` gate is `pass`. |

No other production file, test, threshold, tolerance or assertion shape was touched. No
`crates/` source change: the fixture edit is test data, and the two pre-fix P4 baselines
(`p4-stability-baseline.json`, `p4-stability-baseline-ts.json`) are byte-untouched.

### Pinned values updated (rule 1)

There were no numeric Spaceport pins to move. `grep` over `src/` and `scripts/` for the
Gate 1 numbers (5126, 184.3, 4.38, 1152) finds no Spaceport pin — the only `4.38` hits are
NASA SL body-tube masses in aero/layout fixtures and are unrelated. The one Spaceport pin
that does exist is the Rust vehicle fixture, which is a vehicle spec rather than a number:

- `crates/astraea-engine/tests/fixtures/spaceport-vehicle.json:48-66` — appended
  `sac-drogue` and `sac-main`; no existing value changed, no key reordered.
- The existing tripwire that compares fixture to preset, `src/aero/p4Baseline.test.ts:59`,
  went red when the preset changed and green again when the fixture was reconciled. That
  is the tripwire working; the assertion itself was not edited.

No non-Spaceport pin moved. The Rust tests that read this fixture
(`crates/astraea-engine/tests/p4_fin_station.rs`, `p4_baseline.rs`) pass unchanged because
parachutes carry no normal force: spaceport CP stays `2.2670761386797285` and total CNa
`13.115727536343547`; only mass and CG move, and no P4 assertion pins those for spaceport.

## Final measured results

Shipped WASM `src/engine/astraea_engine.wasm`
sha256 `26343b7af66cca215ec222a4552b3e75c1d65fcd22c67e7fb5cf5838e76d97af`
(engine bytes unchanged by this lane; the artifact is the same one Gate 1 measured).

| | Gate 1 (as shipped) | Now |
|---|---|---|
| Apogee | 5126.49 m at 28.008 s | **5013.51 m at 28.18 s** |
| Max Mach | 1.6779 | **1.5736** |
| Drogue deploy | — | 28.18 s, 5013.5 m, 19.28 m/s |
| Main deploy | — | 185.14 s, 300.0 m, 27.11 m/s |
| Touchdown | 184.296 m/s | **7.900 m/s** at 225.88 s |
| Landing energy | 119,728 J | **241 J** |
| Drift from pad | 1152.5 m | **491.3 m** |
| Static margin | 4.3807 cal (cg 1.8202) | **4.8166 cal** (cg 1.7758, cp 2.2671) |
| Dry / liftoff mass | 4.780 / 9.90 kg | 5.450 / 10.57 kg |
| validity / touchdown nominal | PASS / true | PASS / true |

Gates: `landing_speed` = **pass** ("Touchdown is at or below the certification limit",
threshold `<= 10.67 m/s`), `validity` = pass (PASS), `rail_exit` = pass (45.69 m/s >= 15),
`envelope` = pass (Mach 1.57 inside 0–4). Recovery stage is 1 pass, 0 fail. The Aero-stage
geometry margin gate still reports fail at 4.82 cal because it fails anything above the
1–3 cal screening band (`src/console/data/adapter.ts:253-260`); it also
failed at 4.38 before this change, so its disposition is unchanged.

**Told versus measured:** the owner was told touchdown "7.92 m/s". That figure came from
my Gate 1 counterfactual, which used a 1.52 m main. The approved 60 in main is exactly
1.524 m, and the shipped value is **7.900 m/s**. Same conclusion, 0.02 m/s lower; apogee
(5013.5 m) and drift (491 m) are unchanged from what was reported.

### Rendered result (built app, DOM text only)

`probe-recovery-stage.mjs` on the rebuilt `dist/` under the production CSP, Chromium,
1600x1000, no page errors:

    Apogee (committed run) 5,014 m, Modeled
    LANDING SPEED 7.9 m/s · LANDING ENERGY 241 J · DRIFT FROM PAD 491 m
    APOGEE -> TOUCHDOWN 197.7 s · MAIN OPENS AT 300 m
    Landing speed  [Pass]  "Touchdown is at or below the certification limit..."  <= 10.67 m/s
    Descending events: Apogee · drogue 28.18 s 5,014 m 19.3 m/s
                       Main 185.14 s 300 m 27.1 m/s
                       Touchdown 225.88 s 0 m 7.9 m/s
    Parachute table: Drogue Parachute (Apogee) 460 mm 1.20 0.120 kg
                     Main Parachute (60 in) 1,524 mm 1.50 0.550 kg

The parachute table now has both rows (zero rows before) and the bay strip reports
"0 placed" for each chute because neither declares a packed length — identical to the
NASA SL preset's chutes, and the documented behaviour for chutes without a packed length
(`src/console/evidence/RecoveryCard.test.tsx:59-60`). Not a defect, not changed here.

## Falsifier (the test is not tautological)

With `src/state/presets.ts` stashed back to the pin and the new test kept:

    FAIL declares an apogee drogue and a main in that order
         AssertionError: expected [] to have a length of 2 but got +0
    FAIL lands the practice flight at or below the 10.67 m/s limit with the gate passing
         AssertionError: expected [ 'ignition', 'rail_exit', …(3) ] to include 'apogee_drogue'
    2 failed

Both failures are the pre-fix state of this exact preset.

## Checks actually run

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --maxWorkers=2` | **165 files, 1947 tests passed, exit 0** |
| `PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2 pnpm build` | exit 0 (vite `✓ built in 827 ms`) |
| `cargo test --offline --manifest-path crates/astraea-engine/Cargo.toml --test p4_fin_station --test p4_baseline` | 10 tests passed, exit 0 |
| shipped-WASM `simulate_flight` + `stability` on the new preset | table above |
| Playwright Recovery-stage DOM probe (production CSP) | 7.9 m/s, gate `Pass`, both chutes, no page errors |
| `pnpm test:browser` | see below — intermittent pre-existing failure |

### `pnpm test:browser`: intermittent, reproduced on the pin

Four runs on this machine: **run 1 pass, run 2 fail, run 3 pass** on this lane's tree, and
**fail on the untouched pin `0072d56`** with every lane change stashed and `dist/` rebuilt
from it (log `test-browser-base-run1.log`). All three failures are the same assertion with
the same numbers:

    scripts/preview-journeys.mjs:405
    AssertionError: the viewcube must sit inside the canvas
      (rect 508,198,636,326, canvas 300,150)

The passing runs report the same gizmo rect with the correct canvas, so the layout itself
is fine. `canvas 300,150` is the intrinsic default of a just-remounted `<canvas>`; the
check polls only for `data-gizmo-rect` to be non-null (a value left over from the previous
layout) and then reads `document.querySelector('main canvas').getBoundingClientRect()`
without waiting for the canvas to be resized to the reported viewport
(`Viewport.tsx:350` sets the rect; `scripts/preview-journeys.mjs:390-405` reads it)
[INFERENCE: a standalone probe of the same path measures 956x480 with the gizmo inside,
so the failure is a timing window after an earlier journey step, not a layout result].

This is not caused by the preset change and I did not touch the journey script: a one-line
hardening (wait for the canvas rect to match the gizmo's viewport, or for a non-default
size) is a console-lane follow-up. Recorded here rather than silently retried. The
passing run's full log is `test-browser-run3.log`.

## Deliberately not done

- No no-parachute warning (owner has not decided; coordinator instruction 4).
- No engine, physics, threshold, gate-text or `crates/` source change.
- No change to `scripts/preview-journeys.mjs`, not even for the flake above.
- No other preset, no mission target, no workspace default (`mainDeployAltitudeM` stays the
  300 m default; the preset still overrides only rail length).
- No push, merge, tag, release or publish. No image opened, read or attached.
- No self-acceptance.

## Remaining

- Coordinator review of `0757ad0` and this report.
- Decision on the intermittent `test:browser` viewcube check (pre-existing; base
  reproduction attached).
- Optional, owner-gated: the console advisory for a vehicle with no recovery hardware.
