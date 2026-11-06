/**
 * Effective vertical-coast drag fit with explicit applicability assumptions
 * and project application provenance.
 *
 *  - Fit: coast points are derived from the log (`deriveCoastPoints`), the
 *    model's own coast Cd comes from the same estimator over the model's
 *    flight of the committed design with no calibration, and the scale is
 *    fitted / model. Any change to the log, design, motor or site marks the
 *    fit stale; a stale fit shows no numbers.
 *  - Apply: stores the scale with its provenance in the project (undoable,
 *    saved with it); every run then carries it and reads Calibrated.
 *  - Manual points (advanced): the old coast table, now empty by default and
 *    analysis-only. It is never applied to a project.
 */
import React, { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Variable } from 'lucide-react';
import { calibrateCd, MIN_VELOCITY_MS, type CalibrationResult, type CoastPoint } from '../../evidence/calibration';
import { WINDOW_HALF_WIDTH_ALTITUDE_S, WINDOW_HALF_WIDTH_VELOCITY_S } from '../../evidence/coastWindow';
import { fitDragScale, refitDragScaleWithinEvents, DRAG_SCALE_MAX, DRAG_SCALE_MIN, type DragFit } from '../../evidence/dragFit';
import { type LogProvenance, UNAVAILABLE_HASH } from '../../evidence/logProvenance';
import { buildDragCalibration, describeDragCalibration } from '../../application/dragCalibration';
import { calibrationEngineStatus } from '../../application/calibrationApplicability';
import { isCandidateFlightModel, resolveFlightModel, type FlightModelSelection } from '../../application/flightModel';
import { CANDIDATE_REFUSAL } from '../../application/candidate';
import { hashHex } from '../../application/caseResolver';
import { modelCalibrationEventEvidence, type CalibrationSideEvidence } from '../../evidence/calibrationEligibility';
import { CalibrationReview, calibrationReviewResult, emptyCalibrationReview, reviewedCalibrationEvents } from './CalibrationReview';
import { getAtmosphereAt } from '../../sim/flightSimulator';
import { simulateFlightRecorded, stabilityOfRecorded } from '../../tauri/bridge';
import { useProjectStore } from '../../state/project';
import { sixDofOptions } from '../data/adapter';
import { consoleActions, contentKeyOf, designOf, engineIsAvailable, motorOfId, uncalibratedRunKey, useDesign } from '../store';
import { C } from '../kit/theme';
import { Button } from '../kit/Fields';
import { Disclosure } from '../kit/Disclosure';
import type { ImportedLog } from './AltimetryCard';
import { DragCalibrationChip, useCurrentEngineIdentity } from './CalibrationChip';
import { compareEngineIdentity, describeEngineIdentity, type EngineIdentity } from '../../engine/identity';
import { Card, KvRow, Note, Notice, PlainNumberField, Well, fmt, toNumber } from './studioKit';

const FIT_ASSUMPTIONS =
  'Assumes unpowered ascent, approximately vertical motion, calm air, constant mass and no recovery deployment across the fitted points and smoothing support. ' +
  'Source-attributed review is required for new application; density is assumed ISA. A preview alone establishes no physical eligibility.';

const FIT_METHOD =
  'The velocity peak before the highest recorded altitude defines a heuristic window. These are proxies, not guaranteed motor burnout or apogee; a truncated log can put either at a boundary. Velocity and deceleration come from a local least-squares ' +
  `fit over a sliding window: a straight line through the logged velocity (±${WINDOW_HALF_WIDTH_VELOCITY_S} s), or, when the log has no velocity ` +
  `column, a parabola through altitude (±${WINDOW_HALF_WIDTH_ALTITUDE_S} s). Drag deceleration = −dv/dt − g, density is ISA at site elevation + altitude, ` +
  `mass is the committed design dry mass + motor casing, and area comes from the reference diameter. Points under ${MIN_VELOCITY_MS} m/s are excluded; ` +
  'noisy points with a non-positive deceleration are kept as signed values, because dropping them biases Cd high. The model’s own coast Cd comes from ' +
  'the same procedure on the model’s flight of this design with no calibration. Sparse samples widen the smoothing window; different sampling and support can bias the ratio.';

/** A completed fit, with the exact inputs it was made from. */
interface FitState {
  engineIdentity: EngineIdentity;
  /** Selection resolved when the fit ran; the artifact binds to this, not to whatever selection is current at apply time. */
  flightModel: FlightModelSelection;
  key: string;
  fit: DragFit;
  provenance: LogProvenance;
  designMassKg: number;
  motorCasingKg: number;
  refDiameterM: number;
  launchElevationM: number;
  logApogeeM: number;
  modelApogeeM: number;
  modelKey: string;
  modelEvents: CalibrationSideEvidence;
  normalizedLogKey: string;
}

const gramsOf = (kg: number): string => `${(kg * 1000).toFixed(1)} g`;
const secondsOf = (s: number): string => `${s.toFixed(2)} s`;

function Subhead({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="text-[10.5px] font-medium tracking-[0.12em] uppercase" style={{ color: C.dim }}>{children}</div>;
}

/** The calibration the project carries, with its provenance and the way out. */
function AppliedCalibration(): JSX.Element | null {
  const currentEngine = useCurrentEngineIdentity();
  const calibration = useProjectStore((s) => s.project.dragCalibration);
  // The same resolution design/dispatch/archive use: model binding + exact
  // fit-time inputs. Anything else keeps the artifact as history.
  const design = useDesign();
  if (calibration === undefined) return null;
  const applicability = design.calibrationApplicability;
  const active = applicability.status === 'active';
  const state = applicability.status === 'none' ? 'none'
    : applicability.status === 'active' ? `active-${applicability.model}`
      : `inactive-${applicability.reason}`;
  const engine = calibrationEngineStatus(calibration, currentEngine);
  // A recorded engine identity must match exactly before the scale is
  // dispatched; the UI must not call that artifact active on a mismatch.
  const engineBlocked = engine === 'different' || engine === 'unknown';
  const dispatchable = active && !engineBlocked;
  const file = calibration.source.fileName ?? 'pasted log';
  const sha = calibration.source.sha256Hex === UNAVAILABLE_HASH ? 'checksum unavailable' : calibration.source.sha256Hex;
  return (
    <Well className="space-y-1.5" >
      <div data-drag-calibration-applied={calibration.scale.toFixed(3)} data-calibration-applicability={state} className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Subhead>{dispatchable ? 'Applied to this project'
            : active ? 'Input-compatible · engine verification required' : 'Retained on this project (inactive)'}</Subhead>
          {dispatchable && <DragCalibrationChip calibration={calibration} />}
          <span className="ml-auto" />
          <Button small onClick={() => consoleActions.setDragCalibration(undefined, 'Remove drag calibration')}>Remove calibration</Button>
        </div>
        <KvRow label={dispatchable ? 'Applied scale' : 'Stored scale (not applied)'} value={calibration.scale.toFixed(3)} unit="× airframe Cd" />
        <KvRow label="Fitted Cd / model Cd" value={`${calibration.fittedCd.toFixed(4)} / ${calibration.modelCd.toFixed(4)}`} />
        <KvRow label="In-sample equivalent-force RMSE" value={`${calibration.rmseN.toFixed(3)} N`} tone="muted" />
        <KvRow label="Log file" value={file} />
        <KvRow label="Log SHA-256" value={sha} />
        <KvRow label="Fit window" value={`${secondsOf(calibration.window.startS)} – ${secondsOf(calibration.window.endS)}`} />
        <KvRow label="Points" value={`${calibration.window.pointsUsed} used · ${calibration.window.pointsExcluded} excluded`} tone="muted" />
        <KvRow label="Recorded fit engine" value={describeEngineIdentity(calibration.fitProvenance?.engineIdentity)} tone="muted" />
        <KvRow label="Current engine" value={currentEngine === undefined ? 'identity unavailable or loading' : describeEngineIdentity(currentEngine)} tone="muted" />
        {engine === 'different' && <Note tone="warn" role="status">The current engine differs from the recorded fit engine. The artifact is retained, but runs carrying its scale are refused on this engine; refit on this engine or remove it.</Note>}
        {engine === 'unknown' && <Note tone="warn" role="status">The fit engine cannot be verified because a SHA-256 is unavailable. A recorded engine identity must match exactly, so runs carrying this scale are refused; refit on a build with a known engine identity or remove it.</Note>}
        <KvRow label="Applied" value={calibration.appliedAt} tone="muted" />
        {applicability.status === 'inactive' && applicability.reason === 'flight-model'
          ? <Note tone="warn" role="status">Inactive: this fit is bound to a different flight model ({calibration.fitProvenance?.flightModelBinding?.modelId ?? 'unknown'}). Its scale is retained as history but not applied to runs.</Note>
          : applicability.status === 'inactive'
            ? <Note tone="warn" role="status">
                Inactive: the current design, motor, site or launch options differ from the fit-time inputs, so the scale is excluded from runs and run identity (and from the archive). Restore the exact inputs or refit.
                <span className="font-geist-mono" style={{ color: C.dim }}> Fit inputs {applicability.recordedFitInputKey ?? 'unavailable'} · current {applicability.currentFitInputKey ?? 'unkeyable'}.</span>
              </Note>
            : active && applicability.model === 'bound'
              ? <Note>Model binding: bound to {calibration.fitProvenance!.flightModelBinding!.modelId}.</Note>
              : active && <Note>Model binding: legacy fit; model binding unverified.</Note>}
        {calibration.fitProvenance !== undefined && <KvRow label="Stored selection policy" value={calibration.fitProvenance.selection?.policy ?? 'heuristic-v1 (original CAL-E1 selection)'} tone="muted" />}
        <Note tone={dispatchable ? undefined : 'warn'}>{calibration.fitProvenance === undefined
          ? 'Legacy adjustment retained — physical eligibility and complete fit provenance are unverified.'
          : dispatchable
            ? 'Conditionally eligible from declared evidence for the fitted inputs — not independently verified.'
            : active
              ? 'Input-compatible and conditionally eligible, but the recorded fit engine is not verified for this dispatch; the scale is not sent to runs.'
              : 'The stored scale is not part of the current run inputs. Refit for the current inputs to apply a new adjustment.'}</Note>
        {calibration.fitProvenance !== undefined && <Disclosure summary="Stored fit support and evidence" summaryClassName="text-[12px]">
          <div className="space-y-1.5 pt-2">
            {(['log', 'model'] as const).map((side) => {
              const p = calibration.fitProvenance!;
              const w = side === 'log' ? p.logWindow : p.modelWindow;
              const e = p.evidence[side];
              return <div key={side}>
                <KvRow label={`${side} selected / raw filter support`} value={`${secondsOf(w.windowStartS)}–${secondsOf(w.windowEndS)} / ${secondsOf(w.supportStartS)}–${secondsOf(w.supportEndS)}`} tone="muted" />
                <KvRow label={`${side} method / half-width / speed`} value={`${w.method} / ±${secondsOf(w.halfWidthS)} / ${fmt(w.minSpeedMs, 2)}–${fmt(w.maxSpeedMs, 2)} m/s`} tone="muted" />
                <KvRow label={`${side} original candidates / low-speed / event excluded / retained`} value={`${w.candidates} / ${w.excluded.lowSpeed} / ${w.excluded.event ?? 0} / ${w.used}`} tone="muted" />
                <Note>{side} burnout: {e.burnout?.earliestS}–{e.burnout?.latestS} s — {e.burnout?.source}. Recovery: {e.recovery?.kind === 'first-event' ? `${e.recovery.event.earliestS}–${e.recovery.event.latestS} s — ${e.recovery.event.source}` : e.recovery?.kind === 'absent-through' ? `absent through ${e.recovery.throughS} s — ${e.recovery.source}` : 'unverified'}.</Note>
                <Note>Motion: {e.verticalMotion?.source}. Constant mass: {e.constantMass?.source}.</Note>
              </div>;
            })}
            <KvRow label="Normalized log identity (FNV-1a32, not a checksum)" value={calibration.fitProvenance.normalizedLogKey} tone="muted" />
          </div>
        </Disclosure>}
        <Note>
          {describeDragCalibration(calibration)}. The scale affects powered and coast airframe drag; a lower fitted Cd can raise apogee.
          {dispatchable
            ? 'Calibrated means adjustment applied, not verified accuracy. Run again to refresh results; remove it to restore scale 1.'
            : active
              ? 'It is not applied to current runs because the fit engine is not verified to match; refit on this engine or remove it.'
              : 'It is not applied to current runs; they use the model’s own drag. Restore the fit inputs, refit, or remove it.'}
        </Note>
        <Note>{FIT_ASSUMPTIONS} Other speeds, attitudes and powered flight remain unverified.</Note>
      </div>
    </Well>
  );
}

/** Fit from the imported log. */
function LogFit({ log }: { log: ImportedLog | null }): JSX.Element {
  const project = useProjectStore((s) => s.project);
  const motors = useProjectStore((s) => s.motors);
  const mission = useProjectStore((s) => s.mission);
  const shearPa = useProjectStore((s) => s.shearPa);
  const airframeDraft = useProjectStore((s) => s.drafts.airframe);
  const applied = project.dragCalibration;
  const [state, setState] = useState<FitState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(emptyCalibrationReview);
  const [refit, setRefit] = useState<{ fit: DragFit; key: string; eventKey: string } | null>(null);
  const seq = useRef(0);

  // What the fit depends on: the log, and the design/motor/site without any calibration.
  const modelKey = useMemo(() => {
    void project; void motors; void mission; void shearPa;
    return uncalibratedRunKey();
  }, [project, motors, mission, shearPa]);
  const logKey = useMemo(
    () => log === null ? null : contentKeyOf({
      sha: log.provenance.sha256Hex,
      rows: log.provenance.rowCount,
      file: log.provenance.sourceFileName,
      time: log.provenance.timeUnitAssumption,
      altitude: log.provenance.altitudeUnitAssumption,
      samples: log.samples,
    }),
    [log],
  );
  // The fit depends on the model selection too: switching selection stales the fit,
  // so an A-fitted scale can never be applied under selection B.
  const currentKey = modelKey !== null && logKey !== null
    ? `${modelKey}|${logKey}|${JSON.stringify(resolveFlightModel(project.flightModel))}`
    : null;
  const draftPending = Object.keys(airframeDraft.components).length > 0 || airframeDraft.added.length > 0 || airframeDraft.removed.length > 0;
  const stale = state !== null && state.key !== currentKey;
  const original = state !== null && !stale ? state : null;
  const eventReview = (() => {
    if (original === null) return null;
    try {
      const evidence = reviewedCalibrationEvents(review, original.modelEvents);
      return { evidence, key: JSON.stringify(evidence), error: null };
    } catch (error) {
      return { evidence: null, key: null, error: error instanceof Error ? error.message : String(error) };
    }
  })();
  const currentRefit = original !== null && refit?.key === original.key && refit.eventKey === eventReview?.key ? refit : null;
  const shown = original === null ? null : currentRefit === null ? original : { ...original, fit: currentRefit.fit };
  useEffect(() => {
    setReview(emptyCalibrationReview());
    setRefit(null);
    // A successful reimport requires a fresh source review, even for identical samples.
    setState((previous) => previous?.key === currentKey ? null : previous);
    seq.current++;
    setBusy(false);
  }, [log]);
  useEffect(() => { setReview(emptyCalibrationReview()); }, [currentKey]);
  const eligibility = shown === null ? null : calibrationReviewResult(review, shown.modelEvents, shown.fit);
  const alreadyApplied = shown !== null && applied !== undefined && eligibility?.status === 'conditional' && eligibility.evidence !== null
    && contentKeyOf(applied) === contentKeyOf(buildDragCalibration(shown.fit, shown.provenance, applied.appliedAt, shown.flightModel, eligibility.evidence, shown.modelKey, shown.normalizedLogKey, shown.engineIdentity));

  const blocked = isCandidateFlightModel(resolveFlightModel(project.flightModel))
    ? CANDIDATE_REFUSAL.calibration
    : !engineIsAvailable()
    ? 'The engine cannot run in this browser.'
    : log === null
      ? 'Import a flight log above to derive coast points from it.'
      : draftPending
        ? 'Apply or discard staged airframe edits first: the fit uses the committed design.'
        : modelKey === null
          ? 'The design fails preflight; repair the motor, mount or launch setup first.'
          : null;

  const handleFit = async () => {
    if (log === null || currentKey === null || modelKey === null || blocked !== null) return;
    if (isCandidateFlightModel(resolveFlightModel(useProjectStore.getState().project.flightModel))) {
      setError(CANDIDATE_REFUSAL.calibration);
      return;
    }
    const mine = ++seq.current;
    setBusy(true);
    setError(null);
    setReview(emptyCalibrationReview());
    setRefit(null);
    try {
      const store = useProjectStore.getState();
      const { dragCalibration: _applied, ...uncalibrated } = store.project;
      const design = designOf(uncalibrated, store.mission, store.shearPa, undefined, store.motors);
      const motor = motorOfId(design.motorId);
      if (motor === null) throw new Error(`motor '${design.motorId}' is not in the project catalog`);
      // The model's flight with NO calibration, and the committed design's mass and reference diameter.
      const [recordedFlight, recordedAnalysis] = await Promise.all([
        simulateFlightRecorded(design.vehicle, motor, sixDofOptions(design.options)),
        stabilityOfRecorded(design.vehicle),
      ]);
      if (compareEngineIdentity(recordedFlight.engineIdentity, recordedAnalysis.engineIdentity) === 'different') {
        throw new Error('Calibration model flight and mass analysis used different engines; fit refused.');
      }
      const flight = recordedFlight.value;
      const analysis = recordedAnalysis.value;
      const refDiameterM = analysis.referenceDiameter;
      const coastMassKg = analysis.totalMass + motor.dryMass;
      const fit = fitDragScale({
        log: log.samples,
        coastMassKg,
        refAreaM2: Math.PI * refDiameterM * refDiameterM * 0.25,
        launchElevationM: design.options.launchAltitudeASL,
        modelTelemetry: flight.telemetry,
      });
      let logApogeeM = -Infinity;
      for (const sample of log.samples) logApogeeM = Math.max(logApogeeM, sample.altitudeM);
      if (seq.current === mine) {
        setState({
          key: currentKey,
          engineIdentity: recordedAnalysis.engineIdentity.sha256 === null
            ? Object.freeze({ kind: recordedFlight.engineIdentity.kind, sha256: null }) : recordedFlight.engineIdentity,
          flightModel: resolveFlightModel(store.project.flightModel),
          fit,
          provenance: log.provenance,
          designMassKg: analysis.totalMass,
          motorCasingKg: motor.dryMass,
          refDiameterM,
          launchElevationM: design.options.launchAltitudeASL,
          logApogeeM,
          modelApogeeM: flight.apogeeAltitude,
          modelKey,
          modelEvents: modelCalibrationEventEvidence(flight.events),
          normalizedLogKey: `fnv1a32:${hashHex(contentKeyOf(log.samples))}`,
        });
      }
    } catch (err) {
      if (seq.current === mine) {
        setState(null);
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (seq.current === mine) setBusy(false);
    }
  };

  const handleApply = () => {
    if (shown === null || eligibility?.status !== 'conditional' || eligibility.evidence === null) return;
    try {
      consoleActions.setDragCalibration(buildDragCalibration(shown.fit, shown.provenance, new Date().toISOString(), shown.flightModel, eligibility.evidence, shown.modelKey, shown.normalizedLogKey, shown.engineIdentity), 'Apply drag calibration');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRefit = () => {
    if (original === null || eventReview?.evidence === null || eventReview === null || eventReview.key === null) return;
    setError(null);
    setRefit(null);
    try {
      const fit = refitDragScaleWithinEvents(original.fit, eventReview.evidence);
      setRefit({ fit, key: original.key, eventKey: eventReview.key });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-3">
      <Subhead>Effective vertical-coast drag fit</Subhead>
      <Note>{FIT_ASSUMPTIONS}</Note>
      <Disclosure summary="Fit method and limits" summaryClassName="text-[12px] font-medium" summaryStyle={{ color: C.muted }}>
        <div className="space-y-2 pt-2">
          <Note>{FIT_METHOD}</Note>
          <Note>
            This effective vertical-coast fit does not match launch-to-apogee behavior or validate physical Cd. Mass, geometry and sensor errors remain confounded.
            Common assumed mass cancels only for fixed input trajectories; modeled mass still changes the trajectory.
            Approximately vertical air-relative motion requires negligible wind and lateral aerodynamic effects. Applicability outside the fitted speed, Mach and attitude range is unestablished.
            The scale stays within {DRAG_SCALE_MIN}–{DRAG_SCALE_MAX}.
          </Note>
        </div>
      </Disclosure>
      <div className="flex flex-wrap items-center gap-2">
        <Button primary disabled={blocked !== null || busy} onClick={() => void handleFit()} title={blocked ?? undefined}>
          {busy ? 'Fitting…' : 'Fit drag to this log'}
        </Button>
        {blocked !== null && <Note>{blocked}</Note>}
      </div>

      {stale && (
        <Note tone="warn" role="status">▲ The log, design, motor or site changed since the last fit — result is stale, fit again.</Note>
      )}
      {error !== null && <Notice tone="bad" role="alert">{error}</Notice>}

      {shown !== null && (
        <div role="status" aria-live="polite" className="space-y-2.5" data-drag-fit={shown.fit.scale.toFixed(3)} data-coast-selection={shown.fit.selection?.policy ?? 'heuristic-v1'}>
          <Note>{shown.fit.selection === undefined ? 'Original heuristic preview — no event-based point exclusion.' : 'Explicit refit within declared event bounds — original local fits retained; this is a different selection.'}</Note>
          {refit !== null && currentRefit === null && <Notice tone="warn" role="status">Event evidence changed — the previous refit is stale. The original heuristic preview is shown; refit explicitly before applying an event-qualified result.</Notice>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Well className="space-y-1">
              <Subhead>Logged coast</Subhead>
              <KvRow label="Data window" value={`${secondsOf(shown.fit.logWindow.windowStartS)} – ${secondsOf(shown.fit.logWindow.windowEndS)}`} />
              <KvRow label="Velocity peak → highest recorded altitude" value={`${secondsOf(shown.fit.logWindow.burnoutS)} → ${secondsOf(shown.fit.logWindow.apogeeS)}`} tone="muted" />
              {shown.fit.logWindow.burnoutS === log?.samples[0]?.timeS && <Note>Velocity peak is at the imported log boundary; motor burnout is not established.</Note>}
              {shown.fit.logWindow.apogeeS === log?.samples[log.samples.length - 1]?.timeS && <Note>Highest recorded altitude is at the imported log boundary; an apex is not established.</Note>}
              <KvRow label="Method" value={shown.fit.logWindow.method === 'velocity-column' ? 'velocity column' : 'altitude derivative'} tone="muted" />
              <KvRow label="Smoothing half-width" value={`±${secondsOf(shown.fit.logWindow.halfWidthS)}`} tone="muted" />
              <KvRow label="Raw filter support" value={`${secondsOf(shown.fit.logWindow.supportStartS)} – ${secondsOf(shown.fit.logWindow.supportEndS)}`} tone="muted" />
              <KvRow label="Selected speed range" value={`${fmt(shown.fit.logWindow.minSpeedMs, 2)} – ${fmt(shown.fit.logWindow.maxSpeedMs, 2)} m/s`} tone="muted" />
              <KvRow label="Points used" value={String(shown.fit.logWindow.used)} />
              <KvRow label="Points excluded" value={`${shown.fit.logWindow.excluded.lowSpeed} under ${MIN_VELOCITY_MS} m/s`} tone="muted" />
              {shown.fit.selection !== undefined && <>
                <KvRow label="Log original candidates / event excluded / retained" value={`${shown.fit.logWindow.candidates} / ${shown.fit.logWindow.excluded.event} / ${shown.fit.logWindow.used}`} tone="muted" />
                <KvRow label="Log original selected / raw support" value={`${secondsOf(shown.fit.selection.originalLogWindow.windowStartS)}–${secondsOf(shown.fit.selection.originalLogWindow.windowEndS)} / ${secondsOf(shown.fit.selection.originalLogWindow.supportStartS)}–${secondsOf(shown.fit.selection.originalLogWindow.supportEndS)}`} tone="muted" />
                <KvRow label="Log regression leverage retained" value={`${(100 * shown.fit.selection.logExclusions.retainedLeverageFraction).toFixed(2)}%`} tone="muted" />
              </>}
              <KvRow label="Kept non-positive" value={String(shown.fit.logWindow.nonPositiveKept)} tone="muted" />
              <KvRow label="Fitted effective Cd" value={fmt(shown.fit.fittedCd, 4)} />
              <KvRow label="In-sample equivalent-force RMSE" value={`${fmt(shown.fit.rmseN, 3)} N`} tone="muted" />
            </Well>
            <Well className="space-y-1">
              <Subhead>The model’s own coast, same design and site</Subhead>
              <KvRow label="Model coast window" value={`${secondsOf(shown.fit.modelWindow.windowStartS)} – ${secondsOf(shown.fit.modelWindow.windowEndS)}`} tone="muted" />
              <KvRow label="Model smoothing half-width" value={`±${secondsOf(shown.fit.modelWindow.halfWidthS)}`} tone="muted" />
              <KvRow label="Model raw filter support" value={`${secondsOf(shown.fit.modelWindow.supportStartS)} – ${secondsOf(shown.fit.modelWindow.supportEndS)}`} tone="muted" />
              <KvRow label="Native final burnout bounds" value={shown.modelEvents.burnout === undefined ? 'unverified' : `${secondsOf(shown.modelEvents.burnout.earliestS)} – ${secondsOf(shown.modelEvents.burnout.latestS)}`} tone="muted" />
              <KvRow label="Native first recovery bounds" value={shown.modelEvents.recovery?.kind !== 'first-event' ? 'unverified' : `${secondsOf(shown.modelEvents.recovery.event.earliestS)} – ${secondsOf(shown.modelEvents.recovery.event.latestS)}`} tone="muted" />
              <KvRow label="Model selected speed range" value={`${fmt(shown.fit.modelWindow.minSpeedMs, 2)} – ${fmt(shown.fit.modelWindow.maxSpeedMs, 2)} m/s`} tone="muted" />
              <KvRow label="Model points used" value={String(shown.fit.modelWindow.used)} tone="muted" />
              {shown.fit.selection !== undefined && <>
                <KvRow label="Model original candidates / low-speed / event excluded / retained" value={`${shown.fit.modelWindow.candidates} / ${shown.fit.modelWindow.excluded.lowSpeed} / ${shown.fit.modelWindow.excluded.event} / ${shown.fit.modelWindow.used}`} tone="muted" />
                <KvRow label="Model original selected / raw support" value={`${secondsOf(shown.fit.selection.originalModelWindow.windowStartS)}–${secondsOf(shown.fit.selection.originalModelWindow.windowEndS)} / ${secondsOf(shown.fit.selection.originalModelWindow.supportStartS)}–${secondsOf(shown.fit.selection.originalModelWindow.supportEndS)}`} tone="muted" />
                <KvRow label="Model regression leverage retained" value={`${(100 * shown.fit.selection.modelExclusions.retainedLeverageFraction).toFixed(2)}%`} tone="muted" />
              </>}
              <KvRow label="Model coast Cd" value={fmt(shown.fit.modelCd, 4)} />
              <div className="pt-1" style={{ borderTop: `1px solid ${C.line}` }}>
                <KvRow label="Drag scale" value={fmt(shown.fit.scale, 3)} unit="= fitted ÷ model" tone="accent" />
              </div>
              <KvRow label="Coast mass" value={gramsOf(shown.fit.coastMassKg)} unit={`(${gramsOf(shown.designMassKg)} design + ${gramsOf(shown.motorCasingKg)} casing)`} tone="muted" />
              <KvRow label="Reference diameter" value={`${(shown.refDiameterM * 1000).toFixed(1)} mm`} tone="muted" />
              <KvRow label="Site elevation" value={`${shown.launchElevationM.toFixed(0)} m`} tone="muted" />
              <KvRow label="Highest logged altitude / model apogee" value={`${shown.logApogeeM.toFixed(1)} m / ${shown.modelApogeeM.toFixed(1)} m`} unit="uncalibrated" tone="muted" />
            </Well>
          </div>
          {shown.fit.warning !== null && <Notice tone="warn" role="status">{shown.fit.warning}</Notice>}
          <Note>
            Applying this scale affects powered and coast airframe drag. A lower fitted Cd can raise apogee; this fit does not verify whole-flight accuracy.
          </Note>
          <CalibrationReview values={review} onChange={setReview} />
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={eventReview?.evidence === null || eventReview === null} onClick={handleRefit}>Refit within reviewed events</Button>
            {eventReview?.error !== null && eventReview?.error !== undefined && <Note>{eventReview.error}</Note>}
          </div>
          <Note>Event refit excludes whole original point neighborhoods that precede final burnout or touch recovery; it never clips the raw record, changes smoothing, searches for a better residual or targets apogee. A changed sample set changes its coefficient and residual; motion and mass review is still required to apply.</Note>
          {eligibility !== null && <div data-calibration-eligibility={eligibility.status}><Notice tone="warn" role="status">
            {eligibility.status === 'conditional'
              ? 'Conditionally eligible from declared evidence — not independently verified.'
              : `Analysis-only preview — ${eligibility.status}. ${eligibility.reasons.join('; ')}.`}
          </Notice></div>}
          <div className="flex flex-wrap items-center gap-2">
            <Button primary disabled={alreadyApplied || eligibility?.status !== 'conditional'} onClick={handleApply}>Apply to this project</Button>
            {alreadyApplied && <Note>This fit is already applied.</Note>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── advanced: manual coast points ───────────── */

/** One editable coast-phase row (text-backed for inline editing). */
interface CoastRow {
  velocityMs: string;
  density: string;
  massKg: string;
  refAreaM2: string;
  accelMs2: string;
}

function rowToCoastPoint(row: CoastRow): CoastPoint | null {
  const velocityMs = toNumber(row.velocityMs);
  const density = toNumber(row.density);
  const massKg = toNumber(row.massKg);
  const refAreaM2 = toNumber(row.refAreaM2);
  const accelMs2 = toNumber(row.accelMs2);
  if (velocityMs === null || density === null || massKg === null || refAreaM2 === null || accelMs2 === null) return null;
  return { velocityMs, density, massKg, refAreaM2, accelMs2 };
}

const COLUMNS: Array<{ key: keyof CoastRow; head: string; label: string; step: string; suffix: string }> = [
  { key: 'velocityMs', head: 'v (m/s)', label: 'velocity m s', step: '0.1', suffix: 'm/s' },
  { key: 'density', head: 'ρ (kg/m³)', label: 'density kg m3', step: '0.001', suffix: 'kg/m³' },
  { key: 'massKg', head: 'm (kg)', label: 'mass kg', step: '0.01', suffix: 'kg' },
  { key: 'refAreaM2', head: 'A (m²)', label: 'area m2', step: '0.0001', suffix: 'm²' },
  { key: 'accelMs2', head: 'a (m/s²)', label: 'accel m s2', step: '0.1', suffix: 'm/s²' },
];

/** Hand-entered coast points: analysis only, never applied to the project. */
function ManualPoints(): JSX.Element {
  const [rows, setRows] = useState<CoastRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalibrationResult | null>(null);
  /** A previous fit was invalidated by an input change — never shown as current. */
  const [resultStale, setResultStale] = useState<boolean>(false);
  const siteElevationM = useProjectStore((s) => s.project.vehicle.launchSite?.altitudeM ?? s.project.workspace.site.altitudeASLM);

  const invalidate = () => {
    if (result !== null) setResultStale(true);
    setResult(null);
  };
  const setCell = (index: number, patch: Partial<CoastRow>) => {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    invalidate();
  };
  const addRow = () => {
    // Only the air density is known without the user: ISA at the site. Everything else is theirs to enter.
    setRows(rows.concat([{ velocityMs: '', density: getAtmosphereAt(siteElevationM).density.toFixed(4), massKg: '', refAreaM2: '', accelMs2: '' }]));
    invalidate();
  };
  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
    invalidate();
  };
  const handleCalibrate = () => {
    setResultStale(false);
    const points: CoastPoint[] = [];
    for (const row of rows) {
      const point = rowToCoastPoint(row);
      if (point === null) {
        setError('Every coast point needs finite positive values for v, rho, m, A, and a.');
        setResult(null);
        return;
      }
      points.push(point);
    }
    try {
      setResult(calibrateCd(points));
      setError(null);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Disclosure className="rounded-md" style={{ border: `1px solid ${C.line}` }} summary="Advanced · manual coast points" summaryClassName="px-3 py-2 text-[12px] font-medium" summaryStyle={{ color: C.muted }}>
      <div className="space-y-3 px-3 pt-1 pb-3">
        <Note>
          Enter your own coast-phase points (v, ρ, m, A and the drag deceleration a, positive) for a quick Cd. This is an analysis-only candidate: it is not tied
          to an imported log and cannot be applied to the project.
        </Note>
        {rows.length === 0 && <Note>No points yet — add a row.</Note>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <div className="grid grid-cols-[28px_repeat(5,minmax(96px,1fr))_32px] items-center gap-1.5">
              <span className="text-[9.5px] font-medium uppercase" style={{ color: C.dim }}>#</span>
              {COLUMNS.map((c) => <span key={c.key} className="text-[9.5px] font-medium uppercase" style={{ color: C.dim }}>{c.head}</span>)}
              <span />
              {rows.map((row, index) => (
                <React.Fragment key={index}>
                  <span className="font-geist-mono text-[11px]" style={{ color: C.dim }}>{index + 1}</span>
                  {COLUMNS.map((c) => (
                    <PlainNumberField
                      key={c.key}
                      label={`Row ${index + 1} ${c.label}`}
                      value={row[c.key]}
                      onChange={(v) => setCell(index, { [c.key]: v })}
                      step={c.step}
                      suffix={c.suffix}
                    />
                  ))}
                  <button
                    onClick={() => removeRow(index)}
                    aria-label={`Remove coast point row ${index + 1}`}
                    title="Remove row"
                    className="h-7 w-7 rounded text-[11px] hover:bg-white/5"
                    style={{ border: `1px solid ${C.line}`, color: C.dim }}
                  >
                    ✕
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button small onClick={addRow}>+ Add row</Button>
          <Button small onClick={handleCalibrate}>Calibrate Cd</Button>
          <Note>Points below {MIN_VELOCITY_MS} m/s are rejected by the fitter; at least 3 usable points required.</Note>
        </div>
        {resultStale && <Note tone="warn" role="status">▲ Inputs changed since the last fit — result is stale, recalibrate.</Note>}
        {error !== null && <Notice tone="bad" role="alert">{error}</Notice>}
        {result !== null && (
          <div role="status" aria-live="polite" className="space-y-2">
            <Notice tone="warn">▲ Analysis-only candidate — these points are not tied to a flight log; this fit is not applied and never implies a calibrated Cd.</Notice>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Well><KvRow label="Cd candidate" value={fmt(result.cdCalibrated, 4)} /></Well>
              <Well><KvRow label="Fit RMSE" value={`${fmt(result.rmse, 3)} N`} tone="ok" /></Well>
            </div>
          </div>
        )}
      </div>
    </Disclosure>
  );
}

export function CalibrationCard({ log }: { log: ImportedLog | null }): JSX.Element {
  const applied = useProjectStore((s) => s.project.dragCalibration);
  return (
    <Card
      title="Drag calibration"
      kicker="Fit your airframe’s drag to a flight log of this rocket, then apply it to this project"
      icon={<Variable className="h-4 w-4" />}
      right={applied === undefined ? undefined : <DragCalibrationChip calibration={applied} />}
    >
      <AppliedCalibration />
      <LogFit log={log} />
      <ManualPoints />
    </Card>
  );
}
