import { describe, expect, it } from 'vitest';
import { aeroConfidence } from './data/adapter';
import { AERO_MODEL_VERSION, AERO_MODEL_VERSION_METHOD_ONLY, type AeroModelSelection } from '../application/aeroModel';

const BETA: AeroModelSelection = {
  modelId: 'aero-buildup',
  modelVersion: AERO_MODEL_VERSION,
  terms: { transonic: 'legacy' },
};

describe('aero confidence wording', () => {
  it('keeps the legacy sentence byte-identical when no model is selected', () => {
    expect(aeroConfidence().reason).toBe(
      'Barrowman/Hoerner slender-body model with modeled transonic drag curves; not checked against your flights.',
    );
  });

  it('describes the hybrid, not a method-only model', () => {
    const { confidence, reason } = aeroConfidence(undefined, BETA);
    expect(confidence).toBe('modeled');
    expect(reason).toContain('aero-buildup 1.1.0');
    expect(reason).toContain('legacy drag override in Mach 0.80-1.20');
    expect(reason).toContain('not checked against your flights');
    expect(reason).toContain('Component breakdown unavailable');
    expect(reason).not.toMatch(/Barrowman/);
    expect(reason).not.toContain('slender-body');
  });

  it('reports the defective 1b pair instead of running it', () => {
    const defective: AeroModelSelection = {
      modelId: 'aero-buildup',
      modelVersion: AERO_MODEL_VERSION_METHOD_ONLY,
      terms: { transonic: 'legacy' },
    };
    const { confidence, reason } = aeroConfidence(undefined, defective);
    expect(confidence).toBe('unknown');
    expect(reason).toContain('never implemented the legacy-transonic composition');
  });

  it('keeps the calibration sentence when a calibration is present', () => {
    const calibrated = aeroConfidence(
      {
        scale: 0.9,
        fittedCd: 0.5,
        modelCd: 0.55,
        rmseN: 0.1,
        coastMassKg: 0.05,
        source: { fileName: 'log.csv', sha256Hex: 'a'.repeat(64), rowCount: 10 },
        window: { startS: 1, endS: 2, method: 'velocity-column', pointsUsed: 10, pointsExcluded: 0 },
        appliedAt: '2026-01-01T00:00:00.000Z',
      },
      BETA,
    );
    expect(calibrated.reason).toContain('Airframe drag scaled by 0.900');
    expect(calibrated.reason).not.toContain('aero-buildup');
  });
});
