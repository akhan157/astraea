import { useMemo, useState } from 'react';
import { Tooltip } from 'radix-ui';
import { exportableProject, useProjectStore } from '../../state/project';
import { useAnalysisStore } from '../../state/analysis';
import { Button } from '../kit/Fields';
import { Select } from '../kit/Controls';
import { Disclosure } from '../kit/Disclosure';
import { C } from '../kit/theme';
import { Caveat } from '../kit/Caveat';
import { compareEngineIdentity } from '../../engine/identity';
import { compareRunInputs } from '../../application/runComparison';
import { describeDragCalibration } from '../../application/dragCalibration';
import { MomentArmHistoryPanel } from '../evidence/MomentArmHistoryPanel';
import { landingAvailability, type LandingAvailability } from '../../application/flightLanding';
import { CONF_LABEL, DeltaChip, ResultValue } from '../kit/Value';
import { kindOf } from '../kit/units';
import { SAVED_FLIGHT_LANDING_OUTPUT_IDS, SAVED_FLIGHT_OUTPUT_IDS, SAVED_FLIGHT_OUTPUT_LABELS, SAVED_FLIGHT_OUTPUT_UNITS, type SavedFlightOutput, type SavedFlightOutputId, type SavedFlightOutputs } from '../../application/savedFlightOutputs';
import { CANDIDATE_OUTPUT_LABELS, candidateLandingAvailability, candidateOutputDictionary, type CandidateResultArchive } from '../../application/candidateResult';
import type { SimCase } from '../../formats/projectJson';

/** Which direction a change is good in; the same map the live Flight table uses. */
const BETTER: Partial<Record<SavedFlightOutputId, 'up' | 'down'>> = {
  railExitSpeed: 'up', landingSpeed: 'down', landingEnergy: 'down',
};

const LANDING_OUTPUTS: ReadonlySet<SavedFlightOutputId> = new Set(SAVED_FLIGHT_LANDING_OUTPUT_IDS);

/** The record's declared landing availability from its archived flags. */
function recordLanding(outputs: SavedFlightOutputs): LandingAvailability {
  return landingAvailability({ summary: { landingNominal: outputs.flags.landingNominal }, terminationReason: outputs.flags.terminationReason });
}

function SavedOutputValue({ id, output, landing }: { id: SavedFlightOutputId; output: SavedFlightOutput | undefined; landing: LandingAvailability }) {
  const label = SAVED_FLIGHT_OUTPUT_LABELS[id];
  if (output === undefined) return <span style={{ color: C.dim }}>not recorded</span>;
  if (!output.available || output.value === null) return <span>N/A — {output.unavailableReason ?? 'unavailable'}</span>;
  // Defensive boundary: a canonical landing/descent entry never overrides the
  // record's shared availability flags, even if such an archive bypasses parsing.
  if (LANDING_OUTPUTS.has(id) && !landing.available) return <span title={`Archived flags say: ${landing.reason}`}>N/A — {landing.reason}</span>;
  if (output.unit !== SAVED_FLIGHT_OUTPUT_UNITS[id]) {
    return <span title={`Stored unit '${output.unit}' is not the canonical '${SAVED_FLIGHT_OUTPUT_UNITS[id]}' for this output; shown as recorded, not converted`}>{output.value} {output.unit} (non-canonical unit)</span>;
  }
  return <ResultValue label={label} r={{ value: output.value, unit: output.unit, confidence: output.confidence,
    ...(output.reason === undefined ? {} : { reason: output.reason }) }} />;
}

/** Read-only qualification, flags and peak context archived with this exact run. */
function SavedOutputRecord({ entry, outputs }: { entry: SimCase; outputs: SavedFlightOutputs }) {
  const { flags, sampledMaxQ } = outputs;
  const landing = recordLanding(outputs);
  return <Disclosure summary={`Canonical output dictionary · ${outputs.dictionaryRevision}`}>
    <div className="space-y-1 break-words pt-2">
      <p data-output-flags>Validity {flags.validity} · engine envelope {flags.enveloped ? 'inside' : 'left'} · off-nominal excursion {flags.offNominalExcursion ? 'yes' : 'no'} · landing {flags.landingNominal ? 'nominal' : 'not nominal'}{flags.terminationReason === undefined ? ' · termination not recorded' : ` · termination ${flags.terminationReason}`}</p>
      <p>{sampledMaxQ === undefined ? 'Sampled max-Q metadata not recorded for this run.'
        : `Sampled max-Q: ${sampledMaxQ.validSampleCount} usable q/time samples of ${sampledMaxQ.sampleCount}; peak sample at ${sampledMaxQ.time} s; maximum observed timestamp gap ${sampledMaxQ.maxObservedGapS === undefined ? 'unavailable' : `${sampledMaxQ.maxObservedGapS} s`}. No continuous-peak error bound.`}</p>
      <table aria-label={`Canonical outputs for ${entry.id}`} className="w-full text-left"><caption className="text-left">Canonical outputs · historical record, not a fresh simulation</caption>
        <thead><tr><th>Output</th><th>Value</th><th>Confidence</th><th>Basis</th></tr></thead>
        <tbody>{SAVED_FLIGHT_OUTPUT_IDS.map((id) => {
          const output = outputs.outputs[id];
          if (!output) return null;
          return <tr key={id}><th className="font-normal">{SAVED_FLIGHT_OUTPUT_LABELS[id]}</th>
            <td><SavedOutputValue id={id} output={output} landing={landing} /></td>
            <td>{CONF_LABEL[output.confidence]}</td>
            <td>{output.reason ?? output.unavailableReason ?? ''}</td></tr>;
        })}</tbody></table>
    </div>
  </Disclosure>;
}

/** Same rule as live results; a missing nominal flag on an old record is not a touchdown. */
function savedLanding(entry: SimCase): LandingAvailability {
  const summary = entry.summary;
  return landingAvailability({ summary: { landingNominal: summary?.landingNominal === true },
    terminationReason: summary?.terminationReason === 'timeout' ? 'timeout' : undefined });
}

/** Read-only altitude/time display of the exact retained bounded samples. */
function SavedTelemetryPlot({ entry }: { entry: SimCase }) {
  if (entry.telemetry === undefined) {
    return <p style={{ color: C.muted }}>Historical telemetry unavailable — not retained. Older summary-only runs are never reconstructed or attributed to the current engine.</p>;
  }
  const samples = entry.telemetry;
  if (samples.length === 0) {
    return <p style={{ color: C.muted }}>Historical telemetry retained as an empty series: the recorded run returned no display samples. Not a fresh simulation.</p>;
  }
  const width = 640, height = 180, pad = 10;
  const firstTime = samples[0].time, lastTime = samples[samples.length - 1].time;
  const altitudes = samples.map((point) => point.altitude);
  const minAltitude = Math.min(...altitudes), maxAltitude = Math.max(...altitudes);
  const timeSpan = lastTime - firstTime || 1;
  const altitudeSpan = maxAltitude - minAltitude || 1;
  const points = samples.map((point) => {
    const x = pad + ((point.time - firstTime) / timeSpan) * (width - 2 * pad);
    const y = height - pad - ((point.altitude - minAltitude) / altitudeSpan) * (height - 2 * pad);
    return `${x},${y}`;
  }).join(' ');
  return <Disclosure summary={`Historical trajectory · ${samples.length} retained display samples · last ${lastTime.toFixed(2)} s`}>
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 w-full max-w-3xl rounded bg-black/20" role="img"
      aria-label={`Historical trajectory for ${entry.id}`} data-sample-count={samples.length}>
      <desc>Altitude over time from retained display samples only; historical record, not a fresh simulation.</desc>
      <polyline points={points} fill="none" stroke={C.accent} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
    <p style={{ color: C.muted }}>Modeled altitude (m AGL) versus time (s), using only this case’s retained bounded display samples. Read-only historical record; no interpolation or re-simulation. Freshness still requires an explicit new run.</p>
  </Disclosure>;
}

/** Read-only candidate record: inputs, identity and candidate-only statuses. */
function SavedCandidateRun({ entry, result, onLoad }: { entry: SimCase; result: CandidateResultArchive; onLoad: (message: string) => void }) {
  const inputs = entry.inputs?.version === 3 ? entry.inputs : null;
  const outputs = candidateOutputDictionary(result);
  const landing = candidateLandingAvailability(result);
  return (
    <div data-saved-run-id={entry.id} data-saved-candidate-run className="space-y-1 border-t border-white/10 pt-2 text-[11.5px]">
      <div>Candidate flight · {entry.createdAt} · {inputs?.vehicle.name ?? 'archived candidate case'}</div>
      <div style={{ color: C.muted }}>{result.status} · {result.termination} · {result.computationalCompletion} · {result.empiricalQualification} · dynamic {result.dynamicQualification}</div>
      <div className="break-all font-geist-mono text-[10px]" style={{ color: C.dim }}>Input/model digest {result.contentIdentity.sha256} · engine {entry.engineIdentity?.kind === 'production-rust-wasm' && entry.engineIdentity.sha256 ? entry.engineIdentity.sha256 : 'identity unknown'}</div>
      {!landing.available && <div role="status" style={{ color: C.changed }}>{landing.reason}. No landing value is shown or zero-filled.</div>}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {(Object.keys(outputs) as Array<keyof typeof outputs>).map((id) => {
          const output = outputs[id];
          return <div key={id} className="flex justify-between gap-2"><span style={{ color: C.muted }}>{CANDIDATE_OUTPUT_LABELS[id]}</span><span className="font-geist-mono">{output.available ? `${output.value ?? '—'}${output.unit ? ` ${output.unit}` : ''}` : `N/A — ${output.unavailableReason}`}</span></div>;
        })}
      </div>
      {inputs ? <Disclosure summary="Archived candidate inputs">
        <div className="space-y-1 pt-1" data-candidate-archived-inputs>
          <p>Prescribed CA0 {inputs.flightModel.axial.ca0} · {inputs.flightModel.axial.providerId} · {inputs.flightModel.axial.inputIdentity}</p>
          <p>Design declaration SHA-256 {inputs.flightModel.declarationVehicleSha256} · declared {inputs.flightModel.declaredAt}</p>
          <p>Horizon {inputs.flightModel.horizonSeconds} s · step {inputs.flightModel.timeStepS} s · Machs {inputs.flightModel.curveMachs.join(', ')}</p>
          <p>Motor station {inputs.derivation.motorAftStationFromNoseM} m (aft fallback, total length {inputs.derivation.totalLengthM} m) · no retained drag calibration was transferred.</p>
          <p>Exact request is retained in the project; sample archive {result.sampleArchivePolicyId} retained {result.retainedSamples.length} of {result.sampleCount} committed samples.</p>
        </div>
      </Disclosure> : <p style={{ color: C.muted }}>Candidate inputs are unavailable on this record. Not reconstructed.</p>}
      <Button small disabled={!entry.inputs} onClick={() => onLoad(useProjectStore.getState().loadSavedRun(entry.id)
        ? `Loaded candidate inputs from ${entry.createdAt}. Run the candidate model explicitly to compute a fresh result. This load can be undone.`
        : 'Apply or discard staged edits and finish or cancel running work before loading saved inputs.')}>Load saved inputs</Button>
    </div>
  );
}

/** Durable scalar comparisons remain historical; loading inputs never runs a case. */
export function SavedRuns() {
  const project = useProjectStore((s) => s.project);
  const motors = useProjectStore((s) => s.motors);
  const mission = useProjectStore((s) => s.mission);
  const shear = useProjectStore((s) => s.shearPa);
  const history = useAnalysisStore((s) => s.history);
  const cases = useMemo(() => exportableProject().cases, [project, motors, mission, shear, history]);
  const [baseline, setBaseline] = useState('');
  const [variant, setVariant] = useState('');
  const [message, setMessage] = useState('');
  const left = cases.find((entry) => entry.id === baseline);
  const right = cases.find((entry) => entry.id === variant);
  const metrics = [...new Set([...Object.keys(left?.summary ?? {}), ...Object.keys(right?.summary ?? {})])]
    .filter((key) => key !== 'inputKey' && key !== 'dispersionSnapshotId');
  const engineComparison = compareEngineIdentity(left?.engineIdentity, right?.engineIdentity);
  const differences = useMemo(() => compareRunInputs(left?.inputs, right?.inputs), [left, right]);
  const canonical = left && right && left.kind === 'flight' && right.kind === 'flight'
    && left.flightOutputs && right.flightOutputs
    ? { baseline: left.flightOutputs, variant: right.flightOutputs } : null;
  const canonicalLanding = canonical
    ? { baseline: recordLanding(canonical.baseline), variant: recordLanding(canonical.variant) } : null;
  return <Tooltip.Provider delayDuration={250}><section aria-label="Saved runs" className="space-y-3 rounded-md p-3.5" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
    <h3 className="text-[13px] font-medium">Saved runs · {cases.length}</h3>
    <Caveat summary="Saved runs include earlier inputs, site, weather and motor metadata; review these before sharing.">
      Projects include earlier run inputs, site settings, weather context and motor source metadata. Review these before sharing. Weather profiles are retained as context; these runs use surface wind only. Raw logs are not copied into run inputs.
    </Caveat>
    {cases.length === 0 ? <p className="text-[12px]">Complete a flight or ensemble to save its inputs with this project.</p> : <>
      {cases.map((entry) => entry.candidateResult !== undefined
        ? <SavedCandidateRun key={entry.id} entry={entry} result={entry.candidateResult} onLoad={setMessage} />
        : <div key={entry.id} data-saved-run-id={entry.id} className="space-y-1 border-t border-white/10 pt-2 text-[11.5px]">
        <div>{entry.kind === 'flight' ? 'Flight' : 'Ensemble'} · {entry.createdAt} · {entry.inputs?.vehicle.name ?? 'Earlier run'}</div>
        <div style={{ color: C.muted }}>{entry.inputs ? `Inputs archived · ${entry.inputs.motorRecord.motor.designation}${entry.inputs.version !== 3 && entry.inputs.ensemble ? ` · ${entry.inputs.ensemble.nRuns} runs · seed ${entry.inputs.ensemble.seed} · ${entry.inputs.ensemble.version}` : ''}` : 'Inputs unavailable (legacy summary)'} · {entry.engineIdentity?.kind === 'production-rust-wasm' && entry.engineIdentity.sha256 ? <span title={`Engine SHA-256 ${entry.engineIdentity.sha256}`}>Engine SHA-256 {entry.engineIdentity.sha256.slice(0, 12)}…</span> : 'Engine identity unknown'}</div>
        {entry.kind === 'monteCarlo' && entry.summary?.outcomePolicy === 'classified-v1' && (
          <div data-outcome-ledger style={{ color: C.muted }}>
            Outcome ledger · {String(entry.summary.runsRequested ?? '?')} requested · {String(entry.summary.runsEligible ?? '?')} supported nominal · {String(entry.summary.runsUnsupportedNominal ?? '?')} unsupported touchdown · {String(entry.summary.runsNonNominal ?? '?')} non-nominal · {String(entry.summary.runsTimeLimit ?? '?')} time-limit · {String(entry.summary.runsComputationalFailure ?? '?')} computational failures. Scenario-only; the footprint uses supported nominal terminals only.
          </div>
        )}
        <div className="break-all font-geist-mono text-[10px]" style={{ color: C.dim }}>Original input key: {entry.inputs?.inputKey ?? entry.summary?.inputKey ?? 'unknown'} (legacy freshness key, not a cryptographic checksum)</div>
        {entry.inputs && entry.inputs.version !== 3 ? <Disclosure summary="Archived assumptions">
          <div className="space-y-1 break-words pt-2" data-archived-assumptions>
            <p>{entry.inputs.version === 2 ? 'Explicit recorded legacy model selection; not physical qualification.' : 'Legacy model implied by archive v1; original selection not recorded.'}</p>
            {entry.inputs.version === 2 && <dl>{Object.entries(entry.inputs.flightModel).map(([key, value]) => <div key={key}><dt className="inline">{key}: </dt><dd className="inline font-geist-mono">{value}</dd></div>)}</dl>}
            <p>Archived invocation: {entry.inputs.engineOptions.launchAltitudeASL} m ASL · surface wind {entry.inputs.engineOptions.windSpeedSurface} m/s from {entry.inputs.engineOptions.windAzimuthDeg}° · time step {entry.inputs.engineOptions.timeStep} s · main deploy {entry.inputs.engineOptions.mainDeployAltitudeAGL} m AGL.</p>
            <p>Moment-arm reporting request: {entry.inputs.reportMomentArmHistory === undefined ? 'not recorded' : String(entry.inputs.reportMomentArmHistory)} (reporting only; no physical-model change).</p>
            <p>Applied drag scale: ×{entry.inputs.engineOptions.dragCdScale} · legacy global powered/coast airframe adjustment, not validated Cd.</p>
            <p>{entry.inputs.dragCalibration ? `Archived calibration: ${describeDragCalibration(entry.inputs.dragCalibration)}. Fit-time eligibility does not establish current applicability.` : 'No calibration artifact recorded.'}</p>
            <p>Motor source: {entry.inputs.motorRecord.provenance.source} · {entry.inputs.motorRecord.provenance.sourceFile ?? 'file not recorded'} · SHA-256 {entry.inputs.motorRecord.provenance.sourceSha256 ?? 'not recorded'}.</p>
            <p>Fin shear modulus: {entry.inputs.finShearModulusPa === undefined ? 'no override recorded; do not infer a present default' : `${entry.inputs.finShearModulusPa} Pa`}.</p>
            <p>{entry.inputs.ensemble ? `Actual sampler: ${entry.inputs.ensemble.version} · ${entry.inputs.ensemble.nRuns} runs · seed ${entry.inputs.ensemble.seed}. Scenario variation is not calibrated probability. Outcome policy: ${entry.summary?.outcomePolicy === 'classified-v1' ? 'classified-v1 (strict supported-nominal footprint; all outcomes retained)' : 'legacy finite-endpoint accounting'}.` : 'No ensemble sampler recorded.'}</p>
            <p>Weather policy: {entry.inputs.weatherModel}. Retained profiles/mission/requested settings are context, not a vertically resolved wind input.</p>
          </div>
        </Disclosure> : <p>Historical model and assumptions unknown: original inputs are unavailable.</p>}
        {entry.kind === 'flight' && <SavedTelemetryPlot entry={entry} />}
        {entry.kind === 'flight' && <Disclosure summary="Recorded flight-model history">
          <MomentArmHistoryPanel history={entry.momentArmHistory} engineIdentity={entry.engineIdentity} inputKey={entry.inputs?.inputKey} historical label={`Saved flight-model history ${entry.id}`} />
        </Disclosure>}
        {entry.kind === 'flight' && (entry.events ? <Disclosure summary={`Recorded events · ${entry.events.length}`}>
          <table className="w-full text-left"><caption className="text-left">Recorded events · historical record, not a fresh simulation</caption>
            <thead><tr><th>Event</th><th>Time (s)</th><th>Altitude (m AGL)</th><th>Engine-reported velocity (m/s)</th></tr></thead>
            <tbody>{entry.events.map((event, i) => <tr key={i}><th className="font-normal">{event.label}</th><td>{String(event.t)}</td><td>{String(event.altitude)}</td><td>{String(event.velocity)}</td></tr>)}</tbody></table>
          <p style={{ color: C.muted }}>Apogee · drogue is the recovery activation marker; the physical peak time is apogeeTimeS in the summary. Main reports vertical speed magnitude; Sampled Max-Q is the largest bounded display sample, not a continuous peak; other events report the engine’s speed at the event. Modeled, not measured.</p>
        </Disclosure> : <p style={{ color: C.muted }}>Recorded events unavailable for this run (not saved, saved before project format 1.9, or the run’s timeline did not pass validation when saved). Not reconstructed.</p>)}
        {entry.kind === 'flight' && entry.flightOutputs && <SavedOutputRecord entry={entry} outputs={entry.flightOutputs} />}
        <Button small disabled={!entry.inputs} onClick={() => setMessage(useProjectStore.getState().loadSavedRun(entry.id)
          ? `Loaded ${entry.createdAt}. ${entry.kind === 'flight' ? 'Run a flight' : entry.inputs && entry.inputs.version !== 3 && entry.inputs.ensemble ? `Run an ensemble of ${entry.inputs.ensemble.nRuns}` : 'Run an ensemble'} to compute a fresh result with the current engine. This load can be undone.`
          : 'Apply or discard staged edits and finish or cancel running work before loading saved inputs.')}>Load saved inputs</Button>
      </div>)}
      <div className="flex flex-wrap gap-3 text-[12px]">
        {([{ label: 'Saved baseline', value: baseline, change: setBaseline }, { label: 'Saved variant', value: variant, change: setVariant }]).map((picker) => <label key={picker.label}>{picker.label} <Select ariaLabel={picker.label} value={picker.value} onChange={picker.change} style={{ background: 'rgba(0,0,0,0.2)' }}><option value="">Select run</option>{cases.map((entry) => <option key={entry.id} value={entry.id}>{entry.kind} · {entry.createdAt}</option>)}</Select></label>)}
      </div>
      {left && right && (left.candidateResult !== undefined || right.candidateResult !== undefined) && (
        <div className="overflow-auto" role="status">
          <p className="text-[11.5px]" style={{ color: C.changed }}>Candidate saved records are displayed individually. Cross-model result deltas are unsupported for candidate/legacy comparison here; archived input differences remain historical, not a cause or accuracy claim.</p>
        </div>
      )}
      {left && right && left.candidateResult === undefined && right.candidateResult === undefined && <div className="overflow-auto"><p className="text-[11.5px]">{engineComparison === 'same' ? 'Same recorded engine binary. Differences may reflect any changed inputs or settings.' : engineComparison === 'different' ? 'Recorded engine identities differ. Differences cannot be attributed to the design alone.' : 'Engine identity comparison unknown. Differences cannot be attributed to the design alone.'}</p>{left.kind !== right.kind && <p>Different run kinds: flight and ensemble summaries are not comparable design deltas.</p>}
        <section aria-label="Saved input comparison" className="my-3 space-y-2 text-[11.5px]">
          <h4>Archived input differences · not a cause attribution or accuracy test</h4>
          {differences === null ? <p>Original inputs are unavailable for one or both runs. Input comparison is unknown; today's project is not substituted.</p> : differences.map(group => <Disclosure key={group.name} summary={`${group.name} · ${group.total === 0 ? 'no recorded differences' : `${group.total} differences`}`}>
            <p>{group.note}</p>
            {group.total > 0 && <table className="w-full text-left"><caption>{group.name} · archived values</caption><thead><tr><th>Field path</th><th>Baseline</th><th>Variant</th></tr></thead><tbody>{group.rows.map(row => <tr key={row.path}><th className="break-all font-normal">{row.path}</th><td className="max-w-sm break-all align-top">{row.baseline}</td><td className="max-w-sm break-all align-top">{row.variant}</td></tr>)}</tbody></table>}
            {group.omitted > 0 && <p>{group.omitted} additional field differences not shown. Export the project for complete original archives.</p>}
          </Disclosure>)}
        </section>
        {canonical ? <table className="w-full text-left text-[11.5px]" aria-label="Canonical flight outputs"><caption className="text-left">Canonical flight outputs · saved SI values shown in the selected units · dictionary {canonical.baseline.dictionaryRevision} · deltas use the live Flight policy</caption>
          <thead><tr><th>Output</th><th>Baseline</th><th>Variant</th><th>Variant − baseline</th></tr></thead>
          <tbody>{SAVED_FLIGHT_OUTPUT_IDS.map((id) => {
            const a = canonical.baseline.outputs[id], b = canonical.variant.outputs[id];
            if (!a && !b) return null;
            const label = SAVED_FLIGHT_OUTPUT_LABELS[id];
            const baselineLanding = canonicalLanding?.baseline ?? { available: true } as LandingAvailability;
            const variantLanding = canonicalLanding?.variant ?? { available: true } as LandingAvailability;
            const landingId = LANDING_OUTPUTS.has(id);
            const deltaBlocked = !a || !b ? null
              : !a.available ? a.unavailableReason ?? 'baseline unavailable'
              : !b.available ? b.unavailableReason ?? 'variant unavailable'
              : landingId && !baselineLanding.available ? baselineLanding.reason
              : landingId && !variantLanding.available ? variantLanding.reason
              : null;
            const unitMismatch = a && b && (a.unit !== b.unit || a.unit !== SAVED_FLIGHT_OUTPUT_UNITS[id]);
            return <tr key={id} data-output-id={id}><th className="font-normal">{label}</th>
              <td><SavedOutputValue id={id} output={a} landing={baselineLanding} /></td>
              <td><SavedOutputValue id={id} output={b} landing={variantLanding} /></td>
              <td>{!a || !b ? '—' : deltaBlocked ? <span title={deltaBlocked}>N/A</span>
                : unitMismatch ? <span title={`Stored units differ or are not canonical (${a.unit} vs ${b.unit}; expected ${SAVED_FLIGHT_OUTPUT_UNITS[id]}); delta withheld`}>—</span>
                : <DeltaChip now={b.value as number} was={a.value as number} kind={kindOf(b.unit)} better={BETTER[id] ?? 'none'} />}</td></tr>;
          })}</tbody></table>
          : <>
            <p className="text-[11.5px]" style={{ color: C.muted }}>Historical stored-unit summary. No canonical per-output dictionary was archived for one or both records (introduced with project format 1.11), so this comparison is not upgraded, unit-converted or backfilled.</p>
            <table className="w-full text-left text-[11.5px]"><caption className="text-left">Historical summaries · saved values, not a fresh simulation</caption><thead><tr><th>Metric (stored units)</th><th>Baseline</th><th>Variant</th><th>Variant − baseline</th></tr></thead><tbody>{metrics.map((metric) => {
            const a = left.summary?.[metric], b = right.summary?.[metric];
            const landing = metric === 'landingSpeedMps' || metric === 'landingEnergyJ';
            const la = landing ? savedLanding(left) : null, lb = landing ? savedLanding(right) : null;
            const cell = (value: typeof a, availability: LandingAvailability | null) => availability && !availability.available ? `N/A — ${availability.reason}` : value == null ? 'unknown' : String(value);
            const unavailable = la && !la.available ? la : lb && !lb.available ? lb : null;
            return <tr key={metric}><th className="font-normal">{metric}</th><td>{cell(a, la)}</td><td>{cell(b, lb)}</td><td>{left.kind !== right.kind ? '—' : unavailable ? `N/A — ${unavailable.reason}` : typeof a === 'number' && typeof b === 'number' && Number.isFinite(b - a) ? (b - a).toPrecision(6) : '—'}</td></tr>;
          })}</tbody></table>
          </>}
      </div>}
    </>}
    {message && <p role="status" className="text-[12px]">{message}</p>}
  </section></Tooltip.Provider>;
}
