import { describe, it, expect } from 'vitest';
import {
  computeCompressibleSkinFriction,
  computeNoseconeWaveDrag,
  computeBaseDrag,
  computeAerodynamicCurves,
} from './transonicAero';
import { PRESET_NASA_STUDENT_LAUNCH } from '../state/presets';
import { ARCAS_SHORT } from '../validation/arcas/arcas-vehicle';
import { ARCAS_TUNNEL_REYNOLDS_PER_METER } from '../validation/arcas/arcas-test-conditions';

/**
 * Frozen pre-R39 reference for the r < 1 branch, copied verbatim from
 * `computeBaseDrag` at `84271a4`. That branch is unchanged below r = 0.9, so
 * this is the expected-value oracle for the blend tests; it is never called by
 * production code.
 */
function legacyBaseDragReference(
  mach: number,
  baseDiameter: number,
  bodyDiameter: number,
  isMotorBurning: boolean
): number {
  const boattailFactor = Math.pow(baseDiameter / Math.max(0.01, bodyDiameter), 2);
  let baseCd = 0;
  if (mach < 0.8) {
    baseCd = 0.12 + 0.13 * Math.pow(mach, 2);
  } else if (mach >= 0.8 && mach <= 1.2) {
    const cd08 = 0.12 + 0.13 * 0.64;
    const cd12 = 0.38 / Math.pow(1.2, 1.2);
    const peakCd = 0.38;
    if (mach <= 1.0) {
      const t = (mach - 0.8) / 0.2;
      baseCd = cd08 + (peakCd - cd08) * (3 * t * t - 2 * t * t * t);
    } else {
      const t = (mach - 1.0) / 0.2;
      baseCd = peakCd - (peakCd - cd12) * (3 * t * t - 2 * t * t * t);
    }
  } else {
    baseCd = 0.38 / Math.pow(mach, 1.2);
  }
  const plumeReduction = isMotorBurning ? 0.38 : 1.0;
  return baseCd * boattailFactor * plumeReduction;
}

describe('Transonic & Supersonic Aerodynamics Engine', () => {
  it('computes Van Driest II compressible turbulent skin friction with altitude scaling', () => {
    const cfSubsonic = computeCompressibleSkinFriction(0.2, 0.5, 68, 0);
    const cfSupersonic = computeCompressibleSkinFriction(2.0, 0.5, 680, 0);

    expect(cfSubsonic).toBeGreaterThan(0.002);
    // Compressibility thins boundary layer gradient, lowering Cf
    expect(cfSupersonic).toBeLessThan(cfSubsonic);

    // Altitude scaling: Thinner air at 8km lowers Reynolds number, increasing friction coefficient
    const cfHighAlt = computeCompressibleSkinFriction(1.5, 1.0, 500, 8000, 0.1);
    const cfSeaLevel = computeCompressibleSkinFriction(1.5, 1.0, 500, 0, 0.1);
    expect(cfHighAlt).toBeGreaterThan(cfSeaLevel);
  });

  it('proves Von Kármán nosecone has lower wave drag than conical at Mach 2', () => {
    const vonKarmanComp = {
      id: 'vk',
      name: 'Von Karman Nose',
      type: 'nosecone' as const,
      shape: 'vonkarman' as const,
      length: 0.5,
      baseDiameter: 0.1,
      wallThickness: 0.002,
      isHollow: true,
      materialId: 'carbonfiber',
    };

    const conicalComp = {
      ...vonKarmanComp,
      shape: 'conical' as const,
    };

    const waveCdVK = computeNoseconeWaveDrag(vonKarmanComp, 2.0);
    const waveCdConical = computeNoseconeWaveDrag(conicalComp, 2.0);

    expect(waveCdVK).toBeLessThan(waveCdConical);
  });

  it('models measured cylinder base drag with peak near Mach 1.2 and power-on plume drop', () => {
    const baseCdPowerOff = computeBaseDrag(1.5, 0.05, 0.05, false);
    const baseCdPowerOn = computeBaseDrag(1.5, 0.05, 0.05, true);

    expect(baseCdPowerOn).toBeLessThan(baseCdPowerOff * 0.5);

    // Frozen TN D-4821 anchors; peak near Mach 1.2.
    for (const [mach, amplitude] of [
      [0.30, 0.1303],
      [0.40, 0.1466],
      [0.50, 0.1461],
      [0.60, 0.1462],
      [0.70, 0.1437],
      [0.80, 0.1447],
      [0.90, 0.1549],
      [0.95, 0.1651],
      [1.00, 0.1842],
      [1.10, 0.2062],
      [1.20, 0.2141],
      [1.30, 0.2021],
    ]) {
      expect(computeBaseDrag(mach, 0.05, 0.05, false)).toBeCloseTo(amplitude, 12);
    }
    const peak = computeBaseDrag(1.2, 0.05, 0.05, false);
    const prePeak = computeBaseDrag(0.9, 0.05, 0.05, false);
    const postPeak = computeBaseDrag(1.3, 0.05, 0.05, false);
    expect(prePeak).toBeLessThan(peak);
    expect(postPeak).toBeLessThan(peak);
    // M 2.0 and burning numeric anchors.
    expect(computeBaseDrag(2.0, 0.05, 0.05, false)).toBeCloseTo(0.1484609642208389, 12);
    expect(computeBaseDrag(1.5, 0.05, 0.05, true)).toBeCloseTo(0.06931895530374162, 12);
    // Tail meets the legacy amplitude at M = 2.5.
    expect(computeBaseDrag(2.5, 0.05, 0.05, false)).toBeCloseTo(0.1265390901841716, 12);
    // r > 1 scales the same amplitude by the area ratio.
    expect(computeBaseDrag(1.0, 0.06, 0.05, false)).toBeCloseTo(0.1842 * 1.44, 12);
  });

  it('keeps the boattail branch bit-identical to frontend/design @ 8fd48f0', () => {
    // Exact R38 frozen values from the unchanged r < 1 branch.
    expect(computeBaseDrag(1.5, 0.1, 0.152, false)).toBe(0.10110832362738245);
    expect(computeBaseDrag(1.5, 0.1, 0.152, true)).toBe(0.03842116297840533);
    expect(computeBaseDrag(2.0, 0.1, 0.152, false)).toBe(0.07159132921843128);
    expect(computeBaseDrag(2.0, 0.1, 0.152, true)).toBe(0.027204705103003886);
    expect(computeBaseDrag(0.5, 0.815, 1.0, false)).toBe(0.1012943125);
    expect(computeBaseDrag(3.3, 0.606, 1.0, false)).toBe(0.03330520545460667);
    expect(computeBaseDrag(1.5, 0.088, 0.102, false)).toBe(0.1738757781158215);
    expect(computeBaseDrag(1.5, 0.088, 0.102, true)).toBe(0.06607279568401217);
  });

  it('blends the boattail and cylinder laws between r = 0.9 and r = 1.0', () => {
    // At r = 0.95 (t = 0.5, s = 0.5) and M = 1.0 (legacy peak 0.38, cylinder
    // anchor 0.1842) the decimal arithmetic is exact:
    //   legacy   = 0.38   * 0.95^2 = 0.34295
    //   cylinder = 0.1842 * 0.95^2 = 0.1662405
    //   blend    = 0.5*0.34295 + 0.5*0.1662405 = 0.25459525
    expect(legacyBaseDragReference(1.0, 0.95, 1.0, false)).toBeCloseTo(0.34295, 15);
    expect(computeBaseDrag(1.0, 1.0, 1.0, false) * 0.95 * 0.95).toBeCloseTo(0.1662405, 15);
    expect(computeBaseDrag(1.0, 0.95, 1.0, false)).toBeCloseTo(0.25459525, 15);

    for (const mach of [0, 0.3, 0.5, 0.8, 0.9, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0]) {
      for (const r of [0.925, 0.95, 0.975, 0.99, 0.999]) {
        for (const burning of [false, true]) {
          const t = (r - 0.9) / 0.1;
          const s = 3 * t * t - 2 * t * t * t;
          const legacy = legacyBaseDragReference(mach, r, 1.0, burning);
          const cylinder = computeBaseDrag(mach, 1.0, 1.0, burning) * r * r;
          expect(computeBaseDrag(mach, r, 1.0, burning)).toBeCloseTo((1 - s) * legacy + s * cylinder, 14);
        }
      }
    }
  });

  it('keeps base drag continuous across r = 1', () => {
    for (const burning of [false, true]) {
      let maxStep = 0;
      for (let mi = 0; mi <= 300; mi++) {
        const mach = mi / 100;
        let prev = computeBaseDrag(mach, 0.9, 1.0, burning);
        for (let ri = 1; ri <= 1000; ri++) {
          const r = (9000 + ri) / 10000;
          const got = computeBaseDrag(mach, r, 1.0, burning);
          maxStep = Math.max(maxStep, Math.abs(got - prev));
          prev = got;
        }
      }
      expect(maxStep).toBeLessThanOrEqual(0.01);
    }
  });

  it('pins both blend endpoints exactly', () => {
    for (const mach of [0, 0.3, 0.9, 1.0, 1.5, 2.5, 3.0]) {
      for (const burning of [false, true]) {
        // s = 0 at r = 0.9: the blend returns the legacy value exactly.
        expect(computeBaseDrag(mach, 0.9, 1.0, burning)).toBe(legacyBaseDragReference(mach, 0.9, 1.0, burning));
        // s -> 1 at r -> 1: no step against the r >= 1 dispatch.
        const below = computeBaseDrag(mach, 1 - 1e-12, 1.0, burning);
        const atOne = computeBaseDrag(mach, 1.0, 1.0, burning);
        expect(Math.abs(below - atOne)).toBeLessThanOrEqual(1e-11);
      }
    }
  });

  it('uses the published tunnel Reynolds number for friction without changing pressure drag', () => {
    const seaLevel = computeAerodynamicCurves(ARCAS_SHORT, false, 41);
    const tunnel = computeAerodynamicCurves(
      ARCAS_SHORT,
      false,
      41,
      ARCAS_TUNNEL_REYNOLDS_PER_METER,
    );

    expect(tunnel.dragCurves[8].frictionCd).toBeGreaterThan(seaLevel.dragCurves[8].frictionCd);
    expect(tunnel.dragCurves[8].waveCd).toBeCloseTo(seaLevel.dragCurves[8].waveCd, 12);
  });

  it('uses fin mean chord for the fin-surface Reynolds length', () => {
    const genericVehicle = {
      ...ARCAS_SHORT,
      components: ARCAS_SHORT.components.map((component) =>
        component.type === 'trapezoidfinset'
          ? { ...component, rootChord: component.rootChord + 2e-6 }
          : component,
      ),
    };
    const shorterChordVehicle = {
      ...genericVehicle,
      components: genericVehicle.components.map((component) =>
        component.type === 'trapezoidfinset'
          ? {
              ...component,
              rootChord: component.rootChord / 2,
              tipChord: component.tipChord / 2,
              span: component.span * 2,
            }
          : component,
      ),
    };
    const standard = computeAerodynamicCurves(
      genericVehicle,
      false,
      41,
      ARCAS_TUNNEL_REYNOLDS_PER_METER,
    ).dragCurves[6].frictionCd;
    const shorterChord = computeAerodynamicCurves(
      shorterChordVehicle,
      false,
      41,
      ARCAS_TUNNEL_REYNOLDS_PER_METER,
    ).dragCurves[6].frictionCd;

    // Both shapes avoid the source-specific rake; equal area and lower chord isolate Re.
    expect(shorterChord).toBeGreaterThan(standard);
  });

  it('does not amplify whole-body friction when nose length changes at fixed overall length', () => {
    const nose = ARCAS_SHORT.components.find((component) => component.type === 'nosecone');
    const tube = ARCAS_SHORT.components.find((component) => component.type === 'bodytube');
    if (!nose || !tube) throw new Error('ARCAS fixture needs a nose and body tube');
    const shortening = nose.length / 2;
    const shorterNoseVehicle = {
      ...ARCAS_SHORT,
      components: ARCAS_SHORT.components.map((component) => {
        if (component.type === 'nosecone') return { ...component, length: component.length - shortening };
        if (component.type === 'bodytube' && component.id === tube.id) {
          return { ...component, length: component.length + shortening };
        }
        return component;
      }),
    };
    const standard = computeAerodynamicCurves(ARCAS_SHORT, false, 41, ARCAS_TUNNEL_REYNOLDS_PER_METER);
    const shorter = computeAerodynamicCurves(shorterNoseVehicle, false, 41, ARCAS_TUNNEL_REYNOLDS_PER_METER);

    // The body scale and Reynolds length are unchanged. A nose-local reuse
    // of the closed-body form factor spuriously amplifies the friction term.
    expect(shorter.dragCurves[6].frictionCd / standard.dragCurves[6].frictionCd).toBeLessThan(1.2);
    // Nose geometry must still influence its separate pressure-drag path.
    expect(shorter.dragCurves[12].waveCd).toBeGreaterThan(standard.dragCurves[12].waveCd);
  });
  it('applies the sourced ARCAS trailing-root rake and Mach-dependent fin lift slope', () => {
    const unrakedVehicle = {
      ...ARCAS_SHORT,
      components: ARCAS_SHORT.components.map((component) =>
        component.type === 'trapezoidfinset'
          ? { ...component, rootChord: component.rootChord + 2e-6 }
          : component,
      ),
    };
    const raked = computeAerodynamicCurves(ARCAS_SHORT, false, 41, ARCAS_TUNNEL_REYNOLDS_PER_METER);
    const unraked = computeAerodynamicCurves(unrakedVehicle, false, 41, ARCAS_TUNNEL_REYNOLDS_PER_METER);

    expect(raked.dragCurves[0].frictionCd).toBeLessThan(unraked.dragCurves[0].frictionCd);
    expect(raked.dragCurves[10].waveCd).toBeLessThan(unraked.dragCurves[10].waveCd);
    expect(raked.dragCurves[10].cp).toBeGreaterThan(raked.dragCurves[9].cp);

    const withoutFins = computeAerodynamicCurves(
      { ...ARCAS_SHORT, components: ARCAS_SHORT.components.filter((component) => component.type !== 'trapezoidfinset') },
      false,
      41,
    );
    expect(withoutFins.dragCurves[10].cp).toBeCloseTo(withoutFins.dragCurves[9].cp, 12);
  });



  it('generates complete Mach 0 to 4 drag curve with transonic spike', () => {
    const res = computeAerodynamicCurves(PRESET_NASA_STUDENT_LAUNCH, false, 21);

    expect(res.dragCurves.length).toBe(21);
    expect(res.maxTransonicCd).toBeGreaterThan(res.subsonicCd); // Transonic drag rise
    expect(res.machAtMaxCd).toBeGreaterThanOrEqual(0.9);
    expect(res.machAtMaxCd).toBeLessThanOrEqual(1.3);

    // Center of Pressure should migrate forward above Mach 1
    const subCP = res.dragCurves[0].cp;
    const superCP = res.dragCurves.find((d) => d.mach >= 2.0)?.cp || 0;
    expect(superCP).toBeLessThan(subCP);
  });

  it('adds transonic boat-tail surface pressure drag separately from base drag', () => {
    const withBoattail = computeAerodynamicCurves(ARCAS_SHORT, false, 41).dragCurves;
    const withoutBoattail = computeAerodynamicCurves(
      {
        ...ARCAS_SHORT,
        components: ARCAS_SHORT.components.filter((component) => component.type !== 'transition'),
      },
      false,
      41,
    ).dragCurves;
    const m08With = withBoattail[8];
    const m08Without = withoutBoattail[8];
    const m1With = withBoattail[10];
    const m1Without = withoutBoattail[10];

    expect(m08With.waveCd).toBeCloseTo(m08Without.waveCd, 12);
    expect(m1With.waveCd).toBeGreaterThan(m1Without.waveCd);
    expect(m1With.baseCd).toBeLessThan(m1Without.baseCd);
  });
});
