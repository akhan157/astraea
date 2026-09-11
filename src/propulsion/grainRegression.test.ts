/**
 * Grain regression contract tests (web-based geometry lane).
 *
 * The regression traces are purely geometric: sampled per burned web depth
 * from the exact (piecewise) analytic formulas for each C10 build-set
 * geometry — BATES (cylindrical core), star (analytic perimeter), end
 * burner (constant disc), rod & tube (concentric circles), moon burner
 * (offset circle then crescent), C-slot (grown core circle plus slot
 * walls). Zero-web samples must reproduce the initial geometry exactly,
 * traces must reach burnout (remaining volume 0) at the full web, character
 * must match the survey (end burner flat; rod & tube neutral; moon
 * progressive-regressive hump; C-slot small spike then decrease), and
 * chamber pressure must follow the open-closed mass balance
 * m_dot = rho*A_b*r, Pc = m_dot * c* / A_t (positive, finite, exactly
 * linear in burn area). Fail-closed validation: degenerate or non-finite
 * inputs throw RangeError.
 */
import { describe, it, expect } from 'vitest';
import {
  chamberPressure,
  regressBates,
  regressCSlot,
  regressEndBurner,
  regressMoonBurner,
  regressRodTube,
  regressStar,
  type BatesGrain,
  type GrainRegressionTrace,
  type StarGrain,
} from './grainRegression';

const BATES_NEUTRAL: BatesGrain = {
  outerDiameter: 0.06, // m
  length: 0.2, // m
  coreDiameter: 0.048, // m, thin web: (0.06-0.048)/2 = 6 mm
  inhibitedEnds: true,
};

const BATES_OPEN_ENDS: BatesGrain = {
  outerDiameter: 0.06,
  length: 0.2,
  coreDiameter: 0.04,
  inhibitedEnds: false,
};

const STAR: StarGrain = {
  outerDiameter: 0.07,
  length: 0.25,
  points: 5,
  valleyRadius: 0.012,
};

const BATES_STEP = 0.0005;
const STAR_STEP = 0.0008;
const RATE = 0.004; // m/s constant linear burn rate

// C10 build-set fixtures (docs/grain-geometry-survey.md): a shared 60 mm,
// 200 mm case with per-geometry core/rod/slot/offset definitions.
const NEW_STEP = 0.001;

// End burner: full 60 mm disc is the burning face, full web = length.
const END_BURNER = { outerDiameter: 0.06, length: 0.2 };

// Rod & tube: tube web (0.06-0.03)/2 = 15 mm, rod web 5 mm (matched: rod
// burns out no later than the tube reaches the case).
const ROD_TUBE = { outerDiameter: 0.06, length: 0.2, coreDiameter: 0.03, rodDiameter: 0.01 };

// Moon burner: 16 mm core offset 12 mm; contact web = 0.03-0.012-0.008 =
// 0.010 m, full web = 0.03+0.012-0.008 = 0.034 m.
const MOON = { outerDiameter: 0.06, length: 0.2, coreDiameter: 0.016, offset: 0.012 };

// C-slot: 16 mm core with a 5 mm slot through to the case; full web =
// (0.06-0.016)/2 = 0.022 m.
const CSLOT = { outerDiameter: 0.06, length: 0.2, coreDiameter: 0.016, slotWidth: 0.005 };

describe('grain regression: zero web reproduces initial geometry exactly', () => {
  it('BATES with inhibited ends: core circle, lateral wall, full annulus volume', () => {
    const t = regressBates(BATES_NEUTRAL, BATES_STEP, RATE);
    const coreR = BATES_NEUTRAL.coreDiameter / 2;
    const outerR = BATES_NEUTRAL.outerDiameter / 2;
    expect(t.webBurned[0]).toBe(0);
    expect(t.portArea[0]).toBeCloseTo(Math.PI * coreR * coreR, 12);
    expect(t.burnArea[0]).toBeCloseTo(2 * Math.PI * coreR * BATES_NEUTRAL.length, 12);
    expect(t.volumeRemaining[0]).toBeCloseTo(
      Math.PI * (outerR * outerR - coreR * coreR) * BATES_NEUTRAL.length,
      12,
    );
  });

  it('BATES with uninhibited ends adds both annular end faces', () => {
    const t = regressBates(BATES_OPEN_ENDS, BATES_STEP, RATE);
    const coreR = BATES_OPEN_ENDS.coreDiameter / 2;
    const outerR = BATES_OPEN_ENDS.outerDiameter / 2;
    const annulus = Math.PI * (outerR * outerR - coreR * coreR);
    expect(t.burnArea[0]).toBeCloseTo(
      2 * Math.PI * coreR * BATES_OPEN_ENDS.length + 2 * annulus,
      12,
    );
  });

  it('star: analytic perimeter 2*pi*valleyR + 2*points*(outerR - valleyR)', () => {
    const t = regressStar(STAR, STAR_STEP, RATE);
    const outerR = STAR.outerDiameter / 2;
    const perimeter = 2 * Math.PI * STAR.valleyRadius + 2 * STAR.points * (outerR - STAR.valleyRadius);
    expect(t.webBurned[0]).toBe(0);
    expect(t.burnArea[0]).toBeCloseTo(perimeter * STAR.length, 12);
    expect(t.portArea[0]).toBeCloseTo(Math.PI * STAR.valleyRadius * STAR.valleyRadius, 12);
    expect(t.volumeRemaining[0]).toBeCloseTo(
      Math.PI * (outerR * outerR - STAR.valleyRadius * STAR.valleyRadius) * STAR.length,
      12,
    );
  });
});

describe('grain regression: trace structure and burnout', () => {
  it('web advances by webStep from 0 to the full web and all arrays align', () => {
    const t = regressBates(BATES_NEUTRAL, BATES_STEP, RATE);
    expect(t.burnArea.length).toBe(t.webBurned.length);
    expect(t.portArea.length).toBe(t.webBurned.length);
    expect(t.volumeRemaining.length).toBe(t.webBurned.length);
    for (let i = 0; i < t.webBurned.length; i++) {
      expect(t.webBurned[i]).toBeCloseTo(i * BATES_STEP, 12);
      expect(t.portArea[i]).toBeGreaterThan(0);
      expect(t.burnArea[i]).toBeGreaterThan(0);
      expect(t.volumeRemaining[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('full web burns the grain out: remaining volume 0, port at outer radius', () => {
    const bates = regressBates(BATES_NEUTRAL, BATES_STEP, RATE);
    const lastB = bates.webBurned.length - 1;
    expect(bates.webBurned[lastB]).toBeCloseTo(
      BATES_NEUTRAL.outerDiameter / 2 - BATES_NEUTRAL.coreDiameter / 2,
      12,
    );
    expect(bates.volumeRemaining[lastB]).toBeCloseTo(0, 12);
    expect(bates.portArea[lastB]).toBeCloseTo(
      Math.PI * (BATES_NEUTRAL.outerDiameter / 2) ** 2,
      6,
    );

    const star = regressStar(STAR, STAR_STEP, RATE);
    const lastS = star.webBurned.length - 1;
    expect(star.webBurned[lastS]).toBeCloseTo(STAR.outerDiameter / 2 - STAR.valleyRadius, 12);
    expect(star.volumeRemaining[lastS]).toBeCloseTo(0, 12);
    expect(star.portArea[lastS]).toBeCloseTo(Math.PI * (STAR.outerDiameter / 2) ** 2, 6);
  });

  it('5-point star burns neutral-to-regressive: burn area never increases', () => {
    const t = regressStar(STAR, STAR_STEP, RATE);
    for (let i = 1; i < t.burnArea.length; i++) {
      expect(t.burnArea[i]).toBeLessThanOrEqual(t.burnArea[i - 1]);
    }
  });
});

describe('grain regression: BATES neutral trace over the first half of the web', () => {
  it('burn area varies less than 15% for a thin-web inhibited BATES grain', () => {
    const t = regressBates(BATES_NEUTRAL, BATES_STEP, RATE);
    const maxWeb = (BATES_NEUTRAL.outerDiameter - BATES_NEUTRAL.coreDiameter) / 2;
    const half = t.webBurned.filter((w) => w <= maxWeb / 2).length;
    const firstHalf = t.burnArea.slice(0, half);
    const min = Math.min(...firstHalf);
    const max = Math.max(...firstHalf);
    expect(max).toBeGreaterThan(min);
    expect((max - min) / min).toBeLessThan(0.15);
  });
});

describe('chamber pressure: open-closed mass balance', () => {
  const RHO = 1800; // kg/m^3
  const CSTAR = 1500; // m/s
  const THROAT = 4e-4; // m^2

  it('reproduces Pc = rho*A_b*r*c*/A_t exactly and stays finite', () => {
    const A = 0.0314; // m^2
    const r = 0.004; // m/s
    const Pc = chamberPressure(A, r, RHO, CSTAR, THROAT);
    expect(Pc).toBeCloseTo((RHO * A * r * CSTAR) / THROAT, 12);
    expect(Number.isFinite(Pc)).toBe(true);
    expect(Pc).toBeGreaterThan(0);
  });

  it('is exactly linear in burn area: doubling A doubles Pc', () => {
    const A = 0.02;
    const Pc = chamberPressure(A, RATE, RHO, CSTAR, THROAT);
    const PcDouble = chamberPressure(2 * A, RATE, RHO, CSTAR, THROAT);
    expect(PcDouble).toBeCloseTo(2 * Pc, 12);
    // Additivity: Pc(A1) + Pc(A2) == Pc(A1 + A2).
    const A1 = 0.013;
    const A2 = 0.027;
    const sum = chamberPressure(A1, RATE, RHO, CSTAR, THROAT) + chamberPressure(A2, RATE, RHO, CSTAR, THROAT);
    expect(chamberPressure(A1 + A2, RATE, RHO, CSTAR, THROAT)).toBeCloseTo(sum, 12);
  });

  it('coupled to the regression trace: every step yields a positive finite Pc', () => {
    const t = regressBates(BATES_NEUTRAL, BATES_STEP, RATE);
    const scale = (RHO * RATE * CSTAR) / THROAT;
    for (let i = 0; i < t.burnArea.length; i++) {
      const Pc = chamberPressure(t.burnArea[i], RATE, RHO, CSTAR, THROAT);
      expect(Number.isFinite(Pc)).toBe(true);
      expect(Pc).toBeGreaterThan(0);
      expect(Pc).toBeCloseTo(scale * t.burnArea[i], 9);
    }
  });
});

describe('grain regression: fail-closed validation', () => {
  it('rejects non-positive or non-finite step and burn-rate inputs', () => {
    for (const bad of [0, -1e-4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => regressBates(BATES_NEUTRAL, bad, RATE)).toThrow(RangeError);
      expect(() => regressBates(BATES_NEUTRAL, BATES_STEP, bad)).toThrow(RangeError);
      expect(() => regressStar(STAR, bad, RATE)).toThrow(RangeError);
      expect(() => regressStar(STAR, STAR_STEP, bad)).toThrow(RangeError);
    }
  });

  it('rejects degenerate grain geometry', () => {
    expect(() =>
      regressBates({ ...BATES_NEUTRAL, coreDiameter: BATES_NEUTRAL.outerDiameter }, BATES_STEP, RATE),
    ).toThrow(RangeError);
    expect(() => regressBates({ ...BATES_NEUTRAL, coreDiameter: 0.07 }, BATES_STEP, RATE)).toThrow(RangeError);
    expect(() => regressStar({ ...STAR, points: 2 }, STAR_STEP, RATE)).toThrow(RangeError);
    expect(() => regressStar({ ...STAR, points: 5.5 }, STAR_STEP, RATE)).toThrow(RangeError);
    expect(() => regressStar({ ...STAR, valleyRadius: 0.04 }, STAR_STEP, RATE)).toThrow(RangeError);
  });

  it('rejects non-positive chamber-pressure inputs', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => chamberPressure(bad, RATE, 1800, 1500, 4e-4)).toThrow(RangeError);
      expect(() => chamberPressure(0.02, bad, 1800, 1500, 4e-4)).toThrow(RangeError);
      expect(() => chamberPressure(0.02, RATE, bad, 1500, 4e-4)).toThrow(RangeError);
      expect(() => chamberPressure(0.02, RATE, 1800, bad, 4e-4)).toThrow(RangeError);
      expect(() => chamberPressure(0.02, RATE, 1800, 1500, bad)).toThrow(RangeError);
    }
  });

  it('throws on a non-finite/overflow pressure result from finite inputs', () => {
    // Finite positive inputs whose product overflows to Infinity must fail
    // closed on the RESULT, not silently emit Infinity.
    expect(() => chamberPressure(Number.MAX_VALUE, RATE, 1800, 1500, 4e-4)).toThrow(RangeError);
    expect(() => chamberPressure(1e200, 1e200, 1e200, 1e200, 1e-200)).toThrow(RangeError);
  });
});

describe('C10 geometries: zero web reproduces initial geometry exactly', () => {
  it('end burner: single burning disc, no port, full cylinder volume', () => {
    const t = regressEndBurner(END_BURNER.outerDiameter, END_BURNER.length, NEW_STEP, RATE);
    const faceArea = Math.PI * (END_BURNER.outerDiameter / 2) ** 2;
    expect(t.webBurned[0]).toBe(0);
    expect(t.burnArea[0]).toBeCloseTo(faceArea, 12);
    expect(t.portArea[0]).toBe(0);
    expect(t.volumeRemaining[0]).toBeCloseTo(faceArea * END_BURNER.length, 12);
  });

  it('rod & tube: bore plus rod perimeters, annular gap port, tube annulus plus rod', () => {
    const t = regressRodTube(
      ROD_TUBE.outerDiameter, ROD_TUBE.length, ROD_TUBE.coreDiameter, ROD_TUBE.rodDiameter, NEW_STEP, RATE,
    );
    const outerR = ROD_TUBE.outerDiameter / 2;
    const coreR = ROD_TUBE.coreDiameter / 2;
    const rodR = ROD_TUBE.rodDiameter / 2;
    expect(t.webBurned[0]).toBe(0);
    expect(t.burnArea[0]).toBeCloseTo(2 * Math.PI * (coreR + rodR) * ROD_TUBE.length, 12);
    expect(t.portArea[0]).toBeCloseTo(Math.PI * (coreR * coreR - rodR * rodR), 12);
    expect(t.volumeRemaining[0]).toBeCloseTo(
      Math.PI * (outerR * outerR - coreR * coreR + rodR * rodR) * ROD_TUBE.length,
      12,
    );
  });

  it('moon burner: offset circle port, full-circle rim, disc-minus-port volume', () => {
    const t = regressMoonBurner(MOON.outerDiameter, MOON.length, MOON.coreDiameter, MOON.offset, NEW_STEP, RATE);
    const outerR = MOON.outerDiameter / 2;
    const coreR = MOON.coreDiameter / 2;
    expect(t.webBurned[0]).toBe(0);
    expect(t.burnArea[0]).toBeCloseTo(2 * Math.PI * coreR * MOON.length, 12);
    expect(t.portArea[0]).toBeCloseTo(Math.PI * coreR * coreR, 12);
    expect(t.volumeRemaining[0]).toBeCloseTo(Math.PI * (outerR * outerR - coreR * coreR) * MOON.length, 12);
  });

  it('c-slot: core circle minus slot mouth plus both slot walls', () => {
    const t = regressCSlot(CSLOT.outerDiameter, CSLOT.length, CSLOT.coreDiameter, CSLOT.slotWidth, NEW_STEP, RATE);
    const outerR = CSLOT.outerDiameter / 2;
    const coreR = CSLOT.coreDiameter / 2;
    const half = CSLOT.slotWidth / 2;
    const theta0 = Math.asin(half / coreR);
    const xCore = Math.sqrt(coreR * coreR - half * half);
    const xWall = Math.sqrt(outerR * outerR - half * half);
    const perimeter = 2 * (Math.PI - 2 * theta0) * coreR + 2 * (xWall - xCore);
    const port =
      Math.PI * coreR * coreR +
      half * xWall +
      outerR * outerR * Math.asin(half / outerR) -
      half * xCore -
      coreR * coreR * theta0;
    expect(t.webBurned[0]).toBe(0);
    expect(t.burnArea[0]).toBeCloseTo(perimeter * CSLOT.length, 12);
    expect(t.portArea[0]).toBeCloseTo(port, 12);
    expect(t.volumeRemaining[0]).toBeCloseTo((Math.PI * outerR * outerR - port) * CSLOT.length, 12);
  });
});

describe('C10 geometries: neutrality and character', () => {
  it('end burner burns perfectly neutral: constant disc area for the whole trace', () => {
    const t = regressEndBurner(END_BURNER.outerDiameter, END_BURNER.length, NEW_STEP, RATE);
    const faceArea = Math.PI * (END_BURNER.outerDiameter / 2) ** 2;
    for (let i = 0; i < t.burnArea.length; i++) {
      expect(t.burnArea[i]).toBeCloseTo(faceArea, 12);
      expect(t.portArea[i]).toBe(0);
      expect(t.volumeRemaining[i]).toBeCloseTo(faceArea * (END_BURNER.length - t.webBurned[i]), 12);
    }
  });

  it('rod & tube is exactly neutral while the rod survives, then the bare tube grows', () => {
    const t = regressRodTube(
      ROD_TUBE.outerDiameter, ROD_TUBE.length, ROD_TUBE.coreDiameter, ROD_TUBE.rodDiameter, NEW_STEP, RATE,
    );
    const outerR = ROD_TUBE.outerDiameter / 2;
    const coreR = ROD_TUBE.coreDiameter / 2;
    const rodR = ROD_TUBE.rodDiameter / 2;
    const neutral = 2 * Math.PI * (coreR + rodR) * ROD_TUBE.length;
    let rodIdx = -1;
    for (let i = 0; i < t.webBurned.length; i++) {
      if (t.webBurned[i] <= rodR) {
        expect(t.burnArea[i]).toBeCloseTo(neutral, 12);
        rodIdx = i;
      }
    }
    expect(rodIdx).toBeGreaterThanOrEqual(1); // the flat window is actually sampled
    // After the rod is gone the tube bore alone keeps growing to the case.
    expect(t.burnArea[t.burnArea.length - 1]).toBeCloseTo(2 * Math.PI * outerR * ROD_TUBE.length, 12);
  });

  it('moon burner humps: progressive up to case contact, regressive crescent after', () => {
    const t = regressMoonBurner(MOON.outerDiameter, MOON.length, MOON.coreDiameter, MOON.offset, NEW_STEP, RATE);
    const outerR = MOON.outerDiameter / 2;
    const coreR = MOON.coreDiameter / 2;
    const contactWeb = outerR - MOON.offset - coreR; // 0.010 m
    let contactIdx = -1;
    for (let i = 0; i < t.webBurned.length; i++) {
      if (Math.abs(t.webBurned[i] - contactWeb) < NEW_STEP / 2) {
        contactIdx = i;
        break;
      }
    }
    expect(contactIdx).toBeGreaterThan(0);
    for (let i = 0; i <= contactIdx; i++) {
      if (i > 0) {
        expect(t.burnArea[i]).toBeGreaterThanOrEqual(t.burnArea[i - 1]);
      }
    }
    for (let i = contactIdx + 1; i < t.burnArea.length; i++) {
      expect(t.burnArea[i]).toBeLessThanOrEqual(t.burnArea[i - 1]);
    }
    // The hump peaks exactly at contact (full circle just before clipping)
    // and sits above the initial value. Digits 6: the tangency sample sits
    // within a float-ulp of r = outerR - offset, so the rim carries a
    // sub-attometer sliver correction (~1e-10 m^2) that is not meaningful
    // at the 12-digit level.
    expect(t.burnArea[contactIdx]).toBeCloseTo(
      2 * Math.PI * (MOON.coreDiameter / 2 + t.webBurned[contactIdx]) * MOON.length,
      6,
    );
    expect(t.burnArea[contactIdx]).toBeGreaterThan(t.burnArea[0]);
    expect(t.burnArea[t.burnArea.length - 1]).toBeLessThan(t.burnArea[contactIdx] * 0.05);
  });

  it('c-slot: small ignition spike then a continuous decrease (TRF character)', () => {
    const t = regressCSlot(CSLOT.outerDiameter, CSLOT.length, CSLOT.coreDiameter, CSLOT.slotWidth, NEW_STEP, RATE);
    let peakIdx = 0;
    for (let i = 1; i < t.burnArea.length; i++) {
      if (t.burnArea[i] > t.burnArea[peakIdx]) peakIdx = i;
    }
    expect(peakIdx).toBeGreaterThan(0);
    expect(peakIdx).toBeLessThan(t.burnArea.length / 2);
    // Small spike: the peak is only a few percent above the ignition value.
    expect(t.burnArea[peakIdx]).toBeLessThan(1.05 * t.burnArea[0]);
    for (let i = 1; i <= peakIdx; i++) {
      expect(t.burnArea[i]).toBeGreaterThanOrEqual(t.burnArea[i - 1]);
    }
    for (let i = peakIdx + 1; i < t.burnArea.length; i++) {
      expect(t.burnArea[i]).toBeLessThanOrEqual(t.burnArea[i - 1]);
    }
    expect(t.burnArea[t.burnArea.length - 1]).toBeLessThan(0.95 * t.burnArea[0]);
  });
});

describe('C10 geometries: web reaches burnout (volume 0)', () => {
  const cases: Array<{ name: string; t: GrainRegressionTrace; maxWeb: number; portFinal: number }> = [
    {
      name: 'end burner',
      t: regressEndBurner(END_BURNER.outerDiameter, END_BURNER.length, NEW_STEP, RATE),
      maxWeb: END_BURNER.length,
      portFinal: 0,
    },
    {
      name: 'rod & tube',
      t: regressRodTube(
        ROD_TUBE.outerDiameter, ROD_TUBE.length, ROD_TUBE.coreDiameter, ROD_TUBE.rodDiameter, NEW_STEP, RATE,
      ),
      maxWeb: (ROD_TUBE.outerDiameter - ROD_TUBE.coreDiameter) / 2,
      portFinal: Math.PI * (ROD_TUBE.outerDiameter / 2) ** 2,
    },
    {
      name: 'moon burner',
      t: regressMoonBurner(MOON.outerDiameter, MOON.length, MOON.coreDiameter, MOON.offset, NEW_STEP, RATE),
      maxWeb: MOON.outerDiameter / 2 + MOON.offset - MOON.coreDiameter / 2,
      portFinal: Math.PI * (MOON.outerDiameter / 2) ** 2,
    },
    {
      name: 'c-slot',
      t: regressCSlot(CSLOT.outerDiameter, CSLOT.length, CSLOT.coreDiameter, CSLOT.slotWidth, NEW_STEP, RATE),
      maxWeb: (CSLOT.outerDiameter - CSLOT.coreDiameter) / 2,
      portFinal: Math.PI * (CSLOT.outerDiameter / 2) ** 2,
    },
  ];

  it.each(cases)('$name: full web burned, remaining volume 0, port at the case', (c) => {
    const last = c.t.webBurned.length - 1;
    expect(c.t.webBurned.length).toBe(c.t.portArea.length);
    expect(c.t.burnArea.length).toBe(c.t.webBurned.length);
    expect(c.t.volumeRemaining.length).toBe(c.t.webBurned.length);
    expect(c.t.webBurned[last]).toBeCloseTo(c.maxWeb, 12);
    expect(c.t.volumeRemaining[last]).toBeCloseTo(0, 12);
    expect(c.t.portArea[last]).toBeCloseTo(c.portFinal, 6);
  });
});

describe('C10 geometries: fail-closed validation', () => {
  it('rejects non-positive or non-finite webStep and burn-rate inputs', () => {
    for (const bad of [0, -1e-4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => regressEndBurner(0.06, 0.2, bad, RATE)).toThrow(RangeError);
      expect(() => regressEndBurner(0.06, 0.2, NEW_STEP, bad)).toThrow(RangeError);
      expect(() => regressRodTube(0.06, 0.2, 0.03, 0.01, bad, RATE)).toThrow(RangeError);
      expect(() => regressRodTube(0.06, 0.2, 0.03, 0.01, NEW_STEP, bad)).toThrow(RangeError);
      expect(() => regressMoonBurner(0.06, 0.2, 0.016, 0.012, bad, RATE)).toThrow(RangeError);
      expect(() => regressMoonBurner(0.06, 0.2, 0.016, 0.012, NEW_STEP, bad)).toThrow(RangeError);
      expect(() => regressCSlot(0.06, 0.2, 0.016, 0.005, bad, RATE)).toThrow(RangeError);
      expect(() => regressCSlot(0.06, 0.2, 0.016, 0.005, NEW_STEP, bad)).toThrow(RangeError);
    }
  });

  it('rejects non-positive or non-finite dimension inputs', () => {
    for (const bad of [0, -0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => regressEndBurner(bad, 0.2, NEW_STEP, RATE)).toThrow(RangeError);
      expect(() => regressEndBurner(0.06, bad, NEW_STEP, RATE)).toThrow(RangeError);
      expect(() => regressRodTube(bad, 0.2, 0.03, 0.01, NEW_STEP, RATE)).toThrow(RangeError);
      expect(() => regressRodTube(0.06, bad, 0.03, 0.01, NEW_STEP, RATE)).toThrow(RangeError);
      expect(() => regressRodTube(0.06, 0.2, bad, 0.01, NEW_STEP, RATE)).toThrow(RangeError);
      expect(() => regressRodTube(0.06, 0.2, 0.03, bad, NEW_STEP, RATE)).toThrow(RangeError);
      expect(() => regressMoonBurner(bad, 0.2, 0.016, 0.012, NEW_STEP, RATE)).toThrow(RangeError);
      expect(() => regressMoonBurner(0.06, 0.2, bad, 0.012, NEW_STEP, RATE)).toThrow(RangeError);
      expect(() => regressMoonBurner(0.06, 0.2, 0.016, bad, NEW_STEP, RATE)).toThrow(RangeError);
      expect(() => regressCSlot(bad, 0.2, 0.016, 0.005, NEW_STEP, RATE)).toThrow(RangeError);
      expect(() => regressCSlot(0.06, bad, 0.016, 0.005, NEW_STEP, RATE)).toThrow(RangeError);
      expect(() => regressCSlot(0.06, 0.2, bad, 0.005, NEW_STEP, RATE)).toThrow(RangeError);
      expect(() => regressCSlot(0.06, 0.2, 0.016, bad, NEW_STEP, RATE)).toThrow(RangeError);
    }
  });

  it('rejects degenerate geometry, not just non-positive dimensions', () => {
    // Rod & tube: rod must fit inside the bore and burn out with the tube.
    expect(() => regressRodTube(0.06, 0.2, 0.03, 0.03, NEW_STEP, RATE)).toThrow(RangeError);
    expect(() => regressRodTube(0.06, 0.2, 0.03, 0.04, NEW_STEP, RATE)).toThrow(RangeError);
    expect(() => regressRodTube(0.06, 0.2, 0.07, 0.01, NEW_STEP, RATE)).toThrow(RangeError);
    // Moon burner: the offset port must start fully inside the case.
    expect(() => regressMoonBurner(0.06, 0.2, 0.016, 0.025, NEW_STEP, RATE)).toThrow(RangeError);
    expect(() => regressMoonBurner(0.06, 0.2, 0.07, 0.012, NEW_STEP, RATE)).toThrow(RangeError);
    // C-slot: the slot must open out of a strictly larger core.
    expect(() => regressCSlot(0.06, 0.2, 0.016, 0.016, NEW_STEP, RATE)).toThrow(RangeError);
    expect(() => regressCSlot(0.06, 0.2, 0.016, 0.05, NEW_STEP, RATE)).toThrow(RangeError);
    expect(() => regressCSlot(0.06, 0.2, 0.07, 0.005, NEW_STEP, RATE)).toThrow(RangeError);
  });
});

/** Type-level smoke: consumer receives the full regression trace shape. */
function burnTraceSummary(t: GrainRegressionTrace): string {
  return `${t.webBurned.length} samples, last burn area ${t.burnArea[t.burnArea.length - 1].toFixed(4)} m^2`;
}
void burnTraceSummary;