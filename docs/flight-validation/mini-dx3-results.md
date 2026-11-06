# Mini DX3 validation results

Protocol: [mini-dx3-protocol.md](mini-dx3-protocol.md) (registered 14423c9,
amendments 1–3). Engine: fin edge drag change 832777a. Reproduce with
`pnpm build:engine && pnpm validate:mini-dx3`.

## 1. Holdout prediction (committed before the holdout logs were decoded)

Only the pre-liftoff pad pressure was extracted from each holdout log before
this commit (G77R/L 922.84 hPa, G79W/L 922.70 hPa, H128W 914.77 hPa; liftoff
found by ICM |a| > 3 g, pad accelerometer ≈0.99 g). No altitude after liftoff
was computed or viewed.

| Flight | Nominal apogee | Nominal time to apogee | MC p05 | MC p50 | MC p95 | Peak Mach | Rail exit |
|---|---|---|---|---|---|---|---|
| G77R/L, 5 Feb 2021 | 933.9 m | 12.20 s | 920.2 m | 945.4 m | 972.1 m | 0.621 | 23.9 m/s |
| G79W/L, 5 Feb 2021 | 991.2 m | 12.65 s | 976.4 m | 1003.3 m | 1031.8 m | 0.617 | 21.0 m/s |
| H128W, 10 Apr 2021 | 1403.6 m | 14.06 s | 1398.3 m | 1426.4 m | 1463.0 m | 0.929 | 33.8 m/s |

Monte Carlo: 200 runs each, seed 20261021, inputs sampled as frozen. Launch
elevation inputs spanned 781–1203 m, 783–1205 m and 854–1309 m (pressure
altitude to the density-altitude temperature bound).

Note before unblinding: on the open development case the same model
over-predicts by +32 %, so the narrow Monte Carlo intervals (input uncertainty
only, no model uncertainty) are expected to be the weak point of the
acceptance rule.

**Secondary F67W GPS check: not evaluable.** The registered GPS pad
definition gives pad altitudes from 31 m to 877 m across the eight logs from
one pad on one day: the receivers had not converged. No prediction was run and
no apogee was extracted; the definition was not changed after the fact.

## 2. Holdout result (decoded after 8c99c6f)

Measured by the frozen definition (MS5 pressure → ISA altitude above the
5 s pad median, 5-sample running median, liftoff by ICM |a| > 3 g).

| Flight | Measured apogee | Time to apogee | Nominal error | In p05–p95 | Within 15 % | Result |
|---|---|---|---|---|---|---|
| G77R/L | 872.4 m | 11.73 s | **+7.0 %** (+61.5 m) | no (920.2–972.1) | yes | fail |
| G79W/L | 934.0 m | 11.99 s | **+6.1 %** (+57.2 m) | no (976.4–1031.8) | yes | fail |
| H128W | 1273.5 m | 13.60 s | **+10.2 %** (+130.1 m) | no (1398.3–1463.0) | yes | fail |

**Holdout: FAIL** under the pre-registered rule (all three flights must pass
both criteria). Time to apogee is over-predicted by 0.47, 0.66 and 0.46 s.

What the result does and does not show:

- The model over-predicts apogee on all three blind flights, by 6–10 %
  (mean +7.8 %), consistent in sign with the development case (+32 % on the
  min-diameter G69N configuration, where an unexplained ~10 % thrust-to-mass
  shortfall is also present).
- Every nominal prediction is within 15 %, but the Monte Carlo intervals cover
  input uncertainty only (mass, CG, impulse, rail, wind, temperature bound),
  not model-form uncertainty, and are ~±3 % wide. A systematic +6–10 % bias
  falls outside them. Reporting a pass on the 15 % criterion alone would be a
  post-hoc change of the rule; this is not claimed.
- Remaining model suspects, not yet tested: drag under-prediction beyond the
  fin edge terms (the development coast Cd is still ~15 % above the model),
  the ISA atmosphere above the pad, and incidence/coning drag not represented
  in the axial build-up. Any change made because of these three flights makes
  them development data; a further claim needs new blind flights.
- Scope: one ~1 m, 41 mm, single-stage airframe with square-edged trapezoid
  fins on G/H motors, Mach 0.6–0.93. Not a general accuracy statement.

Raw logs remain outside the repository (redistribution not yet granted);
digests are in the protocol so the exact files can be re-fetched.
