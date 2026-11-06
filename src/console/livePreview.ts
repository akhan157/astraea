/**
 * Live tuning: what updates while the user edits, before anything is
 * committed.
 *
 * - Instant (every edit): thrust-to-weight from the motor curve and the live
 *   mass rollup. Static margin, CG and CP are already live (`useStability`).
 * - Quick (shortly after edits settle): one engine flight without telemetry
 *   (`previewFlight`) for apogee, max speed and Mach, rail exit, descent and
 *   drift. Each new edit cancels the preview in flight, so stale work never
 *   occupies the engine, and the last finished preview stays on screen
 *   (marked updating) until the new one lands.
 *
 * A preview is not a committed run: it records no history, gates nothing,
 * and the UI labels it as a preview.
 */
import { useEffect, useMemo, useState } from 'react';
import { previewFlight } from '../tauri/bridge';
import type { SixDofSimulationResult } from '../sim/sixDofSimulator';
import { CancelledError, getEngineIdentity } from '../engine';
import { calibrationEngineStatus } from '../application/calibrationApplicability';
import { useProjectStore } from '../state/project';
import { sixDofOptions } from './data/adapter';
import { useStability, usePreviewDesign, usePreviewVehicle } from './hooks';
import { computeEllipticalFinFlutter, computeTrapezoidFinFlutter } from '../aero/finFlutter';
import type { EllipticalFinSetComponent, TrapezoidFinSetComponent } from '../core/types';
import { contentKeyOf, engineIsAvailable, motorOfId, resolveRun } from './store';
import { CANDIDATE_REFUSAL } from '../application/candidate';
import { isCandidateFlightModel, resolveFlightModel } from '../application/flightModel';

/** Quiet time after the last edit before a preview flight starts. */
export const PREVIEW_DELAY_MS = 250;

const G0 = 9.80665;

export interface ThrustToWeight {
  /** Average thrust over liftoff weight. */
  average: number;
  /** Peak thrust over liftoff weight. */
  peak: number;
  /** Vehicle plus loaded motor (kg). */
  liftoffMassKg: number;
}

/** Liftoff thrust-to-weight; null until the mass rollup exists. */
export function thrustToWeight(vehicleMassKg: number | null, motor: { avgThrust: number; maxThrust: number; totalMass: number } | null): ThrustToWeight | null {
  if (vehicleMassKg === null || motor === null || !Number.isFinite(vehicleMassKg)) return null;
  const liftoffMassKg = vehicleMassKg + motor.totalMass;
  if (!(liftoffMassKg > 0)) return null;
  const weight = liftoffMassKg * G0;
  return { average: motor.avgThrust / weight, peak: motor.maxThrust / weight, liftoffMassKg };
}

export function useThrustToWeight(): ThrustToWeight | null {
  const stab = useStability();
  const design = usePreviewDesign();
  const motor = design.motors?.[design.motorId] ?? motorOfId(design.motorId);
  return thrustToWeight(stab?.totalMass.value ?? null, motor);
}

export type FlightPreviewStatus = 'unavailable' | 'invalid' | 'waiting' | 'running' | 'ready' | 'error';

export interface FlightPreview {
  status: FlightPreviewStatus;
  /** Last finished preview (possibly for earlier inputs while `running`). */
  result: SixDofSimulationResult | null;
  /** True when `result` was computed for the current inputs. */
  current: boolean;
  message: string | null;
}

interface PreviewState {
  key: string | null;
  result: SixDofSimulationResult | null;
  resultKey: string | null;
  status: FlightPreviewStatus;
  message: string | null;
}

export function useFlightPreview(delayMs: number = PREVIEW_DELAY_MS): FlightPreview {
  const design = usePreviewDesign();
  const project = useProjectStore((s) => s.project);
  const motors = useProjectStore((s) => s.motors);
  const candidateSelected = useProjectStore((s) => isCandidateFlightModel(resolveFlightModel(s.project.flightModel)));
  const motor = design.motors?.[design.motorId] ?? motorOfId(design.motorId);
  const runnable = useMemo(() => !candidateSelected && resolveRun(project, motors, design) !== null, [candidateSelected, project, motors, design]);
  const options = useMemo(() => sixDofOptions(design.options), [design.options]);
  // The retained calibration artifact is part of the preview identity: its
  // scale may be unchanged while its recorded engine/applicability provenance
  // changes, and that must re-run (or refuse) the preview instead of leaving a
  // cached result advertised as current.
  const key = useMemo(
    () => (runnable && motor ? contentKeyOf({ vehicle: design.vehicle, motor, options, calibration: design.dragCalibration }) : null),
    [runnable, motor, design.vehicle, options, design.dragCalibration],
  );
  const [state, setState] = useState<PreviewState>({ key: null, result: null, resultKey: null, status: 'waiting', message: null });

  useEffect(() => {
    if (candidateSelected) {
      setState({ key: null, result: null, resultKey: null, status: 'unavailable', message: CANDIDATE_REFUSAL.preview });
      return;
    }
    if (!engineIsAvailable()) {
      setState((s) => ({ ...s, key, status: 'unavailable', message: 'The engine cannot run in this browser.' }));
      return;
    }
    if (key === null || motor === null) {
      setState((s) => ({ ...s, key, status: 'invalid', message: 'Repair the inputs flagged above to preview a flight.' }));
      return;
    }
    setState((s) => ({ ...s, key, status: s.resultKey === key ? 'ready' : 'waiting', message: null }));
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState((s) => (s.key === key ? { ...s, status: 'running' } : s));
      const dispatchable = design.dragCalibration === undefined
        ? Promise.resolve({ ok: true, message: null })
        : getEngineIdentity().then((identity) => {
            const status = calibrationEngineStatus(design.dragCalibration!, identity);
            return status === 'same' || status === 'legacy'
              ? { ok: true, message: null }
              : {
                  ok: false,
                  message: status === 'different'
                    ? 'The drag calibration was fitted on a different engine; refit on this engine or remove it before previewing.'
                    : 'The drag calibration’s fit engine cannot be verified (a SHA-256 is unavailable); refit on this engine or remove it before previewing.',
                };
          });
      dispatchable
        .then(({ ok, message }) => {
          if (!ok) {
            if (!controller.signal.aborted) {
              setState((s) => (s.key === key ? { ...s, status: 'error', message } : s));
            }
            return undefined;
          }
          // The identity await can outlive this preview; never dispatch then.
          if (controller.signal.aborted) return undefined;
          return previewFlight(design.vehicle, motor, options, controller.signal);
        })
        .then((result) => {
          if (result === undefined || controller.signal.aborted) return;
          setState((s) => (s.key === key ? { ...s, result, resultKey: key, status: 'ready', message: null } : s));
        })
        .catch((err: unknown) => {
          if (err instanceof CancelledError || controller.signal.aborted) return;
          setState((s) => (s.key === key ? { ...s, status: 'error', message: err instanceof Error ? err.message : String(err) } : s));
        });
    }, delayMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `key` covers the vehicle, motor and options the flight reads.
  }, [key, delayMs, candidateSelected]);

  return {
    status: state.status,
    result: state.result,
    current: state.resultKey !== null && state.resultKey === key,
    message: state.message,
  };
}

/**
 * Sea-level flutter speed of the edited fins. Flutter speed rises with
 * altitude for typical flights (lower pressure outweighs the lower speed of
 * sound), so comparing it with the preview's peak speed is conservative.
 */
export function useLiveFinFlutter(): { finName: string; flutterSpeed: number } | null {
  const vehicle = usePreviewVehicle();
  const shearPa = useProjectStore((s) => s.shearPa);
  return useMemo(() => {
    const fin = vehicle.components.find(
      (c): c is TrapezoidFinSetComponent | EllipticalFinSetComponent => c.type === 'trapezoidfinset' || c.type === 'ellipticalfinset',
    );
    if (!fin) return null;
    try {
      const f = fin.type === 'trapezoidfinset' ? computeTrapezoidFinFlutter(fin, shearPa) : computeEllipticalFinFlutter(fin, shearPa);
      return Number.isFinite(f.flutterVelocity) ? { finName: fin.name, flutterSpeed: f.flutterVelocity } : null;
    } catch {
      return null;
    }
  }, [vehicle, shearPa]);
}
