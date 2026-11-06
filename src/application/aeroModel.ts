/**
 * Aero-model identity for runs and archives.
 *
 * Every flight result must name the aerodynamic model that produced it. The
 * identity is a closed registry: a run records `{ modelId, modelVersion,
 * terms }`, the archive pins it, and replay refuses an id/version this build
 * does not know instead of substituting one. Absent means the legacy model
 * path (the pre-port behaviour), so documents written before this field keep
 * their exact bytes and keys.
 */

import { hashHex, stableStringify } from './caseResolver';

/** Method-only model (its own transonic blend). */
export const AERO_MODEL_VERSION_METHOD_ONLY = '1.0.0';
/** Current model: the method with the legacy total-drag override 0.80-1.20. */
export const AERO_MODEL_VERSION = '1.1.0';

export const AERO_MODEL_IDS = ['aero-buildup'] as const;
export type AeroModelId = (typeof AERO_MODEL_IDS)[number];

/** Which implementation supplies the transonic term for this run. */
export const AERO_TERM_SOURCES = ['legacy', 'buildup'] as const;
export type AeroTermSource = (typeof AERO_TERM_SOURCES)[number];

/**
 * Version and term are a pair. `1.0.0` pairs with `buildup` (method-only);
 * `1.1.0` pairs with `legacy` (approved hybrid). `1.0.0`+`legacy` is the
 * defective 1b identity: it parses (so archives open) but never executes.
 */
export const AERO_MODEL_PAIRS: ReadonlyArray<{
  readonly modelVersion: string;
  readonly transonic: AeroTermSource;
}> = Object.freeze([
  Object.freeze({ modelVersion: AERO_MODEL_VERSION_METHOD_ONLY, transonic: 'buildup' as const }),
  Object.freeze({ modelVersion: AERO_MODEL_VERSION, transonic: 'legacy' as const }),
]);

export interface AeroModelSelection {
  readonly modelId: AeroModelId;
  readonly modelVersion: string;
  readonly terms: { readonly transonic: AeroTermSource };
}

/** Known model versions per id. A run may only name a version listed here. */
export const AERO_MODEL_VERSIONS: Readonly<Record<AeroModelId, readonly string[]>> = Object.freeze({
  'aero-buildup': Object.freeze([AERO_MODEL_VERSION_METHOD_ONLY, AERO_MODEL_VERSION]),
});

const SEMVER = /^\d+\.\d+\.\d+$/;

/** Content key of a selection (its own identity, independent of the case). */
export function aeroModelKey(selection: AeroModelSelection): string {
  return hashHex(stableStringify(selection));
}

/** Whether this build can replay a selection exactly. */
export function isKnownAeroModel(selection: {
  readonly modelId: string;
  readonly modelVersion: string;
}): boolean {
  const versions = AERO_MODEL_VERSIONS[selection.modelId as AeroModelId];
  return versions !== undefined && versions.includes(selection.modelVersion);
}

/** Whether version and term form a pair this build can execute. */
export function isUsableAeroModel(selection: AeroModelSelection): boolean {
  return AERO_MODEL_PAIRS.some(
    (pair) => pair.modelVersion === selection.modelVersion && pair.transonic === selection.terms.transonic,
  );
}

/**
 * The defective 1b selection: version 1.0.0 with the legacy term. Such a
 * project must load and show this state; it must never be migrated silently.
 */
export function aeroModelDefect(selection: AeroModelSelection): string | null {
  if (
    selection.modelId === 'aero-buildup'
    && selection.modelVersion === AERO_MODEL_VERSION_METHOD_ONLY
    && selection.terms.transonic === 'legacy'
  ) {
    return 'This aero-model selection was saved by a build that never implemented the legacy-transonic composition. Choose the current hybrid model or the legacy aero model.';
  }
  return null;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

/**
 * Strict parser for a stored selection. Unknown ids or versions are refused
 * here (that is what makes replay fail closed); the message names the exact
 * missing model so the user knows why the archive cannot be replayed.
 */
export function parseAeroModelSelection(value: unknown, path = 'aeroModel'): AeroModelSelection {
  const raw = record(value, path);
  const keys = Object.keys(raw).sort().join(',');
  if (keys !== 'modelId,modelVersion,terms') {
    throw new Error(`${path} must hold exactly modelId, modelVersion and terms`);
  }
  if (typeof raw.modelId !== 'string' || !(AERO_MODEL_IDS as readonly string[]).includes(raw.modelId)) {
    throw new Error(`${path}.modelId must be one of ${AERO_MODEL_IDS.join(', ')}`);
  }
  if (typeof raw.modelVersion !== 'string' || !SEMVER.test(raw.modelVersion)) {
    throw new Error(`${path}.modelVersion must be a semver string`);
  }
  const modelId = raw.modelId as AeroModelId;
  if (!AERO_MODEL_VERSIONS[modelId].includes(raw.modelVersion)) {
    throw new Error(
      `${path}.modelVersion '${raw.modelVersion}' is unknown to this build for ${modelId}; replay refuses rather than substituting a model`,
    );
  }
  const termsRaw = record(raw.terms, `${path}.terms`);
  if (Object.keys(termsRaw).length !== 1 || !Object.hasOwn(termsRaw, 'transonic')) {
    throw new Error(`${path}.terms must hold exactly transonic`);
  }
  if (typeof termsRaw.transonic !== 'string'
    || !(AERO_TERM_SOURCES as readonly string[]).includes(termsRaw.transonic)) {
    throw new Error(`${path}.terms.transonic must be one of ${AERO_TERM_SOURCES.join(', ')}`);
  }
  return Object.freeze({
    modelId,
    modelVersion: raw.modelVersion,
    terms: Object.freeze({ transonic: termsRaw.transonic as AeroTermSource }),
  });
}
