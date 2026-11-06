// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  formatAngleDeg,
  formatForce,
  formatImpulse,
  formatLength,
  formatMach,
  formatMass,
  formatPressure,
  formatScalar,
  formatVelocity,
  UNKNOWN,
} from './quantity';
import { qualifyResult } from '../application/resultState';
import { DEFAULT_WORKSPACE, validateWorkspace } from '../application/workspace';
import { validateLedgerEntry } from '../application/evidenceLedger';

describe('quantity formatting', () => {
  it('always renders units and never zero for missing values', () => {
    expect(formatLength(1.5, 'metric')).toBe('1.500 m');
    expect(formatLength(null, 'metric')).toBe(UNKNOWN);
    expect(formatMass(undefined, 'metric')).toBe(UNKNOWN);
    expect(formatForce(NaN, 'metric')).toBe(UNKNOWN);
    expect(formatLength(1.5, 'imperial')).toContain('ft');
    expect(formatMass(2, 'imperial')).toContain('lb');
    expect(formatAngleDeg(45)).toBe('45.00 deg');
    expect(formatMach(1.2)).toBe('Mach 1.20');
    expect(formatVelocity(100, 'metric')).toContain('m/s');
    expect(formatPressure(101325, 'metric')).toContain('kPa');
    expect(formatImpulse(10, 'metric')).toContain('N s');
    expect(formatScalar(3.14159, 'cal', 2)).toBe('3.14 cal');
  });
});

describe('result qualification', () => {
  it('passes only current, valid, online, gate-passing results', () => {
    const out = qualifyResult({ valid: true, current: true, gate: 'pass' });
    expect(out.status).toBe('pass');
    expect(out.isPass).toBe(true);
  });

  it('never passes stale, invalid, or offline results', () => {
    expect(qualifyResult({ valid: true, current: false, gate: 'pass' }).isPass).toBe(false);
    expect(qualifyResult({ valid: false, current: true, gate: 'pass' }).status).toBe('invalid');
    expect(qualifyResult({ valid: true, current: true, gate: 'pass', offline: true }).status).toBe(
      'offline',
    );
    expect(qualifyResult({ valid: true, current: true, gate: 'pass', offline: true }).isPass).toBe(
      false,
    );
  });

  it('keeps running and failed lifecycles distinct', () => {
    expect(
      qualifyResult({ valid: true, current: true, gate: 'pass', lifecycle: 'running' }).status,
    ).toBe('running');
    expect(
      qualifyResult({ valid: true, current: true, gate: 'pass', lifecycle: 'failed' }).status,
    ).toBe('fail');
  });
});

describe('workspace validation', () => {
  it('fills defaults for missing sections and flags bad values', () => {
    const { workspace, issues } = validateWorkspace({});
    expect(workspace).toEqual(DEFAULT_WORKSPACE);
    expect(issues).toEqual({});
    const bad = validateWorkspace({
      launch: { railLengthM: -2, railElevationDeg: 120 },
      site: { latDeg: 200 },
      ensemble: { nRuns: 5000 },
      recovery: { shearPinCount: -1 },
    });
    expect(bad.issues['launch.railLengthM']).toMatch(/positive/);
    expect(bad.issues['launch.railElevationDeg']).toMatch(/0 to 90/);
    expect(bad.issues['site.latDeg']).toMatch(/-90 to 90/);
    expect(bad.issues['ensemble.nRuns']).toMatch(/1 to 1000/);
    expect(bad.issues['recovery.shearPinCount']).toMatch(/negative/);
  });
});

describe('ledger validation', () => {
  it('rejects oversized raw text and malformed checksums', () => {
    const base = {
      id: 'ledger-1',
      kind: 'note',
      title: 'Note',
      createdAt: '2026-09-14T12:00:00.000Z',
      sourceFileName: null,
      sha256Hex: 'unavailable',
      rawText: 'hello',
      sampleCount: null,
      unitsNote: '',
      processingSteps: [],
      review: 'unreviewed',
      linkedRunKey: null,
      note: null,
    };
    expect(validateLedgerEntry(base).id).toBe('ledger-1');
    expect(() => validateLedgerEntry({ ...base, sha256Hex: 'nope' })).toThrow(/sha256/);
    expect(() => validateLedgerEntry({ ...base, rawText: 'x'.repeat(2_000_001) })).toThrow(/2 MB/);
    expect(() => validateLedgerEntry({ ...base, kind: 'nope' })).toThrow(/unknown kind/);
  });
});
