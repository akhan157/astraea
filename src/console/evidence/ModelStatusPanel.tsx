/**
 * Read-only model & evidence status: which model/engine produced results and
 * what is (and is not) established about them. Restates existing documented
 * facts only — never a qualification claim, never a green pass for unvalidated
 * quantities. Serves teammate reproducibility without developer help.
 */
import type { JSX } from 'react';
import { useProjectStore } from '../../state/project';
import { isCandidateFlightModel, resolveFlightModel } from '../../application/flightModel';
import { calibrationEngineStatus } from '../../application/calibrationApplicability';
import { compareEngineIdentity, describeEngineIdentity, type EngineIdentity } from '../../engine/identity';
import { ACCURACY_URL } from '../../lib/links';
import { BETA_ACCURACY_CLAIM } from '../evidenceClaims';
import { useDesign, useWS } from '../store';
import { useCurrentEngineIdentity } from './CalibrationChip';
import { C } from '../kit/theme';
import { Caveat } from '../kit/Caveat';
import { Disclosure } from '../kit/Disclosure';
import { AeroModelProvenanceButton } from './AeroModelProvenance';

/** The honest attribution sentence for a result/current engine comparison. */
export function engineAttribution(match: 'same' | 'different' | 'unknown', hasRun: boolean): string {
  if (!hasRun) return 'Engine comparison needs a completed run.';
  if (match === 'same') return 'The result was produced by the current engine bytes.';
  return match === 'different'
    ? 'The result used a different engine identity; differences cannot be attributed to the design alone.'
    : 'Engine identity comparison unknown; differences cannot be attributed to the design alone.';
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return <div className="flex flex-wrap gap-1 text-[11.5px]">
    <span className="w-40 shrink-0" style={{ color: C.muted }}>{label}</span>
    <span className="min-w-0 flex-1 break-words">{children}</span>
  </div>;
}

/** The engine SHA-256 is a reference, not reading matter: short form here, full hash on demand. */
function EngineIdentityLine({ identity }: { identity: EngineIdentity | undefined }): JSX.Element {
  if (identity?.kind === 'production-rust-wasm' && identity.sha256 !== null) {
    return <>production WASM SHA-256{' '}
      <span className="font-geist-mono" title={identity.sha256}>{identity.sha256.slice(0, 12)}…</span>
    </>;
  }
  return <>{describeEngineIdentity(identity)}</>;
}

export function ModelStatusPanel(): JSX.Element {
  const project = useProjectStore((s) => s.project);
  const committed = useWS().committed;
  const currentEngine = useCurrentEngineIdentity();
  const model = resolveFlightModel(project.flightModel);
  const candidateSelected = isCandidateFlightModel(model);
  // Ordinary status reports the recorded result only when it belongs to the
  // currently selected model; mismatched history stays in Saved Runs.
  const run = candidateSelected ? undefined : committed?.run;
  const candidate = candidateSelected ? committed?.candidate : undefined;
  const design = useDesign();
  const applicability = design.calibrationApplicability;
  const calibrationEngine = project.dragCalibration === undefined
    ? null : calibrationEngineStatus(project.dragCalibration, currentEngine);
  const resultIdentity = committed?.engineIdentity;
  const engineMatch = compareEngineIdentity(resultIdentity, currentEngine);
  const hasResult = run !== undefined || candidate !== undefined;
  return (
    <section aria-label="Model and evidence status" data-model-status-panel className="space-y-1.5 rounded-md p-3.5"
      style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <h3 className="text-[13px] font-medium">Model &amp; evidence status</h3>
      <Caveat summary="How these results were produced, and what the evidence does not establish.">
        What produced these results and what the evidence does and does not establish. Read-only; nothing here re-runs a case.
      </Caveat>
      <Row label="Flight model">
        <span data-model-id>{model.modelId}</span> · {model.environmentId} · {model.mechanicalModelId} · {model.calibrationPolicyId}
        <div style={{ color: candidateSelected ? C.warn : C.muted }}>
          {candidateSelected
            ? 'Explicit experimental candidate selection. It is opt-in, unqualified and not a default or released flight model.'
            : 'Resolved against the supported legacy model contract. These IDs name the model contract; they are not an executable checksum and not an accuracy claim.'}
        </div>
      </Row>
      {design.aeroModel === undefined ? null : (
        <Row label="Aero model">
          <span data-aero-model-id>{design.aeroModel.modelId} {design.aeroModel.modelVersion}</span> · hybrid
          <div className="mt-1"><AeroModelProvenanceButton /></div>
        </Row>
      )}
      <Row label="Engine">
        <div>Result: {!hasResult ? (candidateSelected ? 'no completed candidate run recorded' : 'no completed run recorded') : <EngineIdentityLine identity={resultIdentity} />}</div>
        <div>Current: {currentEngine === undefined ? 'identity unavailable or loading' : <EngineIdentityLine identity={currentEngine} />}</div>
        <div data-engine-attribution data-engine-tone={hasResult && engineMatch !== 'same' ? 'warn' : 'muted'} style={{ color: hasResult && engineMatch !== 'same' ? C.warn : C.muted }}>
          {engineAttribution(engineMatch, hasResult)}
        </div>
        {((resultIdentity?.kind === 'production-rust-wasm' && resultIdentity.sha256 !== null)
          || (currentEngine?.kind === 'production-rust-wasm' && currentEngine.sha256 !== null)) && (
          <Disclosure className="mt-1" summary="Show full hashes">
            <div className="mt-1 break-all font-geist-mono text-[10px]" style={{ color: C.dim }}>
              <div>Result: {hasResult ? describeEngineIdentity(resultIdentity) : (candidateSelected ? 'no completed candidate run recorded' : 'no completed run recorded')}</div>
              <div>Current: {currentEngine === undefined ? 'identity unavailable or loading' : describeEngineIdentity(currentEngine)}</div>
            </div>
          </Disclosure>
        )}
      </Row>
      <Row label="Drag calibration">
        {applicability.status === 'none'
          ? <span>No calibration artifact on this project; runs use the model’s own drag.</span>
          : applicability.status === 'inactive'
            ? applicability.reason === 'flight-model'
              ? <span data-calibration-binding="incompatible" style={{ color: C.warn }}>Inactive: the stored fit is bound to a different flight model. It is retained as history and does not affect runs.</span>
              : <span data-calibration-binding="fit-inputs-changed" style={{ color: C.warn }}>Inactive: the fit-time design, motor, site or launch inputs differ from the current ones. The scale is retained as history and does not affect runs, run identity or the archive.</span>
            : calibrationEngine === 'different' || calibrationEngine === 'unknown'
              ? <span data-calibration-binding={`${applicability.model}-engine-${calibrationEngine}`} style={{ color: C.warn }}>
                  {calibrationEngine === 'different'
                    ? 'Input-compatible, but the recorded fit engine differs from this engine. Runs refuse the scale; refit on this engine or remove it.'
                    : 'Input-compatible, but the recorded fit engine cannot be verified (a SHA-256 is unavailable). Runs refuse the scale; refit on a build with a known engine identity or remove it.'}
                </span>
              : <span data-calibration-binding={applicability.model}>
                  {applicability.model === 'bound'
                    ? `Active: fit bound to ${applicability.calibration.fitProvenance!.flightModelBinding!.modelId}.`
                    : 'Active legacy fit; model binding unverified.'}{' '}
                  {calibrationEngine === 'same'
                    ? 'Current WASM matches the recorded fit engine.'
                    : 'No engine identity was recorded; engine compatibility is unverified.'}{' '}
                  Adjustment from one flight of this rocket; not a validation of the model.
                </span>}
      </Row>
      <Row label="Validation scope">
        <div data-validation-claim>{BETA_ACCURACY_CLAIM}</div>
        <Caveat summary="Software verification is separate from physical/numerical qualification.">
          Software verification (tests, builds, journeys) is separate from physical/numerical qualification, which is
          ongoing. Run-level gates and confidence are shown in the pre-export check below.
        </Caveat>
        <span className="flex flex-wrap gap-x-4">
          <a href={ACCURACY_URL} target="_blank" rel="noreferrer" className="underline">How accurate is it?</a>
          <a href="../third-party-notices.txt" target="_blank" rel="noreferrer" className="underline">Third-party notices</a>
        </span>
      </Row>
    </section>
  );
}
