/**
 * NASA ARCAS test article geometry.
 *
 * Primary sources: NASA TN D-4013 (1967) Fig. 1 and NASA TN D-4014 (1967)
 * Fig. 1. Both documents were downloaded from NTRS (documents 19670020050 and
 * 19670020031) and rendered locally on 2026-10-09; the values marked
 * [NASA-VERIFIED] below were read directly off those renders. All lengths are
 * converted to meters at 0.0254 m/in.
 *
 * The half-scale wind-tunnel model: body diameter 2.25 in, ogive nose 10.60 in,
 * cylindrical body tube, boattail to a small rear diameter, four trapezoidal
 * DOUBLE-WEDGE fins (TN D-4013 printed p.3; TN D-4014 printed p.4).
 *
 * READING METHOD / UNCERTAINTY
 *   Dimensions were read from hardcopy-style dimension callouts on the scanned
 *   figures (not by scaling a drawing). Callouts are quoted in inches and cm in
 *   the original; where the two disagree the inch value is used and noted.
 *   Single-dimension read precision is about +/-0.02 in; planform-derived
 *   quantities (fin sweep) carry larger uncertainty and are flagged.
 *
 * REMAINING APPROXIMATIONS (explicit, not exact):
 *   - Nose: the reports label it "ogive", but D-4014 Fig. 1(a) tabulates the
 *     actual radius profile (R at X = 0.576..10.600 in), which is NOT a tangent
 *     ogive. The engine models it as a generic 'ogive'; that is an
 *     approximation of a tabulated contour.
 *   - Fin thickness: D-4014 Fig. 1(b) gives 0.096 in (0.244) at one span and
 *     0.150 in (0.381) at another; the model uses a single 0.125 in value.
 *   - Boattail rear diameter: no exact inch callout was read; TN D-4013
 *     Fig. 1(a) shows "0.65d" ( = 1.4625 in) at the tail. Retained value 1.50.
 *
 * DISCREPANCIES PRESERVED
 *   - Total long length: TN D-4013 expresses it as 23.77d = 53.4825 in; TN D-4014
 *     Fig. 1 prints 53.500 in. Both are recorded; the constant uses the D-4013
 *     dimensionless value (the harness test compares against it).
 */
import type { RocketVehicle } from '../../core/types';

const IN = 0.0254;

// --- [NASA-VERIFIED] D-4014 Fig. 1 (PDF p.10 / printed p.8) + D-4013 Fig. 1 ---
export const ARCAS_BODY_DIAMETER_IN = 2.25;   // D-4014 "2.250 D", D-4013 d = 2.25 in
export const ARCAS_NOSE_LENGTH_IN = 10.6;     // station 10.600; D-4013 4.71d = 10.60
export const ARCAS_BOATTAIL_REAR_DIAMETER_IN = 1.5; // [UNVERIFIED exact] D-4013 shows 0.65d = 1.4625

// --- [NASA-VERIFIED] figure callouts ---
export const ARCAS_BOATTAIL_LENGTH_IN = 1.810;      // D-4014 Fig.1 "1.810 (4.597)"
export const ARCAS_FIN_ROOT_IN = 3.380;             // D-4014 Fig.1(b) "3.380 (8.585)"
// D-4014 Fig.1(b) "2.165 (5.499)", confirmed on the original render.
// The 0.375 callout belongs to the raked trailing-root edge, not the tip.
export const ARCAS_FIN_TIP_IN = 2.165;
// Radial dimension; the root/body and raked tip are simplified by the model.
export const ARCAS_FIN_SEMISPAN_IN = 2.103;         // D-4014 Fig.1(b) "2.103 (5.342)"
// [APPROXIMATION] figure shows a thickness that varies along the span
// (0.096 in and 0.150 in); a single value is required by the model.
export const ARCAS_FIN_THICKNESS_IN = 0.125;

/** Fin root LE station from the nose tip, TN D-4014 Fig. 1 — 37.300 (short) / 49.850 (long). */
export const ARCAS_FIN_LE_STATION_IN = 37.3;

// --- [NASA-VERIFIED] D-4014 Fig. 1: 1.840 (4.674) fin-root-LE to boattail start ---
/** Fin root LE measured forward from the body-tube aft end (= boattail start). */
export const ARCAS_FIN_LOCATION_FROM_AFT_IN = 1.840;

// --- Body tube lengths, derived from the verified totals ---
// short: 40.950 - 10.600 (nose) - 1.810 (boattail) = 28.540
// long : 53.500 - 10.600 - 1.810 = 41.090 (D-4014 total). Consistent with the
// prior comparison deck to +/-0.6 in.
export const ARCAS_SHORT_BODY_TUBE_IN = 28.54;
export const ARCAS_LONG_BODY_TUBE_IN = 41.09;

/** Total lengths. Short = 40.950 in (both reports agree). */
export const ARCAS_TOTAL_LENGTH_SHORT_IN = 40.95;      // D-4014 "40.950 (104.013)"
export const ARCAS_TOTAL_LENGTH_LONG_IN = 53.4825;     // D-4013 23.77d; D-4014 prints 53.500

/** Build an ARCAS test article as an Astraea RocketVehicle. */
function buildArcasVehicle(bodyTubeIn: number): RocketVehicle {
  const baseDiameter = ARCAS_BODY_DIAMETER_IN * IN;
  const noseLength = ARCAS_NOSE_LENGTH_IN * IN;
  // The fin root LE sits ARCAS_FIN_LOCATION_FROM_AFT_IN forward of the body
  // tube's aft end. (The absolute LE stations 37.300/49.850 in from the nose tip
  // follow from this: 40.950-37.300 = 53.500-49.850 = 3.650 in from the base =
  // 1.810 boattail + 1.840 fin-root-LE-to-boattail-start.)
  const finOffsetInTube = bodyTubeIn - ARCAS_FIN_LOCATION_FROM_AFT_IN;
  // LE sweep root-to-tip. TN D-4013 states the fins are double-wedge; D-4014
  // Fig.1(b) shows a swept leading edge with a ~30 deg callout and an
  // essentially unswept trailing edge, so sweep = rootChord - tipChord.
  // [DERIVED, +/-0.05 in] — not a direct single-dimension reading.
  const finSweepIn = ARCAS_FIN_ROOT_IN - ARCAS_FIN_TIP_IN;

  return {
    id: 'arcas',
    name: `ARCAS test article (${bodyTubeIn.toFixed(2)} in tube)`,
    version: '1',
    author: 'NASA TN D-4013/4014 reconstruction',
    notes:
      'Reconstruction of the ARCAS half-scale wind tunnel model. Geometry read ' +
      'from NASA TN D-4013/4014 figures (2026-10-09 NTRS PDF render); nose ' +
      'contour and fin thickness are explicit approximations (see provenance notes).',
    components: [
      {
        id: 'arcas-nose',
        name: 'ARCAS ogive nose (tabulated contour approximated as ogive)',
        type: 'nosecone',
        materialId: 'fiberglass',
        shape: 'ogive',
        length: noseLength,
        baseDiameter,
        wallThickness: 0.002,
        isHollow: true,
      },
      {
        id: 'arcas-tube',
        name: 'ARCAS body tube',
        type: 'bodytube',
        materialId: 'fiberglass',
        length: bodyTubeIn * IN,
        outerDiameter: baseDiameter,
        innerDiameter: baseDiameter - 2 * 0.002,
      },
      {
        id: 'arcas-boattail',
        name: 'ARCAS boattail',
        type: 'transition',
        materialId: 'fiberglass',
        length: ARCAS_BOATTAIL_LENGTH_IN * IN,
        foreDiameter: baseDiameter,
        aftDiameter: ARCAS_BOATTAIL_REAR_DIAMETER_IN * IN,
        wallThickness: 0.002,
        isHollow: true,
      },
      {
        id: 'arcas-fins',
        name: 'ARCAS fins (4)',
        type: 'trapezoidfinset',
        materialId: 'fiberglass',
        finCount: 4,
        rootChord: ARCAS_FIN_ROOT_IN * IN,
        tipChord: ARCAS_FIN_TIP_IN * IN,
        span: ARCAS_FIN_SEMISPAN_IN * IN,
        sweepLength: finSweepIn * IN,
        thickness: ARCAS_FIN_THICKNESS_IN * IN,
        // TN D-4013 printed p.3 / TN D-4014 printed p.4: trapezoidal
        // double-wedge fins. The earlier 'square' value was not supported.
        crossSection: 'double_wedge',
        axialOffset: finOffsetInTube * IN,
      },
    ],
  };
}

/** ARCAS test articles as Astraea vehicles (figure-read geometry — see notes above). */
export const ARCAS_SHORT = buildArcasVehicle(ARCAS_SHORT_BODY_TUBE_IN);
export const ARCAS_LONG = buildArcasVehicle(ARCAS_LONG_BODY_TUBE_IN);
