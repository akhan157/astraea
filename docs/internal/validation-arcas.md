# ARCAS research benchmark

The harness runs; the aerodynamic model is **not validated to competitor-level accuracy**. The corrected ARCAS benchmark passes its inherited research gates, but the second-geometry comparison still has substantial error. Rust/TypeScript agreement is a separate, exercised property, not evidence that their shared model is physically correct.

## Corrected-force mapping and published tunnel condition (2026-10-10)

`npm run benchmark:arcas` compares zero-angle corrected axial force (CAcorr) re-acquired from TN D-4013 with the production drag components excluding modeled base drag (`frictionCd + waveCd + protuberanceCd`). TN D-4013 corrects the measured axial force for base axial force; comparing that value with total CD including Hoerner base drag would mismatch the base-pressure terms. Predictions are linearly interpolated from the 41-point production Mach curve (0–4 in 0.1 increments); M=0.95 is not relabelled as M=0.9.

TN D-4013 ([NASA NTRS](https://ntrs.nasa.gov/citations/19670020050)) §“Apparatus and Tests—Model” (PDF p. 6, printed p. 4) specifies a test Reynolds number of 9.8×10^6 per meter and No. 120 carborundum trip strips. The benchmark supplies this published Reynolds condition to the smooth-wall fully turbulent plate correlation, $\bar{C}_f = 0.455/[\log_{10}(Re_L)]^{2.58}$, with the existing Van Driest II compressibility transform (Van Driest, “The Problem of Aerodynamic Heating,” 1956). This is a tunnel condition, not a fitted parameter; no roughness height, CAcorr scale factor, or peak-tuned constant is used.

| Regime | Mach interval | Short MAE | Long MAE | Included points, short/long |
|---|---|---|---|---|
| Subsonic | [0, 0.9) | 11.2% | 4.9% | 2 / 2 |
| Transonic | [0.9, 1.5) | 15.7% | 13.8% | 4 / 3 |
| Supersonic | [1.5, 4] | Not validated | Not validated | 0 / 0 |

Combined CAcorr MAE against modeled non-base CD is **12.42% over 11 readings** (raked-fin planform, PG/Ackeret fin CNa-to-CP, whole-body Hoerner form factor); the inherited 15% combined research target and transonic peak-window check both pass. Those targets were not widened; the short-model transonic band alone is 15.7%, not a separate passed gate. TN D-4013 plot-reading uncertainty is ±0.025 CAcorr (≈5.46% mean relative). No fitted constants. CP report-only residual is unchanged at 4.6pp MAE over 19 in-sweep points.

The old per-regime baseline-plus-margin guards were removed rather than re-pinned to the new output. The benchmark is an explicit command, separate from application unit tests, so a research accuracy shortfall is not disguised as an ordinary code regression.

**Excluded from scoring:** 12 legacy readings (2 CP values with unresolved/non-native long-model points and 10 vendor-derived supersonic values) remain in `QUARANTINED_ARCAS_CSV`. The 21 digitized CP readings are summarized separately as report-only residuals; the two M=4.63 points are outside the model sweep and are not residual-scored. Eleven genuine native-Mach TN D-4014 `CA` readings are recorded separately in `SOURCED_SUPERSONIC_CA_CSV` but remain unscored because the report leaves base pressure uncorrected.

## Production Rust parity

`npm run test:arcas-runtime` builds `crates/astraea-core/examples/arcas_aero.rs` and runs `scripts/arcas-runtime-smoke.mjs` with a dedicated Vitest configuration. It serializes the **current** `ARCAS_SHORT` and `ARCAS_LONG` inputs, invokes the Rust executable, and compares the actual output with the TS engine at identical inputs:

- Stability CP, CNa, CG, mass, length, diameter, static margin and component contributions.
- All 41 Mach points for powered and coasting CD/CP, margins and drag components.
- Curve aggregates and finite values; relative parity limit 0.5%, absolute limit 1e-9 near zero.

Coordinator execution passed both vehicles: **693 numeric comparisons each**, maximum relative discrepancy displayed as 0.000000% (six decimal places), 87 near-zero comparisons each with zero absolute discrepancy. This demonstrates port parity for the reconstructed inputs, not NASA accuracy. The ordinary test suite does not require a compiled example binary.

## Primary evidence and acquisition

- [NASA TN D-4013, Ferris, 1967](https://ntrs.nasa.gov/citations/19670020050): original PDF 64 pages. Geometry Fig.1, PDF pp.11–12 (printed pp.9–10); short/long summaries Figs.11–12, PDF pp.62–63 (printed pp.60–61).
- [NASA TN D-4014, Babb and Fuller, 1967](https://ntrs.nasa.gov/citations/19670020031): original PDF 79 pages. Dimensional geometry Fig.1, PDF p.10 (printed p.8); chamber and pitch coefficients Figs.4–6, PDF pp.23–42.

Both original PDFs were rendered locally with PyMuPDF and inspected. TN D-4013 CAcorr readings come from the fin-cant-zero solid curves of Figs. 11/12 at α≈0, digitized on calibrated plot grids (±0.025 reading uncertainty). Short native Machs: 0.60, 0.80, 0.90, 0.95, 1.00, 1.20; long native Machs omit 0.95.

TN D-4013 defines `CA,b` as base axial-force coefficient and `CA,corr` as axial force corrected for base axial force (Symbols, printed pp. 2–3; PDF pp. 4–5); Figs. 11/12 plot `CA,corr` and `CA,b` separately (printed pp. 60–61; PDF pp. 62–63). Therefore `CAcorr` does not include the measured base-pressure term that the model represents with Hoerner `baseCd`. The benchmark now compares `CAcorr` against the non-base model sum, not total CD. This resolves the coefficient mapping; it does not claim that the report's measured base force and Hoerner's estimate are numerically equivalent.

### CP plot digitization (2026-10-10)

The TN D-4013 Figs. 11/12 CP panels cover −2° ≤ α ≤ 2°; the legend maps solid to fin cant 0°, dashed to 2°, and dash-dot to fins off. TN D-4014 Fig. 7 maps solid config. 1 to the short model and dashed config. 2 to the long model; config. 2 has no M=1.50 point. Each subplot was calibrated from its own gridlines. The table records only native Mach readings, with ±1.5 percentage-point reading uncertainty; no CP readings were interpolated. Per-point figure/page and curve provenance is in `MEASURED_ARCAS_CSV`.

The benchmark separately reports the model-minus-measured `x_cp` residual in percentage points of body length. It normalizes the modeled `cp` distance from the nose by total model length and interpolates only within the production curve's M=0–4 sweep. This diagnostic does not enter either CAcorr assertion. TN D-4014 M=4.63 values remain in sourced storage but are outside the model sweep and are not extrapolated or included in the residual count. One TN D-4013 long-model point at M=0.60 remains quarantined because the solid/dashed curves overlap beyond reliable style attribution; M=0.95 remains quarantined because it is not a native long-model Mach.

| Source / curve | Model | Mach | `x_cp` (% body length) |
|---|---|---:|---:|
| D-4013 Fig. 11 solid fin-cant-0 | Short | 0.60 | 75.0 |
| D-4013 Fig. 11 solid fin-cant-0 | Short | 0.80 | 71.0 |
| D-4013 Fig. 11 solid fin-cant-0 | Short | 0.90 | 72.0 |
| D-4013 Fig. 11 solid fin-cant-0 | Short | 0.95 | 76.5 |
| D-4013 Fig. 11 solid fin-cant-0 | Short | 1.00 | 83.5 |
| D-4013 Fig. 11 solid fin-cant-0 | Short | 1.20 | 85.5 |
| D-4013 Fig. 12 solid fin-cant-0 | Long | 0.80 | 75.5 |
| D-4013 Fig. 12 solid fin-cant-0 | Long | 0.90 | 76.0 |
| D-4013 Fig. 12 solid fin-cant-0 | Long | 1.00 | 71.5 |
| D-4013 Fig. 12 solid fin-cant-0 | Long | 1.20 | 81.5 |
| D-4014 Fig. 7 solid config. 1 | Short | 1.50 | 78.5 |
| D-4014 Fig. 7 solid config. 1 | Short | 1.80 | 75.5 |
| D-4014 Fig. 7 solid config. 1 | Short | 2.30 | 72.0 |
| D-4014 Fig. 7 solid config. 1 | Short | 2.96 | 67.0 |
| D-4014 Fig. 7 solid config. 1 | Short | 3.96 | 60.0 |
| D-4014 Fig. 7 solid config. 1 | Short | 4.63 | 56.0 |
| D-4014 Fig. 7 dashed config. 2 | Long | 1.80 | 77.0 |
| D-4014 Fig. 7 dashed config. 2 | Long | 2.30 | 71.5 |
| D-4014 Fig. 7 dashed config. 2 | Long | 2.96 | 66.0 |
| D-4014 Fig. 7 dashed config. 2 | Long | 3.96 | 59.5 |
| D-4014 Fig. 7 dashed config. 2 | Long | 4.63 | 55.5 |

Unscored D-4013 long-model CP points: M=0.60 (cant-0 attribution unresolved; value quarantined) and M=0.95 (not a native test Mach).

TN D-4014 states axial-force data were **not** corrected to free-stream conditions at the model base, except that Fig. 4 separately presents chamber-axial-force coefficient `CA,c` (Corrections, printed p. 4; PDF p. 6). `CA,c` is not a free-stream base-pressure correction. Figs. 5(b)/6(b) show the native-Mach, zero-angle, zero-fin-cant `CA` readings; these are sourced in `SOURCED_SUPERSONIC_CA_CSV` with ±0.01 plot-reading uncertainty and remain unscored because their base condition is uncorrected.

| Mach | Short `CA` | Long `CA` |
|---:|---:|---:|
| 1.50 | 0.54 | Not plotted |
| 1.80 | 0.47 | 0.52 |
| 2.30 | 0.38 | 0.42 |
| 2.96 | 0.31 | 0.35 |
| 3.96 | 0.22 | 0.27 |
| 4.63 | 0.20 | 0.23 |

Short values are from Fig. 5(b), PDF p. 28 (printed p. 26); long values are from Fig. 6(b), PDF p. 37 (printed p. 35); both are at α=0, δF=0. Fig. 4(a)/(b), PDF pp. 23–24 (printed pp. 21–22), presents `CA,c` by angle of attack and test Mach; the report text explicitly distinguishes it from uncorrected `CA`. No free-stream-corrected supersonic coefficient is recovered or scored.

## Geometry and approximation limits

`src/validation/arcas/arcas-vehicle.ts` is the single input definition. D-4014 Fig.1 establishes body diameter 2.250 in, nose station 10.600 in, totals 40.950/53.500 in, fin leading-edge stations 37.300/49.850 in, boattail length 1.810 in and fin-LE-to-boattail-start distance 1.840 in. Tube lengths are consequently 28.540/41.090 in.

The prior 0.375-in fin-tip chord was a misread trailing-root-edge dimension. The original figure gives **2.165 in (5.499 cm)**, root chord 3.380 in and radial dimension 2.103 in. Report text specifies double-wedge fins, not square. The model uses root-minus-tip sweep 1.215 in as an explicit planform approximation; the detailed raked fin/root geometry is not reproduced exactly.

Remaining approximations:

- The tabulated nose contour is represented by the engine's generic ogive.
- Span-varying 0.096/0.150-in fin thickness is represented by 0.125 in.
- Rear diameter is retained at 1.50 in; D-4013 gives nominal 0.65d = 1.4625 in.
- D-4013 long length 23.77d = 53.4825 in differs slightly from D-4014's 53.500 in; the discrepancy is recorded, not hidden.
- Fiberglass material and 2-mm wall inputs are modelling assumptions, not independently measured model mass/CG. No flight stability claim is made.

Methods cited by the implementation include Barrowman (NASA TM X-67216), NACA Report 1307, Missile DATCOM, Hoerner and Van Driest II. Citing scientific literature is not a legal-clearance claim or proof that every historical input was independently derived. No comparison to a commercial tool is claimed.

## Second geometry: NASA/TM-2005-213541 missile holdout

This is an independent, report-only dataset in `src/validation/missile2005/`; it is not appended to ARCAS points and its residuals do not enter ARCAS assertions. `npm run benchmark:arcas` continues to run the unchanged ARCAS gates and separately prints the missile holdout residuals. No model constant is fitted to these measurements.

### Source, vehicle, and reference normalization

Primary sources: [NASA/TM-2005-213541 report, NTRS 20050160470](https://ntrs.nasa.gov/citations/20050160470) and its [ASCII supplement, NTRS 20050165156](https://ntrs.nasa.gov/citations/20050165156). NTRS identifies the report as NASA/TM-2005-213541 by Jerry M. Allen (Langley Research Center), distribution public, and the work as U.S. Government work with public use permitted. The report PDF and supplement ZIP were downloaded and inspected for this ingestion; the extracted measurement rows and acquisition provenance are kept in the source module rather than checking in the 36 MB archive.

The scored case is configuration 3, `SN-no S-T` (small nose, no strakes, tail fins on). It is a like-for-like body-and-tail case for the available model; the long- and short-strake configurations are not substituted because strake geometry is not represented. NASA/TM-2005-213541 Fig. 6 (PDF p. 42, printed p. 38) gives 42.528-in total length: a 6.293-in baseline small nose to 2.694-in diameter, 7.410-in forward body, 3.875-in expansion to 3.150-in diameter, 23.579-in main body, and 1.371-in aft taper to 3.040 in. Fig. 9 (PDF p. 43, printed p. 39) gives four double-wedge tail fins: 1.992-in root chord, 1.213-in tip chord, 1.953-in exposed span, 0.630-in leading-edge offset, and 0.110-in thickness; the reported single-fin planform area is 0.0217 ft². The nose is represented as an ogive because the production vehicle schema has no exact contour profile. Aluminum and 1-mm wall thickness in the vehicle object are unverified structural placeholders and do not affect the scored drag calculation.

NASA reports configuration `CAF = AF/(q Aref)`, with `Aref = 0.0541 ft²` (rounded) and reference length equal to maximum body diameter `D = 3.15 in`. The harness uses `Amodel = π(3.15 in / 12)²/4` ft², so each measured CAF is converted as `CAFmodel-ref = CAFreport × (0.0541 ft² / Amodel)` before residuals are computed. NASA's pitching-moment reference center is `MS = 23.387 in` aft of the nose and its moment reference length is `D`; neither is transformed or scored because this comparison scores axial force only. In the report's Test Description (printed p. 7, PDF p. 11), the internal diameter is beveled to the outer diameter so cavity pressure acts over the **entire base area**; the corresponding axial-force coefficient is subtracted. The comparable model observable is therefore `frictionCd + waveCd + protuberanceCd`, excluding modeled base drag—not total CD.

All scored rows use `RNFT = 1.5 × 10⁶ ft⁻¹ = 4.92126 × 10⁶ m⁻¹`, model roll `PHI = 0°`, and `FINSET = 1` (all fin deflections 0°). Each tabulated `CAF` is linearly interpolated to α = 0° from the retained bracketing samples in the supplement; predictions are interpolated on the production M=0–4 curve. The reported residual is `CDmodel − CAFmeasured`, with no threshold or pass/fail assertion.

| Mach | NASA test/run | CAF at α=0, report ref | CAF at model ref | CD(non-base model) | ΔCD (relative) | Disposition |
|---:|---:|---:|---:|---:|---:|---|
| 0.60 | 1041 / 1412 | 0.16888 | 0.16882 | 0.21196 | +0.04314 (+25.6%) | Scored, report-only |
| 0.90 | 1041 / 1392 | 0.17470 | 0.17463 | 0.24383 | +0.06920 (+39.6%) | Scored, report-only |
| 1.19 | 1041 / 1372 | 0.29646 | 0.29636 | 0.39924 | +0.10288 (+34.7%) | Scored, report-only |
| 1.70 | 1670 / 655 | 0.30242 | 0.30232 | 0.29483 | −0.00749 (−2.5%) | Scored, report-only |
| 2.36 | 1670 / 666 | 0.26286 | 0.26277 | 0.24552 | −0.01724 (−6.6%) | Scored, report-only |
| 2.86 | 1670 / 677 | 0.23008 | 0.23000 | 0.22229 | −0.00771 (−3.4%) | Scored, report-only |
| 3.95 | 1529 / 251 | 0.18466 | 0.18459 | 0.18778 | +0.00319 (+1.7%) | Scored, report-only |
| 4.63 | 1529 / 210, configuration 1 | 0.24515 | — | — | — | Quarantined: long strakes differ from configuration 3; also outside production M=4 limit |

The seven in-sweep predictions have coefficient MAE 0.03583, bias +0.02656, and relative MAE 16.3%. This is a report-only transfer result, not a pristine blind evaluation or a pass/fail gate. The earlier 129.7% result incorrectly included modeled base drag and is withdrawn as a like-for-like accuracy metric. Correcting only that benchmark observable gave 53.3%; the subsequent production whole-body form-factor correction reduced the comparable error to 16.3%.

The 4.63 row is preserved as evidence, not scored: configuration 3 has no 4.63 test, while configuration 1 at that Mach includes long strakes. The production model also ends at M=4.0, so this point cannot be scored without changing geometry or extrapolating. There are no CP or moment residuals in this holdout because the production curve exposes no moment-coefficient prediction for the same reference center.

The quarantined configuration 1 point shares configuration 3's 3.150-in maximum-diameter, 42.528-in small-nose body and four-fin planform, but adds long cruciform strakes. Fig. 7 gives the long strakes as 17.467 in overall length and 1.173 in maximum height; they are absent from scored configuration 3.

### Whole-body skin-friction form factor correction

`src/aero/transonicAero.ts` and `crates/astraea-core/src/aero.rs` now apply
`1 + 60/f³ + f/400` once using the complete body's fineness ratio. The removed
term reused that closed-body formula on the isolated nose while multiplying
by the whole-body mean skin-friction coefficient. For the NASA missile this
created a nose-local factor of 5.71 versus a complete-body factor of 1.06.
This is a baseline component-accounting correction, not a CFD residual fit;
geometry, Reynolds inputs, fin laws, pressure laws and CP are unchanged.

The transfer improvement has an explicit tradeoff: ARCAS combined relative MAE
increased from 9.91% to 12.42%. Both unchanged research assertions still pass.
The nose-length regression guards against a large artificial friction increase
at fixed complete-body length while retaining the separate nose pressure-drag
response. The compiled Rust runtime parity command passed both ARCAS vehicles.


## Hybrid accuracy scope

The end goal is a fast production aerodynamic model with better experimentally
measured accuracy across supported rocket geometries. Agreement between the
analytic/empirical model and CFD is not itself validation. Colab is an offline
compute tool, not a runtime dependency of the simulator.

### Work order

1. Diagnose the NASA 2005 positive drag bias across Mach, including component
   accounting, geometry representation, reference normalization, and tunnel
   conditions. Fix an identified baseline physics defect before fitting a
   compensating correction.
2. Establish trustworthy SU2 reference cases: reproducible geometry and boundary
   conditions, solver version, mesh and wall-resolution evidence, residual and
   force histories, and mesh/domain sensitivity. Compare like-for-like forces:
   both ARCAS CAcorr and the NASA 2005 cavity/base-corrected CAF exclude the
   base-pressure force; neither may be compared with CFD total drag.
3. Compare the baseline, CFD, and a candidate hybrid against the same experimental
   cases. Use component-level, bounded residual corrections only where they add
   demonstrated information; avoid double-counting an existing drag component.
   Keep the baseline outside the demonstrated correction domain, and report that
   fallback as unvalidated rather than as an accuracy guarantee.
4. Validate transfer to withheld geometries and conditions before production
   bake-in. NASA 2005 has already been examined during model development, so it
   remains a transfer benchmark, not a pristine blind holdout. Reserve additional
   untouched data for final evaluation.

### Acceptance evidence

- Report absolute coefficient error, relative error, signed bias, and worst-case
  error by geometry and Mach regime. Do not hide a poor family in an aggregate.
- Retain the existing ARCAS research gates without widening them. A hybrid must
  improve transfer error and must not introduce material regressions on the
  established cases. Set numerical tolerances using measurement uncertainty and
  CFD discretization sensitivity before fitting.
- Preserve nonnegative drag, sensible limiting behavior, continuity across
  correction boundaries, and Rust/TypeScript agreement. Measure production
  sweep performance against the unchanged baseline.
- An axisymmetric alpha-zero body solve supports body drag investigation only.
  It cannot establish fin/body interference or full-rocket center of pressure.
  CP requires small-angle normal-force and pitching-moment derivatives with the
  relevant finned geometry; surface pressure coefficient is not center of
  pressure, and the alpha-zero moment/normal-force ratio is undefined.
- Drag and CP accuracy are separate from flight validation. Apogee, trajectory,
  and stability claims additionally require suitable motor, mass/CG, atmosphere,
  and flight measurements.

The documented starting point is ARCAS corrected non-base drag MAE 9.91% over
11 readings and NASA 2005 corrected non-base relative MAE 53.3% over seven
readings. Keep geometry and test-condition results separate rather than combining
them into one headline. Neither establishes superiority over any other
implementation; that requires an exercised, like-for-like comparison.

## Reproduction

```sh
npm run benchmark:arcas        # Prints research errors/exclusions; NASA 2005 is report-only.
npm run test:arcas-runtime     # Builds and runs the actual production Rust path; parity passes.
npm test                      # Ordinary application tests; separate from research targets.
npx tsc --noEmit
```

See `docs/internal/archive/harness-evidence-audit.md` for the historical audit and coordinator disposition, `docs/internal/arcas-source-result.md` for the source worker's report, and `docs/internal/arcas-rust-smoke.md` for the Rust CLI schema and runner.
