import { describe, it } from 'vitest';
import { computeAerodynamicCurves, type DragBreakdown } from '../../aero/transonicAero';
import {
  MISSILE2005_CONFIG_3,
  MISSILE2005_BODY_DIAMETER_IN,
  MISSILE2005_REFERENCE_AREA_FT2,
  MISSILE2005_REYNOLDS_PER_METER,
} from './missile2005-vehicle';
import {
  MISSILE2005_CONFIG_3_CA_POINTS,
  QUARANTINED_MISSILE2005_CA_POINTS,
} from './measured-missile2005';

function curveAt(curves: DragBreakdown[], mach: number): number | null {
  // NASA/TM-2005-213541, Test Description: the beveled internal cavity
  // acts over the entire base area, and its axial force is subtracted.
  const nonBaseCd = (curve: DragBreakdown): number =>
    curve.frictionCd + curve.waveCd + (curve.protuberanceCd ?? 0);
  const upperIndex = curves.findIndex((curve) => curve.mach >= mach);
  if (upperIndex < 0 || mach < curves[0].mach) return null;

  const lower = curves[Math.max(0, upperIndex - 1)];
  const upper = curves[upperIndex];
  const fraction = upper.mach === lower.mach ? 0 : (mach - lower.mach) / (upper.mach - lower.mach);
  return nonBaseCd(lower) + fraction * (nonBaseCd(upper) - nonBaseCd(lower));
}

function interpolateMeasuredAtZeroAlpha(
  point: (typeof MISSILE2005_CONFIG_3_CA_POINTS)[number],
): number {
  const fraction = (0 - point.alphaLowDeg) / (point.alphaHighDeg - point.alphaLowDeg);
  return point.cafLow + fraction * (point.cafHigh - point.cafLow);
}


const curves = computeAerodynamicCurves(
  MISSILE2005_CONFIG_3,
  false,
  41,
  MISSILE2005_REYNOLDS_PER_METER,
).dragCurves;
const modelReferenceAreaFt2 =
  (Math.PI / 4) * (MISSILE2005_BODY_DIAMETER_IN / 12) ** 2;
const referenceAreaScale = MISSILE2005_REFERENCE_AREA_FT2 / modelReferenceAreaFt2;

describe('NASA/TM-2005-213541 second-geometry holdout (report-only; no accuracy gate)', () => {
  it('prints zero-angle CAF residuals for configuration 3', () => {
    const rows: string[] = [];
    const coefficientResiduals: number[] = [];
    const relativeResiduals: number[] = [];

    for (const point of MISSILE2005_CONFIG_3_CA_POINTS) {
      const modelCd = curveAt(curves, point.mach);
      if (modelCd === null) {
        rows.push(`M=${point.mach.toFixed(2)}: outside model sweep; no residual`);
        continue;
      }

      const measuredCaf = interpolateMeasuredAtZeroAlpha(point) * referenceAreaScale;
      const residual = modelCd - measuredCaf;
      const percent = (residual / measuredCaf) * 100;
      coefficientResiduals.push(residual);
      relativeResiduals.push(percent);
      rows.push(
        `M=${point.mach.toFixed(2)} test=${point.test} run=${point.run} ` +
          `CAF(meas)=${measuredCaf.toFixed(5)} CD(non-base model)=${modelCd.toFixed(5)} ` +
          `Δ=${residual >= 0 ? '+' : ''}${residual.toFixed(5)} (${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%)`,
      );
    }

    const coefficientBias = coefficientResiduals.reduce((sum, residual) => sum + residual, 0) /
      coefficientResiduals.length;
    console.log(
      'NASA/TM-2005-213541 configuration 3 (SN-no S-T), production non-base curve interpolation; ' +
        'cavity/base-force corrected, report-only, no pass/fail gate:\n  ' +
        rows.join('\n  ') +
        `\n  n=${coefficientResiduals.length}, MAE(ΔCAF)=${(coefficientResiduals.reduce((sum, residual) => sum + Math.abs(residual), 0) / coefficientResiduals.length).toFixed(5)}, ` +
        `bias(ΔCAF)=${coefficientBias >= 0 ? '+' : ''}${coefficientBias.toFixed(5)}, ` +
        `MAE(relative)=${(relativeResiduals.reduce((sum, residual) => sum + Math.abs(residual), 0) / relativeResiduals.length).toFixed(1)}%. ` +
        `Reference-area scale=${referenceAreaScale.toFixed(7)} (report 0.0541 ft² → ` +
        `π(3.15 in)²/4=${modelReferenceAreaFt2.toFixed(7)} ft²).`,
    );
    console.log(
      'Quarantined NASA rows (no residual): ' +
        QUARANTINED_MISSILE2005_CA_POINTS.map(
          (point) => `config ${point.configuration} M=${point.mach.toFixed(2)} CAF≈${point.cafLow.toFixed(4)}–${point.cafHigh.toFixed(4)}: ${point.reason}`,
        ).join('; '),
    );
  });
});
