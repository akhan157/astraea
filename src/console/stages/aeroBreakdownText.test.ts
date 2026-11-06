import { describe, expect, it } from 'vitest';
import type { StabilityRow } from '../data/contract';
import { classifyBreakdownRows, NON_LIFTING_DIVIDER, NON_LIFTING_FOOTNOTE, unknownRowSentence } from './aeroBreakdownText';

const TYPES: Record<string, string> = {
  nose: 'nosecone',
  tube: 'bodytube',
  chute: 'parachute',
  load: 'masscomponent',
  fin: 'trapezoidfinset',
  outline: 'freeformfinset',
};
const typeOf = (id: string): string | undefined => TYPES[id];

function row(partId: string, over: Partial<StabilityRow> = {}): StabilityRow {
  return {
    partId,
    name: partId,
    type: TYPES[partId] ?? 'bodytube',
    mass: { value: 1, unit: 'kg', confidence: 'modeled' },
    cg: { value: 0.5, unit: 'm', confidence: 'modeled' },
    cnAlpha: { value: 0, unit: '1/rad', confidence: 'modeled' },
    contributionPct: 0,
    ...over,
  };
}

const unknown = (partId: string, name = partId): StabilityRow => row(partId, {
  name,
  cnAlpha: { value: 0, unit: '1/rad', confidence: 'unknown', reason: 'The native engine did not publish a normal-force slope for this part.' },
});

describe('Aero breakdown classification', () => {
  it('puts positive lifting rows first, sorted by share', () => {
    const groups = classifyBreakdownRows([
      row('nose', { cnAlpha: { value: 2, unit: '1/rad', confidence: 'modeled' }, contributionPct: 10 }),
      row('fin', { cnAlpha: { value: 18, unit: '1/rad', confidence: 'modeled' }, contributionPct: 90 }),
    ], typeOf);
    expect(groups.lifting.map((r) => r.partId)).toEqual(['fin', 'nose']);
  });

  it('moves unknown non-lifting types into the quiet group in assembly order', () => {
    const groups = classifyBreakdownRows([unknown('tube', 'Body tube'), unknown('chute', 'Main'), unknown('load', 'Nose ballast')], typeOf);
    expect(groups.secondary.map((r) => r.partId)).toEqual(['tube', 'chute', 'load']);
    expect(groups.lifting).toHaveLength(0);
    expect(groups.warnings).toHaveLength(0);
  });

  it('keeps an engine-reported exact zero as a secondary row, still modeled', () => {
    const groups = classifyBreakdownRows([row('tube', { cnAlpha: { value: 0, unit: '1/rad', confidence: 'modeled' }, contributionPct: 0 })], typeOf);
    expect(groups.secondary).toHaveLength(1);
    expect(groups.secondary[0]!.cnAlpha.confidence).toBe('modeled');
    expect(groups.secondary[0]!.cnAlpha.value).toBe(0);
  });

  it('keeps an unknown part of a lifting type as a distinct warning, not in the quiet group', () => {
    const groups = classifyBreakdownRows([unknown('outline', 'Freeform fin set')], typeOf);
    expect(groups.secondary).toHaveLength(0);
    expect(groups.warnings.map((r) => r.partId)).toEqual(['outline']);
  });
});

describe('Aero breakdown wording', () => {
  it('uses the approved divider and one footnote line', () => {
    expect(NON_LIFTING_DIVIDER).toBe('Not lifting surfaces');
    expect(NON_LIFTING_FOOTNOTE).toBe('— not modelled as a lifting surface in this subsonic rollup. These parts move the CG, not the CP.');
  });

  it('keeps the engine reason for an unknown row', () => {
    expect(unknownRowSentence(unknown('outline', 'Freeform fin set')))
      .toBe('Freeform fin set: CNα and CP are not reported. The native engine did not publish a normal-force slope for this part.');
  });
});
