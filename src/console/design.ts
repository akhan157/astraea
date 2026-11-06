/**
 * Console design view: the prototype's `Design` shape derived from the unified
 * `useProjectStore` (committed project) plus the console's design extras
 * (mission, fin shear-modulus override). Nothing is duplicated: every field
 * reads from the project store and every write goes through its actions.
 *
 * The design's launch options mirror `vehicle.launchSite` for site elevation:
 * the run layer derives the launch site from the vehicle and refuses a
 * conflicting per-call value, so the vehicle is the single home of the launch
 * site.
 */
import { useMemo } from 'react';
import { CERTIFIED_MOTORS, type MotorSpec } from '../propulsion/motorDatabase';
import type { RocketVehicle } from '../core/types';
import { resolveMotorRecord, useProjectStore, type Mission } from '../state/project';
import type { MotorRecord } from '../formats/projectJson';
import type { DragCalibration } from '../application/dragCalibration';
import type { FlightModelSelection } from '../application/flightModel';
import type { AeroModelSelection } from '../application/aeroModel';
import {
  activeCalibration, calibrationFitInputKey as fitInputKeyOf,
  resolveCalibrationApplicability, type CalibrationApplicability,
} from '../application/calibrationApplicability';
import type { LaunchConfig } from './data/adapter';

/** Everything a run depends on. Undo history and "committed" snapshots hold this. */
export interface Design {
  vehicle: RocketVehicle;
  motorId: string;
  /**
   * Resolved motor catalog at this design: certified library overlaid with the
   * project's own records. Content-keyed freshness reads the motor in use from
   * here, so a same-id replacement is a visible change.
   */
  motors?: Record<string, MotorSpec>;
  options: LaunchConfig & { launchAltitudeASL: number };
  shearPa?: number;
  /**
   * Canonical identity of this design with NO drag calibration applied; the
   * context a fit records and a retained fit must still match to be active.
   * Null when the case cannot be keyed.
   */
  calibrationFitInputKey: string | null;
  /** Current state of the retained artifact: active, inactive with a reason, or none. */
  calibrationApplicability: CalibrationApplicability;
  /** Active calibration only; `options.dragCdScale` is its scale. Absent when inactive. */
  dragCalibration?: DragCalibration;
  /** Explicit project flight-model selection; absent means the legacy model. */
  flightModel?: FlightModelSelection;
  /** Aero-model selection from the envelope; absent means the legacy aero path. */
  aeroModel?: AeroModelSelection;
  mission: Mission;
}

/**
 * The catalog a design sees: the certified library, then every record the
 * project carries, then the registry — all resolved through
 * `resolveMotorRecord` (project record first, then certified), so the design
 * always carries the content of the motor in use while the browse list still
 * shows the full certified library.
 */
function catalogFor(
  vehicle: RocketVehicle,
  motorRecords: ReadonlyArray<MotorRecord>,
  motors: Record<string, MotorRecord>,
  archivedMotorIds: ReadonlySet<string> = new Set(),
): Record<string, MotorSpec> {
  const out: Record<string, MotorSpec> = {};
  const add = (id: string): void => {
    if (archivedMotorIds.has(id)) return;
    const rec = resolveMotorRecord(id, motors);
    if (rec !== null) out[rec.id] = rec.motor;
  };
  for (const key of Object.keys(CERTIFIED_MOTORS)) out[key] = CERTIFIED_MOTORS[key];
  for (const rec of motorRecords) add(rec.id);
  for (const b of vehicle.components) {
    const assigned = 'assignedMotorId' in b ? b.assignedMotorId : undefined;
    if (typeof assigned === 'string' && assigned.length > 0) add(assigned);
  }
  for (const id of Object.keys(motors)) add(id);
  return out;
}

interface ProjectShape {
  vehicle: RocketVehicle;
  motorRecords: MotorRecord[];
  cases?: Array<{ motorRecordId: string; inputs?: unknown }>;
  flightModel?: FlightModelSelection;
  aeroModel?: AeroModelSelection;
  workspace: {
    motorId: string;
    launch: {
      railLengthM: number;
      railElevationDeg: number;
      railAzimuthDeg: number;
      windSpeedMps: number;
      windAzimuthDeg: number;
      finCantDeg: number;
      mainDeployAltitudeM: number;
    };
  };
  dragCalibration?: DragCalibration;
}

/**
 * Build the design view from a project envelope plus the console extras.
 * `vehicle` overrides the committed one, for the staged airframe preview.
 */
export function designOf(
  project: ProjectShape,
  mission: Mission,
  shearPa?: number,
  vehicle?: RocketVehicle,
  motors: Record<string, MotorRecord> = {},
): Design {
  // The run layer derives launch altitude from the vehicle alone
  // (bridge `deriveRunOptions` / `flightRunOptions`), with no site = sea level.
  // A workspace.site value is not an engine input and must not become one here.
  const altitude = project.vehicle.launchSite?.altitudeM ?? 0;
  const l = project.workspace.launch;
  const activeVehicle = vehicle ?? project.vehicle;
  const catalog = catalogFor(activeVehicle, project.motorRecords, motors, new Set(project.cases?.filter((entry) => entry.inputs !== undefined).map((entry) => entry.motorRecordId)));
  // The fit's model flight reads exactly these uncalibrated inputs. A retained
  // artifact whose recorded identity no longer matches is history: it never
  // contributes a scale, an option or a run-identity field.
  const calibrationFitInputKey = fitInputKeyOf({
    vehicle: activeVehicle,
    motorId: project.workspace.motorId,
    options: {
      railLengthM: l.railLengthM,
      railElevationDeg: l.railElevationDeg,
      railAzimuthDeg: l.railAzimuthDeg,
      windSpeedMps: l.windSpeedMps,
      windAzimuthDeg: l.windAzimuthDeg,
      finCantDeg: l.finCantDeg,
      mainDeployAltitudeM: l.mainDeployAltitudeM,
    },
  }, catalog);
  const calibrationApplicability = resolveCalibrationApplicability({
    calibration: project.dragCalibration,
    flightModel: project.flightModel,
    currentFitInputKey: calibrationFitInputKey,
  });
  const calibration = activeCalibration(calibrationApplicability);
  return {
    vehicle: activeVehicle,
    motorId: project.workspace.motorId,
    motors: catalog,
    options: {
      railLength: l.railLengthM,
      railElevationDeg: l.railElevationDeg,
      railAzimuthDeg: l.railAzimuthDeg,
      windSpeedSurface: l.windSpeedMps,
      windAzimuthDeg: l.windAzimuthDeg,
      finCantAngleDeg: l.finCantDeg,
      mainDeployAltitudeAGL: l.mainDeployAltitudeM,
      launchAltitudeASL: altitude,
      ...(calibration === undefined ? {} : { dragCdScale: calibration.scale }),
    },
    shearPa,
    calibrationFitInputKey,
    calibrationApplicability,
    ...(calibration === undefined ? {} : { dragCalibration: calibration }),
    flightModel: project.flightModel,
    ...(project.aeroModel === undefined ? {} : { aeroModel: project.aeroModel }),
    mission,
  };
}

export function useDesign(): Design {
  const project = useProjectStore((s) => s.project);
  const mission = useProjectStore((s) => s.mission);
  const shearPa = useProjectStore((s) => s.shearPa);
  const records = useProjectStore((s) => s.motors);
  return useMemo(() => designOf(project, mission, shearPa, undefined, records), [project, mission, shearPa, records]);
}

/** Motor catalog for the current project: the certified library overlaid with the project's own records. */
export function useMotors(): Record<string, MotorSpec> {
  const records = useProjectStore((s) => s.motors);
  const projectRecords = useProjectStore((s) => s.project.motorRecords);
  const vehicle = useProjectStore((s) => s.project.vehicle);
  const cases = useProjectStore((s) => s.project.cases);
  return useMemo(() => catalogFor(vehicle, projectRecords, records, new Set(cases.filter((entry) => entry.inputs !== undefined).map((entry) => entry.motorRecordId))), [vehicle, records, projectRecords, cases]);
}

export function useMotor(): MotorSpec | null {
  const design = useDesign();
  const motors = useMotors();
  return motors[design.motorId] ?? null;
}
