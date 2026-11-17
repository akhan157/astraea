/**
 * Read-only provenance for the built-up aero model (hybrid 1.1.0).
 *
 * Single source for the UI. The legacy override constants are mirrored from
 * `docs/internal/aero-provenance.md` and pinned by test so a UI copy cannot
 * drift silently. Everything here is descriptive; nothing runs a model.
 */

export type ProvenanceTermClass = 'published' | 'derived' | 'engine-observed' | 'unvalidated';

export interface ProvenanceTerm {
  readonly name: string;
  readonly klass: ProvenanceTermClass;
  readonly detail: string;
}

export interface LegacyConstant {
  readonly name: string;
  readonly value: string;
  /** Always unvalidated; kept explicit per entry. */
  readonly status: 'unvalidated';
  readonly note?: string;
}

export interface AeroModelProvenance {
  readonly modelId: 'aero-buildup';
  readonly modelVersion: '1.1.0';
  readonly kind: 'hybrid';
  readonly disclaimer: string;
  readonly composition: {
    readonly wording: string;
    readonly bandLowMach: number;
    readonly bandHighMach: number;
    readonly referenceAtmosphere: string;
  };
  readonly terms: readonly ProvenanceTerm[];
  readonly legacyConstants: readonly LegacyConstant[];
  readonly evidence: readonly string[];
  readonly limits: readonly string[];
  readonly citations: string;
}

export const PROVENANCE_HASH = 'aero-model-provenance';

export const AERO_MODEL_PROVENANCE: AeroModelProvenance = Object.freeze({
  modelId: 'aero-buildup',
  modelVersion: '1.1.0',
  kind: 'hybrid',
  disclaimer:
    'No physical validation, no flight comparison and no release-grade or accuracy claim is made here. '
    + '"Engine-observed" means observed from the reference engine; "unvalidated" means no validation has been established. '
    + 'This page describes what the model does, not how well it predicts a flight.',
  composition: Object.freeze({
    wording:
      'Legacy total-drag override over Mach 0.80-1.20. Inside the band the legacy total replaces the '
      + 'build-up drag (including its base, protuberance and friction terms); the C1 blend weights sum to '
      + 'one, so nothing is counted twice. Outside the band only the build-up method applies.',
    bandLowMach: 0.8,
    bandHighMach: 1.2,
    referenceAtmosphere: 'Sea-level standard day (ISA 1976) for both models.',
  }),
  terms: Object.freeze([
    Object.freeze({ name: 'Standard atmosphere', klass: 'published' as const, detail: '1976 standard atmosphere.' }),
    Object.freeze({ name: 'Skin friction and crossflow', klass: 'published' as const, detail: 'Published friction and crossflow correlations.' }),
    Object.freeze({ name: 'Junction diameter rule', klass: 'derived' as const, detail: 'Load-time rule that rewrites each section fore diameter to the running diameter.' }),
    Object.freeze({ name: 'Station rules', klass: 'derived' as const, detail: 'Fin datum from the running aft station; buried booster shoulder adds no station offset.' }),
    Object.freeze({ name: 'Stage composition', klass: 'derived' as const, detail: 'Cumulative stack per flown stage (S, S+B1, S+B1+B2).' }),
    Object.freeze({ name: 'Supersonic fins', klass: 'derived' as const, detail: 'Fin strips with the AC-substitution gate.' }),
    Object.freeze({ name: 'Transonic endpoints', klass: 'engine-observed' as const, detail: 'Endpoint blend at the 0.90 and 1.05 Mach boundaries.' }),
    Object.freeze({ name: 'Nose CP fractions', klass: 'engine-observed' as const, detail: 'Per-shape nose CP fractions and caps.' }),
    Object.freeze({ name: 'Fin interference', klass: 'engine-observed' as const, detail: 'Interference multipliers used by the fin model.' }),
    Object.freeze({ name: 'Roughness table', klass: 'engine-observed' as const, detail: 'Surface-finish roughness values.' }),
    Object.freeze({ name: 'Fin airfoil terms', klass: 'engine-observed' as const, detail: 'Airfoil-section contributions used by the fin model.' }),
    Object.freeze({ name: 'Legacy override', klass: 'unvalidated' as const, detail: 'The total-drag override replaces the build-up drag inside 0.80-1.20 Mach; its constants are listed below and are unvalidated.' }),
  ]),
  legacyConstants: Object.freeze([
    Object.freeze({ name: 'Nose shape factors', value: '0.55 / 0.72 / 0.85 / 1.25', status: 'unvalidated' as const }),
    Object.freeze({ name: 'Base drag, cylinder (r ≥ 1)', value: 'TN D-4821 Fig. 15(b) flat-base fit, M 0.3–1.3', status: 'unvalidated' as const }),
    Object.freeze({ name: 'Base drag, cylinder tail (r ≥ 1)', value: '0.2021·(1.30/M)^0.716 (M > 1.3)', status: 'unvalidated' as const }),
    Object.freeze({
      name: 'Base drag, boattail (r < 1)',
      value: 'historical unvalidated 0.12/0.13/0.38 fit × (Db/D)²',
      status: 'unvalidated' as const,
      note: 'Held-out check R33 shows it over-predicts base drag on small-base boattails.',
    }),
    Object.freeze({ name: 'Motor-plume multiplier', value: '0.38 while burning', status: 'unvalidated' as const }),
    Object.freeze({
      name: 'Supersonic CP shift',
      value: 'min(0.8, 0.45·(1 − 1/M)) calibers forward',
      status: 'unvalidated' as const,
      note: 'Research observation: the ARCAS digitization shows an aft trend. Attributed observation, not a conclusion.',
    }),
    Object.freeze({ name: 'Fin body-lift CP station', value: '0.45·rootChord', status: 'unvalidated' as const }),
  ]),
  evidence: Object.freeze([
    'Method-only engine parity: 40 designs, 36,936 rows, worst 1.5535456002007316e-6, exact tier. '
      + 'This is engine parity, not flight accuracy, and does not apply to the hybrid.',
  ]),
  limits: Object.freeze([
    'Component breakdown is unavailable inside the 0.80-1.20 band because the drag has two sources there.',
    "Unset aero inputs use the method defaults: smooth (zero roughness), no forced turbulence, no nozzle exit, no rail hardware. Fin cross-section 'airfoil' maps to Subsonic NACA unless a section is chosen.",
    'Beta: the built-up model drives the stability and aero panels. Flights use its axial drag only when "Use built-up drag in flights" is on; with a selection and that option off, flights refuse pre-run. Lift and stability in flight always use the legacy model.',
    'The selection is off by default. Promotion requires held-out real flights and the owner decision.',
    'Both models are evaluated at a sea-level standard-day reference; altitude-dependent tables are not implemented.',
  ]),
  citations:
    'Constants: docs/internal/aero-provenance.md. Method notes: research documents (not shipped with the app). '
    + 'No vendor software, files or data are included.',
});

/** Open the provenance dialog from anywhere; the hash is the single trigger. */
export function openAeroModelProvenance(): void {
  if (typeof window === 'undefined') return;
  if (window.location.hash === `#${PROVENANCE_HASH}`) return;
  window.location.hash = PROVENANCE_HASH;
  window.dispatchEvent(new Event(`${PROVENANCE_HASH}:open`));
}
