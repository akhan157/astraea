import { describe, expect, it } from 'vitest';
import type { SixDofTelemetryPoint } from '../sim/sixDofSimulator';
import { MAX_SAVED_TELEMETRY_POINTS, parseSavedTelemetry } from './savedTelemetry';
import { savedTelemetryFixture } from './savedTelemetry.fixture';

describe('saved display telemetry', () => {
  it('accepts exact bounded samples, optional stage fields, empty arrays and signed zero', () => {
    const raw = savedTelemetryFixture();
    const parsed = parseSavedTelemetry(raw);
    expect(parsed).toEqual(raw);
    expect(parsed).not.toBe(raw);
    expect(parsed[0]).not.toBe(raw[0]);
    expect(Object.is(parsed[0].time, -0)).toBe(true);
    expect(parseSavedTelemetry([])).toEqual([]);
    expect(MAX_SAVED_TELEMETRY_POINTS).toBe(5000);
  });

  it.each([
    ['non-array', (p: unknown) => ({ points: p }), /telemetry must be an array/],
    ['non-object point', (p: SixDofTelemetryPoint[]) => [p[0], null], /telemetry\[1\] must be an object/],
    ['extra point key', (p: SixDofTelemetryPoint[]) => [{ ...p[0], extra: true }], /telemetry\[0\] must have exactly/],
    ['missing point key', (p: SixDofTelemetryPoint[]) => { const q = { ...p[0] } as Record<string, unknown>; delete q.mass; return [q]; }, /telemetry\[0\] must have exactly/],
    ['extra nested key', (p: SixDofTelemetryPoint[]) => [{ ...p[0], position: { ...p[0].position, frame: 'ENU' } }], /telemetry\[0\]\.position must have exactly x, y, z/],
    ['non-finite nested value', (p: SixDofTelemetryPoint[]) => [{ ...p[0], q: { ...p[0].q, w: null } }], /telemetry\[0\]\.q\.w must be a finite number/],
    ['negative time', (p: SixDofTelemetryPoint[]) => [{ ...p[0], time: -0.01 }], /telemetry\[0\]\.time must be nonnegative and non-decreasing/],
    ['decreasing time', (p: SixDofTelemetryPoint[]) => [p[1], p[0]], /telemetry\[1\]\.time must be nonnegative and non-decreasing/],
    ['empty stage', (p: SixDofTelemetryPoint[]) => [{ ...p[0], stage: '' }], /telemetry\[0\]\.stage must be a non-empty string/],
    ['non-finite stage clock', (p: SixDofTelemetryPoint[]) => [{ ...p[0], stageTime: Number.NaN }], /telemetry\[0\]\.stageTime must be a finite number/],
    ['non-finite motor clock', (p: SixDofTelemetryPoint[]) => [{ ...p[0], motorTime: null }], /telemetry\[0\]\.motorTime must be a finite number/],
  ])('refuses %s with a precise error', (_name, mutate, error) => {
    expect(() => parseSavedTelemetry(mutate(savedTelemetryFixture()))).toThrow(error);
  });

  it('refuses more than 5000 samples instead of truncating them', () => {
    const raw = Array.from({ length: 5001 }, (_, i) => ({ ...savedTelemetryFixture()[0], time: i }));
    expect(() => parseSavedTelemetry(raw)).toThrow(/telemetry exceeds 5000 samples/);
  });
});
