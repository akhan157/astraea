# Lane `spaceport-landing` — Gate 1: diagnosis

Author: OpenCode Go `opencode-go/deepseek-v4.1-flash` (variant max). The author does not
self-accept; this note asks the coordinator for a decision.

- Lane worktree `/home/ak/.t3/worktrees/astraeat3/t3-b4f7a9d6`, branch `spaceport-landing`,
  pin `edd943d378165f8af7c5bd06a6287c4fc07d9fb7` (`edd943d`, contains the assignment commit).
- `pnpm install --frozen-lockfile` then `pnpm build` are green on this pin
  (`PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2 pnpm build`; the command ends with
  vite's `✓ built in 2.17s` after the engine build step).
- No source files were touched. Evidence bundle:
  `~/.paseo/worktrees/3s8t98rp/evidence-spaceport-landing/` (`SUMMARY.md` is the index).

## Classification: (a) preset data

`PRESET_SPACEPORT_AMERICA` declares **no recovery hardware at all**. It has four
components — nosecone, bodytube, boattail transition, fin set — and zero `parachute`
components (`src/state/presets.ts:148-205`). The engine therefore flies the vehicle
ballistic from apogee to the ground. Nothing is suppressed, dropped or mis-ordered.

This is not new: `git show e7ad2af:src/state/presets.ts` shows the preset has never
carried a parachute since the initial snapshot, which matches the coordinator's
observation that `3685d91` fails the same gate.

It is not (c) intended either: the preset's mission is "Spaceport America · practice
flight" with `targetApogeeM: 5100` (`src/state/project.ts:90-97`), and the Recovery stage
presents the result as a certification failure, not as a ballistic reference.

## Why the failure surfaces as four events and a 184 m/s touchdown

1. `crates/astraea-engine/src/models.rs:800-818` builds the recovery model from the
   component list: `drogue = chutes.first()`, `main = chutes.get(1).or(first)`. With an
   empty list both are `None`.
2. `crates/astraea-core/src/six_dof.rs:2022-2032` (`live_canopy`) returns a canopy only
   when the deployment flag **and** the canopy exist. The apogee and main-deploy state
   flags still transition; no recovery drag is applied because there is no canopy to
   apply it for.
3. `crates/astraea-core/src/six_dof.rs:2952-2990` pushes the `Apogee & Drogue Deployment`
   and `Main Parachute Deployment` events only when a canopy exists — deliberately, so no
   event names a parachute that is not on the vehicle. That is why the timeline silently
   shows four events instead of an obvious "recovery never deployed" marker.

So the engine behaves correctly for a vehicle with no parachutes; the preset describes a
vehicle that has none.

## The run, measured from the shipped artifact

`src/engine/astraea_engine.wasm`, sha256
`26343b7af66cca215ec222a4552b3e75c1d65fcd22c67e7fb5cf5838e76d97af`, driven directly with
the ABI `src/engine/core.ts` uses; identical numbers from the native engine example. The
inputs are exactly what `loadPreset('spaceport')` sends (vehicle, `cesaroni_m1820`, rail
5.2 m at 85°, launch altitude 1400 m ASL, wind 3 m/s, main deploy 300 m).

| Quantity | Measured | Coordinator's UI reading |
|---|---|---|
| Apogee | 5126.49 m at 28.008 s | 5,126 m |
| Max Mach | 1.6779 | 1.68 |
| Static margin | 4.3807 cal | 4.38 cal |
| Touchdown | 67.056 s, **184.296 m/s** | 184.3 m/s |
| Landing energy / mass | 119,728 J / 7.050 kg | 119,728 J |
| Drift from pad | 1152.5 m | 1,152 m |
| validity / touchdown nominal | PASS / true | PASS |

Events the run reports (`flight-shipped-preset.json`):

| Time | Altitude | Speed | Event |
|---|---|---|---|
| 0.000 s | 0.0 m | 0.00 m/s | Ignition & Rail Guidance |
| 0.320 s | 5.2 m | 47.09 m/s | Launch Rail Departure |
| 3.210 s | 992.9 m | 550.67 m/s | Motor Burnout |
| 67.056 s | 0.0 m | 184.30 m/s | Ground Touchdown |

The Recovery stage in the built app (DOM text, Chromium, production CSP) shows
`MAIN OPENS AT — m`, a descent-events table with only `Touchdown 67.06 s 0 m 184.3 m/s`,
and a parachute table with **zero rows**. The failing gate's own reason reads
"Touchdown exceeds the certification limit; **use a larger main**" — which is misleading
here, because there is no main to enlarge.

## Reference: the same engine, a vehicle that has chutes

Flying the NASA Student Launch preset through the same runner (its own motor, rail 3.66 m,
main deploy 213 m):

| | Spaceport (as shipped) | NASA Student Launch |
|---|---|---|
| Apogee | 5126.5 m | 533.1 m |
| Drogue deploy | — | 11.37 s, 533.1 m, 16.60 m/s |
| Main deploy | — | 27.01 s, 213.0 m, 23.17 m/s |
| Touchdown | 184.30 m/s | **5.95 m/s** |

A dual-deploy vehicle lands at 5.95 m/s in this model, which is the 6.0 m/s NASA Student
Launch landing the assignment cites. The 184 m/s is a property of this preset's data, not
of the recovery model.

## Not (b): recovery is not suppressed by Mach, altitude or a tall flight

The shipped preset is supersonic (Mach 1.68) and reaches 5,126 m, i.e. exactly the
conditions a suppression defect would need. Declaring chutes on the *same* airframe and
the *same* flight produces full recovery. Adding two `parachute` components and changing
nothing else in the request:

| Variant | Drogue / main | Apogee | Max Mach | Touchdown | Drift | Flight time | Margin |
|---|---|---|---|---|---|---|---|
| as shipped | none | 5126.5 m | 1.678 | 184.30 m/s | 1152 m | 67.1 s | 4.38 cal |
| A, NASA-SL chutes | 0.60 m / 2.40 m | 4966.5 m | 1.536 | 5.52 m/s | 956 m | 290.4 s | 4.97 cal |
| **B, recommended** | 0.46 m / 1.524 m (60 in) | 5013.5 m | 1.574 | **7.92 m/s** | 491 m | 225.8 s | 4.82 cal |
| C, smaller main | 0.46 m / 1.22 m (48 in) | 5039.5 m | 1.596 | 9.54 m/s | 480 m | 220.2 s | 4.76 cal |
| D, one 60 in chute only | 1.524 m, no second | 5035.5 m | 1.591 | timeout at 300.0 s, no touchdown | 1471 m | 300.0 s | — |

All five rows come from the same shipped WASM. B's events:

    28.18 s  5013.5 m  19.28 m/s  Apogee & Drogue Deployment
   185.14 s   300.0 m  27.11 m/s  Main Parachute Deployment
   225.77 s     0.0 m   7.92 m/s  Ground Touchdown

That falsifies (b) three ways: deployment fires at 5,013 m on a Mach 1.6 flight, both
events are emitted, and the vehicle actually slows. No engine or `crates/` change is
needed, so the "stop if (b)" instruction does not apply.

## Proposed fix (variant B) and the numbers the owner would see

Smallest preset change that gives a physically plausible dual-deployment recovery: append
two `parachute` components to `PRESET_SPACEPORT_AMERICA` in `src/state/presets.ts`,
following the existing NASA Student Launch precedent in the same file (same field set,
same placement convention, same Cd values):

| Component | diameter | cd | mass | axialOffset |
|---|---|---|---|---|
| `sac-drogue` — Drogue Parachute (Apogee) | 0.46 m (18 in) | 1.2 | 0.12 kg | 0.20 |
| `sac-main` — Main Parachute (60 in) | 1.524 m (60 in) | 1.5 | 0.55 kg | 0.85 |

`axialOffset` is measured from the start of the last body tube
(`crates/astraea-core/src/mass.rs:559-563`, `src/recovery/packing.ts:110-118`), so these
land at 0.90 m and 1.55 m from the nose, inside the 2.10 m fuselage — a forward drogue bay
and an aft main bay. `cd` values are the ones the other two presets already use
(1.2 drogue, 1.5 main); masses are nylon canopy + lines for an 18 in drogue and a 60 in
main [INFERENCE: catalog-scale values, no vendor sheet cited].

Why 60 in and not the NASA-SL main: the airframe is 4 in and weighs 7.05 kg at landing. A
60 in canopy is the usual main for that size and gives 7.92 m/s, 26 % inside the
10.67 m/s limit. Variant C (48 in) passes at 9.54 m/s with only 11 % margin. Variant A's
2.40 m canopy is 23.5 body diameters across and, because the vehicle descends longer under
it, drifts almost twice as far (956 m vs 491 m) — it reaches the NASA 6 m/s number by
putting a 6-inch-class parachute on a 4-inch rocket.

Before → after for the owner-visible example (same motor, same site, same fields):

| | As shipped | With B | Delta |
|---|---|---|---|
| Apogee | 5126.5 m | 5013.5 m | −113 m (−2.2 %), mission target 5,100 m still met |
| Max Mach | 1.678 | 1.574 | −0.10 |
| Landing speed | 184.30 m/s | 7.92 m/s | passes `<= 10.67 m/s` |
| Landing energy | 119,728 J | 242 J | — |
| Drift from pad | 1152 m | 491 m | −661 m |
| Flight time | 67.1 s | 225.8 s | +159 s |
| Liftoff mass | 9.90 kg | 10.57 kg | +0.67 kg |
| Static margin | 4.38 cal | 4.82 cal | +0.44 |
| Recovery gates | 0 pass, 1 fail | 1 pass, 0 fail | landing-speed gate flips |

Notes for the decision:

- The static-margin gate (`marginGate`, `src/console/data/adapter.ts:253-260`) fails when
  the margin is above 3 cal, so 4.38 already fails it and 4.82 still does. That gate is
  unchanged by this fix and stays a separate, pre-existing finding.
- A single canopy cannot substitute: the engine maps one chute to both drogue and main
  (`models.rs:814-818`), so a lone 60 in chute opens at apogee and the run times out at
  300 s with no touchdown (variant D). Both components are required.
- I would name the main "Main Parachute (60 in)" and not bake "300 m AGL" into the name,
  because the deploy altitude is a workspace setting (`mainDeployAltitudeM`), not preset
  data.
- Collateral: no fixture edit is needed. `p4Baseline.test.ts` compares only
  cna/cp-bearing components, `geometryParity.test.ts` is generic over components, and the
  Console tests that load `spaceport` either stub stability or only save/open a project.
  The preset's stability, mass and flight numbers all change, so any golden value added
  later must use the "after" column.

## Suggested follow-up, outside this lane's preset fix

Not proposed as part of the fix, listed so it is not lost: the app gives no signal that a
vehicle has no recovery hardware. `RunReadiness` (`src/console/shell/RunReadiness.tsx`)
has no such check and `PreflightIssue` (`src/application/caseResolver.ts:127-137`) has no
code for it, so a chute-less design runs to a red gate whose reason says "use a larger
main". A one-line advisory ("No parachute declared; the run will land ballistic") would
have made this diagnosis immediate. That is a Console-surface change, and whether it
belongs in this lane or a console lane is the coordinator's call.

## What I need to proceed

Approve (a) with variant B, or direct variant A / C / another size, and confirm that
updating the shipped example's numbers (apogee 5,126 → 5,014 m, landing 184.3 → 7.92 m/s,
drift 1,152 → 491 m, margin 4.38 → 4.82 cal) is an owner-visible default shift the
coordinator will take to the owner. On approval I implement only `src/state/presets.ts`,
re-run the shipped WASM and the Recovery-stage DOM probe for the "after" evidence, and
commit. No `crates/`, engine, physics or threshold change is involved.

## Checks run for this note

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0 |
| `PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2 pnpm build` | exit 0 (vite `✓ built in 2.17s`) |
| shipped-WASM `simulate_flight` on the preset request | 5126.49 m / Mach 1.6779 / 184.296 m/s |
| native `legacy_flight_snapshot` on the same request | identical to the row above |
| shipped-WASM `stability` | 4.3807 cal, cg 1.8202, cp 2.2671 |
| four counterfactual `simulate_flight` runs | table above |
| Playwright DOM probe of Recovery stage (built app, production CSP) | 184.3 m/s, empty chute table, no page errors |
| `git status --short` | clean except this file |

Not run at Gate 1: `vitest`, `tsc`, `pnpm test:browser` — no source changed, so they would
only re-measure the pin. They run after implementation.
