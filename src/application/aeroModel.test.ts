import { describe, expect, it } from 'vitest';
import {
  AERO_MODEL_VERSION,
  aeroModelKey,
  isKnownAeroModel,
  parseAeroModelSelection,
  type AeroModelSelection,
} from './aeroModel';

const selection: AeroModelSelection = Object.freeze({
  modelId: 'aero-buildup',
  modelVersion: AERO_MODEL_VERSION,
  terms: Object.freeze({ transonic: 'legacy' as const }),
});

describe('aero model identity', () => {
  it('parses the shipped selection and keys it content-addressed', () => {
    expect(parseAeroModelSelection(selection)).toEqual(selection);
    // The run-identity hash is FNV-1a 32-bit hex, like every other content key.
    expect(aeroModelKey(selection)).toMatch(/^[0-9a-f]{8}$/);
    expect(aeroModelKey(selection)).toBe(aeroModelKey(parseAeroModelSelection(selection)));
    expect(aeroModelKey({ ...selection, terms: { transonic: 'buildup' } })).not.toBe(aeroModelKey(selection));
  });

  it('refuses unknown ids, unknown versions and malformed shapes', () => {
    expect(() => parseAeroModelSelection({ ...selection, modelId: 'other' })).toThrow(/modelId/);
    expect(() => parseAeroModelSelection({ ...selection, modelVersion: '9.9.9' }))
      .toThrow(/unknown to this build/);
    expect(() => parseAeroModelSelection({ ...selection, modelVersion: '1.0' })).toThrow(/semver/);
    expect(() => parseAeroModelSelection({ ...selection, extra: 1 })).toThrow(/exactly/);
    expect(() => parseAeroModelSelection({ ...selection, terms: {} })).toThrow(/transonic/);
    expect(() => parseAeroModelSelection({ ...selection, terms: { transonic: 'bogus' } })).toThrow(/transonic/);
    expect(() => parseAeroModelSelection(null)).toThrow(/object/);
  });

  it('knows only versions the registry lists', () => {
    expect(isKnownAeroModel(selection)).toBe(true);
    expect(isKnownAeroModel({ modelId: 'aero-buildup', modelVersion: '9.9.9' })).toBe(false);
    expect(isKnownAeroModel({ modelId: 'other', modelVersion: AERO_MODEL_VERSION })).toBe(false);
  });
});
