/**
 * Explicit ARCAS research benchmark, not an ordinary unit-test gate.
 * Scores re-acquired TN D-4013 CAcorr with the existing gates. Sourced CP
 * readings get a separate report-only residual summary; quarantined CP and
 * supersonic legacy readings do not contribute to the CAcorr gates.
 * CAcorr is compared with the modeled non-base drag, excluding Hoerner baseCd.
 * The inherited 15%/peak-window targets are research goals, not NASA reading
 * uncertainty or independently established method-accuracy requirements.
 */
import { describe, it, expect } from 'vitest';
import { computeAerodynamicCurves, type DragBreakdown } from '../../aero/transonicAero';
import {
  ARCAS_SHORT,
  ARCAS_LONG,
  ARCAS_TOTAL_LENGTH_SHORT_IN,
  ARCAS_TOTAL_LENGTH_LONG_IN,
} from './arcas-vehicle';
import { ARCAS_TUNNEL_REYNOLDS_PER_METER } from './arcas-test-conditions';
import { MEASURED_ARCAS_CSV, QUARANTINED_ARCAS_CSV, SOURCED_SUPERSONIC_CA_CSV } from './measured-arcas';

interface MeasuredPoint {
  model: 'ARCAS-short' | 'ARCAS-long';
  quantity: 'CD' | 'CAcorr' | 'CP';
  mach: number;
  measured: number;
  unit: string;
  sourceDocument: string;
  figure: string;
  readingUncertainty: number;
}

function loadMeasured(): MeasuredPoint[] {
  const raw = MEASURED_ARCAS_CSV;
  const [header, ...rows] = raw.trim().split(/\r?\n/);
  void header;
  return rows
    .filter((row) => row.trim().length > 0)
    .map((row) => {
      const [model, quantity, mach, measured, unit, sourceDocument, figure, uncertainty] = row.split(',');
      return {
        model: model as MeasuredPoint['model'],
        quantity: quantity as MeasuredPoint['quantity'],
        mach: Number(mach),
        measured: Number(measured),
        unit: unit ?? '',
        sourceDocument,
        figure,
        readingUncertainty: Number(uncertainty),
      };
    });
}

interface PredictedCoefficient {
  mach: number;
  coefficient: number;
}

/** TN D-4013 CAcorr has the measured base-pressure force removed. */
function coefficientWithoutBase(drag: DragBreakdown): number {
  return drag.frictionCd + drag.waveCd + (drag.protuberanceCd ?? 0);
}

function curveAt(curves: DragBreakdown[], mach: number): PredictedCoefficient | null {
  const upperIndex = curves.findIndex((c) => c.mach >= mach);
  if (upperIndex < 0 || mach < curves[0].mach) return null;
  const lower = curves[Math.max(0, upperIndex - 1)];
  const upper = curves[upperIndex];
  const fraction = upper.mach === lower.mach ? 0 : (mach - lower.mach) / (upper.mach - lower.mach);
  const lowerCoefficient = coefficientWithoutBase(lower);
  const upperCoefficient = coefficientWithoutBase(upper);
  return { mach, coefficient: lowerCoefficient + fraction * (upperCoefficient - lowerCoefficient) };
}

/** Interpolated aerodynamic center location, in meters from the nose tip. */
function cpAt(curves: DragBreakdown[], mach: number): number | null {
  const upperIndex = curves.findIndex((c) => c.mach >= mach);
  if (upperIndex < 0 || mach < curves[0].mach) return null;
  const lower = curves[Math.max(0, upperIndex - 1)];
  const upper = curves[upperIndex];
  const fraction = upper.mach === lower.mach ? 0 : (mach - lower.mach) / (upper.mach - lower.mach);
  return lower.cp + fraction * (upper.cp - lower.cp);
}

/** Signed percent error relative to the measured value. */
function signedPercent(predicted: number, measured: number): number {
  return ((predicted - measured) / measured) * 100;
}

function meanAbs(values: number[]): number {
  return values.reduce((s, v) => s + Math.abs(v), 0) / values.length;
}

type Band = 'subsonic' | 'transonic' | 'supersonic';

/**
 * Band edges follow the report's regime split. The 15% CA figure is the
 * research target already declared in this file's header — reused per band, not
 * a new accuracy budget. The roadmap forbids inventing budgets, so CP keeps a
 * residual report and no pass/fail threshold.
 */
const BANDS: Record<Band, [number, number]> = {
  subsonic: [0, 0.9],
  transonic: [0.9, 1.5],
  supersonic: [1.5, 5.0],
};
const CA_RESEARCH_TARGET_PCT = 15;

function bandOf(mach: number): Band {
  for (const [name, [lo, hi]] of Object.entries(BANDS) as [Band, [number, number]][]) {
    if (mach >= lo && mach < hi) return name;
  }
  return 'supersonic';
}

const MEASURED = loadMeasured();
// Use 41 points to match the Rust production path (aero_curves hardcodes 41).
// D-4013 §Apparatus and Tests held the test Reynolds number at 9.8e6/m.
const curvesShort = computeAerodynamicCurves(ARCAS_SHORT, false, 41, ARCAS_TUNNEL_REYNOLDS_PER_METER);
const curvesLong = computeAerodynamicCurves(ARCAS_LONG, false, 41, ARCAS_TUNNEL_REYNOLDS_PER_METER);

describe('ARCAS research benchmark (per-band CA gates against the inherited 15% research target; per-band CP report; supersonic unvalidated)', () => {

  it('keeps non-base CA within the inherited 15% research target in every scored band', () => {
    // TN D-4013 defines CAcorr as axial force corrected for base axial force
    // (printed pp. 2–3; Figs. 11/12, printed pp. 60–61). Remove modeled baseCd
    // as well: measured base pressure and modeled Hoerner base drag are not
    // directly comparable. At α≈0, use CA≈CD for the remaining components.
    //
    // Scored PER BAND: a pooled MAE lets one bad band hide inside a good one.
    const rows = MEASURED.filter((r) => r.quantity === 'CAcorr' && r.mach <= 1.2);

    const summary: string[] = [];
    const scored: { label: string; mae: number }[] = [];
    for (const band of ['subsonic', 'transonic'] as const) {
      for (const model of ['ARCAS-short', 'ARCAS-long'] as const) {
        const bandRows = rows.filter((r) => r.model === model && bandOf(r.mach) === band);
        if (bandRows.length === 0) continue;
        const c = model === 'ARCAS-short' ? curvesShort : curvesLong;
        const errors: number[] = [];
        for (const row of bandRows) {
          const curve = curveAt(c.dragCurves, row.mach);
          expect(curve, `M=${row.mach} is within sweep — should not be null`).not.toBeNull();
          errors.push(signedPercent(curve!.coefficient, row.measured));
        }
        const mae = meanAbs(errors);
        const label = `CA ${band} ${model}`;
        summary.push(
          `${label}: n=${errors.length}, MAE ${mae.toFixed(1)}%, ` +
            `scored M ${Math.min(...bandRows.map((r) => r.mach)).toFixed(2)}–${Math.max(...bandRows.map((r) => r.mach)).toFixed(2)}`,
        );
        scored.push({ label, mae });
      }
    }
    // Log before asserting: this gate is intentionally red, so its summary is
    // the deliverable and must survive the failure. `expect.soft` keeps later
    // bands under test so a second regression cannot hide behind a known red.
    console.log('ARCAS per-band CA summary:\n  ' + summary.join('\n  '));
    for (const { label, mae } of scored) {
      expect.soft(
        mae,
        `${label} MAE ${mae.toFixed(2)}% (CA≈non-base CD at α≈0) must meet the inherited ${CA_RESEARCH_TARGET_PCT}% research target`,
      ).toBeLessThan(CA_RESEARCH_TARGET_PCT);
    }
  });

  it('compares the transonic peak against the inherited research window', () => {
    const peakRows = MEASURED.filter((r) => r.quantity === 'CAcorr');
    const peak = peakRows.reduce((a, b) => (b.measured > a.measured ? b : a));
    const c = peak.model === 'ARCAS-short' ? curvesShort : curvesLong;
    const inRange = c.dragCurves.filter((d) => d.mach > 0.7 && d.mach < 1.4);
    const predictedPeak = inRange.reduce((a, b) =>
      (coefficientWithoutBase(b) > coefficientWithoutBase(a) ? b : a),
    );

    expect(Math.abs(predictedPeak.mach - peak.mach)).toBeLessThanOrEqual(0.2);
    expect(coefficientWithoutBase(predictedPeak)).toBeGreaterThan(peak.measured * 0.7);
    expect(coefficientWithoutBase(predictedPeak)).toBeLessThan(peak.measured * 1.4);
  });


  it('reports CP residuals per band and body without inventing an accuracy budget', () => {
    // CP is report-only by design: the roadmap forbids inventing accuracy
    // budgets and none has been approved for CP. The value here is exposing the
    // per-band structure that a pooled MAE conceals.
    const cpRows = MEASURED.filter((r) => r.quantity === 'CP');
    const summary: string[] = [];
    let outsideSweep = 0;
    for (const band of Object.keys(BANDS) as Band[]) {
      for (const model of ['ARCAS-short', 'ARCAS-long'] as const) {
        const bandRows = cpRows.filter((r) => r.model === model && bandOf(r.mach) === band);
        if (bandRows.length === 0) {
          summary.push(`CP ${band} ${model}: no comparable data (NOT VALIDATED)`);
          continue;
        }
        const curves = model === 'ARCAS-short' ? curvesShort : curvesLong;
        const bodyLengthIn = model === 'ARCAS-short'
          ? ARCAS_TOTAL_LENGTH_SHORT_IN
          : ARCAS_TOTAL_LENGTH_LONG_IN;
        const residuals: number[] = [];
        for (const row of bandRows) {
          const cpMeters = cpAt(curves.dragCurves, row.mach);
          if (cpMeters === null) {
            outsideSweep++;
            continue;
          }
          residuals.push((cpMeters / (bodyLengthIn * 0.0254)) * 100 - row.measured);
        }
        if (residuals.length === 0) continue;
        const bias = residuals.reduce((sum, v) => sum + v, 0) / residuals.length;
        summary.push(
          `CP ${band} ${model}: n=${residuals.length}, MAE ${meanAbs(residuals).toFixed(1)} pp, bias ${bias.toFixed(1)} pp`,
        );
      }
    }
    const [, ...quarantinedRows] = QUARANTINED_ARCAS_CSV.trim().split(/\r?\n/);
    const quarantinedCpCount = quarantinedRows.filter((row) => row.split(',')[1] === 'CP').length;
    console.log(
      'ARCAS per-band CP residual summary (model − measured, percentage points):\n  ' +
        summary.join('\n  ') +
        `\n  quarantined n=${quarantinedCpCount}; outside model sweep n=${outsideSweep}.`,
    );
    // Report-only is not assertion-free: every band with comparable data must
    // actually contribute residuals, and the excluded rows must be counted.
    const reportedBands = summary.filter((line) => line.includes('MAE'));
    expect(reportedBands.length).toBeGreaterThanOrEqual(4);
    for (const line of reportedBands) {
      const n = Number(/n=(\d+)/.exec(line)?.[1] ?? 0);
      expect(n, `${line} must report at least one scored point`).toBeGreaterThan(0);
    }
    expect(outsideSweep).toBe(2);
  });

  it('states which bands have no comparable data rather than implying coverage', () => {
    const unvalidated: string[] = [];
    for (const band of Object.keys(BANDS) as Band[]) {
      for (const model of ['ARCAS-short', 'ARCAS-long'] as const) {
        const rows = MEASURED.filter((r) => r.model === model && r.quantity !== 'CP' && bandOf(r.mach) === band);
        if (rows.length === 0) unvalidated.push(`${band} ${model}`);
      }
    }
    const [, ...quarantined] = QUARANTINED_ARCAS_CSV.trim().split(/\r?\n/);
    const [, ...sourcedSupersonic] = SOURCED_SUPERSONIC_CA_CSV.trim().split(/\r?\n/);
    console.log(
      'ARCAS bands with no base-corrected comparable data (NOT VALIDATED): ' +
        (unvalidated.join(', ') || 'none') +
        `\nExcluded from scoring: ${quarantined.length} legacy quarantined readings; ` +
        `${sourcedSupersonic.length} directly sourced uncorrected supersonic CA readings are not comparable.`,
    );
    // Supersonic must remain explicitly unvalidated: no comparable base-corrected data exists.
    expect(unvalidated).toContain('supersonic ARCAS-short');
    expect(unvalidated).toContain('supersonic ARCAS-long');
  });
});
