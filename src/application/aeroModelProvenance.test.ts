import { describe, expect, it } from 'vitest';
import { AERO_MODEL_PROVENANCE as P } from './aeroModelProvenance';

describe('aero model provenance data', () => {
  it('identifies the hybrid model and its band', () => {
    expect(P.modelId).toBe('aero-buildup');
    expect(P.modelVersion).toBe('1.1.0');
    expect(P.kind).toBe('hybrid');
    expect(P.composition.bandLowMach).toBe(0.8);
    expect(P.composition.bandHighMach).toBe(1.2);
    expect(P.composition.referenceAtmosphere).toContain('Sea-level standard day');
    expect(P.composition.wording).toContain('Legacy total-drag override');
    expect(P.composition.wording).toContain('base, protuberance and friction');
  });

  it('carries all four term classes', () => {
    for (const klass of ['published', 'derived', 'engine-observed', 'unvalidated'] as const) {
      expect(P.terms.some((term) => term.klass === klass), klass).toBe(true);
    }
  });

  it('lists every legacy constant exactly, all unvalidated', () => {
    const expected: Record<string, string> = {
      'Nose shape factors': '0.55 / 0.72 / 0.85 / 1.25',
      'Base drag, subsonic': '0.12 + 0.13·M²',
      'Base drag, supersonic': '0.38 / M^1.2',
      'Motor-plume multiplier': '0.38 while burning',
      'Supersonic CP shift': 'min(0.8, 0.45·(1 − 1/M)) calibers forward',
      'Fin body-lift CP station': '0.45·rootChord',
    };
    expect(P.legacyConstants).toHaveLength(6);
    for (const [name, value] of Object.entries(expected)) {
      const entry = P.legacyConstants.find((constant) => constant.name === name);
      expect(entry, name).toBeDefined();
      expect(entry!.value).toBe(value);
      expect(entry!.status).toBe('unvalidated');
    }
    expect(P.legacyConstants.find((c) => c.name === 'Supersonic CP shift')!.note).toContain('aft trend');
  });

  it('scopes the engine parity to the method alone', () => {
    const evidence = P.evidence.join(' ');
    expect(evidence).toContain('Method-only');
    expect(evidence).toContain('40 designs');
    expect(evidence).toContain('36,936 rows');
    expect(evidence).toContain('does not apply to the hybrid');
  });

  it('states every required limitation', () => {
    const limits = P.limits.join(' ');
    expect(limits).toContain('Component breakdown is unavailable');
    expect(limits).toContain('airfoil');
    expect(limits).toContain('Unset aero inputs use the method defaults');
    expect(limits).toContain('smooth (zero roughness)');
    expect(limits).toContain('no forced turbulence');
    expect(limits).toContain('no nozzle exit');
    expect(limits).toContain('no rail hardware');
    expect(limits).toContain("Fin cross-section 'airfoil' maps to Subsonic NACA");
    expect(limits).toContain('flights still use the legacy model');
    expect(limits).toContain('off by default');
    expect(limits).toContain('held-out real flights');
    expect(limits).toContain('sea-level standard-day reference');
    expect(limits).not.toContain('are refused until the mapping is defined');
    expect(limits).not.toContain('does not record');
  });

  it('carries the disclaimer and no vendor strings or validation claims', () => {
    expect(P.disclaimer).toContain('No physical validation');
    expect(P.disclaimer).toContain('"unvalidated" means no validation has been established');
    const serialized = JSON.stringify(P);
    for (const forbidden of ['RASAero', 'CDX1', '.eng', 'accuracy verified']) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toMatch(/\b1\.0\.0\b/);
    expect(serialized).not.toMatch(/\bvalidated\b/);
  });
});
