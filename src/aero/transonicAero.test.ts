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

  it('models continuous C1 base drag with peak at Mach 1.0 and power-on plume drop', () => {
    const baseCdPowerOff = computeBaseDrag(1.5, 0.05, 0.05, false);
    const baseCdPowerOn = computeBaseDrag(1.5, 0.05, 0.05, true);

    expect(baseCdPowerOn).toBeLessThan(baseCdPowerOff * 0.5);

    // Peak at Mach 1.0
    const peak = computeBaseDrag(1.0, 0.05, 0.05, false);
    const prePeak = computeBaseDrag(0.9, 0.05, 0.05, false);
    const postPeak = computeBaseDrag(1.1, 0.05, 0.05, false);

    expect(peak).toBeCloseTo(0.38, 2);
    expect(prePeak).toBeLessThan(peak);
    expect(postPeak).toBeLessThan(peak);
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
