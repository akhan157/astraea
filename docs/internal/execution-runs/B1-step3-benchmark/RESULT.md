# Lane B1 — step-3 benchmark probes (P9 and S4 report-only rows)

Status: author run complete — **P9 FAIL**, S4 rows report-only; **cannot self-accept**. The
orchestrator verifies every number; a non-OpenAI review follows.

| | |
|---|---|
| Worktree | `/home/ak/.paseo/worktrees/3s8t98rp/b1-step3-final` |
| Branch | `b1-step3-final` |
| Base | `defeeb03c34e87dada27d029ea90cc7e48bf024a` |
| Candidate WASM | `4c1ec4ed7192f0f0eab9206481e74d2627c3a2f8010376a69f9194df10824535` (E1 goal-path build) |
| Baseline WASM | `bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff` (step-0 archive) |
| Manifest | `3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5` |
| Evidence directory | `/home/ak/astraea-evidence/goal-collegiate-accuracy/step3-e1/b1/` |

Tests and probes only. No app, engine, threshold, fixture or input change. The template
identity check (P4) was **not** rerun: the orchestrator already has it.

## Probe changes before running

The inherited probes were reviewed and corrected before any timing run:

- `p9-perf.probe.ts`: the candidate WASM now defaults to the E1 build and its sha256 is
  asserted; the stale "both WASMs are byte-identical" framing is replaced by "options AND
  engine"; the frozen rule is applied literally (max per-case ratio as well as the overall
  median), with the overall median still reported. No fallback to the baseline WASM.
- `s4-rows.probe.ts`: the candidate WASM defaults to the E1 build and its sha256 is asserted;
  rows now carry the clock definitions, the signed difference definition, the source hash,
  the engine hash and the axial-drag line the engine actually used. An explicit failure row
  is recorded per frozen flight if it cannot run.
- `cohort.ts` (new): one shared, hash-checked manifest boundary plus the Amendment 4 adapter,
  so both probes build candidate-default options the same way.
- `run-p9.sh`: passes both frozen WASM paths, asserts their hashes, waits for load < 6
  **and** no other vitest/playwright/bun/npm test process, logs every wait sample, and records
  `free -h` and `uptime` before and after the run.

## Commands and exit codes

### S4 rows

```sh
mkdir -p /home/ak/b1-final/tmp /home/ak/astraea-evidence/goal-collegiate-accuracy/step3-e1/b1
nohup sh -c 'TMPDIR=/home/ak/b1-final/tmp \
  B1_OUT=/home/ak/astraea-evidence/goal-collegiate-accuracy/step3-e1/b1 \
  ./node_modules/.bin/vitest run --maxWorkers=2 \
  --config docs/internal/execution-runs/B1-step3-benchmark/vitest.config.ts s4; echo EXIT=$?' \
  > /home/ak/b1-final/s4-run.log 2>&1 &
```

`EXIT=0` (1 test file, 1 test, 1.52 s). Raw output: `s4-rows.json`
sha256 `b3f051e925007290c5299d39e7a0936d8fa86eda521806efb7a65fe30ac025b4`.

### P9

```sh
mkdir -p /home/ak/b1-final/tmp
nohup sh -c 'bash docs/internal/execution-runs/B1-step3-benchmark/run-p9.sh \
  /home/ak/astraea-evidence/goal-collegiate-accuracy/step3-e1/b1 3600; echo EXIT=$?' \
  > /home/ak/b1-final/p9-launch.log 2>&1 &
```

`EXIT=0`; the wrapper log records `== vitest exit=0`, 1 test file, 1 test, 119.92 s. The
wrapper waited for load < 6 with no other vitest/playwright/bun/npm test process; the wait
sample and pre/post host state are in `p9-run.log`. Raw output: `p9-summary.json` sha256
`0303727c824f7776eb3ea7601257a87860ef72c1b5ac37a925d0e442289a740b`, `p9-raw-ms.json`
sha256 `ac9f76f339c72c2704111518f1a7f7cd28fea12a2ce4b81093fa5ca1c3704e96`.

Only one P9 run was made. The earlier stalled wait-loop attempt is preserved in
`p9-run-aborted-waitloop.log`; it contains no vitest start and timed no flight.

### Pre-run provenance checks

```sh
sha256sum /home/ak/astraea-evidence/goal-collegiate-accuracy/step0/wasm/build1.wasm \
          /home/ak/astraea-evidence/goal-collegiate-accuracy/step3-e1/candidate-4c1ec4ed.wasm \
          /home/ak/astraea-evidence/R40-published-cohort/cohort_manifest.json
```

Exit 0; hashes equal the frozen values in the header. The probes also re-assert them and
abort on any mismatch. `run-p9.sh` logs `hash ok` for both WASMs before its wait loop.

### What was not a valid check

- `tsc --noEmit` on the probes was attempted and exited 1 because `@types/node` is not
  installed in this worktree and the probes are outside the project `tsconfig` (`include:
  ["src"]`). The repo has no probe typecheck script. This is recorded as a tooling limit,
  not a passing check. Runtime validation was the S4 run plus the P9 run.
- An earlier `run-p9.sh` wait-loop defect (the busy check matched its own `grep` command
  line) stalled before any flight was timed. That attempt is preserved as
  `p9-run-aborted-waitloop.log`: it contains hash checks and one wait sample, **no vitest
  start and no timing data**. The script was fixed and this is not counted as a P9 run.

## P9 — performance A/B after the E1 merge

Host: 11th Gen Intel Core i7-1165G7, 8 logical CPUs, 15 GiB RAM. One session, one run,
12 rounds over the 23 cohort entries; three separate engine instances (base, candidate,
A/A). Timed call `simulate_flight`; one untimed warm-up pass per arm; the three arm calls
for a case are adjacent and the arm order is rotated by `(round + case index) % 3`.

**The A/B differs in options AND engine.** Baseline is arm-A manifest options on the
step-0 WASM `bc19590b…`. Candidate is the candidate-default options
(`{ ...options, ...flightRunOptions(adapt(vehicle)) }`) on the E1 WASM `4c1ec4ed…`. A/A is
arm-A options on a fresh instance of the baseline WASM in the same session.

### Host gate and load

- Wait sample 15:50:52: `load1=1.10`, no other vitest/playwright/bun/npm test process,
  no headless Chromium. Pre-run `free -h`: 2.8 GiB free; uptime load 1.10 / 2.75 / 2.95.
- Per-round 1-minute load: 1.14, 1.44, 1.37, 3.16, 2.82, 2.54, 2.50, 2.27, 2.30, 2.18,
  2.37, 2.24. Post-run load 2.24 / 2.71 / 2.92. Every sampled 1-minute load (pre-run,
  per round, post-run) was below 6; the run was not restarted.
- The probe's free-memory reading fell from 8.91 GB to 8.44 GB; the wrapper's `free -h`
  before the run showed 2.8 GiB free and 8.6 GiB available. No swap pressure was observed.

### Per-case medians (12 rounds)

Full precision is in `p9-summary.json`; this table rounds to 0.1 ms and 0.001 ratio.

| # | Case | Base median ms | Candidate median ms | A/A median ms | A/B ratio | A/A ratio |
|---:|---|---:|---:|---:|---:|---:|
| 1 | `qu8k` | 216.8 | 458.5 | 215.2 | 2.115 | 0.993 |
| 2 | `proteus6` | 185.7 | 382.9 | 192.7 | 2.062 | 1.037 |
| 3 | `dontdebatethisn5800mindia` | 169.3 | 328.8 | 168.7 | 1.942 | 0.996 |
| 4 | `kinsel-p4935-a-601-rocket` | 176.0 | 314.3 | 178.5 | 1.786 | 1.014 |
| 5 | `full-metal-jacket1` | 147.6 | 263.4 | 141.4 | 1.784 | 0.958 |
| 6 | `full-metal-jacket2` | 138.2 | 232.2 | 137.9 | 1.680 | 0.998 |
| 7 | `l500roc` | 131.7 | 231.0 | 129.9 | 1.754 | 0.987 |
| 8 | `torrent` | 107.1 | 175.6 | 106.1 | 1.639 | 0.990 |
| 9 | `rabia` | 102.9 | 168.7 | 103.0 | 1.639 | 1.001 |
| 10 | `rabia-shortfincan` | 92.2 | 154.1 | 92.1 | 1.672 | 0.999 |
| 11 | `blister` | 80.1 | 134.4 | 80.7 | 1.678 | 1.007 |
| 12 | `raven` | 89.3 | 138.6 | 90.1 | 1.552 | 1.009 |
| 13 | `iondrive` | 77.1 | 128.9 | 78.3 | 1.672 | 1.016 |
| 14 | `cancerdescending` | 68.3 | 116.1 | 68.0 | 1.701 | 0.996 |
| 15 | `byrum` | 67.0 | 104.4 | 67.9 | 1.558 | 1.013 |
| 16 | `calisp4` | 62.0 | 104.4 | 62.1 | 1.683 | 1.001 |
| 17 | `calisp5` | 60.4 | 101.6 | 60.8 | 1.682 | 1.006 |
| 18 | `ezi65-1` | 55.5 | 90.8 | 55.2 | 1.637 | 0.996 |
| 19 | `calisp1` | 52.4 | 89.5 | 52.2 | 1.707 | 0.996 |
| 20 | `gibb` | 51.5 | 87.8 | 51.9 | 1.705 | 1.007 |
| 21 | `calisp2` | 54.4 | 92.6 | 54.6 | 1.702 | 1.004 |
| 22 | `calisp3` | 54.2 | 91.1 | 53.6 | 1.680 | 0.988 |
| 23 | `thunder-lightning` | 52.0 | 88.3 | 52.0 | 1.696 | 1.000 |

### Summary and frozen-rule verdict

| Statistic | Value |
|---|---:|
| Overall median per-case ratio (A/B) | **1.683107** |
| Aggregate ratio (sum of medians, A/B) | 1.779306 |
| Maximum per-case ratio (A/B) | 2.114683 (`qu8k`) |
| Minimum per-case ratio (A/B) | 1.551870 (`raven`) |
| Cases above 1.10× | **23 of 23** |
| A/A median per-case ratio | 0.999628 |
| A/A aggregate ratio | 1.000463 |
| **Declared A/A spread** `max(|median−1|, |aggregate−1|)` | **0.000463 (0.046 %)** |
| A/A per-case median-ratio range | 0.958 – 1.037 |
| A/A per-round aggregate-ratio range | 0.806 – 1.081 |
| A/B per-round aggregate-ratio range | 1.586 – 1.824 |
| Sum of per-case medians | 2291.8 ms base / 4077.7 ms candidate / 2292.8 ms A/A |

**Verdict: FAIL.** The overall median ratio is 1.683× and every one of the 23 cases is
above 1.10× (maximum 2.115×). The frozen rule reports a slowdown above 1.10× as FAIL; this
is far outside any measurement noise. The candidate default is slower on every cohort entry.

The A/A spread used by the rule is the max of the median-per-case and aggregate A/A
deviations from unity: 0.046 %, well under 10 %, and the base/A-A apogee values matched bit
for bit. The per-round aggregate A/A ratio did range 0.806–1.081; if "spread" were read
from per-round ratios, it would exceed 10 %, which would make a near-threshold result
undecidable. That
reading cannot reverse a 1.68× slowdown, so the FAIL branch applies under either reading;
both numbers are reported here rather than choosing the favorable one.

[INFERENCE] The ≈1.7× cost is consistent with the candidate default's calibrated built-up
drag, which the engine constructs from a baseline pass before the built-up pass. The probe
did not profile pass counts; it measured the shipped `simulate_flight` call. The A/B is a
single host, single session result and does not separate the engine change from the options
change.

No rerun was made and nothing was tuned. The probe stores every round's raw milliseconds in
`p9-raw-ms.json` and the per-round ratios in `p9-summary.json` so the verdict can be
recomputed without rerunning.

## S4 — report-only rows on the final WASM

The rows below are **diagnostic, not validation**. No accuracy claim and no threshold is
changed. All four time-to-apogee flights ran through the app's development-case path
(`src/validation/development/benchmark.ts`), which derives the candidate default options
from each development vehicle. Proteus 6 ran through the manifest DTO plus the same
candidate-default options. Every row's engine sha256 is `4c1ec4ed…`; the engine timing
qualification is `ready` for all four time rows.

### Time to apogee, n = 4 (frozen list)

| Flight | Measured time | Measured source and clock | Simulated ignition→apogee | Signed diff (sim−meas) | Percent diff | Apogee measured → simulated | Drag actually used |
|---|---:|---|---:|---:|---:|---|---|
| Cosmic Cargo, Altimeter Cloud 2986 | 7.454 s | Altimeter Cloud full-log metadata apogee time; source flight clock zero, log includes prelaunch samples | 7.972887 s | **+0.518887 s** | +6.96 % | 291.74 → 363.463 m | calibrated built-up |
| Mini DX3 G69N, 30 Jun 2017 FIP 1 | 12.545 s | maximum sampled `[Altitude (Baro-Ft-AGL)]`; Raven run clock zero per protocol | 13.830186 s | **+1.285186 s** | +10.24 % | 854.549 → 1146.938 m | calibrated built-up |
| Estes Top Shot E12-6, 14 Dec 2017 #1 | 8.845 s | maximum sampled `[Altitude (Baro-Ft-AGL)]`; unshifted Raven record clock | 8.151748 s | **−0.693252 s** | −7.84 % | 309.046 → 301.399 m | legacy tables (calibrated refused: freeform fin set) |
| Madcow Adventurer J510W, 17 Apr 2021 #1 | 23.645 s | maximum sampled `[Altitude (Baro-Ft-AGL)]`; unshifted Raven record clock | 22.293405 s | **−1.351595 s** | −5.72 % | 3197.291 → 3040.367 m | legacy tables (calibrated refused: freeform fin set) |

**Clock caveat (binding on how these rows are read).** The measured and simulated clocks are
not synchronized. The Raven manual describes the record clock as elapsed time from liftoff
detection, which may lag first motion; the development cases declare no ignition-to-recorder
offset. The three Raven rows therefore compare a source-record event time with a simulated
ignition-to-apogee time. The Cosmic Cargo measured time is log metadata on the Altimeter
Cloud flight clock, whose zero relative to ignition is also not established. The signed
differences above include that unknown offset and must not be read as model timing error.
The Raven barometric channel's first samples are 0.05 s apart, so the sampled maximum has
±1-sample (order 0.05 s) resolution; Cosmic Cargo's value is the source's declared metadata,
not a sampled maximum. Percent difference is shown only because the measured values are
nonzero; it is descriptive.

**Drag fallback caveat.** The candidate default asks for calibrated built-up drag. Top Shot
and Adventurer declare freeform fin sets, which the calibrated method refuses; the engine
reports that it used the legacy 25-station tables. Those two timing rows therefore do not
measure the built-up default, and the row records the engine's own `axialDrag` line.

### Maximum Mach, n = 1 (frozen list)

| Flight | Measured | Candidate default | Signed diff | Label |
|---|---:|---:|---:|---|
| Proteus 6 | 2.94 (3201 ft/s, integrated accelerometer, mean of two) | **2.789941 Mach** (927.975 m/s air-relative) | **−0.150059 Mach** (−5.10 %) | **NON-COMPARABLE** |

The source does not state how its Mach number was derived; it reports integrated
accelerometer (ground/axial) velocity and a Mach value without an air-relative definition or
atmosphere. Astraea reports air-relative Mach at committed macro samples with the local
native atmosphere (`docs/internal/output-dictionary.md`). The candidate's speed differs from
the measured 975.665 m/s by −47.690 m/s (−4.89 %), but the velocity and Mach definitions are
not established as the same quantity. The row is reported, not compared. The candidate used
calibrated built-up drag (manifest DTO, candidate-default options); baseline arm A on the
same vehicle reached 2.722162 Mach with legacy tables, shown only as context.

## Evidence files and hashes

All files are under `/home/ak/astraea-evidence/goal-collegiate-accuracy/step3-e1/b1/`.
`SHA256SUMS` lists the seven files below; its own sha256 is
`aa93c5ec9b3dd7d068fa43af5d11bafa3f14ada4601d36900e9b49d6edcccc65`.

| File | Contents | sha256 |
|---|---|---|
| `p9-summary.json` | P9 verdict, per-case medians, per-round ratios, load, provenance | `0303727c824f7776eb3ea7601257a87860ef72c1b5ac37a925d0e442289a740b` |
| `p9-raw-ms.json` | all 12 rounds of raw per-case milliseconds and round totals | `ac9f76f339c72c2704111518f1a7f7cd28fea12a2ce4b81093fa5ca1c3704e96` |
| `p9-run.log` | hash checks, wait sample, pre/post `free -h` and `uptime`, vitest output, exit | `71b0d71dcefc5a9ac4610e121221fd3acdb2faf21c05cb7265dd63bc4c12e35f` |
| `p9-launch.log` | detached launcher exit (`EXIT=0`) | `418a5c17f33c70e99b0cc0a07fce69191489cfedc94164bfa903785777c5bd4b` |
| `p9-run-aborted-waitloop.log` | stalled pre-run wait loop; no vitest start, no timing | `75c7926e76ce47596413cd5f1579cabf9ef891e17817ccec15fe6c44f6776d73` |
| `s4-rows.json` | the four time-to-apogee rows and the Proteus 6 Mach row | `b3f051e925007290c5299d39e7a0936d8fa86eda521806efb7a65fe30ac025b4` |
| `s4-run.log` | S4 vitest output and `EXIT=0` | `6cd3a11aa8658e2b46655faeebcfbe596ec31939fa652a9e858aec68d1f71023` |

## What was not done

- No template identity (P4) rerun; the orchestrator holds that result.
- No app, engine, threshold, fixture or development-input change. Nothing outside
  `docs/internal/execution-runs/B1-step3-benchmark/` was edited.
- No use of `R6-public-cohort/`, any book library, `docs/flight-validation/round2-results.md`,
  Emerald Streak or Vulcanite. Holdout data was not opened.
- No push, network access or download. No committed `node_modules` or WASM.
- P9 is one host, one session, one engine pair. It does not test native execution, other
  hosts, or other engines. The A/B deliberately confounds options and engine because that
  is the shipped candidate comparison after E1.
- S4 is not a synchronized ignition-to-apogee measurement, not a Mach validation, and not
  evidence of physical qualification. The two legacy-drag rows do not exercise the built-up
  default.
- No self-acceptance.
