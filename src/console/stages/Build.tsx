import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Download, FileText } from 'lucide-react';
import type { RocketVehicle } from '../../core/types';
import type { MotorSpec } from '../../propulsion/motorDatabase';
import { exportRkt } from '../../formats/rktExport';
import { exportStep, tessellateVehicle } from '../../formats/stepExport';
import { exportStlBinary } from '../../formats/stlExport';
import { exportBlueprintSvg } from '../../formats/blueprint';
import { exportToEng, exportToRse } from '../../formats/engParser';
import { writeProject, type ProjectEnvelope } from '../../formats/projectJson';
import { stringifyReportJson } from '../../formats/reportJson';
import { describeEngPreview, describeRsePreview, describeRktPreview, describeStepPreview, describeStlPreview, slugify, type OmissionPreview } from '../../formats/exportPreview';
import { exportToOrk } from '../../formats/orkParser';
import { renderBlueprintPng } from '../../formats/blueprintPng';
import { exportKml } from '../../sim/waiverContainment';
import { currentRunKey, useWS } from '../store';
import { describeDragCalibration } from '../../application/dragCalibration';
import { stableStringify } from '../../application/caseResolver';
import { exportableProject } from '../../state/project';
import { useChanges, useFlightQualification, useFreshness } from '../hooks';
import { candidateOutputDictionary } from '../../application/candidateResult';
import { isCandidateFlightModel, resolveFlightModel } from '../../application/flightModel';
import { useGates } from './Verify';
import type { Result, FlightRun } from '../data/contract';
import { C } from '../kit/theme';
import { Button, InspectorSection, Segmented } from '../kit/Fields';
import { Disclosure } from '../kit/Disclosure';
import { StageHeader } from './common';
import { saveExport } from '../../io/bundle';
import { projectArchiveBudget, projectFileName } from '../../io/files';
import { shortcutLabel } from '../../lib/platform';
import { SavedRuns } from './SavedRuns';
import { ModelStatusPanel } from '../evidence/ModelStatusPanel';
import { flightOutputDictionary, OUTPUT_DICTIONARY_REVISION } from '../data/recoveryResults';
import { landingAvailability } from '../../application/flightLanding';

interface ExportSnapshot { vehicle: RocketVehicle; motor: MotorSpec; project: ProjectEnvelope; run: FlightRun | null; trace: string | null; preview: OmissionPreview | null }
interface Format {
  id: string;
  label: string;
  ext: string;
  what: string;
  preview?: (v: RocketVehicle, m: MotorSpec) => OmissionPreview;
  make: (v: RocketVehicle, m: MotorSpec, snapshot: ExportSnapshot) => string | Uint8Array | ArrayBuffer | Promise<string | Uint8Array | ArrayBuffer>;
}

const NOMINAL_TOUCHDOWN_REQUIRED = 'A recorded nominal touchdown is required; a final trajectory sample is not a landing.';

/** KML additionally requires explicit terminal metadata; legacy absent metadata is not enough. */
function hasKmlNominalTouchdown(run: FlightRun | null | undefined): run is FlightRun {
  return run?.terminationReason === 'touchdown' && landingAvailability(run).available;
}

const FORMATS: Format[] = [
  { id: 'project', label: 'Astraea project', ext: 'astraea.json', what: 'Full parametric design, motors, workspace and evidence.', make: (_v, _m, snapshot) => {
    const text = writeProject(snapshot.project);
    const budget = projectArchiveBudget(text, projectFileName(snapshot.vehicle.name));
    if (!budget.ok) throw new Error(budget.message);
    return text;
  } },
  { id: 'rkt', label: 'RockSim', ext: 'rkt', what: 'For RockSim and tools that read .rkt.', preview: (v) => describeRktPreview(v), make: (v) => exportRkt(v) },
  { id: 'ork', label: 'OpenRocket', ext: 'ork', what: 'Parametric OpenRocket archive.', make: (v) => exportToOrk(v) },
  { id: 'step', label: 'STEP (CAD)', ext: 'step', what: 'Faceted solids for CAD layout and fit checks.', preview: (v) => describeStepPreview(v), make: (v) => exportStep(tessellateVehicle(v).solids) },
  { id: 'stl', label: 'STL (print)', ext: 'stl', what: 'Mesh for 3D printing nose cones and fin cans.', preview: (v) => describeStlPreview(v), make: (v) => exportStlBinary(tessellateVehicle(v).solids) },
  { id: 'svg', label: 'Blueprint', ext: 'svg', what: 'Dimensioned side drawing.', make: (v) => exportBlueprintSvg(v) },
  { id: 'eng', label: 'Motor curve', ext: 'eng', what: 'The motor in use, as RASP .eng.', preview: (_v, m) => describeEngPreview(m), make: (_v, m) => exportToEng(m) },
  { id: 'rse', label: 'RockSim motor', ext: 'rse', what: 'The reviewed motor as RSE XML.', preview: (_v, m) => describeRsePreview(m), make: (_v, m) => exportToRse(m) },
  { id: 'png', label: 'Print blueprint', ext: 'png', what: 'Light-theme blueprint raster for printing.', make: async (v) => (await renderBlueprintPng(exportBlueprintSvg(v, { theme: 'light' }))).arrayBuffer() },
  { id: 'kml', label: 'Flight track', ext: 'kml', what: 'Native ENU flight path and touchdown; local-origin KML.', make: (_v, _m, snapshot) => {
    const run = snapshot.run;
    if (!hasKmlNominalTouchdown(run)) throw new Error(NOMINAL_TOUCHDOWN_REQUIRED);
    const points = run.telemetry;
    if (!points?.length) throw new Error('No reviewed native telemetry to export.');
    const last = points[points.length - 1].position;
    return exportKml([{ x: last.x, y: last.y }], points.map((p) => p.position));
  } },
];

type Check = { label: string; state: 'ok' | 'warn' | 'bad'; detail: string };


function useExportCheck(runKey: string | null) {
  const s = useWS();
  const qualification = useFlightQualification();
  const gates = useGates();
  const changes = useChanges();
  const run = s.committed?.run;
  const candidate = s.committed?.candidate;
  const candidateSelected = isCandidateFlightModel(resolveFlightModel(s.design.flightModel));
  const fresh = useFreshness('flight');
  if (candidateSelected || candidate !== undefined) {
    const checks: Check[] = [
      { label: 'Design revision', state: 'ok', detail: `r${s.rev}${candidate ? ' · candidate result recorded' : ' · no candidate run yet'}` },
      { label: 'Candidate selection current', state: candidate === undefined ? 'bad' : fresh.state === 'current' ? 'ok' : 'warn',
        detail: candidate === undefined ? 'No candidate result to export.' : fresh.state === 'current' ? 'Current selection and inputs.' : `Candidate result is ${fresh.state}; run again for a current result.` },
      { label: 'Qualification', state: 'warn', detail: 'Experimental candidate · unqualified; no empirical or numerical qualification.' },
      { label: 'Verify gates', state: 'warn', detail: 'Not applicable: the candidate report has no legacy PASS/FAIL gates.' },
      { label: 'Confidence', state: 'warn', detail: 'Candidate outputs are unqualified observations; observed-prefix peaks are not predicted apogee.' },
    ];
    const trace = (fmt: Format | null) => ({
      astraeaTrace: 1,
      file: fmt ? `${slugify(s.design.vehicle.name)}.${fmt.ext}` : null,
      format: fmt?.label ?? null,
      exportedAt: new Date().toISOString(),
      vehicle: { id: s.design.vehicle.id, name: s.design.vehicle.name, revision: s.rev },
      motor: s.motor()?.designation ?? s.design.motorId,
      flightModel: candidateSelected ? 'native-candidate-static-rate/1.0.0' : null,
      candidate: candidate ? {
        status: candidate.status,
        termination: candidate.termination,
        computationalCompletion: candidate.computationalCompletion,
        empiricalQualification: candidate.empiricalQualification,
        dynamicQualification: candidate.dynamicQualification,
        contentIdentity: candidate.contentIdentity,
        engineIdentity: s.committed?.engineIdentity,
        outputs: candidateOutputDictionary(candidate),
        sampleCount: candidate.sampleCount,
        retainedSampleCount: candidate.retainedSamples.length,
      } : null,
      legacySimulation: null,
      changesSinceRun: changes.map((c) => ({ what: c.label, from: c.from, to: c.to })),
      checks: checks.map((c) => ({ check: c.label, state: c.state, detail: c.detail })),
    });
    return { checks, trace };
  }
  const current = run !== undefined && runKey !== null && run.inputKey === runKey;
  const results: Result[] = run ? Object.values(run.summary).filter((v): v is Result => typeof v === 'object') : [];
  const ex = results.filter((r) => r.confidence === 'extrapolated').length, un = results.filter((r) => r.confidence === 'unknown').length;
  const fails = gates.filter((g) => g.status === 'fail'), unknowns = gates.filter((g) => g.status === 'unknown');
  const checks: Check[] = [
    { label: 'Design revision', state: 'ok', detail: `r${s.rev}${run ? ` · last run r${run.rev}` : ''}` },
    {
      label: 'Simulation matches the design',
      state: !run ? 'bad' : current ? 'ok' : qualification.status === 'offline' || qualification.status === 'invalid' ? 'bad' : 'warn',
      detail: !run ? 'No run yet.' : current ? 'Current.' : `${qualification.label}${changes.length > 0 ? ` (${changes.length} change${changes.length > 1 ? 's' : ''} since run r${run.rev})` : ''} Re-run with ${shortcutLabel('run')}.`,
    },
    { label: 'Flight qualification', state: qualification.isPass ? 'ok' : qualification.status === 'fail' || qualification.status === 'invalid' || qualification.status === 'offline' ? 'bad' : 'warn', detail: qualification.label },
    { label: 'Verify gates', state: !gates.length ? 'warn' : fails.length ? 'bad' : unknowns.length ? 'warn' : 'ok', detail: !gates.length ? 'No gates evaluated.' : fails.length ? `${fails.length} failing: ${fails.map((g) => g.label).join(', ')}` : unknowns.length ? `${unknowns.length} unknown` : `All ${gates.length} pass.` },
    { label: 'Confidence', state: !run || un || ex ? 'warn' : 'ok', detail: !run ? 'No flight results to qualify.' : ex || un ? `${ex} extrapolated, ${un} unknown flight results.` : `All results modeled or better${run.dragCalibration ? `; drag calibrated (${describeDragCalibration(run.dragCalibration)}), not a validation of the model` : ''}.` }
  ];
  const trace = (fmt: Format | null) => ({
    astraeaTrace: 1,
    file: fmt ? `${slugify(s.design.vehicle.name)}.${fmt.ext}` : null,
    format: fmt?.label ?? null,
    exportedAt: new Date().toISOString(),
    vehicle: { id: s.design.vehicle.id, name: s.design.vehicle.name, revision: s.rev },
    motor: s.motor()?.designation ?? s.design.motorId,
    simulation: run ? { run: run.rev, current, qualification: qualification.label, validity: run.summary.validity, enveloped: run.summary.enveloped,
      offNominalExcursion: run.summary.offNominalExcursion, engine: run.manifest,
      inputKey: run.inputKey, engineIdentity: run.engineIdentity,
      events: run.events, terminationReason: run.terminationReason ?? null, landingNominal: run.summary.landingNominal,
      sampledMaxQ: run.sampledMaxQ ?? null,
      outputDictionary: { revision: OUTPUT_DICTIONARY_REVISION, document: 'docs/internal/output-dictionary.md', units: 'canonical SI; null when unavailable; no display rounding' },
      outputs: flightOutputDictionary(run),
      ...(run.momentArmHistory ? { momentArmHistory: run.momentArmHistory } : {}) } : null,
    // What the reported numbers were calibrated against, and whether the project still carries it.
    dragCalibration: run?.dragCalibration
      ? { appliedToResults: { scale: run.dragCalibration.scale, fittedCd: run.dragCalibration.fittedCd, modelCd: run.dragCalibration.modelCd, rmseN: run.dragCalibration.rmseN, logFile: run.dragCalibration.source.fileName, logSha256: run.dragCalibration.source.sha256Hex, window: run.dragCalibration.window, appliedAt: run.dragCalibration.appliedAt }, stillApplied: s.design.dragCalibration !== undefined && stableStringify(s.design.dragCalibration) === stableStringify(run.dragCalibration), note: 'Fitted to one flight of this rocket; not a validation of the model.' }
      : null,
    changesSinceRun: changes.map((c) => ({ what: c.label, from: c.from, to: c.to })),
    gates: gates.map((g) => ({ id: g.id, status: g.status, value: Number.isFinite(g.value.value) ? g.value.value : null,
      unit: g.value.unit, confidence: g.value.confidence, reason: g.reason,
      ...(g.value.reason === undefined ? {} : { valueReason: g.value.reason }), threshold: g.threshold })),
    confidence: { extrapolated: ex, unknown: un, note: 'Levels are derived from the resolved aero model, the run validity/envelope flags, mass overrides and the shear-modulus source (see the Console adapter).' },
    checks: checks.map((c) => ({ check: c.label, state: c.state, detail: c.detail }))
  });
  return { checks, trace };
}

export function BuildStage() {
  const s = useWS();
  const motor = s.motor();
  // The current case key, read in render so the export refusals re-evaluate
  // when any run input moves (an option edit leaves `vehicle` and the
  // committed record identical, so a memo keyed on those would go stale).
  const runKey = currentRunKey();
  const { checks, trace } = useExportCheck(runKey);
  const [withTrace, setWithTrace] = useState<'yes' | 'no'>('yes');
  const [done, setDone] = useState<string | null>(null);
  const [review, setReview] = useState<{ format: Format; snapshot: ExportSnapshot } | null>(null);
  const blocked = checks.some((c) => c.state === 'bad');
  const warned = checks.some((c) => c.state !== 'ok');
  const previews = useMemo(
    () => Object.fromEntries(FORMATS.map((f) => {
      const refused = (reason: string): OmissionPreview => ({
        title: f.label,
        filename: `${slugify(s.design.vehicle.name)}.${f.ext}`,
        refused: [reason],
        omissions: [],
        canExport: false,
      });
      if (motor === null) return [f.id, refused('No motor resolves for this project.')];
      if (f.id === 'kml' && isCandidateFlightModel(resolveFlightModel(s.design.flightModel))) {
        return [f.id, refused('KML export needs a current legacy telemetry run; candidate cases have no such record.')];
      }
      const kmlRun = s.committed?.run;
      if (f.id === 'kml' && (!kmlRun || !kmlRun.telemetry.length || kmlRun.inputKey !== runKey || kmlRun.summary.validity !== 'PASS')) return [f.id, refused('A current, valid native flight with telemetry is required.')];
      if (f.id === 'kml' && !hasKmlNominalTouchdown(kmlRun)) return [f.id, refused(NOMINAL_TOUCHDOWN_REQUIRED)];
      try { return [f.id, f.preview?.(s.design.vehicle, motor) ?? null]; }
      catch (e) { return [f.id, refused((e as Error).message)]; }
    })),
    [s.design.vehicle, s.design.flightModel, motor, s.committed, runKey],
  );

  const go = async () => {
    if (!review) return;
    const { format: f, snapshot } = review;
    try {
      const name = `${slugify(snapshot.vehicle.name)}.${f.ext}`;
      const data = await f.make(snapshot.vehicle, snapshot.motor, snapshot);
      const result = await saveExport(name, data, snapshot.trace);
      setDone(result.via === 'cancelled' ? `Save cancelled for ${name}.` : result.offered);
      setReview(null);
    } catch (e) { setDone(`Export failed: ${(e as Error).message}`); }
  };

  const Icon = ({ st }: { st: Check['state'] }) => st === 'ok' ? <CheckCircle2 size={14} color={C.ok} /> : st === 'warn' ? <AlertTriangle size={14} color={C.warn} /> : <XCircle size={14} color={C.bad} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StageHeader stage="build" title="Build" sub="Export is the exit at the end of the loop. Every file can carry a trace of what was checked." />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 thin-scroll">
        <SavedRuns />
        <ModelStatusPanel />
        <section className="rounded-md" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
          <div className="flex items-center px-3.5 py-2.5 text-[12.5px] font-medium" style={{ borderBottom: `1px solid ${C.line}` }}>Pre-export check<span className="ml-auto text-[11.5px] font-normal" style={{ color: blocked ? C.bad : warned ? C.warn : C.ok }}>{blocked ? 'Issues to look at' : warned ? 'Exportable, with warnings' : 'Ready'}</span></div>
          {checks.map((c) => (
            <div key={c.label} className="grid grid-cols-[18px_200px_1fr] items-center gap-2 px-3.5 py-2 text-[12.5px]" style={{ borderBottom: `1px solid ${C.line}` }}>
              <Icon st={c.state} /><span>{c.label}</span><span style={{ color: C.muted }}>{c.detail}</span>
            </div>
          ))}
          <div className="flex items-center gap-3 px-3.5 py-2.5 text-[12px]" style={{ color: C.muted }}>
            Write a trace file with each export <Segmented size="sm" value={withTrace} onChange={setWithTrace} options={[{ value: 'yes', label: 'On' }, { value: 'no', label: 'Off' }]} />
            <span style={{ color: C.dim }}>{withTrace === 'yes' ? 'On: each export is saved as a .zip holding the file and its trace.' : 'Off: each export is saved as the plain file.'}</span>
            {(blocked || warned) && <span style={{ color: C.dim }}>Warnings are recorded in the trace.</span>}
          </div>
        </section>

        <section className="rounded-md" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
          {FORMATS.map((f) => {
            const p = previews[f.id] as OmissionPreview | null;
            const refused = p?.refused ?? [];
            return (
              <div key={f.id} data-format={f.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5" style={{ borderBottom: `1px solid ${C.line}` }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[13px]">{f.label}<span className="font-geist-mono text-[11px]" style={{ color: C.dim }}>.{f.ext}</span></div>
                  <div className="text-[11.5px]" style={{ color: C.muted }}>{f.what}</div>
                  {refused.map((r) => <div key={r} className="mt-0.5 text-[11.5px]" style={{ color: C.bad }}>{r}</div>)}
                  {p?.omissions.map((o) => <div key={o} className="mt-0.5 flex gap-1.5 text-[11.5px]" style={{ color: C.muted }}><AlertTriangle size={11} color={C.warn} className="mt-[2px] shrink-0" />{o}</div>)}
                </div>
                <Button small disabled={refused.length > 0 || motor === null} onClick={() => motor && setReview({ format: f, snapshot: { vehicle: structuredClone(s.design.vehicle), motor: structuredClone(motor), project: structuredClone(exportableProject()), run: s.committed?.run ?? null, preview: p, trace: withTrace === 'yes' ? stringifyReportJson(trace(f)) : null } })} title={refused.length ? 'The exporter refuses this design' : undefined}><Download size={12} />Review export</Button>
              </div>
            );
          })}
          {review && <section aria-label="Reviewed export" className="space-y-2 border-t border-white/10 p-4"><h3>{review.format.label} · {review.snapshot.vehicle.name}</h3><p className="text-[12px]">Confirm exports this reviewed snapshot, even if you edit the live vehicle or change motors.</p>{review.snapshot.preview?.omissions.map((note) => <p key={note} className="text-[11px]">{note}</p>)}<Button onClick={() => void go()}>Confirm export</Button><Button onClick={() => setReview(null)}>Cancel export</Button></section>}
          {done && <div className="px-3.5 py-2 text-[12px]" style={{ color: done.startsWith('Export failed') ? C.bad : C.ok }}>{done.startsWith('Export failed') ? done : done.startsWith('Save cancelled') ? done : `Saved ${done}.`}</div>}
        </section>

      </div>
    </div>
  );
}

export function BuildInspector() {
  const { trace } = useExportCheck(currentRunKey());
  const preview = trace(null);
  const summary = preview as unknown as {
    file?: string | null;
    format?: string | null;
    vehicle?: { name?: string; revision?: number };
    motor?: string;
    simulation?: { run?: number; current?: boolean; validity?: string } | null;
    candidate?: { status?: string; computationalCompletion?: string } | null;
    gates?: Array<{ status?: string }>;
    checks?: Array<{ check?: string; state?: string }>;
  };
  const gates = summary.gates ?? [];
  const pass = gates.filter((gate) => gate.status === 'pass').length;
  const fails = gates.filter((gate) => gate.status === 'fail').length;
  const unknown = gates.filter((gate) => gate.status === 'unknown').length;
  const current = summary.simulation
    ? summary.simulation.current === true
    : summary.checks?.find((check) => check.check === 'Candidate selection current')?.state === 'ok';
  const rows: Array<[string, ReactNode]> = [
    ['File', summary.file ?? 'named from the vehicle at export'],
    ['Format', summary.format ?? 'chosen when you review an export'],
    ['Vehicle', <>{summary.vehicle?.name ?? 'unknown'} · r{summary.vehicle?.revision ?? '?'}</>],
    ['Motor', summary.motor ?? 'not recorded'],
    ['Run', summary.simulation?.run === undefined ? (summary.candidate ? `candidate · ${summary.candidate.status ?? 'recorded'}` : 'not recorded') : `r${summary.simulation.run}`],
    ['Current', current ? 'Yes' : 'No'],
    ['Validity', summary.simulation?.validity ?? (summary.candidate ? `candidate · ${summary.candidate.computationalCompletion ?? 'completion not recorded'}` : 'not recorded')],
    ['Gates', gates.length === 0 ? 'no gate checks recorded' : `${pass} pass · ${fails} fail${unknown ? ` · ${unknown} unknown` : ''}`],
  ];
  return (
    <div className="flex h-full flex-col overflow-auto thin-scroll" style={{ background: C.panel }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}><FileText size={14} color={C.accent} /><div><div className="text-[11px]" style={{ color: C.dim }}>Written beside each export</div><div className="text-[14px] font-medium">Trace file</div></div></div>
      <InspectorSection title="Preview">
        <div className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-0.5 text-[11.5px]" data-trace-summary>
          {rows.map(([label, value]) => <Fragment key={label}>
            <span style={{ color: C.muted }}>{label}</span>
            <span className="min-w-0 break-words">{value}</span>
          </Fragment>)}
        </div>
        <Disclosure className="mt-2" summaryClassName="text-[11px]" summaryStyle={{ color: C.muted }} summary="Show trace JSON">
          <pre className="mt-2 overflow-auto rounded-md p-2.5 font-geist-mono text-[10.5px] leading-[1.5] whitespace-pre-wrap" style={{ background: C.sunken, color: C.muted }}>{stringifyReportJson(preview)}</pre>
        </Disclosure>
      </InspectorSection>
    </div>
  );
}
