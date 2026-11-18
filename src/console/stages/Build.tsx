import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Download, FileText } from 'lucide-react';
import { printableNoseSolid, describePrintableNose, startingShoulderLengthM } from '../../formats/printableNose';
import type { BlueprintExportOptions } from '../../formats/blueprint';
import { liftoffStability } from '../data/liftoffStability';
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
import { currentRunKey, runName, useWS } from '../store';
import { describeDragCalibration } from '../../application/dragCalibration';
import { stableStringify } from '../../application/caseResolver';
import { exportableProject } from '../../state/project';
import { useChanges, useFlightQualification, useFreshness, useStabilityOf, useUnits } from '../hooks';
import { candidateOutputDictionary } from '../../application/candidateResult';
import { isCandidateFlightModel, resolveFlightModel } from '../../application/flightModel';
import { useGates } from './Verify';
import type { Result, FlightRun } from '../data/contract';
import { C } from '../kit/theme';
import { Button, InspectorSection, NumberField, Segmented } from '../kit/Fields';
import { Disclosure } from '../kit/Disclosure';
import { StageHeader } from './common';
import { saveExport } from '../../io/bundle';
import { projectArchiveBudget, projectFileName } from '../../io/files';
import { shortcutLabel } from '../../lib/platform';
import { SavedRuns } from './SavedRuns';
import { ModelStatusPanel } from '../evidence/ModelStatusPanel';
import { flightOutputDictionary, OUTPUT_DICTIONARY_REVISION } from '../data/recoveryResults';
import { landingAvailability } from '../../application/flightLanding';

/** Per-export inputs captured when the export is reviewed, so Confirm writes exactly what was shown. */
interface ExportInputs {
  /** Shoulder length for the printable nose cone, metres; null when the nose cannot be printed. */
  shoulderLengthM: number | null;
  /** Blueprint label units and CG/CP marks (or the reason they are missing). */
  blueprint: Pick<BlueprintExportOptions, 'units' | 'marks'>;
}
interface ExportSnapshot { vehicle: RocketVehicle; motor: MotorSpec; project: ProjectEnvelope; run: FlightRun | null; trace: string | null; preview: OmissionPreview | null; inputs: ExportInputs }

/** What the user wants to make. The Build stage is organised by these, most common first. */
type Purpose = 'keep' | 'drawing' | 'print' | 'cad' | 'sim' | 'motor' | 'track';
const PURPOSES: { id: Purpose; title: string }[] = [
  { id: 'keep', title: 'Keep or share the project' },
  { id: 'drawing', title: 'Drawing' },
  { id: 'print', title: '3D printing' },
  { id: 'cad', title: 'CAD' },
  { id: 'sim', title: 'Other rocket simulators' },
  { id: 'motor', title: 'Motor file' },
  { id: 'track', title: 'Flight track' },
];

interface Format {
  id: string;
  purpose: Purpose;
  label: string;
  ext: string;
  /** Inserted before the extension, e.g. "-nose-cone". */
  suffix?: string;
  what: string;
  preview?: (v: RocketVehicle, m: MotorSpec, inputs: ExportInputs) => OmissionPreview;
  make: (v: RocketVehicle, m: MotorSpec, snapshot: ExportSnapshot) => string | Uint8Array | ArrayBuffer | Promise<string | Uint8Array | ArrayBuffer>;
}

/** The file name an export is offered under (and recorded in its trace). */
function fileNameOf(vehicleName: string, f: Pick<Format, 'ext' | 'suffix'>): string {
  return `${slugify(vehicleName)}${f.suffix ?? ''}.${f.ext}`;
}

const NOMINAL_TOUCHDOWN_REQUIRED = 'A recorded nominal touchdown is required; a final trajectory sample is not a landing.';

/** KML additionally requires explicit terminal metadata; legacy absent metadata is not enough. */
function hasKmlNominalTouchdown(run: FlightRun | null | undefined): run is FlightRun {
  return run?.terminationReason === 'touchdown' && landingAvailability(run).available;
}

const blueprintOf = (v: RocketVehicle, snapshot: ExportSnapshot, theme: 'light' | 'dark'): string =>
  exportBlueprintSvg(v, { theme, ...snapshot.inputs.blueprint, exportedAt: new Date() });

const FORMATS: Format[] = [
  { id: 'project', purpose: 'keep', label: 'Save project file', ext: 'astraea.json', what: 'The whole design: parts, motors, launch settings and saved runs. Opens in Astraea on any computer.', make: (_v, _m, snapshot) => {
    const text = writeProject(snapshot.project);
    const budget = projectArchiveBudget(text, projectFileName(snapshot.vehicle.name));
    if (!budget.ok) throw new Error(budget.message);
    return text;
  } },
  { id: 'svg', purpose: 'drawing', label: 'Drawing (SVG)', ext: 'svg', what: 'Dimensioned side view in your units: part sizes, fin dimensions and positions, and CG/CP when the stability estimate is ready.', make: (v, _m, snapshot) => blueprintOf(v, snapshot, 'dark') },
  { id: 'png', purpose: 'drawing', label: 'Drawing for printing (PNG)', ext: 'png', what: 'The same drawing on white, as an image for paper.', make: async (v, _m, snapshot) => (await renderBlueprintPng(blueprintOf(v, snapshot, 'light'))).arrayBuffer() },
  { id: 'stl-nose', purpose: 'print', label: 'Nose cone to print (STL)', ext: 'stl', suffix: '-nose-cone', what: 'Hollow nose cone with a shoulder that slips into the tube behind it, in millimetres.',
    preview: (v, _m, inputs) => {
      const notes = describePrintableNose(v, inputs.shoulderLengthM ?? Number.NaN);
      return { title: 'Nose cone (STL)', filename: fileNameOf(v.name, { ext: 'stl', suffix: '-nose-cone' }), refused: notes.refused, omissions: notes.omissions, canExport: notes.refused.length === 0 };
    },
    make: (v, _m, snapshot) => {
      if (snapshot.inputs.shoulderLengthM === null) throw new Error('This design has no nose cone that can be printed.');
      return exportStlBinary([printableNoseSolid(v, { shoulderLengthM: snapshot.inputs.shoulderLengthM }).solid], { units: 'mm' });
    } },
  { id: 'stl', purpose: 'print', label: 'Outer shape (STL)', ext: 'stl', what: 'Solid outer shape of the whole rocket, for previews and renders. Not hollow, so not a part to print.', preview: (v) => describeStlPreview(v), make: (v) => exportStlBinary(tessellateVehicle(v).solids) },
  { id: 'step', purpose: 'cad', label: 'CAD model (STEP)', ext: 'step', what: 'Outer shape as faceted solids for CAD layout and fit checks.', preview: (v) => describeStepPreview(v), make: (v) => exportStep(tessellateVehicle(v).solids) },
  { id: 'ork', purpose: 'sim', label: 'OpenRocket', ext: 'ork', what: 'Parametric OpenRocket archive.', make: (v) => exportToOrk(v) },
  { id: 'rkt', purpose: 'sim', label: 'RockSim', ext: 'rkt', what: 'For RockSim and tools that read .rkt.', preview: (v) => describeRktPreview(v), make: (v) => exportRkt(v) },
  { id: 'eng', purpose: 'motor', label: 'RASP motor file', ext: 'eng', what: 'The motor in use, for other simulators.', preview: (_v, m) => describeEngPreview(m), make: (_v, m) => exportToEng(m) },
  { id: 'rse', purpose: 'motor', label: 'RockSim motor file', ext: 'rse', what: 'The motor in use, as RockSim XML.', preview: (_v, m) => describeRsePreview(m), make: (_v, m) => exportToRse(m) },
  { id: 'kml', purpose: 'track', label: 'Flight track (KML)', ext: 'kml', what: 'The simulated flight path and touchdown, around a local origin.', make: (_v, _m, snapshot) => {
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
      file: fmt ? fileNameOf(s.design.vehicle.name, fmt) : null,
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
  const fails = gates.filter((g) => g.status === 'fail'), unknowns = gates.filter((g) => g.status === 'unknown'), invalid = gates.filter((g) => g.status === 'invalid'), cautions = gates.filter((g) => g.status === 'caution');
  const checks: Check[] = [
    { label: 'Design revision', state: 'ok', detail: `Saved revision ${s.rev}${run ? ` · last run ${runName(run)} flew revision ${run.rev}` : ''}` },
    {
      label: 'Simulation matches the design',
      state: !run ? 'bad' : current ? 'ok' : qualification.status === 'offline' || qualification.status === 'invalid' ? 'bad' : 'warn',
      detail: !run ? 'No run yet.' : current ? 'Current.' : `${qualification.label}${changes.length > 0 ? ` (${changes.length} change${changes.length > 1 ? 's' : ''} since ${runName(run)})` : ''} Re-run with ${shortcutLabel('run')}.`,
    },
    { label: 'Flight qualification', state: qualification.isPass ? 'ok' : qualification.status === 'fail' || qualification.status === 'invalid' || qualification.status === 'offline' ? 'bad' : 'warn', detail: qualification.label },
    { label: 'Verify checks', state: !gates.length ? 'warn' : fails.length ? 'bad' : unknowns.length || invalid.length || cautions.length ? 'warn' : 'ok', detail: !gates.length ? 'No checks evaluated.' : fails.length ? `${fails.length} failed: ${fails.map((g) => g.label).join(', ')}` : invalid.length ? `${invalid.length} not judged: the run is invalid` : unknowns.length ? `${unknowns.length} unknown: ${unknowns.map((g) => g.label).join(', ')}` : cautions.length ? `None failed; ${cautions.length} caution: ${cautions.map((g) => g.label).join(', ')}` : `All ${gates.length} passed.` },
    { label: 'Confidence', state: !run || un || ex ? 'warn' : 'ok', detail: !run ? 'No flight results to qualify.' : ex || un ? `${ex} extrapolated, ${un} unknown flight results.` : `All results modeled or better${run.dragCalibration ? `; drag calibrated (${describeDragCalibration(run.dragCalibration)}), not a validation of the model` : ''}.` }
  ];
  const trace = (fmt: Format | null) => ({
    astraeaTrace: 1,
    file: fmt ? fileNameOf(s.design.vehicle.name, fmt) : null,
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

/** How an export ended: written, handed to the browser as a download, cancelled, or failed. */
type ExportOutcome = { kind: 'ok' | 'cancelled' | 'error'; message: string };

const OUTCOME_COLOR: Record<ExportOutcome['kind'], string> = { ok: C.ok, cancelled: C.muted, error: C.bad };

/**
 * CG (with the motor loaded) and CP for the drawing, from the stability
 * estimate of the design being exported, or the reason they are missing. The
 * drawing never shows a mark the estimate did not produce.
 */
function useBlueprintMarks(vehicle: RocketVehicle, aeroModel: Parameters<typeof useStabilityOf>[1], motor: MotorSpec | null): NonNullable<BlueprintExportOptions['marks']> {
  const { breakdown, geometry, error, loading } = useStabilityOf(vehicle, aeroModel);
  return useMemo(() => {
    if (breakdown === null) {
      return { cg: null, cp: null, unavailable: loading ? 'the stability estimate had not finished when the export was reviewed' : error ?? 'no stability estimate is available for this design' };
    }
    const lift = liftoffStability(breakdown, vehicle, motor, geometry);
    const cgOk = Number.isFinite(lift.loadedCg.value) && lift.loadedCg.confidence !== 'unknown';
    const cpOk = Number.isFinite(breakdown.cp.value) && breakdown.cp.confidence !== 'unknown';
    const reasons = [
      cgOk ? null : lift.loadedCg.reason ?? 'the loaded CG is unknown',
      cpOk ? null : breakdown.cp.reason ?? 'the CP is unknown',
    ].filter((r): r is string => r !== null);
    return {
      cg: cgOk ? { xM: lift.loadedCg.value, detail: lift.motorDesignation ? `with ${lift.motorDesignation} loaded` : 'no motor loaded' } : null,
      cp: cpOk ? { xM: breakdown.cp.value } : null,
      ...(reasons.length > 0 ? { unavailable: reasons.join('; ') } : {}),
    };
  }, [breakdown, geometry, error, loading, vehicle, motor]);
}

/**
 * Build: the files you came for come first, grouped by what you want to do,
 * each a plain file unless you ask for the evidence bundle. The pre-export
 * check, the model status and the saved runs follow, one click from the
 * summary at the top.
 */
export function BuildStage() {
  const s = useWS();
  const motor = s.motor();
  const units = useUnits();
  // The current case key, read in render so the export refusals re-evaluate
  // when any run input moves (an option edit leaves `vehicle` and the
  // committed record identical, so a memo keyed on those would go stale).
  const runKey = currentRunKey();
  const { checks, trace } = useExportCheck(runKey);
  // A plain file is the default; the file + trace .zip is the option.
  const [packaging, setPackaging] = useState<'plain' | 'bundle'>('plain');
  const [done, setDone] = useState<ExportOutcome | null>(null);
  const reviewRef = useRef<HTMLElement>(null);
  const [review, setReview] = useState<{ format: Format; snapshot: ExportSnapshot } | null>(null);
  const startingShoulder = useMemo(() => startingShoulderLengthM(s.design.vehicle), [s.design.vehicle]);
  const [shoulderChoice, setShoulderChoice] = useState<number | null>(null);
  const shoulderLengthM = startingShoulder === null ? null : shoulderChoice ?? startingShoulder;
  const marks = useBlueprintMarks(s.design.vehicle, s.design.aeroModel, motor);
  const inputs = useMemo<ExportInputs>(() => ({ shoulderLengthM, blueprint: { units, marks } }), [shoulderLengthM, units, marks]);
  const blocked = checks.some((c) => c.state === 'bad');
  const warned = checks.some((c) => c.state !== 'ok');
  useEffect(() => {
    if (review && reviewRef.current) {
      reviewRef.current.scrollIntoView?.({ block: 'nearest' });
      reviewRef.current.focus();
    }
  }, [review]);
  const previews = useMemo(
    () => Object.fromEntries(FORMATS.map((f) => {
      const refused = (reason: string): OmissionPreview => ({
        title: f.label,
        filename: fileNameOf(s.design.vehicle.name, f),
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
      try { return [f.id, f.preview?.(s.design.vehicle, motor, inputs) ?? null]; }
      catch (e) { return [f.id, refused((e as Error).message)]; }
    })),
    [s.design.vehicle, s.design.flightModel, motor, s.committed, runKey, inputs],
  );

  const go = async () => {
    if (!review) return;
    const { format: f, snapshot } = review;
    try {
      const name = fileNameOf(snapshot.vehicle.name, f);
      const data = await f.make(snapshot.vehicle, snapshot.motor, snapshot);
      const result = await saveExport(name, data, snapshot.trace);
      // A dismissed dialog is not a save; a download is only handed to the
      // browser, so it never claims the file was written.
      setDone(result.via === 'cancelled'
        ? { kind: 'cancelled', message: `Save cancelled — no file was written for ${name}.` }
        : result.via === 'browser'
          ? { kind: 'ok', message: `Downloaded ${result.offered}: check your browser’s downloads folder.` }
          : { kind: 'ok', message: `Saved ${result.offered}.` });
      setReview(null);
    } catch (e) { setDone({ kind: 'error', message: `Export failed: ${(e as Error).message}` }); }
  };

  const startReview = (f: Format, p: OmissionPreview | null) => {
    if (!motor) return;
    setDone(null);
    setReview({ format: f, snapshot: {
      vehicle: structuredClone(s.design.vehicle), motor: structuredClone(motor), project: structuredClone(exportableProject()),
      run: s.committed?.run ?? null, preview: p, trace: packaging === 'bundle' ? stringifyReportJson(trace(f)) : null,
      inputs: structuredClone(inputs),
    } });
  };

  const Icon = ({ st }: { st: Check['state'] }) => st === 'ok' ? <CheckCircle2 size={14} color={C.ok} /> : st === 'warn' ? <AlertTriangle size={14} color={C.warn} /> : <XCircle size={14} color={C.bad} />;
  const checkSummary = blocked ? 'issues to look at' : warned ? 'exportable, with warnings' : 'ready';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StageHeader stage="build" title="Build" sub="Make the files you need: a project file to keep, drawings, and print or CAD files." />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 thin-scroll">
        <section aria-label="Export files" className="rounded-md" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-[12.5px]" style={{ borderBottom: `1px solid ${C.line}` }}>
            <span className="font-medium">What do you want to make?</span>
            <a href="#pre-export-check" className="ml-auto text-[11.5px] hover:underline" style={{ color: blocked ? C.bad : warned ? C.warn : C.ok }}>Pre-export check: {checkSummary}</a>
          </div>
          <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-[12px]" style={{ color: C.muted, borderBottom: `1px solid ${C.line}` }}>
            Save as <Segmented size="sm" ariaLabel="Save as" value={packaging} onChange={setPackaging} options={[{ value: 'plain', label: 'Plain file' }, { value: 'bundle', label: 'File + evidence (.zip)' }]} />
            <span style={{ color: C.dim }}>{packaging === 'plain' ? 'Just the file.' : 'A .zip with the file and a trace of what was checked: the pre-export check, the run and its gates.'}</span>
          </div>
          {PURPOSES.map((group) => (
            <div key={group.id} role="group" aria-label={group.title}>
              <div className="px-3.5 pb-1 pt-3 text-[10.5px] font-medium uppercase tracking-[0.12em]" style={{ color: C.dim }}>{group.title}</div>
              {FORMATS.filter((f) => f.purpose === group.id).map((f) => {
                const p = previews[f.id] as OmissionPreview | null;
                const refused = p?.refused ?? [];
                return (
                  <Fragment key={f.id}>
                    <div data-format={f.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5" style={{ borderBottom: `1px solid ${C.line}` }}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[13px]">{f.label}<span className="font-geist-mono text-[11px]" style={{ color: C.dim }}>{fileNameOf(s.design.vehicle.name, f)}</span></div>
                        <div className="text-[11.5px]" style={{ color: C.muted }}>{f.what}</div>
                        {f.id === 'stl-nose' && shoulderLengthM !== null && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px]" style={{ color: C.muted }}>
                            <span>Shoulder length</span>
                            <NumberField value={shoulderLengthM} kind="len" min={0.001} onChange={setShoulderChoice} width={84} />
                            {shoulderChoice === null
                              ? <span style={{ color: C.dim }}>Starts at one tube inner diameter, a common rule of thumb, not a strength check.</span>
                              : <button type="button" className="underline" style={{ color: C.dim }} onClick={() => setShoulderChoice(null)}>Back to one tube inner diameter</button>}
                          </div>
                        )}
                        {refused.map((r) => <div key={r} className="mt-0.5 text-[11.5px]" style={{ color: C.bad }}>{r}</div>)}
                        {p?.omissions.map((o) => <div key={o} className="mt-0.5 flex gap-1.5 text-[11.5px]" style={{ color: C.muted }}><AlertTriangle size={11} color={C.warn} className="mt-[2px] shrink-0" />{o}</div>)}
                      </div>
                      <Button small disabled={refused.length > 0 || motor === null} onClick={() => startReview(f, p)} title={refused.length ? 'The exporter refuses this design' : undefined}><Download size={12} />Review export</Button>
                    </div>
                    {review?.format.id === f.id && (
                      <section ref={reviewRef} tabIndex={-1} aria-label="Reviewed export" className="space-y-2 px-3.5 py-3" style={{ background: C.raised, borderBottom: `1px solid ${C.line}` }}>
                        <h3 className="text-[12.5px] font-medium">{review.format.label} · {review.snapshot.vehicle.name}</h3>
                        <p className="text-[12px]" style={{ color: C.muted }}>
                          Confirm writes this reviewed snapshot as {review.snapshot.trace ? 'a .zip with its evidence trace' : 'a plain file'}, even if you edit the design or change motors first.
                        </p>
                        {review.snapshot.preview?.omissions.map((note) => <p key={note} className="text-[11px]" style={{ color: C.muted }}>{note}</p>)}
                        <div className="flex gap-2"><Button primary onClick={() => void go()}>Confirm export</Button><Button onClick={() => setReview(null)}>Cancel export</Button></div>
                      </section>
                    )}
                  </Fragment>
                );
              })}
            </div>
          ))}
          {done && <div role="status" data-export-outcome={done.kind} className="px-3.5 py-2 text-[12px]" style={{ color: OUTCOME_COLOR[done.kind] }}>{done.message}</div>}
        </section>

        <section id="pre-export-check" aria-label="Pre-export check" className="rounded-md" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
          <div className="flex items-center px-3.5 py-2.5 text-[12.5px] font-medium" style={{ borderBottom: `1px solid ${C.line}` }}>Pre-export check<span className="ml-auto text-[11.5px] font-normal" style={{ color: blocked ? C.bad : warned ? C.warn : C.ok }}>{blocked ? 'Issues to look at' : warned ? 'Exportable, with warnings' : 'Ready'}</span></div>
          {checks.map((c) => (
            <div key={c.label} className="grid grid-cols-[18px_200px_1fr] items-center gap-2 px-3.5 py-2 text-[12.5px]" style={{ borderBottom: `1px solid ${C.line}` }}>
              <Icon st={c.state} /><span>{c.label}</span><span style={{ color: C.muted }}>{c.detail}</span>
            </div>
          ))}
          <div className="px-3.5 py-2.5 text-[12px]" style={{ color: C.dim }}>
            None of these stops an export. With File + evidence, each check and its detail is written into the trace.
          </div>
        </section>

        <ModelStatusPanel />
        <SavedRuns />
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
  const caution = gates.filter((gate) => gate.status === 'caution').length;
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
    ['Checks', gates.length === 0 ? 'no checks recorded' : `${pass} passed${caution ? ` · ${caution} caution` : ''} · ${fails} failed${unknown ? ` · ${unknown} unknown` : ''}`],
  ];
  return (
    <div className="flex h-full flex-col overflow-auto thin-scroll" style={{ background: C.panel }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}><FileText size={14} color={C.accent} /><div><div className="text-[11px]" style={{ color: C.dim }}>Packed into the .zip with File + evidence</div><div className="text-[14px] font-medium">Trace file</div></div></div>
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
