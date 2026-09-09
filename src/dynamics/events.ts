/**
 * Astraea Production Flight-Event FSM (NORMATIVE)
 *
 * Pure, testable event-detection state machine used by sixDofSimulator.
 * Each tick presents the current kinematic state together with the PREVIOUS
 * tick's kinematic state, so genuine crossings can be bracketed and
 * root-localized to a sub-timestep time (P0-04/05).
 *
 * Direction-filtered, monotonic, one-shot events; each event returns its
 * root-localized time via `localizeCrossingFiltered`:
 *   RAIL_EXIT       : along-rail coordinate crosses L_rail (ascending)
 *   MOTOR_BURNOUT   : t crosses t_burnout (one-shot)
 *   APOGEE_DROGUE   : vertical velocity zero-cross, v<=0, after rail+burnout
 *   MAIN_DEPLOY     : altitude crosses h_main (descending, after apogee)
 *   TOUCHDOWN       : altitude crosses 0 (descending, after apogee)
 *
 * Event state transitions are one-shot and monotonic (no re-fire). Invalid
 * or out-of-sequence inputs are rejected by the direction/sequencing guards.
 */

export type AstraeaEvent = 'NONE' | 'RAIL_EXIT' | 'MOTOR_BURNOUT' | 'APOGEE_DROGUE' | 'MAIN_DEPLOY' | 'TOUCHDOWN';

export interface EventState {
  hasLeftRail: boolean;
  hasBurnedOut: boolean;
  isApogeeReached: boolean;
  isMainDeployed: boolean;
  touchedDown: boolean;
}

export interface EventInput {
  t: number;
  /** current along-rail coordinate (m, signed projection onto rail axis) */
  altitudeAlongRail: number;
  railLength: number;
  burnTime: number;
  /** +up (m/s) */
  verticalVelocity: number;
  /** AGL (m) */
  altitude: number;
  mainDeployAlt: number;
}

export interface EventSamplePair {
  t: number;
  altitudeAlongRail: number;
  verticalVelocity: number;
  altitude: number;
}

export interface LocalizedEvent {
  name: AstraeaEvent;
  time: number;
}

export interface EventResult {
  fires: AstraeaEvent[];
  events: LocalizedEvent[];
  state: EventState;
}

export const NEWTON_EVENT_STATE: EventState = {
  hasLeftRail: false,
  hasBurnedOut: false,
  isApogeeReached: false,
  isMainDeployed: false,
  touchedDown: false,
};

/** One-shot monotonic event transition with root-localized event times. */
export function detectEvents(prev: EventState, prevS: EventSamplePair, inp: EventInput): EventResult {
  const s: EventState = {
    hasLeftRail: prev.hasLeftRail,
    hasBurnedOut: prev.hasBurnedOut,
    isApogeeReached: prev.isApogeeReached,
    isMainDeployed: prev.isMainDeployed,
    touchedDown: prev.touchedDown,
  };
  const fires: AstraeaEvent[] = [];
  const events: LocalizedEvent[] = [];

  const locRail = localizeCrossingFiltered(
    prevS.t, prevS.altitudeAlongRail, inp.t, inp.altitudeAlongRail, inp.railLength, 'ascending'
  );
  // RAIL_EXIT: still on rail, along-rail coordinate crosses L_rail ascending
  if (!s.hasLeftRail && locRail >= 0) {
    s.hasLeftRail = true;
    fires.push('RAIL_EXIT');
    events.push({ name: 'RAIL_EXIT', time: locRail });
  }

  // MOTOR_BURNOUT: one-shot by time, brackets the burn boundary
  if (!s.hasBurnedOut && prevS.t < inp.burnTime && inp.t >= inp.burnTime) {
    s.hasBurnedOut = true;
    fires.push('MOTOR_BURNOUT');
    events.push({ name: 'MOTOR_BURNOUT', time: inp.burnTime });
  }

  // APOGEE_DROGUE: after rail + burnout, vertical velocity crosses 0 descending
  if (!s.isApogeeReached && s.hasLeftRail && s.hasBurnedOut) {
    const locAp = localizeCrossingFiltered(
      prevS.t, prevS.verticalVelocity, inp.t, inp.verticalVelocity, 0, 'descending'
    );
    if (locAp >= 0) {
      s.isApogeeReached = true;
      fires.push('APOGEE_DROGUE');
      events.push({ name: 'APOGEE_DROGUE', time: locAp });
    }
  }

  // MAIN_DEPLOY: after apogee, descending, altitude crosses h_main
  if (!s.isMainDeployed && s.isApogeeReached) {
    const locMain = localizeCrossingFiltered(
      prevS.t, prevS.altitude, inp.t, inp.altitude, inp.mainDeployAlt, 'descending'
    );
    if (locMain >= 0) {
      s.isMainDeployed = true;
      fires.push('MAIN_DEPLOY');
      events.push({ name: 'MAIN_DEPLOY', time: locMain });
    }
  }

  // TOUCHDOWN: after apogee, descending, altitude crosses 0
  if (!s.touchedDown && s.isApogeeReached) {
    const locTd = localizeCrossingFiltered(
      prevS.t, prevS.altitude, inp.t, inp.altitude, 0, 'descending'
    );
    if (locTd >= 0) {
      s.touchedDown = true;
      fires.push('TOUCHDOWN');
      events.push({ name: 'TOUCHDOWN', time: locTd });
    }
  }

  if (fires.length === 0) fires.push('NONE');
  return { fires, state: s, events };
}

/**
 * Root-localized event timing (NORMATIVE P0-5).
 * Given two consecutive integration samples bracketing a threshold crossing
 * of a monotone quantity, returns the interpolated crossing time.
 * Linear Hermite interpolation on (t0, val0, t1, val1) -> crossing of `target`.
 * Used to localize RAIL_EXIT, MAIN_DEPLOY, TOUCHDOWN, and apogee zero-cross
 * to a sub-timestep time without requiring a finer integration timestep.
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
 * Returns the localized time, or -1 if the direction is wrong or the
 * target is not bracketed.
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