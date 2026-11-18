/**
 * Stability at liftoff: the subsonic geometry CP against the CG of the vehicle
 * with the selected motor loaded at its mount.
 *
 * The motor is placed exactly as the flight engine places it
 * (crates/astraea-engine/src/models.rs, `prepareVehicle`): its aft end sits at
 * the aft end of the tube flagged as the motor mount, or at the tail when no
 * tube is flagged, and its mass acts at half its length forward of that
 * station (crates/astraea-core/src/six_dof.rs, combined CG). Nothing here
 * invents a value: when an input is missing the margin is `unknown` with the
 * reason, and the airframe-only (geometry) margin is still reported beside it.
 */
import type { RocketVehicle, StabilityAnalysis } from '../../core/types';
import type { MotorSpec } from '../../propulsion/motorDatabase';
import type { VehicleMassRollup } from '../../core/mass';
import type { Gate, Result, StabilityBreakdown } from './contract';
import { MARGIN_MAX, MARGIN_MIN } from './adapter';

export interface LiftoffStability {
  /** Margin with the loaded motor at its mount: the headline value. */
  margin: Result;
  /** CG with the loaded motor, metres from the nose tip. */
  loadedCg: Result;
  /** Airframe-only geometry margin (no motor), shown as a labelled secondary value. */
  geometry: Result;
  /** Designation of the motor the margin was computed with, when there is one. */
  motorDesignation?: string;
}

const unknown = (unit: string, reason: string): Result => ({ value: Number.NaN, unit, confidence: 'unknown', reason });

/** Aft station of the motor (m from nose), or a reason it cannot be placed. */
export function motorAftStation(
  vehicle: RocketVehicle,
  stab: Pick<StabilityBreakdown, 'parts' | 'length'>,
  geometry?: Pick<VehicleMassRollup, 'components' | 'totalLength'> | null,
): { station: number } | { reason: string } {
  const mounts = vehicle.components.filter((c) => c.type === 'bodytube' && c.isMotorMount === true);
  if (mounts.length > 1) {
    return { reason: `${mounts.length} tubes are marked as the motor mount (${mounts.map((m) => m.name).join(', ')}); mark only one in Airframe.` };
  }
  if (mounts.length === 0) {
    const length = Number.isFinite(stab.length) && stab.length > 0 ? stab.length : geometry?.totalLength;
    return length !== undefined && Number.isFinite(length) && length > 0
      ? { station: length }
      : { reason: 'The vehicle length is not available, so the motor cannot be placed.' };
  }
  const mount = mounts[0];
  const end = stab.parts.find((p) => p.id === mount.id)?.axialEnd
    ?? geometry?.components.find((p) => p.id === mount.id)?.axialEnd;
  return end !== undefined && Number.isFinite(end)
    ? { station: end }
    : { reason: `The position of the motor mount (${mount.name}) is not available from this aero model, so the motor cannot be placed.` };
}

/**
 * Liftoff and geometry margins for one design. `stab` is the native stability
 * breakdown of the airframe (which excludes the motor); `motor` is the motor
 * the run would fly.
 */
export function liftoffStability(
  stab: StabilityBreakdown,
  vehicle: RocketVehicle,
  motor: MotorSpec | null,
  geometry?: Pick<VehicleMassRollup, 'components' | 'totalLength'> | null,
): LiftoffStability {
  const base = { geometry: stab.margin, ...(motor ? { motorDesignation: motor.designation } : {}) };
  const fail = (reason: string): LiftoffStability => ({ ...base, margin: unknown('cal', reason), loadedCg: unknown('m', reason) });
  if (motor === null) return fail('No motor is selected, so the CG with the motor loaded cannot be computed. Choose a motor in Motor.');
  const cp = stab.cp.value;
  if (!Number.isFinite(cp)) return fail(`The centre of pressure is unknown${stab.cp.reason ? `: ${stab.cp.reason}` : '.'}`);
  const dry = stab.totalMass.value;
  const dryCg = stab.cg.value;
  if (!(dry > 0) || !Number.isFinite(dryCg)) return fail('The airframe mass or CG is not available.');
  if (!(stab.refDiameter > 0)) return fail('The reference diameter is not available.');
  if (!(motor.totalMass > 0) || !(motor.length > 0)) return fail(`The motor record ${motor.designation} has no usable mass or length.`);
  const aft = motorAftStation(vehicle, stab, geometry);
  if ('reason' in aft) return fail(aft.reason);
  const motorCg = aft.station - motor.length / 2;
  const total = dry + motor.totalMass;
  const cg = (dry * dryCg + motor.totalMass * motorCg) / total;
  const margin = (cp - cg) / stab.refDiameter;
  const where = vehicle.components.some((c) => c.type === 'bodytube' && c.isMotorMount === true) ? 'at its mount' : 'at the tail';
  const weighed = vehicle.components.some((c) => c.massOverride !== undefined) ? ' including weighed parts' : '';
  return {
    ...base,
    loadedCg: {
      value: cg,
      unit: 'm',
      confidence: 'modeled',
      reason: `Airframe CG${weighed} combined with the loaded ${motor.designation} (${(motor.totalMass * 1000).toFixed(0)} g) ${where}, placed as the flight engine places it.`,
    },
    margin: {
      value: margin,
      unit: 'cal',
      confidence: 'modeled',
      reason: `Subsonic Barrowman CP against the CG with the loaded ${motor.designation} ${where}${weighed}. This is the margin at ignition; it changes as propellant burns and is not a powered-flight or competition assessment.`,
    },
  };
}

/** Advice that points the same way as the result. */
export function stabilityAdvice(margin: number): string | undefined {
  if (!Number.isFinite(margin)) return undefined;
  if (margin < MARGIN_MIN) return 'Add nose weight or move mass forward, or use larger fins or fins further aft.';
  if (margin > MARGIN_MAX) return 'Remove nose weight or move mass aft, or use smaller fins.';
  return undefined;
}

/** Format a margin for prose: 3 significant figures, more when it sits on a band edge. */
export function marginText(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const nearEdge = [MARGIN_MIN, MARGIN_MAX].some((edge) => Math.abs(value - edge) < 0.01 && value.toFixed(2) === edge.toFixed(2));
  return `${value.toFixed(nearEdge ? 3 : 2)} cal`;
}

/**
 * The Verify stability check: pass inside the band, fail below it (the rocket
 * may not fly straight), caution above it (safe, but more stability than
 * needed: it turns into the wind and loses some altitude), unknown when an
 * input is missing. It never depends on a flight run, so it is never "run
 * invalid" and never stale.
 */
export function stabilityGate(s: LiftoffStability): Gate {
  const v = s.margin.value;
  const status = !Number.isFinite(v) ? 'unknown' : v < MARGIN_MIN ? 'fail' : v > MARGIN_MAX ? 'caution' : 'pass';
  const geometry = Number.isFinite(s.geometry.value)
    ? ` Airframe only, without the motor: ${marginText(s.geometry.value)}.`
    : '';
  const motor = s.motorDesignation ?? 'the motor';
  const reason = status === 'unknown'
    ? `Not checked: ${s.margin.reason ?? 'the margin could not be computed.'}${geometry}`
    : v < MARGIN_MIN
      ? `${marginText(v)} with ${motor} loaded is below ${MARGIN_MIN} cal: the rocket may not fly straight.${geometry}`
      : v > MARGIN_MAX
        ? `${marginText(v)} with ${motor} loaded is above ${MARGIN_MAX} cal: more stability than needed. Safe to fly, but the rocket may turn into the wind and lose some altitude.${geometry}`
        : `${marginText(v)} with ${motor} loaded is inside ${MARGIN_MIN}–${MARGIN_MAX} cal.${geometry}`;
  const advice = stabilityAdvice(v);
  return {
    id: 'static_margin',
    label: 'Stability at liftoff',
    stage: 'aero',
    status,
    value: s.margin,
    threshold: `≥ ${MARGIN_MIN} cal (${MARGIN_MIN}–${MARGIN_MAX} ideal)`,
    reason,
    ...(advice === undefined ? {} : { advice }),
    ...(status === 'unknown' && s.motorDesignation === undefined ? { fixStage: 'motor' as const } : {}),
  };
}

/**
 * Copilot engine view whose stability is the same liftoff stability Verify
 * judges: margin and CG include the loaded motor, so Copilot's stability
 * checks and its fin-span fix work on the same number Verify shows. When the
 * liftoff margin cannot be computed, the margin is non-finite with the reason,
 * and Copilot reports the check as not evaluated.
 */
export function withLiftoffStability<E extends { stability(vehicle: RocketVehicle): Promise<StabilityAnalysis> }>(
  engine: E,
  motor: MotorSpec | null,
  breakdownOf: (analysis: StabilityAnalysis, vehicle: RocketVehicle) => StabilityBreakdown,
): E {
  return {
    ...engine,
    stability: async (vehicle: RocketVehicle): Promise<StabilityAnalysis> => {
      const analysis = await engine.stability(vehicle);
      const lift = liftoffStability(breakdownOf(analysis, vehicle), vehicle, motor);
      const margin = lift.margin.value;
      return {
        ...analysis,
        cg: Number.isFinite(lift.loadedCg.value) ? lift.loadedCg.value : analysis.cg,
        staticMarginCalibers: margin,
        isStable: Number.isFinite(margin) && margin >= MARGIN_MIN,
        isOverStable: Number.isFinite(margin) && margin > MARGIN_MAX,
        ...(Number.isFinite(margin) ? {} : { cpUnavailable: lift.margin.reason ?? 'The liftoff margin could not be computed.' }),
      };
    },
  };
}
