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