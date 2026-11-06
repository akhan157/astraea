/**
 * Engine DTO projection shared by every runtime caller.
 *
 * The Rust engine consumes the flat `FrontendVehicle`/`FrontendMotor` shapes.
 * Keeping one projection here means the legacy commands, the explicit
 * candidate request and the archive validation cannot silently disagree about
 * which vehicle/motor fields reach the engine. Every declared vehicle field is
 * forwarded here, and component fields are retained wholesale, so the typed
 * request archive carries exactly what the engine consumes.
 */
import type { RocketVehicle } from '../core/types';
import type { MotorSpec } from '../propulsion/motorDatabase';

export function componentDto(c: RocketVehicle['components'][number]): Record<string, unknown> {
  const { id, name, type, materialId, ...rest } = c as unknown as Record<string, unknown>;
  return { id, name, type, materialId, ...rest };
}

/** Flat vehicle DTO: components plus the optional vehicle-level design inputs. */
export interface VehicleDto {
  components: Record<string, unknown>[];
  surfaceFinish?: string;
  forceTurbulentFlow?: boolean;
  nozzleExitDiameter?: number;
}

export function vehicleDto(vehicle: RocketVehicle): VehicleDto {
  return {
    components: vehicle.components.map(componentDto),
    ...(vehicle.surfaceFinish !== undefined ? { surfaceFinish: vehicle.surfaceFinish } : {}),
    ...(vehicle.forceTurbulentFlow !== undefined
      ? { forceTurbulentFlow: vehicle.forceTurbulentFlow }
      : {}),
    ...(vehicle.nozzleExitDiameter !== undefined
      ? { nozzleExitDiameter: vehicle.nozzleExitDiameter }
      : {}),
  };
}

export function motorDto(motor: MotorSpec): Record<string, unknown> {
  return {
    id: motor.id,
    designation: motor.designation,
    manufacturer: motor.manufacturer,
    impulseClass: motor.impulseClass,
    diameter: motor.diameter,
    length: motor.length,
    burnTime: motor.burnTime,
    totalImpulse: motor.totalImpulse,
    avgThrust: motor.avgThrust,
    propellantMass: motor.propellantMass,
    totalMass: motor.totalMass,
    dryMass: motor.dryMass,
    maxThrust: motor.maxThrust,
    thrustCurve: motor.thrustCurve.map((p) => ({ time: p.time, thrust: p.thrust })),
  };
}
