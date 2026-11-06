# N1 native numerical controls — 2026-10-26

The bounded diagnostic completed exactly 20 native flight attempts, with no
failed attempts or retries. Four default native results reproduce their saved
WASM DTOs within the predeclared budgets. All 20 runs terminate at touchdown;
Cosmic retains production validity PASS and Mini DX3, Top Shot, and Adventurer
retain UNKNOWN with safety outputs closed. These statuses do not establish
physical accuracy or primary-use suitability.

The raw-free [JSON summary](N1-numerical-controls-2026-10-26.json) contains every
run's coarse scalar values/deltas, event deltas, retained-sample peaks, complete
counters, termination/validity/safety state, resource observations, and output
hashes. Full evidence remains outside Git at
`/workspace/astraea-plan/evidence/accuracy-first-batch-20261025/N1`.

## Method and provenance

Base production source is `00e768b2d2dcfc9913b2a9428040a67fd42d3d58`.
Only a generated external shadow has numerical controls/counters; production
source and physical models were unchanged. All 22 copied production files match
base Git. The exact declared inverse edits recover the complete original
`six_dof.rs`; all other generated production files remain byte-identical.
The native executable calls the copied engine dispatch and normal engine
preparation/output paths once per counted process, using the frozen,
previously frontend-prepared wire DTO. It does not rerun TypeScript preparation.

Root reviewed seal
`5d26776953735fcc371b40f9c8136b963b3c7f38185e7fe35515242daae972b5`
before approving ordinals 1–4, then approved ordinals 5–20 after default parity.
The executable hash matches the retained original build record:
`244b9d2edb70856bc95efb011b0d2a66aebf18fb36ef8a64be72a200f8456c1b`.
The call manifest, review seal, build, generated source, 90 analytic cases,
108 root checks, and four frozen request/expected DTO pairs were preserved.
No build or analytic cases were repeated, no new observations/source CSVs were
loaded, and no new WASM calls were made. The earlier 20 WASM sensitivity calls
were reused only as existing provenance/default outputs.

**Historical recipe identity is unverified.** The preparer's preparation-time
hash is `9127834063236011ff8f600f3f97735e65df694859d67aa23368df03821fa0da`;
its retained bytes on resume hash to
`7f642a5d3dda99e51d44d4afee9e3137185883045caf14b2fbed5cdeb4e8d2d5`.
The earlier script bytes are unavailable. Root accepted the independently
verified actual generated source, source inventory/inverse proof, unchanged
compiled main/appendix, and recorded binary build hash. There is no claim of
bit reproduction by the historical script. Neither original manifest was
rewritten to conceal this discrepancy.

The [seam README](../../../../scripts/diagnostics/numerical-controls/README.md)
details the exact controls, counter scope, comparison budgets, and durable
reservation/resume guards. Ordinary and crossing-reintegration tolerance
vectors were scaled together; macro step 0.01 s, maximum adaptive step 0.05 s,
initial adaptive step 0.005 s, and root search method stayed fixed. Root-only
probes use integration scale 0.01 as their reference.

## Default native/WASM comparison

The semantic comparison covers all DTO keys, ordered arrays/events, strings,
booleans, nulls, coarse quantities, timestamps, quaternions, and retained display
channels. Across four cases it compared 303688 numeric fields, 28 booleans, and
100 strings. There were zero schema or out-of-budget differences. The maximum
absolute numeric difference was 1.797680385627609e-14; quaternion component
differences were at most 5.551115123125783e-16. Every telemetry timestamp and
all 245091 rounded nonterminal numeric channels matched exactly. These are
computational reproduction gates, not physical error bounds.

## Controlled sensitivity results

The following are maximum absolute differences across the four cases.

| Controls | Reference | Apogee altitude (m) | Event time (s) | Landing distance (m) | Rail-exit velocity (m/s) |
|---|---|---:|---:|---:|---:|
| Integration scale 0.1 | Native default | 0 | 0 | 0 | 0 |
| Integration scale 0.01 | Native default | 0.0186918783 | 0.0023828125 | 0.00132055237 | 7.10543e-15 |
| Root tolerance 1e-6 s | Integration 0.01 | 6.74005e-6 | 9.765625e-6 | 0.000214085082 | 0.00147946781 |
| Root tolerance 1e-7 s | Integration 0.01 | 8.42890e-6 | 9.841919e-6 | 0.000225798562 | 0.00156166063 |

At integration scale 0.01, Cosmic's apogee altitude increases by
0.00869658867 m and duration by 0.0023828125 s; Mini DX3's apogee increases by
0.0186918783 m and duration by 0.0002734375 s. Top Shot's reported coarse
scalars are unchanged, and Adventurer's largest relevant changes are floating
roundoff scale. Event names/order and all validity/safety dispositions remain
unchanged. An unchanged scale-0.1 result followed by a changed scale-0.01 result
does not establish monotonic convergence, a convergence order, or a universal
error bound.

For integration scale 0.01, the retained altitude peak changes by at most one
0.1 m display increment; retained speed, Mach, acceleration, dynamic-pressure,
drag, thrust, incidence-angle, and displayed body-rate-norm peak values are
unchanged. All these retained peak values remain unchanged in both root-only
probes. Their peak times and other output values can still change.

The wire telemetry is display sampled, rounded, and decimated to at most 5000
points. Cosmic reaches that cap; other cases retain 2188, 1114, and 3373 points.
Every run's last retained time equals its touchdown duration. There is no
silent prefix truncation, but the original full-series point count and omitted
extrema are unavailable from these DTOs. Retained-sample peak differences can
include changing sample selection and rounding; they are not continuous-time
peak errors. No tight-run trajectory norm was inferred from array index
alignment or interpolated rounded data.

Attitude comparisons use only exactly common retained timestamps and a
sign-invariant relative-quaternion angle, computed with `2*atan2` to preserve
small-angle resolution. Their maximum differences are 0 rad at integration
scale 0.1, 0.000236642140 rad at scale 0.01, and 1.66607471e-5 /
1.71320153e-5 rad for root tolerances 1e-6 / 1e-7 s relative to scale 0.01.
The JSON records matched/unmatched sample counts and each maximum's time.
Missing retained times and between-sample attitudes are not bounded by these
comparisons. Unchanged rounded retained peaks provide no resolution proof.

## Counters and verification

Ordinary-path totals are 209511 attempted, 209487 accepted, 24 rejected trials,
and 104755 integration segments. Event reintegration totals are 160 attempted
and accepted trials, zero rejections, and 80 segments. The 24 ordinary
rejections occur in Cosmic/Mini DX3 at integration scale 0.01 and its root-only
probes. Every attempted count equals accepted plus rejected. Counts include
discarded event-restart work, not only uniquely committed steps.

Root bisection counts are 40 per flight at 1e-5 s, 56 at 1e-6 s, and 68 at
1e-7 s (976 total). The maximum observed quaternion norm departure is
3.3306690738754696e-16. Analytic root-helper counts are uninstrumented and stay
zero; the retained 108 analytic root checks passed their right-end brackets.
The retained 90 fixture cases separately pass endpoint/off-node gates; maximum
off-node position/velocity/attitude errors are 0.000224058688 m,
0.000784369581 m/s, and 3.50788271e-9 rad.

Flights ran on CPU 1, with maximum sampled process-tree RSS 57752 KiB and
6.02861666 s summed flight wall time. Memory was polled every 20 ms; this is
an observed peak, not a kernel-enforced RSS guarantee. Original build child
peak RSS was 267956 KiB. No resource stop occurred.

Five flight-free Python tests passed for whole-DTO traversal/type/schema and
numeric budgets, interrupted charged reservations, duplicate/orphan evidence,
and hashed successful resume. Final full-state runner verification passed at
20/20 attempts. No kernel fixes, production tolerance changes, or physical
model changes are proposed by this packet.
