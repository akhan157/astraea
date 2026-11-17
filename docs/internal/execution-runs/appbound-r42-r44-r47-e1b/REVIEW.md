# App-bound option-2 review

Date: 2026-11-11. Reviewer: **Codex Sol** (`gpt-6.1-sol`, high reasoning),
read-only and independent. Source `ea8d633`, records `08ab089`, against
`5f17db5`. Not frontend, release or physical-validation acceptance.

## Verdict

**ACCEPT WITH FINDINGS.** No blocking findings for the bounded option-2 engine
handoff.

## Scope and physics

- 21 files, +2,949/−90 under `crates src`; HEAD production content equals
  `ea8d633`. Working tree clean.
- Compared `b2c4896..ea8d633` with approved `8fd48f0..6c5d8da`: added lines match
  in all 14 affected files; removed-line differences are pre-existing comments.
- No excluded E-1 change, no E-7 `StabilityDto.parts`/`PartExtentDto`, no
  unrelated default change.
- E-1b keeps the historical base drag below ratio 0.9, blends over 0.9–1.0 and
  uses the cylinder law above it. Rust and TS match the approved line.
- R42 adds the powered pressure correction once; R44 replaces both drag tables
  after one baseline ascent; R47 converts metres to feet once.

## Non-blocking findings

1. `six_dof.rs:3271` burnout text still uses ISA sound speed under anchored air.
2. `six_dof.rs:2026` launch sites above 11 km retain the pressure discontinuity.
3. `aero_provider.rs:313` model status still reports flight refused/legacy.

None becomes blocking by adding approved E-1b. Spaceport refusal, low-Mach tip
inactivity and absent frontend wiring remain bounded limitations.

## Independent numbers

Cohort MAE **5.623962788961215 %**, signed **+0.217167401263750 %**, **18/20**;
delta vs corrected R41 Stack **+0.011327286465020 pp**. Dev: Mini
**+29.00955928713929 %**, Cosmic **+24.58473025918704 %**, Top Shot
**−2.475664253388654 %**, Adventurer **−4.908001389791325 %**. Preset deltas
**−0.255775016776454 / −0.232456715772514 / 0.0 m**; validity PASS; only
`thrustPressure`/`axialDrag` added to the manifest. Wiring `0.0/0.0`; research
comparison `0.0545020972846363 / 0.0036720939670661945`, ungated. Ensembles
pass. Logs: core **273/0/0, 5 suites**; engine **156/0/7, 19 suites**. All seven
evidence hashes and both WASM hashes match.

## Stale claims / residual uncertainty

- `appbound_bundle_cohort.rs:9` retains obsolete test counts, research-equality
  descriptions and a stale command.
- “Stay bit-identical” means versus the current app-bound legacy run; Adventurer
  differs from frozen research B0 by about 1.2683 %.
- “All outputs bit-identical” is broader than the probe’s selected fields.
- R3 remains not run; raw tables/chunk outputs are not fully retained. Reviewer
  did not rerun builds/suites. Frontend’s fresh proof remains required.
