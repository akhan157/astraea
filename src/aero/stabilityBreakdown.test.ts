import { describe, it, expect } from 'vitest';
import { explainStability } from './stabilityBreakdown';
import { computeRocketStability } from './barrowman';
import { aggregateVehicleMass } from '../core/mass';
import { RocketVehicle } from '../core/types';

/** Stable reference rocket (nosecone + body tube + trapezoid fins). */
const alphaRocket: RocketVehicle = {
  id: 'alpha',
  name: 'Alpha Test Rocket',
  version: '1.0',
  author: 'Astraea Test',
  components: [
    {
      id: 'nc',
      name: 'Ogive Nosecone',
      type: 'nosecone',
      shape: 'ogive',
      length: 0.15,
      baseDiameter: 0.04,
      wallThickness: 0.002,
      isHollow: true,
      materialId: 'pla_3dprint',
    },
    {
      id: 'bt',
      name: 'Main Body Tube',
      type: 'bodytube',
      length: 0.45,
      outerDiameter: 0.04,
      innerDiameter: 0.038,
      materialId: 'cardboard',
    },
    {
      id: 'fins',
      name: 'Trapezoidal Fins',
      type: 'trapezoidfinset',
      finCount: 3,
      rootChord: 0.08,
      tipChord: 0.03,
      span: 0.06,
      sweepLength: 0.03,
      thickness: 0.0025,
      crossSection: 'rounded',
      axialOffset: 0.37,
      materialId: 'balsa',
    },
  ],
};

/** Boattail rocket: nosecone + body tube + aft boattail + fins on the tube. */
const boattailRocket: RocketVehicle = {
  id: 'boattail',
  name: 'Boattail Test Rocket',
  version: '1.0',
  author: 'Astraea Test',
  components: [
    {
      id: 'nc',
      name: 'Ogive Nosecone',
      type: 'nosecone',
      shape: 'ogive',
      length: 0.15,
      baseDiameter: 0.04,
      wallThickness: 0.002,
      isHollow: true,
      materialId: 'pla_3dprint',
    },
    {
      id: 'bt',
      name: 'Main Body Tube',
      type: 'bodytube',
      length: 0.35,
      outerDiameter: 0.04,
      innerDiameter: 0.038,
      materialId: 'cardboard',
    },
    {
      id: 'fins',
      name: 'Trapezoidal Fins',
      type: 'trapezoidfinset',
      finCount: 3,
      rootChord: 0.09,
      tipChord: 0.03,
      span: 0.06,
      sweepLength: 0.03,
      thickness: 0.0025,
      crossSection: 'rounded',
      axialOffset: 0.22,
      materialId: 'balsa',
    },
    {
      id: 'trans',
      name: 'Aft Boattail',
      type: 'transition',
      length: 0.06,
      foreDiameter: 0.04,
      aftDiameter: 0.03,
      wallThickness: 0.0015,
      isHollow: true,
      materialId: 'cardboard',
    },
  ],
};

/** Overstable: heavy nose mass override pulls CG far fore of a big CP. */
const heavyNoseRocket: RocketVehicle = {
  id: 'overstable',
  name: 'Overstable Test Rocket',
  version: '1.0',
  author: 'Astraea Test',
  components: [
    {
      id: 'nc',
      name: 'Heavy Nosecone',
      type: 'nosecone',
      shape: 'conical',
      length: 0.15,
      baseDiameter: 0.05,
      wallThickness: 0.002,
      isHollow: false,
      materialId: 'plywood',
      massOverride: 3.0,
      cgOverride: 0.05,
    },
    {
      id: 'bt',
      name: 'Body Tube',
      type: 'bodytube',
      length: 0.3,
      outerDiameter: 0.05,
      innerDiameter: 0.048,
      materialId: 'cardboard',
    },
    {
      id: 'fins',
      name: 'Big Fins',
      type: 'trapezoidfinset',
      finCount: 3,
      rootChord: 0.1,
      tipChord: 0.04,
      span: 0.07,
      sweepLength: 0.03,
      thickness: 0.003,
      crossSection: 'rounded',
      axialOffset: 0.2,
      materialId: 'plywood',
    },
  ],
};

/** Understable: heavy aft payload pulls CG aft of the resultant CP. */
const aftHeavyRocket: RocketVehicle = {
  id: 'understable',
  name: 'Understable Test Rocket',
  version: '1.0',
  author: 'Astraea Test',
  components: [
    {
      id: 'nc',
      name: 'Ogive Nosecone',
      type: 'nosecone',
      shape: 'ogive',
      length: 0.15,
      baseDiameter: 0.05,
      wallThickness: 0.002,
      isHollow: true,
      materialId: 'pla_3dprint',
    },
    {
      id: 'bt',
      name: 'Body Tube',
      type: 'bodytube',
      length: 0.5,
      outerDiameter: 0.05,
      innerDiameter: 0.048,
      materialId: 'cardboard',
    },
    {
      id: 'fins',
      name: 'Small Fins',
      type: 'trapezoidfinset',
      finCount: 3,
      rootChord: 0.04,
      tipChord: 0.02,
      span: 0.03,
      sweepLength: 0.01,
      thickness: 0.002,
      crossSection: 'rounded',
      axialOffset: 0.4,
      materialId: 'balsa',
    },
    {
      id: 'payload',
      name: 'Aft Payload',
      type: 'masscomponent',
      mass: 5.0,
      length: 0.05,
      axialOffset: 0.45,
      materialId: 'aluminum',
    },
  ],
};

/** Stable band: moderate fins + light aft payload (margin ~1.6 cal). */
const stableRocket: RocketVehicle = {
  id: 'stable',
  name: 'Stable Test Rocket',
  version: '1.0',
  author: 'Astraea Test',
  components: [
    {
      id: 'nc',
      name: 'Nosecone',
      type: 'nosecone',
      shape: 'conical',
      length: 0.15,
      baseDiameter: 0.05,
      wallThickness: 0.002,
      isHollow: false,
      materialId: 'plywood',
    },
    {
      id: 'bt',
      name: 'Body Tube',
      type: 'bodytube',
      length: 0.4,
      outerDiameter: 0.05,
      innerDiameter: 0.048,
      materialId: 'cardboard',
    },
    {
      id: 'fins',
      name: 'Fins',
      type: 'trapezoidfinset',
      finCount: 3,
      rootChord: 0.07,
      tipChord: 0.03,
      span: 0.05,
      sweepLength: 0.02,
      thickness: 0.003,
      crossSection: 'rounded',
      axialOffset: 0.32,
      materialId: 'balsa',
    },
    {
      id: 'payload',
      name: 'Aft Payload',
      type: 'masscomponent',
      mass: 0.08,
      length: 0.05,
      axialOffset: 0.3,
      materialId: 'aluminum',
    },
  ],
};

describe('explainStability', () => {
  it('matches computeRocketStability exactly on every total', () => {
    for (const vehicle of [alphaRocket, boattailRocket, heavyNoseRocket, aftHeavyRocket, stableRocket]) {
      const explain = explainStability(vehicle);
      const stability = computeRocketStability(vehicle);
      const rollup = aggregateVehicleMass(vehicle);

      expect(explain.totalCgM).toBe(stability.cg);
      expect(explain.totalCgM).toBe(rollup.cg);
      expect(explain.totalCpM).toBe(stability.cp);
      expect(explain.staticMarginCalibers).toBe(stability.staticMarginCalibers);
      expect(explain.components).toHaveLength(vehicle.components.length);
    }
  });

  it('matches aggregateVehicleMass and computeRocketStability row by row', () => {
    const vehicle = boattailRocket;
    const explain = explainStability(vehicle);
    const stability = computeRocketStability(vehicle);
    const rollup = aggregateVehicleMass(vehicle);

    for (let i = 0; i < vehicle.components.length; i++) {
      const row = explain.components[i];
      const contribution = stability.contributions[i];
      const massRes = rollup.components[i];

      expect(row.id).toBe(vehicle.components[i].id);
      expect(row.name).toBe(vehicle.components[i].name);
      expect(row.type).toBe(vehicle.components[i].type);
      expect(row.massKg).toBe(massRes.mass);
      expect(row.massKg).toBe(contribution.mass);
      expect(row.cgM).toBe(massRes.globalCG);
      expect(row.cgM).toBe(contribution.cg);
      expect(row.cnAlpha).toBe(contribution.cna ?? 0);
      expect(row.cpM).toBe(contribution.cp);
    }
  });

  it('reports CNa shares: non-lifting components contribute 0, lifters sum to 100%', () => {
    const explain = explainStability(boattailRocket);

    const nose = explain.components.find((c) => c.id === 'nc')!;
    const tube = explain.components.find((c) => c.id === 'bt')!;
    const fins = explain.components.find((c) => c.id === 'fins')!;
    const transition = explain.components.find((c) => c.id === 'trans')!;

    expect(tube.contributionPct).toBe(0);
    expect(tube.cnAlpha).toBe(0);
    expect(tube.cpM).toBeUndefined();
    expect(nose.contributionPct).toBeGreaterThan(0);
    expect(fins.contributionPct).toBeGreaterThan(nose.contributionPct);
    expect(transition.contributionPct).toBeLessThan(0); // boattail: negative CNa share

    const aeroShare = explain.components.reduce((sum, c) => sum + c.contributionPct, 0);
    expect(aeroShare).toBeCloseTo(100, 9);
  });

  describe('plainLanguage', () => {
    it('states CG/CP positions, margin in calibers and % of body length', () => {
      const explain = explainStability(alphaRocket);
      const stability = computeRocketStability(alphaRocket);

      const position = explain.plainLanguage.find((s) => s.startsWith('Center of gravity is'));
      expect(position).toContain(stability.cg.toFixed(3));
      expect(position).toContain(stability.cp.toFixed(3));

      const marginPct = ((stability.cp - stability.cg) / stability.totalLength) * 100;
      const marginNote = explain.plainLanguage.find((s) => s.startsWith('Static stability margin is'));
      expect(marginNote).toContain(`${stability.staticMarginCalibers.toFixed(2)} calibers`);
      expect(marginNote).toContain(`${marginPct.toFixed(1)}% of the ${stability.totalLength.toFixed(3)} m body length`);
    });

    it('lists which components pull the CP fore and aft', () => {
      const explain = explainStability(alphaRocket);
      const stability = computeRocketStability(alphaRocket);

      const aft = explain.plainLanguage.find((s) => s.startsWith('Pulls the CP aft:'));
      const fore = explain.plainLanguage.find((s) => s.startsWith('Pulls the CP fore:'));

      expect(aft).toContain('Trapezoidal Fins');
      expect(fore).toContain('Ogive Nosecone');

      // Directions must match the shipped numbers: a surface with
      // (cp_i - cpTotal) * cna_i < 0 pulls the resultant CP fore.
      for (const row of explain.components) {
        if (row.cnAlpha === 0 || row.cpM === undefined) continue;
        const list = (row.cpM - stability.cp) * row.cnAlpha < 0 ? fore : aft;
        expect(list).toContain(row.name);
      }
    });

    it('reports boattail CP movement direction and magnitude from shipped totals', () => {
      const explain = explainStability(boattailRocket);
      const stability = computeRocketStability(boattailRocket);

      const sentence = explain.plainLanguage.find((s) => s.startsWith('Boattail "Aft Boattail"'));
      expect(sentence).toBeDefined();

      // Cross-check with the removal formula over the shipped totals: removing
      // the transition's (cna, cp) must reproduce the reported movement.
      const transition = stability.contributions.find((c) => c.id === 'trans')!;
      const transitionCna = transition.cna!;
      const transitionCp = transition.cp!;
      const residual = stability.totalCNa - transitionCna;
      const cpWithout =
        Math.abs(residual) > 0.0001
          ? (stability.totalCNa * stability.cp - transitionCna * transitionCp) / residual
          : (2 / 3) * stability.totalLength;
      const deltaM = stability.cp - cpWithout;
      const direction = deltaM > 0 ? 'aft' : 'fore';
      const calibers = Math.abs(deltaM) / stability.referenceDiameter;

      expect(sentence).toContain(`moves the CP ${direction} by ${calibers.toFixed(2)} calibers`);
    });

    it('warns overstable beyond the 3.0 caliber shipped threshold', () => {
      const explain = explainStability(heavyNoseRocket);
      const stability = computeRocketStability(heavyNoseRocket);

      expect(stability.isOverStable).toBe(true);
      expect(stability.staticMarginCalibers).toBeGreaterThan(3.0);
      expect(explain.plainLanguage.some((s) => s.startsWith('Overstable:'))).toBe(true);
      expect(explain.plainLanguage.find((s) => s.startsWith('Overstable:'))).toContain(
        `${OVERSTABLE_REFERENCE.toFixed(1)} caliber windcocking threshold`
      );
    });

    it('flags understable below the 1.0 caliber shipped threshold', () => {
      const explain = explainStability(aftHeavyRocket);
      const stability = computeRocketStability(aftHeavyRocket);

      expect(stability.isStable).toBe(false);
      expect(stability.staticMarginCalibers).toBeLessThan(1.0);
      expect(explain.plainLanguage.some((s) => s.startsWith('Understable:'))).toBe(true);
      expect(explain.plainLanguage.find((s) => s.startsWith('Understable:'))).toContain(
        `${MIN_STABLE_REFERENCE.toFixed(1)} caliber stability minimum`
      );
    });

    it('reports a stable band note for a healthy margin', () => {
      const explain = explainStability(stableRocket);
      const stability = computeRocketStability(stableRocket);

      expect(stability.isStable).toBe(true);
      expect(stability.isOverStable).toBe(false);
      expect(stability.staticMarginCalibers).toBeGreaterThan(1.0);
      expect(stability.staticMarginCalibers).toBeLessThan(3.0);
      expect(explain.plainLanguage.some((s) => s.startsWith('Stable:'))).toBe(true);
    });
  });
});

// Shipped linter thresholds, kept here only so the wording tests stay
// coupled to the engine's constants (barrowman.ts computeRocketStability).
const MIN_STABLE_REFERENCE = 1.0;
const OVERSTABLE_REFERENCE = 3.0;