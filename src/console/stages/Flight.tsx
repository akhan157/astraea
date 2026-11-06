import { useMemo, type ReactNode } from 'react';
import { Activity, ChevronDown } from 'lucide-react';
import { useWS } from '../store';
import { useFreshness, useMediaQuery } from '../hooks';
import type { FlightEvent, FlightRun, Result } from '../data/contract';
import { C } from '../kit/theme';
import { Caveat } from '../kit/Caveat';
import { kindOf, type Kind } from '../kit/units';
import { ResultValue, DeltaChip, ConfidenceSummary, ValueUnit } from '../kit/Value';
import { LandingScatter } from '../kit/Charts';
import { Button, FieldRow, InspectorSection, NumberField } from '../kit/Fields';
import { Disclosure } from '../kit/Disclosure';
import { EmptyState, JobProgress, ValidityBadge } from '../kit/Status';
import { DataTable, PanelHeader, Stat } from '../kit/Table';
import { WithDock, StageHeader } from './common';
import type { Design, WSView } from '../store';
import { FlightPose, FlightTimeline } from './FlightTimeline';
import { WeatherPanel } from './WeatherPanel';
import { useProjectStore } from '../../state/project';
import { useAnalysisStore } from '../../state/analysis';
import { consoleActions, currentRunKey, currentPreflight, airframeDraftPending, currentCandidateReadiness } from '../store';
import { stableStringify } from '../../application/caseResolver';
import { RunReadiness } from '../shell/RunReadiness';
import { DragCalibrationChip } from '../evidence/CalibrationChip';
import { shortcutLabel } from '../../lib/platform';
import { landingAvailability } from '../../application/flightLanding';
import { isCandidateFlightModel, resolveFlightModel } from '../../application/flightModel';
import { CandidateModelPanel, CandidateResultPanel, CandidateRefusalNotice } from './Candidate';
import { Note } from '../evidence/studioKit';

/** Model chooser rendered as a real control; `<details>` keeps the disclosure semantics. */
function FlightModelChooser() {
  return (
    <Disclosure
      className="px-3 py-2 text-[11.5px]"
      style={{ borderBottom: `1px solid ${C.line}` }}
      summaryClassName="inline-flex items-center gap-2 rounded-full py-1 pr-2 pl-2.5 hover:bg-white/5"
      summaryStyle={{ border: `1px solid ${C.lineStrong}`, background: C.raised, color: C.fg }}
      chevron={false}
      summary={<>
        <span>Flight model: Legacy (supported)</span>
        <span style={{ color: C.muted }}>Change…</span>
        <ChevronDown size={12} aria-hidden="true" className="transition-transform group-open:rotate-180" style={{ color: C.dim }} />
      </>}
    >
      <div className="mt-2"><CandidateModelPanel /></div>
    </Disclosure>
  );
}

/** A window shorter than this keeps the canvas by putting the two chrome rows side by side. */
export const SHORT_WINDOW_QUERY = '(max-height: 860px)';

/**
 * A 38% share of the stage leaves the Flight canvas about 370 px on a 1280×800
 * window (from 167 px), with a 400 px cap so a tall window keeps the dock it
 * always had. The floor is the dock's own content: the Monte Carlo tab's five
 * fields and Run button need a 237 px panel, which is a 270 px dock with its tab
 * bar, and the accepted 1280×800 journey requires every one of them on screen.
 * A stored `ws.dock.flight` value always wins over this default.
 */
export const FLIGHT_DOCK_CONTENT_FLOOR = 276;

export function flightDockDefault(available: number): number {
  const share = Math.min(400, Math.max(FLIGHT_DOCK_CONTENT_FLOOR, available * 0.38));
  // The main area keeps its 160 px minimum; the separator and the tab bar are
  // the rest of the 166 px the dock's own max-height already reserves.
  const roomForCanvas = Math.max(120, available - 166);
  return Math.round(Math.max(120, Math.min(share, roomForCanvas)));
}

/**
 * The rows above the canvas: the flight-model chooser and the whole-design
 * readiness line. On a short window they share one row, which is worth about
 * 34 px of canvas; on a tall one they keep their own rows. Both are the same
 * components either way, so nothing is hidden or renamed.
 */
function FlightChrome({ compact }: { compact: boolean }) {
  if (!compact) return <><FlightModelChooser /><RunReadiness /></>;
  return (
    <div data-flight-chrome="row" className="flex shrink-0 items-stretch">
      <div className="shrink-0"><FlightModelChooser /></div>
      <RunReadiness inline />
    </div>
  );
}

export function FlightStage() {
  const s = useWS();
  const candidateSelected = isCandidateFlightModel(resolveFlightModel(s.design.flightModel));
  const candidate = s.committed?.candidate;
  const run = s.committed?.run;
  const fresh = useFreshness('flight');
  const compactChrome = useMediaQuery(SHORT_WINDOW_QUERY);
  if (candidateSelected) {
    const readiness = currentCandidateReadiness();
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <StageHeader stage="flight" title="Flight" sub={<span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'rgba(245,181,68,.12)', color: C.warn }}>Experimental candidate · unqualified</span>} />
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3 thin-scroll">
          <CandidateModelPanel />
          {candidate === undefined && run !== undefined && <CandidateRefusalNotice title="Legacy result not selected" message="The committed result below is not shown because it was produced by the legacy model, not the selected candidate model." />}
          {candidate === undefined ? (
            <div className="space-y-2">
              {readiness !== null && readiness.issues.length > 0 && <Note tone="warn" role="status">{readiness.issues.map((issue) => issue.message).join('; ')}</Note>}
              <EmptyState
                icon={<Activity size={22} />}
                title={s.running ? 'Running the candidate trajectory…' : 'No candidate run yet'}
                body={!s.native ? 'The candidate run needs the Astraea engine as WebAssembly in a worker; this browser cannot run it. No legacy substitute is used.' : 'The candidate run is one explicit bounded request. Its output is experimental and unqualified; landing/apogee values are absent unless the engine reports them.'}
                action={<div className="flex gap-2"><Button primary disabled={!s.native || readiness === null || readiness.issues.length > 0 || s.running} onClick={() => void s.run()}>Run candidate</Button>{s.running && <Button onClick={s.cancelRun}>Cancel run</Button>}</div>}
              />
              {s.runError && <Note tone="warn" role="status">{s.runError}</Note>}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2"><Button small disabled={s.running} onClick={() => void s.run()}>Re-run candidate</Button>{s.running && <Button small onClick={s.cancelRun}>Cancel run</Button>}</div>
              {s.runError && <Note tone="warn" role="status">{s.runError}</Note>}
              <CandidateResultPanel result={candidate} engineIdentity={s.committed?.engineIdentity} />
            </div>
          )}
        </div>
      </div>
    );
  }
  if (!run) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <StageHeader stage="flight" title="Flight" />
        <FlightChrome compact={compactChrome} />
        <WithDock storageKey="flight" initial={flightDockDefault} main={
        <EmptyState
          icon={<Activity size={22} />}
          title={s.running ? 'Running the 6-DOF simulation…' : 'No flight yet'}
          body={s.native ? 'Run the simulation to see the events, the result summary and every gate.' : 'The flight run needs the Astraea engine, and this browser cannot run it (it needs WebAssembly and Web Workers). There is no substitute engine.'}
          action={<Button primary disabled={!s.native || !currentPreflight().runnable || airframeDraftPending() || s.running} onClick={() => void s.run()}>Run simulation</Button>}
        />
        } tabs={[{ id: 'weather', label: 'Weather', body: <WeatherPanel /> }, { id: 'mc', label: 'Monte Carlo', body: <MonteCarlo /> }]} />
      </div>
    );
  }

  const allResults = Object.values(run.summary).filter((v): v is Result => typeof v === 'object' && v !== null);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StageHeader stage="flight" title="Flight" sub={fresh.state === 'current' ? <ValidityBadge v={run.summary.validity} enveloped={run.summary.enveloped} /> : <span style={{ color: C.changed }}>Stored validity: {run.summary.validity} · {fresh.state} — not a current result</span>}
        right={<ConfidenceSummary results={allResults} />} />
      <FlightChrome compact={compactChrome} />
      <WithDock storageKey="flight" initial={flightDockDefault}
        main={
          <div className="relative h-full" style={{ opacity: fresh.state === 'stale' ? 0.85 : 1 }}>
            <FlightPose run={run} />
            {fresh.state === 'stale' && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 rounded px-2.5 py-1 text-[11.5px]" style={{ color: C.changed, background: 'rgba(16,18,21,0.92)', border: '1px solid rgba(245,181,68,.35)' }}>
                Showing the committed run. {fresh.reasons.length} input{fresh.reasons.length > 1 ? 's have' : ' has'} changed since; press {shortcutLabel('run')} to re-run.
              </div>
            )}
          </div>
        }
        tabs={[
          { id: 'timeline', label: 'Timeline', body: <FlightTimeline run={run} /> },
          { id: 'events', label: 'Events', body: <Events run={run} /> },
          { id: 'mc', label: 'Monte Carlo', body: <MonteCarlo /> },
          { id: 'weather', label: 'Weather', body: <WeatherPanel /> },
          { id: 'summary', label: 'Results', body: <ResultsTable run={run} /> },
        ]} />
    </div>
  );
}

/** The engine's event record, in flight order. */
function Events({ run }: { run: FlightRun }) {
  const rows = run.events;
  return (
    <div className="min-h-0">
      <PanelHeader title="Flight events" sub={`${rows.length} markers · max-Q is derived from recorded samples`} />
      <DataTable rows={rows} rowKey={(e) => e.kind} dense
        columns={[
          { key: 't', label: 'Time', width: '90px', render: (e: FlightEvent) => <span className="font-geist-mono">{e.t.toFixed(2)} s</span> },
          { key: 'e', label: 'Event', width: 'minmax(120px,1fr)', render: (e) => e.label },
          { key: 'a', label: 'Altitude', align: 'right', width: '110px', render: (e) => <ValueUnit value={e.altitude} kind="dist" /> },
          { key: 'v', label: 'Speed', align: 'right', width: '110px', render: (e) => <ValueUnit value={e.velocity} kind="speed" /> },
        ]} />
      {run.flutter && <p className="px-3 py-2 text-[11.5px]" style={{ color: C.dim }}>{run.flutter.provenance}</p>}
    </div>
  );
}

export function ResultsTable({ run }: { run: FlightRun }) {
  const prev = useWS((s) => s.previous);
  const landing = landingAvailability(run);
  const previousLanding = prev ? landingAvailability(prev) : null;
  const rows: { id: keyof FlightRun['summary']; label: string; better?: 'up' | 'down' }[] = [
    { id: 'apogee', label: 'Apogee' },
    { id: 'apogeeTime', label: 'Time to apogee' },
    { id: 'maxSpeed', label: 'Max speed' },
    { id: 'maxMach', label: 'Max Mach' },
    { id: 'maxAccelG', label: 'Max acceleration' },
    ...(run.summary.maxQ ? [{ id: 'maxQ' as const, label: 'Sampled Max-Q' }] : []),
    { id: 'railExitSpeed', label: 'Rail exit speed', better: 'up' },
    { id: 'burnoutAltitude', label: 'Burnout altitude' },
    { id: 'landingSpeed', label: 'Landing speed', better: 'down' },
    { id: 'landingEnergy', label: 'Landing energy', better: 'down' },
    { id: 'drift', label: 'Drift from pad' },
    { id: 'weathercockAngleDeg', label: 'Incidence at rail exit' },
    { id: 'flightTime', label: 'Flight time' },
  ];
  return (
    <div>
      <DataTable rows={rows} rowKey={(r) => r.id} dense
        columns={[
          { key: 'l', label: 'Result', width: '1.2fr', render: (r) => r.label },
          { key: 'v', label: `Run r${run.rev}`, align: 'right', width: '1fr', render: (r) => !landing.available && (r.id === 'landingSpeed' || r.id === 'landingEnergy') ? `N/A — ${landing.reason}` : <ResultValue r={run.summary[r.id] as Result} label={r.label} /> },
          {
            key: 'd',
            label: prev ? `Δ vs r${prev.rev}` : 'Δ previous run',
            align: 'right',
            width: '120px',
            render: (r) => {
              if (prev && (r.id === 'landingSpeed' || r.id === 'landingEnergy')) {
                const unavailable = !landing.available ? landing
                  : previousLanding && !previousLanding.available ? previousLanding : null;
                if (unavailable) return <span title={`Landing change unavailable: ${unavailable.reason}. Both runs must report a nominal touchdown, and neither may have stopped on its time limit.`}>N/A</span>;
              }
              const now = run.summary[r.id] as Result;
              const was = prev?.summary[r.id] as Result | undefined;
              return was ? <DeltaChip now={now.value} was={was.value} kind={kindOf(now.unit)} better={r.better} /> : null;
            },
          },
          { key: 'c', label: 'Basis', width: '1.6fr', render: (r) => { const res = run.summary[r.id] as Result; return <span data-result-basis className="block break-words text-[11.5px] leading-snug" style={{ color: C.dim }} title={res.reason}>{res.reason}</span>; } },
        ]} />
      <p className="px-3 py-2 text-[11.5px]" style={{ color: C.dim }}>
        Sampled Max-Q uses bounded, rounded display telemetry after decimation.
        {run.sampledMaxQ
          ? ` ${run.sampledMaxQ.validSampleCount} usable q/time samples of ${run.sampledMaxQ.sampleCount}; peak sample at ${run.sampledMaxQ.time.toFixed(3)} s. Maximum observed timestamp gap: ${run.sampledMaxQ.maxObservedGapS === undefined ? 'unavailable' : `${run.sampledMaxQ.maxObservedGapS.toFixed(3)} s`}.`
          : ' Sample timing metadata is unavailable for this stored run.'}
        {' '}These sample statistics provide no continuous-peak magnitude or timing error bound, or structural-load qualification.
      </p>
    </div>
  );
}

function MonteCarlo() {
  const s = useWS();
  const config = useProjectStore((state) => state.project.workspace.ensemble);
  const record = useAnalysisStore((state) => state.records.ensemble);
  const n = config.nRuns;
  const key = `${currentRunKey() ?? 'invalid'}|ensemble:${stableStringify(config)}`;
  const stale = record?.status === 'completed' && record.inputKey !== key;
  const job = s.mc;
  const d = job?.partial;
  // Strict footprint: only supported nominal terminals are plotted and reduced.
  const eligible = d?.eligibleEndpoints?.map((entry) => entry.point) ?? d?.landings ?? [];
  const statisticsAvailable = d ? (d.statisticsAvailable ?? d.ok > 0) : false;
  const rings = useMemo(() => (d && statisticsAvailable && eligible.length > 0
    ? [{ r: d.r50, label: '50%' }, { r: d.r90, label: '90%' }, { r: d.r99, label: '99%' }]
    : []), [d, eligible.length, statisticsAvailable]);
  return (
    <div className="grid min-h-full grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <div className="flex items-center justify-center p-3" style={{ borderRight: `1px solid ${C.line}` }}>
        {d && eligible.length > 0
          ? <LandingScatter landings={eligible} mean={d.mean} rings={rings} height={Math.max(220, Math.min(340, innerHeight * 0.32))} />
          : <EmptyState title={d ? 'No supported footprint' : 'No dispersion yet'} body={d ? 'The ledger has no supported nominal terminal samples, so no footprint is drawn. Every requested run stays counted below; scenario variation is not probability.' : 'Monte Carlo re-flies the current design many times with varied wind direction, rail angle and motor impulse, and shows where it lands.'} />}
      </div>
      <div className="space-y-3 p-3">
        <PanelHeader title="Landing dispersion" sub="per-run-v2, seeded" />
        <div className="grid grid-cols-2 gap-2" data-mc-controls="true">
          {(['nRuns', 'seed', 'windAzimuthDegSigma', 'railAngleDegSigma', 'impulsePctSigma'] as const).map((field) => <label key={field} className="flex min-w-0 flex-col gap-0.5 text-[11px]"><span className="truncate" title={field}>{MC_FIELD_LABELS[field]}</span><input aria-label={`Monte Carlo ${field}`} type="number" min={field === 'nRuns' ? 1 : 0} max={field === 'nRuns' ? 1000 : undefined} value={config[field]} onChange={(e) => {
            if (!Number.isFinite(e.target.valueAsNumber)) return;
            consoleActions.setWorkspace({ ensemble: { ...config, [field]: e.target.valueAsNumber } }, `MC ${field}`);
          }} className="w-full min-w-0 rounded p-1" style={{ background: C.sunken }} /></label>)}
          <div className="col-span-2"><Button primary small disabled={job?.state === 'running'} onClick={() => s.runMonteCarlo(n)}>Run {n} flights</Button></div>
        </div>
        {d?.dragCalibration && <div><DragCalibrationChip calibration={d.dragCalibration} /></div>}
        {job && <JobProgress job={job} onCancel={s.cancelMonteCarlo} onDismiss={s.dismissMonteCarlo} />}
        {stale && <p role="status" style={{ color: C.changed }}>Stale: ensemble or flight inputs changed. Rerun required.</p>}
        {d?.counts && (
          <div data-mc-outcome-counts className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
            <span>Requested <b className="font-geist-mono">{d.counts.requested}</b></span>
            <span>Supported nominal <b className="font-geist-mono">{d.counts.supportedNominalTerminal}</b></span>
            <span>Unsupported touchdown <b className="font-geist-mono">{d.counts.unsupportedNominalTouchdown}</b></span>
            <span>Non-nominal impact <b className="font-geist-mono">{d.counts.nonNominalImpact}</b></span>
            <span>Time-limit endpoint <b className="font-geist-mono">{d.counts.timeLimitEndpoint}</b></span>
            <span>Computational failure <b className="font-geist-mono">{d.counts.computationalFailure}</b></span>
          </div>
        )}
        {d && statisticsAvailable && (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Sample 50% radius"><ValueUnit value={d.r50} kind="dist" /></Stat>
            <Stat label="Sample 90% radius"><ValueUnit value={d.r90} kind="dist" /></Stat>
            <Stat label="Sample 99% radius"><ValueUnit value={d.r99} kind="dist" /></Stat>
            <Stat label="Mean east"><ValueUnit value={d.mean.x} kind="dist" /></Stat>
            <Stat label="Mean north"><ValueUnit value={d.mean.y} kind="dist" /></Stat>
            <Stat label="Computational failures"><span className="font-geist-mono">{d.failed}</span></Stat>
          </div>
        )}
        {d && !statisticsAvailable && (
          <p role="status" style={{ color: C.changed }}>
            No supported nominal terminal sample: dispersion statistics are unavailable (not zero-filled). All requested runs remain in the outcome counts above.
          </p>
        )}
        <div className="space-y-1.5 text-[11px] leading-relaxed" style={{ color: C.dim }}>
          <p>Scenario sensitivity, not physical probability. Three inputs are sampled independently, with no correlation: wind direction, rail elevation, and one uniform thrust-curve scale (burn shape and burn time unchanged). Everything else is fixed — wind speed and shear, atmosphere, mass/CG/geometry, rail length and azimuth, drag calibration, deployment settings.</p>
          <p>The sigmas are declared scenario assumptions, not measured distributions or certification tolerances; percentages and radii are sample fractions over supported nominal terminals only, not a landing-probability or coverage guarantee. Time-limit endpoints are not landings; unsupported, non-nominal and failed runs stay in the ledger; cancel discards the partial cloud and records a failed attempt.</p>
        </div>
      </div>
    </div>
  );
}

/** Plain-language labels for the dispersion controls; the archived keys stay internal. */
const MC_FIELD_LABELS: Record<'nRuns' | 'seed' | 'windAzimuthDegSigma' | 'railAngleDegSigma' | 'impulsePctSigma', string> = {
  nRuns: 'Runs',
  seed: 'Seed',
  windAzimuthDegSigma: 'Wind dir. σ (°)',
  railAngleDegSigma: 'Rail elev. σ (°)',
  impulsePctSigma: 'Impulse σ (%)',
};

/** Flight inspector: launch conditions that feed the run. */
export function LaunchInspector() {
  const s = useWS();
  const candidateSelected = isCandidateFlightModel(resolveFlightModel(s.design.flightModel));
  const o = s.design.options;
  const committed = candidateSelected ? undefined : s.committed?.design.options;
  type LaunchKey = Exclude<keyof Design['options'], 'dragCdScale'>;
  const changed = (k: LaunchKey): boolean => committed !== undefined && committed[k] !== o[k];
  const Field = ({ k, label, kind, min, max, digits }: { k: LaunchKey; label: string; kind: Kind; min: number; max: number; digits?: number }) => (
    <FieldRow label={label} changed={changed(k)} onRevert={() => committed && s.setOptions({ [k]: committed[k] }, 'Revert')}>
      <NumberField value={o[k]} kind={kind} min={min} max={max} digits={digits} onChange={(v) => s.setOptions({ [k]: v }, label)} />
    </FieldRow>
  );
  return (
    <>
      <InspectorSection title="Launch rail">
        <Field k="railLength" label="Effective guide travel" kind="dist" min={0.5} max={20} digits={2} />
        <div className="mt-1">
          <Caveat summary="Distance to modeled full release.">
            Displacement from the initial position to modeled full release. Existing rail-length values are retained; review this value against your guide geometry. Physical rail length alone does not establish travel to first rotational freedom. Partial guide constraints and tip-off are not modeled.
          </Caveat>
        </div>
        <Field k="railElevationDeg" label="Rail angle from horizontal" kind="angle" min={70} max={90} />
        <Field k="railAzimuthDeg" label="Rail azimuth" kind="angle" min={0} max={359} />
      </InspectorSection>
      <InspectorSection title="Site and wind">
        <Field k="windSpeedSurface" label="Surface wind" kind="speed" min={0} max={15} />
        <Field k="windAzimuthDeg" label="Wind from" kind="angle" min={0} max={359} />
        <div className="mt-1 text-[11px] leading-relaxed" style={{ color: C.dim }}>
          Set launch-site altitude and temperature in Mission. Wind changes do not change the stored launch site.
        </div>
      </InspectorSection>
      <InspectorSection title="Recovery">
        <Field k="mainDeployAltitudeAGL" label="Main deploy altitude" kind="dist" min={30} max={1500} />
      </InspectorSection>
    </>
  );
}

function ReadOnlyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[24px] items-baseline justify-between gap-3 py-0.5 text-[12.5px]">
      <span className="min-w-0" style={{ color: C.muted }}>{label}</span>
      <span className="text-right font-geist-mono tnum">{children}</span>
    </div>
  );
}

function LaunchSummary({ s }: { s: WSView }) {
  const o = s.design.options;
  const site = s.design.vehicle.launchSite;
  return (
    <div data-launch-summary>
      <div className="mb-1 text-[10.5px] tracking-[0.12em] uppercase" style={{ color: C.dim }}>Rail</div>
      <ReadOnlyRow label="Effective guide travel"><ValueUnit value={o.railLength} kind="dist" digits={2} /></ReadOnlyRow>
      <ReadOnlyRow label="Rail angle"><ValueUnit value={o.railElevationDeg} kind="angle" /></ReadOnlyRow>
      <ReadOnlyRow label="Rail azimuth"><ValueUnit value={o.railAzimuthDeg} kind="angle" /></ReadOnlyRow>
      <div className="mt-3 mb-1 text-[10.5px] tracking-[0.12em] uppercase" style={{ color: C.dim }}>Site and wind</div>
      <ReadOnlyRow label="Surface wind"><ValueUnit value={o.windSpeedSurface} kind="speed" /></ReadOnlyRow>
      <ReadOnlyRow label="Wind from"><ValueUnit value={o.windAzimuthDeg} kind="angle" /></ReadOnlyRow>
      <div className="flex items-baseline justify-between gap-3 py-0.5 text-[12.5px]">
        <span className="min-w-0" style={{ color: C.muted }}>Launch-site elevation</span>
        <span className="text-right font-geist-mono tnum">{site ? <ValueUnit value={site.altitudeM} kind="dist" /> : 'Not set'}</span>
      </div>
      {!site && <div className="text-right text-[10.5px] leading-snug" style={{ color: C.dim }}>sea level standard day assumed</div>}
      <div className="mt-3 mb-1 text-[10.5px] tracking-[0.12em] uppercase" style={{ color: C.dim }}>Recovery</div>
      <ReadOnlyRow label="Main deploy altitude"><ValueUnit value={o.mainDeployAltitudeAGL} kind="dist" /></ReadOnlyRow>
    </div>
  );
}

export function FlightInspector() {
  const s = useWS();
  const candidateSelected = isCandidateFlightModel(resolveFlightModel(s.design.flightModel));
  const run = candidateSelected ? undefined : s.committed?.run;
  return (
    <div className="flex h-full flex-col overflow-auto thin-scroll" style={{ background: C.panel }}>
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="text-[11px]" style={{ color: C.dim }}>Flight</div>
        <div className="text-[14px] font-medium">Launch conditions</div>
      </div>
      {run && (
        <InspectorSection title={`Run r${run.rev}`}>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Apogee"><ResultValue r={run.summary.apogee} size="lg" label="Apogee" /></Stat>
            <Stat label="Max Mach"><ResultValue r={run.summary.maxMach} size="lg" label="Max Mach" /></Stat>
            <Stat label="Rail exit"><ResultValue r={run.summary.railExitSpeed} label="Rail exit speed" /></Stat>
            <Stat label="Drift"><ResultValue r={run.summary.drift} label="Drift" /></Stat>
          </div>
        </InspectorSection>
      )}
      <InspectorSection
        title="Launch settings"
        right={<Button small onClick={() => s.set({ stage: 'mission' })}>Edit in Mission</Button>}
      >
        <LaunchSummary s={s} />
      </InspectorSection>
    </div>
  );
}
