/**
 * RIVAL S2 — result qualification contract (pattern 8 + synthesis §4
 * criterion b/c): a pass badge requires valid + current + gate-pass.
 * Stale results never show an unqualified pass, and invalid inputs never
 * show any gate outcome.
 */
import { describe, expect, it } from 'vitest';
import { qualifyResult } from './runDisplay';

describe('qualifyResult', () => {
  it('passes only a current, valid, gate-passing result', () => {
    const out = qualifyResult({ valid: true, current: true, gate: 'pass' });
    expect(out.status).toBe('pass');
    expect(out.isPass).toBe(true);
  });

  it('never passes a stale result even when the old numbers passed', () => {
    const out = qualifyResult({ valid: true, current: false, gate: 'pass' });
    expect(out.status).toBe('stale');
    expect(out.label).toContain('was passing');
    expect(out.isPass).toBe(false);
  });

  it('keeps a stale gate-fail labeled stale, not pass', () => {
    const out = qualifyResult({ valid: true, current: false, gate: 'fail' });
    expect(out.status).toBe('stale');
    expect(out.isPass).toBe(false);
  });

  it('never passes an invalid result even when a gate passed before', () => {
    const out = qualifyResult({ valid: false, current: true, gate: 'pass' });
    expect(out.status).toBe('invalid');
    expect(out.label).toContain('repair');
    expect(out.isPass).toBe(false);
  });

  it('surfaces gate fail and unknown on current valid inputs without a pass', () => {
    expect(qualifyResult({ valid: true, current: true, gate: 'fail' }).status).toBe('fail');
    const unknown = qualifyResult({ valid: true, current: true, gate: 'unknown' });
    expect(unknown.status).toBe('unknown');
    expect(unknown.label).toBe('No gate evaluated');
    expect(unknown.isPass).toBe(false);
  });

  it('keeps running and failed lifecycles distinct', () => {
    expect(qualifyResult({ valid: true, current: true, gate: 'pass', lifecycle: 'running' }).status).toBe('running');
    const failed = qualifyResult({ valid: true, current: true, gate: 'pass', lifecycle: 'failed' });
    expect(failed.status).toBe('fail');
    expect(failed.label).toBe('Run failed');
    expect(failed.isPass).toBe(false);
  });
});