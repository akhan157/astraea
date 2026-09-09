/**
 * Astraea Production Flight-Event FSM (NORMATIVE)
 *
 * Pure, testable event-detection state machine used by sixDofSimulator.
 * Each tick presents the current kinematic state; detectEvents() returns the
 * events that FIRE on that tick together with any state transitions.
 *
 * Direction-filtered, monotonic, one-shot events:
 *   RAIL_EXIT       : distance-along-rail crosses L_rail (ascending)
 *   MOTOR_BURNOUT   : t >= t_burnout (one-shot)
 *   APOGEE_DROGUE   : vertical velocity zero-crossing, v_y <= 0, after rail
 *   MAIN_DEPLOY     : altitude <= h_main (descending only, after apogee)
 *   TOUCHDOWN       : altitude <= 0 (after apogee)
 */

export type AstraeaEvent =
  | 'NONE'
  | 'RAIL_EXIT'
  | 'MOTOR_BURNOUT'
  | 'APOGEE_DROGUE'
  | 'MAIN_DEPLOY'
  | 'TOUCHDOWN';

export interface EventState {
  hasLeftRail: boolean;
  hasBurnedOut: boolean;
  isApogeeReached: boolean;
  isMainDeployed: boolean;
  touchedDown: boolean;
}

export interface EventInput {
  t: number;
  altitudeAlongRail: number; // distance along launch rail vector (m)
  railLength: number;
  burnTime: number;
  verticalVelocity: number; // +up (m/s)
  altitude: number; // AGL (m)
  mainDeployAlt: number;
}

export const NEWTON_EVENT_STATE: EventState = {
  hasLeftRail: false,
  hasBurnedOut: false,
  isApogeeReached: false,
  isMainDeployed: false,
  touchedDown: false,
};

export interface EventResult {
  fires: AstraeaEvent[];
  state: EventState;
}

/** One-shot monotonic event transition. */
export function detectEvents(prev: EventState, inp: EventInput): EventResult {
  const s: EventState = {
    hasLeftRail: prev.hasLeftRail,
    hasBurnedOut: prev.hasBurnedOut,
    isApogeeReached: prev.isApogeeReached,
    isMainDeployed: prev.isMainDeployed,
    touchedDown: prev.touchedDown,
  };
  const fires: AstraeaEvent[] = [];

  // RAIL_EXIT: still on rail, along-rail travel reaches rail length (ascending implied)
  if (!s.hasLeftRail && inp.altitudeAlongRail >= inp.railLength) {
    s.hasLeftRail = true;
    fires.push('RAIL_EXIT');
  }

  // MOTOR_BURNOUT: one-shot by time
  if (!s.hasBurnedOut && inp.t >= inp.burnTime) {
    s.hasBurnedOut = true;
    fires.push('MOTOR_BURNOUT');
  }

  // APOGEE_DROGUE: after rail, vertical velocity crosses down through zero
  if (!s.isApogeeReached && s.hasLeftRail && inp.verticalVelocity <= 0 && inp.t > 0.8) {
    s.isApogeeReached = true;
    fires.push('APOGEE_DROGUE');
  }

  // MAIN_DEPLOY: after apogee, descending, altitude reaches main-deploy gate
  if (!s.isApogeeReached && !fires.includes('APOGEE_DROGUE')) {
    // no main deploy before apogee
  } else if (!s.isMainDeployed && s.isApogeeReached && inp.verticalVelocity <= 0 && inp.altitude <= inp.mainDeployAlt) {
    s.isMainDeployed = true;
    fires.push('MAIN_DEPLOY');
  }

  // TOUCHDOWN: after apogee, ground contact
  if (!s.touchedDown && s.isApogeeReached && inp.altitude <= 0 && inp.t > 1.0) {
    s.touchedDown = true;
    fires.push('TOUCHDOWN');
  }

  if (fires.length === 0) fires.push('NONE');

  return { fires, state: s };
}
/**
 * Root-localized event timing (NORMATIVE P0-5).
 * Given two consecutive integration samples bracketing a threshold crossing
 * of a monotone quantity, returns the interpolated crossing time.
 * Linear Hermite interpolation on (t0, val0, t1, val1) -> crossing of `target`.
 * Used to localize RAIL_EXIT, MAIN_DEPLOY, TOUCHDOWN, and apogee zero-cross
 * to <= 1e-5 s without requiring a finer integration timestep.
 */
export function localizeCrossing(
  t0: number,
  val0: number,
  t1: number,
  val1: number,
  target: number
): number {
  if (Math.abs(val1 - val0) < 1e-15) return t0;
  const frac = (target - val0) / (val1 - val0);
  return t0 + frac * (t1 - t0);
}

/**
 * Direction-filtered bracketing: checks that the crossing is in the
 * expected direction (ascending or descending) before localizing.
 * Returns the localized time, or -1 if the direction is wrong.
 */
export function localizeCrossingFiltered(
  t0: number,
  val0: number,
  t1: number,
  val1: number,
  target: number,
  direction: 'ascending' | 'descending'
): number {
  if (direction === 'ascending' && val1 <= val0) return -1;
  if (direction === 'descending' && val1 >= val0) return -1;
  // Bracket containment check
  const lo = Math.min(val0, val1);
  const hi = Math.max(val0, val1);
  if (target < lo || target > hi) return -1;
  return localizeCrossing(t0, val0, t1, val1, target);
}
