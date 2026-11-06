import { describe, it, expect } from 'vitest';
import { quaternionToEulerDeg, type Quaternion } from './sixDofSimulator';

/**
 * Focused vectors for the presentation Euler convention
 * `attitude-euler/1.0.0`: R_NB = Rz(yaw) * Rx(pitch) * Ry(roll).
 * These are full-precision checks, independent of the 0.1 deg display
 * rounding; the Rust mirror carries the same vectors in
 * `crates/astraea-core/src/six_dof.rs` (`attitude_presentation_tests`).
 */

function quatMul(a: Quaternion, b: Quaternion): Quaternion {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

function axisAngle(x: number, y: number, z: number, deg: number): Quaternion {
  const half = (deg * Math.PI) / 360;
  const s = Math.sin(half);
  return { w: Math.cos(half), x: x * s, y: y * s, z: z * s };
}

/** q = qz(yaw) * qx(pitch) * qy(roll), matching R = Rz * Rx * Ry. */
function compose(pitch: number, roll: number, yaw: number): Quaternion {
  return quatMul(axisAngle(0, 0, 1, yaw), quatMul(axisAngle(1, 0, 0, pitch), axisAngle(0, 1, 0, roll)));
}

function axisMatrix(axis: 0 | 1 | 2, deg: number): number[][] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  if (axis === 0) return [[1, 0, 0], [0, c, -s], [0, s, c]];
  if (axis === 1) return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}

function matMul(a: number[][], b: number[][]): number[][] {
  return a.map((row, i) => b[0].map((_, j) => row.reduce((sum, _, k) => sum + a[i][k] * b[k][j], 0)));
}

function matrixOf(q: Quaternion): number[][] {
  const { w, x, y, z } = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

function recompose(pitch: number, roll: number, yaw: number): number[][] {
  return matMul(axisMatrix(2, yaw), matMul(axisMatrix(0, pitch), axisMatrix(1, roll)));
}

function gap(a: number[][], b: number[][]): number {
  let m = 0;
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) m = Math.max(m, Math.abs(a[i][j] - b[i][j]));
  return m;
}

function angleGap(got: number, want: number): number {
  return Math.abs((((got - want + 180) % 360) + 360) % 360 - 180);
}

describe('presentation Euler convention (Rz*Rx*Ry)', () => {
  it('recovers composed attitudes at full precision', () => {
    for (const [pitch, roll, yaw] of [
      [23.4, -37.2, 41.5],
      [17.19, 11.46, 28.65],
      [60, 5, -120],
      [-45, 80, 15],
      [5, -170, 179],
    ]) {
      const q = compose(pitch, roll, yaw);
      const got = quaternionToEulerDeg(q);
      expect(angleGap(got.pitchDeg, pitch)).toBeLessThanOrEqual(1e-9);
      expect(angleGap(got.rollDeg, roll)).toBeLessThanOrEqual(1e-9);
      expect(angleGap(got.yawDeg, yaw)).toBeLessThanOrEqual(1e-9);
      expect(gap(recompose(got.pitchDeg, got.rollDeg, got.yawDeg), matrixOf(q))).toBeLessThanOrEqual(1e-12);
    }
  });

  it('keeps pure-axis attitudes unmixed', () => {
    for (const d of [0, 10, 45, 89]) expect(quaternionToEulerDeg(compose(d, 0, 0)).pitchDeg).toBeCloseTo(d, 9);
    for (const d of [10, 89, 91, 135, 179, -100]) expect(quaternionToEulerDeg(compose(0, d, 0)).rollDeg).toBeCloseTo(d, 9);
    for (const d of [10, 89, 179, -100]) expect(quaternionToEulerDeg(compose(0, 0, d)).yawDeg).toBeCloseTo(d, 9);
  });

  it('reads the rail attitude as elevation and minus azimuth', () => {
    // Exact mirror of the shipped initial attitude: minimal rotation taking
    // body +Y onto the rail vector.
    const el = (85 * Math.PI) / 180;
    const az = (30 * Math.PI) / 180;
    const rail = { x: Math.cos(el) * Math.sin(az), y: Math.cos(el) * Math.cos(az), z: Math.sin(el) };
    const dotY = rail.y;
    const rx = rail.z;
    const rz = -rail.x;
    const len = Math.hypot(rx, rz);
    const angle = Math.acos(Math.max(-1, Math.min(1, dotY)));
    const sh = Math.sin(angle / 2);
    const q: Quaternion = { w: Math.cos(angle / 2), x: (rx / len) * sh, y: 0, z: (rz / len) * sh };
    const got = quaternionToEulerDeg(q);
    expect(angleGap(got.pitchDeg, 85)).toBeLessThanOrEqual(1e-9);
    expect(angleGap(got.yawDeg, -30)).toBeLessThanOrEqual(1e-9);
    expect(gap(recompose(got.pitchDeg, got.rollDeg, got.yawDeg), matrixOf(q))).toBeLessThanOrEqual(1e-9);
  });

  it('q and -q are identical', () => {
    for (const [pitch, roll, yaw] of [[23.4, -37.2, 41.5], [0, 90, 0], [-10, 0, 170]]) {
      const q = compose(pitch, roll, yaw);
      const nq = { w: -q.w, x: -q.x, y: -q.y, z: -q.z };
      expect(quaternionToEulerDeg(q)).toEqual(quaternionToEulerDeg(nq));
    }
  });

  it('exposes the documented |pitch|=90 gauge and still reconstructs the attitude', () => {
    for (const sign of [1, -1]) {
      for (const [roll, yaw] of [[0, 0], [30, 40], [-70, 160], [120, -45]]) {
        const q = compose(sign * 90, roll, yaw);
        const got = quaternionToEulerDeg(q);
        // Gauge: roll pinned to 0, pitch snapped to +/-90, yaw carries the
        // combined z-rotation (yaw + roll at +90, yaw - roll at -90).
        expect(got.pitchDeg).toBe(sign * 90);
        expect(got.rollDeg).toBe(0);
        expect(angleGap(got.yawDeg, sign > 0 ? yaw + roll : yaw - roll)).toBeLessThanOrEqual(1e-9);
        expect(gap(recompose(got.pitchDeg, got.rollDeg, got.yawDeg), matrixOf(q))).toBeLessThanOrEqual(1e-9);
      }
    }
    // Just outside the gauge band the ordinary split is resolved (no snap).
    const got = quaternionToEulerDeg(compose(89.99, 30, 40));
    expect(angleGap(got.pitchDeg, 89.99)).toBeLessThanOrEqual(1e-9);
    expect(angleGap(got.rollDeg, 30)).toBeLessThanOrEqual(1e-9);
    expect(angleGap(got.yawDeg, 40)).toBeLessThanOrEqual(1e-9);
  });

  it('recomposes random full-range attitudes', () => {
    let state = 0x9e3779b97f4a7c15n;
    const next = () => {
      state = BigInt.asUintN(64, state * 6364136223846793005n + 1442695040888963407n);
      return Number(state >> 11n) / 2 ** 53;
    };
    let checked = 0;
    while (checked < 300) {
      const pitch = next() * 358 - 179;
      const roll = next() * 358 - 179;
      const yaw = next() * 358 - 179;
      const q = compose(pitch, roll, yaw);
      const cosPair = Math.hypot(2 * (q.w * q.y - q.z * q.x), 1 - 2 * (q.x * q.x + q.y * q.y));
      if (cosPair <= 1e-6) continue;
      checked += 1;
      const got = quaternionToEulerDeg(q);
      expect(gap(recompose(got.pitchDeg, got.rollDeg, got.yawDeg), matrixOf(q))).toBeLessThanOrEqual(1e-9);
    }
  });
});
