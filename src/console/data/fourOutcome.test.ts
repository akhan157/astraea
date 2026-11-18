import { describe, expect, it } from 'vitest';
import { useProjectStore } from '../../state/project';
import { flightResult } from '../testFixtures';
import { qualifyByValidity, toFlightRun, validityExplanation } from './adapter';
import { fixOf } from '../stages/Verify';

const vehicle = useProjectStore.getState().project.vehicle;
const gatesOf = (overrides: Parameters<typeof flightResult>[0]) => toFlightRun(flightResult(overrides), vehicle, undefined, 'key', 1, 0).gates;
const gate = (overrides: Parameters<typeof flightResult>[0], id: string) => gatesOf(overrides).find((g) => g.id === id)!;

describe('flight checks: one rule, four outcomes', () => {
  it('qualifies a verdict by the run validity: a proven failure stays failed, a pass needs a valid run', () => {
    expect(qualifyByValidity('pass', 'PASS')).toBe('pass');
    expect(qualifyByValidity('pass', 'UNKNOWN')).toBe('unknown');
    expect(qualifyByValidity('pass', 'FAIL')).toBe('invalid');
    expect(qualifyByValidity('fail', 'UNKNOWN')).toBe('fail');
    expect(qualifyByValidity('fail', 'FAIL')).toBe('fail');
    expect(qualifyByValidity('n/a', 'FAIL')).toBe('n/a');
  });

  it('never shows a red rail-exit row whose speed beats the limit', () => {
    // The engine refuses rail exit on an UNKNOWN run even at 22 m/s; that is a
    // validity question, not a rail failure, so no "longer rail" advice.
    const rail = gate({ railExitVelocity: 22, isRailExitSafe: false, validity: 'UNKNOWN', offNominalExcursion: true }, 'rail_exit');
    expect(rail.status).toBe('unknown');
    expect(rail.reason).toMatch(/22\.0 m\/s, at or above the 15 m\/s minimum/);
    expect(rail.reason).toMatch(/does not vouch for this run: part of the flight used extrapolated/);
    expect(rail.advice).toMatch(/See Run validity/);
    expect(rail.advice).not.toMatch(/longer rail/);
    expect(rail.fixStage).toBe('flight');
  });

  it('keeps a slow rail exit failed whatever the validity, with advice that matches', () => {
    for (const validity of ['PASS', 'UNKNOWN'] as const) {
      const rail = gate({ railExitVelocity: 11, isRailExitSafe: false, validity }, 'rail_exit');
      expect(rail.status).toBe('fail');
      expect(rail.reason).toMatch(/11\.0 m\/s, below the 15 m\/s minimum/);
      expect(rail.advice).toMatch(/longer rail/);
      expect(rail.fixStage).toBe('mission');
    }
  });

  it('marks checks "run invalid" when the engine marked the run invalid', () => {
    const gates = gatesOf({ validity: 'FAIL', terminationReason: 'timeout', touchdownNominal: false, isRailExitSafe: false });
    expect(gates.find((g) => g.id === 'rail_exit')!.status).toBe('invalid');
    expect(gates.find((g) => g.id === 'landing_speed')!.status).toBe('invalid');
    const validity = gates.find((g) => g.id === 'validity')!;
    expect(validity).toMatchObject({ status: 'invalid', display: 'Invalid' });
    expect(validity.reason).toMatch(/stopped on its time limit before touchdown/);
  });

  it('shows run validity as a verdict, not a duration', () => {
    const validity = gate({}, 'validity');
    expect(validity).toMatchObject({ status: 'pass', display: 'Valid', threshold: 'Must be valid' });
    expect(validity.advice).toBeUndefined();
    expect(gate({ validity: 'UNKNOWN', enveloped: false }, 'validity')).toMatchObject({ status: 'unknown', display: 'Unknown' });
  });

  it('explains validity in plain words', () => {
    expect(validityExplanation({ validity: 'UNKNOWN', enveloped: false, offNominalExcursion: false, touchdownNominal: true, terminationReason: 'touchdown' }))
      .toMatch(/left the modeled range/);
    expect(validityExplanation({ validity: 'PASS', enveloped: true, offNominalExcursion: false, touchdownNominal: true, terminationReason: 'touchdown' }))
      .toMatch(/vouches for this run/);
  });

  it('offers a fix only when something needs changing, pointing the same way as the result', () => {
    expect(fixOf(gate({}, 'rail_exit'))).toBeNull();
    expect(fixOf(gate({ railExitVelocity: 11, isRailExitSafe: false }, 'rail_exit'))).toEqual({ stage: 'mission', hint: expect.stringMatching(/longer rail/) });
    expect(fixOf(gate({ landingVelocity: 12 }, 'landing_speed'))).toEqual({ stage: 'recovery', hint: expect.stringMatching(/larger main/) });
  });
});
