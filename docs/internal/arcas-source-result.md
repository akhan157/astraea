# ARCAS source verification — result report (2026-10-09)

Includes coordinator integration corrections after the worker report. Current
results: 11 CAcorr points scored; 22 CP/supersonic rows quarantined; fin tip
2.165 in and derived sweep 1.215 in. The production Rust smoke passes
693 comparisons per vehicle; the empirical benchmark fails both unchanged
research targets. See [`validation-arcas.md`](validation-arcas.md) for the
current results and commands.

Bounded task: verify the ARCAS harness inputs against the original NASA reports
by actually retrieving and rendering them, then update data/provenance only with
inspected evidence (or quarantine what cannot be supported). No gates, no
commits, no pushes.

## What was done (acquisition method)

The two NTRS PDFs were already on local disk (downloaded by the prior step) and
were **rendered and inspected directly**, not described second-hand:

| Report | NTRS doc | Local file | PDF pages used |
|---|---|---|---|
| TN D-4013, Ferris 1967 | 19670020050 (acc. 67N29379) | `%TEMP%\arcas-D4013.pdf` (2.49 MB, 64 pp) | Fig. 1: p.11–12; Figs. 11/12: p.62–63 |
| TN D-4014, Babb & Fuller 1967 | 19670020031 (acc. 67N29360) | `%TEMP%\arcas-D4014.pdf` (11.88 MB, 79 pp) | Fig. 1: p.10; Figs. 4–6: p.23–42 |

Tooling: local PyMuPDF 1.28.2 (`page.get_pixmap`) for rasterisation + native
OCR text layer for page/label coordinates; a small NumPy pixel-digitiser for
the plot grids. Reading method: hardcopy dimension callouts and calibrated pixel
digitisation of the rendered grids (not scaling a drawing by ruler).

> The prior revision of the audit claimed the PDFs "cannot be downloaded or
> rendered" (>10 MB, no renderer). That was false and is retracted; a renderer
> was available locally and used.

## Evidence by figure

### TN D-4014 Fig. 1 — "Model details" (PDF p.10 / printed p.8)

Station table read directly:

- Config 1 (short): 0.000, 10.600 (26.924), 25.950 (65.913), 37.300 (94.742),
  40.950 (104.013) in.
- Config 2 (long): 0.000, 10.600 (26.924), 35.500 (90.170), 49.850 (126.619),
  53.500 (135.890) in.
- Body diameter 2.250 D; boattail 1.810 (4.597); fin-root-LE-to-boattail-start
  1.840 (4.674); fin root chord 3.380 (8.585); fin tip dimension 2.165 (5.499)
  [coordinator corrected the initial 2.155 inch-field misread]; fin radial 2.103 (5.342); fin thickness 0.096 (0.244)
  and 0.150 (0.381); 0.375 (0.952) on the raked trailing-root edge; 15°/30°
  leading-edge callouts.
- The moment-centre stations confirm the report text: 25.950/40.950 = 63.37 %
  (config 1) and 35.500/53.500 = 66.36 % (config 2).

Consistency check: 40.950 − 37.300 = 53.500 − 49.850 = 3.650 = 1.810 + 1.840,
i.e. the fin root LE is a fixed 3.650 in from the base for both bodies.

### TN D-4013 Fig. 1 (PDF p.11–12) and text (printed p.3–5)

- Dimensionless equivalents: nose 4.71d (=10.60), lengths 18.20d / 23.77d
  (=40.95 / 53.4825), confirming the short total and giving the D-4013 value of
  the long total (D-4014 prints 53.500 — a 0.0175 in inter-report discrepancy,
  preserved).
- Text (printed p.3): "ogive nose ... boattail afterbody that ended with a reflex
  lip. Trapezoidal double-wedge fins were used." → the model's `'square'`
  cross-section and zero sweep were wrong.
- Symbols (printed p.3–4): S = maximum cross-sectional area of the body; moment
  reference at 70 % body length; CAcorr = axial force corrected to free-stream
  conditions at the model base; c_p,b separate. Test Machs 0.60/0.80/0.90/0.95/
  1.00/1.20 (short); long drops 0.95.

### TN D-4013 Figs. 11 / 12 (PDF p.62 / p.63, printed p.60 / p.61)

Each figure shows three panels (CP % body length; CAcorr; CA,b) versus Mach, for
fin cant 0 (solid), 2 (dashed) and fins-off (dash-dot), at α ≈ 0. Rendered and
digitised. Solid fin-cant-0 CAcorr:

| M | short (Fig 11) | long (Fig 12) |
|---|---|---|
| 0.60 | 0.315 | 0.355 |
| 0.80 | 0.332 | 0.372 |
| 0.90 | 0.420 | 0.457 |
| 0.95 | 0.585 | (not tested) |
| 1.00 | 0.689 | 0.729 |
| 1.20 | 0.610 | 0.622 |

The previously recorded transonic values (short 0.545, long 0.560 at M = 1.00)
are far off the solid curve and were replaced. Reading uncertainty ±0.025.

### TN D-4014 Figs. 4 / 5 / 6 (PDF p.23–42)

Fig. 4 = chamber-axial-force coefficient CA,c vs α (α≈0 values ≈ 0.03–0.045,
not the inherited 0.2–0.46). Figs. 5/6 = pitch characteristics: CA vs α (e.g.
config 1 fins-off at α = 0: 0.345/0.34/0.30/0.25/0.215/0.17 for M = 1.50…4.63).
Axial force is explicitly NOT base-corrected (printed p.4). No free-stream-
corrected CD-vs-Mach figure exists in TN D-4014.

## Corrections applied (owned files)

`src/validation/arcas/arcas-vehicle.ts`
- Fin tip chord 0.375 → **2.165** in (0.375 is the raked trailing-root-edge dim).
- Fin semispan 2.158 → **2.103** in (figure radial dimension).
- Fin cross-section `'square'` → **`'double_wedge'`** (report text).
- Fin sweep 0 → **1.215** in (= root − tip). Derived approximation of raked-fin geometry, ±0.05.
- Comments upgraded to the verified value + source for: body diameter, nose,
  boattail length, fin root chord, LE station, fin-root-LE-from-aft, totals.
- Explicit approximations documented: nose contour (tabulated, not tangent
  ogive), fin thickness (0.096/0.150 in modelled as 0.125), boattail rear
  diameter (0.65d = 1.4625 in; retained 1.50).

`src/validation/arcas/measured-arcas.ts`
- CAcorr rows replaced with the digitised solid-curve values (above).
- The worker initially retained flagged CP rows; the coordinator moved all
  12 to `QUARANTINED_ARCAS_CSV` because curve attribution is unreproduced.
- The 10 supersonic rows are also quarantined with the reason recorded.
  None of these 22 rows is scored by the benchmark.
- Provenance/acquisition history preserved in the module header.

`docs/internal/validation-arcas.md`, `docs/internal/archive/harness-evidence-audit.md`
- False "PDFs cannot be downloaded" claim removed and explicitly retracted.
- Provenance sections rewritten with figure/page/URL evidence, the corrected
  values, the approximations, and the preserved long-length discrepancy.
- The historical baseline is superseded by the coordinator's corrected-input
  benchmark run; both research targets fail. No thresholds were widened.

## Included / excluded registry

**Included (used by the benchmark):** 11 re-digitised TN D-4013 CAcorr points.
Reference area = max cross-sectional area of the body.

**Excluded / quarantined:** 12 unreproduced CP rows and 10 supersonic rows.
The supersonic rows carried the
citation "Fig. 5(b)/6(b) free-stream corrected" at M = 1.7/2.0/3.0/4.0 — none of
which is a TN D-4014 test Mach, and TN D-4014 does not produce base-corrected
axial force. Vendor-derived/interpolated; quarantined, never to be recited as
direct NASA acquisition.

## What was NOT checked

- Full CP re-digitisation: the solid-vs-dashed attribution on Figs. 11/12 could
  not be resolved reliably, so CP values were not replaced and are quarantined.
- TN D-4014 supersonic data were not digitised at native Machs (quarantined
  instead of invented).
- Nose contour and fin thickness were not modelled exactly.
- The worker did not check ARCAS-specific Rust parity; the coordinator later
  verified it. Base-pressure-correction compatibility remains unverified.

## Real blockers / remaining limits

1. **Empirical benchmark misses both research goals.** The coordinator ran
   corrected inputs: overall MAE 16.40%; peak amplitude 0.50925 versus a
   minimum 0.5103. CP/supersonic bands have no verified measurements.
2. **Genuine TN D-4014 supersonic digitisation** (native Machs, uncorrected CA /
   CA,c) is still needed before any supersonic claim.
3. CP curves need a human to fix curve attribution.
4. The reconstruction remains an approximation (nose, thickness, sweep) and is
   not the exact NASA model; no exactness is claimed.

## Honest provenance history (preserved)

Values in this harness originated partly from a third-party comparison deck /
vendor slides and were later re-labelled with NASA figure citations. The
supersonic rows were misattributed. This report and the module headers now record
that history rather than erasing it.

## Modified files

- `src/validation/arcas/arcas-vehicle.ts`
- `src/validation/arcas/measured-arcas.ts`
- `docs/internal/validation-arcas.md`
- `docs/internal/archive/harness-evidence-audit.md`
- `docs/internal/arcas-source-result.md` (this report, new)
