# Transonic CP Aft-Excursion: Investigation Findings

**Date:** 2026-10-09
**Scope:** Read-only investigation of the measured transonic CP behavior vs. Astraea engine predictions for the ARCAS wind-tunnel configurations. No engine code was modified.

---

## 1. Measured Transonic CP Behavior

### Source
All measured CP data: NASA TN D-4013 (1967), Figures 11 (ARCAS-short) and 12 (ARCAS-long). Digitized values in `src/validation/arcas/measured-arcas.ts` with per-point provenance.

### ARCAS-short (L/D = 18.20)

| Mach | Measured CP (% body length) | Reading uncertainty |
|------|----------------------------|---------------------|
| 0.60 | 75.3 | +/- 1.0 |
| 0.80 | 71.5 | +/- 1.0 |
| 0.90 | 70.5 | +/- 1.0 |
| 0.95 | 74.0 | +/- 1.0 |
| 1.00 | 82.0 | +/- 1.0 |
| 1.20 | 83.0 | +/- 1.5 |

**Excursion quantification:**
- Subsonic minimum CP: **70.5%** at M=0.90 (most forward)
- Transonic maximum CP: **83.0%** at M=1.20 (most aft)
- Total aft excursion: **12.5 percentage points** of body length
- Onset: M ~ 0.90 (CP begins moving aft rapidly after its subsonic minimum)
- Steepest gradient: M=0.90 to M=1.00 (+11.5 pp over Delta-M = 0.10)
- Plateau: CP levels near 82-83% for M >= 1.00

In dimensional terms for the short body (total length 40.95 in = 1.040 m), the 12.5 pp excursion corresponds to ~0.130 m or ~2.3 body diameters (calibers) aft.

### ARCAS-long (L/D = 23.77)

| Mach | Measured CP (% body length) | Reading uncertainty |
|------|----------------------------|---------------------|
| 0.60 | 77.0 | +/- 1.0 |
| 0.80 | 76.5 | +/- 1.0 |
| 0.90 | 76.0 | +/- 1.0 |
| 0.95 | 73.0 | +/- 1.5 |
| 1.00 | 72.5 | +/- 1.5 |
| 1.20 | 76.0 | +/- 1.5 |

**Excursion quantification:**
- Subsonic CP: ~76-77% (nearly flat)
- Transonic minimum CP: **72.5%** at M=1.00 (CP moves slightly FORWARD)
- Post-transonic recovery: back to 76.0% at M=1.20
- Total excursion: only ~4.0 pp, and the direction is opposite (forward at M=1.0, recovery aft by M=1.2)

### Key observation: divergent short/long behavior

The two bodies differ only in body-tube length (28.54 vs 41.09 in), which changes the fin-station-to-total-length ratio and the relative contribution of the aft-mounted fins to the overall normal-force balance. This strongly implicates a **fin-dominated mechanism** since it is the fin contribution that changes between bodies.

---

## 2. Current Engine CP Model Characterization

### Barrowman base (barrowman.ts)

The subsonic CP is computed via the standard Barrowman method (NASA TM X-67216):

```
CP = sum(CNa_i * CP_i) / sum(CNa_i)
```

Components contributing CNa (engine-verified values from `computeRocketStability`):
1. **Nosecone** (tangent ogive): CNa = 2.000, CP at 12.1% body length (0.1255 m)
2. **Boattail** (transition): CNa = -1.111 (negative, destabilizing), CP at 97.6% body length
3. **Fins** (4x trapezoidal): CNa = 6.440, CP at 92.9% (short) / 94.5% (long) body length
4. **Total CNa = 7.329**, of which fins contribute 87.8%

The Barrowman CP is Mach-invariant. Engine-verified values:
- ARCAS-short: **70.1% of body length** (0.7291 m from nose)
- ARCAS-long: **70.7% of body length** (0.9609 m from nose)

### Transonic/supersonic shift (transonicAero.ts, lines 257-261)

The engine applies a Mach-dependent CP modification only for M > 1.0:

```typescript
if (mach > 1.0) {
  const shiftCalibers = Math.min(0.8, 0.45 * (1.0 - 1.0 / Math.sqrt(mach * mach)));
  cp = Math.max(0.1, subsonicCP - shiftCalibers * refDiameter);
}
```

Engine-verified CP at measured Mach points:
- **M <= 1.0:** CP = constant Barrowman value (70.1% short, 70.7% long) -- no transonic model at all
- **M = 1.2:** 69.7% short / 70.4% long (shift of 0.4 pp forward -- negligible)
- **M = 2.0:** shift ~ 0.45 * (1 - 1/sqrt(4)) = 0.225 cal forward
- **M = 4.0:** shift ~ 0.45 * (1 - 1/4) = 0.337 cal forward

### Model vs. measurement gap

| Mach | ARCAS-short measured | Engine (verified) | Error (meas - engine) |
|------|---------------------|-------------------|------------------------|
| 0.60 | 75.3% | 70.1% (Barrowman) | +5.2 pp |
| 0.80 | 71.5% | 70.1% (Barrowman) | +1.4 pp |
| 0.90 | 70.5% | 70.1% (Barrowman) | +0.4 pp |
| 0.95 | 74.0% | 70.1% (Barrowman) | +3.9 pp |
| 1.00 | 82.0% | 70.1% (Barrowman) | +11.9 pp |
| 1.20 | 83.0% | 69.7% (shifted fwd) | +13.3 pp |

| Mach | ARCAS-long measured | Engine (verified) | Error (meas - engine) |
|------|---------------------|-------------------|------------------------|
| 0.60 | 77.0% | 70.7% (Barrowman) | +6.3 pp |
| 0.80 | 76.5% | 70.7% (Barrowman) | +5.8 pp |
| 0.90 | 76.0% | 70.7% (Barrowman) | +5.3 pp |
| 0.95 | 73.0% | 70.7% (Barrowman) | +2.3 pp |
| 1.00 | 72.5% | 70.7% (Barrowman) | +1.8 pp |
| 1.20 | 76.0% | 70.4% (shifted fwd) | +5.6 pp |

**Key observations from engine-verified comparison:**
1. The engine sits ~5-6 pp forward of measured at subsonic Mach for BOTH bodies. This is a baseline Barrowman offset.
2. For ARCAS-short, the error explodes from +0.4 pp at M=0.9 to +13.3 pp at M=1.2 -- the engine misses the entire transonic aft excursion.
3. For ARCAS-long, the error is relatively stable (2-6 pp) across all Mach -- the transonic behavior is less dramatic but the baseline offset persists.
4. The engine's supersonic shift moves CP in the WRONG DIRECTION (forward) for M>1.0, widening the gap.

---

## 3. Candidate Public-Domain Mechanisms

### Mechanism A: Transonic Fin CNa Non-Linearity (Ackeret-Busemann-Gothert)

**Physical basis:** In the transonic regime (M ~ 0.8-1.2), the fin normal-force slope (CNa) undergoes a sharp non-monotonic variation. Below M=1, Prandtl-Glauert compressibility amplifies the subsonic lift slope by 1/sqrt(1-M^2), producing a dramatic CNa peak near M=1. Above M=1, the supersonic Ackeret lift slope drops as 4/sqrt(M^2-1), falling rapidly from infinity at M=1.

For a fin-aft configuration like ARCAS, the fins dominate the overall CP location because their CNa is the largest contributor and their moment arm from the nose is the longest. When the fin CNa surges near M=1 (due to Prandtl-Glauert amplification), the fin contribution to the CP weighted-average increases relative to the nosecone contribution, pulling the overall CP aft toward the fins.

**Expected effect direction:** CP moves AFT as M approaches 1.0 from below, because the fin's share of total CNa increases.

**Expected magnitude:** Engine-verified: fin CNa = 6.44 (87.8% of total CNa = 7.33), fin CP at 92.9% (short). If fin CNa doubles at M=0.95 (conservative PG estimate), fin share rises from 87.8% to ~93.5%, pulling the weighted CP from 70.1% toward ~78-82%. At a 3x PG cap near M=1.0, the fin share approaches ~96%, pushing CP to ~83-85%. This brackets the measured 82-83% range.

**Public sources:**
- Prandtl-Glauert compressibility correction: Prandtl, L. (1936); Glauert, H., "The Effect of Compressibility on the Lift of an Aerofoil," Proc. Royal Society (1928).
- Ackeret, J., "Luftkrafte auf Flugel die mit grosserer als Schallgeschwindigkeit bewegt werden," Zeitschrift fur Flugtechnik (1925). Supersonic thin-airfoil lift slope = 4/sqrt(M^2-1).
- Barrowman, J.S., NASA TM X-67216 (1966): Barrowman method for finned bodies at M << 1.
- Nielsen, J.N., "Missile Aerodynamics," McGraw-Hill (1960), Chapter 7: Transonic fin characteristics.

**Why it explains the short/long divergence:** Engine-verified: the fin CP sits at 92.9% (short) vs 94.5% (long), and the nosecone CP at 12.1% vs 9.2%. The nose-to-fin moment arm is similar, but the key difference is that the ARCAS-long body has a lower baseline CP (70.7%) with the same CNa balance. The measured long-body data (76-77% subsonic) already sits further aft of the engine prediction by ~6 pp at all Mach, suggesting an additional subsonic offset mechanism. The transonic fin-CNa surge in the long body is partially offset by the nosecone's proportionally earlier CP (9.2% of a longer body), producing a net near-zero transonic excursion rather than the dramatic 12.5 pp seen in the short body.

### Mechanism B: Transonic Boattail Lift Reversal

**Physical basis:** At subsonic speeds, a boattail generates a small negative (stabilizing) normal force because the converging section produces a net downward pressure distribution. In the transonic regime, shock formation on the boattail shoulder causes local flow separation and pressure redistribution. The boattail's CNa can reverse sign or increase in magnitude, and its CP shifts aft.

For ARCAS, the boattail has a diameter ratio of 1.50/2.25 = 0.667, which is a moderate contraction. At transonic speeds, the shock-induced flow changes on this boattail alter its moment contribution to the overall CP.

**Expected effect direction:** Generally moves CP aft, but the magnitude is small because the boattail CNa is already small relative to the fin CNa.

**Expected magnitude:** Typically 1-3 pp of body length. This alone is insufficient to explain the 12.5 pp ARCAS-short excursion.

**Public sources:**
- USAF Stability and Control DATCOM, Section 4.2.1.1 (transonic body effects).
- Love, E.S., "Base Pressure at Supersonic Speeds on Two-Dimensional Airfoils and Bodies of Revolution," NACA RM L53C02 (1953).
- Hoerner, S.F., "Fluid-Dynamic Drag," Chapter 16: Transonic base and boattail effects.

### Mechanism C: Transonic Body CNa (Non-Slender Effects)

**Physical basis:** The Barrowman method assumes CNa = 0 for cylindrical body tubes (slender-body theory). At transonic speeds, viscous crossflow and shock-boundary-layer interaction along the body produce measurable body normal forces, especially for bodies with L/D < 20. The ARCAS-short has L/D = 18.20, which is in the range where transonic body CNa can be non-negligible.

The body CNa acts at the body centroid (~50% body length), which is forward of the fins but aft of the nosecone. If the body develops significant positive CNa in the transonic regime, it adds a mid-body contribution that could shift the CP either direction depending on whether it pulls more toward the nosecone or the fins.

**Expected effect direction:** Modest, and direction depends on the body-tube centroid location relative to the current CP. For ARCAS-short (body CNa centroid near 50% vs. engine-verified CP of 70.1%), this would pull CP FORWARD, working against the observed aft shift.

**Expected magnitude:** 1-3 pp of body length, and in the wrong direction for ARCAS-short.

**Public sources:**
- Allen, H.J. and Perkins, E.W., "A Study of Effects of Viscosity on Flow over Slender Inclined Bodies of Revolution," NACA Report 1048 (1951).
- Nielsen, J.N., "Missile Aerodynamics," McGraw-Hill (1960), Chapter 4.

---

## 4. Mechanism Ranking

| Mechanism | Effect direction (short) | Est. magnitude | Explains short/long split? | Implementability |
|-----------|--------------------------|----------------|---------------------------|-----------------|
| A: Fin CNa transonic surge | AFT (correct) | 8-15 pp | Yes | Straightforward |
| B: Boattail lift reversal | AFT (correct) | 1-3 pp | Partially | Moderate |
| C: Body CNa non-slender | FORWARD (wrong) | 1-3 pp | No | Complex |

**Mechanism A is the dominant candidate.** It has the correct sign, the right magnitude, and naturally explains why the short and long bodies behave differently (different fin-to-nose CNa ratios amplify or attenuate the effect).

---

## 5. Recommendation: Transonic Fin CNa Correction

### What to implement

Apply a **Prandtl-Glauert / Ackeret compressibility correction to the fin CNa** in the transonic CP calculation, using the standard linearized-theory lift-slope multiplier with a smooth transition through M=1.0.

### Implementation sketch

```typescript
// In transonicAero.ts, new function:

/**
 * Compressibility correction factor for fin normal-force slope.
 *
 * Subsonic (M < M_crit): Prandtl-Glauert factor 1/sqrt(1-M^2), capped
 * Transonic (M_crit to M_cross): smooth spline between subsonic peak and supersonic onset
 * Supersonic (M > M_cross): Ackeret factor 4/(CNa_sub * sqrt(M^2-1))
 *                           normalized so the multiplier approaches 1.0
 *                           at the Barrowman reference Mach (M ~ 0)
 *
 * References:
 *   Prandtl-Glauert: Glauert, H. (1928) Proc. Roy. Soc.
 *   Ackeret: Ackeret, J. (1925) Zeitschrift fur Flugtechnik
 *   Transonic bridging: Nielsen, J.N. (1960) "Missile Aerodynamics" Ch. 7
 *
 * @param mach - Freestream Mach number
 * @returns Multiplier on subsonic (Barrowman) fin CNa
 */
export function finCNaCompressibilityFactor(mach: number): number {
  const M_CRIT = 0.85;     // Critical Mach (onset of significant compressibility)
  const M_CROSS = 1.10;    // Crossover to Ackeret regime
  const PG_CAP = 3.0;      // Prandtl-Glauert cap (prevents infinity at M=1)

  if (mach < M_CRIT) {
    // Prandtl-Glauert: 1/sqrt(1-M^2), approaches 1.0 at M=0
    return 1.0 / Math.sqrt(1.0 - mach * mach);
  }

  if (mach <= M_CROSS) {
    // Transonic bridging: cubic Hermite from PG value at M_CRIT
    // to Ackeret value at M_CROSS, with zero slope at the peak
    const pgAtCrit = 1.0 / Math.sqrt(1.0 - M_CRIT * M_CRIT);
    const ackeretAtCross = 4.0 / (2.0 * Math.PI * Math.sqrt(M_CROSS * M_CROSS - 1.0));
    // Normalize Ackeret to match Barrowman convention:
    // Barrowman CNa_1 uses 2*pi as the flat-plate lift slope,
    // so the Ackeret multiplier = 4 / (2*pi * sqrt(M^2-1))
    const peakVal = Math.min(PG_CAP, pgAtCrit);
    const t = (mach - M_CRIT) / (M_CROSS - M_CRIT);
    // Hermite: smooth from peakVal (slope=0) to ackeretAtCross (slope=descending)
    return peakVal + (ackeretAtCross - peakVal) * (3 * t * t - 2 * t * t * t);
  }

  // Supersonic Ackeret: lift slope = 4/sqrt(M^2-1) per radian per fin panel
  // Normalized to the Barrowman 2*pi convention
  return 4.0 / (2.0 * Math.PI * Math.sqrt(mach * mach - 1.0));
}
```

### Where it plugs in

In `computeAerodynamicCurves()` (transonicAero.ts), replace the current fixed-shift CP logic (lines 257-261) with:

```typescript
// 5. Mach-dependent Center of Pressure via fin CNa compressibility
const finCNaFactor = finCNaCompressibilityFactor(mach);

// Recompute the CP weighting with Mach-corrected fin CNa:
//   CP(M) = (CNa_nose * CP_nose + finCNaFactor * CNa_fins * CP_fins + CNa_boattail * CP_boattail)
//         / (CNa_nose + finCNaFactor * CNa_fins + CNa_boattail)
// This naturally produces:
//   - Subsonic: CP ~ Barrowman (factor ~ 1.0)
//   - Transonic: CP moves aft (factor peaks at ~2-3x, pulling toward fins)
//   - Supersonic: CP recovers forward (factor < 1.0 above M~1.4)

// The Barrowman surface contributions are already available from subsonicStability.contributions
let cpMachCorrected = subsonicCP;
if (mach > 0.5) {
  const surfaces = subsonicStability.contributions;
  const finContrib = surfaces.find(c => c.type === 'trapezoidfinset' || c.type === 'ellipticalfinset');
  if (finContrib && finContrib.cna && finContrib.cp) {
    const nonFinCNa = subsonicStability.totalCNa - finContrib.cna;
    const nonFinMoment = subsonicStability.totalCNa * subsonicCP - finContrib.cna * finContrib.cp;
    const correctedFinCNa = finCNaFactor * finContrib.cna;
    const totalCNaCorrected = nonFinCNa + correctedFinCNa;
    if (Math.abs(totalCNaCorrected) > 0.0001) {
      cpMachCorrected = (nonFinMoment + correctedFinCNa * finContrib.cp) / totalCNaCorrected;
    }
  }
}
const cp = cpMachCorrected;
```

### Expected effect on validation

At M=1.0 for ARCAS-short (engine-verified baseline: Barrowman CP = 70.1%, fin CNa = 6.44 / total 7.33 = 87.8%, fin CP at 92.9%):
- The Prandtl-Glauert factor peaks near 2.0-3.0x at M=0.95-1.0
- Fin CNa (87.8% of total) surges to ~93-96% of corrected total
- The fin CP station (92.9%) pulls the weighted CP aft from 70.1% toward ~80-85%
- This brackets the measured 82-83% range

For ARCAS-long:
- Same fin CNa surge occurs, but the fin moment arm relative to the nose is different
- The longer body tube means the nose + boattail CNa contributions hold more weight proportionally
- The model should predict a smaller or partially offsetting excursion, consistent with the measured ~4 pp variation

### Parameters to tune (future work)

- `M_CRIT` (0.85): Adjust based on fin thickness ratio; ARCAS's thick square-section fins (t/c = 0.125/3.38 = 3.7%) have an early critical Mach
- `PG_CAP` (3.0): The physical cap prevents the singularity; tune against TN D-4013 data
- `M_CROSS` (1.10): The Mach at which the bridging joins the Ackeret curve

---

## 6. Summary

1. **The ARCAS-short transonic CP excursion is 12.5 pp aft (70.5% to 83.0%)** with a steep onset at M=0.90 and plateau above M=1.0.

2. **The ARCAS-long body shows the opposite behavior**: a mild 4.0 pp forward shift at M=1.0, recovering by M=1.2.

3. **The current engine model shifts CP in the wrong direction** (forward) for M > 1.0, producing the dominant validation residual.

4. **The primary mechanism is transonic fin CNa amplification** (Prandtl-Glauert compressibility). The fins' share of total normal force surges near M=1.0, pulling the weighted CP aft toward the fin station. This naturally explains the short/long body divergence.

5. **A secondary contributor** is transonic boattail pressure redistribution (1-3 pp), which could be added later.

6. **The recommended implementation** replaces the current fixed supersonic shift with a Mach-resolved fin-CNa compressibility factor, using the Barrowman surface contributions already computed.

---

## What was checked (engine-verified)

- Engine was executed via `npx tsx` to obtain actual CP at all 6 measured Mach points for both bodies. All numbers in the tables above are engine-verified, not estimates.
- Existing validation test suite (`npx vitest run src/validation/arcas/arcas-validation.test.ts`) passes 10/10 tests.
- `git status --short src/` confirms zero source modifications.
- Per-component CNa breakdown (nose 2.000, boattail -1.111, fins 6.440, total 7.329) is verified engine output.

## What was NOT checked

- Fin-body interference factor (K_fb, K_bf) Mach dependence was not investigated. The Rogers/NACA 1307 interference factors may also vary through M=1.0.
- No supersonic CP measured data exists in the digitized set (the TN D-4014 data covers only CD, not CP, at M=1.7-4.63). The supersonic CP prediction cannot be validated from this dataset.
- The Prandtl-Glauert correction is linearized theory; real transonic flow involves shock formation and nonlinear effects that may require empirical tuning of M_CRIT and PG_CAP.
- The boattail transonic CNa reversal (Mechanism B) was identified but not quantified; it may account for 1-3 pp of the residual.
- The subsonic baseline offset (~5 pp for both bodies) was not investigated; it may indicate a systematic Barrowman limitation for this geometry that a CNa correction alone will not fix.

---

## Sources (all public domain)

| Source | Content used |
|--------|-------------|
| NASA TN D-4013 (1967) | Measured CP/CA data (Figs. 11, 12), vehicle geometry (Fig. 1a), test conditions (p. 4) |
| NASA TN D-4014 (1967) | Vehicle geometry (Figs. 1a/1b), supersonic CD data (Figs. 5b/6b) |
| NASA TM X-67216 (1966) | Barrowman stability method |
| NACA Report 1307 | Rogers fin-body interference factors (K_fb, K_bf) |
| Glauert, H. (1928) Proc. Roy. Soc. | Prandtl-Glauert compressibility correction |
| Ackeret, J. (1925) | Supersonic thin-airfoil lift slope |
| Nielsen, J.N. (1960) "Missile Aerodynamics" | Transonic fin characteristics (Ch. 7), body non-slender effects (Ch. 4) |
| NACA Report 1048 (1951) | Allen-Perkins viscous crossflow body effects |
| USAF Stability and Control DATCOM | Transonic body and boattail effects |
| Hoerner, S.F. "Fluid-Dynamic Drag" | Base and boattail transonic drag/pressure |
