import { useEffect, useState } from 'react';
import { aeroCurvesOf } from '../../tauri/bridge';
import { aeroConfidence } from '../data/adapter';
import { useWS } from '../store';
import { usePreviewDesign, useStabilityOf } from '../hooks';
import { C } from '../kit/theme';
import { FieldRow, NumberField, SelectField } from '../kit/Fields';
import { Checkbox } from '../kit/Controls';
import { SURFACE_FINISH_NAMES } from '../../core/types';
import { CANDIDATE_REFUSAL } from '../../application/candidate';
import { isCandidateFlightModel, resolveFlightModel } from '../../application/flightModel';
import { AERO_MODEL_VERSION, aeroModelDefect, type AeroModelSelection } from '../../application/aeroModel';
import { builtUpDragRefusalText } from '../data/builtUpDrag';
import { backPressureNozzleActive, effectiveFlightDragSource, nozzleInFlightDomain, NOZZLE_FLIGHT_EXIT_MAX_M } from '../../application/caseResolver';
import { useProjectStore } from '../../state/project';
import { AeroModelProvenanceButton } from '../evidence/AeroModelProvenance';

interface CoefficientRow { mach: number; off: number; on: number; cp: number }

/** The current hybrid: built-up method plus the legacy drag override. */
const BETA_SELECTION: AeroModelSelection = Object.freeze({
  modelId: 'aero-buildup',
  modelVersion: AERO_MODEL_VERSION,
  terms: Object.freeze({ transonic: 'legacy' as const }),
});

export function AeroControls() {
  const design = usePreviewDesign();
  const vehicle = design.vehicle;
  const aeroModel = design.aeroModel;
  const defect = aeroModel === undefined ? null : aeroModelDefect(aeroModel);
  const commitStructural = useProjectStore((s) => s.commitStructural);
  // K3: a project whose drag calibration is ACTIVE (its scale rides every run) and which made no drag
  // choice flies the legacy tables the scale was fitted on (the design's vehicle already says so); the
  // line below explains why. A retained inactive artifact is history and changes nothing here.
  const holdsCalibration = design.dragCalibration !== undefined;
  const storedDragChoice = useProjectStore((s) => s.project.vehicle.flightDragSource);
  const candidateSelected = useWS((s) => isCandidateFlightModel(resolveFlightModel(s.design.flightModel)));
  const stability = useStabilityOf(vehicle, aeroModel);
  const cpSupported = stability.breakdown !== null && Number.isFinite(stability.breakdown.cp.value);
  const [preview, setPreview] = useState<{ vehicle: typeof vehicle; rows: CoefficientRow[]; reason: string; breakdownUnavailable: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewStale = preview !== null && preview.vehicle !== vehicle;
  useEffect(() => {
    let live = true;
    setError(null);
    if (candidateSelected) {
      setPreview(null);
      setError(CANDIDATE_REFUSAL.legacyAero);
      return () => { live = false; };
    }
    if (defect !== null) {
      setPreview(null);
      setError(defect);
      return () => { live = false; };
    }
    // Sliders update the staged design on every step; coalesce a burst so the
    // engine is not asked for a curve per pixel while the table stays live.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const [off, on] = await Promise.all([
            aeroCurvesOf(vehicle, false, aeroModel),
            aeroCurvesOf(vehicle, true, aeroModel),
          ]);
          const rows: CoefficientRow[] = off.dragCurves.map((p, i) => ({ mach: p.mach, off: p.totalCd, on: on.dragCurves[i]?.totalCd, cp: p.cp }));
          if (rows.some((row) => ![row.mach, row.off, row.on, row.cp].every(Number.isFinite))) throw new Error('The engine returned incomplete coefficients.');
          if (live) setPreview({
            vehicle,
            rows: rows.filter((p) => [0.5, 0.9, 1.2, 2, 3].some((m) => Math.abs(p.mach - m) < 1e-8)),
            reason: aeroConfidence(undefined, aeroModel).reason,
            breakdownUnavailable: off.breakdownUnavailable === true || on.breakdownUnavailable === true,
          });
        } catch (err) {
          if (live) setError(err instanceof Error ? err.message : String(err));
        }
      })();
    }, 120);
    return () => { live = false; clearTimeout(timer); };
  }, [vehicle, candidateSelected, aeroModel, defect]);
  const setBetaModel = (on: boolean): void => {
    commitStructural(on ? 'Enable built-up aero model (hybrid beta)' : 'Use legacy aero model', (project) => {
      if (!on) {
        // One undo entry: turning the model off also clears the flight-drag
        // opt-in, so a document can never carry a flag with no model behind it.
        const { aeroModel: _removed, ...rest } = project;
        const vehicle = { ...rest.vehicle };
        // An explicit 'legacy' choice is not an opt-in and survives.
        if (vehicle.flightDragSource === 'calibrated') delete vehicle.flightDragSource;
        return { ...rest, vehicle };
      }
      return { ...project, aeroModel: BETA_SELECTION };
    });
  };
  const setVehicle = (
    label: string,
    patch: {
      surfaceFinish?: string;
      forceTurbulentFlow?: boolean;
      nozzleExitDiameter?: number;
      nozzleBackPressureThrust?: boolean;
      flightDragSource?: 'calibrated' | 'legacy';
    },
  ): void => {
    commitStructural(label, (project) => ({ ...project, vehicle: { ...project.vehicle, ...patch } }));
  };
  // The flight-drag opt-in is a pair with the built-up model: show it when the
  // model is selected, or when a loaded document already carries the flag (so
  // it can always be seen and cleared). With neither, the Aero stage shows
  // nothing new for this input.
  const builtUpFlightDrag = effectiveFlightDragSource(vehicle) !== undefined;
  // K3: built-up drag is the default, so the choice is always shown (it is how
  // a team picks the legacy tables). Only the old explicit opt-in still needs
  // the beta aero-model selection.
  const showFlightDrag = true;
  const flightDragRefusal = vehicle.flightDragSource === 'calibrated' ? builtUpDragRefusalText(aeroModel) : null;
  // The built-up default carries a declared nozzle exit by itself (spec Amendment 4); only then can the
  // back-pressure box be in the automatic state.
  const nozzleAuto = vehicle.flightDragSource === undefined && nozzleInFlightDomain(vehicle);
  return <div className="p-4">
    <section className="mb-4" aria-label="Vehicle aero inputs">
      <div className="mb-1 text-[10.5px] tracking-[0.12em] uppercase" style={{ color: C.dim }}>Vehicle aero inputs</div>
      <FieldRow label="Surface finish" hint="Surface roughness for friction drag. Method default is a smooth surface with zero roughness.">
        <SelectField
          value={vehicle.surfaceFinish ?? ''}
          width={250}
          ariaLabel="Surface finish"
          onChange={(value) => setVehicle(
            value === '' ? 'Clear vehicle surface finish' : 'Set vehicle surface finish',
            { surfaceFinish: value === '' ? undefined : value },
          )}
          options={[
            { value: '', label: 'Method default (smooth, zero roughness)' },
            ...SURFACE_FINISH_NAMES.map((name) => ({ value: name, label: name })),
          ]}
        />
      </FieldRow>
      <FieldRow label="Force turbulent flow" hint="Force a turbulent boundary layer for friction drag. Absent uses the method's laminar default.">
        <Checkbox
          ariaLabel="Force turbulent flow"
          checked={vehicle.forceTurbulentFlow === true}
          onChange={(checked) => setVehicle(
            checked ? 'Force turbulent flow' : 'Clear forced turbulent flow',
            { forceTurbulentFlow: checked ? true : undefined },
          )}
        />
      </FieldRow>
      <FieldRow label="Nozzle exit diameter" hint="Sustainer nozzle exit diameter in metres. Absent uses the method default of no nozzle exit. Must not exceed the aft body diameter. Assumes a sea-level thrust curve.">
        {vehicle.nozzleExitDiameter === undefined
          ? <button
              aria-label="Add nozzle exit diameter"
              onClick={() => setVehicle('Set nozzle exit diameter', { nozzleExitDiameter: 0.018 })}
              className="rounded px-2 py-1 text-[11.5px] hover:bg-white/5"
              style={{ border: `1px solid ${C.line}`, color: C.muted }}
            >Add</button>
          : <span className="flex items-center gap-1">
              <NumberField
                value={vehicle.nozzleExitDiameter}
                kind="len"
                min={0.0005}
                max={1}
                onChange={(value) => setVehicle('Set nozzle exit diameter', { nozzleExitDiameter: value })}
              />
              <button
                aria-label="Clear nozzle exit diameter"
                onClick={() => setVehicle('Clear nozzle exit diameter', { nozzleExitDiameter: undefined, nozzleBackPressureThrust: undefined })}
                className="text-[11px]"
                style={{ color: C.dim }}
                title="Use the method default"
              >×</button>
            </span>}
      </FieldRow>
      <FieldRow
        label="Nozzle back-pressure thrust"
        hint={vehicle.nozzleExitDiameter === undefined
          ? 'Set a nozzle exit diameter above to use this.'
          : 'Adds (101,325 Pa − ambient pressure) × nozzle exit area to thrust while the motor burns, using the diameter above. Off leaves flights unchanged.'
            + (nozzleAuto ? ' On by default while a nozzle exit is set and built-up drag flies; untick it to turn it off.' : '')}
      >
        <Checkbox
          ariaLabel="Nozzle back-pressure thrust"
          disabled={vehicle.nozzleExitDiameter === undefined}
          // The state a flight really flies: the automatic default counts as on.
          checked={backPressureNozzleActive(vehicle)}
          onChange={(checked) => setVehicle(
            checked ? 'Use nozzle back-pressure thrust' : (nozzleAuto ? 'Turn off nozzle back-pressure thrust' : 'Clear nozzle back-pressure thrust'),
            // Under the built-up default the field is the automatic state: unticking writes the explicit
            // off (false), ticking again returns to the automatic default (absent). Under an explicit drag
            // choice (or a held calibration) the old rule stays: ticked is true, unticked is absent.
            nozzleAuto
              ? { nozzleBackPressureThrust: checked ? undefined : false }
              : { nozzleBackPressureThrust: checked ? true : undefined },
          )}
        />
      </FieldRow>
      {vehicle.nozzleExitDiameter !== undefined && vehicle.nozzleExitDiameter > NOZZLE_FLIGHT_EXIT_MAX_M && storedDragChoice === undefined && (
        <p className="mt-1 text-[11px]" style={{ color: C.dim }} data-nozzle-out-of-domain="true">
          This nozzle exit is above the {NOZZLE_FLIGHT_EXIT_MAX_M} m flight limit, so it is not sent as back-pressure thrust; it still sets the drag method&apos;s nozzle term.
        </p>
      )}
    </section>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <Checkbox
        checked={aeroModel !== undefined}
        disabled={candidateSelected}
        onChange={setBetaModel}
        className="text-[12px]"
        style={{ color: C.muted }}
      >
        Use built-up aero model (beta)
      </Checkbox>
      {showFlightDrag && (
        <Checkbox
          checked={builtUpFlightDrag}
          ariaLabel="Use built-up drag in flights"
          onChange={(checked) => setVehicle(
            checked ? 'Use built-up flight drag' : 'Use legacy flight drag',
            // Checked is the default (no field); unchecked is the explicit legacy choice. While a drag
            // calibration is held, no field means legacy, so choosing built-up is the explicit opt-in.
            { flightDragSource: checked ? (holdsCalibration ? 'calibrated' : undefined) : 'legacy' },
          )}
          className="text-[12px]"
          style={{ color: C.muted }}
        >
          Use built-up drag in flights (beta)
        </Checkbox>
      )}
      {holdsCalibration && storedDragChoice === undefined && (
        <span className="basis-full text-[11px]" style={{ color: C.dim }} data-drag-calibration-legacy="true">
          Flying legacy drag: this project&apos;s drag calibration is active, and it was fitted on the legacy tables. Tick the box to use built-up drag instead (it needs the built-up aero model), or remove the calibration.
        </span>
      )}
      {showFlightDrag && (
        <span className="basis-full text-[11px]" style={{ color: C.dim }}>
          Flight drag then comes from the built-up method at every Mach number, without the legacy override over Mach 0.80-1.20; lift and stability in flight stay legacy. A shape the method cannot model flies on legacy drag, and the result says so. Not a validated model.
        </span>
      )}
      {flightDragRefusal !== null && (
        <p role="alert" className="basis-full text-[11.5px]" style={{ color: C.warn }} data-built-up-drag-refusal="true">
          {flightDragRefusal}
        </p>
      )}
      <span className="basis-full text-[11px]" style={{ color: C.dim }}>
        Hybrid: the built-up method with Astraea&apos;s legacy drag override over Mach 0.80-1.20; the component breakdown is unavailable inside that band.
      </span>
      <span className="basis-full text-[11px]" style={{ color: C.dim }}>
        Unset inputs use the method defaults (smooth surface, no forced turbulence, no rail hardware); fin cross-section &quot;airfoil&quot; maps to Subsonic NACA unless an explicit airfoil section is chosen.
      </span>
      {aeroModel !== undefined && (
        <p className="flex items-center gap-2 text-[11.5px]" style={{ color: C.muted }}>
          <span>
            Model: {aeroModel.modelId} {aeroModel.modelVersion} (hybrid)
            {preview?.breakdownUnavailable === true ? ' · component breakdown unavailable inside the band' : ''}
          </span>
          <AeroModelProvenanceButton />
        </p>
      )}
      {defect !== null && (
        <div className="basis-full" role="alert">
          <p className="text-[11.5px]" style={{ color: C.bad }}>{defect}</p>
          <div className="mt-1 flex gap-2">
            <button className="rounded px-2 py-1 text-[11px]" style={{ border: `1px solid ${C.line}` }} onClick={() => setBetaModel(true)}>
              Use the current hybrid model
            </button>
            <button className="rounded px-2 py-1 text-[11px]" style={{ border: `1px solid ${C.line}` }} onClick={() => setBetaModel(false)}>
              Use the legacy aero model
            </button>
          </div>
        </div>
      )}
    </div>
    <div className="grid gap-4 md:grid-cols-[minmax(240px,1fr)_2fr]">
      <p className="text-[11.5px] leading-relaxed" style={{ color: C.muted }}>
        {aeroModel === undefined
          ? 'Aerodynamics are derived from the vehicle geometry by one slender-body model with modeled transonic drag curves. Editing a part recomputes this preview.'
          : `Hybrid aerodynamics: the built-up aero model (${aeroModel.modelId} ${aeroModel.modelVersion}) with Astraea's legacy drag override over Mach 0.80-1.20. Component breakdown unavailable inside the band.`}
      </p>
      <div className="overflow-auto">
        {error ? <p role="alert" style={{ color: C.bad }}>Aero preview unavailable: {error}</p> : preview ? <div aria-busy={previewStale} data-aero-preview={previewStale ? 'updating' : 'current'}>
          <p className="mb-2 text-[11.5px]" role={previewStale ? 'status' : undefined} style={{ color: previewStale ? C.changed : C.muted }}>
            {previewStale ? 'Updating coefficients for the current geometry…' : preview.reason}
          </p>
          {!cpSupported && <p className="mb-2 text-[11.5px]" style={{ color: C.unknown }}>CP unavailable: {stability.breakdown?.cp.reason ?? stability.error ?? 'Geometry CP support has not been established.'}</p>}
          <table aria-label="Aerodynamic coefficient preview" className="w-full text-left text-[12px]" style={{ opacity: previewStale ? 0.5 : 1 }}>
            <caption className="mb-2 text-left text-[11px]" style={{ color: C.dim }}>{previewStale ? 'Previous geometry; updating.' : 'Pad coefficients on a sea-level standard day; in-flight Cd also varies with altitude.'}</caption>
            <thead><tr>{['Mach', 'Cd off', 'Cd on', 'CP mm'].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead>
            <tbody>{preview.rows.map((row) => <tr key={row.mach} className="font-geist-mono"><td className="p-2">{row.mach.toFixed(2)}</td><td className="p-2">{row.off.toFixed(3)}</td><td className="p-2">{row.on.toFixed(3)}</td><td className="p-2">{cpSupported ? (row.cp * 1000).toFixed(0) : 'N/A'}</td></tr>)}</tbody>
          </table>
        </div> : <p role="status" style={{ color: C.dim }}>Loading native coefficients…</p>}
      </div>
    </div>
  </div>;
}
