import { describe, expect, it } from 'vitest';
import { alignSimToFlight, parseAltimeterCsv, resample, type TrajectorySample } from './altimetry';
import { calibrateCd, MIN_VELOCITY_MS, type CoastPoint } from './calibration';

describe('parseAltimeterCsv', () => {
  it('handles quoted headers with aliases and extra columns', () => {
    const csv = '"Time (s)","Altitude (m)","Battery (V)"\n' + '0,10,9.8\n' + '1,25,9.7\n';
    expect(parseAltimeterCsv(csv)).toEqual([
      { timeS: 0, altitudeM: 10 },
      { timeS: 1, altitudeM: 25 },
    ]);
  });

  it('accepts t/agl and other header aliases', () => {
    const csv = 't,agl\n' + '0.5,120\n' + '1.0,220\n';
    expect(parseAltimeterCsv(csv)).toEqual([
      { timeS: 0.5, altitudeM: 120 },
      { timeS: 1, altitudeM: 220 },
    ]);
  });

  it('skips blank and comment lines anywhere in the file', () => {
    const csv = [
      '# Flight log, AltOS export',
      '; second comment style',
      '',
      'time,alt',
      '0,12',
      '',
      '   ; whitespace-padded comment',
      '1,18',
      '# trailing comment',
    ].join('\n');
    expect(parseAltimeterCsv(csv)).toEqual([
      { timeS: 0, altitudeM: 12 },
      { timeS: 1, altitudeM: 18 },
    ]);
  });

  it('tolerates semicolon and tab delimiters', () => {
    expect(parseAltimeterCsv('time;alt\n3;40')).toEqual([{ timeS: 3, altitudeM: 40 }]);
    expect(parseAltimeterCsv('time\talt\n4\t50')).toEqual([{ timeS: 4, altitudeM: 50 }]);
  });

  it('skips unparseable rows but keeps valid ones', () => {
    const csv = 'time,altitude\n' + 'n/a,n/a\n' + '2,30\n' + ',15\n';
    expect(parseAltimeterCsv(csv)).toEqual([{ timeS: 2, altitudeM: 30 }]);
  });

  it('falls back to time,altitude column order for headerless all-numeric data', () => {
    expect(parseAltimeterCsv('0,10\n1,20\n')).toEqual([
      { timeS: 0, altitudeM: 10 },
      { timeS: 1, altitudeM: 20 },
    ]);
  });

  it('throws on a header-like first line with unrecognized aliases instead of guessing', () => {
    // Only the time alias recognized; altitude alias missing.
    expect(() => parseAltimeterCsv('time,position\n0,10\n1,20\n')).toThrow(/unrecognized header/);
    // Neither alias recognized.
    expect(() => parseAltimeterCsv('velocity,position\n0,10\n1,20\n')).toThrow(/unrecognized header/);
    // Only the altitude alias recognized; time alias missing.
    expect(() => parseAltimeterCsv('sec,alt\n0,10\n1,20\n')).toThrow(/unrecognized header/);
  });

  it('sorts rows ascending by time', () => {
    expect(parseAltimeterCsv('time,alt\n3,50\n1,20\n2,40\n')).toEqual([
      { timeS: 1, altitudeM: 20 },
      { timeS: 2, altitudeM: 40 },
      { timeS: 3, altitudeM: 50 },
    ]);
  });

  it('throws when no valid data rows exist', () => {
    expect(() => parseAltimeterCsv('')).toThrow();
    expect(() => parseAltimeterCsv('# only a comment\n; and another\n')).toThrow();
    expect(() => parseAltimeterCsv('time,alt\n')).toThrow();
    expect(() => parseAltimeterCsv('time,alt\nabc,def\n')).toThrow();
  });
});

describe('resample', () => {
  it('returns an empty grid for an empty series', () => {
    expect(resample([], 0.5)).toEqual([]);
  });

  it('rejects non-positive or non-finite dt', () => {
    expect(() => resample([{ timeS: 0, altitudeM: 0 }], 0)).toThrow();
    expect(() => resample([{ timeS: 0, altitudeM: 0 }], Number.NaN)).toThrow();
  });

  it('throws on non-finite sample values', () => {
    expect(() => resample([{ timeS: 0, altitudeM: Number.NaN }], 1)).toThrow(/finite/);
    expect(() => resample([{ timeS: Number.NaN, altitudeM: 0 }], 1)).toThrow(/finite/);
    expect(() => resample([{ timeS: 0, altitudeM: Number.POSITIVE_INFINITY }], 1)).toThrow(/finite/);
  });

  it('produces a uniform grid with linear interpolation', () => {
    const out = resample(
      [
        { timeS: 0, altitudeM: 0 },
        { timeS: 2, altitudeM: 10 },
        { timeS: 4, altitudeM: 30 },
      ],
      1,
    );
    // Need a distinct line between (0,0)-(2,10) and (2,10)-(4,30); at t=1: 5,
    // t=3: 20, t=4: 30.
    expect(out.map((s) => [s.timeS, s.altitudeM])).toEqual([
      [0, 0],
      [1, 5],
      [2, 10],
      [3, 20],
      [4, 30],
    ]);
  });

  it('handles unsorted input and a dt that does not divide the span', () => {
    const out = resample(
      [
        { timeS: 1, altitudeM: 10 },
        { timeS: 0, altitudeM: 0 },
      ],
      0.7,
    );
    // Grid stays within the sampled span [0, 1]; t=1.4 would be extrapolation.
    expect(out.map((s) => [s.timeS, s.altitudeM])).toEqual([
      [0, 0],
      [0.7, 7],
    ]);
  });
});

describe('alignSimToFlight', () => {
  const DT = 0.1;

  it('recovers a known 2.5 s offset within one dt and reports apogee/burnout deltas', () => {
    const sim = buildFlight(120, 12.5, DT);
    // Same shape but: apogee 2.5 s earlier, 100 m lower base, burnout 20 m/s slower.
    const flight = buildFlight(100, 10, DT).map((s) => ({ ...s, altitudeM: s.altitudeM - 100 }));

    const r = alignSimToFlight(sim, flight);

    expect(Math.abs(r.timeOffsetS - 2.5)).toBeLessThanOrEqual(DT);
    expect(r.apogeeDeltaM).toBeCloseTo(maxAltitude(sim) - maxAltitude(flight), 6);
    expect(r.burnoutVelDeltaMs).toBeCloseTo(120 - 100, 6);
  });

  it('exactly matches an identical profile shifted in time', () => {
    const sim = buildFlight(120, 12.5, DT);
    const flight = sim.map((s) => ({ timeS: s.timeS - 2.5, altitudeM: s.altitudeM, velocityMs: s.velocityMs }));
    const r = alignSimToFlight(sim, flight);
    expect(r.timeOffsetS).toBeCloseTo(2.5, 9);
    expect(r.apogeeDeltaM).toBeCloseTo(0, 9);
    expect(r.burnoutVelDeltaMs).toBeCloseTo(0, 9);
  });

  it('throws on empty series', () => {
    expect(() => alignSimToFlight([], [{ timeS: 0, altitudeM: 0, velocityMs: 0 }])).toThrow();
    expect(() => alignSimToFlight([{ timeS: 0, altitudeM: 0, velocityMs: 0 }], [])).toThrow();
  });

  it('aligns without velocity data, reporting a null burnout delta', () => {
    const sim = [{ timeS: 0, altitudeM: 0 }, { timeS: 1, altitudeM: 10 }];
    const flight = [{ timeS: 1, altitudeM: 0 }, { timeS: 2, altitudeM: 10 }];
    const r = alignSimToFlight(sim, flight);
    expect(r.timeOffsetS).toBeCloseTo(-1, 9); // sim apogee t=1, flight apogee t=2
    expect(r.apogeeDeltaM).toBeCloseTo(0, 9);
    expect(r.burnoutVelDeltaMs).toBeNull();
  });

  it('aligns a velocity-less CSV flight log against the sim (burnout delta null)', () => {
    const sim = buildFlight(120, 12.5, DT);
    // Same shape as sim but 2.5 s earlier and 100 m lower — and stripped of
    // velocityMs, as a plain CSV flight log would be.
    const flight = buildFlight(100, 10, DT)
      .map((s) => ({ ...s, altitudeM: s.altitudeM - 100 }))
      .map(({ timeS, altitudeM }) => ({ timeS, altitudeM }));

    const r = alignSimToFlight(sim, flight);

    expect(Math.abs(r.timeOffsetS - 2.5)).toBeLessThanOrEqual(DT);
    expect(r.apogeeDeltaM).toBeCloseTo(maxAltitude(sim) - maxAltitude(flight), 6);
    expect(r.burnoutVelDeltaMs).toBeNull();
  });

  it('anchors alignment at the plateau floor when max altitude is flat', () => {
    // Three identical max samples: argmax ties break to the first occurrence.
    const sim = [
      { timeS: 0, altitudeM: 0, velocityMs: 10 },
      { timeS: 1, altitudeM: 10, velocityMs: 0 },
      { timeS: 2, altitudeM: 10, velocityMs: 0 },
      { timeS: 3, altitudeM: 10, velocityMs: 0 },
      { timeS: 4, altitudeM: 5, velocityMs: -5 },
    ];
    const flight = [
      { timeS: 0, altitudeM: 0, velocityMs: 10 },
      { timeS: 1, altitudeM: 10, velocityMs: 0 },
      { timeS: 2, altitudeM: 10, velocityMs: 0 },
    ];
    const r = alignSimToFlight(sim, flight);
    // Plateau floor at t=1 in both → offset 0 (a last-occurrence tie would give 1).
    expect(r.timeOffsetS).toBeCloseTo(0, 9);
  });

  it('throws on non-finite altitudes', () => {
    expect(() =>
      alignSimToFlight(
        [{ timeS: 0, altitudeM: Number.NaN, velocityMs: 1 }],
        [{ timeS: 0, altitudeM: 0, velocityMs: 1 }],
      ),
    ).toThrow(/finite/);
    expect(() =>
      alignSimToFlight(
        [{ timeS: 0, altitudeM: 0, velocityMs: 1 }],
        [{ timeS: 1, altitudeM: Number.POSITIVE_INFINITY }],
      ),
    ).toThrow(/finite/);
  });
});

describe('calibrateCd', () => {
  const CD_TRUE = 0.75;
  const RHO = 1.225;
  const AREA = 0.02;

  it('recovers a synthetic Cd=0.75 within 2% from noisy coast data', () => {
    const rand = lcg(20260909);
    const points: CoastPoint[] = [];
    for (let v = 8; v <= 60; v++) {
      const massKg = 3.5 - 0.02 * (v - 8); // slight mass variation
      const density = RHO - 0.001 * (v - 8);
      const dragN = 0.5 * density * v * v * AREA * CD_TRUE;
      const noise = 1 + (rand() - 0.5) * 0.04; // +/-2% accel noise
      points.push({
        velocityMs: v,
        density,
        massKg,
        refAreaM2: AREA,
        accelMs2: (dragN / massKg) * noise,
      });
    }

    const { cdCalibrated, rmse } = calibrateCd(points);

    expect(Math.abs(cdCalibrated - CD_TRUE) / CD_TRUE).toBeLessThan(0.02);
    expect(rmse).toBeGreaterThan(0); // noise present
    expect(Number.isFinite(rmse)).toBe(true);
  });

  it('is exact (rmse ~ 0) on noiseless data', () => {
    const points: CoastPoint[] = [];
    for (let v = 8; v <= 60; v++) {
      const massKg = 3.0;
      const dragN = 0.5 * RHO * v * v * AREA * CD_TRUE;
      points.push({
        velocityMs: v,
        density: RHO,
        massKg,
        refAreaM2: AREA,
        accelMs2: dragN / massKg,
      });
    }

    const { cdCalibrated, rmse } = calibrateCd(points);
    expect(cdCalibrated).toBeCloseTo(CD_TRUE, 9);
    expect(rmse).toBeLessThan(1e-9);
  });

  it(`rejects points below ${MIN_VELOCITY_MS} m/s that would corrupt the fit`, () => {
    const rand = lcg(7);
    const clean: CoastPoint[] = [];
    for (let v = 8; v <= 60; v++) {
      const dragN = 0.5 * RHO * v * v * AREA * CD_TRUE;
      clean.push({
        velocityMs: v,
        density: RHO,
        massKg: 3.0,
        refAreaM2: AREA,
        accelMs2: (dragN / 3.0) * (1 + (rand() - 0.5) * 0.02),
      });
    }
    const corruptors: CoastPoint[] = [1, 2, 3, 4].map((v) => ({
      velocityMs: v,
      density: RHO,
      massKg: 3.0,
      refAreaM2: AREA,
      // Deceleration ~60x larger than physically possible at this speed; if
      // these were fit, Cd would be inflated far beyond the 2% bound.
      accelMs2: 5.0,
    }));

    const { cdCalibrated } = calibrateCd([...corruptors, ...clean]);
    expect(Math.abs(cdCalibrated - CD_TRUE) / CD_TRUE).toBeLessThan(0.02);
  });

  it('throws when fewer than 3 usable points remain', () => {
    const slow = [{ velocityMs: 2, density: RHO, massKg: 3, refAreaM2: AREA, accelMs2: 0.2 }];
    expect(() => calibrateCd(slow)).toThrow(/at least 3 usable coast points/);
    expect(() => calibrateCd([])).toThrow();
  });

  it('throws on non-finite or non-positive density/mass/area and invalid accel', () => {
    const base: CoastPoint = {
      velocityMs: 20,
      density: RHO,
      massKg: 3,
      refAreaM2: AREA,
      accelMs2: 5,
    };
    expect(() => calibrateCd([{ ...base, density: -1.225 }])).toThrow(/density/);
    expect(() => calibrateCd([{ ...base, density: Number.NaN }])).toThrow(/density/);
    expect(() => calibrateCd([{ ...base, massKg: 0 }])).toThrow(/massKg/);
    expect(() => calibrateCd([{ ...base, refAreaM2: -AREA }])).toThrow(/refAreaM2/);
    expect(() => calibrateCd([{ ...base, accelMs2: -1 }])).toThrow(/accelMs2/);
    expect(() => calibrateCd([{ ...base, accelMs2: Number.NaN }])).toThrow(/accelMs2/);
  });

  it('throws when every accelerometer reading is zero (sensor-dead guard)', () => {
    const dead = [10, 12, 14, 16, 18].map((v) => ({
      velocityMs: v,
      density: RHO,
      massKg: 3,
      refAreaM2: AREA,
      accelMs2: 0,
    }));
    expect(() => calibrateCd(dead)).toThrow(/zero/);
  });
});

/** Monotone boost+coast velocity profile: peak velocity at `burnoutTime`
 * (the burnout-velocity proxy target), zero at `apogeeTime`. dt = 0.1 keeps
 * every critical time on the grid. */
function buildFlight(burnoutVel: number, apogeeTime: number, dt: number): TrajectorySample[] {
  const burnoutTime = 5;
  const endTime = 30;
  const n = Math.round(endTime / dt) + 1;

  const out: TrajectorySample[] = [];
  let altitude = 0;
  let prevVel = 0;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    let v: number;
    if (t <= burnoutTime) {
      v = burnoutVel * t / burnoutTime;
    } else if (t <= apogeeTime) {
      v = burnoutVel * (apogeeTime - t) / (apogeeTime - burnoutTime);
    } else {
      v = -20 * (t - apogeeTime);
    }
    if (i > 0) {
      altitude += (prevVel + v) * 0.5 * dt;
    }
    out.push({ timeS: t, altitudeM: altitude, velocityMs: v });
    prevVel = v;
  }
  return out;
}

function maxAltitude(series: readonly TrajectorySample[]): number {
  return Math.max(...series.map((s) => s.altitudeM));
}

/** Deterministic LCG so the noisy calibration test never flakes. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}