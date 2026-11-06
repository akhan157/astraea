import { describe, expect, it } from 'vitest';
import type { FinPoint, FreeformFinSetComponent, RocketVehicle, TrapezoidFinSetComponent } from '../core/types';
import { aggregateVehicleMass } from '../core/mass';
import { PRESET_ESTES_ALPHA } from '../state/presets';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { simulate6DofFlight } from '../sim/sixDofSimulator';
import { computeRocketStability } from './barrowman';
import { computeAerodynamicCurves } from './transonicAero';
import { analyzeFreeformPlanform, trapezoidPlanformPoints, validateFreeformPoints } from './finPlanform';

const REL = 1e-9;
function close(got: number, want: number, rel = REL): void {
  const tol = Math.max(rel * Math.abs(want), 1e-12);
  expect(Math.abs(got - want)).toBeLessThanOrEqual(tol);
}

const trapezoid = PRESET_ESTES_ALPHA.components.find((c) => c.type === 'trapezoidfinset') as TrapezoidFinSetComponent;

/** The Alpha with its trapezoid replaced by a freeform fin set tracing the same planform. */
function freeformAlpha(points: FinPoint[], overrides: Partial<FreeformFinSetComponent> = {}): RocketVehicle {
  return {
    ...PRESET_ESTES_ALPHA,
    components: PRESET_ESTES_ALPHA.components.map((c) =>
      c.type === 'trapezoidfinset'
        ? ({
            id: c.id,
            name: c.name,
            type: 'freeformfinset',
            finCount: c.finCount,
            points,
            thickness: c.thickness,
            crossSection: c.crossSection,
            axialOffset: c.axialOffset,
            materialId: c.materialId,
            ...overrides,
          } as FreeformFinSetComponent)
        : c,
    ),
  };
}

const alphaPoints = trapezoidPlanformPoints(trapezoid.rootChord, trapezoid.tipChord, trapezoid.span, trapezoid.sweepLength);

/** A clipped delta: swept, stepped leading edge with a bent trailing edge and an aft-overhanging tip. */
const CLIPPED_DELTA: FinPoint[] = [
  { x: 0, y: 0 },
  { x: 0.02, y: 0.012 },
  { x: 0.03, y: 0.012 }, // leading-edge step (parallel to the body axis, no span)
  { x: 0.045, y: 0.05 },
  { x: 0.075, y: 0.05 },
  { x: 0.074, y: 0.03 },
  { x: 0.07, y: 0 },
];

describe('freeform planform integrals', () => {
  it('reduces to the closed forms for a trapezoid', () => {
    const p = analyzeFreeformPlanform(alphaPoints);
    const { rootChord: cr, tipChord: ct, span: s, sweepLength: m } = trapezoid;
    close(p.span, s);
    close(p.rootChord, cr);
    close(p.tipChord, ct);
    close(p.area, 0.5 * (cr + ct) * s);
    close(p.chordSum, cr + ct);
    close(p.midChordLength, Math.hypot(s, m + 0.5 * ct - 0.5 * cr));
    close(p.macLength, (2 / 3) * (cr + ct - (cr * ct) / (cr + ct)));
    close(p.macLead, (m * (cr + 2 * ct)) / (3 * (cr + ct)));
    close(p.centroidX, (cr * cr + cr * ct + ct * ct + (cr + 2 * ct) * m) / (3 * (cr + ct)));
    close(p.cosLeadingEdge, s / Math.hypot(s, m));
  });

  it('matches a brute-force numeric integration on a stepped, bent planform', () => {
    const p = analyzeFreeformPlanform(CLIPPED_DELTA);
    // Independent check: scan 200 000 horizontal strips with a scanline fill.
    const N = 200_000;
    const span = 0.05;
    const dy = span / N;
    let area = 0;
    let c2 = 0;
    let leadC = 0;
    let moment = 0;
    for (let i = 0; i < N; i++) {
      const y = (i + 0.5) * dy;
      const xs: number[] = [];
      for (let k = 0; k < CLIPPED_DELTA.length; k++) {
        const a = CLIPPED_DELTA[k];
        const b = CLIPPED_DELTA[(k + 1) % CLIPPED_DELTA.length];
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
      }
      xs.sort((u, v) => u - v);
      expect(xs.length).toBe(2);
      const c = xs[1] - xs[0];
      area += c * dy;
      c2 += c * c * dy;
      leadC += xs[0] * c * dy;
      moment += c * ((xs[0] + xs[1]) / 2) * dy;
    }
    close(p.area, area, 1e-6);
    close(p.macLength, c2 / area, 1e-6);
    close(p.macLead, leadC / area, 1e-6);
    close(p.centroidX, moment / area, 1e-6);
    expect(p.span).toBeCloseTo(0.05, 12);
    expect(p.rootChord).toBeCloseTo(0.07, 12);
    // Stepped edge: the horizontal segment has no span weight, the rest is dy-weighted.
    const seg = (dx: number, dy2: number) => (dy2 * dy2) / Math.hypot(dy2, dx);
    close(p.cosLeadingEdge, (seg(0.02, 0.012) + seg(0.015, 0.038)) / 0.05);
    close(
      p.cosLeadingEdgeSquared,
      (0.012 ** 3 / (0.012 ** 2 + 0.02 ** 2) + 0.038 ** 3 / (0.038 ** 2 + 0.015 ** 2)) / 0.05,
    );
    expect(p.cosLeadingEdgeSquared).not.toBeCloseTo(p.cosLeadingEdge ** 2, 10);
  });

  it('describes a pointed tip (triangle) with zero tip chord', () => {
    const p = analyzeFreeformPlanform([{ x: 0, y: 0 }, { x: 0.1, y: 0.08 }, { x: 0.12, y: 0 }]);
    expect(p.tipChord).toBe(0);
    close(p.area, 0.5 * 0.12 * 0.08);
  });
});

describe('freeform outline validation fails closed', () => {
  const ok: FinPoint[] = [{ x: 0, y: 0 }, { x: 0.03, y: 0.05 }, { x: 0.06, y: 0.05 }, { x: 0.08, y: 0 }];
  const reject = (pts: FinPoint[], re: RegExp) => expect(() => validateFreeformPoints(pts)).toThrow(re);

  it('accepts a sound outline', () => expect(() => validateFreeformPoints(ok)).not.toThrow());
  it('needs three points', () => reject(ok.slice(0, 2), /at least 3 points/));
  it('rejects non-finite coordinates', () => reject([ok[0], { x: NaN, y: 0.05 }, ok[2], ok[3]], /point 2 must have finite/));
  it('requires the root leading edge at the origin', () => reject([{ x: 0.01, y: 0 }, ...ok.slice(1)], /first point must be the root leading edge/));
  it('requires the last point on the body', () => reject([...ok.slice(0, 3), { x: 0.08, y: 0.01 }], /last point must lie on the body/));
  it('requires the root trailing edge behind the leading edge', () => reject([...ok.slice(0, 3), { x: -0.02, y: 0 }], /root trailing edge behind/));
  it('rejects points inside the body', () => reject([ok[0], { x: 0.03, y: -0.01 }, ok[2], ok[3]], /point 2 is inside the body/));
  it('rejects interior points on the root line', () => reject([ok[0], { x: 0.03, y: 0 }, ok[2], ok[3]], /point 2 lies on the root line/));
  it('rejects duplicate neighbours', () => reject([ok[0], ok[1], ok[1], ok[2], ok[3]], /identical/));
  it('rejects a self-crossing outline', () =>
    reject([{ x: 0, y: 0 }, { x: 0.06, y: 0.05 }, { x: 0.03, y: 0.05 }, { x: 0.05, y: 0.02 }, { x: 0.08, y: 0 }], /not a simple polygon/));
  it('rejects a fold-back along the same line', () => reject([{ x: 0, y: 0 }, { x: 0.04, y: 0.04 }, { x: 0.02, y: 0.02 }, { x: 0.08, y: 0 }], /fold back|not a simple polygon/));
  it('rejects a slotted fin (two material intervals at one span station)', () => {
    const slotted: FinPoint[] = [
      { x: 0, y: 0 }, { x: 0, y: 0.06 }, { x: 0.04, y: 0.06 }, { x: 0.04, y: 0.02 },
      { x: 0.06, y: 0.02 }, { x: 0.06, y: 0.06 }, { x: 0.1, y: 0.06 }, { x: 0.1, y: 0 },
    ];
    expect(() => validateFreeformPoints(slotted)).not.toThrow(); // simple polygon...
    expect(() => analyzeFreeformPlanform(slotted)).toThrow(/4 outline edges across span 0.02–0.06 m/); // ...but not one interval
  });
});

describe('freeform fin = trapezoid, in the full vehicle model', () => {
  const free = freeformAlpha(alphaPoints);

  it('reproduces mass, CG and per-component rollup', () => {
    const a = aggregateVehicleMass(PRESET_ESTES_ALPHA);
    const b = aggregateVehicleMass(free);
    close(b.totalMass, a.totalMass);
    close(b.cg, a.cg);
    close(b.totalLength, a.totalLength);
    a.components.forEach((c, i) => {
      close(b.components[i].mass, c.mass);
      close(b.components[i].globalCG, c.globalCG);
      close(b.components[i].axialEnd, c.axialEnd);
    });
  });

  it('reproduces CNα, CP and static margin', () => {
    const a = computeRocketStability(PRESET_ESTES_ALPHA);
    const b = computeRocketStability(free);
    close(b.totalCNa, a.totalCNa);
    close(b.cp, a.cp);
    close(b.staticMarginCalibers, a.staticMarginCalibers);
    const fa = a.contributions.find((c) => c.id === trapezoid.id)!;
    const fb = b.contributions.find((c) => c.id === trapezoid.id)!;
    close(fb.cna!, fa.cna!);
    close(fb.cp!, fa.cp!);
  });

  it.each(['rounded', 'square', 'airfoil', 'double_wedge'] as const)('reproduces the full drag breakdown (%s section)', (crossSection) => {
    const trap: RocketVehicle = {
      ...PRESET_ESTES_ALPHA,
      components: PRESET_ESTES_ALPHA.components.map((c) => (c.type === 'trapezoidfinset' ? { ...c, crossSection } : c)),
    };
    const a = computeAerodynamicCurves(trap, true, 41);
    const b = computeAerodynamicCurves(freeformAlpha(alphaPoints, { crossSection }), true, 41);
    expect(b.dragCurves.length).toBe(a.dragCurves.length);
    a.dragCurves.forEach((row, i) => {
      const got = b.dragCurves[i];
      for (const k of ['totalCd', 'frictionCd', 'waveCd', 'baseCd', 'cp', 'staticMarginCalibers'] as const) {
        close(got[k], row[k]);
      }
    });
    close(b.maxTransonicCd, a.maxTransonicCd);
  });

  it('reproduces a full 6-DOF flight', () => {
    const options = { railLength: 1, railElevationDeg: 85, railAzimuthDeg: 0, windSpeedSurface: 3, windAzimuthDeg: 90 };
    const motor = CERTIFIED_MOTORS.estes_c6;
    const a = simulate6DofFlight(PRESET_ESTES_ALPHA, motor, options);
    const b = simulate6DofFlight(free, motor, options);
    expect(b.telemetry.length).toBe(a.telemetry.length);
    close(b.apogeeAltitude, a.apogeeAltitude);
    close(b.flightDuration, a.flightDuration);
    close(b.landingDistance, a.landingDistance);
    a.telemetry.forEach((p, i) => {
      const q = b.telemetry[i];
      close(q.altitude, p.altitude);
      close(q.speed, p.speed);
      close(q.drag, p.drag);
    });
  });

  it('honours weighed-mass and CG overrides like a trapezoid', () => {
    const over = { massOverride: 0.012, cgOverride: 0.03 };
    const trap: RocketVehicle = {
      ...PRESET_ESTES_ALPHA,
      components: PRESET_ESTES_ALPHA.components.map((c) => (c.type === 'trapezoidfinset' ? { ...c, ...over } : c)),
    };
    const a = aggregateVehicleMass(trap);
    const b = aggregateVehicleMass(freeformAlpha(alphaPoints, over));
    close(b.cg, a.cg);
    close(b.totalMass, a.totalMass);
  });
});

describe('freeform fin = a genuinely different planform', () => {
  it('weighs the polygon plate, and the clipped delta shifts CG/CP versus the trapezoid', () => {
    const v = freeformAlpha(CLIPPED_DELTA);
    const p = analyzeFreeformPlanform(CLIPPED_DELTA);
    const roll = aggregateVehicleMass(v);
    const fin = roll.components.find((c) => c.id === trapezoid.id)!;
    close(fin.mass, p.area * trapezoid.thickness * trapezoid.finCount * 1250); // pla_3dprint
    close(fin.localCG, p.centroidX);
    close(fin.axialEnd - fin.axialStart, p.rootChord);
    const st = computeRocketStability(v);
    expect(st.totalCNa).toBeGreaterThan(0);
    expect(st.cp).not.toBe(computeRocketStability(PRESET_ESTES_ALPHA).cp);
    const curves = computeAerodynamicCurves(v, true, 41);
    for (const row of curves.dragCurves) expect(Number.isFinite(row.totalCd)).toBe(true);
  });

  it('refuses an invalid outline anywhere it is used', () => {
    const bad = freeformAlpha([{ x: 0, y: 0 }, { x: 0.03, y: -0.02 }, { x: 0.07, y: 0 }]);
    expect(() => aggregateVehicleMass(bad)).toThrow(/inside the body/);
    expect(() => computeRocketStability(bad)).toThrow(/inside the body/);
    expect(() => computeAerodynamicCurves(bad, true, 5)).toThrow(/inside the body/);
  });
});
