# Errata to REPORT.md (independent review, 2026-11-02)

`REPORT.md` is the author's receipt and is kept byte-identical. These lines are wrong:

- Section 4 (lines 77-83), "0.000%" for thrust/weight/CG and "Mass, CG and thrust
  histories are already exact": **not measured.** In `flight_state_aero.rs`
  (lines 268-270) the `thrust_error`/`weight_error`/`cg_error` vectors are never
  populated; `aero.json` records `burnThrust`/`burnWeight`/`burnCg` as `{"n":0}`
  for all nine flights, and the printout turns that into 0.000% via
  `unwrap_or(0.0)`. The unused helpers return SI units while the dump columns are
  lb/in, so a real comparison also needs unit conversion.
- Line 99, "the 20-50% CD gap": per-flight mean base-input CD errors are
  8.3-40.8% (dontdebatethis 8.32% ... qu8k 40.77%); kinsel is ~41% at M2.0.
- Line 117, "6-DOF-vs-engine solver difference": read "6-DOF/table replay
  difference"; with mass/CG/thrust unverified the residual is not attributed to
  the solver alone. The same assumption appears in the test doc comment of
  `flight_solver_replay.rs` lines 3-4 on the lane.
- CP "0.0-2.3%" is the per-flight mean; the per-row maximum is 6.81% (raven).
- The corrected-method summary has no nine-flight mean of 1.3e-5 (that is
  blister alone); the pooled mean is 0.123%.
