/**
 * Explicit candidate model surface: opt-in selection, the exact declaration
 * form, and the candidate result/query/curve presentation. This UI never
 * presents a candidate result as a legacy pass or a predicted apogee.
 */
import { useEffect, useMemo, useState } from 'react';
import { useWS, consoleActions } from '../store';
import { useProjectStore } from '../../state/project';
import { CANDIDATE_DEFAULTS, CANDIDATE_REFUSAL, candidatePreflight, declarationVehicleSha256 } from '../../application/candidate';
import {
  CANDIDATE_FLIGHT_MODEL, LEGACY_FLIGHT_MODEL, isCandidateFlightModel, parseCandidateFlightModel,
  resolveFlightModel, type CandidateFlightModelSelection,
} from '../../application/flightModel';
import { parseEnvironmentSelection } from '../../application/candidate';
import { useSessionStore } from '../../state/session';
import {
  CANDIDATE_OUTPUT_LABELS, candidateLandingAvailability, candidateOutputDictionary, isVersionedCurves,
  type CandidateCurvePoint, type CandidateEquivalence, type CandidateQuery, type CandidateResultArchive,
} from '../../application/candidateResult';

/** Curve-comparison label for both archive generations. */
function curveMatchLabel(equivalence: CandidateEquivalence): string {
  if ('curveComparison' in equivalence) {
    return equivalence.curveComparison.status === 'compared'
      ? String(equivalence.curveComparison.matchesReferenceSample)
      : `not applicable (${equivalence.curveComparison.reasonId})`;
  }
  return String(equivalence.curveMatchesReferenceSample);
}
import type { EngineIdentity } from '../../engine/identity';
import { C } from '../kit/theme';
import { Button } from '../kit/Fields';
import { Checkbox } from '../kit/Controls';
import { Disclosure } from '../kit/Disclosure';
import { Note } from '../evidence/studioKit';

const PLACEHOLDER_SHA = '0'.repeat(64);

interface FormState {
  ca0: string;
  providerId: string;
  inputIdentity: string;
  horizon: string;
  timeStep: string;
  curveMachs: string;
  provenance: string;
  quadratureAbsolute: string;
  quadratureRelative: string;
  quadraturePanels: string;
  tangentOgive: boolean;
  conicalTransition: boolean;
  declarations: Record<'sharpPhysicalTip' | 'circularAxisymmetricBody' | 'smoothSlenderProfile'
    | 'identicalEquallySpacedThinUncantedFins' | 'noOtherExternalFeaturesOrUnmodeledInterferences'
    | 'sourceRepresentsCompleteExternalGeometry', boolean>;
}

const DECLARATION_LABELS: Record<keyof FormState['declarations'], string> = {
  sharpPhysicalTip: 'Sharp physical tip',
  circularAxisymmetricBody: 'Circular axisymmetric body',
  smoothSlenderProfile: 'Smooth slender profile',
  identicalEquallySpacedThinUncantedFins: 'Identical, equally spaced, thin, uncanted fins',
  noOtherExternalFeaturesOrUnmodeledInterferences: 'No other external features or unmodeled interferences',
  sourceRepresentsCompleteExternalGeometry: 'Source represents the complete external geometry',
};

function initialForm(): FormState {
  return {
    ca0: '',
    providerId: '',
    inputIdentity: '',
    horizon: String(CANDIDATE_DEFAULTS.horizonSeconds),
    timeStep: String(CANDIDATE_DEFAULTS.timeStepS),
    curveMachs: CANDIDATE_DEFAULTS.curveMachs.join(', '),
    provenance: '',
    quadratureAbsolute: String(CANDIDATE_DEFAULTS.quadrature.absoluteToleranceM3),
    quadratureRelative: String(CANDIDATE_DEFAULTS.quadrature.relativeTolerance),
    quadraturePanels: String(CANDIDATE_DEFAULTS.quadrature.maxPanels),
    tangentOgive: false,
    conicalTransition: false,
    declarations: {
      sharpPhysicalTip: false,
      circularAxisymmetricBody: false,
      smoothSlenderProfile: false,
      identicalEquallySpacedThinUncantedFins: false,
      noOtherExternalFeaturesOrUnmodeledInterferences: false,
      sourceRepresentsCompleteExternalGeometry: false,
    },
  };
}

function numberOf(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function curvesOf(value: string): number[] | null {
  const parts = value.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length === 0 || parts.length > 64) return null;
  const values = parts.map(Number);
  if (!values.every((n) => Number.isFinite(n) && n >= 0 && n < 0.8)) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.some((n, i) => i > 0 && n <= sorted[i - 1])) return null;
  return sorted;
}

function formSelection(form: FormState): CandidateFlightModelSelection | null {
  const ca0 = numberOf(form.ca0);
  const horizon = numberOf(form.horizon);
  const timeStep = numberOf(form.timeStep);
  const absolute = numberOf(form.quadratureAbsolute);
  const relative = numberOf(form.quadratureRelative);
  const panels = numberOf(form.quadraturePanels);
  const curves = curvesOf(form.curveMachs);
  if (ca0 === null || horizon === null || timeStep === null || absolute === null || relative === null
    || panels === null || curves === null || !Number.isInteger(panels)) return null;
  try {
    return parseCandidateFlightModel({
      ...CANDIDATE_FLIGHT_MODEL,
      axial: { ca0, providerId: form.providerId, inputIdentity: form.inputIdentity },
      declarations: {
        provenance: form.provenance.trim().length > 0 ? form.provenance : 'candidate declaration draft',
        sharpPhysicalTip: true,
        circularAxisymmetricBody: true,
        smoothSlenderProfile: true,
        identicalEquallySpacedThinUncantedFins: true,
        noOtherExternalFeaturesOrUnmodeledInterferences: true,
        sourceRepresentsCompleteExternalGeometry: true,
      },
      ogiveInterpretation: form.tangentOgive ? 'tangentOgive' : null,
      transitionInterpretation: form.conicalTransition ? 'conical' : null,
      quadrature: { absoluteToleranceM3: absolute, relativeTolerance: relative, maxPanels: panels },
      declarationVehicleSha256: PLACEHOLDER_SHA,
      declaredAt: new Date().toISOString(),
      horizonSeconds: horizon,
      timeStepS: timeStep,
      curveMachs: curves,
    });
  } catch {
    return null;
  }
}

function Field({ label, value, onChange, type = 'text', ariaLabel }: {
  label: string; value: string; onChange: (value: string) => void; type?: 'text' | 'number'; ariaLabel?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5 text-[11px]">
      <span style={{ color: C.muted }}>{label}</span>
      <input aria-label={ariaLabel ?? label} type={type} value={value} onChange={(event) => onChange(event.target.value)}
        className="w-full min-w-0 rounded p-1 font-geist-mono text-[11.5px]" style={{ background: C.sunken, border: `1px solid ${C.line}` }} />
    </label>
  );
}

/** Session-scoped E1 atmosphere document: imported, shown, cleared, never guessed. */
function EnvironmentProfileSection() {
  const profile = useSessionStore((state) => state.environmentProfile);
  const setProfile = useSessionStore((state) => state.setEnvironmentProfile);
  const [error, setError] = useState<string | null>(null);
  const read = async (file: File): Promise<void> => {
    setError(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      setProfile(parseEnvironmentSelection(parsed));
    } catch (err) {
      setProfile(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const validity = profile === null ? null : profile.profile.validity as { fromUtcUnixS: number; untilUtcUnixS: number };
  const source = profile === null ? null : profile.profile.source as { identity?: string; description?: string };
  const knots = profile === null ? null : profile.profile.knots as unknown[];
  return (
    <div className="space-y-1 rounded p-2" style={{ border: `1px solid ${C.line}`, background: C.sunken }} data-environment-profile={profile === null ? 'none' : 'loaded'}>
      <div className="flex items-center gap-2"><strong>E1 environment profile</strong>
        <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'rgba(245,181,68,.12)', color: C.warn }}>optional</span>
      </div>
      {profile === null ? (
        <p style={{ color: C.muted }}>No profile selected: the run uses the retained atmosphere, surface wind and the vehicle site altitude. Importing a prepared E1 environment selection replaces the atmosphere and the wind field for this session.</p>
      ) : (
        <div className="space-y-0.5 font-geist-mono text-[10px]" style={{ color: C.dim }}>
          <div data-profile-source>Source: {source?.identity ?? 'unknown'}</div>
          <div>Validity UTC: {new Date((validity?.fromUtcUnixS ?? 0) * 1000).toISOString()} → {new Date((validity?.untilUtcUnixS ?? 0) * 1000).toISOString()}</div>
          <div>Launch declared: {new Date(profile.launchTimeUtcUnixS * 1000).toISOString()} at {profile.launchAltitudeGeometricMslM} m geometric MSL</div>
          <div>Datum: {profile.verticalDatumIdentity} · knots: {knots?.length ?? 0}</div>
          <div style={{ color: C.changed }}>This run takes its pad altitude from the declaration, not the vehicle site, and requires 0 m/s surface wind.</div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded px-2 py-1 text-[11px]" style={{ border: `1px solid ${C.line}` }}>
          Import E1 profile ({profile === null ? 'none loaded' : 'replace'})
          <input type="file" accept=".json,application/json" aria-label="Import E1 environment profile" className="hidden"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void read(file); event.target.value = ''; }} />
        </label>
        {profile !== null && <Button small onClick={() => { setProfile(null); setError(null); }}>Clear profile</Button>}
      </div>
      {error && <div role="status" style={{ color: C.bad }}>{error}</div>}
    </div>
  );
}

export function CandidateModelPanel() {
  const s = useWS();
  const project = useProjectStore((state) => state.project);
  const selection = resolveFlightModel(project.flightModel);
  const candidate = isCandidateFlightModel(selection) ? selection : null;
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [declarationState, setDeclarationState] = useState<'checking' | 'current' | 'changed'>('checking');
  const motor = s.motor();
  const launch = project.workspace.launch;

  useEffect(() => {
    if (!candidate) { setDeclarationState('checking'); return; }
    let live = true;
    declarationVehicleSha256(s.design.vehicle).then((sha) => {
      if (live) setDeclarationState(sha === candidate.declarationVehicleSha256 ? 'current' : 'changed');
    }).catch(() => { if (live) setDeclarationState('changed'); });
    return () => { live = false; };
  }, [candidate, s.design.vehicle]);

  const draft = useMemo(() => formSelection(form), [form]);
  const sessionProfile = useSessionStore((state) => state.environmentProfile);
  const preflight = useMemo(() => {
    if (!draft) return [];
    return candidatePreflight(s.design.vehicle, draft, motor, launch, undefined, sessionProfile);
  }, [draft, s.design.vehicle, motor, launch, sessionProfile]);
  const allDeclared = Object.values(form.declarations).every(Boolean);
  const required = [
    { value: form.ca0, label: 'Prescribed CA0' },
    { value: form.providerId, label: 'Axial provider ID' },
    { value: form.inputIdentity, label: 'Axial source/power identity' },
    { value: form.provenance, label: 'Declaration provenance' },
  ].filter((item) => item.value.trim().length === 0);
  const canEnable = draft !== null && allDeclared && required.length === 0 && preflight.length === 0 && !busy;

  const enable = async (): Promise<void> => {
    setError(null);
    if (!allDeclared || required.length > 0 || preflight.length > 0 || draft === null) {
      setError('The candidate declarations are incomplete or the design is unsupported.');
      return;
    }
    setBusy(true);
    try {
      const epoch = useProjectStore.getState().projectEpoch;
      const sha = await declarationVehicleSha256(s.design.vehicle);
      if (epoch !== useProjectStore.getState().projectEpoch) throw new Error('The project changed while preparing the candidate selection; nothing was enabled.');
      if (!draft) throw new Error('Repair the candidate declaration form.');
      const descriptor = parseCandidateFlightModel({
        ...draft,
        declarationVehicleSha256: sha,
        declaredAt: new Date().toISOString(),
      });
      consoleActions.setFlightModel(descriptor, 'Enable experimental candidate model');
      setDeclarationState('current');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const reacknowledge = async (): Promise<void> => {
    if (!candidate) return;
    setError(null);
    setBusy(true);
    try {
      const epoch = useProjectStore.getState().projectEpoch;
      const sha = await declarationVehicleSha256(s.design.vehicle);
      if (epoch !== useProjectStore.getState().projectEpoch) throw new Error('The project changed while re-acknowledging; nothing was enabled.');
      const descriptor = parseCandidateFlightModel({ ...candidate, declarationVehicleSha256: sha, declaredAt: new Date().toISOString() });
      consoleActions.setFlightModel(descriptor, 'Re-acknowledge candidate declarations');
      setDeclarationState('current');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (candidate) {
    return (
      <section aria-label="Candidate model" className="space-y-2 rounded-md p-3 text-[11.5px]" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-2">
          <strong>Experimental candidate model</strong>
          <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'rgba(245,181,68,.12)', color: C.warn }}>unqualified</span>
        </div>
        <div style={{ color: C.muted }}>{candidate.modelId} · {candidate.compositionId}</div>
        <div className="font-geist-mono text-[10px] break-all" style={{ color: C.dim }}>Design declaration SHA-256: {candidate.declarationVehicleSha256}</div>
        <div className="font-geist-mono text-[10px] break-all" style={{ color: C.dim }}>Prescribed CA0: {candidate.axial.ca0} · {candidate.axial.providerId}</div>
        <div className="font-geist-mono text-[10px] break-all" style={{ color: C.dim }}>Horizon {candidate.horizonSeconds} s · step {candidate.timeStepS} s · Machs {candidate.curveMachs.join(', ')}</div>
        {declarationState === 'changed' && <Note tone="warn" role="status">{CANDIDATE_REFUSAL.modelChanged}</Note>}
        {declarationState === 'changed' && <Button small disabled={busy} onClick={() => void reacknowledge()}>Re-acknowledge current design</Button>}
        {error && <div role="status" style={{ color: C.bad }}>{error}</div>}
        <EnvironmentProfileSection />
        <Button small disabled={busy} onClick={() => consoleActions.setFlightModel(LEGACY_FLIGHT_MODEL, 'Disable experimental candidate model')}>Disable candidate model</Button>
        <p style={{ color: C.dim }}>Preview, legacy drag/stability, Monte Carlo, copilot flight checks and drag calibration are refused while this model is selected. No legacy result is substituted.</p>
      </section>
    );
  }

  return (
    <section aria-label="Candidate model" className="space-y-2 rounded-md p-3 text-[11.5px]" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2"><strong>Use experimental candidate model</strong>
        <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'rgba(245,181,68,.12)', color: C.warn }}>opt-in · unqualified</span>
      </div>
      <p style={{ color: C.muted }}>The accepted runtime requires an explicit prescribed CA0, source/power declaration and physical support acknowledgments. Nothing is pre-filled as a measurement. A flagged motor mount is refused by the accepted adapter.</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Prescribed CA0 (nonnegative)" value={form.ca0} type="number" onChange={(v) => setForm({ ...form, ca0: v })} />
        <Field label="Axial provider ID" value={form.providerId} onChange={(v) => setForm({ ...form, providerId: v })} />
        <Field label="Axial source and power condition" value={form.inputIdentity} onChange={(v) => setForm({ ...form, inputIdentity: v })} />
        <Field label="Horizon (s)" value={form.horizon} type="number" onChange={(v) => setForm({ ...form, horizon: v })} />
        <Field label="Time step (s)" value={form.timeStep} type="number" onChange={(v) => setForm({ ...form, timeStep: v })} />
        <Field label="Curve Machs (comma separated, < 0.8)" value={form.curveMachs} onChange={(v) => setForm({ ...form, curveMachs: v })} />
        <Field label="Quadrature absolute (m3)" value={form.quadratureAbsolute} type="number" onChange={(v) => setForm({ ...form, quadratureAbsolute: v })} />
        <Field label="Quadrature relative" value={form.quadratureRelative} type="number" onChange={(v) => setForm({ ...form, quadratureRelative: v })} />
        <Field label="Quadrature max panels" value={form.quadraturePanels} type="number" onChange={(v) => setForm({ ...form, quadraturePanels: v })} />
      </div>
      <label className="flex flex-col gap-0.5 text-[11px]"><span style={{ color: C.muted }}>Declaration provenance (required; state that no measurement is implied)</span>
        <textarea aria-label="Declaration provenance" value={form.provenance} onChange={(event) => setForm({ ...form, provenance: event.target.value })}
          className="min-h-[48px] w-full rounded p-1 text-[11.5px]" style={{ background: C.sunken, border: `1px solid ${C.line}` }} />
      </label>
      <div className="grid grid-cols-1 gap-1">
        {(Object.keys(form.declarations) as Array<keyof FormState['declarations']>).map((key) => (
          <Checkbox key={key} ariaLabel={DECLARATION_LABELS[key]} checked={form.declarations[key]}
            onChange={(checked) => setForm({ ...form, declarations: { ...form.declarations, [key]: checked } })} className="text-[11px]">
            {DECLARATION_LABELS[key]}
          </Checkbox>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px]">
        <Checkbox ariaLabel="Interpret ogive as tangent ogive" checked={form.tangentOgive}
          onChange={(checked) => setForm({ ...form, tangentOgive: checked })} className="text-[11px]">Interpret ogive as tangent ogive (required when present)</Checkbox>
        <Checkbox ariaLabel="Interpret transitions as conical" checked={form.conicalTransition}
          onChange={(checked) => setForm({ ...form, conicalTransition: checked })} className="text-[11px]">Interpret transitions as conical (required when present)</Checkbox>
      </div>
      {required.length > 0 && <div style={{ color: C.muted }}>Required: {required.map((item) => item.label).join(', ')}.</div>}
      {draft === null && <div role="status" style={{ color: C.bad }}>The candidate declaration form is incomplete or has invalid values.</div>}
      {preflight.length > 0 && <div role="status" style={{ color: C.bad }}>{preflight.map((issue) => issue.componentId ? `${issue.componentId}: ${issue.message}` : issue.message).join('; ')}</div>}
      {error && <div role="status" style={{ color: C.bad }}>{error}</div>}
      <Button primary small disabled={!canEnable} onClick={() => void enable()}>Enable experimental candidate model</Button>
      <p style={{ color: C.dim }}>Enabling is one undoable project change. It does not alter the vehicle, motor, legacy cases or a retained calibration.</p>
    </section>
  );
}

function formatNumber(value: number | string | null): string {
  if (value === null) return 'N/A';
  if (typeof value === 'string') return value;
  return Number.isInteger(value) ? String(value) : value.toPrecision(8);
}

function Wrench({ value }: { value: { cfBody: [number, number, number]; cmBody: [number, number, number] } | null }) {
  if (value === null) return <span style={{ color: C.dim }}>not reported (null)</span>;
  return <span className="font-geist-mono text-[10.5px]">CF [{value.cfBody.join(', ')}] · CM [{value.cmBody.join(', ')}]</span>;
}

function QueryView({ query }: { query: CandidateQuery }) {
  return (
    <div className="space-y-1 text-[11px]">
      <p style={{ color: C.muted }}>Origin: {query.origin} · t {query.timeS} s · {query.computationalStatus} · {query.applicability}</p>
      <p>Flow: {query.flow === null ? 'not reported (null)' : `alpha ${query.flow.alphaDeg} deg · beta ${query.flow.betaDeg} deg · incidence ${query.flow.incidenceDeg} deg`}</p>
      <p>Datum: <Wrench value={query.coefficients.datum} /> · CG: <Wrench value={query.coefficients.cg} /></p>
      <p>CP: {query.cp === null ? 'not reported (null)' : `station ${query.cp.stationFromNoseM ?? 'null'} m · kappa ${query.cp.kappaC ?? 'null'}${query.cp.reason === null ? '' : ` · ${query.cp.reason}`}`}</p>
      <p>Static force/moment: [{query.staticForceBodyN.join(', ')}] N / [{query.staticMomentCgBodyNm.join(', ')}] Nm · rate moment [{query.rateMomentBodyNm.join(', ')}] Nm</p>
      <p>Canopy drag: {query.canopyDragBodyN === null ? 'not reported (null)' : `[${query.canopyDragBodyN.join(', ')}] N`} · aero force/moment: [{query.aeroForceBodyN.join(', ')}] N / [{query.aeroMomentCgBodyNm.join(', ')}] Nm</p>
      <p>Wind coefficients: {query.windCoefficients === null ? 'not reported (null)' : `CD ${query.windCoefficients.cdWind} · CL ${query.windCoefficients.clWind} · CY ${query.windCoefficients.cyWind}`}</p>
      <p>Normal derivatives: {query.normalDerivatives === null ? 'not reported (null)' : `C ${query.normalDerivatives.cPerRad}/rad · J ${query.normalDerivatives.jMPerRad} m/rad`}</p>
      {query.unavailable.length > 0 && <ul className="list-disc pl-4">{query.unavailable.map((item) => <li key={`${item.quantity}:${item.reason}`}>{item.quantity}: {item.reason}</li>)}</ul>}
    </div>
  );
}

function CurveRow({ point }: { point: CandidateCurvePoint }) {
  return (
    <tr>
      <td>{point.mach}</td>
      <td>{point.computationalStatus}</td>
      <td>{point.windCoefficients === null ? '—' : point.windCoefficients.cdWind}</td>
      <td>{point.windCoefficients === null ? '—' : point.windCoefficients.clWind}</td>
      <td>{point.normalDerivatives === null ? '—' : point.normalDerivatives.cPerRad}</td>
      <td>{point.normalDerivatives === null ? '—' : point.normalDerivatives.jMPerRad}</td>
      <td>{point.cp === null ? 'null' : `${point.cp.stationFromNoseM ?? 'null'}${point.cp.reason === null ? '' : ` (${point.cp.reason})`}`}</td>
      <td>{point.unavailable.length === 0 ? '—' : point.unavailable.map((u) => u.quantity).join(', ')}</td>
    </tr>
  );
}

function SamplePlot({ result }: { result: CandidateResultArchive }) {
  const points = result.retainedSamples;
  if (points.length < 2) return <p style={{ color: C.muted }}>No retained display samples to plot. Not reconstructed.</p>;
  const width = 640, height = 180, pad = 10;
  const first = points[0].timeS, last = points[points.length - 1].timeS;
  const altitudes = points.map((point) => point.positionM[2]);
  const min = Math.min(...altitudes), max = Math.max(...altitudes);
  const spanT = last - first || 1, spanZ = max - min || 1;
  const path = points.map((point) => {
    const x = pad + ((point.timeS - first) / spanT) * (width - 2 * pad);
    const y = height - pad - ((point.positionM[2] - min) / spanZ) * (height - 2 * pad);
    return `${x},${y}`;
  }).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-3xl rounded bg-black/20" role="img" aria-label="Candidate retained altitude samples">
        <desc>Altitude over time from retained display samples only; not a complete trajectory.</desc>
        <polyline points={path} fill="none" stroke={C.accent} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <p style={{ color: C.muted }}>Retained {points.length} of {result.sampleCount} committed samples · last {last} s · display subset, no interpolation.</p>
    </div>
  );
}

export function CandidateResultPanel({ result, engineIdentity }: { result: CandidateResultArchive; engineIdentity?: EngineIdentity }) {
  const outputs = candidateOutputDictionary(result);
  const landing = candidateLandingAvailability(result);
  return (
    <section aria-label="Candidate result" className="space-y-3 p-3 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'rgba(245,181,68,.12)', color: C.warn }}>Experimental · unqualified</span>
        <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'rgba(110,231,247,.08)', color: C.muted }}>{result.termination} · {result.computationalCompletion}</span>
        <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'rgba(255,255,255,.04)', color: C.muted }}>Dynamic model UNKNOWN</span>
      </div>
      <p style={{ color: C.muted }}>Model {result.identities.compositionId} · adapter {result.identities.adapterId}. Computational completion is not empirical or numerical qualification.</p>
      <p className="font-geist-mono text-[10px] break-all" style={{ color: C.dim }}>Input/model digest: {result.contentIdentity.sha256}</p>
      <p className="font-geist-mono text-[10px] break-all" style={{ color: C.dim }}>Executed WASM: {engineIdentity?.kind === 'production-rust-wasm' ? engineIdentity.sha256 ?? 'SHA-256 unavailable' : engineIdentity?.kind ?? 'identity unavailable'}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-3">
        {Object.entries(outputs).map(([id, output]) => (
          <div key={id} className="flex min-w-0 flex-col">
            <span className="truncate text-[10.5px]" style={{ color: C.muted }} title={CANDIDATE_OUTPUT_LABELS[id as keyof typeof CANDIDATE_OUTPUT_LABELS]}>{CANDIDATE_OUTPUT_LABELS[id as keyof typeof CANDIDATE_OUTPUT_LABELS]}</span>
            <span className="font-geist-mono text-[12px]">
              {output.available ? `${formatNumber(output.value)}${output.unit ? ` ${output.unit}` : ''}` : <span style={{ color: C.changed }}>N/A — {output.unavailableReason}</span>}
            </span>
          </div>
        ))}
      </div>
      {!landing.available && <Note tone="warn" role="status">{landing.reason}. No landing value is shown or zero-filled.</Note>}
      {result.apogeeEvent === null && <Note role="status">No qualified apogee event was reported. The observed-prefix maximum above is not a predicted apogee.</Note>}
      {result.apogeeEvent !== null && <p>Qualified apogee event: t {result.apogeeEvent.timeS} s · {result.apogeeEvent.altitudeAglM} m AGL.</p>}
      <Disclosure summary={`Recorded events · ${result.events.length}`}>
        <table className="mt-1 w-full text-left text-[11px]"><thead><tr><th>Time</th><th>Event</th><th>Altitude</th><th>Velocity</th></tr></thead>
          <tbody>{result.events.map((event, i) => <tr key={`${event.timeS}:${i}`}><td>{event.timeS}</td><td>{event.name}</td><td>{event.altitudeAglM}</td><td>{event.velocityMps}</td></tr>)}</tbody></table>
        <p style={{ color: C.muted }}>{result.events.map((event) => event.description).join(' · ')}</p>
      </Disclosure>
      <Disclosure summary="Same-state query">
        <QueryView query={result.query} />
        <p style={{ color: C.muted }}>Query matches reference sample: {String(result.equivalence.queryMatchesReferenceSample)} · curve match: {curveMatchLabel(result.equivalence)}.</p>
      </Disclosure>
      <Disclosure summary={!isVersionedCurves(result.curves)
        ? `Static curves · ${result.curves.points.length} points`
        : result.curves.status === 'computed'
          ? `Static curves · ${result.curves.points?.length ?? 0} points`
          : 'Static curves · not applicable'}>
        {isVersionedCurves(result.curves) && result.curves.points === null ? <p style={{ color: C.changed }}>
          Not applicable: {result.curves.notApplicable?.reason} ({result.curves.notApplicable?.reasonId}) at the recorded reference
          (t {result.curves.notApplicable?.referenceTimeS} s, drogue {String(result.curves.notApplicable?.drogueDeployed)},
          main {String(result.curves.notApplicable?.mainDeployed)}). No curve values are substituted.
        </p> : <>
          <table className="mt-1 w-full text-left text-[10.5px]"><thead><tr><th>Mach</th><th>Status</th><th>CD</th><th>CL</th><th>C/rad</th><th>J m/rad</th><th>CP</th><th>Unavailable</th></tr></thead>
            <tbody>{(isVersionedCurves(result.curves) ? result.curves.points ?? [] : result.curves.points).map((point, i) => <CurveRow key={`${point.mach}:${i}`} point={point} />)}</tbody></table>
        </>}
      </Disclosure>
      <Disclosure summary="Retained trajectory"><SamplePlot result={result} /></Disclosure>
      {result.profileEnvironment && (
        <Disclosure data-candidate-profile-run summary="E1 profile environment">
          <div className="space-y-0.5 pt-1 font-geist-mono text-[10px]" style={{ color: C.dim }}>
            <div>Source: {result.profileEnvironment.profileSourceIdentity}</div>
            <div>Model: {result.profileEnvironment.environmentModelId}</div>
            <div>Datum: {result.profileEnvironment.verticalDatumIdentity} · launch {new Date(result.profileEnvironment.launchTimeUtcUnixS * 1000).toISOString()} at {result.profileEnvironment.launchAltitudeGeometricMslM} m</div>
            <div>Query observation exact: {String(result.profileEnvironment.queryObservationExact)} · curve source shared: {String(result.profileEnvironment.curveSourceShared)}</div>
            {result.profileEnvironment.axialSourceNote && <div>{result.profileEnvironment.axialSourceNote}</div>}
          </div>
        </Disclosure>
      )}
      <Disclosure summary="Limits and support">
        <p>Mach &lt; {result.supportPolicy.machUpperExclusive} · incidence ≤ {result.supportPolicy.maxIncidenceDeg} deg.</p>
        <ul className="list-disc pl-4">{result.supportPolicy.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        <ul className="list-disc pl-4">{result.limitations.map((note) => <li key={note}>{note}</li>)}</ul>
        <p style={{ color: C.muted }}>Geometry {result.model.geometry.identity} · dry mass {result.model.mechanical.dryMassKg} kg · motor station {result.model.mechanical.motorAftStationFromNoseM} m.</p>
      </Disclosure>
    </section>
  );
}

export function CandidateRefusalNotice({ title, message }: { title: string; message: string }) {
  return <Note tone="warn" role="status"><strong>{title}</strong> {message}</Note>;
}
