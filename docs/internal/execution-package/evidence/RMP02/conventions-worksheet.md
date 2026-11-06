# RMP02-C02/C04 conventions worksheet and near-zero floor

Status: **bounded computational worksheet only; conventions, signs, base correction
and all qualification remain open.** Base `82c595d`, branch
`rmp02-c02-c04-conventions`. Evidence is limited to the retained D1 JSON records,
frozen subsets, retained source-page text/images, the P0 contract and the native
`aero_coefficients.rs`. Numerical/sign statements in the assignment or in earlier
drafts were treated as hypotheses and are marked as such.

Executable guard: `python3 scripts/diagnostics/check-d1-conventions.py`
(schema `rmp02-d1-conventions-check/1.0.0`). It verifies custody through the
accepted `check-reference-eligibility.py` gate, loads every retained
normalized/comparison record read-only, recomputes reference/datum algebra and
injects five refusals on the actual records. Exit 0 means those bounded checks
hold; `qualified_cases` is 0 and the result is not a model or source qualification.

### Rework after coordinator review

The coordinating `openai-codex/gpt-6.1-sol` session returned REQUEST_CHANGES on
commit `e55401c` (appended to `REVIEW.md`). The MiMo no-tools review returned
`402 insufficient funds` and **no verdict**. This rework addresses the four blocking
findings: source/Rust/OCR/prose pinning gates and tests were removed (custody hashes
and manifest attestation bind the bytes; citations remain in this worksheet);
invented source-eligibility tolerances were removed and discrepancies are reported
as arithmetic; retained moments are treated as an explicitly **artificial**
normal/pitch scalar starting at the recorded D-4013 datum; and translation now has
an independent P0 §7.2 known-value full-cross fixture plus a full-cross check on
every retained row. The checker schema is `2.0.0`; the original checker/logs and the
failed-review evidence are preserved. C02 remains blocked, C04 open, qualified
cases zero.

## 1. P0 versus D-4013/D-4014 frame and sign mapping

### P0 (accepted contract, normative for the target provider)

- Body B: `+Y` noseward, `+X` the transverse pitch axis, `+Z` completing `X*Y=Z`,
  right handed. A geometric station is metres **aft of the nose**; the datum is a
  full body position `datumPositionFromNose_B_m`, not a station scalar.
- Total body components: `CA = -CF_B.y`, `CN_pitch = -CF_B.z`, `CN_yaw = -CF_B.x`.
- Moments are returned independently at datum O: `CM_static_O_B`, with
  `CM_G = CM_O + ((r_O-r_G)/L) x CF`.
- P0 fixtures fix the translation and re-reference signs. They do not define the
  source reports' sign convention.

### Retained source evidence

| Evidence | Retained wording/record | Consequence |
|---|---|---|
| D-4013 printed p4 (PDF6), OCR text | "The aerodynamic force and moment data are referred to the body-axis system with the moment reference center located at 70 percent of the body length for both the short body and the long body." | Datum fraction 0.70 is evidenced; the body-axis triad and positive moment sense are not defined in this sentence. |
| D-4013 symbols, same page | `c_A = axial force/(qS)`, `c_A,b = base axial force/(qS)`, `c_A,corr = axial force corrected for base axial force`, `Cm = pitching moment/(qSd)`, `CN = normal force/(qS)`, `Cn = yawing moment/(qSd)`, `S = maximum cross-sectional area of body`, `d = body diameter` | Quantity and normalization definitions are evidenced. |
| D-4013 printed p5 (PDF5) | "fin roll angle, positive clockwise as viewed upstream aft of the model"; `alpha` = "angle of attack of model center line" | Roll and alpha wording is evidenced. The numeric simulator roll mapping is still unbuilt. |
| D-4013 plots, Fig7(b)/(c) (PDF24/27) | CN rises with alpha; Cm falls with alpha at the selected M1.20 series | Plotted derivative signs are observed; they are not a basis/sign certificate. |
| D-4014 printed pp4-5 (PDF6/7) | Same CA/Cm/CN/Cn/CY definitions and limits; alpha and beta accuracy ±0.1 deg; Mach ±0.015 for M1.5-2.96 | Quantity definitions and limits are evidenced. |
| D-4014 Fig5(b) (PDF28/29/30) | CA positive; CN rises with alpha; Cm falls with alpha for M1.50 configuration 1 | Plotted derivative signs are observed at a different moment datum. |
| Frozen ledger (`sb1-foundation.../geometry-ledger.json`) | `"axes": "body axes; normal force and pitching moment signs as plotted; source-to-simulator sign transformation independent review pending"` | The retained record itself declares the sign transform open. |

The source triad orientation, handedness, positive pitching-moment sense and the
numeric roll zero are **not transcribed** in the retained records. Therefore a
source-to-P0 3x3 basis/sign matrix cannot be written from evidence. Both candidate
identifications of the source pitching-moment axis with a P0 axis (including a
possible sign reversal) remain hypotheses because the retained plot slope alone
does not name the axis direction. The assignment's sign language is not evidence.

The checker deliberately does not assign a physical axis label. It pairs retained
CN with retained Cm as an **artificial normal/pitch scalar** and starts each
retained moment at its recorded D-4013 drawing datum. Re-reference and translation
invariance are therefore independent of which physical axis that component denotes,
so the arithmetic below is valid without closing the sign map. The
`length_times_cm_over_cn_m` column is a computational ratio, **not** a qualified
centre-of-pressure station, and the forward datum value is an artificial-coordinate
result, not a source-to-nose conversion.

Unresolved prerequisite: an independently reviewed transcription of the source
body-axis figure/triad, positive moment sense and balance roll zero, with the
resulting documented full basis/sign transform. Until then no source CN/Cm value
may be relabelled as a P0 `CF_B`/`CM_B` component.


## 2. Reference area S and length L, with exact dimensional preservation

### Source and P0 mapping

Both reports normalize force by `qS` and moment by `qSd`, with `S` the maximum body
cross-sectional area and `d` the body diameter (D-4013 printed p4/p5; D-4014
printed p4, frozen-subset `reference` fields). P0 fixes `S = pi*D^2/4` and `L = D`
for a declared maximum external body diameter `D`.

For a circular maximum section (`S = pi*d^2/4`; the reports state a cylindrical
centerbody and give nose ordinates as `diameter/d`, so this is a mapping
declaration, not a new source measurement), the source normalization is
dimensionally identical to the P0 canonical choice with `D = d`. The numeric `S`
is **derived arithmetic**, not an independently transcribed source area.

Two retained diameter declarations must not be collapsed:

| Declaration | Value | Derived S (m^2) | Derived L (m) |
|---|---|---|---|
| Drawing, 2.25 in | 0.05715 m (exact by definition) | 0.002565206612931082 | 0.05715 |
| Report decimal, 5.72 cm | 0.0572 m | 0.002569697126930307 | 0.0572 |

Relative diameter rounding: 8.749e-4; relative area rounding: 1.750e-3. Both
declarations and their derived values are reported as arithmetic. Custody hashes
bind the retained record bytes, so the checker applies no separate source-acceptance
tolerance, no OCR/Rust/prose gate and no second snapshot-validation convention.
Citations in this worksheet are documentation, not executable acceptance rules.

### Re-reference invariance

`CoefficientWrench::rereferenced(old, new)` in `aero_coefficients.rs` implements

```
CF_new = (S_old/S_new) CF_old
CM_new = (S_old/S_new)(L_old/L_new) CM_old
```

and `dimensional(q, refs)` returns `F = q*S*CF`, `M = q*S*L*CM`. Substitution gives
`F_new = F_old` and `M_new = M_old` identically; the derived ratio `L*CM/CN` is also
invariant. The checker recomputes this on every retained paired wrench
(3 normalized M1.20 nominal pairs + 4 M0.60 reader pairs = 7 wrenches) across all
four ordered transitions between the two retained reference declarations:

- 28 reference-invariance rows: force and moment preserved within 2e-12 relative.
- 14 datum-translation rows: retained moments start at the recorded D-4013 drawing
  datum and are translated forward to the D-4014 station and back; the scalar result
  equals the full 3-D cross product on every row. The round trip is a consistency
  check, not the sole proof.
- 6 of the 7 pairs have a zero-free CN envelope; their `L*CM/CN` ratio is
  invariant. The M1.20 nominal-zero pair is refused with
  `CpUnavailable::UncertaintyContainsZero` instead of reporting a ratio.

This is computational invariance of the conversion algebra. It does not prove that
the source `S` equals `pi*d^2/4` for the physical model beyond the stated circular
maximum-section evidence, and it says nothing about source measurement accuracy.


## 3. Moment datum stations and non-conflation

### Evidenced stations

| Report/configuration | Station label | Body length | Fraction | Source of the value |
|---|---|---|---|---|
| D-4013 short (fineness 18.20) | 12.75 d drawing; 70% of L text | 18.20 d | 12.75/18.20 = 0.70055; text 0.70 | Drawing Fig1(a) PDF11 (retained image); text printed p4/PDF6 |
| D-4013 long (fineness 23.77) | 16.63 d drawing; same 70% text | 23.77 d | 16.63/23.77 = 0.69962; text 0.70 | Drawing Fig1(a) PDF11; text printed p4/PDF6 |
| D-4014 configuration 1 short | 25.950 in | 40.950 in | 25.950/40.950 = 0.6336996 | Drawing Fig1(a) PDF10 (retained image); typed frozen-subset `short_moment_station_in`, `short_length_in`, `moment_fraction_text=0.6337` |

`0.70*18.20 = 12.74 d`, so the D-4013 short drawing label and the text fraction
differ by 0.01 d = 0.0005715 m at 2.25 in diameter. This is retained as a bracket,
never overwritten. A pure label-rounding argument does not close it: with 0.01 d
label precision and 70% of a 0.01 d-precision length, the implied intervals are
[12.7365, 12.7435] d and [12.745, 12.755] d, which do not overlap. The long model
shows the same 0.01 d label granularity (0.70*23.77 = 16.639 d vs 16.63 d label);
that second cross-check was read from the retained drawing image and the OCR page
retains only `16.63 d`, so it is cited but not machine-checked.

D-4014 configuration 1 is the **same 18.20-fineness short body** (40.950 in =
18.20 * 2.25 in) but its drawing datum is 25.950 in from the nose, i.e. 63.37% L,
not 70% L. The two reports therefore use distinct moment datums for the same body:

| Comparison | Separation | Separation/L | Separation/d | Coefficient effect at unit CN |
|---|---|---|---|---|
| D-4013 drawing 12.75 d (28.6875 in) vs D-4014 25.950 in | 2.7375 in | 0.06685 | 1.21667 | 1.21667 |
| D-4013 text 12.74 d (28.665 in) vs D-4014 25.950 in | 2.715 in | 0.06630 | 1.20667 | 1.20667 |

Under the artificial scalar pair (`pitch_moment_to = pitch_moment_from -
(x_to - x_from)/L * normal`), translating a retained D-4013 moment forward to the
D-4014 station adds **+1.2167 per unit normal** for the 12.75 d label or **+1.2067**
for the 12.74 d text label. The magnitude is the required translation term; the
directed value is an artificial-coordinate result, not a source sign proof. This is
the O(1.21 C_N) separation the assignment flagged, recomputed from retained
dimensions rather than assumed.

### Guards

The checker refuses, and fault-injection tests prove, direct cross-source Cm
merging without a translation term. It reports both D-4013 station labels and their
0.01 d arithmetic difference, and the D-4014 fraction from its drawing dimensions,
without gating either value on an invented acceptance tolerance; the retained bytes
are bound by custody hashes.

Translation is exercised as an artificial-coordinate forward value from the
recorded D-4013 drawing datum to the D-4014 station, plus an independent P0 §7.2
known-value full-cross fixture (force `(-2,-1,-3)`, nose moment `(6,0,-4)`,
`r_from-r_to=(0,1,0)`, `L=1` gives `M=(3,0,-2)`). Every retained translation row is
also cross-checked against the full 3-D cross product. Round trips are retained only
as a consistency check.

No numeric D-4014 CN/Cm/CA value exists in the retained records; all D-4014 series
remain `frozen_pending_extraction`. Consequently no cross-source Cm translation is
executed, only the dimensional separation and the required term.


## 4. Axial and base conventions, with uncertainty propagation

Four distinct source quantities are retained:

| Symbol | Retained meaning | Status |
|---|---|---|
| `c_A` | measured axial force/(qS), not corrected to free-stream base except the identified summary | D-4013 M1.20 series frozen, unextracted |
| `c_A,b` | "base axial-force coefficient, Base axial force/(qS)" | frozen, unextracted; signed definition absent |
| `c_A,corr` | "axial force corrected for base axial force" | summary line at roll 0, alpha 0; frozen, unextracted |
| chamber/base term | D-4014 states chamber-axial-force values are presented in Fig4; unpowered tunnel | not retained/extracted |
| `c_P,b` | base-pressure coefficient `(p_b - p_inf)/q` | definition retained; not extracted |

Evidenced separation: D-4013 PDF6/printed p4 states "Axial-force data were not
corrected to free-stream conditions at the model base, except for the summary data
at a roll angle of 0 and an angle of attack of 0." The frozen subset marks the raw,
corrected and base series as separate `frozen_pending_extraction` entries and
requires "derive subtraction sign from definitions before combining".

Not evidenced: a signed identity between the three coefficients, the sign of
`c_A,b`, and any numeric base-pressure/correction uncertainty. "Corrected for base
axial force" is a description, not an equation. Therefore:

- no `c_A,corr = c_A - c_A,b` (or `+`) conversion is executed;
- the raw CA accuracy bound **±0.004** is not transferred to corrected axial;
- corrected axial uncertainty is `raw bound + base/chamber contribution`, and the
  second term is unavailable, so the corrected bound is unresolved, not 0.004;
- D-4014 chamber/base information is not a powered-base validation.

The checker refuses raw-to-corrected bound transfer, raw/base merging without an
evidenced sign, and any attempt to mark a frozen axial series as extracted.
Fault-injection tests prove all three refusals.

## 5. RMP02-C04 near-zero floor table

### Rule used

Every retained value is accompanied by its retained absolute envelope: for the
normalized M1.20 records, `digitization_bound + source_bound` (worst-case sum, not
an RSS and not a confidence interval; the records state the errors are correlated).
For the sb1 records, the retained reader interval is used directly. A relative
residual is refused whenever the envelope encloses zero; a `Cm/CN` ratio is refused
whenever the CN envelope encloses zero. Exact zero yields `ZeroDenominator`; the
native cancellation policy (64 machine epsilons) is mirrored for `C_N` sums. This
is the C04 discipline: absolute uncertainty governs, no unstable relative pass.

### Retained M1.20 normalized points (source + digitization envelope)

| Point | Value | Absolute bound | Envelope | Status |
|---|---|---|---|---|
| CN alpha -2 | -0.500000 | 0.085556 | [-0.585556, -0.414444] | bounded read; relative residual admissible |
| CN alpha 0 | 0.027778 | 0.085556 | [-0.057778, 0.113333] | **encloses zero; relative residual refused** |
| CN alpha +2 | 0.611111 | 0.085556 | [0.525556, 0.696667] | bounded read; relative residual admissible |
| Cm alpha -2 | 1.205882 | 0.108824 | [1.097059, 1.314706] | bounded read; relative residual admissible |
| Cm alpha 0 | 0.088235 | 0.108824 | [-0.020588, 0.197059] | **encloses zero; relative residual refused** |
| Cm alpha +2 | -1.058824 | 0.108824 | [-1.167647, -0.950000] | bounded read; relative residual admissible |

The two nominal-zero rows are also the first-batch zero-target exclusions: the
first reader's baseline intersections (0.0/0.0) are preserved but excluded, and the
coordinator/root near-zero centers are provisional. No zero intercept is forced.

### First-batch comparison records (retained readers, same envelopes)

| Point | First reader | Root reader | Root minus first | Envelope | Status |
|---|---|---|---|---|---|
| CN -2 | -0.500000 | -0.500000 | 0.000000 | [-0.585556, -0.414444] | retain both, no averaging |
| CN 0 | 0.000000 (excluded) | 0.027778 | +0.027778 | [-0.057778, 0.113333] | **zero-enclosing; relative refused** |
| CN +2 | 0.611100 | 0.611111 | +0.000011 | [0.525556, 0.696667] | retain both |
| Cm -2 | 1.194000 | 1.205882 | +0.011882 | [1.097059, 1.314706] | retain both |
| Cm 0 | 0.000000 (excluded) | 0.088235 | +0.088235 | [-0.020588, 0.197059] | **zero-enclosing; relative refused** |
| Cm +2 | -1.104500 | -1.058824 | +0.045676 | [-1.167647, -0.950000] | retain both |

### sb1 M0.60 comparison records (reader intervals)

| Point / reader | Value | Reader interval | Encloses zero | Status |
|---|---|---|---|---|
| CN -2 first | -0.304288 | [-0.442600, -0.165975] | no | bounded |
| CN -2 root | -0.273973 | [-0.383562, -0.164384] | no | bounded |
| CN +2 first | 0.423237 | [0.284924, 0.561549] | no | bounded |
| CN +2 root | 0.438356 | [0.328767, 0.547945] | no | bounded |
| Cm -2 first | 0.472050 | [0.316770, 0.627329] | no | bounded |
| Cm -2 root | 0.439394 | [0.318182, 0.560606] | no | bounded |
| Cm +2 first | -0.229814 | [-0.385093, -0.074534] | no | bounded |
| Cm +2 root | -0.257576 | [-0.378788, -0.136364] | no | bounded |
| CN target 0, both readers | null | null | not computable | excluded, no measured center |
| Cm target 0, both readers | null | null | not computable | excluded, no measured center |

All four retained sb1 pairs have overlapping reader intervals and exclude zero in
both readers. The zero targets were jointly excluded; no value, intercept or
relative pass is invented. This permits a bounded absolute comparison at the
non-zero targets only; it does not qualify the points.


## 6. Unresolved prerequisites (exact)

1. **Source axis/sign transform.** Retained text gives the body-axis phrase, roll
   wording and plotted slopes only. The triad orientation, positive pitching-moment
   sense and balance roll zero need independent transcription before any P0 mapping.
2. **12.74 d / 12.75 d.** Both labels retained; the 0.01 d bracket is unresolved by
   label arithmetic and is not overwritten.
3. **D-4013 vs D-4014 datum.** 25.950 in is a distinct station; the 1.2067-1.2167
   CN translation term is required. D-4014 Cm is unextracted, so no translation was
   executed.
4. **Base correction.** Signed `c_A`/`c_A,b`/`c_A,corr` relation, sign of `c_A,b`,
   and any base-pressure/chamber uncertainty term are absent. The raw ±0.004 bound
   remains raw-only.
5. **Reference area.** Numeric `S` is derived from the two retained diameter
   declarations; no independent source area value is transcribed. The 2.25 in and
   5.72 cm declarations differ by 8.749e-4 relative and both remain.
6. **D-4014 roll.** Pitch-test numeric roll mapping is null and unreviewed.
7. **Native geometry.** Finite nose ordinates/tip, reflex lip, boattail and compound
   fin anchors remain unsupported or unclosed for the adapter (RMP08).
8. **Extraction audit.** Local scan skew, anchor calibration and native-density
   (embedded 300 ppi) audit remain open (RMP13); retained coordinates are 144 ppi.
9. **Independent scientific review.** This worksheet is authored, not reviewed.

## 7. Verification performed in this lane

| Command | Exit | Result |
|---|---|---|
| `python3 scripts/diagnostics/check-d1-conventions.py` | 0 | custody pass; 6 normalized points, 6 comparisons, 4 sb1 pairs and 2 excluded zero targets consumed; 28 reference-invariance rows, 14 datum-translation rows, 22 near-zero rows, 5 live refusals; `qualified_cases: 0` |
| `python3 -m unittest discover -s scripts/diagnostics/tests -p "test_*.py" -v` | 0 | 58 tests OK (24 reworked conventions/fault-injection tests plus the retained eligibility and candidate suites) |
| `git diff --check` | 0 | no tracked whitespace errors; the staged new files are checked separately and recorded in EVIDENCE.json |

Raw rework logs and their SHA-256 values are retained outside the repository in
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp02-conventions-nearzero/`; the
pre-review checker/unittest logs and failed-review evidence remain there unchanged.
No build, cargo, pnpm, vite, browser or simulator run was performed; no source was
downloaded; no new numerical reading, line fit, slope or CP was computed; no frozen
artifact or coordinator-owned file was modified.

## 8. Non-claims

This worksheet does **not** qualify the source, the SB1 adapter, any coefficient,
any sign/datum/base conversion, any geometry, any centre of pressure, or any model
accuracy. It provides a bounded computational check of conversion algebra and a
near-zero refusal discipline over the retained records, with the missing scientific
prerequisites named. Independent review and integration remain with the
coordinator.
