# App-bound option 2 — app engine + E-1b `6c5d8da`

Date: 2026-11-11. Branch: `appbound/r42-r44-r47-e1b`. Base: `5f17db5`.
Option-1 source: `b2c4896`. Option-2 source: `ea8d633`. Status: **option-2
review ACCEPT WITH FINDINGS, no blocking; frontend proof pending; not pushed.**

## What this is

Option 1 (R42 + R44 + R47 + the default-off R41 seam) plus the owner-approved
E-1b app line:

- `8134ec7` R38 E-1b cylinder base drag backport.
- `9418e02` R38 provenance/plume/disclosure fixes.
- `fded3bb` R39 continuous base drag across r = 1 and pressure identity.
- `6c5d8da` R39 review fixups.

E-1 stays out. E-7 stays out (no `StabilityDto.parts` / `PartExtentDto`).
The TS oracle `src/aero/transonicAero.ts` and
`src/application/aeroModelProvenance.ts` move because E-1b changes the app base
drag; this is the approved E-1b line, not an unrelated port change. The
option-1 review is copied as `REVIEW-OPTION1.md`.

## Diff

`git diff --stat 5f17db5..ea8d633 -- crates src`:

```text
21 files changed, 2949 insertions(+), 90 deletions(-)
```

Includes `aero.rs` (E-1b + R44 tip), `six_dof.rs` (R41/R42 + E-1b identity),
`models.rs` (R42/R44/R47 + E-1b), `commands.rs`, the app-bound evidence test,
E-1b-modified parity fixtures, and the TS E-1b oracle/provenance files.
No generated WASM is committed.

## Identity proof (option 2)

Probe old app `5f17db5` vs option-2 WASM, app's own requests:
`preset-compare.json` (SHA-256 `e34a72…c8c4b`).

| Preset | App engine | Option 2 | Delta |
|---|---:|---:|---:|
| Estes Alpha III + C6 | 299.1795257133733 m | 298.92375069659687 m | **−0.2557750 m** |
| NASA Student Launch + K550W | 533.0760350112048 m | 532.8435782954323 m | **−0.2324567 m** |
| Spaceport America + M1820 | 5013.508465461415 m | 5013.508465461415 m | **0.0 m** |

This matches the expected option-2 defaults (Alpha −0.256, NASA SL −0.232,
Spaceport unchanged). Max velocity/Mach/duration/landing/rail exit change only
by the E-1b flight effect; validity stays PASS. `runManifest` gains only the
additive `thrustPressure`/`axialDrag` keys. WASM: 2,034,664 bytes,
SHA-256 `445098…670cf60`.

## Suites

- Core: **273 passed, 0 failed, 0 ignored, 5 suites**.
- Engine `--lib --tests`: **156 passed, 0 failed, 7 ignored, 19 suites**.

## Bundle numbers on option 2

Primary line, 20 airframes, qu8k excluded:

| Build | MAE | Signed | Within ±10 % |
|---|---:|---:|---:|
| Option-2 bundle | **5.6239628 %** | **+0.2171674 %** | **18/20** |
| Corrected R41 Stack | 5.6126355 % | +0.2369995 % | 18/20 |
| Research R44 bundle | 5.6250576 % | +0.2160449 % | 18/20 |

Delta vs corrected R41 Stack: `+0.011327 pp`. Delta vs the research bundle:
`−0.001095 pp` MAE and `+0.001123 pp` bias. The E-1b app default removes most of
the option-1 bias difference; Phase 2 still passes (MAE ≤ 7 %, 18/20, signed
within ±5 %).

Dev vehicles: Mini DX3 **+29.010 %**, Cosmic Cargo **+24.585 %**, Top Shot
**−2.476 %**, Adventurer **−4.908 %**. Ensembles pass (whole/chunk, zero-sigma
member, single-flight wording). Wiring passes: product-vs-harness tables/apogee
`0.0/0.0`; research comparison `5.45e-2` table / `3.67e-3` apogee, ungated; R3
not run on the app engine.

## Known limitations / review findings

- Option-1 review: **ACCEPT WITH FINDINGS**, no blocking. Non-blocking:
  burnout event description uses ISA speed of sound under anchored air;
  >11 km site pressure discontinuity; `aero_model_status` still reports flight
  refused/legacy; stale test descriptions; “all outputs bit-identical” overstates
  the probe’s selected fields.
- Spaceport America fins on the boattail are refused by the built-up method; the
  template flies legacy drag with the option on.
- Nose tip radius is inert below about Mach 0.9.
- No frontend wiring; E-7 parts excluded.

## Status

Independent review of option 2 pending. No push; no edit to `frontend/design` or
`main`. The frontend coordinator runs its own option-2 proof before merge.
