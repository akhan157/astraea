import { describe, expect, it } from 'vitest';
import fixtureJson from './p1_normal_fixture.json';
import { ARCAS_SHORT } from '../validation/arcas/arcas-vehicle';
import { computeRocketStability } from '../aero/barrowman';
import { prepareSupersonicNormal } from './loads';
import { publishedFinLiftSlopeRatio, publishedFinLiftSlopeRatioDerivative } from '../aero/transonicAero';
import {
  NORMAL_LEGACY_FULL_MACH,
  NORMAL_SUPERSONIC_FULL_MACH,
  publishedNormalAtMach,
  publishedNormalGroupsAt,
  type PublishedNormalParams,
} from './publishedNormal';

interface FixtureCase {
  mach: number;
  params: PublishedNormalParams;
  expected: { cna: number; cp: number; moment: number };
}

const fixture = fixtureJson as unknown as { law: string; cases: FixtureCase[] };

function close(got: number, expected: number): boolean {
  return Math.abs(got - expected) <= 1e-12 * Math.max(1, Math.abs(expected));
}

describe('published supersonic normal law (P1)', () => {
  it('matches the frozen Rust fixture to 1e-12 relative', () => {
    expect(fixture.law).toBe('published-supersonic-normal-v1');
    expect(fixture.cases.length).toBeGreaterThan(50);
    for (const c of fixture.cases) {
      const got = publishedNormalAtMach(c.mach, c.params);
      expect(close(got.cna, c.expected.cna), `cna M${c.mach}`).toBe(true);
      expect(close(got.moment, c.expected.moment), `moment M${c.mach}`).toBe(true);
      expect(close(got.cp, c.expected.cp), `cp M${c.mach}`).toBe(true);
    }
  });

  it('is bit-identical to the legacy groups at and below M 0.8', () => {
    for (const c of fixture.cases.filter((x) => x.mach <= NORMAL_LEGACY_FULL_MACH)) {
      const got = publishedNormalAtMach(c.mach, c.params);
      const legacyFin = c.params.finSets.reduce(
        (acc, s) => {
          acc.cna += s.cna;
          acc.moment += s.cna * s.cp;
          acc.absCna += Math.abs(s.cna);
          return acc;
        },
        { cna: 0, moment: 0, absCna: 0 },
      );
      // Exact equality: the legacy branch performs the same sums in the same order.
      expect(got.cna).toBe(c.params.bodyAttachedCna + legacyFin.cna);
      expect(got.moment).toBe(c.params.bodyAttachedMoment + legacyFin.moment);
    }
  });

  it('is continuous at both blend boundaries', () => {
    for (const c of fixture.cases.filter((x) => x.mach === 1.0)) {
      for (const boundary of [NORMAL_LEGACY_FULL_MACH, NORMAL_SUPERSONIC_FULL_MACH]) {
        const d = 1e-9;
        const before = publishedNormalAtMach(boundary - d, c.params);
        const after = publishedNormalAtMach(boundary + d, c.params);
        expect(Math.abs(after.cna - before.cna)).toBeLessThan(1e-5);
        expect(Math.abs(after.cp - before.cp)).toBeLessThan(1e-6);
      }
    }
  });

  it('the boattail parameter is the only difference between the arms', () => {
    for (const c of fixture.cases.filter((x) => x.mach === 2.0)) {
      const suppressed = publishedNormalGroupsAt(2.0, { ...c.params, boattailLift: 'suppressed' });
      const attached = publishedNormalGroupsAt(2.0, { ...c.params, boattailLift: 'attached' });
      const hasDistinctBoattail =
        c.params.bodyAttachedCna !== c.params.bodyPositiveCna ||
        c.params.bodyAttachedMoment !== c.params.bodyPositiveMoment;
      if (hasDistinctBoattail) expect(suppressed.cna).not.toBe(attached.cna);
      else expect(suppressed).toEqual(attached);
      // Below the band the parameter is unobservable.
      const s0 = publishedNormalGroupsAt(0.5, { ...c.params, boattailLift: 'suppressed' });
      const a0 = publishedNormalGroupsAt(0.5, { ...c.params, boattailLift: 'attached' });
      expect(s0).toEqual(a0);
    }
  });

  it('fails closed on a nonfinite prepared parameter above the legacy domain', () => {
    const base = fixture.cases[0].params;
    expect(() =>
      publishedNormalGroupsAt(2.0, { ...base, bodyPositiveCna: Number.NaN }),
    ).toThrow(/nonfinite published supersonic parameters/);
    // Legacy domain is unaffected.
    expect(publishedNormalGroupsAt(0.5, { ...base, bodyPositiveCna: Number.NaN }).cna).toBeTruthy();
  });
});

describe('published supersonic normal law derivative continuity (P1 fix)', () => {
  it('matches the limited endpoint slopes and is C1 where limiting is inactive', () => {
    const h = 1e-6;
    for (const c of fixture.cases.filter((x) => x.mach === 1.0)) {
      for (const boundary of [NORMAL_LEGACY_FULL_MACH, NORMAL_SUPERSONIC_FULL_MACH]) {
        const at = publishedNormalAtMach(boundary, c.params);
        const left = publishedNormalAtMach(boundary - h, c.params);
        const right = publishedNormalAtMach(boundary + h, c.params);
        const dlC = (at.cna - left.cna) / h;
        const drC = (right.cna - at.cna) / h;
        const dlCp = (at.cp - left.cp) / h;
        const drCp = (right.cp - at.cp) / h;
        const dlJ = (at.moment - left.moment) / h;
        const drJ = (right.moment - at.moment) / h;
        if (boundary === NORMAL_LEGACY_FULL_MACH) {
          expect(Math.abs(dlC - drC)).toBeLessThanOrEqual(1e-2);
          expect(Math.abs(dlCp - drCp)).toBeLessThanOrEqual(1e-3);
          expect(Math.abs(dlJ - drJ)).toBeLessThanOrEqual(1e-2);
        } else {
          let blendC = 0;
          let blendJ = 0;
          let exteriorC = 0;
          let exteriorJ = 0;
          let inactive = true;
          for (const set of c.params.finSets) {
            const end = set.cna * publishedFinLiftSlopeRatio(1.2, set.aspectRatio, set.leadingEdgeCos);
            const secant = (end - set.cna) / (1.2 - 0.8);
            const exterior = set.cna * publishedFinLiftSlopeRatioDerivative(1.2, set.aspectRatio, set.leadingEdgeCos);
            // m0=0: the FC circle intersects this axis at beta=3.
            const limited = secant * exterior <= 0 ? 0 : Math.sign(exterior) * Math.min(Math.abs(exterior), 3 * Math.abs(secant));
            inactive &&= limited === exterior;
            blendC += limited;
            blendJ += limited * set.cp;
            exteriorC += exterior;
            exteriorJ += exterior * set.cp;
          }
          const cpSlope = (dc: number, dj: number) => (dj * at.cna - at.moment * dc) / (at.cna * at.cna);
          for (const [got, expected, floor] of [
            [dlC, blendC, 1], [dlJ, blendJ, 1], [dlCp, cpSlope(blendC, blendJ), 1e-3],
            [drC, exteriorC, 1], [drJ, exteriorJ, 1], [drCp, cpSlope(exteriorC, exteriorJ), 1e-3],
          ]) {
            expect(Math.abs(got - expected)).toBeLessThanOrEqual(1e-2 * Math.max(floor, Math.abs(expected)));
          }
          if (inactive) {
            expect(Math.abs(dlC - drC)).toBeLessThanOrEqual(1e-2 * Math.max(1, Math.abs(drC)));
            expect(Math.abs(dlCp - drCp)).toBeLessThanOrEqual(1e-2 * Math.max(1e-3, Math.abs(drCp)));
            expect(Math.abs(dlJ - drJ)).toBeLessThanOrEqual(1e-2 * Math.max(1, Math.abs(drJ)));
          }
        }
      }
    }
  });

  it('stays finite at a swept-sonic endpoint (Mn = 1 at M = 1.2)', () => {
    const c = fixture.cases.find((x) => x.mach === 2.0)!;
    const params: PublishedNormalParams = {
      ...c.params,
      finSets: [{ ...c.params.finSets[0], leadingEdgeCos: 1 / NORMAL_SUPERSONIC_FULL_MACH }],
    };
    for (const m of [1.19, 1.2, 1.21]) {
      const got = publishedNormalAtMach(m, params);
      expect(Number.isFinite(got.cna)).toBe(true);
      expect(Number.isFinite(got.cp)).toBe(true);
      expect(Number.isFinite(got.moment)).toBe(true);
    }
    expect(
      Number.isFinite(
        publishedFinLiftSlopeRatioDerivative(1.2, params.finSets[0].aspectRatio, 1 / 1.2),
      ),
    ).toBe(true);
  });
});

describe('shape-preserving transonic blend (P1 r3)', () => {
  function prepare(sweep: number): PublishedNormalParams {
    const vehicle = structuredClone(ARCAS_SHORT);
    const fin = vehicle.components.find((c) => c.type === 'trapezoidfinset')!;
    if (fin.type !== 'trapezoidfinset') throw new Error('missing fin');
    fin.sweepLength = sweep;
    return prepareSupersonicNormal(vehicle, computeRocketStability(vehicle).contributions);
  }

  it('keeps the ARCAS-short near-swept-sonic reproducer positive', () => {
    const p = prepare(0.035436937010036015);
    expect(p.finSets[0].leadingEdgeCos).toBeCloseTo(0.8333, 15);
    const got = publishedNormalAtMach(1, p);
    expect(got.cna).toBeGreaterThan(0);
    expect(Number.isFinite(got.cp)).toBe(true);
    console.log('reproducer', JSON.stringify(got));
  });

  it('bounds every group and retains positive CNα and finite CP across the dense sweep/Mach scan', () => {
    const cosines = Array.from({ length: 601 }, (_, k) => 0.70 + k * 0.0005);
    cosines.push(0.8333, 1 / 1.2 - 1e-10, 1 / 1.2, 1 / 1.2 + 1e-10);
    let samples = 0;
    let minCna = Infinity;
    let maxCna = -Infinity;
    const bounded = (value: number, a: number, b: number) => {
      if (!Number.isFinite(value) || value < Math.min(a, b) || value > Math.max(a, b)) {
        throw new Error(`${value} outside endpoint bounds [${a}, ${b}]`);
      }
    };
    for (const cos of cosines) {
      const p = prepare(2.103 * 0.0254 * Math.sqrt(1 / (cos * cos) - 1));
      for (const boattailLift of ['suppressed', 'attached'] as const) {
        const params = { ...p, boattailLift };
        const fin = { ...params, bodyAttachedCna: 0, bodyAttachedMoment: 0, bodyAttachedAbsCna: 0,
          bodyPositiveCna: 0, bodyPositiveMoment: 0, bodyPositiveAbsCna: 0 };
        const body = { ...params, finSets: [] };
        const endpoints = [fin, body].map((group) => [publishedNormalAtMach(0.8, group), publishedNormalAtMach(1.2, group)]);
        for (let k = 0; k <= 400; k++) {
          const mach = k === 400 ? 1.2 : 0.8 + k * 0.001;
          const got = publishedNormalAtMach(mach, params);
          if (!(got.cna > 0) || !Number.isFinite(got.cp) || !Number.isFinite(got.moment)) {
            throw new Error(`unsupported cos=${cos} M=${mach}: ${JSON.stringify(got)}`);
          }
          for (const [i, group] of [fin, body].entries()) {
            const value = publishedNormalAtMach(mach, group);
            for (const key of ['cna', 'moment', 'absCna'] as const) {
              bounded(value[key], endpoints[i][0][key], endpoints[i][1][key]);
            }
          }
          minCna = Math.min(minCna, got.cna);
          maxCna = Math.max(maxCna, got.cna);
          samples++;
        }
      }
    }
    expect(samples).toBe(605 * 2 * 401);
    console.log('dense scan', JSON.stringify({ samples, minCna, maxCna, nonpositive: 0, outOfBounds: 0, nonfiniteCp: 0 }));
  });
});
