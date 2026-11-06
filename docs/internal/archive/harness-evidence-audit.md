# ARCAS Harness Evidence Audit

Audit date: 2026-10-09.

Coordinator disposition: this document preserves the inherited-state audit;
historical baseline tables below are superseded by
[`validation-arcas.md`](../validation-arcas.md). The integrated harness now scores
11 re-acquired CAcorr points and excludes 22 quarantined CP/supersonic rows.
The empirical benchmark fails both unchanged research targets: overall MAE
16.40% and peak amplitude 0.50925 versus the required lower bound 0.5103.
ARCAS-specific production Rust/TypeScript parity passes 693 comparisons per
vehicle. The application suite passes 834 tests; `npx tsc --noEmit` passes.
Neither parity nor these repairs establish physical accuracy or independent
provenance for quarantined inputs.
Scope: read-only inspection of the ARCAS validation harness inherited state.
Files inspected: `src/validation/arcas/arcas-validation.test.ts`,
`arcas-vehicle.ts`, `measured-arcas.ts`, `docs/internal/validation-arcas.md`,
`src/tauri/bridge.ts` (for Rust/TS oracle coverage).

---

## Issue 1 — Parser drops the first measurement row

**File/line:** `arcas-validation.test.ts:43`

```ts
const [, header, ...rows] = raw.trim().split(/\r?\n/);
void header;
```

**What happens:** The template literal in `measured-arcas.ts` begins with a
newline after the opening backtick. After `trim()` and `split()`, element [0]
is the CSV header line ("model,quantity,…"). The destructuring skips [0] with
the leading comma, assigns [1] to `header`, and spreads the rest into `rows`.
Element [1] is the **first data row** (ARCAS-short CP at Mach 0.60, 75.3% body
length), not a header. `void header;` silently discards it.

**Dropped row:** `ARCAS-short,CP,0.60,75.3,percent_body_length,NASA TN D-4013,Figure 11 (PDF p.62 / printed p.60),1.0`

**Scientific impact:** The ARCAS-short CP validation starts at M=0.80 instead
of M=0.60, omitting one of six short-body CP points (17% of that series).
The published CP MAE of 5.3% is computed on an incomplete dataset. The
missing point's error would shift the MAE up or down depending on the
prediction at M=0.60.

**Repair:** Change the destructuring to `const [header, ...rows]` and keep
`void header;`, or use a proper CSV parser that separates header from rows
by field names.

**Unknowns:** Whether the 5.3% CP MAE for ARCAS-short in `validation-arcas.md`
would pass or fail the 7% bar with the missing point restored.

---

## Issue 2 — Mach 4.63 clamped substitution

**File/line:** `arcas-validation.test.ts:62–77`

```ts
const last = curves[curves.length - 1];
if (mach > last.mach + 0.051) {
  return { ...last, mach, clamped: true } as ...;
}
```

**What happens:** The aero sweep runs Mach 0–4 (81 points, step ≈0.05). The
two M=4.63 measured points (from TN D-4014 Fig. 5(b)/6(b)) exceed the sweep
edge, so `curveAt` returns the M=4.0 prediction with `.mach` overwritten to
4.63 and a `clamped: true` flag.

**Scientific impact:** The M=4.0 prediction is used as a proxy for M=4.63.
CD changes measurably between M=4.0 and M=4.63 (measured: short 0.230→0.200,
long 0.222→0.225). The clamped point is included in the supersonic MAE
calculation without exclusion or weighting, so the substitution directly
inflates/deflates the published supersonic MAE (12.4%/10.3%). The `clamped`
flag is set but never read by any consumer — it is cosmetic, not functional.

**Repair:** Either extend the aero sweep to M=5 (or at least M=4.7), or
exclude clamped points from the MAE with a documented reason, or report
the clamped-point MAE separately.

**Unknowns:** Whether the TS aero engine is valid beyond M=4 (the underlying
methods may lose accuracy, independent of the sweep edge).

---

## Issue 3 — Overlapping regime boundaries double-count points

**File/line:** `arcas-validation.test.ts:172–176`

```ts
subsonic: [0, 0.9],     // includes M=0.90
transonic: [0.9, 1.2],  // includes M=0.90 AND M=1.20
supersonic: [1.2, 4.63], // includes M=1.20
```

**What happens:** The filter at line 180 (`r.mach >= lo && r.mach <= hi`) uses
inclusive bounds on both ends. Points at M=0.90 (2 CAcorr rows) are counted in
both the subsonic and transonic bands. Points at M=1.20 (2 CAcorr rows) are
counted in both the transonic and supersonic bands.

**Scientific impact:** The per-regime point counts and MAE values in
`validation-arcas.md` are wrong. The supersonic band includes two CAcorr
points from M=1.20 (a coefficient-type mismatch; see Issue 4) alongside
the five CD points per body from TN D-4014. The subsonic band claims a
lower MAE partly because it borrows the steep-slope M=0.90 point into a
band that already includes it via transonic.

**Repair:** Use half-open intervals: subsonic [0, 0.9), transonic [0.9, 1.2),
supersonic [1.2, 4.63]. Re-derive and re-publish the MAE table.

**Unknowns:** Exact magnitude of the MAE shift per band after deduplication.

---

## Issue 4 — CA vs CD comparability is assumed, not validated

**File/line:** `arcas-validation.test.ts:108–126`, `measured-arcas.ts` passim

**What happens:** The CSV carries two quantity types: `CAcorr` (corrected axial
force coefficient, TN D-4013, M=0.60–1.20) and `CD` (drag coefficient,
TN D-4014, M=1.70–4.63). The test at line 117 compares both against
`totalCd` without conversion. The per-regime reporter at line 180 filters
`quantity !== 'CP'`, merging CA and CD points in a single MAE.

At zero AoA, CA ≈ CD, but the TN D-4013 `CAcorr` includes sting and
base-pressure corrections specific to the NASA tunnel setup. The harness
does not document the α=0 assumption, does not note that the two correction
methods (TN D-4013 vs TN D-4014) differ, and does not flag the
coefficient-type boundary in the MAE table.

**Scientific impact:** The transonic band mixes the two coefficient types at
M=1.20 (boundary overlap, Issue 3). Even without the overlap, the
subsonic/transonic MAE is "CA vs CD" while the supersonic MAE is "CD vs CD"
— readers cannot tell which from the doc table.

**Repair:** Add a `coefficientType` column to the report, note the α=0
assumption and the different base-pressure correction methods, and verify
whether the Astraea `totalCd` definition matches the TN D-4013 correction
procedure.

**Unknowns:** The exact TN D-4013 base-pressure/sting correction procedure
and whether it matches Astraea's Hoerner base-drag model.

---

## Issue 5 — Geometry values from unverified "comparison deck" provenance

**File/line:** `arcas-vehicle.ts:11–14, 32–36`

**What happens:** Three geometry values cite a "public comparison deck" rather
than the NASA reports:

| Value | Source claim | Line |
|---|---|---|
| Body tube lengths (28.54 / 41.09 in) | "public comparison deck slides 6/7" | 35–36 |
| Fin root LE from aft end (1.84 in) | "public comparison-deck input" | 32–33 |
| Total length tolerance (0.6 in) | "slide-derived tube lengths vs figure precision" | test:103 |

The task brief states that some data was originally read from a
proprietary-tool comparison deck and later relabeled as NASA figures without
remeasurement. The "comparison deck" cited here is consistent with that
description. No NASA report page/figure citation is given for these three
values.

Additionally, several other geometry constants have precision that exceeds
what a figure reading supports:
- `ARCAS_FIN_SEMISPAN_IN = 2.158` (±0.001 in precision from a figure?)
- `ARCAS_FIN_TIP_IN = 0.375` (exact fraction, plausible but unverified)
- `ARCAS_BOATTAIL_LENGTH_IN = 1.81` (no figure citation)

**Scientific impact:** If these values came from a proprietary tool's input
deck rather than independent measurement from the NASA figures, the
validation is circular: the harness geometry matches the tool's geometry
by construction, not by independent derivation. The "clean-room"
provenance chain is broken.

> **Superseded (2026-10-09).** The original NTRS PDFs (TN D-4013 doc 19670020050,
> TN D-4014 doc 19670020031) were downloaded and the figures inspected; the
> semispan/tip-chord/cross-section constants, the boattail length and the CAcorr
> rows were re-read from those figures, and the 12 unreproduced CP rows were
> quarantined rather than scored. See the repair-status table above, the
> [source-verification section](#source-verification-2026-10-09--completed) and
> [`arcas-source-result.md`](../arcas-source-result.md). The "broken provenance
> chain" describes the inherited 2026-10-08 state, not the current harness.

**Repair:** Each geometry constant must cite a specific NASA report
figure/page with the reading method (ruler on PDF, coordinate extraction,
tabulated value). Values that cannot be traced to a NASA primary source
must be flagged as "unverified, assumed from prior work" and the doc must
not claim "every input is public" until the gap is closed. A re-digitization
from the NASA PDFs (which are genuinely public) would close the gap.

**Unknowns:** Whether the "comparison deck" is a proprietary-tool output, an
independent creation, or a third source. Whether the three unverified
values match what a careful reading of TN D-4013/D-4014 figures would
produce. Whether the 0.375-in tip chord and 2.158-in semispan are
tabulated in the NASA reports or inferred.

---

## Issue 6 — Sweep angle assumed zero without evidence

**File/line:** `arcas-vehicle.ts:104`

```ts
sweepLength: 0, // TN D-4014 Fig. 1(b): straight (zero-sweep) trapezoid
```

**What happens:** The fin sweep distance is set to zero, claiming TN D-4014
Fig. 1(b) as source. ARCAS fins in the NASA figures appear to have a
non-zero leading-edge sweep. The figure is a schematic and must be read
carefully to distinguish true sweep from the visual taper.

**Scientific impact:** Sweep angle directly affects wave drag, normal force
coefficient, and CP position. A 5° sweep error can shift CP by several
percent of body length and change the transonic wave drag contribution.

**Repair:** Re-measure sweep from TN D-4014 Fig. 1(b) using the root-LE and
tip-LE stations. If the figure doesn't resolve the sweep, flag the value
as assumed.

**Unknowns:** The actual sweep distance or angle from the NASA figure.

---

## Issue 7 — Rust core is the production path; harness tests only the TS fallback

**File/line:** `arcas-validation.test.ts:18–19` (imports), `src/tauri/bridge.ts:171–176`

**What happens:** The test imports `computeAerodynamicCurves` from
`../../aero/transonicAero` and `computeRocketStability` from
`../../aero/barrowman` — both are TypeScript modules. The production
application invokes these computations through Tauri IPC to a Rust core:

```ts
// bridge.ts:171–176
/** Mach 0–4 drag/CP curves via the Rust core (only path). */
return getInvoke()<AeroCurveResult>('aero_curves', { ... });

// bridge.ts:166–168
/** Barrowman stability assembly via the Rust core (only path). */
return getInvoke()<StabilityAnalysis>('stability', { ... });
```

The comments say "only path" — the Rust core is the sole production code
path. The TS implementations exist as fallbacks (used in vitest/browser-
only contexts), but the harness validates only those fallbacks.

**Scientific impact:** If the Rust and TS implementations diverge (different
floating-point behavior, different method coverage, different
interpolation), the harness passes while the production code silently
produces different numbers. The published MAE table describes the TS
engine's accuracy, not the Rust engine's.

**Repair:** Add a parallel test path that invokes the Rust core (via a
test Tauri harness or direct Rust unit tests with the same measured data)
and assert that Rust and TS outputs agree to within machine-epsilon.
Alternatively, generate a snapshot from the TS engine and assert the Rust
engine matches it point-for-point.

**Unknowns:** Whether the Rust core's aero implementation is a port of the
TS code, an independent implementation, or backed by a different
numerical library. No `.rs` files exist under `src/` in this worktree, so
the Rust source may live in a separate crate directory.

---

## Issue 8 — Raised-after-failure tolerances

**File/line:** `arcas-validation.test.ts:125, 167, 213–218`

**What happens:** Git history shows tolerances were set after observing the
actual errors:

- `cee097e`: "set CP pass bar at 7% with documented transonic-aft limitation"
- `46b2106`: "pin per-regime MAE bands per external review finding"

The current tolerance values:
- Overall subsonic/transonic CD: < 15%
- CP: < 7%
- Per-regime bands: all < 8–16%

These are "pin" thresholds — they lock in whatever the code currently
produces plus margin, rather than deriving from an independent accuracy
requirement (e.g., "DATCOM claims ±10% for this regime").

**Scientific impact:** The harness cannot distinguish a physics regression
from the expected state because the pass bars were fitted to the output.
A 12% transonic error that drifts to 15% is still "passing," even though
the 3-point drift may represent a real regression. The thresholds do not
correspond to any published accuracy specification for the underlying
methods.

**Repair:** Establish independent accuracy targets from the method
literature (Missile DATCOM validation reports, Barrowman's original
accuracy claims). Set the pass bar at the method's expected accuracy plus
the digitization uncertainty, not at the current output plus margin.
Document the derivation of each threshold.

**Unknowns:** What accuracy the underlying methods (Missile DATCOM wave
drag, Barrowman CP, Hoerner base drag) actually claim in their source
publications.

---

## Issue 9 — Unsupported doc percentages

**File/line:** `docs/internal/validation-arcas.md:15–20`

**What happens:** The accuracy table reports specific MAE percentages (4.0%,
7.8%, 11.3%, etc.) as validated facts. These numbers are artifacts of all
the issues above:

1. Computed on a dataset missing one row (Issue 1)
2. Including a clamped M=4.63 substitution (Issue 2)
3. With double-counted boundary points (Issue 3)
4. Mixing CA and CD coefficients (Issue 4)
5. Against geometry that may not be independently derived (Issue 5)
6. Validating only the TS fallback, not the production Rust core (Issue 7)

The doc also states "Every input is public" (test header, line 9) and lists
provenance that implies clean-room derivation. This is inconsistent with
geometry values traced to an unverified "comparison deck."

**Scientific impact:** The published numbers cannot be cited as validated
accuracy until the underlying dataset and comparison methodology are
corrected. The clean-room language is premature.

> **Resolved wording (2026-10-09).** The "every input is public" line was
> replaced with per-value provenance (NASA figure/page citations, explicit
> approximations) and the still-unreproduced rows are quarantined; see the
> repair-status table above and [`arcas-source-result.md`](../arcas-source-result.md).
> The remaining limit is that parity between two implementations of the same
> model is not empirical validation, and the empirical benchmark still fails
> both unchanged research targets.

**Repair:** After fixing Issues 1–8, re-derive all MAE values and republish.
Replace "every input is public" with an accurate provenance statement that
distinguishes NASA-report-verified values from comparison-deck-derived
values.

**Unknowns:** Whether the corrected MAE values still pass the method-
literature-derived thresholds (Issue 8).

---

## Repair status (2026-10-09)

The audit findings have been dispositioned, not all scientifically resolved:

| Issue | Status | Resolution |
|---|---|---|
| 1. Parser drops first row | **Fixed** | Changed `[, header, ...rows]` → `[header, ...rows]` |
| 2. M=4.63 clamped substitution | **Fixed** | `curveAt` returns null for beyond-sweep; excluded from MAE |
| 3. Overlapping regime boundaries | **Fixed** | Half-open intervals `[lo, hi)` with band boundary at M=1.5 |
| 4. CA vs CD comparability | **Documented limit** | CAcorr is compared at nominal α=0; base-correction compatibility remains unverified |
| 5. Geometry provenance | **Partially resolved** | Original figures inspected; approximations in nose contour, thickness, rear diameter and mass inputs remain explicit |
| 6. Sweep angle | **Corrected approximation** | Zero-sweep removed; 1.215 in (root − tip) approximates the drawn raked fin |
| 7. Rust/TS parity | **Verified** | Production Rust runner passes 693 numeric comparisons per ARCAS vehicle |
| 8. Raised tolerances | **Removed** | Observed-baseline-plus-margin guards deleted; unchanged research targets fail |
| 9. Doc percentages | **Updated** | Current measurements/results recorded in `validation-arcas.md`; historical tables below are superseded |

### Observed baseline (corrected harness) — SUPERSEDED 2026-10-09

> These MAE values were computed before the 2026-10-09 source verification.
> Geometry inputs (fin tip chord, semispan, sweep, cross-section) and the
> CAcorr measured values have since changed, and the supersonic rows are
> quarantined. The numbers below are historical; they must be re-derived by
> re-running the harness. They are NOT current.

| Regime | Mach band | Short MAE | Long MAE | n | Coef |
|---|---|---|---|---|---|
| Subsonic | 0.6–0.9 | 2.8% | 4.6% | 2/2 | CA≈CD |
| Transonic | 0.9–1.5 | 13.6% | 10.8% | 4/4 | CA≈CD |
| Supersonic | 1.5–4.0 | 12.9% | 8.9% | 4/4 | CD (now quarantined) |

2 points at M=4.63 excluded (beyond sweep). All 839 TS tests pass (at the time
of that run). 72 Rust tests pass. TypeScript type-checks clean.

### Per-point error pattern (diagnostic)

ARCAS-short **systematically underpredicts** across all regimes (avg signed
error −12%). Largest error: M=1.00 at −21.5% (transonic peak undershoot).
Root cause: base drag peaks too sharply at exactly M=1.0 on the 0.1 grid.

ARCAS-long **overpredicts in supersonic** (friction Cd higher due to longer
body) but **underpredicts transonic peak** (M=1.00 at −13.8%). The sign
reversal between bodies at supersonic means the method is not uniformly
biased — the error is geometry-dependent.

### Improvement experiment

**Hypothesis (logged before fitting):** The transonic base drag cubic spline
peaks too sharply at M=1.0, causing M=0.95 nearest-neighbor penalty on the
41-point production grid. A broader plateau (M=0.95–1.05 instead of exactly
M=1.0) would reduce the transonic MAE.

**Result:** Implementing this requires changing both `transonicAero.ts` (TS
oracle) and `aero.rs` (Rust port), plus updating all Rust parity test anchors.
This exceeds bounded single-file scope. **Blocker: coordinated TS+Rust change
required.** The hypothesis is actionable and supported by the diagnostic data
but deferred.

---

## Source verification (2026-10-09) — completed

### NTRS records and PDFs

Both reports exist on the NASA Technical Reports Server (NTRS) as public-domain
U.S. government documents. The PDFs were downloaded to local disk and rendered
with a local PDF library (PyMuPDF); the figures below were inspected directly.

- **TN D-4013:** NTRS document 19670020050, accession 67N29379.
  J. C. Ferris, "Static stability investigation of a single-stage sounding
  rocket at Mach numbers from 0.60 to 1.20," NASA Langley, July 1967.
  `https://ntrs.nasa.gov/citations/19670020050`
- **TN D-4014:** NTRS document 19670020031, accession 67N29360.
  C. D. Babb and D. E. Fuller, "Static stability investigation of a
  sounding-rocket vehicle at Mach numbers from 1.50 to 4.63," NASA Langley,
  June 1967. `https://ntrs.nasa.gov/citations/19670020031`

> Correction: an earlier revision of this section claimed the PDFs "cannot be
> downloaded or rendered" (>10 MB, no renderer). That was wrong — a local
> renderer was available and both PDFs were retrieved and inspected.

### Geometry (TN D-4014 Fig. 1, PDF p.10 / printed p.8; TN D-4013 Fig. 1)

Read directly off the rendered dimension drawings:

| Quantity | Figure value | Previous model value |
|---|---|---|
| Body diameter | 2.250 in | 2.25 (agree) |
| Nose length | 10.600 in | 10.6 (agree) |
| Total length, short | 40.950 in | 40.95 (agree) |
| Fin root LE, short / long | 37.300 / 49.850 in | 37.3 (agree) |
| Boattail length | 1.810 in | 1.81 (agree) |
| Fin-root-LE to boattail start | 1.840 in | 1.84 (agree) |
| Fin root chord | 3.380 in | 3.38 (agree) |
| Fin tip chord | 2.165 in (5.499 cm) | **0.375 (wrong)** |
| Fin semispan (radial) | 2.103 in | **2.158 (wrong)** |
| Fin form | trapezoidal double-wedge | **'square' (wrong)** |
| Fin LE sweep | ~30° callout, unswept TE | **0 (wrong)** |
| Total length, long | 53.500 in (D-4014); 23.77d = 53.4825 (D-4013) | 53.4825 (D-4013 value kept) |
| Boattail rear diameter | 0.65d = 1.4625 in (D-4013, no exact inch callout) | 1.50 (retained, flagged) |

Corrections applied in `arcas-vehicle.ts`: tip chord 0.375 → 2.165,
semispan 2.158 → 2.103, cross-section `square` → `double_wedge`, sweep 0 →
1.215 (derived = root − tip). Explicit approximations remain: nose contour is
tabulated (not a tangent ogive), fin thickness is 0.096/0.150 in along the span
but modelled as a single 0.125 in.

### Measured data (TN D-4013 Figs. 11/12, PDF p.62/63, printed p.60/61)

The summary figures plot CP, CAcorr and CA,b vs Mach at α ≈ 0 for fin cant
0 (solid), 2 (dashed) and fins-off (dash-dot), short and long models. The
figures were rendered and the solid fin-cant-0 CAcorr curve was digitised by
pixel analysis of the calibrated grid. Result: the previously recorded
transonic CAcorr values were far off — e.g. short model at M = 1.00 reads
≈ 0.69 (solid), not the recorded 0.545; long model at M = 1.00 reads ≈ 0.73,
not 0.560. The CAcorr rows in `measured-arcas.ts` were therefore replaced with
the digitised solid-curve values (±0.025). The CP rows are quarantined as
UNREPRODUCED-curve-ambiguous: their curve attribution (solid vs dashed) could
not be resolved reliably. They are not scored or treated as direct acquisition.

### Supersonic rows (TN D-4014) — quarantined

TN D-4014 states "Axial-force data were not corrected to free-stream conditions
at the model base" (printed p.4); it presents chamber-axial-force coefficient
CA,c (Fig. 4) and uncorrected pitch characteristics (Figs. 5/6). Its test Machs
are 1.50, 1.80, 2.30, 2.96, 3.96, 4.63. The inherited M = 1.7/2.0/3.0/4.0 "CD,
free-stream corrected, Fig. 5(b)/6(b)" rows are therefore misattributed
(vendor-derived, non-native Machs) and were moved to `QUARANTINED_ARCAS_CSV`.
No TN D-4014 measured values are used by the harness.

## What was NOT checked

1. **Full measured-data re-digitization:** only the CAcorr solid curves were
   re-digitised. CP curves and TN D-4014 supersonic measurements were NOT
   digitised; all 22 inherited CP/supersonic rows are quarantined.
2. **Physical ARCAS accuracy:** Rust/TS parity now passes, but the empirical
   benchmark misses both research goals; CP and supersonic accuracy are unvalidated.
3. **Base-pressure correction compatibility:** Whether TN D-4013's CAcorr
   base-pressure correction is compatible with Astraea's Hoerner model.
4. **Nose-contour and fin-thickness approximations** were not modelled exactly
   (see geometry table).
5. **Private materials:** Not accessed per scope exclusion.

---

## Remaining work

### Blockers (must resolve before citing accuracy)

1. **Resolve the observed empirical misses before claiming accuracy.** The
   corrected benchmark has been run and misses overall MAE and peak-amplitude
   goals. No thresholds were widened and no physics changes were fitted here.
   Run it explicitly with `npm run benchmark:arcas`; production parity uses
   `npm run test:arcas-runtime`.

2. **Digitise genuine TN D-4014 supersonic data:**
   Read CA (and CA,c) at α=0 from TN D-4014 Figs. 5(b)/6(b) (config 1/2,
   fin cant 0) at Machs 1.50, 1.80, 2.30, 2.96, 3.96, 4.63. Note the coefficient
   is NOT free-stream corrected at the base; document how it maps onto the
   engine's CD.

3. **Resolve the CP curves:** determine solid-vs-dashed attribution on
   TN D-4013 Figs. 11/12 and replace the UNREPRODUCED CP rows.

### Candidate experiments (not validated changes)

4. **Transonic drag modelling** — any coordinated TS+Rust change requires
   independent physical justification and pre/post empirical comparison.

5. **Extend sweep to M=5** — allows direct M=4.63 comparison instead of exclusion.
